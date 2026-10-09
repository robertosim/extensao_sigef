# Gera o ZIP de publicacao da Chrome Web Store em dist/
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\pack.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

$dist = Join-Path $root 'dist'
$stage = Join-Path $dist '_stage'
if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

$files = @('manifest.json', 'background.js', 'popup.html', 'popup.js', 'content.js', 'LICENSE')
foreach ($f in $files) {
    $src = Join-Path $root $f
    if (-not (Test-Path -LiteralPath $src)) { throw "Arquivo ausente: $f" }
    Copy-Item -LiteralPath $src -Destination $stage
}
Copy-Item -LiteralPath (Join-Path $root 'icons') -Destination (Join-Path $stage 'icons') -Recurse

$zip = Join-Path $dist "sigef-extractor-v$version.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Remove-Item -LiteralPath $stage -Recurse -Force

Write-Output "OK: $zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$entry = [System.IO.Compression.ZipFile]::OpenRead($zip).Entries | ForEach-Object { $_.FullName }
$entry
