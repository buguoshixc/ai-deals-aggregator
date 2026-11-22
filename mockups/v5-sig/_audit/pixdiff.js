'use strict';
const path=require('path');const {chromium}=require('playwright-core');
const AUD=__dirname;const BASE='http://127.0.0.1:8081/';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});const page=await ctx.newPage();
 await page.route('**/*',r=>r.request().url().startsWith(BASE)?r.continue():r.abort());
 await page.goto(BASE+'mockups/v5-sig/home-light.html',{waitUntil:'load'});await page.waitForTimeout(400);
 const res=await page.evaluate(async()=>{
  const load=src=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src;});
  const grab=im=>{const cv=document.createElement('canvas');cv.width=1440;cv.height=900;const cx=cv.getContext('2d');cx.drawImage(im,0,0);return cx.getImageData(0,0,1440,900).data;};
  const [a,b]=await Promise.all([load('/mockups/v5-sig/shots/home-before-after.png'),load('/mockups/v5-sig/_audit/verify-compare-1440.png')]);
  const da=grab(a),db=grab(b);
  let n=0,minx=9999,miny=9999,maxx=-1,maxy=-1;
  for(let i=0,p=0;i<da.length;i+=4,p++){ if(da[i]!==db[i]||da[i+1]!==db[i+1]||da[i+2]!==db[i+2]){n++;const x=p%1440,y=(p/1440)|0;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;} }
  return {diffPixels:n,bbox:n?{minx,miny,maxx,maxy}:null,sizes:[a.naturalWidth,a.naturalHeight,b.naturalWidth,b.naturalHeight]};
 });
 console.log(JSON.stringify(res));
 await ctx.close();await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
