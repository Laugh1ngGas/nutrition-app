"""AI service without the model: language detection and how /v1/recognize handles the model's JSON.
Run from ai-service/:  python -m pytest"""
import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main

# TestClient without "with" skips the lifespan, so no llama-server is started
client = TestClient(main.app)


def png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), "red").save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def model(monkeypatch):
    """Pretend the model is loaded and answers with the given text."""
    answer = {"content": ""}

    async def fake_chat(messages, **extra):
        return {"choices": [{"message": {"content": answer["content"]}}], "timings": {"predicted_ms": 1}}

    monkeypatch.setattr(main.llama, "ready", True)
    monkeypatch.setattr(main.llama, "chat", fake_chat)
    monkeypatch.setattr(main, "AI_SERVICE_KEY", None)
    return answer


@pytest.mark.parametrize("text, lang", [
    ("What can I cook with eggs?", "en"),
    ("Що приготувати з яєць?", "uk"),
    ("Привіт! chicken and rice", "uk"),   # any Cyrillic counts as Ukrainian
    ("ЇЖА", "uk"),                         # upper case, Ukrainian-only letters
    ("1200 kcal?", "en"),
    ("", "en"),
])
def test_detect_language(text, lang):
    assert main.detect_language(text) == lang


def test_recognize_returns_the_models_ingredients(model):
    model["content"] = json.dumps({"ingredients": [
        {"name": "tomato", "name_uk": "помідор", "confidence": "high"},
        {"name": "egg", "name_uk": "яйце", "confidence": "medium"},
    ]})
    r = client.post("/v1/recognize", files={"image": ("photo.png", png(), "image/png")})
    assert r.status_code == 200
    assert [i["name"] for i in r.json()["ingredients"]] == ["tomato", "egg"]
    assert r.json()["ingredients"][0]["name_uk"] == "помідор"


def test_recognize_empty_list_is_fine(model):
    model["content"] = '{"ingredients": []}'
    r = client.post("/v1/recognize", files={"image": ("photo.png", png(), "image/png")})
    assert r.status_code == 200 and r.json()["ingredients"] == []


def test_recognize_invalid_json_from_the_model_is_502(model):
    model["content"] = '{"ingredients": [{"name": "tomato"'  # cut off mid-answer
    r = client.post("/v1/recognize", files={"image": ("photo.png", png(), "image/png")})
    assert r.status_code == 502
    assert r.json()["detail"] == "Model returned invalid JSON"


def test_recognize_rejects_a_file_that_is_not_an_image(model):
    r = client.post("/v1/recognize", files={"image": ("notes.txt", b"not an image", "text/plain")})
    assert r.status_code == 400


def test_recognize_while_the_model_loads_is_503(model, monkeypatch):
    monkeypatch.setattr(main.llama, "ready", False)
    r = client.post("/v1/recognize", files={"image": ("photo.png", png(), "image/png")})
    assert r.status_code == 503


def test_key_is_required_when_set(model, monkeypatch):
    monkeypatch.setattr(main, "AI_SERVICE_KEY", "secret")
    files = {"image": ("photo.png", png(), "image/png")}
    assert client.post("/v1/recognize", files=files).status_code == 401
    model["content"] = '{"ingredients": []}'
    assert client.post("/v1/recognize", files=files, headers={"X-AI-Key": "secret"}).status_code == 200
