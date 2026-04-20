# M4 Separation Server

FastAPI service for background sound segregation:
- Demucs v4 source separation (vocals/background)
- YAMNet sound classification on background stem
- Job status polling API

## Setup

```powershell
cd backend/separation
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```powershell
cd backend/separation
.\.venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8010 --reload
```

## API

- `POST /api/separation/jobs` (multipart field: `file`)
- `GET /api/separation/jobs/{job_id}`
- `GET /health`

`GET /api/separation/jobs/{job_id}` returns progress, stage, and when complete:
- `result.vocals_url`
- `result.background_url`
- `result.sounds[]`
- `result.processing`

## Quick API Example (PowerShell)

```powershell
$base = "http://localhost:8010"
$audio = "C:\path\to\sample.wav"

# 1) Create job
$job = Invoke-RestMethod -Uri "$base/api/separation/jobs" -Method Post -Form @{ file = Get-Item -LiteralPath $audio }
$jobId = $job.job_id

# 2) Poll status
do {
	Start-Sleep -Seconds 2
	$status = Invoke-RestMethod -Uri "$base/api/separation/jobs/$jobId" -Method Get
	"$($status.status) $($status.progress)% $($status.stage)"
} while ($status.status -eq "queued" -or $status.status -eq "running")

# 3) Completed payload
$status.result | ConvertTo-Json -Depth 8
```

## One-Command Smoke Test

Use the included script:

```powershell
cd backend/separation
.\smoke_test.ps1 -AudioPath "C:\path\to\sample.wav"
```
