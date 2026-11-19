"""Quick end-to-end check of a running AI service. Standard library only.

Usage (PowerShell):
    python ai-service/scripts/smoke_test.py http://localhost:7860 path\\to\\food.jpg
Set AI_SERVICE_KEY in the environment if the service has one.
"""
import json
import mimetypes
import os
import sys
import time
import urllib.request
import uuid

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:7860"
IMAGE = sys.argv[2] if len(sys.argv) > 2 else None
HEADERS = {"X-AI-Key": os.environ["AI_SERVICE_KEY"]} if os.getenv("AI_SERVICE_KEY") else {}


def call(path, data=None, content_type="application/json"):
    req = urllib.request.Request(BASE + path, data=data, headers={**HEADERS, "Content-Type": content_type})
    start = time.time()
    with urllib.request.urlopen(req, timeout=600) as r:
        body = json.loads(r.read())
    return body, time.time() - start


def chat(text):
    body, secs = call("/v1/chat", json.dumps({"messages": [{"role": "user", "content": text}]}).encode())
    print(f"\n> {text}\n< {body['reply']}\n  ({secs:.1f} s)")


def recognize(path):
    boundary = uuid.uuid4().hex
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    with open(path, "rb") as f:
        payload = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{os.path.basename(path)}\"\r\n"
            f"Content-Type: {mime}\r\n\r\n"
        ).encode() + f.read() + f"\r\n--{boundary}--\r\n".encode()
    body, secs = call("/v1/recognize", payload, f"multipart/form-data; boundary={boundary}")
    print(f"\nPhoto {path} ({secs:.1f} s):")
    for item in body["ingredients"]:
        print(f"  - {item['name']} / {item['name_uk']} ({item['confidence']})")


print("health:", call("/health")[0])
chat("Suggest a quick high-protein breakfast.")
chat("Порадь швидкий білковий сніданок.")
if IMAGE:
    recognize(IMAGE)
