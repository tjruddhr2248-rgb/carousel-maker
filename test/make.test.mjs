// npm test — 정상 1건 + 예외 3건을 실제 CLI로 실행해 결과를 확인한다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (file, out) => spawnSync(process.execPath, ['make.mjs', file, '--out', out], { cwd: root, encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'carousel-'));
const pngSize = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('정상 원고 → 1080×1350 PNG 7장 + 캡션 + 미리보기', () => {
  const out = tmp();
  const r = run('examples/01-ai-intro-order.md', out);
  assert.equal(r.status, 0, r.stderr);
  const dir = path.join(out, '01-ai-intro-order');
  const pngs = fs.readdirSync(dir).filter((f) => /^\d+\.png$/.test(f));
  assert.equal(pngs.length, 7); // 표지 1 + 단계 5 + CTA 1
  for (const f of pngs) assert.deepEqual(pngSize(path.join(dir, f)), [1080, 1350]);
  const cap = fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8');
  assert.match(cap, /^AI 툴 10개 비교하다/); // 첫 줄 = 후킹
  assert.match(cap, /저장해 두고 오늘 하나만 따라 해 보세요\./); // CTA 1줄
  assert.match(cap, /#웅케팅/); // 기본 해시태그
  assert.ok(fs.existsSync(path.join(dir, 'preview.png')));
});

test('필수 항목 누락·잘못된 CTA·빈 슬라이드 → 오류 3건, 파일 안 만듦', () => {
  const out = tmp();
  const r = run('examples/error-missing.md', out);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /원고 오류 3건/);
  assert.match(r.stderr, /필수 항목 "대상:"/);
  assert.match(r.stderr, /CTA "좋아요"는 쓸 수 없습니다/);
  assert.match(r.stderr, /3번 슬라이드 · 원고 8줄\] 내용이 비어/);
  assert.equal(fs.readdirSync(out).length, 0);
});

test('글자 넘침·금지어·이모지·해시태그 형식 → 오류 6건, 파일 안 만듦', () => {
  const out = tmp();
  const r = run('examples/error-overflow.md', out);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /원고 오류 6건/);
  assert.match(r.stderr, /2번 슬라이드 · 원고 7줄\] 제목이 4줄/);
  assert.match(r.stderr, /px 넘칩니다/);
  assert.match(r.stderr, /금지어 "무조건"/);
  assert.match(r.stderr, /이모지는 이미지에서 깨집니다/);
  assert.match(r.stderr, /"매출올리기" — 해시태그는/);
  assert.equal(fs.readdirSync(out).length, 0);
});

test('없는 파일 → 종료 코드 2', () => {
  const r = run('examples/없는파일.md', tmp());
  assert.equal(r.status, 2);
  assert.match(r.stderr, /찾을 수 없습니다/);
});
