import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { STATE, applyAction, listItems } from '../src/queue-store.mjs';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-'));
  const dir = path.join(root, '2026-11', 'post-a');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '01.png'), 'image-1');
  fs.writeFileSync(path.join(dir, '02.png'), 'image-2');
  fs.writeFileSync(path.join(dir, 'caption.txt'), '캡션');
  return { root, dir, id: '2026-11/post-a' };
}

const stateOf = (root) => listItems(root)[0];

test('새 게시물은 승인대기로 잡힌다', () => {
  const { root } = setup();
  const item = stateOf(root);
  assert.equal(item.state, STATE.waiting);
  assert.deepEqual(item.slides, ['01.png', '02.png']);
});

test('승인 없이는 발행 처리되지 않는다', () => {
  const { root, id } = setup();
  assert.throws(() => applyAction(root, id, 'publish'), /승인된 게시물만/);
  assert.equal(stateOf(root).state, STATE.waiting);
});

test('승인 후 발행 처리되고 이력이 남는다', () => {
  const { root, id } = setup();
  applyAction(root, id, 'approve');
  applyAction(root, id, 'publish', { url: 'https://www.instagram.com/p/abc/' });
  const item = stateOf(root);
  assert.equal(item.state, STATE.published);
  assert.equal(item.history.length, 2);
  assert.equal(item.url, 'https://www.instagram.com/p/abc/');
});

test('승인 후 이미지가 바뀌면 승인이 풀리고 발행이 막힌다', () => {
  const { root, dir, id } = setup();
  applyAction(root, id, 'approve');
  fs.writeFileSync(path.join(dir, '01.png'), 'image-changed');
  const item = stateOf(root);
  assert.equal(item.state, STATE.waiting);
  assert.equal(item.changed, true);
  assert.throws(() => applyAction(root, id, 'publish'), /승인된 게시물만/);
});

test('승인 후 캡션이 바뀌어도 승인이 풀린다', () => {
  const { root, dir, id } = setup();
  applyAction(root, id, 'approve');
  fs.writeFileSync(path.join(dir, 'caption.txt'), '바뀐 캡션');
  assert.equal(stateOf(root).state, STATE.waiting);
});

test('수정 요청은 내용이 있어야 하고, 다시 만들면 승인대기로 돌아온다', () => {
  const { root, dir, id } = setup();
  assert.throws(() => applyAction(root, id, 'reject', { note: '  ' }), /수정 요청 내용/);
  applyAction(root, id, 'reject', { note: '표지 문구 수정' });
  assert.equal(stateOf(root).state, STATE.rejected);
  assert.equal(stateOf(root).note, '표지 문구 수정');
  fs.writeFileSync(path.join(dir, '01.png'), 'image-fixed');
  assert.equal(stateOf(root).state, STATE.waiting);
});

test('발행 완료는 되돌리거나 다시 발행할 수 없다', () => {
  const { root, id } = setup();
  applyAction(root, id, 'approve');
  applyAction(root, id, 'publish');
  assert.throws(() => applyAction(root, id, 'approve'), /승인할 수 없습니다/);
  assert.throws(() => applyAction(root, id, 'publish'), /승인된 게시물만/);
});

test('목록에 없는 경로와 잘못된 주소는 거부한다', () => {
  const { root, id } = setup();
  assert.throws(() => applyAction(root, '../../etc', 'approve'), /찾을 수 없습니다/);
  applyAction(root, id, 'approve');
  assert.throws(() => applyAction(root, id, 'publish', { url: 'javascript:alert(1)' }), /https/);
  assert.equal(stateOf(root).state, STATE.approved);
});
