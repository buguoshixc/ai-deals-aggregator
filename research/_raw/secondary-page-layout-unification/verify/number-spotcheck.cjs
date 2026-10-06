#!/usr/bin/env node
/**
 * T4 报告数字抽查：把 T3 证据文件里的具体数字**独立复算**一遍，逐条给「一致 / 不一致」。
 *
 * 抽查对象是 T3（evidence-runner）落在 research/_raw/secondary-page-layout-unification/ 下的证据文件，
 * 不是它自报的结论 —— 每一条都从产物/真值/门禁声明现算。
 *
 * 用法：node number-spotcheck.cjs --out=…/verify/number-spotcheck.json
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = (() => {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('找不到仓库根');
})();
const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = path.resolve(ROOT, arg('out', path.join(__dirname, 'number-spotcheck.json')));
const RAW = 'research/_raw/secondary-page-layout-unification';
const readRaw = rel => fs.readFileSync(path.join(ROOT, rel));
const readJson = rel => JSON.parse(readRaw(rel).toString('utf8'));
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function walk(dir) {
  const files = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push({ rel: path.relative(dir, full).split(path.sep).join('/'), full, bytes: fs.statSync(full).size });
    }
  }
  return files;
}

const distFiles = walk(path.join(ROOT, 'dist'));
const baseFiles = walk(path.join(ROOT, 'dist.baseline'));
const isHtml = rel => /\.html?$/i.test(rel);
const truthRaw = readRaw(`${RAW}/geometry/truth-401.json`);
const truth = JSON.parse(truthRaw.toString('utf8'));
const gateSummary = readJson(`${RAW}/gate/steps/summary.json`);
const action = fs.readFileSync(path.join(ROOT, '.github/actions/gate/action.yml'), 'utf8');
const verifyJson = readJson(`${RAW}/verify/22c-baseline.json`);
const probeBefore = readJson(`${RAW}/verify/probe-before.json`);

const actionSteps = (action.match(/^ {4}- name: /gm) || []).length;
const skippedIndices = gateSummary.results.filter(item => item.status === 'skipped').map(item => item.index).sort((a, b) => a - b);
const sweep = verifyJson.metrics.layoutSweep;
const narrowKeysProbe = probeBefore.narrowSets['1440|strict|minOfBoth'];
const noteOf = (dirFiles, rel) => dirFiles.find(file => file.rel === rel);

const items = [
  {
    id: 'N01',
    claim: 'dist / dist.baseline：303 个文件 · 186 个 HTML · 117 个非 HTML',
    source: `${RAW}/build/02-dist-counts.txt · ${RAW}/baseline/README.txt`,
    recomputed: `dist ${distFiles.length}/${distFiles.filter(f => isHtml(f.rel)).length}/${distFiles.filter(f => !isHtml(f.rel)).length}`
      + ` · baseline ${baseFiles.length}/${baseFiles.filter(f => isHtml(f.rel)).length}/${baseFiles.filter(f => !isHtml(f.rel)).length}`,
    ok: distFiles.length === 303 && baseFiles.length === 303
      && distFiles.filter(f => isHtml(f.rel)).length === 186 && distFiles.filter(f => !isHtml(f.rel)).length === 117
      && baseFiles.filter(f => !isHtml(f.rel)).length === 117
  },
  {
    id: 'N02',
    claim: '非 HTML 文件逐个 sha256 相等：117/117',
    source: `${RAW}/diff/03-nonhtml-sha256.log`,
    recomputed: `${readJson(`${RAW}/verify/byte-compare.json`).nonHtml.equal}/${readJson(`${RAW}/verify/byte-compare.json`).nonHtml.compared}`,
    ok: readJson(`${RAW}/verify/byte-compare.json`).nonHtml.equal === 117
  },
  {
    id: 'N03',
    claim: 'HTML 页剥掉 <style> 后正文逐字节相同：186/186（正文字节差 0）',
    source: `${RAW}/diff/04-before-after-compare.log`,
    recomputed: `${readJson(`${RAW}/verify/byte-compare.json`).html.bodyEqual}/${readJson(`${RAW}/verify/byte-compare.json`).html.compared}`,
    ok: readJson(`${RAW}/verify/byte-compare.json`).html.bodyEqual === 186
  },
  {
    id: 'N04',
    claim: '样式块去重行集合差：+9 / −2',
    source: `${RAW}/diff/04-before-after-compare.log`,
    recomputed: `+${readJson(`${RAW}/verify/byte-compare.json`).html.styleOnlyInB.length} / −${readJson(`${RAW}/verify/byte-compare.json`).html.styleOnlyInA.length}`,
    ok: readJson(`${RAW}/verify/byte-compare.json`).html.styleOnlyInB.length === 9
      && readJson(`${RAW}/verify/byte-compare.json`).html.styleOnlyInA.length === 2
  },
  {
    id: 'N05',
    claim: 'dist 总字节 20012665',
    source: `${RAW}/build/02-dist-counts.txt · ${RAW}/gate/02-dist-manifest.log`,
    recomputed: String(distFiles.reduce((sum, file) => sum + file.bytes, 0)),
    ok: distFiles.reduce((sum, file) => sum + file.bytes, 0) === 20012665
  },
  {
    id: 'N06',
    claim: 'T1 的对比：added 0 · removed 0 · unchanged 117 · changed 186',
    source: `${RAW}/t1/13-dist-vs-baseline.txt`,
    recomputed: (() => {
      const compare = readJson(`${RAW}/verify/byte-compare.json`);
      return `added ${compare.fileSet.added.length} · removed ${compare.fileSet.removed.length}`
        + ` · unchanged ${compare.nonHtml.equal} · changed(HTML 非逐字节相同) ${compare.html.wholeFileDifferent}`;
    })(),
    ok: (() => {
      const compare = readJson(`${RAW}/verify/byte-compare.json`);
      return compare.fileSet.added.length === 0 && compare.fileSet.removed.length === 0
        && compare.nonHtml.equal === 117 && compare.html.wholeFileDifferent === 186;
    })()
  },
  {
    id: 'N07',
    claim: 'archive/index.html 字节 88769（改动前）→ 89677（改动后）',
    source: `${RAW}/t1/13-dist-vs-baseline.txt`,
    recomputed: `${noteOf(baseFiles, 'archive/index.html').bytes} → ${noteOf(distFiles, 'archive/index.html').bytes}`,
    ok: noteOf(baseFiles, 'archive/index.html').bytes === 88769 && noteOf(distFiles, 'archive/index.html').bytes === 89677
  },
  {
    id: 'N08',
    claim: '真值文件 sha256 = 46c28fa1…',
    source: `${RAW}/geometry/truth-401.json（T3 在 t4 契约里给的指纹）`,
    recomputed: sha256(truthRaw),
    ok: sha256(truthRaw).toLowerCase().startsWith('46c28fa1')
  },
  {
    id: 'N09',
    claim: '真值总数：说明 401 条 · 有说明的页面 105 · 改动前窄 156 条 · 改动后窄 0 条',
    source: `${RAW}/geometry/truth-401.json totals`,
    recomputed: `notes ${probeBefore.totals.notesAt1440} · pages ${probeBefore.totals.pagesWithNotes} · narrowBefore ${narrowKeysProbe.length} · narrowAfter ${readJson(`${RAW}/verify/probe-after.json`).narrowSets['1440|strict|minOfBoth'].length}`,
    ok: probeBefore.totals.notesAt1440 === 401 && probeBefore.totals.pagesWithNotes === 105
      && narrowKeysProbe.length === 156 && readJson(`${RAW}/verify/probe-after.json`).narrowSets['1440|strict|minOfBoth'].length === 0
      && truth.totals.notes === 401 && truth.totals.narrowBefore === 156 && truth.totals.narrowAfter === 0
  },
  {
    id: 'N10',
    claim: '真值分类：caughtByOldCriteria 48 · onlyNewTruth 108 · alreadyFine 245 · 窄说明所在页面 48',
    source: `${RAW}/geometry/truth-401.json totals`,
    recomputed: `caught ${truth.sets.caughtByOldCriteria.length} · onlyNew ${truth.sets.onlyNewTruth.length}`
      + ` · fine ${truth.sets.alreadyFine.length} · narrowPages ${probeBefore.totals.narrowPages1440}`,
    ok: truth.sets.caughtByOldCriteria.length === 48 && truth.sets.onlyNewTruth.length === 108
      && truth.sets.alreadyFine.length === 245 && probeBefore.totals.narrowPages1440 === 48
  },
  {
    id: 'N11',
    claim: '缺陷读数：改动前有字区域 452.81px（比例 0.33）→ 改动后 1380px（比例 1）',
    source: `${RAW}/geometry/truth-401.json sets.caughtByOldCriteria 首条 · T2/T6 报告`,
    recomputed: (() => {
      const before = probeBefore.pages.find(page => page.route === 'category/').notes1440[0];
      const after = readJson(`${RAW}/verify/probe-after.json`).pages.find(page => page.route === 'category/').notes1440[0];
      return `before box ${before.boxWidth} · textArea ${before.textAreaStrict} · ratio ${before.byDenominator.minOfBoth.ratioStrict}`
        + ` → after box ${after.boxWidth} · textArea ${after.textAreaStrict} · ratio ${after.byDenominator.minOfBoth.ratioStrict}`;
    })(),
    ok: (() => {
      const before = probeBefore.pages.find(page => page.route === 'category/').notes1440[0];
      const after = readJson(`${RAW}/verify/probe-after.json`).pages.find(page => page.route === 'category/').notes1440[0];
      return Math.abs(before.boxWidth - 452.81) < 0.01 && Math.abs(before.textAreaStrict - 453) < 0.01
        && after.boxWidth === 1380 && after.textAreaStrict === 1380;
    })()
  },
  {
    id: 'N12',
    claim: 'Full Gate：总步数 49 · 执行 45 · 通过 45 · 失败 0 · 跳过 4',
    source: `${RAW}/gate/steps/summary.json · ${RAW}/gate/01-static-run.txt`,
    recomputed: `action.yml 里 step 数 ${actionSteps} · summary.stepsInAction ${gateSummary.stepsInAction} · 执行 ${gateSummary.executed}`
      + ` · 通过 ${gateSummary.passed} · 失败 ${gateSummary.failed} · 跳过 ${gateSummary.skipped} · 跳过序号 [${skippedIndices.join(',')}]`,
    ok: actionSteps === 49 && gateSummary.stepsInAction === 49 && gateSummary.executed === 45
      && gateSummary.passed === 45 && gateSummary.failed === 0 && gateSummary.skipped === 4
      && skippedIndices.join(',') === '1,45,46,49'
  },
  {
    id: 'N13',
    claim: '§22c 在 dist.baseline 上的读数：判定 186 页 / 401 条 · 窄 156 条 · 窄页 48 · 溢出 0 · unclassified 0',
    source: `我自己的整轮实跑 ${RAW}/verify/22c-baseline-run.log（T3 侧同类读数见 gate/steps/48-regression-verify…）`,
    recomputed: `total ${sweep.total} · notesJudged ${sweep.notesJudged} · narrow ${sweep.narrowNotes} · narrowPages ${sweep.narrowNotePages}`
      + ` · overflow ${sweep.overflowPages} · unclassified ${sweep.unclassified} · assertions ${verifyJson.total} 失败 ${verifyJson.failed}`,
    ok: sweep.total === 186 && sweep.notesJudged === 401 && sweep.narrowNotes === 156 && sweep.narrowNotePages === 48
      && sweep.overflowPages === 0 && sweep.unclassified === 0 && verifyJson.failed > 0
  },
  {
    id: 'N14',
    claim: '产物里 .snote 规则「一处定义」：dist 每页内联样式里恰好 1 次（186 页）',
    source: `${RAW}/t1/11-no-other-snote-rules.txt · ${RAW}/t1/10-frozen-string-audit.txt`,
    recomputed: (() => {
      const frozen = verifyJson.metrics.layoutFrozenRule.anchor;
      let once = 0;
      let pages = 0;
      for (const file of distFiles) {
        if (!isHtml(file.rel)) continue;
        pages++;
        const text = fs.readFileSync(file.full, 'utf8');
        const count = text.split(frozen).length - 1;
        if (count === 1) once++;
      }
      return `dist 里 ${once}/${pages} 页恰好 1 次`;
    })(),
    ok: (() => {
      const frozen = verifyJson.metrics.layoutFrozenRule.anchor;
      let once = 0;
      let pages = 0;
      for (const file of distFiles) {
        if (!isHtml(file.rel)) continue;
        pages++;
        const count = fs.readFileSync(file.full, 'utf8').split(frozen).length - 1;
        if (count === 1) once++;
      }
      return once === 186 && pages === 186;
    })()
  }
];

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'T4 抽查 T3 证据文件里的具体数字（几何读数 / 页数 / ratio / 违规码 / gate 步数）',
  items,
  totals: { checked: items.length, consistent: items.filter(item => item.ok).length, inconsistent: items.filter(item => !item.ok).length }
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
for (const item of items) {
  console.log(`${item.ok ? '一致' : '不一致'} · ${item.id} · ${item.claim}`);
  console.log(`      来源 ${item.source}`);
  console.log(`      复算 ${item.recomputed}`);
}
console.log(`抽查 ${report.totals.checked} 条：一致 ${report.totals.consistent} · 不一致 ${report.totals.inconsistent}`);
console.log(`证据：${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
process.exit(report.totals.inconsistent === 0 ? 0 : 1);
