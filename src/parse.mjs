// 원고 파일(.md/.txt) → 구조화된 캐러셀 데이터 + 필드 검증 오류 목록
// 형식: 머리말(키: 값) → "---" → 슬라이드 블록들("---"로 구분)

const KEYS = { 제목: 'title', 대상: 'target', 부제: 'subtitle', CTA: 'cta', 태그: 'tags', 후킹: 'hook', 핵심: 'points' };
const EMOJI = /\p{Extended_Pictographic}/u;

export function parse(text, brand) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const errors = [];
  const meta = { points: [], tags: [] };
  const slides = [];

  let i = 0;
  // 머리말
  for (; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === '---') { i++; break; }
    if (!raw || raw.startsWith('//')) continue;
    const m = raw.match(/^([^:：]+)[:：]\s*(.*)$/);
    if (!m) { errors.push(`[원고 ${i + 1}줄] "키: 값" 형식이 아닙니다 → "${raw}"`); continue; }
    const key = KEYS[m[1].trim()];
    if (!key) { errors.push(`[원고 ${i + 1}줄] 모르는 항목 "${m[1].trim()}" (쓸 수 있는 항목: ${Object.keys(KEYS).join(', ')})`); continue; }
    if (key === 'points') meta.points.push(m[2].trim());
    else if (key === 'tags') meta.tags.push(...m[2].split(/\s+/).filter(Boolean));
    else meta[key] = m[2].trim();
  }

  // 슬라이드 블록
  let block = null;
  const flush = () => { if (block) slides.push(block); block = null; };
  for (; i < lines.length; i++) {
    const raw = lines[i].replace(/\s+$/, '');
    if (raw.trim() === '---') { if (!block) slides.push({ line: i + 1, headline: '', body: [] }); flush(); continue; }
    if (!block) {
      if (!raw.trim()) continue;
      block = { line: i + 1, headline: raw.trim(), body: [] };
      continue;
    }
    block.body.push(raw);
  }
  flush();
  for (const s of slides) {
    while (s.body.length && !s.body[s.body.length - 1].trim()) s.body.pop();
  }

  // 필드 검증
  for (const [ko, key] of [['제목', 'title'], ['대상', 'target'], ['CTA', 'cta']]) {
    if (!meta[key]) errors.push(`[머리말] 필수 항목 "${ko}:"이 없습니다`);
  }
  if (meta.cta && !brand.cta[meta.cta]) {
    errors.push(`[머리말] CTA "${meta.cta}"는 쓸 수 없습니다 (가능: ${Object.keys(brand.cta).join(' / ')})`);
  }
  const { minSteps, maxSteps } = brand.limits;
  const filled = slides.filter((s) => s.headline);
  slides.forEach((s, k) => {
    if (!s.headline) errors.push(`[${k + 2}번 슬라이드 · 원고 ${s.line}줄] 내용이 비어 있습니다 ("---" 두 개가 연달아 있음)`);
  });
  if (filled.length < minSteps || filled.length > maxSteps) {
    errors.push(`[슬라이드] 본문 슬라이드는 ${minSteps}~${maxSteps}장이어야 합니다 (지금 ${filled.length}장)`);
  }
  for (const t of meta.tags) {
    if (!/^#[^\s#]+$/.test(t)) errors.push(`[태그] "${t}" — 해시태그는 #으로 시작하고 띄어쓰기가 없어야 합니다`);
  }

  // 이미지에 들어가는 글자 점검 (이모지는 글꼴에 없어 네모로 깨짐)
  const imageTexts = [['표지 제목', meta.title], ['표지 대상', meta.target], ['표지 부제', meta.subtitle]];
  slides.forEach((s, k) => imageTexts.push([`${k + 2}번 슬라이드`, [s.headline, ...s.body].join('\n')]));
  for (const [where, t] of imageTexts) {
    if (t && EMOJI.test(t)) errors.push(`[${where}] 이모지는 이미지에서 깨집니다 → 지우세요 (캡션 "후킹:"에는 써도 됩니다)`);
  }

  return { meta, slides, errors };
}

// 금지어는 이미지 + 캡션 전체를 본다
export function findBanned(meta, slides, caption, brand) {
  const out = [];
  const where = [['표지', [meta.title, meta.target, meta.subtitle].join(' ')], ['캡션', caption]];
  slides.forEach((s, k) => where.push([`${k + 2}번 슬라이드`, [s.headline, ...s.body].join(' ')]));
  for (const [w, t] of where) {
    for (const word of brand.bannedWords) {
      if (t && t.includes(word)) out.push(`[${w}] 금지어 "${word}" — 효과 보장·절대 표현은 쓰지 않습니다`);
    }
  }
  return out;
}

export function buildCaption(meta, slides, brand) {
  const hook = meta.hook || meta.title;
  const points = meta.points.length ? meta.points : slides.map((s, k) => `${k + 1}) ${s.headline}`);
  const seen = new Set();
  const tags = [...brand.baseTags, ...meta.tags].filter((t) => !seen.has(t) && seen.add(t));
  const ctaLine = brand.cta[meta.cta]?.caption ?? '';
  const caption = [hook, '', ...points, '', ctaLine, '', tags.join(' ')].join('\n');
  const errors = [];
  if (tags.length > brand.limits.tagsMax) errors.push(`[캡션] 해시태그 ${tags.length}개 — 인스타 한도 ${brand.limits.tagsMax}개를 넘습니다`);
  if (caption.length > brand.limits.captionMax) errors.push(`[캡션] ${caption.length}자 — 인스타 한도 ${brand.limits.captionMax}자를 넘습니다`);
  return { caption, errors };
}
