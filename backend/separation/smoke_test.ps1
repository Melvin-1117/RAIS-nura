param(
  [string]$BaseUrl = "http://localhost:8010",
  [string]$AudioPath = "",
  [int]$PollIntervalSeconds = 2,
  [int]$MaxPolls = 180
)

Add-Type -AssemblyName System.Net.Http

function New-MultipartJobRequest {
  param(
    [string]$Url,
    [string]$FilePath
  )

  $handler = New-Object System.Net.Http.HttpClientHandler
  $client = New-Object System.Net.Http.HttpClient($handler)
  try {
    $content = New-Object System.Net.Http.MultipartFormDataContent
    $fileStream = [System.IO.File]::OpenRead($FilePath)
    try {
      $streamContent = New-Object System.Net.Http.StreamContent($fileStream)
      $streamContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("audio/wav")
      $fileName = [System.IO.Path]::GetFileName($FilePath)
      $content.Add($streamContent, "file", $fileName)

      $response = $client.PostAsync($Url, $content).GetAwaiter().GetResult()
      $payload = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      if (-not $response.IsSuccessStatusCode) {
        throw "HTTP $([int]$response.StatusCode): $payload"
      }

      return ($payload | ConvertFrom-Json)
    } finally {
      $fileStream.Dispose()
      $content.Dispose()
    }
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

if ([string]::IsNullOrWhiteSpace($AudioPath)) {
  Write-Error "Provide -AudioPath with a local audio file path."
  exit 1
}

if (-not (Test-Path -LiteralPath $AudioPath)) {
  Write-Error "Audio file not found: $AudioPath"
  exit 1
}

Write-Host "[1/4] Health check: $BaseUrl/health"
try {
  $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get
  Write-Host "Health:" ($health | ConvertTo-Json -Compress)
} catch {
  Write-Error "Health check failed: $($_.Exception.Message)"
  exit 1
}

Write-Host "[2/4] Creating separation job"
try {
  $createResponse = New-MultipartJobRequest -Url "$BaseUrl/api/separation/jobs" -FilePath $AudioPath
} catch {
  Write-Error "Job creation failed: $($_.Exception.Message)"
  exit 1
}

$jobId = $createResponse.job_id
if ([string]::IsNullOrWhiteSpace($jobId)) {
  Write-Error "Server did not return job_id"
  exit 1
}

Write-Host "Job created: $jobId"

Write-Host "[3/4] Polling job status"
$statusUrl = "$BaseUrl/api/separation/jobs/$jobId"
$status = $null
for ($i = 0; $i -lt $MaxPolls; $i++) {
  try {
    $status = Invoke-RestMethod -Uri $statusUrl -Method Get
  } catch {
    Write-Error "Polling failed: $($_.Exception.Message)"
    exit 1
  }

  $line = "status={0} progress={1} stage={2}" -f $status.status, $status.progress, $status.stage
  Write-Host $line

  if ($status.status -eq "completed") {
    break
  }

  if ($status.status -eq "failed") {
    Write-Error "Job failed: $($status.error)"
    exit 1
  }

  Start-Sleep -Seconds $PollIntervalSeconds
}

if ($status.status -ne "completed") {
  Write-Error "Timed out waiting for completion"
  exit 1
}

Write-Host "[4/4] Result summary"
$result = $status.result
if ($null -eq $result) {
  Write-Error "Completed status had no result payload"
  exit 1
}

Write-Host "vocals_url:" $result.vocals_url
Write-Host "background_url:" $result.background_url
Write-Host "events:" @($result.sounds).Count
Write-Host "processing:" ($result.processing | ConvertTo-Json -Compress)

Write-Host "Smoke test passed"
