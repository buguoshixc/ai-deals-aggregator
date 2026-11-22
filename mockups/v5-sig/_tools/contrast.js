'use strict';
/** WCAG 2.x relative luminance / contrast ratio helper (sRGB). */
function parse(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255);
}
function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) { const [r, g, b] = parse(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function ratio(a, b) { const l1 = lum(a), l2 = lum(b); const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); }
const r2 = n => Math.round(n * 100) / 100;

const LIGHT = { bg: '#f6f7f9', card: '#ffffff', ink: '#0f172a' };
const DARK = { bg: '#0b0d10', card: '#14171c', ink: '#e8ecf2' };

const palettes = {
  light: {
    t1: '#0b7a44', t2: '#1d4ed8', t3: '#155e75', t4: '#92400e', t5: '#475569',
    on: { t1: '#ffffff', t2: '#ffffff', t3: '#ffffff', t4: '#ffffff', t5: '#ffffff' }
  },
  dark: {
    t1: '#4ade80', t2: '#60a5fa', t3: '#22d3ee', t4: '#fbbf24', t5: '#94a3b8',
    on: { t1: '#0b0d10', t2: '#0b0d10', t3: '#0b0d10', t4: '#0b0d10', t5: '#0b0d10' }
  }
};

const out = { palettes, results: {} };
for (const [theme, p] of Object.entries(palettes)) {
  const base = theme === 'light' ? LIGHT : DARK;
  out.results[theme] = {};
  for (const k of ['t1', 't2', 't3', 't4', 't5']) {
    out.results[theme][k] = {
      hex: p[k],
      textOnCard: r2(ratio(p[k], base.card)),
      textOnBg: r2(ratio(p[k], base.bg)),
      blockVsCard: r2(ratio(p[k], base.card)),
      blockVsBg: r2(ratio(p[k], base.bg)),
      onColor: p.on[k],
      onColorVsBlock: r2(ratio(p.on[k], p[k]))
    };
  }
  out.results[theme].brandVsCard = r2(ratio(theme === 'light' ? '#3b5bfd' : '#7c93ff', base.card));
}

// amber candidates for light text use
const amberCandidates = ['#b45309', '#a34d09', '#92400e', '#8a3f0a'];
out.amber = amberCandidates.map(hex => ({ hex, vsWhite: r2(ratio(hex, '#ffffff')), vsBg: r2(ratio(hex, '#f6f7f9')), whiteOnIt: r2(ratio('#ffffff', hex)) }));
const cyanCandidates = ['#0e7490', '#155e75', '#0f766e', '#0891b2'];
out.cyan = cyanCandidates.map(hex => ({ hex, vsWhite: r2(ratio(hex, '#ffffff')), vsBg: r2(ratio(hex, '#f6f7f9')) }));
const greenCandidates = ['#0b7a44', '#0e7a4e', '#15803d', '#0f9d58'];
out.green = greenCandidates.map(hex => ({ hex, vsWhite: r2(ratio(hex, '#ffffff')), vsBg: r2(ratio(hex, '#f6f7f9')) }));
console.log(JSON.stringify(out, null, 2));
