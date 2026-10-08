# t28 配牙读数（改坏 → 判据 → 逐字节还原 → 回绿）

起点 sha256（前 16 位）：curated 467e48a8b51e3f3d · apiPlans 30fdf7b8758d2aea · history f4dc9710bfca3b3c · links e9d2bab183173360

| # | 改坏 | 判据 | 改坏读数 | 还原读数 | 还原后 sha256（前 16 位） |
|---|---|---|---|---|---|
| T1 | T1 C1：值改成引文里没有的 0.15 | `validate --strict` | 红(exit 1)：- curated_api_plans.json[5] Claude API 按量计费: evidence「models.claude-sonnet-5.5.rates.cachedInput.change」声明为变更记录，但引文里找不到该维度的当前值（0.15）—— 空转的变更绑定等于没证 | 绿(exit 0) | curated 467e48a8b51e3f3d · apiPlans 30fdf7b8758d2aea · history f4dc9710bfca3b3c · links e9d2bab183173360 |
| T2 | T2 C2：引文只剩一个数 | `validate --strict` | 红(exit 1)：- curated_api_plans.json[5] Claude API 按量计费: evidence「models.claude-sonnet-5.5.rates.cachedInput.change」声明为变更记录，但引文里只有当前值（0.1）—— 变更记录必须同时写出一个**不同**的数值（旧值 / 折扣比例），否则它不是变更证据；这类引文请改用维度绑定（那会走输入/输出列序判据） | 绿(exit 0) | curated 467e48a8b51e3f3d · apiPlans 30fdf7b8758d2aea · history f4dc9710bfca3b3c · links e9d2bab183173360 |
| T3 | T3 对照：摘掉 .change 后缀（普通维度绑定） | `validate --strict` | 红(exit 1)：- curated_api_plans.json[5] Claude API 按量计费: evidence「models.claude-sonnet-5.5.rates.cachedInput」里 10 出现在 2 之前，而 claude-sonnet-5.5 的数据说输入价 2、输出价 10 —— 官方表格的列序是「输入价在前」；数据与引文顺序相反（input/output 被对调过？） | 绿(exit 0) | curated 467e48a8b51e3f3d · apiPlans 30fdf7b8758d2aea · history f4dc9710bfca3b3c · links e9d2bab183173360 |
| T4 | T4 值改回 0.20 而日志不动 | `check:api-plan-history` | 红(exit 1)：❌ API 计费变化日志与当前状态不一致：1 处。 | 绿(exit 0) | curated 467e48a8b51e3f3d · apiPlans 30fdf7b8758d2aea · history f4dc9710bfca3b3c · links e9d2bab183173360 |
| T5 | T5 删掉变更引文并重建（关系层仍引用） | `check:model-registry-links` | 红(exit 1)：✗ links[7] claude-sonnet-5.5 evidence[1]: 这条引文不是被引用记录自己的官方引文（field/sourceUrl/quote 必须与记录里的某一条逐字相同）—— 链接只允许复制记录的引文，不许新造一条 | 绿(exit 0) | curated 467e48a8b51e3f3d · apiPlans 30fdf7b8758d2aea · history f4dc9710bfca3b3c · links e9d2bab183173360 |

逐字节还原一致：**✅ 四个文件全部与读数前逐字节相同**

判据原文（改坏时的报错行，取自 `scripts/validate.js --strict` / `check-api-plan-history` / `check-model-registry-links`）：

- **T1**（validate --strict）：- curated_api_plans.json[5] Claude API 按量计费: evidence「models.claude-sonnet-5.5.rates.cachedInput.change」声明为变更记录，但引文里找不到该维度的当前值（0.15）—— 空转的变更绑定等于没证
- **T2**（validate --strict）：- curated_api_plans.json[5] Claude API 按量计费: evidence「models.claude-sonnet-5.5.rates.cachedInput.change」声明为变更记录，但引文里只有当前值（0.1）—— 变更记录必须同时写出一个**不同**的数值（旧值 / 折扣比例），否则它不是变更证据；这类引文请改用维度绑定（那会走输入/输出列序判据）
- **T3**（validate --strict）：- curated_api_plans.json[5] Claude API 按量计费: evidence「models.claude-sonnet-5.5.rates.cachedInput」里 10 出现在 2 之前，而 claude-sonnet-5.5 的数据说输入价 2、输出价 10 —— 官方表格的列序是「输入价在前」；数据与引文顺序相反（input/output 被对调过？）
- **T4**（check:api-plan-history）：❌ API 计费变化日志与当前状态不一致：1 处。
- **T5**（check:model-registry-links）：✗ links[7] claude-sonnet-5.5 evidence[1]: 这条引文不是被引用记录自己的官方引文（field/sourceUrl/quote 必须与记录里的某一条逐字相同）—— 链接只允许复制记录的引文，不许新造一条

> 说明：T4 在**派生层**演示（把 `api-plans.json` 的值改回 0.2 而日志不动）；curated 里的同一场景会先被 T1 拦下。
> `.change` 引文本身同时点名新值 0.10 与旧值 0.20，所以「把值改回 0.20」不会在引文层变红 —— 配牙靠 T1（引文里没有的数）与 T4（日志对账）。
