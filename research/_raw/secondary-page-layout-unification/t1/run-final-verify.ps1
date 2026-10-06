# T1 最终验证：按契约顺序逐条跑 verify 命令，记录**真实退出码**与关键读数。
# 用法：pwsh -File research/_raw/secondary-page-layout-unification/t1/run-final-verify.ps1
# 注意：工作目录必须是 worktree 根（命令里写的都是相对路径）。

$ErrorActionPreference = 'Continue'
$summary = Join-Path $PSScriptRoot '12-final-verify-run.txt'
"T1 final verification run (contract order) @ $(Get-Date -Format o)" | Out-File -Encoding utf8 $summary
"workdir = $(Get-Location)" | Add-Content -Encoding utf8 $summary

function Run-Step([string]$name, [string]$display, [scriptblock]$body) {
  $out = & $body 2>&1
  $code = $LASTEXITCODE
  "`n### $name" | Add-Content -Encoding utf8 $summary
  "cmd: $display" | Add-Content -Encoding utf8 $summary
  "EXIT=$code" | Add-Content -Encoding utf8 $summary
  ($out | Select-Object -Last 4) | Add-Content -Encoding utf8 $summary
  Write-Host "-> $name exit=$code"
}

Run-Step 'seo-selftest' 'node scripts/tools/seo-selftest.js' { node scripts/tools/seo-selftest.js }

Run-Step 'build-local' 'node scripts/tools/build-local.js' { node scripts/tools/build-local.js }

Run-Step 'archive-selftest' 'node scripts/tools/archive-selftest.js --dir=dist' { node scripts/tools/archive-selftest.js --dir=dist }

Run-Step 'validate-strict' 'node scripts/validate.js --strict' { node scripts/validate.js --strict }

$js5 = @'
const k=require('./scripts/lib/page-kinds'); const bad=k.assertLayoutDeclarations(); if(bad.length){console.error(bad);process.exit(1)}; console.log('kinds',k.allKinds().length,'layouts ok')
'@
Run-Step 'layout-declarations' 'node -e <assertLayoutDeclarations>' { node -e $js5 }

$js6 = @'
const fs=require('fs');const s=fs.readFileSync('scripts/tools/build-local.js','utf8');const n=(s.match(/\.snote \{ /g)||[]).length;if(n!==0){console.error('残留 .snote 规则',n);process.exit(1)};console.log('build-local .snote 规则已清零')
'@
Run-Step 'snote-cleared' 'node -e <build-local .snote count === 0>' { node -e $js6 }
