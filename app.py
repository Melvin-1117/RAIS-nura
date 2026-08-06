import os
import sys
import uvicorn
import gradio as gr

# Hugging Face ZeroGPU initialization
try:
    import spaces

    @spaces.GPU
    def _zerogpu_init():
        """Register Hugging Face ZeroGPU runtime handler."""
        return True

    print("[Hugging Face ZeroGPU] ZeroGPU initialized successfully.")
except Exception:
    print("[Hugging Face ZeroGPU] 'spaces' module not loaded (running locally/CPU).")

# Add the backend folder to the python path so imports inside "backend/app/" work correctly
backend_dir = os.path.join(os.path.dirname(__file__), "backend")
sys.path.insert(0, backend_dir)

# Import the FastAPI application from backend/app/main.py
from app.main import app as fastapi_app

# Create a minimal Gradio UI for the Hugging Face Gradio SDK
with gr.Blocks(title="RAIS Audio Intelligence API") as demo:
    gr.Markdown("# 🚀 RAIS — Real-Time Audio Intelligence System API")
    gr.Markdown("Backend API is active and online.")
    gr.Markdown("• **Health Check**: `/health`\n• **API Documentation**: `/docs`")

# Mount FastAPI app onto Gradio so both web UI and API endpoints work seamlessly
app = gr.mount_gradio_app(fastapi_app, demo, path="/")

if __name__ == "__main__":
    # Hugging Face Spaces dynamically assigns a PORT (defaults to 7860)
    port = int(os.environ.get("PORT", 7860))
    print(f"[Hugging Face Space] Starting server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
