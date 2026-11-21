import asyncio
import base64
import io
import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image, ImageOps
from typing import Literal

from pydantic import BaseModel

from .llm import llama

logger = logging.getLogger("uvicorn.error")

AI_SERVICE_KEY = os.getenv("AI_SERVICE_KEY")
# Smaller images = fewer vision tokens = much faster on CPU
MAX_IMAGE_SIDE = int(os.getenv("MAX_IMAGE_SIDE", "768"))

# Small models drift into Russian words and invented dishes when told to
# "reply in the user's language" from an English prompt, so Ukrainian users
# get a prompt written in Ukrainian, with one example answer to copy the style.
SYSTEM_PROMPTS = {
    "en": [
        {"role": "system", "content": (
            "You are NutriMind, a friendly nutrition and meal-planning assistant.\n"
            "Rules:\n"
            "- Reply in English.\n"
            "- Suggest only real, well-known dishes. Never invent dishes.\n"
            "- Keep answers short: at most 5 bullet points or about 120 words.\n"
            "- Never invent exact calorie or macro numbers. Give rough ranges only "
            "for common foods, or say you don't have the data."
        )},
    ],
    "uk": [
        {"role": "system", "content": (
            "Ти — NutriMind, доброзичливий помічник із харчування та планування раціону.\n"
            "Правила:\n"
            "- Відповідай лише українською літературною мовою, без русизмів і суржику. "
            "Пиши «кисломолочний сир», а не «творог»; «страва», а не «блюдо»; "
            "«цибуля», а не «лук»; «картопля», а не «картошка».\n"
            "- Пропонуй лише справжні, відомі страви. Не вигадуй страв і слів. "
            "Якщо не знаєш назви, опиши страву простими словами.\n"
            "- Відповідай коротко: до 5 пунктів або приблизно 120 слів.\n"
            "- Не вигадуй точних калорій і БЖВ. Для звичайних продуктів можна "
            "назвати приблизний діапазон, інакше скажи, що даних немає."
        )},
        {"role": "user", "content": "Що з'їсти на вечерю, щоб було легко?"},
        {"role": "assistant", "content": (
            "Кілька легких варіантів:\n"
            "- **Запечена риба з овочами** — хек або минтай з броколі та морквою.\n"
            "- **Омлет зі шпинатом** — 2 яйця, жменя шпинату, трохи сиру.\n"
            "- **Салат із куркою** — варене куряче філе, огірок, помідор, листя салату.\n"
            "- **Кисломолочний сир з ягодами** — якщо хочеться чогось солодкого.\n\n"
            "Усі ці страви готуються за 15–25 хвилин."
        )},
    ],
}

# Added only when the request carries tools. Without it, Gemma tends to ask
# about optional details ("what kind of breakfast?") instead of calling a tool.
TOOL_RULES = {
    "en": "\n- When one of the available tools fits the request, call it right away. "
          "Don't ask about optional details first: leave them out or take them from the user's words."
          "\n- Calories and macros in tool results are calculated from USDA data: quote them as given. "
          "Recipes found by tools are shown to the user as cards, so don't repeat ids or links.",
    "uk": "\n- Якщо запит відповідає одному з доступних інструментів, одразу виклич його. "
          "Не перепитуй про необов'язкові деталі: пропусти їх або візьми зі слів користувача."
          "\n- Калорії та БЖВ у результатах інструментів розраховані за даними USDA: наводь їх як є. "
          "Знайдені рецепти користувач бачить картками, тож не повторюй їхні id чи посилання.",
}

# Added when the backend sends the user's profile and fridge. Allergies are
# repeated as a hard rule because a suggestion with an allergen is the one
# mistake that can actually hurt someone.
CONTEXT_HEADER = {
    "en": "\n\nWhat you know about this user (use it to personalise answers; never suggest "
          "anything with their allergens; prefer what is in their fridge, especially items "
          "that expire soon):\n",
    "uk": "\n\nЩо ти знаєш про цього користувача (використовуй це, щоб персоналізувати "
          "відповіді; ніколи не пропонуй продуктів з його алергенами; надавай перевагу тому, "
          "що є в холодильнику, особливо продуктам, у яких скоро спливає термін):\n",
}

CYRILLIC = set("абвгґдеєжзиіїйклмнопрстуфхцчшщьюя")


def detect_language(text: str) -> str:
    # Anyone writing Cyrillic in this app is treated as Ukrainian
    return "uk" if any(ch in CYRILLIC for ch in text.lower()) else "en"


RECOGNIZE_PROMPT = (
    "Look carefully at the whole photo, including small items, food in bowls or on "
    "boards, and items that are partly hidden or out of focus.\n"
    "List every distinct food ingredient or food product you can see.\n"
    "Rules:\n"
    "- Use simple generic singular English names (e.g. 'tomato', not 'cherry tomatoes on a plate').\n"
    "- Tell similar-looking foods apart by colour, size and shape (e.g. lemon vs lime, "
    "potato vs onion). If you can't, use the general name (e.g. 'citrus fruit').\n"
    "- Ignore plates, jars, utensils, furniture and packaging text. Count what is inside "
    "a container only if you can tell what it is.\n"
    "- name_uk: the standard Ukrainian dictionary word for the same ingredient.\n"
    "- confidence: high if clearly visible, medium if partly hidden, low if guessing."
)

# Caps runaway answers; ~120 words of Ukrainian is ~300 tokens
CHAT_MAX_TOKENS = 512

INGREDIENTS_SCHEMA = {
    "type": "object",
    "properties": {
        "ingredients": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "name_uk": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["name", "name_uk", "confidence"],
            },
        }
    },
    "required": ["ingredients"],
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not AI_SERVICE_KEY:
        logger.warning("AI_SERVICE_KEY is not set — endpoints are open (OK for local dev only)")
    llama.start()
    # Don't block startup on model loading: /health must answer "loading"
    # straight away so a wake-up ping can see the Space is coming up.
    loader = asyncio.create_task(llama.wait_until_ready())
    yield
    loader.cancel()
    await llama.stop()


app = FastAPI(title="NutriMind AI service", lifespan=lifespan)


def require_key(x_ai_key: str | None = Header(default=None)) -> None:
    if AI_SERVICE_KEY and x_ai_key != AI_SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Invalid AI service key")


def require_ready() -> None:
    if not llama.ready:
        raise HTTPException(status_code=503, detail="Model is still loading")


@app.get("/")
@app.get("/health")
async def health():
    model = os.path.basename(os.getenv("MODEL_PATH", ""))
    if llama.error:
        return JSONResponse(status_code=500, content={"status": "error", "detail": llama.error, "model": model})
    # 200 while loading, so "loading" is distinguishable from "Space is asleep/down"
    return {"status": "ready" if llama.ready else "loading", "model": model}


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "tool"]
    content: str | None = None
    # An assistant turn that called tools, and the tool results answering it
    # (OpenAI format, which llama-server turns into the model's own template)
    tool_calls: list[dict] | None = None
    tool_call_id: str | None = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    stream: bool = False
    # OpenAI-style tool definitions; the model may answer with tool_calls instead of text
    tools: list[dict] | None = None
    # The user's profile, allergies and fridge as plain text lines
    context: str | None = None


@app.post("/v1/chat", dependencies=[Depends(require_key), Depends(require_ready)])
async def chat(body: ChatRequest):
    last_user = next((m.content for m in reversed(body.messages) if m.role == "user"), "")
    lang = detect_language(last_user)
    prompt = SYSTEM_PROMPTS[lang]
    extra = {"max_tokens": CHAT_MAX_TOKENS}
    system = prompt[0]["content"]
    if body.tools:
        extra["tools"] = body.tools
        system += TOOL_RULES[lang]
    if body.context:
        system += CONTEXT_HEADER[lang] + body.context.strip()
    messages = [{**prompt[0], "content": system}] + prompt[1:] + [
        m.model_dump(exclude_none=True) for m in body.messages
    ]

    if not body.stream:
        result = await llama.chat(messages, **extra)
        message = result["choices"][0]["message"]
        return {
            "reply": message.get("content") or "",
            "tool_calls": message.get("tool_calls") or [],
            # llama-server's own token counts and speeds, used by the benchmark
            "timings": result.get("timings"),
        }

    async def relay():
        # Pass llama-server's SSE stream through unchanged
        async with llama.stream_chat(messages, **extra) as r:
            async for chunk in r.aiter_bytes():
                yield chunk

    return StreamingResponse(relay(), media_type="text/event-stream")


class CompleteRequest(BaseModel):
    messages: list[dict]
    # Constrains the answer to JSON matching this schema
    json_schema: dict | None = None
    max_tokens: int = 1024
    temperature: float = 0.2


# For data tasks (matching ingredients, estimating servings): the caller's own
# prompt, without the assistant persona and its answer-length rules
@app.post("/v1/complete", dependencies=[Depends(require_key), Depends(require_ready)])
async def complete(body: CompleteRequest):
    extra = {"max_tokens": min(body.max_tokens, 4096), "temperature": body.temperature}
    if body.json_schema:
        extra["response_format"] = {"type": "json_schema", "json_schema": {"schema": body.json_schema}}
    result = await llama.chat(body.messages, **extra)
    content = result["choices"][0]["message"].get("content") or ""
    if body.json_schema:
        try:
            return {"data": json.loads(content), "timings": result.get("timings")}
        except json.JSONDecodeError:
            logger.error("Model returned invalid JSON: %s", content[:500])
            raise HTTPException(status_code=502, detail="Model returned invalid JSON")
    return {"content": content, "timings": result.get("timings")}


def to_data_url(raw: bytes) -> str:
    try:
        img = Image.open(io.BytesIO(raw))
    except Exception:
        raise HTTPException(status_code=400, detail="File is not a readable image")
    img = ImageOps.exif_transpose(img).convert("RGB")  # phone photos are often rotated via EXIF
    img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


@app.post("/v1/recognize", dependencies=[Depends(require_key), Depends(require_ready)])
async def recognize(image: UploadFile = File(...)):
    messages = [{
        "role": "user",
        "content": [
            {"type": "image_url", "image_url": {"url": to_data_url(await image.read())}},
            {"type": "text", "text": RECOGNIZE_PROMPT},
        ],
    }]
    result = await llama.chat(
        messages,
        temperature=0.2,  # extraction, not creativity
        response_format={"type": "json_schema", "json_schema": {"schema": INGREDIENTS_SCHEMA}},
    )
    content = result["choices"][0]["message"]["content"]
    try:
        return {**json.loads(content), "timings": result.get("timings")}
    except json.JSONDecodeError:
        logger.error("Model returned invalid JSON: %s", content)
        raise HTTPException(status_code=502, detail="Model returned invalid JSON")
