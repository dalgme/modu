import { requirePlatformAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { countSecurityEvents, listRecentSecurityEvents, SECURITY_SEVERITY_LABELS, securityKindLabel, type RecentSecurityEvents, type SecurityEventCounts } from '@/lib/ops/security-events';
import { formatBytes, getBackupStatus, type BackupStatus } from '@/lib/ops/backup';
import { kstDateString, retentionExpiry } from '@/lib/ops/retention';
import { BackupNowButton } from '@/components/platform/backup-now-button';
import { formatDateTime, formatNumber } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const SEV_CLASS: Record<string, string> = {
  info: 'bg-muted text-muted-foreground',
  warn: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
};
const KIND_ORDER = ['bruteforce', 'scan', 'export', 'denied', 'impersonation'];

interface RetentionRow {
  id: string;
  name: string;
  endsOn: string | null;
  years: number;
  expiry: Date;
  noticeAt: string | null;
}

/** 보존 만료 예정(90일 내) 또는 이미 지난 행사 */
async function listRetentionDue(): Promise<RetentionRow[]> {
  const { data } = await createAdminClient().from('programs').select('id, name, ends_on, retention_years, retention_notice_sent_at').not('ends_on', 'is', null);
  const horizon = Date.now() + 90 * 86_400_000;
  const rows: RetentionRow[] = [];
  for (const p of data ?? []) {
    const expiry = retentionExpiry(p.ends_on, p.retention_years);
    if (!expiry || expiry.getTime() > horizon) continue;
    rows.push({ id: p.id, name: p.name, endsOn: p.ends_on, years: p.retention_years, expiry, noticeAt: p.retention_notice_sent_at });
  }
  return rows.sort((a, b) => a.expiry.getTime() - b.expiry.getTime());
}

function detailText(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return '-';
  const entries = Object.entries(detail as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return '-';
  return entries.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
}

/** 보안 이벤트 · 백업 현황 · 보존 만료 (P35-B). 표를 읽지 못하면(마이그레이션 전) 안내만 띄우고 페이지는 그린다. */
export default async function Page() {
  const me = await requirePlatformAdmin();
  const isOwner = me.platform_role === 'owner';
  const [recent, week, backup, retention] = await Promise.all([
    listRecentSecurityEvents({ hours: 24, limit: 100 }).catch((): RecentSecurityEvents | null => null),
    countSecurityEvents({ hours: 24 * 7 }).catch((): SecurityEventCounts | null => null),
    getBackupStatus(7).catch((): BackupStatus | null => null),
    listRetentionDue().catch((): RetentionRow[] => []),
  ]);
  const kinds = Array.from(new Set([...KIND_ORDER, ...Object.keys(recent?.counts.byKind ?? {}), ...Object.keys(week?.byKind ?? {})]));
  const backupStale = backup?.staleHours != null && backup.staleHours > 26;

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">보안 이벤트</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          해킹 시도·이상 접근 자동 감지(스캐너·요청 폭주·로그인 실패 폭주·대량 반출·권한 거부·대행), 암호화 백업 현황, 개인정보 보존기간 만료 예정 행사입니다.
          주의 이상 이벤트는 5분 내 플랫폼 관리자 휴대폰으로 문자(30분 쿨다운, 심각은 즉시).
        </p>
      </div>

      {/* 종류별 건수 — 24시간 / 7일 */}
      <section className="rounded-xl border bg-background">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="text-base font-semibold">종류별 건수</h2>
          {recent && (
            <span className="flex gap-1.5">
              {(['critical', 'warn', 'info'] as const).map((s) => (
                <span key={s} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEV_CLASS[s]}`}>
                  {SECURITY_SEVERITY_LABELS[s]} {formatNumber(recent.counts.bySeverity[s])}
                </span>
              ))}
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">24시간 · 7일</span>
        </div>
        {!recent || !week ? (
          <p className="px-4 py-6 text-sm text-amber-700">보안 이벤트 표를 읽지 못했습니다. 마이그레이션 0087(security_events) 적용 여부를 확인하세요.</p>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
            {kinds.map((k) => (
              <div key={k} className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="text-xs text-muted-foreground">{securityKindLabel(k)}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatNumber(recent.counts.byKind[k] ?? 0)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">/ 7일 {formatNumber(week.byKind[k] ?? 0)}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 최근 이벤트 100건 */}
      <section className="rounded-xl border bg-background">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="text-base font-semibold">최근 24시간 이벤트</h2>
          {recent && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">최근 {recent.rows.length}건 표시</span>}
          <span className="ml-auto text-xs text-muted-foreground">IP 는 해시 앞자리만 저장 · 반출은 같은 사용자 5회/10분, 권한 거부 10회/10분이면 주의로 승격</span>
        </div>
        {!recent ? null : recent.rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">이벤트 없음</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">시각</th>
                  <th className="px-4 py-2 text-left font-medium">종류</th>
                  <th className="px-4 py-2 text-left font-medium">심각도</th>
                  <th className="px-4 py-2 text-left font-medium">경로</th>
                  <th className="px-4 py-2 text-left font-medium">사용자</th>
                  <th className="px-4 py-2 text-left font-medium">IP 해시</th>
                  <th className="px-4 py-2 text-left font-medium">상세</th>
                  <th className="px-4 py-2 text-left font-medium">통보</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs font-medium">{securityKindLabel(r.kind)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEV_CLASS[r.severity] ?? SEV_CLASS.info}`}>{SECURITY_SEVERITY_LABELS[r.severity] ?? r.severity}</span>
                    </td>
                    <td className="max-w-[14rem] break-all px-4 py-2 font-mono text-xs">{r.path ?? '-'}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.userName ? (
                        <>
                          {r.userName}
                          {r.userEmail && <span className="block text-muted-foreground">{r.userEmail}</span>}
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.ipHash ?? '-'}</td>
                    <td className="max-w-[22rem] break-all px-4 py-2 text-xs text-muted-foreground">{detailText(r.detail)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{r.alertedAt ? '처리' : '대기'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 백업 현황 */}
      <section className={`rounded-xl border bg-background ${backupStale ? 'border-amber-300' : ''}`}>
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="text-base font-semibold">백업 현황</h2>
          {backup?.lastOk ? (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${backupStale ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              마지막 성공 {formatDateTime(backup.lastOk.started_at)} ({backup.staleHours}시간 전) · {formatBytes(backup.lastOk.bytes)}
            </span>
          ) : (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">성공한 백업 없음</span>
          )}
          <div className="ml-auto">
            <BackupNowButton isOwner={isOwner} keyConfigured={backup?.keyConfigured ?? false} />
          </div>
        </div>
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          매일 KST 03:00 전 테이블을 JSON Lines 로 읽어 AES-256-GCM(SMS_KEK 파생 키)으로 암호화해 비공개 버킷 backups 에 저장합니다. 최근 30개 유지·30일 경과분 삭제.
          문서 파일(documents 버킷)은 크기 때문에 메타데이터만 포함됩니다. 복원 절차는 docs/BACKUP-RESTORE.md.
        </p>
        {!backup ? (
          <p className="px-4 py-6 text-sm text-amber-700">백업 기록 표를 읽지 못했습니다. 마이그레이션 0087(backup_runs) 적용 여부를 확인하세요.</p>
        ) : backup.recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">백업 실행 기록 없음 — Vercel Cron 등록(/api/cron/backup)과 CRON_SECRET·SMS_KEK 를 확인하세요.</p>
        ) : (
          <div className="overflow-x-auto pt-2">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">시작</th>
                  <th className="px-4 py-2 text-left font-medium">구분</th>
                  <th className="px-4 py-2 text-left font-medium">상태</th>
                  <th className="px-4 py-2 text-right font-medium">테이블</th>
                  <th className="px-4 py-2 text-right font-medium">행</th>
                  <th className="px-4 py-2 text-right font-medium">크기</th>
                  <th className="px-4 py-2 text-left font-medium">파일</th>
                  <th className="px-4 py-2 text-left font-medium">오류</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {backup.recent.map((r) => {
                  const tables = (r.tables && typeof r.tables === 'object' && !Array.isArray(r.tables) ? (r.tables as Record<string, number>) : {}) as Record<string, number>;
                  const rows = Object.values(tables).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{formatDateTime(r.started_at)}</td>
                      <td className="px-4 py-2 text-xs">{r.kind === 'manual' ? '수동' : '자동'}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === 'ok' ? 'bg-emerald-100 text-emerald-800' : r.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                          {r.status === 'ok' ? '성공' : r.status === 'failed' ? '실패' : '실행 중'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatNumber(Object.keys(tables).length)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatNumber(rows)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatBytes(r.bytes)}</td>
                      <td className="max-w-[16rem] break-all px-4 py-2 font-mono text-xs text-muted-foreground">
                        {r.storage_path ?? '-'}
                        {r.pruned_at && <span className="ml-1 text-[11px]">(정리됨)</span>}
                      </td>
                      <td className="max-w-[20rem] px-4 py-2 text-xs text-red-700">{r.error ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 보존 만료 예정 */}
      <section className="rounded-xl border bg-background">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="text-base font-semibold">개인정보 보존기간 만료 예정 행사</h2>
          <span className="ml-auto text-xs text-muted-foreground">종료일 + 보존기간(기본 5년) · 90일 내 · 매주 월요일 점검, 만료 30일 전부터 보호책임자·플랫폼 관리자 문자 · 자동 파기 없음</span>
        </div>
        {retention.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">90일 내 만료 예정 행사 없음</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">행사</th>
                  <th className="px-4 py-2 text-left font-medium">종료일</th>
                  <th className="px-4 py-2 text-left font-medium">보존</th>
                  <th className="px-4 py-2 text-left font-medium">만료일</th>
                  <th className="px-4 py-2 text-left font-medium">상태</th>
                  <th className="px-4 py-2 text-left font-medium">마지막 알림</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {retention.map((r) => {
                  const expired = r.expiry.getTime() <= Date.now();
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 font-medium">{r.name}</td>
                      <td className="px-4 py-2 text-xs">{r.endsOn}</td>
                      <td className="px-4 py-2 text-xs">종료 후 {r.years}년</td>
                      <td className="px-4 py-2 text-xs">{kstDateString(r.expiry)}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${expired ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{expired ? '만료 경과 — 파기 검토' : '만료 예정'}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{r.noticeAt ? formatDateTime(r.noticeAt) : '미발송'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
