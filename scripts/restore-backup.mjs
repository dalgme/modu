#!/usr/bin/env node
/**
 * 플랫폼 자체 백업 파일 복호화·열람 (P35-B, docs/BACKUP-RESTORE.md)
 *
 * 무엇을 하나: 스토리지 버킷 backups 의 암호화 백업(.jsonl.enc)을 내려받아 복호화하고, 지정한 테이블의 행을 JSON Lines 로 표준출력에 쓴다.
 *              **DB 에 자동으로 넣지 않는다** — 복원은 사람이 출력을 검토한 뒤 수동(SQL/Studio)으로 한다 (자동 upsert 금지).
 *
 * 사용법 (로컬, 운영 Supabase 의 서비스롤 키·SMS_KEK 가 필요):
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... SMS_KEK=... \
 *     node scripts/restore-backup.mjs --list                          # 백업 파일 목록(최근 순)
 *     node scripts/restore-backup.mjs --path 2026/2026-09-28T0300.jsonl.enc --tables            # 그 파일에 든 테이블·행 수
 *     node scripts/restore-backup.mjs --path 2026/2026-09-28T0300.jsonl.enc --table cases > cases.jsonl   # 한 테이블을 JSONL 로
 *     node scripts/restore-backup.mjs --path ... --table cases --where id=UUID                   # 특정 행만(단순 등호 필터)
 *     node scripts/restore-backup.mjs --file ./local.jsonl.enc --table users                      # 이미 내려받은 파일
 *
 * 파일 형식: "MODUBK1"(7B) | iv(12B) | tag(16B) | AES-256-GCM 암호문. 키 = HMAC-SHA256(SMS_KEK, 'backup'). AAD = 스토리지 경로.
 *   → --file 로 로컬 파일을 열 때도 원래 스토리지 경로를 --path 로 함께 줘야 AAD 가 맞는다.
 *   → SMS_KEK 를 교체했다면 그 백업이 만들어질 당시의 KEK 를 SMS_KEK 에 넣어야 열린다.
 */
import { createDecipheriv, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(`--${name}`);

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEK_RAW = process.env.SMS_KEK;
const BUCKET = 'backups';
const MAGIC = Buffer.from('MODUBK1');

function kek() {
  if (!KEK_RAW) throw new Error('SMS_KEK 가 필요합니다.');
  const buf = /^[0-9a-fA-F]{64}$/.test(KEK_RAW) ? Buffer.from(KEK_RAW, 'hex') : Buffer.from(KEK_RAW, 'base64');
  if (buf.length !== 32) throw new Error('SMS_KEK 형식 오류 (64자리 hex 또는 base64 32바이트)');
  return createHmac('sha256', buf).update('backup').digest();
}

function decrypt(sealed, aad) {
  if (!sealed.subarray(0, 7).equals(MAGIC)) throw new Error('백업 파일 형식이 아닙니다 (magic 불일치)');
  const iv = sealed.subarray(7, 19);
  const tag = sealed.subarray(19, 35);
  const ct = sealed.subarray(35);
  const d = createDecipheriv('aes-256-gcm', kek(), iv);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

async function storageFetch(path, init = {}) {
  if (!URL_ || !KEY) throw new Error('SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  const res = await fetch(`${URL_}/storage/v1/${path}`, { ...init, headers: { apikey: KEY, authorization: `Bearer ${KEY}`, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`storage ${path}: ${res.status} ${await res.text()}`);
  return res;
}

async function list() {
  // 연도 폴더 → 파일. 최근 순으로 출력.
  const years = await (await storageFetch(`object/list/${BUCKET}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 100 }) })).json();
  const out = [];
  for (const y of years) {
    if (!/^\d{4}$/.test(y.name)) continue;
    const files = await (await storageFetch(`object/list/${BUCKET}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix: `${y.name}/`, limit: 1000, sortBy: { column: 'name', order: 'desc' } }) })).json();
    for (const f of files) out.push({ path: `${y.name}/${f.name}`, size: f.metadata?.size ?? null, updated: f.updated_at });
  }
  out.sort((a, b) => (a.path < b.path ? 1 : -1));
  for (const f of out) console.log(`${f.path}\t${f.size ?? '-'} B\t${f.updated ?? ''}`);
  if (out.length === 0) console.log('(백업 파일 없음)');
}

async function main() {
  if (flag('list')) return list();
  const path = opt('path');
  const file = opt('file');
  if (!path && !file) {
    console.error('사용법: --list | --path <스토리지 경로> [--tables | --table <이름> [--where col=val]] | --file <로컬 파일> --path <원래 경로> --table <이름>');
    process.exit(2);
  }
  const aad = path ?? file;
  const sealed = file ? readFileSync(file) : Buffer.from(await (await storageFetch(`object/${BUCKET}/${path}`)).arrayBuffer());
  const text = decrypt(sealed, aad);
  const lines = text.split('\n').filter(Boolean);
  const meta = JSON.parse(lines[0])._meta;
  console.error(`# 백업 ${meta.startedAt} (${meta.kind}) · 테이블 ${meta.tables.length}개 · 행 ${lines.length - 1}`);

  const table = opt('table');
  if (flag('tables') || !table) {
    const counts = {};
    for (let i = 1; i < lines.length; i++) {
      const t = JSON.parse(lines[i])._table;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    for (const t of meta.tables) console.log(`${t}\t${counts[t] ?? 0}`);
    return;
  }
  const where = opt('where');
  let filter = null;
  if (where) {
    const [col, ...rest] = where.split('=');
    filter = { col, val: rest.join('=') };
  }
  let n = 0;
  for (let i = 1; i < lines.length; i++) {
    const rec = JSON.parse(lines[i]);
    if (rec._table !== table) continue;
    if (filter && String(rec.row[filter.col]) !== filter.val) continue;
    process.stdout.write(JSON.stringify(rec.row) + '\n');
    n += 1;
  }
  console.error(`# ${table}: ${n}행 출력. DB 에 넣기 전에 반드시 검토하세요 (자동 복원 없음).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
