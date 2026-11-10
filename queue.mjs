#!/usr/bin/env node
// 승인 목록 화면. 이 PC 안에서만 열린다 (127.0.0.1).
// 사용법: node queue.mjs --dir <게시물 폴더들이 있는 상위 폴더> [--port 3200] [--open]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QueueError, applyAction, listItems, resolveItem, slidesOf } from './src/queue-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const root = option('--dir');
const port = Number(option('--port', 3200));
const shouldOpen = args.includes('--open');

if (!root || !fs.existsSync(root)) {
  console.error('사용법: node queue.mjs --dir <게시물 폴더들이 있는 상위 폴더> [--port 3200] [--open]');
  process.exit(2);
}

const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const pageUrl = `http://127.0.0.1:${port}`;

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
};
const sendJson = (res, status, data) => send(res, status, JSON.stringify(data));

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 100000) {
        reject(new QueueError('요청이 너무 큽니다'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

// 다른 웹사이트가 이 화면에 몰래 요청을 보내는 것을 막는다
function isTrusted(req) {
  if (!allowedHosts.has(req.headers.host ?? '')) return false;
  if (req.method === 'GET') return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  if (!allowedHosts.has(origin.replace(/^http:\/\//, ''))) return false;
  return (req.headers['content-type'] ?? '').startsWith('application/json');
}

function serveImage(res, url) {
  const id = url.searchParams.get('id') ?? '';
  const file = url.searchParams.get('file') ?? '';
  const dir = resolveItem(root, id);
  if (!slidesOf(dir).includes(file)) throw new QueueError('이미지를 찾을 수 없습니다');
  send(res, 200, fs.readFileSync(path.join(dir, file)), 'image/png');
}

const server = http.createServer(async (req, res) => {
  try {
    if (!isTrusted(req)) return sendJson(res, 403, { error: '허용되지 않은 요청입니다' });
    const url = new URL(req.url, pageUrl);

    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, fs.readFileSync(path.join(here, 'queue.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/items') return sendJson(res, 200, { items: listItems(root) });
    if (req.method === 'GET' && url.pathname === '/image') return serveImage(res, url);

    if (req.method === 'POST' && url.pathname === '/api/action') {
      const { id, action, note, url: link } = JSON.parse(await readBody(req));
      const state = applyAction(root, id, action, { note, url: link });
      return sendJson(res, 200, { state });
    }
    if (req.method === 'POST' && url.pathname === '/api/open') {
      const { id } = JSON.parse(await readBody(req));
      spawn('explorer.exe', [resolveItem(root, id)], { detached: true, stdio: 'ignore' }).unref();
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: '없는 주소입니다' });
  } catch (error) {
    if (error instanceof QueueError || error instanceof SyntaxError) return sendJson(res, 400, { error: error.message });
    console.error(error);
    return sendJson(res, 500, { error: '처리하지 못했습니다' });
  }
});

const openBrowser = () => {
  if (shouldOpen) spawn('cmd', ['/c', 'start', '', pageUrl], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
};

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`이미 실행 중입니다: ${pageUrl}`);
    openBrowser();
    setTimeout(() => process.exit(0), 500);
    return;
  }
  throw error;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`승인 목록: ${pageUrl}  (이 창을 닫으면 종료됩니다)`);
  openBrowser();
});
