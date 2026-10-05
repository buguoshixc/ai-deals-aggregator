#!/usr/bin/env node
/**
 * t7 审查工具：**文本 ↔ JSON 同源**逐条核对（v3 四节）。
 *
 * 做法：从 `--json` 的真字节捕获里切出「文本段」与「JSON 段」，然后不看实现者的自测，
 * 自己按四节在文本里**实际印出来的行**去反查 JSON 里的对应数字：
 *   ① Release Evidence Coverage：registry 数 / 已知 / 未知 / 带引文 / 每个 developer·modelRole·catalogStatus 档位
 *   ② Release Evidence Queue：队列条数、未知/已知、limit、打印的每一条（rank + slug + 未知 + 组 + tier + 下游引用）
 *   ③ Gap Closure Queue：条数、A/B/C/D 计数、每条（priority/provider/tier/N/M/K/出口状态）
 *   ④ Source Reliability：心跳 generatedAt、注册表行数、未落盘提示、对账四行计数
 * 另：四节标题必须在文本里真的在（不是只有 JSON 键）。
 *
 * 用法：node text-json-samesource.cjs <capture-file> [--quiet]
 * 退出码：0 = 全部逐条对上；1 = 有对不上的（打印明细）。
 */
'use strict';
const fs = require('fs');

const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const at = raw.indexOf('\nJSON:\n');
const text = raw.slice(0, at);
const json = JSON.parse(raw.slice(at + 7, raw.lastIndexOf('\n\n✅ ')));
const ct = json.coverageTargets;
const lines = text.split('\n');
const fails = [];
const oks = [];
const ok = (id, detail) => oks.push(`${id}: ${detail}`);
const bad = (id, detail) => fails.push(`${id}: ${detail}`);
const lineWith = needle => lines.find(l => l.includes(needle));
const numIn = (line, re) => {
  if (!line) return null;
  const m = line.match(re);
  return m ? Number(m[1]) : null;
};

/* ---------- 四节标题 ---------- */
for (const [id, needle] of [
  ['section.releaseEvidence', 'Release Evidence Coverage（v3 新增'],
  ['section.releaseEvidenceQueue', 'Model Release Evidence Queue（v3 新增'],
  ['section.gapClosureQueue', 'Gap Closure Queue（v3 新增'],
  ['section.sourceReliability', 'Source Reliability summary（v3 新增']
]) {
  lineWith(needle) ? ok(id, '文本标题在位') : bad(id, '文本里找不到这个标题');
}

/* ---------- ① Release Evidence Coverage ---------- */
const re = ct.releaseEvidence;
const lRegistry = lineWith('registry 模型数');
const lKnown = lineWith('已知 official release date');
const lUnknown = lineWith('未知 official release date');
const lWithEvidence = lineWith('带 releaseEvidence 引文');
const v1 = numIn(lRegistry, /registry 模型数\s+(\d+)/);
const v2 = numIn(lKnown, /已知 official release date\s+(\d+)/);
const v3 = numIn(lUnknown, /未知 official release date\s+(\d+)/);
const v4 = numIn(lWithEvidence, /带 releaseEvidence 引文\s+(\d+)/);
v1 === re.registryModels ? ok('re.registry', `${v1}`) : bad('re.registry', `文本 ${v1} ≠ JSON ${re.registryModels}`);
v2 === re.known ? ok('re.known', `${v2}`) : bad('re.known', `文本 ${v2} ≠ JSON ${re.known}`);
v3 === re.unknown ? ok('re.unknown', `${v3}`) : bad('re.unknown', `文本 ${v3} ≠ JSON ${re.unknown}`);
v4 === re.withReleaseEvidence ? ok('re.withEvidence', `${v4}`) : bad('re.withEvidence', `文本 ${v4} ≠ JSON ${re.withReleaseEvidence}`);
const pctInLine = lKnown && lKnown.match(/= ([\d.]+)%/);
const pct = pctInLine ? Number(pctInLine[1]) : null;
pct === re.knownPercent ? ok('re.knownPercent', `${pct}`) : bad('re.knownPercent', `文本 ${pct} ≠ JSON ${re.knownPercent}`);

// 三个维度的档位行：文本 "  key   共  N · 已知  K · 未知  U · 已知率 P%"（数字右对齐、可能多空格）
const bucketLineRe = /^\s{4,}(.+?)\s+共\s+(\d+) · 已知\s+(\d+) · 未知\s+(\d+) · 已知率\s+(\(空\)|[\d.]+%)\s*$/;
for (const [label, list, key] of [
  ['developer', re.byDeveloper, 'developer'],
  ['modelRole', re.byModelRole, 'modelRole'],
  ['catalogStatus', re.byCatalogStatus, 'catalogStatus']
]) {
  if (!Array.isArray(list)) { bad(`re.buckets.${label}`, 'JSON 里该维度不是数组'); continue; }
  // 在文本里按出现顺序抓出紧跟在 "<label> 拆分" 之后的档位行
  const head = lines.findIndex(l => l.includes(`${label} 拆分`));
  if (head < 0) { bad(`re.buckets.${label}`, '文本里找不到该维度的拆分标题'); continue; }
  const got = [];
  for (let i = head + 1; i < lines.length; i += 1) {
    const m = lines[i].match(bucketLineRe);
    if (!m) break;
    got.push({ key: m[1].trim(), total: Number(m[2]), known: Number(m[3]), unknown: Number(m[4]), pct: m[5] });
  }
  const jsonRows = list.map(b => ({
    key: String(b.key), total: b.total, known: b.known, unknown: b.unknown,
    pct: b.knownPercent === null ? '(空)' : `${b.knownPercent}%`
  }));
  if (JSON.stringify(got) === JSON.stringify(jsonRows)) ok(`re.buckets.${label}`, `${got.length} 档逐档一致（key/total/known/unknown/百分比）`);
  else bad(`re.buckets.${label}`, `文本=${JSON.stringify(got)} JSON=${JSON.stringify(jsonRows)}`);
  // 每档三数自洽
  for (const r of jsonRows) {
    if (r.total !== r.known + r.unknown) bad(`re.buckets.${label}.${r.key}`, `total ${r.total} ≠ known ${r.known} + unknown ${r.unknown}`);
  }
}

/* ---------- ② Release Evidence Queue ---------- */
const q = ct.releaseEvidenceQueue;
const lQueue = lineWith('队列共');
const qt = numIn(lQueue, /队列共 (\d+) 条/);
const qu = numIn(lQueue, /未知发布日期 (\d+) 条/);
const qk = numIn(lQueue, /已知 (\d+) 条/);
const ql = numIn(lQueue, /前 (\d+) 条/);
qt === q.total ? ok('q.total', `${qt}`) : bad('q.total', `文本 ${qt} ≠ JSON ${q.total}`);
qu === q.unknownCount ? ok('q.unknown', `${qu}`) : bad('q.unknown', `文本 ${qu} ≠ JSON ${q.unknownCount}`);
qk === q.knownCount ? ok('q.known', `${qk}`) : bad('q.known', `文本 ${qk} ≠ JSON ${q.knownCount}`);
ql === q.limit ? ok('q.limit', `${ql}`) : bad('q.limit', `文本 ${ql} ≠ JSON ${q.limit}`);
if (q.queue.length !== q.limit) bad('q.queueLen', `JSON 队列 ${q.queue.length} ≠ limit ${q.limit}`);
else ok('q.queueLen', `queue.length == limit == ${q.limit}`);
// 规则原文：每条 JSON rule 必须逐字出现在文本里
for (const [i, rule] of q.rules.entries()) {
  text.includes(rule) ? ok(`q.rule${i + 1}`, '规则原文逐字在文本里') : bad(`q.rule${i + 1}`, '规则原文在文本里找不到（文本/JSON 不同源）');
}
// 打印出来的 15 条：rank + slug + 未知 + 组大小 + tier + 下游引用
const printed = [];
const qHead = lines.findIndex(l => l.includes('前 N 条'));
for (let i = qHead + 1; i < lines.length; i += 1) {
  const m = lines[i].match(/^\s+(\d+)\.\s+(\S+)\s+releasedAt=(\S+)\s+组\s+(\d+)（(.+?)）\s+tier=(\S+)\s+下游引用=(\S+)\s*$/);
  if (!m) break;
  printed.push({ rank: Number(m[1]), slug: m[2], unknown: m[3], groupSize: Number(m[4]), group: m[5], tier: m[6], ref: m[7] });
}
if (printed.length !== q.queue.length) bad('q.printed', `文本打印 ${printed.length} 条 ≠ JSON ${q.queue.length} 条`);
else {
  let diff = 0;
  q.queue.forEach((row, i) => {
    const p = printed[i];
    const want = {
      rank: row.rank, slug: row.slug,
      // 文本对"未知"印字面「未知」，对"已知"印**盘上那个日期本身**（2025-08-11）—— 这正是同源：
      // JSON 里 releasedAt 与 releasedAtUnknown 两个字段合起来决定文本这一个字段。
      unknown: row.releasedAtUnknown ? '未知' : (row.releasedAt === null || row.releasedAt === undefined ? '(空)' : String(row.releasedAt)),
      groupSize: row.groupSize, group: row.groupLabel, tier: row.tier,
      ref: row.referenced ? '是' : '否'
    };
    if (JSON.stringify(p) !== JSON.stringify(want)) {
      diff += 1;
      if (diff <= 3) bad(`q.row${i + 1}`, `文本=${JSON.stringify(p)} JSON=${JSON.stringify(want)}`);
    }
  });
  diff === 0 ? ok('q.printed', `${printed.length} 条逐条一致`) : bad('q.printed', `共 ${diff} 条不一致`);
}
// 队列规则顺序必须与 JSON 数组顺序一致（文本里 rule1 出现在 rule2 之前）
const positions = q.rules.map(r => text.indexOf(r));
const ordered = positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]));
ordered ? ok('q.ruleOrder', '规则原文按 JSON 顺序出现') : bad('q.ruleOrder', `规则文本位置 ${JSON.stringify(positions)} 不是升序`);

/* ---------- ③ Gap Closure Queue ---------- */
const g = ct.gapClosureQueue;
const lGap = lineWith('队列共 18 条') || lines.find(l => /队列共\s+\d+\s+条：A\s+\d+ · B/.test(l));
const gt = numIn(lGap, /队列共 (\d+) 条/);
const gA = lGap && Number((lGap.match(/A\s+(\d+)/) || [])[1]);
const gB = lGap && Number((lGap.match(/B\s+(\d+)/) || [])[1]);
const gC = lGap && Number((lGap.match(/C\s+(\d+)/) || [])[1]);
const gD = lGap && Number((lGap.match(/D\s+(\d+)/) || [])[1]);
gt === g.total ? ok('g.total', `${gt}`) : bad('g.total', `文本 ${gt} ≠ JSON ${g.total}`);
for (const [k, v] of [['A', gA], ['B', gB], ['C', gC], ['D', gD]]) {
  v === g.counts[k] ? ok(`g.counts.${k}`, `${v}`) : bad(`g.counts.${k}`, `文本 ${v} ≠ JSON ${g.counts[k]}`);
}
for (const [i, rule] of g.rules.entries()) {
  text.includes(rule) ? ok(`g.rule${i + 1}`, '分层规则原文逐字在文本里') : bad(`g.rule${i + 1}`, '分层规则原文在文本里找不到');
}
const gPrinted = [];
const gHead = lines.findIndex(l => l.includes('逐条（目标 N / 已兑现 M / 缺 K / 出口状态）'));
// 每条缺口行后面还跟一行"派生理由"（不匹配行），所以这里**跳过**不匹配的行继续找，
// 直到收齐 JSON 队列的条数或撞到下一节标题（── 开头）。
for (let i = gHead + 1; i < lines.length && gPrinted.length < g.queue.length; i += 1) {
  const m = lines[i].match(/^\s+\[(\w)\] (\S+)\s+(.+?)\s+(\S+)\s+(.+?)：目标 (\d+) \/ 已兑现 (\d+) \/ 缺 (\d+) · 盘上记录 (\d+) · 出口状态 (\S+)\s*$/);
  if (!m) {
    if (/^\s*──/.test(lines[i])) break;
    continue;
  }
  gPrinted.push({ priority: m[1], provider: m[2], tier: m[4], dimensionLabel: m[5], targetN: Number(m[6]), coveredM: Number(m[7]), missingK: Number(m[8]), present: Number(m[9]), exit: m[10] });
}
if (gPrinted.length !== g.queue.length) bad('g.printed', `文本打印 ${gPrinted.length} 条 ≠ JSON ${g.queue.length} 条`);
else {
  let diff = 0;
  g.queue.forEach((row, i) => {
    const p = gPrinted[i];
    const want = { priority: row.priority, provider: row.provider, tier: row.tier, dimensionLabel: row.dimensionLabel, targetN: row.targetN, coveredM: row.coveredM, missingK: row.missingK, present: row.present, exit: row.exitState };
    if (JSON.stringify(p) !== JSON.stringify(want)) {
      diff += 1;
      if (diff <= 3) bad(`g.row${i + 1}`, `文本=${JSON.stringify(p)} JSON=${JSON.stringify(want)}`);
    }
  });
  diff === 0 ? ok('g.printed', `${gPrinted.length} 条逐条一致（priority/provider/tier/N/M/K/盘上记录/出口状态）`) : bad('g.printed', `共 ${diff} 条不一致`);
}
// JSON 内部自洽：每条 K == N − M、M ≤ N、priority 属于 A-D、出口状态 == state
for (const [i, row] of g.queue.entries()) {
  if (row.missingK !== row.targetN - row.coveredM) bad(`g.self${i + 1}`, `K ${row.missingK} ≠ N ${row.targetN} − M ${row.coveredM}`);
  if (row.coveredM > row.targetN) bad(`g.self${i + 1}`, `M ${row.coveredM} > N ${row.targetN}`);
  if (!['A', 'B', 'C', 'D'].includes(row.priority)) bad(`g.self${i + 1}`, `priority ${row.priority} 不在 A-D`);
  if (row.exitState !== row.state) bad(`g.self${i + 1}`, `exitState ${row.exitState} ≠ state ${row.state}`);
}

/* ---------- ④ Source Reliability ---------- */
const s = ct.sourceReliability;
const lHearth = lineWith('心跳：scripts/data/source-health.json');
const lHearthDate = lines[lines.indexOf(lHearth) + 1] || '';
const gaBack = lHearth && lHearth.includes(s.healthGeneratedAt === null ? '(文件里没有 generatedAt)' : String(s.healthGeneratedAt));
gaBack ? ok('s.generatedAt', `${s.healthGeneratedAt} 逐字在文本里`) : bad('s.generatedAt', `文本行「${lHearth}」不含 JSON 的 ${s.healthGeneratedAt}`);
const lFile = lineWith('裁决表：scripts/data/source-rulings.json');
if (s.notLanded) {
  lFile && lFile.includes('尚未落盘') ? ok('s.notLanded', '文本如实说「尚未落盘」') : bad('s.notLanded', `文本「${lFile}」没说尚未落盘`);
  lineWith('未落盘 ≠ 通过') ? ok('s.notLandedNote', '文本带「未落盘 ≠ 通过」口径') : bad('s.notLandedNote', '文本缺这句口径');
  lines.some(l => l.includes('报告自检待落盘层')) ? ok('s.pendingLine', '文本有「报告自检待落盘层」行') : bad('s.pendingLine', '文本缺待落盘层行');
} else {
  lFile && lFile.includes(`reviewedAt=${s.reviewedAt === null ? '(未写)' : s.reviewedAt}`) ? ok('s.reviewedAt', `${s.reviewedAt}`) : bad('s.reviewedAt', `文本「${lFile}」≠ JSON reviewedAt ${s.reviewedAt}`);
  const lDecision = lineWith('裁决分布：');
  const dist = s.decisionOrder.map(d => `${d}=${s.decisionCounts[d]}`).join(' · ');
  lDecision && lDecision.includes(dist) ? ok('s.decisionCounts', dist) : bad('s.decisionCounts', `文本「${lDecision}」≠ JSON ${dist}`);
}
const lReg = lineWith('注册表：scripts/collectors');
lReg && lReg.includes(`共 ${s.collectorRegistryCount} 行`) ? ok('s.collectorCount', `${s.collectorRegistryCount}`) : bad('s.collectorCount', `文本「${lReg}」≠ JSON ${s.collectorRegistryCount}`);
lReg && lReg.includes(`共 ${s.registryRowCount} 行`) ? ok('s.healthRowCount', `${s.registryRowCount}`) : bad('s.healthRowCount', `文本「${lReg}」≠ JSON ${s.registryRowCount}`);
const reconLines = {
  retireStillRegistered: lineWith('retire 的来源仍在注册表：'),
  missingRulingsForFailures: lineWith('次却没有裁决：'),
  repairOrMigrateUnregistered: lineWith('却不在注册表：'),
  unresolvedSources: lineWith('命不中任何身份：')
};
if (s.notLanded) {
  // 未落盘时这四行**本来就该缺席**（没有裁决就没有对账结果）。缺席 = 一致；
  // 真正要防的是"没落盘却印出 0 条问题"那种假绿 —— 下面显式检查它们不在文本里。
  const present = Object.entries(reconLines).filter(([, line]) => line).map(([k]) => k);
  present.length === 0 ? ok('s.recon.absentWhenNotLanded', '未落盘时对账四行如实缺席（没有"0 处问题"的假绿）')
    : bad('s.recon.absentWhenNotLanded', `未落盘却印了对账行：${present.join(',')}`);
  lineWith('对账问题合计：') ? bad('s.recon.problemAbsent', '未落盘却印了「对账问题合计」行') : ok('s.recon.problemAbsent', '未落盘时不印「对账问题合计」');
  lineWith('还没裁决的注册表行') ? bad('s.recon.unruledAbsent', '未落盘却印了「还没裁决的注册表行」') : ok('s.recon.unruledAbsent', '未落盘时不印缺口清单');
} else {
  for (const [key, line] of Object.entries(reconLines)) {
    const want = s.reconciliation[key].length;
    const got = numIn(line, /：(\d+) 条/);
    got === want ? ok(`s.recon.${key}`, `${got}`) : bad(`s.recon.${key}`, `文本 ${got} ≠ JSON ${want}`);
  }
  const lProblem = lineWith('对账问题合计：');
  const gotProblem = numIn(lProblem, /对账问题合计：(\d+) 处/);
  gotProblem === s.reconciliation.problemCount ? ok('s.recon.problemCount', `${gotProblem}`) : bad('s.recon.problemCount', `文本 ${gotProblem} ≠ JSON ${s.reconciliation.problemCount}`);
  const lUnruled = lineWith('还没裁决的注册表行');
  lUnruled && lUnruled.includes(s.reconciliation.unruledRegistrySources.join(' / ')) ? ok('s.recon.unruled', `${s.reconciliation.unruledRegistrySources.length} 个逐字一致`) : bad('s.recon.unruled', `文本「${lUnruled}」≠ JSON ${JSON.stringify(s.reconciliation.unruledRegistrySources)}`);
}

/* ---------- 汇总 ---------- */
console.log(`文本↔JSON 同源核对：${oks.length} 条通过 / ${fails.length} 条失败  （文件 ${file}）`);
if (fails.length) {
  for (const f of fails) console.log(`  ✗ ${f}`);
}
if (!process.argv.includes('--quiet')) {
  for (const o of oks) console.log(`  ✓ ${o}`);
}
process.exit(fails.length ? 1 : 0);
