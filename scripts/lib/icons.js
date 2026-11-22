'use strict';
/**
 * 站内统一单色 SVG 图标（Phase 1：替代依赖系统字体的 emoji，避免 Linux / 精简字体环境下出现豆腐块 ☐）。
 *
 * 纯函数模块：不读盘、不联网、不看时间，符合 scripts/test/fitness.js 的全部约束。
 * 每个图标继承 `currentColor`、固定 viewBox="0 0 24 24"、带 `aria-hidden="true"`。
 */

const SVG_PATHS = {
  // 毕业帽（学生专享 / 学生筛选）
  'student-only': '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
  student: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
  // 校园/建筑（教育身份可领）
  'edu-identity': '<path d="M3 21h18"/><path d="M5 21V9l7-4 7 4v12"/><path d="M9 21v-5h6v5"/><path d="M9 12h.01M15 12h.01"/>',
  // 无信用卡（银行卡 + 斜线）
  'no-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="m3 3 18 18"/>',
  // 地球（国内可用）
  'china-usable': '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><path d="M12 3a13 13 0 0 0 0 18M12 3a13 13 0 0 1 0 18"/>',
  // 免费勾章（完全免费）
  'free-tier': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5.5"/>',
  // 闪电/接口（免费 API）
  'free-api': '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  // 礼物盒（免费 Tokens）
  'free-tokens': '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M12 8c-1.5-2.5-4.5-2.5-4.5-.5S10 8 12 8Zm0 0c1.5-2.5 4.5-2.5 4.5-.5S14 8 12 8Z"/>',
  // 终端/代码（AI Coding / 开发者）
  'ai-coding': '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  developer: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  // CPU/模型芯片（免费模型）
  'free-model': '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
  // 硬币/额度（开发者 Credits）
  'dev-credits': '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c0-1.1-1.1-2-2.5-2s-2.5.9-2.5 2 1 1.7 2.5 2 2.5.9 2.5 2-1.1 2-2.5 2-2.5-.9-2.5-2"/><path d="M12 6v1.5M12 16.5V18"/>'
};

/**
 * 返回给定 key 对应的内联单色 SVG 字符串；未知 key 返回空串（调用方决定兜底）。
 * @param {string} key
 * @param {{ size?: number, className?: string }} [opts]
 */
function iconSvg(key, opts = {}) {
  const paths = SVG_PATHS[String(key || '')];
  if (!paths) return '';
  const size = Number(opts.size) || 16;
  const cls = opts.className ? ` class="${opts.className}"` : '';
  return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

module.exports = {
  SVG_PATHS,
  iconSvg
};
