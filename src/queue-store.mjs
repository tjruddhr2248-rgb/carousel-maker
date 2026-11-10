// 승인·발행 상태 관리. 결과 폴더(01.png … + caption.txt) 하나가 게시물 하나이고 상태는 그 폴더의 status.json에 저장한다.
// 승인 이후 이미지나 캡션이 바뀌면 승인은 자동으로 무효가 된다 (승인한 내용과 올리는 내용이 같아야 하므로).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STATE = { waiting: '승인대기', approved: '승인', rejected: '반려', published: '발행완료' };

const STATUS_FILE = 'status.json';
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.tmp']);
const SLIDE = /^\d+\.png$/;

export class QueueError extends Error {}

const isItem = (dir) => fs.existsSync(path.join(dir, 'caption.txt')) && fs.existsSync(path.join(dir, '01.png'));

export function findItemDirs(root, depth = 6) {
  const found = [];
  const walk = (dir, left) => {
    if (isItem(dir)) {
      found.push(dir);
      return;
    }
    if (left === 0) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), left - 1);
    }
  };
  walk(root, depth);
  return found;
}

export const slidesOf = (dir) => fs.readdirSync(dir).filter((f) => SLIDE.test(f)).sort();

export function contentHash(dir) {
  const hash = crypto.createHash('sha256');
  for (const file of [...slidesOf(dir), 'caption.txt']) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(dir, file)));
  }
  return hash.digest('hex');
}

function readRecord(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, STATUS_FILE), 'utf8'));
  } catch {
    return { state: STATE.waiting, history: [] };
  }
}

function writeRecord(dir, record) {
  const target = path.join(dir, STATUS_FILE);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(record, null, 2)}\n`);
  fs.renameSync(temp, target);
}

// 저장된 상태에 "승인 후 내용이 바뀌었는가"를 더한 실제 상태
function effective(dir, record) {
  const changed = Boolean(record.hash) && record.hash !== contentHash(dir);
  const invalidated = changed && (record.state === STATE.approved || record.state === STATE.rejected);
  return { state: invalidated ? STATE.waiting : record.state, changed: invalidated };
}

const toId = (root, dir) => path.relative(root, dir).split(path.sep).join('/');

export function listItems(root) {
  return findItemDirs(root)
    .map((dir) => {
      const record = readRecord(dir);
      const { state, changed } = effective(dir, record);
      return {
        id: toId(root, dir),
        name: path.basename(dir),
        state,
        changed,
        note: changed ? '' : record.note ?? '',
        url: record.url ?? '',
        updatedAt: record.updatedAt ?? '',
        history: record.history ?? [],
        slides: slidesOf(dir),
        caption: fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8'),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// 화면에서 받은 id는 실제로 찾은 폴더 목록과 대조한다. 경로로 직접 쓰지 않는다.
export function resolveItem(root, id) {
  const dir = findItemDirs(root).find((candidate) => toId(root, candidate) === id);
  if (!dir) throw new QueueError('게시물을 찾을 수 없습니다');
  return dir;
}

export function applyAction(root, id, action, { note = '', url = '', now = new Date() } = {}) {
  const dir = resolveItem(root, id);
  const record = readRecord(dir);
  const { state } = effective(dir, record);
  const trimmed = String(note).trim();
  let next;

  if (action === 'approve') {
    if (state !== STATE.waiting && state !== STATE.rejected) throw new QueueError(`${state} 상태는 승인할 수 없습니다`);
    next = STATE.approved;
  } else if (action === 'reject') {
    if (state !== STATE.waiting && state !== STATE.approved) throw new QueueError(`${state} 상태는 수정 요청할 수 없습니다`);
    if (!trimmed) throw new QueueError('수정 요청 내용을 적어 주세요');
    next = STATE.rejected;
  } else if (action === 'publish') {
    if (state !== STATE.approved) throw new QueueError('승인된 게시물만 발행 처리할 수 있습니다');
    if (url && !/^https:\/\/[^\s]+$/.test(url)) throw new QueueError('게시물 주소는 https로 시작해야 합니다');
    next = STATE.published;
  } else {
    throw new QueueError('알 수 없는 동작입니다');
  }

  const at = now.toISOString();
  writeRecord(dir, {
    state: next,
    hash: contentHash(dir),
    note: action === 'reject' ? trimmed : '',
    url: action === 'publish' ? url : '',
    updatedAt: at,
    history: [...(record.history ?? []), { at, from: state, to: next, note: trimmed, url: action === 'publish' ? url : '' }],
  });
  return next;
}
