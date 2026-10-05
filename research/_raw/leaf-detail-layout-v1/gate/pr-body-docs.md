代码在 #42 已合并并部署；本 PR 只补**交付文档与证据**，不改任何源码 / 数据 / 产物：

- `research/leaf-detail-layout-v1-report.md` —— 根因、改动文件、最终内容宽度、deal/model 桌面测量、390px 溢出、
  Mutation 结果、**Full Gate / CI / Deploy / Online Smoke 实测读数**、数据层零变化的三条独立证据、视觉检查。
- `research/leaf-detail-layout-v1-self-audit.md` —— 独立复查（另写一套探针，不 require 本仓库任何代码）：
  **verdict=pass · P0=0 · P1=0 · REPAIR_NOW=0**（自算判据 32/32）。
- `research/_raw/leaf-detail-layout-v1/**` —— 可复核证据：
  · `gate/run-full-gate.cjs` **现场解析** `action.yml`（49 步）后串行执行，逐步日志 `gate/steps/NN-*.txt`；
  · `gate/before-after-compare.{cjs,json}` 全产物对账：**186/186 HTML 页剥掉样式后正文逐字节相同、
    117/117 非 HTML 文件逐字节相同、样式块行集合差恰好 +8/−2**；
  · `gate/visual-and-home-height.json`：首页页高归因（忠实改动前构建 4665px == 改动后 4665px
    ⇒ 回归比对里那 +76px 是 6 天前基线的数据漂移，与本次改动无关）；
  · `audit/`：独立探针 + 前后读数 + **反空洞守卫负例**（自造"M4 锚点缺失"的产物副本 ⇒ 整轮失败 4 项、退出码 1）；
  · `smoke/`：线上冒烟**只打 3 个页面**，不遍历全站以免污染真实 Analytics。
- `PROJECT_STATUS.md` —— 新增 §0.2 一节（含 CI / Deploy / Smoke 读数）。

**体积纪律**：两份页面快照与截图按仓库既有规矩不入库（可一条命令重建 / 可重拍），由该目录的
`.gitignore` 显式排除并写明理由。
