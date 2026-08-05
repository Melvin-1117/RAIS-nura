FROM python:3.10-slim

# Install system dependencies needed for audio processing (ffmpeg) and building
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set up user with UID 1000 (standard for Hugging Face Spaces)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1

WORKDIR $HOME/app

# Copy dependency definition
COPY --chown=user:user requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir --user -r requirements.txt

# Copy warmup script and run it during build to pre-cache the Whisper model
COPY --chown=user:user warmup.py .
ENV LOCAL_ASR_MODEL=openai/whisper-medium.en
RUN python warmup.py

# Copy application source code
COPY --chown=user:user app ./app

# Expose Hugging Face Space port (7860)
EXPOSE 7860

# Command to run uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
