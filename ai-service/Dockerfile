# ──────────────────────────────────────────────────────────────────────────────
# NutriMind AI service — CPU build for local development (docker-compose)
#
# Production runs on a Modal GPU with Gemma 4 31B: see modal_app.py. This
# image runs the small Gemma 4 E4B on CPU with the same FastAPI code and API.
#
# One container, two processes:
#   llama-server (127.0.0.1:8081)  ← loads the model, never exposed directly
#   FastAPI      (0.0.0.0:7860)    ← our endpoints, API key check, /health
#
# The model is downloaded at BUILD time and baked into the image, so starting
# the container only loads it from disk. Other benchmark models can be built
# with --build-arg MODEL_REPO / MODEL_FILE / MODEL_FAMILY.
# ──────────────────────────────────────────────────────────────────────────────

# Pinned llama.cpp build (2026-10-15) — upstream releases several times a day
FROM ghcr.io/ggml-org/llama.cpp:server-b11669

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Q4_K_M = best quality/size balance for CPU; mmproj = the vision part
ARG MODEL_REPO=unsloth/gemma-4-E4B-it-GGUF
ARG MODEL_FILE=gemma-4-E4B-it-Q4_K_M.gguf
ARG MMPROJ_FILE=mmproj-F16.gguf
RUN hf download "$MODEL_REPO" "$MODEL_FILE" "$MMPROJ_FILE" --local-dir /models \
 && rm -rf /models/.cache

# Picks the sampling settings in app/llm.py (qwen | gemma). Declared after the
# download so switching it doesn't invalidate that cached multi-GB layer.
ARG MODEL_FAMILY=gemma
ENV MODEL_FAMILY=${MODEL_FAMILY} \
    MODEL_PATH=/models/${MODEL_FILE} \
    MMPROJ_PATH=/models/${MMPROJ_FILE} \
    LLAMA_SERVER_BIN=/app/llama-server \
    # llama-server's own .so files live next to it in /app
    LD_LIBRARY_PATH=/app \
    PYTHONUNBUFFERED=1

WORKDIR /srv
COPY app ./app

# Hugging Face Spaces run containers as uid 1000
RUN useradd -m -u 1000 user 2>/dev/null || true
USER 1000

EXPOSE 7860
# The base image's entrypoint is llama-server itself — replace it
ENTRYPOINT []
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
