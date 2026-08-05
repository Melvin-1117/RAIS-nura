import os
import torch
from transformers import pipeline

def warmup():
    model_name = os.environ.get("LOCAL_ASR_MODEL", "openai/whisper-medium.en")
    print(f"Pre-downloading and caching local ASR model: {model_name}...")
    
    device = -1 # Always use CPU for build caching
    torch_dtype = torch.float32 # Default float32 for CPU
    
    # This downloads all weights and config files, caching them in ~/.cache/huggingface
    pipeline(
        task="automatic-speech-recognition",
        model=model_name,
        device=device,
        torch_dtype=torch_dtype,
    )
    print("ASR model pre-download complete ✓")

if __name__ == "__main__":
    warmup()
