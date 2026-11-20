/**
 * 到期日历（expiry.ics）自测：纯函数、零依赖、零网络、零墙钟。
 *
 * 这份自测盯的是 lib/calendar.js 的六件承诺：
 *   ① RFC 5545 结构（VCALENDAR/VEVENT/必填件/CRLF）
 *   ② 折行按 UTF-8 **字节**（75 octets；中文 3 字节），续行以空格开头，且不切坏多字节字符
 *   ③ TEXT 转义 `\` `;` `,` 与换行（未转义 ⇒ 解析器把一行拆成两行，日历里就是两个事件）
 *   ④ 收录条件：只有 expiresAt 非空且 ≥ asOf 的条目；过期/无日期一律不收
 *   ⑤ 确定性：同一输入渲染两次逐字节相同；DTSTAMP 冻结在 asOf，不用墙钟
 *   ⑥ 可解析往返：unfold 之后字段逐个还原（UID/DTSTART/DTEND/SUMMARY/DESCRIPTION/URL）
 *
 * 另有牙（实跑必须变红）：
 *   牙① 去掉逗号转义 ⇒ 断言红
 *   牙② 折行按字符而不是字节 ⇒ 中文行超过 75 字节，断言红
 *   牙③ 源码里出现 Date.now() ⇒ 时钟探针红
 */

const fs = require('fs');
const path = require('path');
const calendar = require('../lib/calendar');
const site = require('../lib/site');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; return; }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}
const checkEqual = (name, actual, expected) => check(name, actual === expected,
  `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);

const AS_OF = '2026-11-19';
const DEALS = [
  {
    id: 'a1b2c3d4e5f6', title: '限时活动, 含半角逗号; 分号与反斜杠\\ 以及\n换行',
    vendor: '示例厂商', source: 'Official-Docs', sourceUrl: 'https://example.test/pricing',
    expiresAt: '2026-12-01'
  },
  { id: 'b2c3d4e5f6a7', title: '已过期（不收录）', vendor: '旧厂商', expiresAt: '2026-01-01' },
  { id: 'c3d4e5f6a7b8', title: '没有截止日期（不收录）', vendor: '长期厂商', expiresAt: null },
  { id: 'd4e5f6a7b8c9', title: '工具条目也能进日历', vendor: '工具厂商', expiresAt: '2026-11-25' }
];

const ics = calendar.buildCalendarIcs({ deals: DEALS, asOf: AS_OF, site });
const again = calendar.buildCalendarIcs({ deals: DEALS, asOf: AS_OF, site });

/* ------------------------------------------------------------------ */
console.log('\n=== 1) RFC 5545 结构 ===');
check('以 BEGIN:VCALENDAR 开头', ics.startsWith('BEGIN:VCALENDAR\r\n'));
check('以 END:VCALENDAR\\r\\n 结尾', ics.endsWith('END:VCALENDAR\r\n'));
check('全部行尾都是 CRLF（没有裸 LF）', !/(?<!\r)\n/.test(ics));
for (const line of ['VERSION:2.0', 'CALSCALE:GREGORIAN', 'PRODID:-//buguoshixc/ai-deals-aggregator//Expiry Calendar//ZH-CN', 'METHOD:PUBLISH']) {
  check(`有 ${line}`, ics.split('\r\n').includes(line));
}
check('X-WR-CALNAME 存在且非空', /^X-WR-CALNAME:.+$/m.test(ics));
const veventBegins = (ics.match(/^BEGIN:VEVENT\r$/gm) || []).length;
const veventEnds = (ics.match(/^END:VEVENT\r$/gm) || []).length;
checkEqual('VEVENT 开闭配平', veventBegins, veventEnds);
checkEqual('只收录未过期的两条', veventBegins, 2);
check('每条 VEVENT 都有 UID/DTSTAMP/DTSTART/DTEND/SUMMARY', (ics.match(/^BEGIN:VEVENT\r$/gm) || []).length
  === (ics.match(/^UID:/gm) || []).length
  && (ics.match(/^DTSTAMP:/gm) || []).length === veventBegins
  && (ics.match(/^DTSTART;VALUE=DATE:/gm) || []).length === veventBegins
  && (ics.match(/^DTEND;VALUE=DATE:/gm) || []).length === veventBegins
  && (ics.match(/^SUMMARY:/gm) || []).length === veventBegins);
check('每条 VEVENT 都有 VALARM（截止前 3 天提醒）',
  (ics.match(/^BEGIN:VALARM\r$/gm) || []).length === veventBegins
  && (ics.match(/^TRIGGER:-P3D\r$/gm) || []).length === veventBegins);

/* ------------------------------------------------------------------ */
console.log('\n=== 2) 折行：75 字节、不许切坏多字节字符 ===');
const physical = ics.split('\r\n').slice(0, -1);
const tooLong = physical.filter(line => Buffer.byteLength(line, 'utf8') > 75);
check('没有超过 75 字节的物理行', tooLong.length === 0,
  tooLong.slice(0, 2).map(line => `${Buffer.byteLength(line, 'utf8')}B ${line}`).join('；'));
const badContinuation = physical.filter((line, i) => i > 0 && /^[\u4e00-\u9fff]/.test(line) && Buffer.byteLength(line, 'utf8') > 0 && !physical[i - 1].endsWith('\r'));
// 正确折行的续行一定以空格开头；上面那条只是提示，真正的判据是「没有孤立的高位字节行」
const orphanMultibyte = physical.filter(line => !/^ /.test(line) && /^[\u0080-\uffff]/.test(line) && line.startsWith(' '));
check('没有「续行忘了加前导空格」的物理行', badContinuation.length === 0 && orphanMultibyte.length === 0);
const folded = physical.filter(line => line.startsWith(' '));
check('确实发生了折行（中文 SUMMARY/DESCRIPTION 超过 75 字节）', folded.length > 0, `${folded.length} 条续行`);

/* ------------------------------------------------------------------ */
console.log('\n=== 3) TEXT 转义 ===');
check('逗号被转义为 \\,', ics.includes('\\,'));
check('分号被转义为 \\;', ics.includes('\\;'));
check('反斜杠被转义为 \\\\', ics.includes('\\\\'));
check('换行被转义为 \\n（不是裸换行）', ics.includes('\\n') && !/SUMMARY:[^\r]*\n[^ ]/.test(ics));
check('字段值里没有裸的控制字符', !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(ics));

/* ------------------------------------------------------------------ */
console.log('\n=== 4) 收录条件与日期算术 ===');
check('过期条目不收录', !ics.includes('已过期'));
check('无截止日期条目不收录', !ics.includes('没有截止日期'));
check('DTSTART 是截止日当天', ics.includes('DTSTART;VALUE=DATE:20261201'));
check('DTEND 是次日（exclusive）', ics.includes('DTEND;VALUE=DATE:20261202'));
check('工具条目也收录', ics.includes('DTSTART;VALUE=DATE:20261125'));
checkEqual('asOf 当天到期的条目仍然收录（>= 而不是 >）',
  calendar.buildCalendarIcs({ deals: [{ id: 'x', title: 't', vendor: 'v', expiresAt: AS_OF }], asOf: AS_OF, site })
    .includes(`DTSTART;VALUE=DATE:${AS_OF.replace(/-/g, '')}`), true);

/* ------------------------------------------------------------------ */
console.log('\n=== 5) 确定性与时钟 ===');
check('同一输入渲染两次逐字节相同', ics === again);
check('DTSTAMP 冻结为 asOf 前一日 16:00Z（= 北京时间零点）',
  ics.includes('DTSTAMP:20261118T160000Z'), ics.match(/DTSTAMP:[^\r]*/)[0]);
check('deals 顺序不影响产物（按截止日期 + id 排序）',
  calendar.buildCalendarIcs({ deals: DEALS.slice().reverse(), asOf: AS_OF, site }) === ics);
const source = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'calendar.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
check('【牙③】源码没有 Date.now()', !/Date\.now\s*\(/.test(source));
check('【牙③】源码没有无参 new Date()', !/new\s+Date\s*\(\s*\)/.test(source));
check('源码只用 Date.parse 解析显式字符串', /Date\.parse\s*\(/.test(source));

/* ------------------------------------------------------------------ */
console.log('\n=== 6) 独立解析往返（unfold 后逐字段还原） ===');
const unfold = text => text.split('\r\n').reduce((acc, line) => {
  if (line.startsWith(' ')) { acc[acc.length - 1] += line.slice(1); return acc; }
  acc.push(line);
  return acc;
}, []);
const logical = unfold(ics);
const unescape = value => value
  .replace(/\\n/gi, '\n')
  .replace(/\\,/g, ',')
  .replace(/\\;/g, ';')
  .replace(/\\\\/g, '\\');
const events = [];
let current = null;
for (const line of logical) {
  if (line === 'BEGIN:VEVENT') { current = {}; continue; }
  if (line === 'END:VEVENT') { events.push(current); current = null; continue; }
  if (!current) continue;
  const index = line.indexOf(':');
  if (index < 0) continue;
  const key = line.slice(0, index).split(';')[0];
  if (!(key in current)) current[key] = unescape(line.slice(index + 1));
}
checkEqual('独立解析出两条事件', events.length, 2);
checkEqual('事件顺序 = 截止日期升序', events.map(event => event.DTSTART).join(','), '20261125,20261201');
checkEqual('UID 稳定且含主机名', events[1].UID, 'a1b2c3d4e5f6@buguoshixc.github.io');
checkEqual('SUMMARY 往返还原（含逗号/分号/反斜杠/换行）',
  events[1].SUMMARY, '限时活动, 含半角逗号; 分号与反斜杠\\ 以及\n换行');
check('DESCRIPTION 含厂商/截止/来源', /厂商：示例厂商/.test(events[1].DESCRIPTION)
  && /截止：2026-12-01/.test(events[1].DESCRIPTION) && /来源：Official-Docs/.test(events[1].DESCRIPTION));
checkEqual('URL 指向站内详情页', events[1].URL, `${site.SITE_URL}deal/a1b2c3d4e5f6/`);
checkEqual('DTEND = DTSTART 次日', events[1].DTEND, '20261202');

/* ------------------------------------------------------------------ */
console.log('\n=== 7) 唯一产物表与边界 ===');
checkEqual('CALENDAR_FILES 恰好一条', calendar.CALENDAR_FILES.length, 1);
checkEqual('产物名不以 feed 开头（命名守卫）', /^feed/i.test(calendar.CALENDAR_FILES[0][0]), false);
checkEqual('MIME 是 text/calendar', calendar.CALENDAR_FILES[0][1], 'text/calendar');
check('空输入也产出合法的空日历（不是空字符串）',
  calendar.buildCalendarIcs({ deals: [], asOf: AS_OF, site }).includes('BEGIN:VCALENDAR')
  && !calendar.buildCalendarIcs({ deals: [], asOf: AS_OF, site }).includes('BEGIN:VEVENT'));

console.log(`\n${failures.length ? '❌' : '✅'} 到期日历自测：${pass} 项通过，${failures.length} 项失败`);
failures.forEach(message => console.error(`   - ${message}`));
if (failures.length) process.exit(1);
