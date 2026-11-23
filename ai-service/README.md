# NutritionApp AI service

Self-hosted open model (Gemma 4 31B, IQ4_XS GGUF) served by llama.cpp and
wrapped in FastAPI. One model handles chat, meal plans, tool calls and
ingredient photos, in Ukrainian and English. No external model APIs are called.

| Where | Model | Hardware | Used for |
|---|---|---|---|
| Production: Modal app `nutrition-app-ai` (`modal_app.py`) | Gemma 4 31B IQ4_XS | L4 or A10 GPU (24 GB) | the live app |
| Local: docker-compose (`Dockerfile`) | Gemma 4 E4B Q4_K_M | 2 CPUs | offline development |

The model was chosen with the benchmark in `benchmark/` (7 models, Ukrainian
and English chat, tool calls, 9 labelled photos). See `benchmark/results/report.md`.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | `{"status": "loading" \| "ready" \| "error"}`, also wakes the service |
| POST | `/v1/chat` | `X-AI-Key` | `{"messages": [...], "context": "...", "stream": false, "tools": [...]}` → `{"reply", "tool_calls", "timings"}` (or SSE with `stream: true`). `context` = the user's profile, allergies and fridge as text lines, added to the system prompt |
| POST | `/v1/recognize` | `X-AI-Key` | multipart `image` → `{"ingredients": [{"name", "name_uk", "confidence"}], "timings"}` |

## Environment variables

| Name | Default | Notes |
|---|---|---|
| `AI_SERVICE_KEY` | unset | Shared secret with the Express backend. Unset = open (local dev only) |
| `LLAMA_THREADS` | CPU count | |
| `LLAMA_CTX` | `8192` | Context size in tokens, shared by all slots |
| `LLAMA_PARALLEL` | `1` | Requests served at once (Modal: 2) |
| `LLAMA_GPU_LAYERS` | unset | Layers on the GPU, `999` = all (Modal only) |
| `MAX_IMAGE_SIDE` | `768` | Photos are downscaled to this before recognition |

## Deploy to Modal (PowerShell, from `ai-service/`)

One-time: create the key the backend will send (save the printed value for Render):

```powershell
$k = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
modal secret create nutrition-app-ai-key AI_SERVICE_KEY=$k
Write-Host "Save this for Render (AI_SERVICE_KEY): $k"
```

Then deploy and check it:

```powershell
modal deploy modal_app.py
python scripts/smoke_test.py https://<workspace>--nutrition-app-ai-serve.us-east.modal.run
```

Cost guards for the Starter plan ($30/month of credits): one container at most,
it stops after 5 idle minutes, and no region is pinned.

## Run locally (PowerShell, from the repo root)

```powershell
docker compose up -d --build ai-service
docker compose logs -f ai-service     # wait for status "ready"
curl http://localhost:7860/health
```
