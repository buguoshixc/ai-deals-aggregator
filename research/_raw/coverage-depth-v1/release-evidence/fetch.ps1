#!/usr/bin/env pwsh
# coverage-depth-v1 Workstream A：官方来源抓取器（curl 版，避开 Invoke-WebRequest 的 TLS 失败）
# 用法：pwsh research/_raw/coverage-depth-v1/release-evidence/fetch.ps1 <tsv文件>
param([string]$Tsv = 'research/_raw/coverage-depth-v1/release-evidence/sources-round1.tsv')
$ErrorActionPreference = 'Continue'
$dir = 'research/_raw/coverage-depth-v1/release-evidence/raw'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$abs = (Resolve-Path -LiteralPath $dir).Path
foreach ($row in (Get-Content $Tsv | Where-Object { $_ -match '^https' })) {
  $parts = $row -split "`t"
  $url = $parts[0].Trim(); $name = $parts[1].Trim()
  $out = Join-Path $abs $name
  if ((Test-Path $out) -and ((Get-Item $out).Length -gt 4000)) { Write-Host "SKIP $name"; continue }
  $code = & curl.exe -sS -L -o $out -w "%{http_code}" --max-time 60 -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' $url 2>&1
  $len = if (Test-Path $out) { (Get-Item $out).Length } else { 0 }
  Write-Host ("{0,-6} {1,-42} {2,9} bytes  {3}" -f $code, $name, $len, $url)
}
