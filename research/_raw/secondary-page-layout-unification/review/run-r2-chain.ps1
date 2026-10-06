# T6 round-2 复审：串行跑完全部套件（浏览器套件一次只跑一个）。
# 用法（worktree 根）：pwsh -File research/_raw/secondary-page-layout-unification/review/run-r2-chain.ps1
$ErrorActionPreference = 'Continue'
$root = (Resolve-Path "$PSScriptRoot\..\..\..\..").Path
Set-Location $root
$env:DSH_EDGE = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$R = "research/_raw/secondary-page-layout-unification/review"
$runs = "$R/runs"
$summary = @()

function Step([string]$label, [scriptblock]$body) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  & $body
  $code = $LASTEXITCODE
  $sw.Stop()
  $line = "$label`tEXIT=$code`t$([math]::Round($sw.Elapsed.TotalSeconds,1))s"
  Write-Output $line
  $script:summary += $line
}

Step 'make-scratch plain' { node "$R/make-scratch.cjs" plain *> "$runs/r2-make-plain.txt" }
Step 'suite --dir=scratch/plain' { node scripts/tools/verify-site.js --dir=$R/scratch/plain --json="$runs/r2-plain.json" *> "$runs/r2-plain.log" }
Step 'make-scratch false-green-c1' { node "$R/make-scratch.cjs" false-green-c1 *> "$runs/r2-make-false-green.txt" }
Step 'suite --dir=scratch/false-green-c1' { node scripts/tools/verify-site.js --dir=$R/scratch/false-green-c1 --json="$runs/r2-false-green-c1.json" *> "$runs/r2-false-green-c1.log" }
Step 'suite --dir=dist.baseline (M0)' { node scripts/tools/verify-site.js --dir=dist.baseline --json="$runs/r2-m0.json" *> "$runs/r2-m0.log" }
Step 'suite --dir=dist --compare' { node scripts/tools/verify-site.js --dir=dist --compare=research/_raw/ours-baseline/verify.json --json="$runs/r2-green.json" *> "$runs/r2-green.log" }
Step 'check-ci-consistency' { node scripts/tools/check-ci-consistency.js *> "$runs/r2-ci-consistency.log" }

$summary | Set-Content -Path "$runs/r2-summary.txt" -Encoding utf8
Write-Output "==== 汇总 ===="
$summary | ForEach-Object { Write-Output $_ }
