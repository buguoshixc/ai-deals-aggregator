# `opts.max` 前后调用清单（t28）

判据（captain 放行条件①）：`opts.max` 必须是**可选**参数、缺省仍 `MAX_EVIDENCE_ITEMS = 3`，且**除 `api-plan-schema.js` 外没有任何调用方传它**。

## 改前（base `9b72b9d`，`git grep -n -E 'normalizeEvidence\(|mergeEvidence\(' 9b72b9d -- scripts`）

```
9b72b9d:scripts/lib/api-plan-schema.js:1184:  const evidence = provenance.normalizeEvidence(raw.evidence, { today, fields: evidenceFields });
9b72b9d:scripts/lib/audience-overrides.js:114:    const evidenceQuotes = provenance.normalizeEvidence(raw.evidenceQuotes, { today: todayCN() });
9b72b9d:scripts/lib/audience-overrides.js:222:  const quotes = provenance.mergeEvidence(next.evidence, entry.evidenceQuotes);
9b72b9d:scripts/lib/deal-plan-links.js:568:  const normalized = provenance.normalizeEvidence(list, {
9b72b9d:scripts/lib/dedup.js:521:  const evidence = provenance.mergeEvidence(a.evidence, b.evidence);
9b72b9d:scripts/lib/plan-schema.js:736:  const evidence = provenance.normalizeEvidence(raw.evidence, { today, fields: PLANS_EVIDENCE_FIELDS });
9b72b9d:scripts/lib/schema.js:535:  const evidence = provenance.normalizeEvidence(raw.evidence, { today });
9b72b9d:scripts/lib/schema.js:672:  const normalized = provenance.normalizeEvidence(value, { today });
9b72b9d:scripts/tools/plans-selftest.js:{977,978,983,986,988}   （5 处，均不传 max）
9b72b9d:scripts/tools/provenance-selftest.js:{52,53,54,55,57,59,60,62,64,65,66,67,69,72,73,81,85}（17 处 normalizeEvidence）与 {95,98,99,100,102,104}（6 处 mergeEvidence），均不传 max
```

## 改后（工作树，`git grep -n -E 'normalizeEvidence\(|mergeEvidence\(|max: API_EVIDENCE_MAX_ITEMS' -- scripts`）

```
scripts/lib/api-plan-schema.js:1268:  const evidence = provenance.normalizeEvidence(raw.evidence, { today, fields: evidenceFields, max: API_EVIDENCE_MAX_ITEMS });   ← 唯一传 max 的调用方
scripts/lib/audience-overrides.js:114:    ...normalizeEvidence(raw.evidenceQuotes, { today: todayCN() });
scripts/lib/audience-overrides.js:222:  const quotes = provenance.mergeEvidence(next.evidence, entry.evidenceQuotes);
scripts/lib/deal-plan-links.js:568:  const normalized = provenance.normalizeEvidence(list, { … });
scripts/lib/dedup.js:521:  const evidence = provenance.mergeEvidence(a.evidence, b.evidence);
scripts/lib/plan-schema.js:736:  ...normalizeEvidence(raw.evidence, { today, fields: PLANS_EVIDENCE_FIELDS });
scripts/lib/schema.js:535 / :672: ...normalizeEvidence(…, { today });
scripts/tools/plans-selftest.js / scripts/tools/provenance-selftest.js：与改前逐行相同（本任务未改任何测试文件；`git diff --stat` 里没有它们）
```

## 缺省值没被改动的读数

- `scripts/lib/provenance.js`：`MAX_EVIDENCE_ITEMS = 3`（**未改**）；`evidenceCapOf(opts)` = `Number.isInteger(opts.max) && opts.max > 0 ? opts.max : MAX_EVIDENCE_ITEMS`。
- 探针读数（`.arch-v1/t28/probe-change-form.out.txt`）：5 条候选引文，**不传 max ⇒ 归一后 3 条**；传 `max: 4` ⇒ 4 条。`max: API_EVIDENCE_MAX_ITEMS` 全仓只有 `api-plan-schema.js:1268` 一处（上面清单）。
- 既有自测未改一行且全过：`selftest:provenance` **132 项通过 / 0 失败**、`selftest:api-plans` **176 / 0**、`selftest:models` **120 / 0**（`provenance-selftest.js:81`「四条约到三条」那条断言原样成立）。
