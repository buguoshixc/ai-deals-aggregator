'use strict';
/* 25% 缩略图的 4x 像素化局部放大（证据图）：viewport 360x225 + dpr4 = 1440x900 输出 */
const path=require('path');const {chromium}=require('playwright-core');
const AUD=__dirname;const BASE='http://127.0.0.1:8081/';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await browser.newContext({viewport:{width:360,height:225},deviceScaleFactor:4});
 const page=await ctx.newPage();
 await page.route('**/*',r=>r.request().url().startsWith(BASE)?r.continue():r.abort());
 await page.setContent(`<body style="margin:0;background:#fff"><img id="im" src="${BASE}mockups/v5-sig/shots/home-25pct.png" style="display:block;width:360px;height:225px;image-rendering:pixelated"></body>`);
 await page.waitForFunction(()=>{const i=document.getElementById('im');return i&&i.complete&&i.naturalWidth>0;});
 await page.waitForTimeout(150);
 // CSS 坐标 = 25% 缩略图坐标；need 卡在 thumbnail y≈27.5–64.5，图例/分带在 y≈75–95
 await page.screenshot({path:path.join(AUD,'thumb-zoom-need.png'),clip:{x:0,y:25,width:360,height:42}});
 await page.screenshot({path:path.join(AUD,'thumb-zoom-legend.png'),clip:{x:0,y:75,width:360,height:14}});
 await ctx.close();await browser.close();
 console.log('zoom screenshots written');
})().catch(e=>{console.error(e);process.exit(1);});
