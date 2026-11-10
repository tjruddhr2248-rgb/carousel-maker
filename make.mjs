#!/usr/bin/env node
// 사용법: node make.mjs <원고파일> [--out 출력폴더]
// 결과: <출력폴더>/<원고이름>/01.png … NN.png, caption.txt, preview.png
// 종료 코드: 0 성공 · 1 원고 오류(파일 안 만듦) · 2 사용법/파일 없음
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, buildCaption, findBanned } from './src/parse.mjs';
import { layoutAll, draw, contactSheet } from './src/render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outRoot = outIdx >= 0 ? args.splice(outIdx, 2)[1] : path.join(here, 'out');
const input = args[0];

if (!input) {
  console.error('사용법: node make.mjs <원고파일> [--out 출력폴더]\n예시: node make.mjs examples/01-ai-intro-order.md');
  process.exit(2);
}
if (!fs.existsSync(input)) {
  console.error(`원고 파일을 찾을 수 없습니다: ${input}`);
  process.exit(2);
}

const brand = JSON.parse(fs.readFileSync(path.join(here, 'brand.json'), 'utf8'));
const { meta, slides, errors } = parse(fs.readFileSync(input, 'utf8'), brand);

// 표지·CTA를 그릴 수 있으면 넘침·캡션·금지어까지 한 번에 검사 (빠진 항목 때문에 생기는 2차 오류는 막는다)
let pages = [];
let caption = '';
if (meta.title && meta.target && brand.cta[meta.cta]) {
  const lay = layoutAll(meta, slides, brand);
  pages = lay.pages;
  const cap = buildCaption(meta, slides, brand);
  caption = cap.caption;
  errors.push(...lay.errors, ...cap.errors, ...findBanned(meta, slides, caption, brand));
}

if (errors.length) {
  console.error(`✖ 원고 오류 ${errors.length}건 — 이미지를 만들지 않았습니다 (${path.basename(input)})`);
  for (const e of errors) console.error(`  · ${e}`);
  process.exit(1);
}

const name = path.basename(input, path.extname(input));
const outDir = path.join(outRoot, name);
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/^\d+\.png$/.test(f)) fs.rmSync(path.join(outDir, f)); // 이전 실행의 남은 장 정리

const t0 = Date.now();
const canvases = pages.map((p, k) => draw(p, k + 1, pages.length, brand));
canvases.forEach((cv, k) => fs.writeFileSync(path.join(outDir, `${String(k + 1).padStart(2, '0')}.png`), cv.toBuffer('image/png')));
fs.writeFileSync(path.join(outDir, 'caption.txt'), caption + '\n', 'utf8');
fs.writeFileSync(path.join(outDir, 'preview.png'), contactSheet(canvases).toBuffer('image/png'));

console.log(`✔ 완료 (${((Date.now() - t0) / 1000).toFixed(1)}초) — 이미지 ${pages.length}장 + 캡션`);
console.log(`  폴더: ${outDir}`);
console.log('  ─── 캡션 미리보기 ───');
console.log(caption.split('\n').map((l) => `  ${l}`).join('\n'));
