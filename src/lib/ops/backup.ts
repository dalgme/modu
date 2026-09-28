import 'server-only';

import { createCipheriv, createHmac, randomBytes } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll } from '@/lib/supabase/paginate';
import type { Json, Tables } from '@/types/database';

/**
 * 플랫폼 자체 DB 백업 (P35-B, docs/BACKUP-RESTORE.md · docs/SECURITY-POLICY.md R-10).
 *  - 사용자 결정: 추가 비용 없이. Supabase 유료 PITR 대신 서비스롤로 public 스키마 전 테이블을 읽어 JSON Lines 로 직렬화한다.
 *  - 테이블 목록은 DB 함수 `list_public_tables()`(0087, service_role 전용) — 코드에 테이블 이름을 하드코딩하지 않는다.
 *  - 암호화: SMS_KEK 에서 HMAC 파생한 전용 키(info 'backup')로 AES-256-GCM. 파일 형식은 아래 FORMAT 참고. 복호화는 scripts/restore-backup.mjs.
 *  - 저장: 스토리지 버킷 backups(비공개) `/{yyyy}/{yyyy-mm-dd}T{hhmm}.jsonl.enc`. 실행 기록은 backup_runs.
 *  - 보존: 최근 30개는 항상 유지, 그 밖에 30일 지난 파일 삭제(pruneOldBackups).
 *  - 스토리지 문서 파일(documents/photos/signatures 버킷)은 크기 때문에 **백업 대상이 아니다**. documents 표(메타데이터: 경로·doc_key·케이스)만 들어간다.
 *
 * FORMAT (바이너리): magic "MODUBK1"(7B) | iv(12B) | tag(16B) | ciphertext
 *   평문 = JSON Lines. 첫 줄 {"_meta":{version:1, startedAt, tables:[...]}} 이후 {"_table":"cases","row":{...}} 한 행씩.
 *   AAD = 스토리지 경로 (다른 경로로 옮겨 붙이면 복호화 실패).
 */

export type BackupRunRow = Tables<'backup_runs'>;

export const BACKUP_BUCKET = 'backups';
export const BACKUP_MAGIC = Buffer.from('MODUBK1');
export const BACKUP_KEEP_COUNT = 30;
export const BACKUP_KEEP_DAYS = 30;
const HKDF_INFO = 'backup';

function kek(): Buffer | null {
  const raw = process.env.SMS_KEK;
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

/** 백업 전용 키 = HMAC-SHA256(KEK, 'backup'). SMS_KEK 를 바꾸면 이전 백업은 이전 KEK 로만 열린다(문서에 명시). */
export function deriveBackupKey(kekBuf: Buffer): Buffer {
  return createHmac('sha256', kekBuf).update(HKDF_INFO).digest();
}

export function backupKeyConfigured(): boolean {
  return kek() !== null;
}

export function encryptBackup(plain: Buffer, key: Buffer, aad: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_MAGIC, iv, tag, ct]);
}

/** KST 기준 경로: {yyyy}/{yyyy-mm-dd}T{hhmm}.jsonl.enc */
export function backupStoragePath(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}/${y}-${mm}-${dd}T${hh}${mi}.jsonl.enc`;
}

export interface BackupResult {
  runId: string;
  status: 'ok' | 'failed';
  storagePath: string | null;
  bytes: number;
  tables: Record<string, number>;
  error: string | null;
  durationMs: number;
}

/**
 * 백업 1회 실행. backup_runs 에 running → ok/failed 로 남긴다. 실패 원인은 error 컬럼 + 반환값(예외를 삼키지 않고 기록한 뒤 던지지 않는다 — Cron 응답으로 돌려준다).
 * `startedBy` 는 [지금 백업] 실행자(플랫폼 owner). Cron 은 null.
 */
export async function runBackup(opts: { kind: 'daily' | 'manual'; startedBy?: string | null }): Promise<BackupResult> {
  const admin = createAdminClient();
  const startedAt = new Date();
  const { data: run, error: runError } = await admin
    .from('backup_runs')
    .insert({ kind: opts.kind, status: 'running', started_by: opts.startedBy ?? null })
    .select('id')
    .single();
  if (runError || !run) throw new Error(`backup_runs insert 실패: ${runError?.message ?? 'no row'}`);

  const tables: Record<string, number> = {};
  let storagePath: string | null = null;
  let bytes = 0;
  try {
    const k = kek();
    if (!k) throw new Error('SMS_KEK 가 설정되지 않아 백업을 암호화할 수 없습니다.');
    const key = deriveBackupKey(k);

    const { data: list, error: listError } = await admin.rpc('list_public_tables');
    if (listError) throw new Error(`list_public_tables: ${listError.message}`);
    const targets = (list ?? []).filter((t) => t.table_name !== 'backup_runs');
    if (targets.length === 0) throw new Error('백업 대상 테이블이 없습니다 (마이그레이션 0087 적용 여부 확인).');

    const lines: string[] = [];
    lines.push(JSON.stringify({ _meta: { version: 1, startedAt: startedAt.toISOString(), kind: opts.kind, tables: targets.map((t) => t.table_name) } }));
    for (const t of targets) {
      const name = t.table_name;
      const rows = await fetchAll<Record<string, unknown>>((from, to) => {
        // 안정된 페이지네이션을 위해 기본키 순으로 읽는다 (기본키 없는 표는 순서 없이)
        let q = admin.from(name as never).select('*');
        for (const col of t.pk_columns ?? []) q = q.order(col as never, { ascending: true });
        return q.range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      });
      tables[name] = rows.length;
      for (const row of rows) lines.push(JSON.stringify({ _table: name, row }));
    }
    const plain = Buffer.from(lines.join('\n') + '\n', 'utf8');
    storagePath = backupStoragePath(startedAt);
    const sealed = encryptBackup(plain, key, storagePath);
    bytes = sealed.length;

    const { error: upError } = await admin.storage.from(BACKUP_BUCKET).upload(storagePath, sealed, { contentType: 'application/octet-stream', upsert: false });
    if (upError) throw new Error(`스토리지 업로드 실패: ${upError.message}`);

    const { error: okError } = await admin
      .from('backup_runs')
      .update({ status: 'ok', finished_at: new Date().toISOString(), tables: tables as Json, bytes, storage_path: storagePath })
      .eq('id', run.id);
    if (okError) throw new Error(`backup_runs 갱신 실패: ${okError.message}`);
    return { runId: run.id, status: 'ok', storagePath, bytes, tables, error: null, durationMs: Date.now() - startedAt.getTime() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[backup] 실패', message);
    const { error: failError } = await admin
      .from('backup_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), tables: tables as Json, bytes: bytes || null, storage_path: storagePath, error: message.slice(0, 1000) })
      .eq('id', run.id);
    if (failError) console.error('[backup] 실패 기록 갱신 실패', failError.message);
    return { runId: run.id, status: 'failed', storagePath, bytes, tables, error: message, durationMs: Date.now() - startedAt.getTime() };
  }
}

/**
 * 보존 정책: 성공한 백업 중 최근 BACKUP_KEEP_COUNT 개는 유지, 그 밖에 BACKUP_KEEP_DAYS 일 지난 파일을 삭제하고 pruned_at 을 기록한다.
 * 실행 기록(backup_runs 행)은 지우지 않는다. 반환: 삭제한 파일 수. 삭제 실패는 예외.
 */
export async function pruneOldBackups(now = new Date()): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('backup_runs')
    .select('id, started_at, storage_path')
    .eq('status', 'ok')
    .is('pruned_at', null)
    .not('storage_path', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const cutoff = now.getTime() - BACKUP_KEEP_DAYS * 86_400_000;
  const victims = rows.slice(BACKUP_KEEP_COUNT).filter((r) => new Date(r.started_at).getTime() < cutoff);
  if (victims.length === 0) return 0;
  const paths = victims.map((r) => r.storage_path).filter((p): p is string => !!p);
  const { error: rmError } = await admin.storage.from(BACKUP_BUCKET).remove(paths);
  if (rmError) throw new Error(`백업 파일 삭제 실패: ${rmError.message}`);
  const { error: upError } = await admin
    .from('backup_runs')
    .update({ pruned_at: now.toISOString() })
    .in(
      'id',
      victims.map((r) => r.id),
    );
  if (upError) throw new Error(upError.message);
  return victims.length;
}

export interface BackupStatus {
  keyConfigured: boolean;
  lastOk: Pick<BackupRunRow, 'started_at' | 'finished_at' | 'bytes' | 'storage_path' | 'tables'> | null;
  lastRun: BackupRunRow | null;
  recent: BackupRunRow[];
  /** 마지막 성공이 이 시간(시간 단위)보다 오래됐으면 경고 */
  staleHours: number | null;
}

/** 플랫폼 콘솔용 — 마지막 성공·최근 N회 */
export async function getBackupStatus(limit = 7): Promise<BackupStatus> {
  const admin = createAdminClient();
  const [{ data: recent, error }, { data: lastOk }] = await Promise.all([
    admin.from('backup_runs').select('*').order('started_at', { ascending: false }).limit(limit),
    admin.from('backup_runs').select('started_at, finished_at, bytes, storage_path, tables').eq('status', 'ok').order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const rows = recent ?? [];
  const staleHours = lastOk ? Math.floor((Date.now() - new Date(lastOk.started_at).getTime()) / 3600_000) : null;
  return { keyConfigured: backupKeyConfigured(), lastOk: lastOk ?? null, lastRun: rows[0] ?? null, recent: rows, staleHours };
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
