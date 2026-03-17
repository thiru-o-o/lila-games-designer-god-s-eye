Set-Location "d:\player_data"
$ErrorActionPreference = "Continue"

Write-Host "=== Git status ===" -ForegroundColor Cyan
git status

Write-Host "`n=== Pulling latest ===" -ForegroundColor Cyan
git pull origin main --rebase

Write-Host "`n=== Staging files ===" -ForegroundColor Cyan
git add "gods-eye/src/components/Sidebar.tsx"
git add "scripts/upload_to_supabase.py"
git status --short

Write-Host "`n=== Committing ===" -ForegroundColor Cyan
git commit -m "Add file upload UI in sidebar; improve bucket creation in upload script"

Write-Host "`n=== Pushing ===" -ForegroundColor Cyan
git push origin main

Write-Host "`n=== Done ===" -ForegroundColor Green
