'use strict';
const fs=require('fs'),path=require('path');const {chromium}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../../..');const BASE='http://127.0.0.1:8081/';
async function mk(browser,w,h,cs='light'){const ctx=await browser.newContext({viewport:{width:w,height:h},colorScheme:cs,deviceScaleFactor:1});const page=await ctx.newPage();await page.route('**/*',r=>r.request().url().startsWith(BASE)?r.continue():r.abort());return {ctx,page};}
async function go(page,rel,waitJs){await page.goto(BASE+rel,{waitUntil:'load',timeout:45000});if(waitJs){try{await page.waitForSelector('#dealsList article.g',{timeout:15000});}catch(e){}await page.waitForTimeout(800);}else{await page.waitForTimeout(300);}await page.evaluate(()=>scrollTo(0,0));}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const out={};
 // theme script equality
 const bs=fs.readFileSync(path.join(ROOT,'dist/index.html'),'utf8');
 const themeRe=/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/;
 const themeDist=(bs.match(themeRe)||[])[0];
 const fam=fs.readFileSync(path.join(ROOT,'mockups/v5-sig/family.html'),'utf8');
 const home=fs.readFileSync(path.join(ROOT,'mockups/v5-sig/home-light.html'),'utf8');
 const themeOf=h=>(h.match(themeRe)||[])[0];
 out.themeScript={distLen:themeDist?themeDist.length:null,homeEqual:themeOf(home)===themeDist,familyEqual:themeOf(fam)===themeDist};
 // footer lastUpdated before/after at 1440 + family before
 for(const [k,rel,wait] of [['beforeHome','dist/index.html',true],['afterHome','mockups/v5-sig/home-light.html',false],['beforeFamily','dist/plans/api/index.html',true],['afterFamily','mockups/v5-sig/family.html',false]]){
  const {ctx,page}=await mk(browser,1440,900);await go(page,rel,wait);
  out['footer_'+k]=await page.evaluate(()=>{const f=document.querySelector('footer');const lu=document.querySelector('#lastUpdated');return {lastUpdated:lu?lu.textContent.trim():null,footerLastP:f?[...f.querySelectorAll('p')].map(p=>p.innerText.replace(/\s+/g,' ').trim()).find(t=>t.includes('最后更新')):null};});
  await ctx.close();
 }
 // 390 internal scroll containers (before/after)
 for(const [k,rel,wait] of [['before','dist/index.html',true],['after','mockups/v5-sig/home-390.html',false]]){
  const {ctx,page}=await mk(browser,390,844);await go(page,rel,wait);
  out['scroll390_'+k]=await page.evaluate(()=>{
    const res=[];
    for(const sel of ['.facetsin','.facets','.rright','.seg','.jump','.hubline']){const el=document.querySelector(sel);if(!el)continue;const c=getComputedStyle(el);const r=el.getBoundingClientRect();res.push({sel,overflowX:c.overflowX,scrollW:el.scrollWidth,clientW:el.clientWidth,rect:{left:+r.left.toFixed(1),right:+r.right.toFixed(1),w:+r.width.toFixed(1)}});}
    return res;
  });
  await ctx.close();
 }
 // compare 页面文字与实际几何的出入
 {
  const {ctx,page}=await mk(browser,1440,900);await go(page,'mockups/v5-sig/compare.html');
  out.compareGeo=await page.evaluate(()=>({
    text680x400:document.body.innerText.includes('680×400'),
    crop:[...document.querySelectorAll('.crop')].map(e=>{const r=e.getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1)}}),
    scaleTexts:[...document.querySelectorAll('.scale')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),
    rulerTexts:[...document.querySelectorAll('.ruler span')].map(e=>e.textContent.trim()),
    figureCaption:[...document.querySelectorAll('figcaption')].map(e=>e.textContent.replace(/\s+/g,' ').trim())
  }));
  await ctx.close();
 }
 // 390 need-card b 裁剪检查（祖先 overflow hidden 是否压到 b）
 {
  const {ctx,page}=await mk(browser,390,844);await go(page,'mockups/v5-sig/home-390.html');
  out.clip390=await page.evaluate(()=>[...document.querySelectorAll('.need-card')].map(el=>{
    const b=el.querySelector('.need-copy b');const br=b.getBoundingClientRect();const cr=el.getBoundingClientRect();
    const inside=br.top>=cr.top-0.5&&br.bottom<=cr.bottom+0.5&&br.left>=cr.left-0.5&&br.right<=cr.right+0.5;
    // 最近裁剪祖先
    let anc=el.parentElement,clip=null;
    while(anc&&anc!==document.body){const c=getComputedStyle(anc);if(/(hidden|clip)/.test(c.overflowX)||/(hidden|clip)/.test(c.overflowY)){clip={desc:anc.tagName+'.'+String(anc.className).slice(0,30),ox:c.overflowX,oy:c.overflowY};break;}anc=anc.parentElement;}
    const r=document.createRange();r.selectNodeContents(b);const rr=r.getBoundingClientRect();
    return {inside,cardH:+cr.height.toFixed(1),bW:+br.width.toFixed(1),bH:+br.height.toFixed(1),textRangeW:+rr.width.toFixed(1),textRangeH:+rr.height.toFixed(1),clip,scrollW:b.scrollWidth,clientW:b.clientWidth};
  }));
  await ctx.close();
 }
 fs.writeFileSync(path.join(__dirname,'diag4.json'),JSON.stringify(out,null,2));
 console.log(JSON.stringify(out,null,1));
 await browser.close();
})().catch(e=>{console.error('DIAG4 FAIL',e);process.exit(1);});
