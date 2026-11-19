"""Deploys the AI service to Modal on a GPU.

Production is one app, nutrition-app-ai, running Gemma 4 31B for everything:
chat, meal plans, tools and ingredient photos. It was picked by the benchmark
in benchmark/ (results/report.md) over the other candidates below.

Same FastAPI code as the Docker image (app/), but on the CUDA build of
llama.cpp. Deploy from ai-service/ in PowerShell:

    modal deploy modal_app.py

Needs a Modal secret named "nutrition-app-ai-key" holding AI_SERVICE_KEY.
To re-run a benchmark candidate: $env:AI_ROLE = "test-qwen27b" before deploying.

Cost guards (Starter plan = $30/month of credits): at most one container per
app, it shuts down after SCALEDOWN_SECONDS without requests, and no region is
pinned (pinning costs 1.15-1.75x).
"""
import os
import subprocess
from pathlib import Path

import modal

MODELS = {
    "ai": {
        "repo": "unsloth/gemma-4-31B-it-GGUF",
        # Q4_K_M (18.3 GB) + projector + 2x8K context ran out of memory on a
        # 24 GB GPU; IQ4_XS is ~2 GB smaller at a small quality cost
        "file": "gemma-4-31B-it-IQ4_XS.gguf",
        "family": "gemma",
        # A list = fallbacks in order, for when Modal has no free GPUs of the
        # first type (L4s were unavailable for 12+ minutes during testing)
        "gpu": ["L4", "A10"],
        "memory": 24576,
    },
    # Benchmark candidates, deployed without the key: stop them right after a run
    "test-qwen9b": {
        "repo": "unsloth/Qwen3.5-9B-GGUF",
        "file": "Qwen3.5-9B-Q4_K_M.gguf",
        "family": "qwen",
        "gpu": "T4",
    },
    "test-gemma26b": {
        "repo": "unsloth/gemma-4-26B-A4B-it-GGUF",
        "file": "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
        "family": "gemma",
        "gpu": ["L4", "A10"],  # 18 GB of weights don't fit a T4's 16 GB
        "memory": 24576,
    },
    "test-qwen27b": {
        "repo": "unsloth/Qwen3.5-27B-GGUF",
        "file": "Qwen3.5-27B-Q4_K_M.gguf",
        "family": "qwen",
        "gpu": ["L4", "A10"],
        "memory": 24576,
    },
    # Ukrainian fine-tune of Gemma 3 12B (INSAIT). Its GGUF release has no
    # vision projector, so borrow the base model's. That only works if the
    # fine-tune left the vision part unchanged, which the benchmark checks.
    "test-mamaylm": {
        "repo": "INSAIT-Institute/MamayLM-Gemma-3-12B-IT-v2.0-GGUF",
        "file": "MamayLM-Gemma-3-12B-IT-v2.0-Q4_K_M.gguf",
        "mmproj_repo": "unsloth/gemma-3-12b-it-GGUF",
        "family": "gemma",
        "gpu": "T4",
    },
}
MMPROJ_FILE = "mmproj-F16.gguf"
SCALEDOWN_SECONDS = 300

# The role is read locally at deploy time and baked into the image env, so the
# container sees the same value when it imports this file.
ROLE = os.environ.get("AI_ROLE", "ai")
if ROLE not in MODELS:
    raise SystemExit(f"AI_ROLE must be one of {list(MODELS)}, got {ROLE!r}")
model = MODELS[ROLE]
here = Path(__file__).parent

image = (
    # Pinned llama.cpp build (2026-10-15), same as the Dockerfile but CUDA
    modal.Image.from_registry("ghcr.io/ggml-org/llama.cpp:server-cuda-b11669", add_python="3.11")
    .entrypoint([])  # the base image's entrypoint is llama-server itself
    .pip_install_from_requirements(str(here / "requirements.txt"))
    # Baked into the image, so a cold start only loads it from disk
    .run_commands(
        f"hf download {model['repo']} {model['file']} --local-dir /models",
        f"hf download {model.get('mmproj_repo', model['repo'])} {MMPROJ_FILE} --local-dir /models",
        "rm -rf /models/.cache",
    )
    .env({
        "AI_ROLE": ROLE,
        "MODEL_FAMILY": model["family"],
        "MODEL_PATH": f"/models/{model['file']}",
        "MMPROJ_PATH": f"/models/{MMPROJ_FILE}",
        "LLAMA_SERVER_BIN": "/app/llama-server",
        "LD_LIBRARY_PATH": "/app",
        "LLAMA_GPU_LAYERS": "999",
        # Two users at once, 8K context each
        "LLAMA_PARALLEL": "2",
        "LLAMA_CTX": "16384",
        "LLAMA_THREADS": "2",
        "CUDA_CACHE_PATH": f"/cuda-cache/{ROLE}",
        "CUDA_CACHE_MAXSIZE": str(4 * 1024**3),  # default 256 MB is too small
        "PYTHONUNBUFFERED": "1",
    })
    .add_local_dir(str(here / "app"), "/srv/app", ignore=["__pycache__"])
)

app = modal.App(f"nutrition-app-{ROLE}")

# The official CUDA image ships only portable code (PTX) for older GPUs like
# the T4, so the driver compiles kernels on first use: ~60 s on the first
# prompt. Keeping the driver's compile cache on a volume makes that a one-off.
cuda_cache = modal.Volume.from_name("nutrition-app-cuda-cache", create_if_missing=True)


@app.function(
    image=image,
    gpu=model["gpu"],
    cpu=2.0,
    # MiB; model files pass through RAM on their way to the GPU
    memory=model.get("memory", 12288),
    secrets=[] if ROLE.startswith("test-") else [modal.Secret.from_name("nutrition-app-ai-key")],
    volumes={"/cuda-cache": cuda_cache},
    max_containers=1,
    scaledown_window=SCALEDOWN_SECONDS,
    timeout=600,
)
# Lets /health answer while answers are generating; llama-server queues
# anything beyond its LLAMA_PARALLEL slots
@modal.concurrent(max_inputs=8)
@modal.web_server(port=7860, startup_timeout=120)
def serve():
    subprocess.Popen(
        ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"],
        cwd="/srv",
    )
