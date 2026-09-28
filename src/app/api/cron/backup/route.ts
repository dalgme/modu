import { NextResponse } from 'next/server';

import { safeEqual } from '@/lib/auth/secret';
import { pruneOldBackups, runBackup } from '@/lib/ops/backup';

export const dynamic = 'force-dynamic';
// 전 테이블 페이지네이션 + 암호화 + 업로드. Vercel Pro 기준 300초. Hobby 플랜이면 최대 60 으로 낮춰야 배포된다 (docs/BACKUP-RESTORE.md).
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization'), `Bearer ${secret}`);
}

/**
 * Vercel Cron (매일 UTC 18:00 = KST 03:00): 플랫폼 자체 DB 백업 (P35-B).
 * - runBackup 이 backup_runs 에 ok/failed 를 남긴다. 실패는 500 으로 응답해 Vercel Cron 로그에도 빨갛게 남긴다(예외를 삼키지 않음).
 * - 성공 후 보존 정책(최근 30개 유지·30일 경과분 삭제) 적용. 정리 실패는 백업 성공과 별개로 응답에만 표시.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runBackup({ kind: 'daily' });
  if (result.status === 'failed') {
    return NextResponse.json({ ok: false, runId: result.runId, error: result.error, tables: result.tables }, { status: 500 });
  }
  let pruned = 0;
  let pruneError: string | null = null;
  try {
    pruned = await pruneOldBackups();
  } catch (e) {
    pruneError = e instanceof Error ? e.message : String(e);
    console.error('[backup] 보존 정리 실패', pruneError);
  }
  return NextResponse.json({
    ok: true,
    runId: result.runId,
    path: result.storagePath,
    bytes: result.bytes,
    tables: Object.keys(result.tables).length,
    rows: Object.values(result.tables).reduce((a, b) => a + b, 0),
    durationMs: result.durationMs,
    pruned,
    pruneError,
  });
}
