$dirs = @("docker-data\postgres", "docker-data\redis", "docker-data\logs")

foreach ($dir in $dirs) {
    if (-Not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "Already exists: $dir" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done! Next steps:" -ForegroundColor Cyan
Write-Host "  1. copy .env.example .env"
Write-Host "  2. Open .env and fill in DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET"
Write-Host "  3. docker-compose up -d --build"
Write-Host ""
Write-Host "After startup:" -ForegroundColor Cyan
Write-Host "  Frontend  -> http://localhost:5173"
Write-Host "  Backend   -> http://localhost:3001/api/v1"
Write-Host "  Health    -> http://localhost:3001/api/v1/health"
