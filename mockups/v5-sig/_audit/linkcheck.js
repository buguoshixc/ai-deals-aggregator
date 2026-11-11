'use strict';
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../../..');const V5=path.resolve(__dirname,'..');
const files=['home-light.html','home-dark.html','home-390.html','family.html','compare.html'];
const REPORT={};
for(const f of files){
  const html=fs.readFileSync(path.join(V5,f),'utf8');
  const urls=[...html.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/gi)].map(m=>m[1].trim());
  const rows=[];
  for(const u of urls){
    if(/^(https?:|mailto:|tel:|data:|javascript:|#)/i.test(u)||u==='')continue;
    // 解析目标：相对 mockup 目录
    const target=path.resolve(V5,decodeURIComponent(u.split('#')[0].split('?')[0]));
    let exists=false,isDir=false;
    try{const st=fs.statSync(target);exists=true;isDir=st.isDirectory();}catch(e){}
    // 若是目录，检查 index.html
    let indexPath=null,indexExists=null;
    if(exists&&isDir){indexPath=path.join(target,'index.html');indexExists=fs.existsSync(indexPath);}
    rows.push({url:u,resolved:path.relative(ROOT,target),exists,isDir,indexExists,ok:exists&&(isDir?!!indexExists:true)});
  }
  const bad=rows.filter(r=>!r.ok);
  const prefixes={};
  for(const r of rows){const p=r.url.startsWith('../../dist/')?'../../dist/':r.url.startsWith('../../dist/dist/')?'../../dist/dist/':r.url.startsWith('shots/')?'shots/':'other';prefixes[p]=(prefixes[p]||0)+1;}
  REPORT[f]={total:rows.length,bad:bad.length,prefixes,badSamples:bad.slice(0,12),allSamples:rows.slice(0,6)};
}
fs.writeFileSync(path.join(__dirname,'linkcheck.json'),JSON.stringify(REPORT,null,2));
console.log(JSON.stringify(REPORT,null,1));
