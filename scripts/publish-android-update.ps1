param(
  [string]$VersionName = "1.1.0",
  [int]$VersionCode = 2,
  [string]$ApkSourcePath = "android/app/build/outputs/apk/debug/app-debug.apk"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$apkSourceFullPath = Join-Path $projectRoot $ApkSourcePath

if (-not (Test-Path $apkSourceFullPath)) {
  throw "APK nao encontrado em $apkSourceFullPath. Gere o APK antes de publicar."
}

$apkDirectory = Join-Path $projectRoot "public/apk"
New-Item -ItemType Directory -Force -Path $apkDirectory | Out-Null

$apkFileName = "lc-transporte-$VersionName.apk"
$apkTargetFullPath = Join-Path $apkDirectory $apkFileName
Copy-Item -Force $apkSourceFullPath $apkTargetFullPath

$manifest = @{
  versionName = $VersionName
  versionCode = $VersionCode
  apkUrl = "/apk/$apkFileName"
  notes = @(
    "Atualizacao publicada automaticamente pelo fluxo interno."
  )
  publishedAt = [DateTime]::UtcNow.ToString("o")
}

$manifestPath = Join-Path $apkDirectory "latest.json"
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $manifestPath

Write-Host "APK publicado em $apkTargetFullPath"
Write-Host "Manifesto atualizado em $manifestPath"
