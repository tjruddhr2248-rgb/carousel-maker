// 레이아웃 계산(넘침 검사) + PNG 그리기. 그리기 전에 전 슬라이드를 먼저 재서 하나라도 넘치면 아무 파일도 만들지 않는다.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const fontDir = path.join(path.dirname(require.resolve('pretendard/package.json')), 'dist/public/static');
for (const w of ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) {
  GlobalFonts.registerFromPath(path.join(fontDir, `Pretendard-${w}.otf`), `Pretendard ${w}`);
}

export const W = 1080;
export const H = 1350;
const PAD = 84;
const MAX_W = W - PAD * 2;
const BOTTOM = H - 150; // 진행 바 위까지

const font = (weight, size) => `${size}px "Pretendard ${weight}"`;
const measure = createCanvas(10, 10).getContext('2d');

// 띄어쓰기 단위로 줄바꿈, 한 단어가 너무 길면 글자 단위로 자른다
function wrap(text, f, maxW) {
  measure.font = f;
  const out = [];
  let line = '';
  const push = (word) => {
    const t = line ? `${line} ${word}` : word;
    if (measure.measureText(t).width <= maxW) { line = t; return; }
    if (line) out.push(line);
    line = '';
    if (measure.measureText(word).width <= maxW) { line = word; return; }
    for (const ch of word) {
      if (measure.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch;
    }
  };
  for (const word of text.split(/\s+/).filter(Boolean)) push(word);
  if (line) out.push(line);
  return out.length ? out : [''];
}

// 슬라이드 하나 → 그릴 항목 목록 + 넘침 정보
function layoutStep(s, idx, brand) {
  const c = brand.colors;
  const ops = [];
  let y = 200;
  ops.push({ t: 'text', s: `STEP ${String(idx).padStart(2, '0')}`, f: font('Bold', 32), color: c.accent, x: PAD, y });
  y += 44;

  const hf = font('Bold', 76);
  const hLines = wrap(s.headline, hf, MAX_W);
  const errors = [];
  if (hLines.length > brand.limits.headlineMaxLines) {
    errors.push(`제목이 ${hLines.length}줄입니다 (최대 ${brand.limits.headlineMaxLines}줄) → 글자를 줄이세요`);
  }
  for (const l of hLines) { y += 100; ops.push({ t: 'text', s: l, f: hf, color: c.text, x: PAD, y }); }
  y += 44;
  ops.push({ t: 'rect', x: PAD, y, w: 72, h: 6, color: c.accent });
  y += 34;

  // 본문: 일반 줄 / "- " 글머리 / "> " 예시 박스 / 빈 줄 = 문단 간격
  const bf = font('Regular', 46);
  const pf = font('Medium', 42);
  let k = 0;
  while (k < s.body.length) {
    const raw = s.body[k];
    if (!raw.trim()) { y += 26; k++; continue; }
    if (raw.trimStart().startsWith('>')) {
      const group = [];
      while (k < s.body.length && s.body[k].trimStart().startsWith('>')) group.push(s.body[k++].trimStart().replace(/^>\s?/, ''));
      const inner = MAX_W - 36 * 2 - 8;
      const pl = group.flatMap((g) => (g.trim() ? wrap(g, pf, inner) : ['']));
      const ph = 36 * 2 + pl.length * 64 - 64 + 44;
      y += 36;
      ops.push({ t: 'rect', x: PAD, y, w: MAX_W, h: ph, color: c.panel, r: 14 });
      ops.push({ t: 'rect', x: PAD, y, w: 8, h: ph, color: c.accent });
      let py = y + 36 + 36;
      for (const l of pl) { ops.push({ t: 'text', s: l, f: pf, color: c.text, x: PAD + 8 + 36, y: py }); py += 64; }
      y += ph + 18;
      continue;
    }
    const bullet = /^\s*-\s+/.test(raw);
    const txt = raw.replace(/^\s*-\s+/, '').trim();
    const indent = bullet ? 40 : 0;
    const bl = wrap(txt, bf, MAX_W - indent);
    bl.forEach((l, j) => {
      y += 72;
      if (bullet && j === 0) ops.push({ t: 'text', s: '•', f: bf, color: c.accent, x: PAD, y });
      ops.push({ t: 'text', s: l, f: bf, color: c.body, x: PAD + indent, y });
    });
    k++;
  }
  shift(ops, 200, y, BOTTOM);
  const over = Math.round(y + 20 - BOTTOM);
  if (over > 0) errors.push(`내용이 아래로 ${over}px 넘칩니다 → 본문을 약 ${Math.ceil(over / 72)}줄 줄이세요`);
  return { ops, errors };
}

// 내용 덩어리를 [top, bottom] 사이 세로 중앙(살짝 위)으로 내린다. 넘칠 때는 그대로 두고 오류로 알린다.
function shift(ops, top, end, bottom) {
  const dy = Math.max(0, Math.round(((bottom - top) - (end - top)) * 0.42));
  for (const op of ops) op.y += dy;
}

function layoutCover(meta, brand) {
  const c = brand.colors;
  const ops = [];
  const errors = [];
  const pillF = font('SemiBold', 34);
  measure.font = pillF;
  const pw = Math.min(measure.measureText(meta.target).width + 56, MAX_W);
  ops.push({ t: 'rect', x: PAD, y: 280, w: pw, h: 64, color: 'rgba(61,139,255,0.22)', r: 32 });
  ops.push({ t: 'text', s: meta.target, f: pillF, color: c.light, x: PAD + 28, y: 324 });
  if (pw >= MAX_W) errors.push('대상 문구가 한 줄을 넘습니다 → 짧게 줄이세요');

  const tf = font('ExtraBold', 96);
  const tl = wrap(meta.title, tf, MAX_W);
  if (tl.length > brand.limits.titleMaxLines) errors.push(`표지 제목이 ${tl.length}줄입니다 (최대 ${brand.limits.titleMaxLines}줄) → 줄이세요`);
  let y = 400;
  for (const l of tl) { y += 120; ops.push({ t: 'text', s: l, f: tf, color: c.text, x: PAD, y }); }
  if (meta.subtitle) {
    y += 40;
    const sf = font('Medium', 46);
    for (const l of wrap(meta.subtitle, sf, MAX_W)) { y += 66; ops.push({ t: 'text', s: l, f: sf, color: c.light, x: PAD, y }); }
  }
  shift(ops, 280, y, H - 230);
  ops.push({ t: 'text', s: '옆으로 넘겨 보세요  →', f: font('Medium', 32), color: c.sub, x: PAD, y: H - 170 });
  const over = Math.round(y + 40 - (H - 230));
  if (over > 0) errors.push(`표지 글자가 ${over}px 넘칩니다 → 제목이나 부제를 줄이세요`);
  return { ops, errors };
}

function layoutCta(meta, brand) {
  const c = brand.colors;
  const ops = [];
  const lines = brand.cta[meta.cta].slide;
  const f = font('ExtraBold', 84);
  let y = (H - lines.length * 112) / 2 - 40;
  for (const l of lines) { y += 112; ops.push({ t: 'text', s: l, f, color: c.text, x: PAD, y }); }
  y += 90;
  ops.push({ t: 'rect', x: PAD, y: y - 40, w: 72, h: 6, color: c.accent });
  ops.push({ t: 'text', s: brand.handle, f: font('Bold', 48), color: c.accent, x: PAD, y: y + 40 });
  return { ops, errors: [] };
}

export function layoutAll(meta, slides, brand) {
  const pages = [layoutCover(meta, brand), ...slides.map((s, k) => layoutStep(s, k + 1, brand)), layoutCta(meta, brand)];
  const errors = [];
  pages.forEach((p, k) => p.errors.forEach((e) => errors.push(`[${k + 1}번 슬라이드${k > 0 && k <= slides.length ? ` · 원고 ${slides[k - 1].line}줄` : ''}] ${e}`)));
  return { pages, errors };
}

export function draw(page, no, total, brand) {
  const c = brand.colors;
  const cv = createCanvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = c.bg;
  g.fillRect(0, 0, W, H);
  // 상단: 핸들 + 쪽수
  g.font = font('SemiBold', 28);
  g.fillStyle = c.sub;
  g.fillText(brand.handle, PAD, 92);
  const pageTxt = `${no} / ${total}`;
  g.fillText(pageTxt, W - PAD - g.measureText(pageTxt).width, 92);
  // 본문
  for (const op of page.ops) {
    g.fillStyle = op.color;
    if (op.t === 'text') { g.font = op.f; g.fillText(op.s, op.x, op.y); continue; }
    g.beginPath();
    if (op.r) g.roundRect(op.x, op.y, op.w, op.h, op.r); else g.rect(op.x, op.y, op.w, op.h);
    g.fill();
  }
  // 하단 진행 바
  g.fillStyle = 'rgba(169,180,199,0.25)';
  g.fillRect(PAD, H - 96, MAX_W, 6);
  g.fillStyle = c.accent;
  g.fillRect(PAD, H - 96, (MAX_W * no) / total, 6);
  return cv;
}

// 미리보기 한 장 (4열 썸네일) — 확인·제출용
export function contactSheet(canvases) {
  const s = 0.25, tw = W * s, th = H * s, gap = 24, cols = 4;
  const rows = Math.ceil(canvases.length / cols);
  const cv = createCanvas(cols * tw + (cols + 1) * gap, rows * th + (rows + 1) * gap);
  const g = cv.getContext('2d');
  g.fillStyle = '#E9EDF3';
  g.fillRect(0, 0, cv.width, cv.height);
  canvases.forEach((c, k) => g.drawImage(c, gap + (k % cols) * (tw + gap), gap + Math.floor(k / cols) * (th + gap), tw, th));
  return cv;
}
