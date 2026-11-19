"""Runs llama-server as a child process and talks to it over localhost.

llama-server is used instead of llama-cpp-python because it follows upstream
llama.cpp directly — new model architectures (like Qwen3.5) land there first.
"""
import asyncio
import os
import subprocess

import httpx

LLAMA_PORT = 8081
LLAMA_URL = f"http://127.0.0.1:{LLAMA_PORT}"

# Both supported models can think before answering. On a 2-vCPU Space that
# means minutes of hidden tokens, so every request runs in non-thinking mode
# with the sampling settings each model card recommends for it.
SAMPLING = {
    "qwen": {"temperature": 0.7, "top_p": 0.8, "top_k": 20, "min_p": 0.0, "presence_penalty": 1.5},
    "gemma": {"temperature": 1.0, "top_p": 0.95, "top_k": 64},
}
NON_THINKING = {
    "chat_template_kwargs": {"enable_thinking": False},
    **SAMPLING[os.getenv("MODEL_FAMILY", "qwen")],
}


class LlamaServer:
    def __init__(self) -> None:
        self.process: subprocess.Popen | None = None
        self.ready = False
        self.error: str | None = None
        self.client = httpx.AsyncClient(base_url=LLAMA_URL, timeout=None)

    def start(self) -> None:
        threads = os.getenv("LLAMA_THREADS") or str(os.cpu_count() or 2)
        cmd = [
            os.getenv("LLAMA_SERVER_BIN", "llama-server"),
            "--model", os.environ["MODEL_PATH"],
            "--mmproj", os.environ["MMPROJ_PATH"],
            "--host", "127.0.0.1",
            "--port", str(LLAMA_PORT),
            # 8K is plenty for chat + one photo, and keeps RAM low
            "--ctx-size", os.getenv("LLAMA_CTX", "8192"),
            "--threads", threads,
            # Requests served at once. Keep 1 on CPU: 2 vCPUs can't serve
            # parallel requests any faster, and each slot costs memory. On a
            # GPU, batching a few users together costs almost nothing.
            # The context size is shared between the slots.
            "--parallel", os.getenv("LLAMA_PARALLEL", "1"),
            "--jinja",
        ]
        # Set on GPU hosts (Modal): how many layers to put on the GPU, 999 = all
        if gpu_layers := os.getenv("LLAMA_GPU_LAYERS"):
            cmd += ["--n-gpu-layers", gpu_layers]
        self.process = subprocess.Popen(cmd)

    async def wait_until_ready(self) -> None:
        # llama-server answers /health with 503 while the model is loading
        while True:
            if self.process and self.process.poll() is not None:
                # Surfaced by /health — otherwise it would say "loading" forever
                self.error = f"llama-server exited with code {self.process.returncode}"
                return
            try:
                r = await self.client.get("/health")
                if r.status_code == 200:
                    self.ready = True
                    return
            except httpx.TransportError:
                pass
            await asyncio.sleep(1)

    async def stop(self) -> None:
        await self.client.aclose()
        if self.process and self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=10)

    def chat_payload(self, messages: list, **extra) -> dict:
        return {"messages": messages, **NON_THINKING, **extra}

    async def chat(self, messages: list, **extra) -> dict:
        r = await self.client.post("/v1/chat/completions", json=self.chat_payload(messages, **extra))
        r.raise_for_status()
        return r.json()

    def stream_chat(self, messages: list, **extra):
        return self.client.stream(
            "POST", "/v1/chat/completions",
            json=self.chat_payload(messages, stream=True, **extra),
        )


llama = LlamaServer()
