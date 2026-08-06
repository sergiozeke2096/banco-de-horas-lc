param(
  [string]$SshHost = "sergi-vps-future-apps-2026-03-12",
  [string]$RemotePublicDir = "/home/sergio/apps/lc-banco-horas/public"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $projectRoot "public"
$apkDir = Join-Path $publicDir "apk"

if (-not (Test-Path $apkDir)) {
  throw "Pasta public/apk nao encontrada. Rode a publicacao do APK antes do deploy."
}

ssh $SshHost "mkdir -p '$RemotePublicDir/apk'"
scp (Join-Path $publicDir "index.html") "$SshHost`:$RemotePublicDir/index.html"
scp (Join-Path $publicDir "styles.css") "$SshHost`:$RemotePublicDir/styles.css"
scp (Join-Path $publicDir "app.js") "$SshHost`:$RemotePublicDir/app.js"
scp (Join-Path $apkDir "latest.json") "$SshHost`:$RemotePublicDir/apk/latest.json"

$apkFiles = Get-ChildItem $apkDir -Filter "*.apk"
foreach ($apkFile in $apkFiles) {
  scp $apkFile.FullName "$SshHost`:$RemotePublicDir/apk/$($apkFile.Name)"
}

Write-Host "Atualizacao Android enviada para $SshHost em $RemotePublicDir"
