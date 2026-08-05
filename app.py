import os
import sys
import uvicorn

# Add the backend folder to the python path so imports inside "backend/app/" work correctly
backend_dir = os.path.join(os.path.dirname(__file__), "backend")
sys.path.insert(0, backend_dir)

# Import the FastAPI application from backend/app/main.py
from app.main import app

if __name__ == "__main__":
    # Hugging Face Spaces dynamically assigns a PORT (defaults to 7860)
    port = int(os.environ.get("PORT", 7860))
    print(f"[Hugging Face Space] Starting FastAPI server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
