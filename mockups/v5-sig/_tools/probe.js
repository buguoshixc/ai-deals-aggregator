const fs = require('fs');
const crypto = require('crypto');
const cheerio = require('cheerio');

const read = p => fs.readFileSync(p, 'utf8');
const h = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
const strip = s => s.replace(/\s+/g, ' ').trim();
const cut = (s, n = 300) => s.length > n ? s.slice(0, n) + '…' : s;

const src = read('index.html');
const dist = read('dist/index.html');
const styleRe = /<style>[\s\S]*?<\/style>/;
const srcStyle = (src.match(styleRe) || [''])[0];
const distStyle = (dist.match(styleRe) || [''])[0];
console.log('STYLE src bytes=%d hash=%s | dist bytes=%d hash=%s | equal=%s',
  srcStyle.length, h(srcStyle), distStyle.length, h(distStyle), srcStyle === distStyle);

// CSS features: media queries, h1, fs tokens, selectors of interest
const css = distStyle.replace(/^<style>/, '').replace(/<\/style>$/, '');
css.split('\n').forEach((line, i) => {
  if (/@media|^\s*h1\b|^\s*h1[, {]|--fs-|\.stat\b|\.grid\s*\{|\.g\s*\{|\.wrap\s*\{|\.jump\b|\.hubline|\.needs|\.need-grid|\.need-card|\.tierhead|\.of\s*\{|\.of\s*\.|\.of\./.test(line)) {
    console.log('CSS %d: %s', i + 1, cut(line.trim(), 160));
  }
});

const $ = cheerio.load(dist, { decodeEntities: false });
console.log('\n== BODY OUTLINE ==');
$('body').children().each((i, el) => {
  const cls = $(el).attr('class'); const id = $(el).attr('id');
  console.log(i, el.tagName, id ? '#' + id : '', cls ? '.' + cls.split(/\s+/).join('.') : '', '|', cut(strip($(el).text()), 80));
});
console.log('\n== MAIN OUTLINE ==');
$('main').children().each((i, el) => {
  const cls = $(el).attr('class'); const id = $(el).attr('id');
  console.log(i, el.tagName, id ? '#' + id : '', cls ? '.' + cls.split(/\s+/).join('.') : '', '| len=', $(el).html() ? $(el).html().length : 0);
});
console.log('\n== NEEDS HTML ==');
console.log($('.needs').length ? $('.needs').html().replace(/\n\s*\n/g, '\n').slice(0, 9000) : 'MISSING');
console.log('\n== HEADER ==');
console.log($('header.top').html() ? $('header.top').html().replace(/\n\s*\n/g, '\n').slice(0, 3000) : 'MISSING');
console.log('\n== H1 AREAS ==');
$('h1').each((i, el) => console.log('H1#' + i, cut($.html(el), 500), '\nPARENT:', cut($(el).parent().html(), 900)));
