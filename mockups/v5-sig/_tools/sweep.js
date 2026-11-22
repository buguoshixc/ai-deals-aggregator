'use strict';
/** 宽度逐档实测：溢出 / 数字裁切 / 卡高 / 首屏卡数 / 档位图例方块。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const OUT = path.resolve(__dirname, '..');
const URL_ = 'http://127.0.0.1:8081/mockups/v5-sig/home-light.html';
const WIDTHS = [1920, 1440, 1280, 1180, 1100, 941, 820, 760, 560, 390, 360, 320];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const results = [];
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL_, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const rect = el => { const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
      const cards = [...document.querySelectorAll('#dealsList article.g')];
      const fully = cards.filter(el => { const r = el.getBoundingClientRect(); return r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5; }).length;
      const needClip = [...document.querySelectorAll('.need-card')].filter(card => {
        const copy = card.querySelector('.need-copy'); const b = card.querySelector('.stat'); if (!copy || !b) return true;
        const cr = card.getBoundingClientRect(), br = b.getBoundingClientRect();
        return copy.scrollWidth > copy.clientWidth + 1 || br.bottom > cr.bottom + 0.5 || br.right > cr.right + 0.5 || br.height < 20;
      }).length;
      const tierClip = [...document.querySelectorAll('.tierhead')].filter(th => {
        const st = th.querySelector('.stat'); if (!st) return true;
        const tr = th.getBoundingClientRect(), sr = st.getBoundingClientRect();
        return sr.right > tr.right + 0.5 || sr.height < 20 || window.getComputedStyle(st).display === 'none';
      }).length;
      const jump = [...document.querySelectorAll('.jump a')].map(a => { const r = rect(a); const jn = a.querySelector('.jn'); return { r, jn: jn ? rect(jn) : null, txt: a.textContent.trim() }; });
      const jumpOverflow = jump.filter(j => j.r.right > innerWidth + 0.5 || j.jn && (j.jn.right > j.r.right + 0.5)).length;
      const statOverflow = [...document.querySelectorAll('.stat')].filter(el => el.scrollWidth > el.clientWidth + 1).length;
      return {
        viewportW: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth - innerWidth,
        cards: cards.length, fullyVisible: fully,
        gridTop: +document.querySelector('#dealsList').getBoundingClientRect().top.toFixed(1),
        needH: +document.querySelector('.need-card').getBoundingClientRect().height.toFixed(1),
        needClip, tierClip, statOverflow, jumpOverflow, jump,
        tierheadH: +document.querySelector('.tierhead').getBoundingClientRect().height.toFixed(1),
        jumpRowH: +document.querySelector('.jump').getBoundingClientRect().height.toFixed(1)
      };
    });
    results.push({ w, ...r });
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, '_data', 'width-sweep.json'), JSON.stringify({ url: URL_, measuredAt: new Date().toISOString(), results }, null, 2));
  console.log(results.map(r => `w=${r.w} overflow=${r.overflow} fully=${r.fullyVisible} gridTop=${r.gridTop} needH=${r.needH} needClip=${r.needClip} tierClip=${r.tierClip} statOverflow=${r.statOverflow} jumpOverflow=${r.jumpOverflow} jumpRowH=${r.jumpRowH} tierheadH=${r.tierheadH}`).join('\n'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
