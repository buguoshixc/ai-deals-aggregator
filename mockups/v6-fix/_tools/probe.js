'use strict';
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const ROOT = path.resolve(__dirname, '../../..');
const html = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
const $ = cheerio.load(html);
const out = { counts: {}, cards: [], tiers: [], landmarks: {} };
out.bytes = Buffer.byteLength(html);
out.counts.articles = $('article.g').length;
out.counts.tierheads = $('.tierhead').length;
out.counts.needs = $('.need-card').length;
out.counts.fmembers = $('.fmembers').length;
out.counts.uns = $('.tg.uns').length;
out.counts.due = $('.tg.due').length;
out.counts.long = $('.tg.long').length;
$('.tierhead').each((i, el) => out.tiers.push({
  id: $(el).attr('id'), text: $(el).text().replace(/\s+/g,' ').trim(),
}));
$('article.g').each((i, el) => {
  const $el = $(el);
  const members = $el.find('.fmembers a');
  const badges = $el.find('.tg').map((j,b)=>$(b).text()).get();
  out.cards.push({
    i,
    tier: $el.attr('data-tier'),
    rule: $el.attr('data-rule'),
    ids: $el.attr('data-deal-ids'),
    title: $el.find('h3').text().trim(),
    vendor: $el.find('.vendor').text().trim(),
    badges,
    fmembers: members.length,
    fmemberText: $el.find('.fmembers').text().replace(/\s+/g,' ').trim().slice(0,160),
    modelCount: $el.attr('data-model-count') || null,
    quota: $el.attr('data-quota') || null,
    hasDetails: $el.find('details').length,
    id: $el.attr('id') || null,
  });
});
out.landmarks.topHeader = $('header.top').length;
out.landmarks.search = $('#searchInput').length;
out.landmarks.facets = $('#facets').length;
out.landmarks.facetsinHtmlLen = ($('#facets').html()||'').length;
out.landmarks.needsParent = $('.needs').parent().attr('class') || $('.needs').parent().prop('tagName');
out.landmarks.gridStart = $('.grid').length;
out.landmarks.scripts = $('script').map((i,s)=>({i, src:$(s).attr('src')||null, len:($(s).html()||'').length, head:($(s).html()||'').slice(0,60)})).get();
out.landmarks.styles = $('style').map((i,s)=>({i, len:($(s).html()||'').length})).get();
out.landmarks.plansnav = $('.plansnav').map((i,a)=>({cls:$(a).attr('class'), text:$(a).text(), title:$(a).attr('title'), href:$(a).attr('href')})).get();
out.landmarks.needCards = $('.need-card').map((i,a)=>({text:$(a).text().replace(/\s+/g,' ').trim(), href:$(a).attr('href')})).get();
out.landmarks.gridChildren = $('#dealsList').children().map((i,e)=>({tag:e.tagName, cls:$(e).attr('class'), id:$(e).attr('id')})).get();
fs.mkdirSync(path.join(__dirname,'../_data'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'../_data/probe.json'), JSON.stringify(out,null,1));
console.log(JSON.stringify({bytes:out.bytes,counts:out.counts,tiers:out.tiers,landmarks:{...out.landmarks, needCards:out.landmarks.needCards.length, gridChildren:out.landmarks.gridChildren.slice(0,6)}, openrouter:out.cards.filter(c=>/openrouter/i.test(c.title)||/openrouter/i.test(c.vendor)), first12:out.cards.slice(0,12)},null,1));
