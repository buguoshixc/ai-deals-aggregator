#!/usr/bin/env bash
# 在 Linux（WSL）上复现 CI 的失败步骤：coverage-targets-selftest.js
set -u
cd /tmp/cirepro || exit 3
ln -sfn '/mnt/d/OneDrive/Desktop/Code/AI Page/.worktrees/coverage-expansion-v1/node_modules' node_modules
if [ -f node_modules/axios/package.json ]; then echo "axios linked OK"; else echo "axios MISSING"; exit 4; fi
echo "--- HEAD ---"
git log --oneline -1
echo "--- node ---"
node -v
echo "--- running coverage-targets-selftest.js on LINUX ---"
node scripts/tools/coverage-targets-selftest.js > /tmp/selftest.out 2> /tmp/selftest.err
echo "EXIT=$?"
echo "--- stdout tail ---"
tail -20 /tmp/selftest.out
echo "--- stderr (first 40 lines) ---"
head -40 /tmp/selftest.err
