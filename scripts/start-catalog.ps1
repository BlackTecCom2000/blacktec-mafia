<#
  Starts the room catalog and exposes it to the internet.

  1. runs the discovery service on http://127.0.0.1:8787
  2. puts a public Cloudflare tunnel in front of it (no account needed)

  The script prints a public address — put it into the field
  "Сервис подбора комнат" on the screen "Найти игру" or rebuild the site with
  VITE_DISCOVERY_URL=<that address>.

  The address changes every time the tunnel is restarted.
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$binary = Join-Path $PSScriptRoot 'cloudflared.exe'

if (-not (Test-Path $binary)) {
  Write-Host 'Downloading cloudflared...'
  Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $binary -UseBasicParsing
}

Write-Host 'Starting the discovery service on http://127.0.0.1:8787 ...'
Start-Process -FilePath 'node' -ArgumentList (Join-Path $root 'server/discovery.mjs') -WorkingDirectory $root -WindowStyle Hidden
Start-Sleep -Seconds 2

Write-Host 'Opening the public tunnel, copy the address from the line below:'
& $binary tunnel --url http://127.0.0.1:8787 --no-autoupdate
