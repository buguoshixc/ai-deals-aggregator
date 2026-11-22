'use strict';
const {chromium}=require('playwright-core');
const BASE='http://127.0.0.1:8081/';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const [k,rel] of [['before','dist/index.html'],['after','mockups/v5-sig/home-390.html']]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light'});const page=await ctx.newPage();
  await page.route('**/*',r=>r.request().url().startsWith(BASE)?r.continue():r.abort());
  await page.goto(BASE+rel,{waitUntil:'load'});try{await page.waitForSelector('#dealsList article.g',{timeout:15000});}catch(e){} await page.waitForTimeout(800); await page.evaluate(()=>scrollTo(0,0));
  const d=await page.evaluate(()=>[...document.querySelectorAll('.tierhead')].map(el=>{
    const cs=getComputedStyle(el);const hint=el.querySelector('.hint');const line=el.querySelector('.line');const b=el.querySelector('b');const stat=el.querySelector('.stat');
    return {cls:el.className,h:+el.getBoundingClientRect().height.toFixed(2),w:+el.getBoundingClientRect().width.toFixed(2),
      display:cs.display,flexWrap:cs.flexWrap,alignItems:cs.alignItems,pad:cs.padding,margin:cs.margin,
      hint: hint?{display:getComputedStyle(hint).display,ws:getComputedStyle(hint).whiteSpace,h:+hint.getBoundingClientRect().height.toFixed(2),w:+hint.getBoundingClientRect().width.toFixed(2),minW:getComputedStyle(hint).minWidth,flex:getComputedStyle(hint).flex,text:hint.textContent.trim()}:null,
      b:b?{fs:getComputedStyle(b).fontSize,h:+b.getBoundingClientRect().height.toFixed(2),w:+b.getBoundingClientRect().width.toFixed(2)}:null,
      line:line?{h:+line.getBoundingClientRect().height.toFixed(2),w:+line.getBoundingClientRect().width.toFixed(2),minW:getComputedStyle(line).minWidth}:null,
      stat:stat?{fs:getComputedStyle(stat).fontSize,h:+stat.getBoundingClientRect().height.toFixed(2),display:getComputedStyle(stat).display}:null,
      scrollW:el.scrollWidth,clientW:el.clientWidth,
      html:el.outerHTML.replace(/\s+/g,' ').slice(0,500)};
  }));
  console.log('=== '+k+' ===');console.log(JSON.stringify(d,null,1));
  await ctx.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
