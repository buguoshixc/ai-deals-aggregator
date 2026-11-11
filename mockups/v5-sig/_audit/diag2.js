'use strict';
const fs=require('fs'),path=require('path');const {chromium}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../../..');const BASE='http://127.0.0.1:8081/';
async function mk(browser,w,h,cs='light'){const ctx=await browser.newContext({viewport:{width:w,height:h},colorScheme:cs,deviceScaleFactor:1});const page=await ctx.newPage();await page.route('**/*',r=>{if(!r.request().url().startsWith(BASE))return r.abort();return r.continue();});return {ctx,page};}
async function go(page,rel,waitJs){await page.goto(BASE+rel,{waitUntil:'load',timeout:45000});if(waitJs){try{await page.waitForSelector('#dealsList article.g',{timeout:15000});}catch(e){}try{await page.waitForLoadState('networkidle',{timeout:8000});}catch(e){}await page.waitForTimeout(700);}else{await page.waitForTimeout(300);}await page.evaluate(()=>scrollTo(0,0));}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const out={};
 // 1) header / footer 结构差异（home-light vs family）
 for(const [k,rel] of [['home','mockups/v5-sig/home-light.html'],['family','mockups/v5-sig/family.html']]){
   const {ctx,page}=await mk(browser,1440,900);await go(page,rel);
   out[k]=await page.evaluate(()=>({
     header:(()=>{const h=document.querySelector('header.top');return h?h.outerHTML.replace(/\s+/g,' ').replace(/>\s+</g,'><').trim():null})(),
     footer:(()=>{const f=document.querySelector('footer');return f?f.outerHTML.replace(/\s+/g,' ').replace(/>\s+</g,'><').trim():null})(),
     headerClasses:[...document.querySelectorAll('header.top *')].map(e=>e.tagName+'.'+String(e.className)).slice(0,40),
     footerText:document.querySelector('footer')?document.querySelector('footer').innerText.replace(/\s+/g,' ').trim():null,
     headerText:document.querySelector('header.top')?document.querySelector('header.top').innerText.replace(/\s+/g,' ').trim():null
   }));
   await ctx.close();
 }
 // 2) 390 grid 高度差诊断 + footer 文本差
 for(const [k,rel] of [['before','dist/index.html'],['after','mockups/v5-sig/home-390.html']]){
   const {ctx,page}=await mk(browser,390,844);await go(page,rel,true);
   out['g390_'+k]=await page.evaluate(()=>{
     const g=document.querySelector('#dealsList');
     const kids=[...g.children];
     const cards=[...g.querySelectorAll('article.g')];
     const tiers=[...g.querySelectorAll('.tierhead')];
     const cs=getComputedStyle(g);
     return {
       gridH:+g.getBoundingClientRect().height.toFixed(2), gridTop:+g.getBoundingClientRect().top.toFixed(2),
       rowGap:cs.rowGap, columnGap:cs.columnGap, display:cs.display, gridTemplateColumns:cs.gridTemplateColumns,
       childCount:kids.length, kinds:kids.reduce((m,e)=>{const k=e.tagName+'.'+String(e.className).split(' ')[0];m[k]=(m[k]||0)+1;return m;},{}),
       cardCount:cards.length, cardSum:+cards.reduce((s,e)=>s+e.getBoundingClientRect().height,0).toFixed(2),
       tierCount:tiers.length, tierSum:+tiers.reduce((s,e)=>s+e.getBoundingClientRect().height,0).toFixed(2),
       tierTops:tiers.map(e=>+e.getBoundingClientRect().top.toFixed(2)),
       lastCardBottom:+cards[cards.length-1].getBoundingClientRect().bottom.toFixed(2),
       footerText:document.querySelector('footer').innerText.replace(/\s+/g,' ').trim(),
       footerHTML:document.querySelector('footer').outerHTML.replace(/\s+/g,' ').replace(/>\s+</g,'><').trim()
     };
   });
   await ctx.close();
 }
 fs.writeFileSync(path.join(__dirname,'diag2.json'),JSON.stringify(out,null,2));
 // 打印 header diff 摘要
 const h1=out.home.header,h2=out.family.header;
 console.log('HEADER home len',h1.length,'family len',h2.length);
 console.log('HEADER home:',h1.slice(0,1400));
 console.log('HEADER family:',h2.slice(0,1200));
 console.log('\nFOOTER home:',out.home.footer.slice(0,1200));
 console.log('FOOTER family:',out.family.footer.slice(0,1300));
 console.log('\nfooterText home:',out.home.footerText);
 console.log('footerText family:',out.family.footerText);
 console.log('\nheaderText home:',out.home.headerText);
 console.log('headerText family:',out.family.headerText);
 console.log('\n390 grid before:',JSON.stringify({...out.g390_before,footerText:undefined,footerHTML:undefined},null,1));
 console.log('\n390 grid after:',JSON.stringify({...out.g390_after,footerText:undefined,footerHTML:undefined},null,1));
 console.log('\n390 footer text before:',out.g390_before.footerText);
 console.log('390 footer text after :',out.g390_after.footerText);
 await browser.close();
})().catch(e=>{console.error('DIAG2 FAIL',e);process.exit(1);});
