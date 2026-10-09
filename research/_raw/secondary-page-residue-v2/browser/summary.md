# t5 真浏览器读数汇总（browser-verify）

生成时间：2026-10-09T07:57:43.711Z
浏览器：playwright-core 154.0.4258.62 · C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
删后产物：`D:\OneDrive\Desktop\Code\AI Page\.worktrees\secondary-page-residue-v2\dist` · treeDigest `59db0aa5aaef0ac01589c4203dc9dfeda2c7ddbe3883c2a0774f24451607d04a`（304 文件）
删前副本：`D:\OneDrive\Desktop\Code\AI Page\dist` · treeDigest `141af6139516922f925cc9605ee45efd6c4b65c499b2ad2cda689984612d2f34`（304 文件）

## 1. 抽样页表（页 / 删前可见字数 / 删后可见字数 / 余量 vs textFloor / 回流命中数）

可见字数 = `seo.visibleText` 口径（与 `textFloor` 同一把尺）；回流命中 = 48 条被删文案字面在 **真浏览器** `document.body.innerText` 里的命中数（另附 textContent 与序列化 HTML 两面）。

| 页 | kind | 删前可见字数 | 删后可见字数 | Δ | textFloor | 余量 | 回流(innerText) | 回流(textContent) | 回流(HTML) | 页高@1440 | 页高@390 | 横向溢出 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/deal/017bdbc04e70/` | deal | 1372 | 1360 | -12 | 500 | 860 | 0 | 0 | 0 | 1685 | 2476 | 0/0 |
| `/deal/176234a80147/` | deal | 1347 | 1335 | -12 | 500 | 835 | 0 | 0 | 0 | 1638 | 2282 | 0/0 |
| `/deal/2db62eb1a8a0/` | deal | 1399 | 1375 | -24 | 500 | 875 | 0 | 0 | 0 | 1493 | 1939 | 0/0 |
| `/deal/42c65c0d8d9d/` | deal | 1657 | 1645 | -12 | 500 | 1145 | 0 | 0 | 0 | 1697 | 2543 | 0/0 |
| `/deal/4a875a435019/` | deal | 1731 | 1719 | -12 | 500 | 1219 | 0 | 0 | 0 | 1769 | 2506 | 0/0 |
| `/deal/4d4bcb5b6829/` | deal | 1318 | 1306 | -12 | 500 | 806 | 0 | 0 | 0 | 1685 | 2372 | 0/0 |
| `/deal/57847fbcc1ed/` | deal | 1426 | 1402 | -24 | 500 | 902 | 0 | 0 | 0 | 1493 | 1996 | 0/0 |
| `/deal/62e3166acec0/` | deal | 1318 | 1306 | -12 | 500 | 806 | 0 | 0 | 0 | 1685 | 2350 | 0/0 |
| `/deal/6869e7866510/` | deal | 1301 | 1289 | -12 | 500 | 789 | 0 | 0 | 0 | 1528 | 2175 | 0/0 |
| `/deal/833a9889bfb7/` | deal | 1220 | 1208 | -12 | 500 | 708 | 0 | 0 | 0 | 1638 | 2157 | 0/0 |
| `/deal/8dada3205ed8/` | deal | 1399 | 1375 | -24 | 500 | 875 | 0 | 0 | 0 | 1493 | 1939 | 0/0 |
| `/deal/97d21ff73d3e/` | deal | 1598 | 1574 | -24 | 500 | 1074 | 0 | 0 | 0 | 1883 | 2610 | 0/0 |
| `/deal/aacd5856bba2/` | deal | 1338 | 1326 | -12 | 500 | 826 | 0 | 0 | 0 | 1632 | 2336 | 0/0 |
| `/deal/b56f33b3d4f3/` | deal | 1899 | 1887 | -12 | 500 | 1387 | 0 | 0 | 0 | 1835 | 2842 | 0/0 |
| `/deal/bf156583e97c/` | deal | 1339 | 1327 | -12 | 500 | 827 | 0 | 0 | 0 | 1685 | 2414 | 0/0 |
| `/deal/c4ab5c5d8101/` | deal | 1375 | 1363 | -12 | 500 | 863 | 0 | 0 | 0 | 1685 | 2476 | 0/0 |
| `/deal/d6aaee8c7379/` | deal | 1429 | 1405 | -24 | 500 | 905 | 0 | 0 | 0 | 1493 | 1981 | 0/0 |
| `/deal/e237cab7c007/` | deal | 1417 | 1405 | -12 | 500 | 905 | 0 | 0 | 0 | 1707 | 2481 | 0/0 |
| `/deal/e63402b5cc83/` | deal | 1459 | 1447 | -12 | 500 | 947 | 0 | 0 | 0 | 1753 | 2408 | 0/0 |
| `/deal/ead998e58cd9/` | deal | 1163 | 1139 | -24 | 500 | 639 | 0 | 0 | 0 | 1511 | 2005 | 0/0 |
| `/` | home | 13306 | 13302 | -4 | 3000 | 10302 | 0 | 0 | 0 | 4787 | 11830 | 0/0 |
| `/feeds/` | feeds | 3971 | 4065 | 94 | 600 | 3465 | 0 | 0 | 0 | 3254 | 4312 | 0/0 |
| `/plans/` | plans-hub | 3286 | 3249 | -37 | 820 | 2429 | 0 | 0 | 0 | 1957 | 3426 | 0/0 |
| `/plans/api/` | plans | 31056 | 31043 | -13 | 5820 | 25223 | 0 | 0 | 0 | 11512 | 49409 | 0/0 |
| `/plans/coding/` | plans | 33208 | 33195 | -13 | 3240 | 29955 | 0 | 0 | 0 | 8837 | 14585 | 0/0 |
| `/status/` | status | 1228 | 1228 | 0 | 600 | 628 | 0 | 0 | 0 | 1106 | 1327 | 0/0 |
| `/models/` | models-index | 5740 | 5710 | -30 | 3660 | 2050 | 0 | 0 | 0 | 3627 | 4940 | 0/0 |
| `/changes/` | changes | 4410 | 4430 | 20 | 600 | 3830 | 0 | 0 | 0 | 4150 | 5091 | 0/0 |
| `/category/` | hub | 923 | 923 | 0 | 800 | 123 | 0 | 0 | 0 | 900 | 1061 | 0/0 |
| `/category/chat/` | category | 2164 | 2164 | 0 | 1500 | 664 | 0 | 0 | 0 | 1709 | 2920 | 0/0 |
| `/need/no-card/` | need | 710 | 710 | 0 | 660 | 50 | 0 | 0 | 0 | 900 | 844 | 0/0 |
| `/need/ai-coding/` | need | 976 | 976 | 0 | 840 | 136 | 0 | 0 | 0 | 910 | 1182 | 0/0 |
| `/vendor/` | <unknown> | 2699 | 2699 | 0 | 600 | 2099 | 0 | 0 | 0 | 1523 | 3345 | 0/0 |
| `/vendor/openai/` | vendor | 1968 | 1968 | 0 | 660 | 1308 | 0 | 0 | 0 | 1719 | 1993 | 0/0 |
| `/student/` | collection | 1773 | 1773 | 0 | 1320 | 453 | 0 | 0 | 0 | 1730 | 2119 | 0/0 |
| `/developer/` | collection | 6655 | 6655 | 0 | 4620 | 2035 | 0 | 0 | 0 | 5668 | 9794 | 0/0 |
| `/free-api/` | collection | 4777 | 4777 | 0 | 3300 | 1477 | 0 | 0 | 0 | 4184 | 7119 | 0/0 |
| `/docs/data/` | data-docs | 5562 | 5562 | 0 | 1200 | 4362 | 0 | 0 | 0 | 2685 | 4595 | 0/0 |
| `/archive/` | archive-index | 1348 | 1348 | 0 | 600 | 748 | 0 | 0 | 0 | 951 | 1426 | 0/0 |
| `/models/qwen-max/` | model | 1177 | 1177 | 0 | 700 | 477 | 0 | 0 | 0 | 1074 | 1357 | 0/0 |

## 2. 删前/删后几何对照（3 个 /deal/* × 两个视口）

| 页 | 视口 | 页高 删前→删后 | Δ | 归因 | .dsrc 块高 删前→删后 | 免责行 删前→删后（字） | 删前回流 | 删后回流 |
|---|---|---:|---:|---|---|---:|---:|---:|
| `/deal/adcb6471a512/` | desktop | 1511→1511 | 0 | 无变化（.ddesc 与 .dsrc-note 都是单行，删字不改行数） | 320→320 | 27 字/49 字 → 27 字/37 字 | 7 | 0 |
| `/deal/adcb6471a512/` | mobile | 1963→1941 | -22 | .ddesc 44→22px（少一行，行高 ≈ 22px）· .dsrc-note 35→35px（行数不变） | 357→357 | 27 字/49 字 → 27 字/37 字 | 7 | 0 |
| `/deal/2db62eb1a8a0/` | desktop | 1493→1493 | 0 | 无变化（.ddesc 与 .dsrc-note 都是单行，删字不改行数） | 365→365 | 27 字/49 字 → 27 字/37 字 | 7 | 0 |
| `/deal/2db62eb1a8a0/` | mobile | 1961→1939 | -22 | .ddesc 44→22px（少一行，行高 ≈ 22px）· .dsrc-note 35→35px（行数不变） | 505→505 | 27 字/49 字 → 27 字/37 字 | 7 | 0 |
| `/deal/57847fbcc1ed/` | desktop | 1493→1493 | 0 | 无变化（.ddesc 与 .dsrc-note 都是单行，删字不改行数） | 365→365 | 27 字/49 字 → 27 字/37 字 | 7 | 0 |
| `/deal/57847fbcc1ed/` | mobile | 2018→1996 | -22 | .ddesc 44→22px（少一行，行高 ≈ 22px）· .dsrc-note 35→35px（行数不变） | 539→539 | 27 字/49 字 → 27 字/37 字 | 7 | 0 |

## 3. 检查项

### 3a. 抽样套件（40 路由 × 2 视口 + 3 页几何对照）

- ✅ **抽样页全部 HTTP 200** — 200 80/80 · console 错误合计 0 条
- ✅ **回流检测（浏览器层 innerText）：被删文案 0 命中** — innerText 0 次 · textContent 0 次 · 序列化 HTML（剥 script/style/注释）0 次 · 每页检查 48 条字面
- ✅ **回流检测的阳性对照：删前产物命中 > 0，删后 = 0** — deal/adcb6471a512/ innerText 命中 [7,7] → [0,0] · deal/2db62eb1a8a0/ innerText 命中 [7,7] → [0,0] · deal/57847fbcc1ed/ innerText 命中 [7,7] → [0,0]
- ✅ **横向溢出：页面级 scrollWidth == clientWidth（两个视口）** — 无页面级溢出
- ✅ **横向溢出：没有元素真的把页面撑宽（被可滚动祖先裁掉的不算）** — 无 · 被祖先裁掉的可滚动溢出 2581 处（登记为读数，不判红）
- ✅ **8 类容器：真浏览器 DOM 元素数 ≥ 文件层 token 数（构建期扫描面没有虚高）** — 全部一致 · 抽样页 DOM 合计 {"dsrc-note":41,"ddesc":20,"fdesc":25,"chgnote":19,"pchnote":4,"pftdesc":4,"chgmeta":1,"hint":54}
- ✅ **说明清单对账：声明 vs 真浏览器 DOM（槽位 × 签名 × 条数，逐页逐视口）** — 全部一致
- ✅ **页高：删后不高于删前（3 个 /deal/* × 2 视口）** — deal/adcb6471a512/ desktop 1511px→1511px (Δ0) mobile 1963px→1941px (Δ-22) · deal/2db62eb1a8a0/ desktop 1493px→1493px (Δ0) mobile 1961px→1939px (Δ-22) · deal/57847fbcc1ed/ desktop 1493px→1493px (Δ0) mobile 2018px→1996px (Δ-22)
- ✅ **.dsrc-note / .ddesc 元素与文本：删后仍在场（条数不变，只短了尾半句）** — desktop dsrc-note 2→2 ddesc 1→1 文本 27→27 字 · mobile dsrc-note 2→2 ddesc 1→1 文本 27→27 字 | desktop dsrc-note 2→2 ddesc 1→1 文本 27→27 字 · mobile dsrc-note 2→2 ddesc 1→1 文本 27→27 字 | desktop dsrc-note 2→2 ddesc 1→1 文本 27→27 字 · mobile dsrc-note 2→2 ddesc 1→1 文本 27→27 字

### 3b. 全站真浏览器扫面（186 页 @1440×900）

- ✅ **全站 186 页 HTTP 200** — 200 186/186
- ✅ **全站 186 页：被删文案在 innerText / textContent / 序列化 HTML 三面 0 命中** — 命中 0 次（每页检查 48 条字面）
- ✅ **全站 186 页：**不剥** script/style/注释的整份 DOM 也 0 命中（对应构建期「只报不判」那条）** — 0 次（186 页 × 48 条字面）
- ✅ **全站 186 页：8 类容器 DOM 总数 == 构建期牙的实测值** — dsrc-note 165/165 · ddesc 80/80 · fdesc 25/25 · chgnote 19/19 · pchnote 4/4 · pftdesc 4/4 · chgmeta 1/1 · hint 54/54
- ✅ **全站 186 页：8 类容器都过下限** — dsrc-note 165≥123 · ddesc 80≥60 · fdesc 25≥18 · chgnote 19≥14 · pchnote 4≥1 · pftdesc 4≥1 · chgmeta 1≥1 · hint 54≥40
- ✅ **全站 186 页：说明清单「槽位 × 签名 × 条数」逐页一致且容器 DOM ≥ 文件层** — 逐页一致
- ✅ **全站 186 页：无页面级横向溢出、无元素把页面撑宽** — 全 0
- ✅ **console 错误** — 0 条

> 8 类容器的**真浏览器 DOM 元素总数**逐类等于构建期牙的实测值 —— 这是「扫描面不许收缩」在 DOM 层的独立复算：产物文件里数到的.class token、构建期牙数的、真 DOM 里数到的，三者是同一个数。

## 4. 旁证读数

- 8 类容器 token（独立实现精确分词）：dsrc-note 165→165（牙 165/下限 123） · ddesc 80→80（牙 80/下限 60） · fdesc 25→25（牙 25/下限 18） · chgnote 19→19（牙 19/下限 14） · pchnote 4→4（牙 4/下限 1） · pftdesc 4→4（牙 4/下限 1） · chgmeta 1→1（牙 1/下限 1） · hint 54→54（牙 54/下限 40）
- 与构建期牙一致：true · 删前==删后：true · 全部过下限：true
- 全站正文下限：186 页重算，低于下限的页 **0** · deal 最小余量 639（`/deal/adcb6471a512/`，1139 字 − 下限 500）
- 6 个登记残留页实时重算：`/need/no-card/` 50/50✓ · `/category/` 123/123✓ · `/category/audio/` 123/123✓ · `/need/ai-coding/` 136/136✓ · `/category/image/` 139/139✓ · `/category/agent/` 142/142✓
- 删前/删后差集：186 个文件（{".ndjson":1,".html":134,".json":25,".xml":26}）；其中 80 个 /deal/* 页在「去掉两段被删文案 + 时间口径归一」后**逐字节相同**：true
- 被删片段在删前 /deal/* 的出现次数：{"；最终以厂商官方页面为准 × 1":80,"（无头浏览器渲染后提取） × 0":63,"（无头浏览器渲染后提取） × 1":17}
- 两棵树的时间戳差异（归一掉 16–34 个 token/页）：日期 ["2026-09-21","2026-09-22","2026-09-23","2026-09-28","2026-10-08"] → ["2026-09-21","2026-09-22","2026-09-23","2026-09-28","2026-10-08","2026-10-09"]
- 非 /deal/* 的差集：HTML category/agent/index.html,category/api/index.html,category/audio/index.html,category/chat/index.html,category/image/index.html,category/index.html,changes/index.html,developer/index.html,docs/data/index.html,feeds/index.html,free-api/index.html,index.html,models/index.html,need/ai-coding/index.html,need/china-usable/index.html,need/dev-credits/index.html,need/edu-identity/index.html,need/free-api/index.html,need/free-model/index.html,need/free-tier/index.html,need/free-tokens/index.html,need/no-card/index.html,need/student-only/index.html,plans/api/index.html,plans/coding/index.html,plans/index.html,status/index.html,student/index.html,vendor/ai360/index.html,vendor/aliyun/index.html,vendor/anthropic/index.html,vendor/aws/index.html,vendor/baichuan/index.html,vendor/baidu-ai-cloud/index.html,vendor/coze/index.html,vendor/cursor/index.html,vendor/deepseek/index.html,vendor/github/index.html,vendor/google/index.html,vendor/iflytek/index.html,vendor/index.html,vendor/microsoft/index.html,vendor/minimax/index.html,vendor/moonshot/index.html,vendor/notion/index.html,vendor/openai/index.html,vendor/replit/index.html,vendor/sensetime/index.html,vendor/siliconflow/index.html,vendor/stepfun/index.html,vendor/tencent-cloud/index.html,vendor/volcengine/index.html,vendor/windsurf/index.html,vendor/zhipu/index.html 个 · 数据/Feed _notes.ndjson,data/index.json,deals.json,feed.json,feed.xml,feed/ai-coding.json,feed/ai-coding.xml,feed/category-agent.json,feed/category-agent.xml,feed/category-api.json,feed/category-api.xml,feed/category-audio.json,feed/category-audio.xml,feed/category-chat.json,feed/category-chat.xml,feed/category-image.json,feed/category-image.xml,feed/changes.xml,feed/china.json,feed/china.xml,feed/developer.json,feed/developer.xml,feed/free-api.json,feed/free-api.xml,feed/free-tokens.json,feed/free-tokens.xml,feed/new.json,feed/new.xml,feed/plans/api/changes.xml,feed/plans/coding/changes.xml,feed/student.json,feed/student.xml,feed/vendor/baidu-ai-cloud.json,feed/vendor/baidu-ai-cloud.xml,feed/vendor/coze.json,feed/vendor/coze.xml,feed/vendor/github.json,feed/vendor/github.xml,feed/vendor/iflytek.json,feed/vendor/iflytek.xml,feed/vendor/microsoft.json,feed/vendor/microsoft.xml,feed/vendor/minimax.json,feed/vendor/minimax.xml,feed/vendor/notion.json,feed/vendor/notion.xml,feed/vendor/volcengine.json,feed/vendor/volcengine.xml,feed/vendor/zhipu.json,feed/vendor/zhipu.xml,sitemap.xml,source-health.json 个（10-08 vs 10-09 数据态 + 其它页族文案）
- 被可滚动祖先裁掉的横向溢出（登记为读数，不判红）：mobile th.(no-class) ← div.ptable-wrap ×7 · mobile table.ctable ← div.ctable-wrap ×7 · mobile caption.(no-class) ← table.ctable ×7 · mobile thead.(no-class) ← table.ctable ×7 · mobile tr.(no-class) ← table.ctable ×7 · mobile th.(no-class) ← table.ctable ×7 · mobile tbody.(no-class) ← table.ctable ×7 · mobile table.ptable ← div.ptable-wrap ×4 · mobile caption.(no-class) ← div.ptable-wrap ×4 · mobile thead.(no-class) ← div.ptable-wrap ×4 · mobile tr.(no-class) ← div.ptable-wrap ×4 · desktop span.(no-class) ← div.fmembers ×3
- **`node scripts/tools/verify-site.js --dir=dist`**：892 项 / 失败 0 项（exit 0，用时 156s）· 目标 http://127.0.0.1:54733/ · JS 错误 0 · 外部请求 0 · 404 
  - ✅ 首页顶栏 761px：页面不横向溢出、搜索框仍可用、入口仍在视口里
    - 溢出 0px · 搜索框 721px · 顶栏高 104px
  - ✅ 首页顶栏 820px：页面不横向溢出、搜索框仍可用、入口仍在视口里
    - 溢出 0px · 搜索框 780px · 顶栏高 104px
  - ✅ 首页顶栏 900px：页面不横向溢出、搜索框仍可用、入口仍在视口里
    - 溢出 0px · 搜索框 860px · 顶栏高 104px
  - ✅ 首页顶栏 940px：页面不横向溢出、搜索框仍可用、入口仍在视口里
    - 溢出 0px · 搜索框 900px · 顶栏高 104px
  - ✅ 首页顶栏 941px：页面不横向溢出、搜索框仍可用、入口仍在视口里
    - 溢出 0px · 搜索框 216px · 顶栏高 59px
  - ✅ 无横向溢出
    - 溢出 0px
  - ✅ 360px 页面级无横向溢出（390px 那条量不到更窄的视口）
    - 溢出 0px · 网格 328px / 容器 328px
  - ✅ 详情页信息来源块 390px 不产生横向溢出（长 URL 必须换行而不是撑宽）
    - 页面溢出 0px · 10 行中越界 0 行
  - ✅ 详情页信息来源块 360px 不产生横向溢出（长 URL 必须换行而不是撑宽）
    - 页面溢出 0px · 10 行中越界 0 行
  - ✅ 详情页变更记录块 390px 不产生横向溢出
    - 页面溢出 0px · 0 条事件行中越界 0 行
  - ✅ 详情页变更记录块 360px 不产生横向溢出
    - 页面溢出 0px · 0 条事件行中越界 0 行
  - ✅ 专题导航卡 1600px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形）
    - 10/10 张在视口内 · left 110 / right 1490（视口 1600）· 2 行（5/5）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  - ✅ 专题导航卡 1440px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形）
    - 10/10 张在视口内 · left 30 / right 1410（视口 1440）· 2 行（5/5）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  - ✅ 专题导航卡 1280px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形）
    - 10/10 张在视口内 · left 20 / right 1260（视口 1280）· 2 行（5/5）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  - ✅ 专题导航卡 768px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形）
    - 10/10 张在视口内 · left 20 / right 748（视口 768）· 4 行（3/3/3/1）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  - ✅ 专题导航卡 430px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形）
    - 10/10 张在视口内 · left 16 / right 414（视口 430）· 10 行（1/1/1/1/1/1/1/1/1/1）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  - ✅ 专题导航卡 390px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形）
    - 10/10 张在视口内 · left 16 / right 374（视口 390）· 10 行（1/1/1/1/1/1/1/1/1/1）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  - ✅ 按需求入口 390px：全部入口在视口内、不被裁、页面不横向溢出
    - 10/10 可见 · 10 行卡（1/1/1/1/1/1/1/1/1/1）· 整块 758px · 被裁 0 · 页面溢出 0px
  - ✅ 按需求入口 360px：全部入口在视口内、不被裁、页面不横向溢出
    - 10/10 可见 · 10 行卡（1/1/1/1/1/1/1/1/1/1）· 整块 758px · 被裁 0 · 页面溢出 0px
  - ✅ 390px：整行点击区 ≥44px、summary 不超出视口、展开后正文与页面都不横向溢出
    - summary 358×44px（视口 390） · 页面溢出 0px · 正文溢出 0/3 段 · 状态文案仍在行内=true
  - ✅ /status/ 390px 不产生页面级横向溢出（宽表应在容器内横滚，而不是撑开整页）
    - 页面溢出 0px · .stable-wrap overflow-x=auto · 表格宽 495px / 容器宽 358px
  - ✅ /status/ 360px 不产生页面级横向溢出（宽表应在容器内横滚，而不是撑开整页）
    - 页面溢出 0px · .stable-wrap overflow-x=auto · 表格宽 495px / 容器宽 328px
  - ✅ 手机端列表视图明显更短且不横向溢出
    - 卡片 11830px → 列表 4811px（5.7 屏 · 50 行 · 横向溢出 0px）
  - ✅ 390px 下对比条展开也不产生横向溢出
    - 对比条 0–390px / 视口 390px · 溢出 0px · 「已选 4 / 4 条进入对比」
  - ✅ 390px 与 360px：收藏入口与清理按钮都在视口内、无横向溢出
    - 390px：入口 16–117 · 清理 124–203 · 溢出 0px · 360px：入口 16–117 · 清理 149–228 · 溢出 0px
  - ✅ 390px：/changes/ 零横向溢出（列表式布局，不是宽表）
    - 溢出 0px · 分栏 7
  - ✅ /plans/coding/ 390px 不产生页面级横向溢出（11 列宽表应在容器内横滚）
    - 页面溢出 0px · .ptable-wrap overflow-x=auto · 表格宽 1055px / 容器宽 358px
  - ✅ /plans/coding/ 360px 不产生页面级横向溢出（11 列宽表应在容器内横滚）
    - 页面溢出 0px · .ptable-wrap overflow-x=auto · 表格宽 1055px / 容器宽 328px
  - ✅ /plans/coding/ 390px 筛选 + 展开详情后仍无页面级横向溢出
    - 溢出 0px
  - ✅ /plans/coding/ 360px 筛选 + 展开详情后仍无页面级横向溢出
    - 溢出 0px
  - ✅ /plans/api/ 390px 不产生页面级横向溢出（11 列宽表应在容器内横滚）
    - 溢出 0px
  - ✅ /plans/api/ 360px 不产生页面级横向溢出（11 列宽表应在容器内横滚）
    - 溢出 0px
  - ✅ /plans/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /plans/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /models/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /models/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /models/deepseek-v3.2/（默认隐藏的旧型号） 390px 不产生页面级横向溢出
    - 0px
  - ✅ /models/deepseek-v3.2/（默认隐藏的旧型号） 360px 不产生页面级横向溢出
    - 0px
  - ✅ /models/ernie-5.1/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /models/ernie-5.1/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /models/glm-4.5v/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /models/glm-4.5v/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /models/glm-4.6v/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /models/glm-4.6v/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /models/360zhinao-pro/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /models/360zhinao-pro/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /models/360zhinao-turbo-llm-geo/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /models/360zhinao-turbo-llm-geo/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /models/baichuan-m3/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /models/baichuan-m3/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ §22b @768 内容列宽 == .wrap 可用宽（窄屏铺满、不另立断点）且页面无横向溢出
    - deal 列 728 / 可用 728 · model 列 728 / 可用 728 · scrollWidth deal 768 / model 768（视口 768） · 无违规码
  - ✅ §22c @1440 全站 186 页都没有横向溢出
    - documentElement.scrollWidth ≤ 视口+1 全部成立
  - ✅ §22c @1600 全站 186 页都没有横向溢出
    - documentElement.scrollWidth ≤ 视口+1 全部成立
  - ✅ §22c @950 全站 186 页都没有横向溢出
    - documentElement.scrollWidth ≤ 视口+1 全部成立
  - ✅ §22c ⑨ 说明清单可读、每页一条、与产物页面对得上（`dist/_notes.ndjson`）
    - 清单 186 页 / 产物 186 页 · schemaVersion 1 · 槽位 main-snote / main-pnote / main-vsnote
  - ✅ §22c ⑨ 逐页逐槽位对账：清单声明的「签名 × 条数」== 真浏览器 DOM 数出来的（523 条登记说明 × 3 个槽位）
    - 逐条一致（登记说明 523 条）
  - ✅ §22c ⑨ 页面族结构下限：目录页家族（**含别名页**）0 条页面级说明、状态页 2 条、订阅中心 3+1 条、厂商页六节说明
    - 全部页面族的说明条数下限成立（下限守住「登记与模板一起被删」那种两侧同时消失的改法；别名页本轮从「恰好 1 条」并入「目录页家族 0 条」—— 依据见 build-local.js renderDirectoryPage 顶部）
  - ✅ §22c ⑨ 棘轮：DOM 里有 `.snote` 的页面必须在清单里登记过（新的隐形说明面不许悄悄出现）
    - 有 .snote 的页面全部登记过（DOM 侧 60 页有页面级说明）
  - ✅ /vendor/baidu-ai-cloud/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /vendor/baidu-ai-cloud/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /vendor/volcengine/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /vendor/volcengine/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /vendor/zhipu/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /vendor/zhipu/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /vendor/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /vendor/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /archive/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /archive/ 360px 不产生页面级横向溢出
    - 0px
  - ✅ /docs/data/ 390px 不产生页面级横向溢出
    - 0px
  - ✅ /docs/data/ 360px 不产生页面级横向溢出
    - 0px

## 5. 局限

- 「删前」用的是**主检出 dist/**（141af613…，10-08 数据态），不是工作树的父提交重建产物：两棵树之间除了文案还有数据态差异（时间戳、`/feeds/` 的条件型 `.snote`）。因此**只有 /deal/* 页**做了删前删后对照，并且那 80 页已经逐字节证明「差异 = 两段被删文案 + 时间戳」。
- 非 /deal/* 页只给「删后」的绝对读数（下限、溢出、回流、清单对账），不与主检出比高度。
- 浏览器层回流检测只覆盖抽样的 40 个路由 × 2 视口（全量 304 个产物文件的扫描是构建期牙的职责，本轮已随 `npm run build` 跑过）。
