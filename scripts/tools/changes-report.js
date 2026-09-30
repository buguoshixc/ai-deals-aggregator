#!/usr/bin/env node
/**
 * 变化雷达的人读报告（可复核用，不进 CI）。
 *
 *   node scripts/tools/changes-report.js            # 人读
 *   node scripts/tools/changes-report.js --json     # 机器可读（与 buildRadar 的返回同构）
 *
 * 用途：回答「这一屏上的每一条为什么会出现在这里」。调规则、写报告、复核线上时都看它 ——
 * 与 `report:tier` / `report:vendor` / `audience-report` 同一类工具：**判据必须能被外部复核**。
 *
 * 它只读 `deals.json` 与 `scripts/data/deal-history.json`，不写盘、不联网。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const changes = require('../lib/changes');
const history = require('../lib/history');

const JSON_OUT = process.argv.includes('--json');

function main() {
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const deals = Array.isArray(payload.deals) ? payload.deals : [];
  const loaded = history.load();
  const asOf = String(payload.updatedAt || '').slice(0, 10);
  const availability = loaded.missing || loaded.broken ? 'unavailable' : 'ok';

  const radar = changes.buildRadar({ deals, store: loaded.store, asOf, availability });
  const summary = changes.summarize(radar);

  if (JSON_OUT) {
    console.log(JSON.stringify({ summary, radar }, null, 2));
    return;
  }

  console.log('=== 变化雷达（v1.5）===');
  console.log(`基准日        : ${radar.asOf || '未知'}（= deals.json 的 updatedAt 日期，不是构建时刻）`);
  console.log(`历史起算日    : ${radar.startedAt || '未知'}`);
  console.log(`历史日志      : ${loaded.missing ? '缺失' : loaded.broken ? `损坏（${loaded.broken}）` : '可用'}`);
  console.log(`窗口          : 最近 ${radar.windows.recentDays} 天变化 · 已结束/重新出现 ${radar.windows.endedDays} 天 · 即将结束前瞻 ${radar.windows.soonDays} 天`);
  console.log(`截止日期覆盖  : ${radar.coverage.dealsWithExpiresAt}/${radar.coverage.dealsTotal} 条优惠写了 expiresAt`);
  console.log('');
  for (const key of changes.SECTION_ORDER) {
    const section = radar.sections[key];
    console.log(`【${changes.CHANGES_WORDING.CHANGES_SECTION[key]}】共 ${radar.totals[key]} 条` +
      (section.truncated ? `（此处只显示 ${section.items.length} 条，另有 ${section.truncated} 条未显示）` : ''));
    if (!section.items.length) {
      console.log('    （空）');
    } else {
      for (const item of section.items) {
        const title = item.titled ? item.title : '（无标题快照）';
        const bits = [`${item.at}`, item.type];
        if (item.field) bits.push(item.field);
        if (item.kind === 'endingSoon') bits.push(`剩 ${item.daysLeft} 天`);
        if (item.type === 'ended') bits.push(item.reason || '');
        if (item.detail !== undefined) bits.push(String(item.detail));
        const diff = (item.type && item.field && !['created', 'ended', 'restored'].includes(item.type))
          ? `　${short(item.from)} → ${short(item.to)}`
          : '';
        console.log(`    ${item.linkable ? '↗' : '·'} [${bits.join(' · ')}] ${title}${diff}`);
      }
    }
  }
  console.log('');
  console.log(`【其他变化（不上首页）】共 ${radar.totals.other} 条` +
    `（元信息 ${radar.other.metadata.length} · 文案微调 ${radar.other.cosmetic.length}）`);
  for (const item of radar.other.metadata) {
    console.log(`    · [元信息] ${item.id} ${item.field}　${short(item.from)} → ${short(item.to)}`);
  }
  for (const item of radar.other.cosmetic) {
    console.log(`    · [文案微调] ${item.id} ${item.field}　（归一后相同：${short(item.from)}）`);
  }
  console.log('');
  console.log(`首页条带      : ${radar.home.items.length} 项` +
    (radar.home.items.length ? `（${radar.home.items.map(i => i.homeKind).join(' → ')}）` : '（空态：明说「当前没有观测到变化」）'));
  console.log(`可用性        : ${radar.availability === 'ok' ? '✅ 可用' : '⚠️ 不可用（页面说「没有拿到历史日志」，不说「没有变化」）'}`);
  console.log('');
  console.log('说明：分栏与窗口的判据只有一处实现（scripts/lib/changes.js 的 buildRadar），');
  console.log('      首页条带与 /changes/ 页读的就是上面这份结果。');
}

function short(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined || text === null) return '—';
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}

main();
