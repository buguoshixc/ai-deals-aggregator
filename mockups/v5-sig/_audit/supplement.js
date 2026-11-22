'use strict';
/* 补充复核：family vs home 同站依据、390 改前/改后卡片树对比、25% 色块连通域、对比度逐项、截图尺寸 */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '../../..'); const AUD = __dirname; const BASE = 'http://127.0.0.1:8081/';
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
async function mk(browser,w,h,cs='light'){const ctx=await browser.newContext({viewport:{width:w,height:h},colorScheme:cs,deviceScaleFactor:1});const page=await ctx.newPage();await page.route('**/*',r=>{const u=r.request().url();if(!u.startsWith(BASE))return r.abort();return r.continue();});return {ctx,page};}
async function go(page,rel,waitJs){await page.goto(BASE+rel,{waitUntil:'load',timeout:45000});if(waitJs){try{await page.waitForSelector('#dealsList article.g',{timeout:15000});}catch(e){}try{await page.waitForLoadState('networkidle',{timeout:8000});}catch(e){}await page.waitForTimeout(700);}else{await page.waitForTimeout(300);}await page.evaluate(()=>scrollTo(0,0));}
function normHtml(h){return h.replace(/\s+/g,' ').replace(/>\s+</g,'><').trim();}
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const out={};
  // A. family vs home-light 同站依据
  {
    const {ctx,page}=await mk(browser,1440,900);
    await go(page,'mockups/v5-sig/home-light.html');
    const home=await page.evaluate(()=>({
      header:(()=>{const h=document.querySelector('header.top');return h?h.outerHTML.replace(/\s+/g,' ').trim():null})(),
      footer:(()=>{const f=document.querySelector('footer');return f?f.outerHTML.replace(/\s+/g,' ').trim():null})(),
      tokens:(()=>{const r=getComputedStyle(document.documentElement);const o={};['--bg','--card','--ink','--line','--t1','--t2','--t3','--t4','--t5'].forEach(k=>o[k]=r.getPropertyValue(k).trim());return o})(),
      font:getComputedStyle(document.body).fontFamily,
      logos:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.getAttribute('href')),
      themeMeta:[...document.querySelectorAll('meta[name=theme-color]')].map(m=>m.getAttribute('content')),
      styleTexts:[...document.querySelectorAll('style')].map(s=>s.textContent),
      navItems:[...document.querySelectorAll('header.top nav a, header.top .seg button')].map(e=>e.textContent.trim()).slice(0,20)
    }));
    await ctx.close();
  }
  // 重新取（home 数据与 family 数据放一起比较）
  {
    const {ctx,page}=await mk(browser,1440,900);
    await go(page,'mockups/v5-sig/home-light.html');
    const home=await page.evaluate(()=>({
      header:(()=>{const h=document.querySelector('header.top');return h?h.outerHTML.replace(/\s+/g,' ').trim():null})(),
      footer:(()=>{const f=document.querySelector('footer');return f?f.outerHTML.replace(/\s+/g,' ').trim():null})(),
      tokens:(()=>{const r=getComputedStyle(document.documentElement);const o={};['--bg','--card','--ink','--line','--t1','--t2','--t3','--t4','--t5'].forEach(k=>o[k]=r.getPropertyValue(k).trim());return o})(),
      font:getComputedStyle(document.body).fontFamily,
      logos:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.getAttribute('href')),
      themeMeta:[...document.querySelectorAll('meta[name=theme-color]')].map(m=>m.getAttribute('content')),
      styleTexts:[...document.querySelectorAll('style')].map(s=>s.textContent)
    }));
    await ctx.close();
    const {ctx:ctx2,page:page2}=await mk(browser,1440,900);
    await go(page2,'mockups/v5-sig/family.html');
    const fam=await page2.evaluate(()=>({
      header:(()=>{const h=document.querySelector('header.top');return h?h.outerHTML.replace(/\s+/g,' ').trim():null})(),
      footer:(()=>{const f=document.querySelector('footer');return f?f.outerHTML.replace(/\s+/g,' ').trim():null})(),
      tokens:(()=>{const r=getComputedStyle(document.documentElement);const o={};['--bg','--card','--ink','--line','--t1','--t2','--t3','--t4','--t5'].forEach(k=>o[k]=r.getPropertyValue(k).trim());return o})(),
      font:getComputedStyle(document.body).fontFamily,
      logos:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.getAttribute('href')),
      themeMeta:[...document.querySelectorAll('meta[name=theme-color]')].map(m=>m.getAttribute('content')),
      styleTexts:[...document.querySelectorAll('style')].map(s=>s.textContent),
      bigText:[...document.querySelectorAll('body *')].filter(el=>parseFloat(getComputedStyle(el).fontSize)>=20&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>({tag:el.tagName,cls:String(el.className),fs:getComputedStyle(el).fontSize,direct:[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim(),isStat:el.classList.contains('stat')}))
    }));
    await ctx2.close();
    out.sameSite={
      headerEqual: normHtml(home.header)===normHtml(fam.header),
      footerEqual: normHtml(home.footer)===normHtml(fam.footer),
      headerLen:[home.header.length,fam.header.length], footerLen:[home.footer.length,fam.footer.length],
      tokensEqual: JSON.stringify(home.tokens)===JSON.stringify(fam.tokens),
      tokens: home.tokens,
      fontEqual: home.font===fam.font, font: home.font,
      logosEqual: JSON.stringify(home.logos)===JSON.stringify(fam.logos), logos: home.logos,
      themeMetaEqual: JSON.stringify(home.themeMeta)===JSON.stringify(fam.themeMeta),
      sharedStyleEqual: home.styleTexts[0]===fam.styleTexts[0],
      homeStyleLen: home.styleTexts.map(s=>s.length), famStyleLen: fam.styleTexts.map(s=>s.length),
      familyBigText: fam.bigText
    };
  }
  // B. 390 改前 vs 改后 每卡高度 / 引文文本差异（只做诊断，不计入判据）
  {
    const grab=async rel=>{const {ctx,page}=await mk(browser,390,844);await go(page,rel,true);const d=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll('#dealsList article.g')];
      return cards.map((el,i)=>{const r=el.getBoundingClientRect();const of=el.querySelector('.of');const tx=el.querySelector('.of .tx');return {i,h:+r.height.toFixed(2),of:of?of.className:null,tx:tx?tx.textContent.replace(/\s+/g,' ').trim():null};});
    });await ctx.close();return d;};
    const A=await grab('dist/index.html'); const B=await grab('mockups/v5-sig/home-390.html');
    const diffs=[]; const n=Math.min(A.length,B.length);
    for(let i=0;i<n;i++){ if(A[i].h!==B[i].h||A[i].tx!==B[i].tx||A[i].of!==B[i].of) diffs.push({i,before:A[i],after:B[i]}); }
    // 卡片层级之外的区块：footer children 高度
    const grab2=async rel=>{const {ctx,page}=await mk(browser,390,844);await go(page,rel,true);const d=await page.evaluate(()=>({scrollH:document.documentElement.scrollHeight,footerH:+document.querySelector('footer').getBoundingClientRect().height.toFixed(2),footerChildren:[...document.querySelector('footer').children].map(e=>({tag:e.tagName,cls:String(e.className),h:+e.getBoundingClientRect().height.toFixed(2)})),needH:[...document.querySelectorAll('.need-card')].map(e=>+e.getBoundingClientRect().height.toFixed(2)),hubH:+document.querySelector('.hubline').getBoundingClientRect().height.toFixed(2),jumpH:+document.querySelector('.jump').getBoundingClientRect().height.toFixed(2),jumpAH:[...document.querySelectorAll('.jump a')].map(e=>+e.getBoundingClientRect().height.toFixed(2))}));await ctx.close();return d;};
    out.diag390={cardCountBefore:A.length,cardCountAfter:B.length,diffCount:diffs.length,diffs:diffs.slice(0,6),before:await grab2('dist/index.html'),after:await grab2('mockups/v5-sig/home-390.html')};
  }
  // C. 25% 缩略图：按色连通域（判断是否存在「4 块不同档位色」）
  {
    const {ctx,page}=await mk(browser,1200,900);
    await go(page,'mockups/v5-sig/home-light.html');
    out.thumbClusters=await page.evaluate(async()=>{
      const load=src=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src;});
      const im=await load('/mockups/v5-sig/shots/home-25pct.png');
      const cv=document.createElement('canvas');cv.width=360;cv.height=225;const cx=cv.getContext('2d');cx.drawImage(im,0,0);
      const d=cx.getImageData(0,0,360,225).data;
      const COLORS={t1:[11,122,68],t2:[29,78,216],t3:[21,94,117],t4:[146,64,14]};
      const res={};
      for(const [k,c] of Object.entries(COLORS)){
        const mask=new Uint8Array(360*225);let total=0;
        for(let i=0,p=0;i<d.length;i+=4,p++){ if(Math.abs(d[i]-c[0])<=20&&Math.abs(d[i+1]-c[1])<=20&&Math.abs(d[i+2]-c[2])<=20){mask[p]=1;total++;} }
        const seen=new Uint8Array(360*225);const comps=[];
        for(let p=0;p<mask.length;p++){ if(!mask[p]||seen[p])continue; const st=[p];seen[p]=1;let n=0,minx=999,miny=999,maxx=-1,maxy=-1;
          while(st.length){const q=st.pop();n++;const x=q%360,y=(q/360)|0;minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);
            for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=360||ny>=225)continue;const nq=ny*360+nx;if(mask[nq]&&!seen[nq]){seen[nq]=1;st.push(nq);}}}
          comps.push({n,x:minx,y:miny,w:maxx-minx+1,h:maxy-miny+1});
        }
        comps.sort((a,b)=>b.n-a.n);
        res[k]={hex:'#'+c.map(v=>v.toString(16).padStart(2,'0')).join(''),total,components:comps.slice(0,6)};
      }
      return res;
    });
    await ctx.close();
  }
  // D. 对比度逐项（从 measured.json 的渲染 token 重算，直接给出表）
  {
    const R=JSON.parse(fs.readFileSync(path.join(AUD,'measured.json'),'utf8'));
    out.contrastTable={light:R.contrast.light,dark:R.contrast.dark,renderedOn:R.renderedOn};
    out.afterDarkBigText=R.afterDark.bigText.map(b=>b.fs+':'+b.direct+':'+(b.isStat?'stat':'NON-STAT'));
    out.familyBigText=R.family.bigText.map(b=>b.fs+':'+b.direct+':'+(b.isStat?'stat':'NON-STAT'));
  }
  // E. 改前 tierhead hint 字号（compare 页称 11.5px）
  {
    const {ctx,page}=await mk(browser,1440,900);
    await go(page,'dist/index.html',true);
    out.beforeHint=await page.evaluate(()=>{const h=document.querySelector('.tierhead .hint');const t=document.querySelector('.tierhead');return h?{hintFs:getComputedStyle(h).fontSize,tierFs:getComputedStyle(t).fontSize,text:h.textContent.trim()}:null;});
    await ctx.close();
  }
  // F. 截图尺寸 / 文件时间 / NOTES
  {
    const pngSize=p=>{const b=fs.readFileSync(p);return {w:b.readUInt32BE(16),h:b.readUInt32BE(20),bytes:b.length};};
    out.shots={home25:pngSize(path.join(ROOT,'mockups/v5-sig/shots/home-25pct.png')),homeBeforeAfter:pngSize(path.join(ROOT,'mockups/v5-sig/shots/home-before-after.png')),verifyCompare:pngSize(path.join(AUD,'verify-compare-1440.png'))};
    out.mtimes={};for(const f of ['index.html','dist/index.html','dist/plans/api/index.html','mockups/v5-sig/home-light.html']){const s=fs.statSync(path.join(ROOT,f));out.mtimes[f]={mtime:s.mtime.toISOString(),size:s.size};}
    out.notes=[];const walk=(d,depth)=>{if(depth>3)return;for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='node_modules'||e.name==='.git'||e.name==='dist')continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p,depth+1);else if(/NOTES/i.test(e.name))out.notes.push(path.relative(ROOT,p));}};walk(ROOT,0);
  }
  fs.writeFileSync(path.join(AUD,'supplement.json'),JSON.stringify(out,null,2));
  console.log(JSON.stringify({sameSite:{...out.sameSite,styleTexts:undefined,bigText:undefined},diag390:{diffCount:out.diag390.diffCount,diffs:out.diag390.diffs,scrollH:[out.diag390.before.scrollH,out.diag390.after.scrollH],footerH:[out.diag390.before.footerH,out.diag390.after.footerH],footerChildrenBefore:out.diag390.before.footerChildren,footerChildrenAfter:out.diag390.after.footerChildren,jumpAH:[out.diag390.before.jumpAH,out.diag390.after.jumpAH]},thumbClusters:out.thumbClusters,afterDarkBigText:out.afterDarkBigText,familyBigText:out.familyBigText,beforeHint:out.beforeHint,shots:out.shots,mtimes:out.mtimes,notes:out.notes},null,1));
  await browser.close();
})().catch(e=>{console.error('SUPP FAIL',e);process.exit(1);});
