"""真实 YAML 解析器复验（**可选、人工运行，不进 CI**）。

为什么需要它：GitHub 用的是真正的 YAML 解析器，而 `check-ci-consistency.js` 用的是
零依赖的缩进读取器 —— 后者读得过去的行，前者未必读得过去。
2026-09-28 就因此踩过一次：`collect.yml` 的步骤名里写了「冒号 + 空格」，
真实解析器**拒绝整个文件**（workflow 什么都不跑），而本地所有门禁全绿 ——
这正是「本地全绿、推上去什么都不发生」那一类错误。

CI 里跑不了它：需要 python3 + PyYAML，而 CI 的定位是「`npm ci` 之前就能跑」。
所以它是**人工复验**工具，改动 workflow / 复合 action 之后建议跑一次：

    python scripts/tools/yaml-recheck.py

它做两件事：
  ① 用真解析器把 5 个 YAML 文件全部读一遍（解析失败即退出码 1）；
  ② 顺带复验一批**结构**断言（job 顺序、job 级 if、必需检查名、门禁步骤序列、
     采集机器人的身份接线、`--expect-checks` 的单行形态……）——
     这些在 Node 侧各有对应断言，这里是用另一套解析栈做交叉验证。

退出码：0 = 全过；1 = 有解析失败或结构断言不成立。
"""
import json
import sys

import yaml

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FILES = [
    ".github/workflows/collect.yml",
    ".github/workflows/deploy.yml",
    ".github/workflows/probe-sources.yml",
    ".github/workflows/verify.yml",
    ".github/actions/gate/action.yml",
]

docs = {}
problems = []
for path in FILES:
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        problems.append(f"{path}: 解析失败 -> {exc}")
        continue
    if doc is None:
        problems.append(f"{path}: 解析成空文档")
        continue
    docs[path] = doc
    print(f"OK  {path}")

if problems:
    print("\n".join(problems))
    sys.exit(1)

# YAML 1.1 把裸 on: 读成布尔 True，规范化回来
def norm_on(doc):
    if True in doc and "on" not in doc:
        doc["on"] = doc.pop(True)
    return doc


for path, doc in docs.items():
    norm_on(doc)

collect = docs[".github/workflows/collect.yml"]
verify = docs[".github/workflows/verify.yml"]
deploy = docs[".github/workflows/deploy.yml"]
action = docs[".github/actions/gate/action.yml"]

checks = []


def ck(name, ok, detail=""):
    checks.append((name, bool(ok), detail))


# ---- collect.yml：机器人身份 ----
cjob = collect["jobs"]["collect"]
steps = cjob["steps"]
names = [s.get("name") for s in steps]
ck("collect 里有 Mint GitHub App token 步骤", "Mint GitHub App token (robot identity)" in names,
   json.dumps(names, ensure_ascii=False))
co = next(s for s in steps if s.get("uses", "").startswith("actions/checkout"))
ck("checkout 用 persist-credentials: false",
   co.get("with", {}).get("persist-credentials") is False, json.dumps(co.get("with")))
ck("checkout 不再显式传 GITHUB_TOKEN", "token" not in co.get("with", {}), json.dumps(co.get("with")))
mint = next((i for i, s in enumerate(steps) if s.get("name", "").startswith("Mint GitHub App token")), -1)
commit = next((i for i, s in enumerate(steps) if s.get("name") == "Commit and push if changed"), -1)
ck("换取 token 排在提交步骤之前", 0 <= mint < commit, f"mint={mint} commit={commit}")
mint_env = steps[mint].get("env", {})
ck("mint 步骤读到了两个 Secret",
   mint_env.get("COLLECT_APP_ID") == "${{ secrets.COLLECT_APP_ID }}"
   and mint_env.get("COLLECT_APP_PRIVATE_KEY") == "${{ secrets.COLLECT_APP_PRIVATE_KEY }}",
   json.dumps(mint_env, ensure_ascii=False))
crev = steps[commit]
ck("提交步骤拿到 steps.app.outputs.token",
   crev.get("env", {}).get("APP_TOKEN") == "${{ steps.app.outputs.token }}",
   json.dumps(crev.get("env"), ensure_ascii=False))
crun = crev["run"]
ck("提交命令带 [skip ci]", "git commit" in crun and "[skip ci]" in crun)
ck("推送前把远端换成 App token", "git remote set-url origin" in crun and "x-access-token:" in crun)
ck("三份文件仍然同批入库",
   "scripts/data/source-health.json" in crun and "scripts/data/zh-pending.json" in crun)

# ---- verify.yml：必需检查名与 job 级 if ----
gate = verify["jobs"]["gate"]
ck("verify 的 job 仍叫 gate", list(verify["jobs"].keys()) == ["gate"])
ck("gate 没有 job 级 if", "if" not in gate)
runs = [s.get("run", "") for s in gate["steps"] if "run" in s]
ck("--expect-checks 是单行 run 且为 32",
   any("--expect-checks=32" in r and "\n" not in r for r in runs), json.dumps(runs, ensure_ascii=False)[:300])

# ---- deploy.yml：发布链 ----
ck("deploy 的 job 顺序是 prepublish/build/deploy",
   list(deploy["jobs"].keys()) == ["prepublish", "build", "deploy"], json.dumps(list(deploy["jobs"].keys())))
ck("prepublish 没有 job 级 if", "if" not in deploy["jobs"]["prepublish"])
ck("build 依赖 prepublish", deploy["jobs"]["build"].get("needs") == "prepublish")

# ---- gate action：步骤序列含新的自测 ----
asteps = [s.get("name") for s in action["runs"]["steps"]]
ck("门禁步骤含 App-token self-test", "App-token self-test" in asteps, json.dumps(asteps, ensure_ascii=False))
ck("App-token self-test 排在 build 之前", asteps.index("App-token self-test") < asteps.index("Assemble site (same path as deploy.yml)"))
ck("门禁里没有第三方 uses", all("uses" not in s for s in action["runs"]["steps"]),
   json.dumps([s.get("uses") for s in action["runs"]["steps"] if "uses" in s], ensure_ascii=False))
ck("每个 run 步骤都给了 shell", all("shell" in s for s in action["runs"]["steps"] if "run" in s))

failed = [c for c in checks if not c[1]]
for name, ok, detail in checks:
    print(f"{'✓' if ok else '✗'} {name}" + (f"  — {detail}" if (detail and not ok) else ""))
print(f"\n真实解析器复验：{len(checks)} 条结构断言，失败 {len(failed)} 条")
sys.exit(1 if failed else 0)
