# Runs the browser and API smoke tests with a fresh disposable LocalDB database.
param([switch]$BackupRestore, [ValidateSet('msedge','chrome','firefox','webkit')][string]$Browser = 'msedge',
    [ValidateRange(360,1920)][int]$Width = 1280)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$database = 'PharmacyERP_Audit_' + [Guid]::NewGuid().ToString('N')
$env:ConnectionStrings__DefaultConnection = "Server=(localdb)\PharmacyERPDevelopment;Database=$database;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5"
$env:Jwt__Key = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:Bootstrap__Enabled = 'true'
$env:Bootstrap__AdminEmail = 'audit-admin@example.test'
$env:Bootstrap__AdminPassword = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(20))
$env:Jobs__Enabled = 'false'
$env:PharmacyAuditBrowser = $Browser
$env:PharmacyAuditWidth = "$Width"
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:Logging__LogLevel__Microsoft = 'Warning'
$api = $null
$frontend = $null

try {
    $apiPath = Join-Path $root 'back-end/PharmacyERP/PharmacyAPI'
    $webPath = Join-Path $root 'front-end/pharmacy-web'
    $api = Start-Process dotnet -ArgumentList 'run --no-restore --no-launch-profile --urls http://127.0.0.1:5277' -WorkingDirectory $apiPath -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'api-output.log')
    $frontend = Start-Process node -ArgumentList 'node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173 --strictPort' -WorkingDirectory $webPath -PassThru -WindowStyle Hidden -RedirectStandardError (Join-Path $PSScriptRoot 'frontend-error.log')
    $ready = $false
    foreach ($attempt in 1..35) {
        if ($api.HasExited -or $frontend.HasExited) { throw 'A local server exited during startup.' }
        try {
            $ready = (Invoke-WebRequest 'http://127.0.0.1:5173/health/ready' -TimeoutSec 2).StatusCode -eq 200
            if ($ready) { break }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if (!$ready) { throw 'The frontend proxy did not reach a ready API.' }
    Push-Location $PSScriptRoot
    try {
        node node_modules/@playwright/test/cli.js test integration.spec.ts --workers=1
        if ($LASTEXITCODE -ne 0) { throw 'Integrated tests failed.' }
    } finally { Pop-Location }
    if ($BackupRestore) {
        & (Join-Path $PSScriptRoot 'Test-BackupRestore.ps1') -Database $database
    }
} finally {
    if ($frontend -and !$frontend.HasExited) { Stop-Process -Id $frontend.Id }
    if ($api -and !$api.HasExited) { taskkill /PID $api.Id /T /F | Out-Null }
}
