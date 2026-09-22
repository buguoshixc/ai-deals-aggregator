/**
 * 厂商 logo 资产的装配（零依赖，构建期运行）。
 *
 * 设计要点：页面里只写 data-logo="厂商key"，图形本身由生成的 logos.css 提供。
 * 这样 RENDER-CORE 依旧是纯函数（不读文件、不拼 base64），构建期预渲染与浏览器
 * 共用同一份模板；换 logo 只需改 manifest.json 后重新构建，不碰模板。
 *
 * 产物：
 *   dist/logos/<key>.<ext>   品牌矢量（由 manifest 里的路径现场生成）或官网文件（原样拷贝）
 *   dist/logos.css           每个 logo 一条规则，lazy 由浏览器按需请求
 *
 * 不热链任何第三方 CDN：logo 全部落盘，访客 IP 不外泄，也不怕对方改文件后图形失效。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'assets', 'logos');
const MANIFEST = path.join(SRC, 'manifest.json');

/** 读取并自检 manifest；文件缺失、字段不全直接抛错（宁可构建失败） */
function load(manifestPath = MANIFEST) {
  const meta = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const logos = meta.logos || {};
  const keys = Object.keys(logos);
  if (!keys.length) throw new Error('manifest.json 里没有任何 logo');

  for (const key of keys) {
    const item = logos[key];
    if (!item.name) throw new Error(`logo ${key}: 缺少 name`);
    if (item.kind === 'brand') {
      if (!item.d && !item.svg) throw new Error(`logo ${key}: brand 类型必须有 d 或 svg`);
    } else if (item.kind === 'file') {
      if (!item.file) throw new Error(`logo ${key}: file 类型必须有 file`);
      if (!fs.existsSync(path.join(SRC, item.file))) {
        throw new Error(`logo ${key}: 找不到 assets/logos/${item.file}`);
      }
      item.ext = path.extname(item.file).slice(1).toLowerCase();
      if (!['png', 'svg', 'jpg', 'jpeg', 'webp'].includes(item.ext)) {
        throw new Error(`logo ${key}: 不支持的格式 .${item.ext}`);
      }
    } else {
      throw new Error(`logo ${key}: kind 必须是 brand 或 file`);
    }
    if (!item.source) throw new Error(`logo ${key}: 缺少 source（来源必须可复核）`);
  }
  return { meta, logos };
}

/** 把 manifest 里的品牌路径渲染成一份自包含的 SVG 文件 */
function brandSvg(item, size = 48) {
  const inner = item.svg
    ? item.svg.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim()
    : `<path fill="${item.color || '#111'}" d="${item.d}"/>`;
  const viewBox = item.viewBox || '0 0 24 24';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" role="img" aria-label="${escapeXml(item.name)}">${inner}</svg>\n`;
}

function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

/** 每个 logo 一条 CSS 规则；图形只在这里出现，模板里只有 key */
function css(logos) {
  const lines = [
    '/* 由 scripts/lib/logos.js 自动生成 —— 源：assets/logos/manifest.json（勿手改） */',
    '/* 页面只写 data-logo="key"；形状、配色、内缩全在这里，模板与渲染核心不碰图形。 */'
  ];
  for (const key of Object.keys(logos).sort()) {
    const item = logos[key];
    const file = item.kind === 'brand' ? `${key}.svg` : item.file;
    const decl = [
      `background-image:url(logos/${file})`,
      `background-color:${item.bg || '#fff'}`,
      'background-repeat:no-repeat',
      'background-position:center'
    ];
    if (item.kind === 'brand') {
      // 矢量剪影：按 tile 百分比缩放，四周留白一致
      decl.push(`background-size:${item.scale || '72%'}`);
    } else {
      // 位图 / 官网 SVG：contain + content-box 内缩，保证不变形也不贴边
      decl.push('background-size:contain', 'background-origin:content-box', `padding:${item.pad || '3px'}`);
    }
    lines.push(`.lg[data-logo="${key}"]{${decl.join(';')}}`);
    if (item.fit === 'wide') {
      // 长条图形（如硅基流动 156×32）塞进方块会被压成一条线：横向胶囊 + hover 时同样拉宽，
      // 宽高比始终由 background-size:contain 保持。hover 只改宽度、不改高度，避免顶动网格行高。
      lines.push(`.lg[data-logo="${key}"]{width:48px}`);
      lines.push(`.logos .lg[data-logo="${key}"]:hover{width:54px}`);
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * 把 logo 资产写进产物目录。
 * @returns {{count:number, files:number, bytes:number}}
 */
function write(destDir, logos) {
  const dir = path.join(destDir, 'logos');
  fs.mkdirSync(dir, { recursive: true });

  let bytes = 0;
  for (const key of Object.keys(logos)) {
    const item = logos[key];
    if (item.kind === 'brand') {
      const svg = brandSvg(item);
      fs.writeFileSync(path.join(dir, `${key}.svg`), svg, 'utf8');
      bytes += Buffer.byteLength(svg);
    } else {
      const from = path.join(SRC, item.file);
      fs.copyFileSync(from, path.join(dir, item.file));
      bytes += fs.statSync(from).size;
    }
  }

  const sheet = css(logos);
  fs.writeFileSync(path.join(destDir, 'logos.css'), sheet, 'utf8');

  return {
    count: Object.keys(logos).length,
    files: fs.readdirSync(dir).length,
    bytes: bytes + Buffer.byteLength(sheet)
  };
}

module.exports = { SRC, MANIFEST, load, brandSvg, css, write };
