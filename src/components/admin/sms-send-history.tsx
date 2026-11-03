'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { kstHm, kstYmd } from '@/lib/utils/kst';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/common/confirm-dialog';
import { retrySmsBatchAction, syncSmsBatchAction } from '@/lib/notifications/sms-admin-actions';
import { SMS_ITEM_STATUS_LABELS, describeSmsReason, isRetryable, type SmsBatchCounts, type SmsItemStatus } from '@/lib/sms/send-status';

export interface HistoryBatch {
  id: string;
  createdAt: string;
  kind: string;
  title: string | null;
  template: string;
  createdByName: string | null;
  lastSyncedAt: string | null;
  parentBatchId: string | null;
  counts: SmsBatchCounts;
  retried: number;
}

export interface HistoryItem {
  id: string;
  userId: string | null;
  name: string;
  phone: string;
  status: string;
  statusCode: string | null;
  reason: string | null;
  retriedInBatchId: string | null;
}

export interface HistoryLegacy {
  auditId: string;
  createdAt: string;
  actorName: string | null;
  total: number;
  sent: number;
  failed: number;
  failedIds: string[];
}

export interface HistoryLegacyDetail {
  auditId: string;
  rows: { userId: string | null; name: string; phone: string; status: SmsItemStatus; statusCode: string | null; reason: string | null }[];
  sampleText: string | null;
  missingFailed: number;
  error?: string;
}

const KIND_LABELS: Record<string, string> = { bulk: '일괄 문자', login_guide: '로그인 안내', retry: '실패자 재발송' };
const STATUS_TONE: Record<string, string> = {
  delivered: 'border-emerald-400 text-emerald-700 dark:text-emerald-300',
  pending: 'border-sky-400 text-sky-700 dark:text-sky-300',
  failed: 'border-rose-400 text-rose-700 dark:text-rose-300',
  rejected: 'border-amber-500 text-amber-800 dark:text-amber-300',
};
const FILTERS: { key: 'all' | 'retry' | SmsItemStatus; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'retry', label: '실패 전체' },
  { key: 'delivered', label: '수신 완료' },
  { key: 'pending', label: '전송 중' },
  { key: 'failed', label: '수신 실패' },
  { key: 'rejected', label: '접수 실패' },
];

function when(iso: string) {
  return `${kstYmd(iso)} ${kstHm(iso)}`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap text-[11px]', STATUS_TONE[status])}>
      {SMS_ITEM_STATUS_LABELS[status as SmsItemStatus] ?? status}
    </Badge>
  );
}

function Bar({ c }: { c: SmsBatchCounts }) {
  const seg = (n: number, cls: string) => (c.total ? <div className={cls} style={{ width: `${(n / c.total) * 100}%` }} /> : null);
  return (
    <div className="flex h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-muted" aria-hidden>
      {seg(c.delivered, 'bg-emerald-500')}
      {seg(c.pending, 'bg-sky-400')}
      {seg(c.failed, 'bg-rose-500')}
      {seg(c.rejected, 'bg-amber-500')}
    </div>
  );
}

/**
 * 문자 발송 현황 (2026-11-03) — 일괄 발송 묶음별 수신 결과 · 실패 사유 · 실패자 재발송.
 * 결과는 솔라피 메시지 조회로 채운다(수신 완료 = 코드 4000). 기록 이전 발송은 감사 로그 + 솔라피 조회로 확인한다.
 */
export function SmsSendHistory({
  batches,
  selected,
  items,
  legacy,
  legacyDetail,
  canSend,
}: {
  batches: HistoryBatch[];
  selected: HistoryBatch | null;
  items: HistoryItem[];
  legacy: HistoryLegacy[];
  legacyDetail: HistoryLegacyDetail | null;
  canSend: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      {selected ? <BatchDetail batch={selected} items={items} canSend={canSend} /> : legacyDetail ? <LegacyDetail detail={legacyDetail} legacy={legacy.find((l) => l.auditId === legacyDetail.auditId) ?? null} canSend={canSend} /> : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">발송 묶음 ({batches.length})</h3>
        {batches.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">아직 기록된 일괄 발송이 없습니다. (2026-11-03 이후 보낸 일괄 문자·로그인 안내부터 기록됩니다)</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">보낸 시각</th>
                  <th className="px-3 py-2">구분</th>
                  <th className="px-3 py-2">문구</th>
                  <th className="px-3 py-2 text-right">전체</th>
                  <th className="px-3 py-2 text-right">수신 완료</th>
                  <th className="px-3 py-2 text-right">전송 중</th>
                  <th className="px-3 py-2 text-right">실패</th>
                  <th className="px-3 py-2">진행</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const fail = b.counts.failed + b.counts.rejected;
                  return (
                    <tr key={b.id} className={cn('border-b last:border-0', selected?.id === b.id && 'bg-primary/5')}>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {when(b.createdAt)}
                        {b.createdByName && <div className="text-[11px] text-muted-foreground">{b.createdByName}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{KIND_LABELS[b.kind] ?? b.kind}</td>
                      <td className="max-w-[260px] truncate px-3 py-2 text-xs text-muted-foreground" title={b.template}>{b.template}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.counts.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{b.counts.delivered}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-sky-700 dark:text-sky-300">{b.counts.pending}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', fail > 0 && 'font-semibold text-rose-700 dark:text-rose-300')}>
                        {fail}
                        {b.retried > 0 && <div className="text-[10px] font-normal text-muted-foreground">재발송 {b.retried}</div>}
                      </td>
                      <td className="w-32 px-3 py-2"><Bar c={b.counts} /></td>
                      <td className="px-3 py-2 text-right">
                        <Button asChild size="sm" variant={selected?.id === b.id ? 'default' : 'outline'}>
                          <Link href={`/admin/settings/sms?tab=history&batch=${b.id}`}>자세히</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {legacy.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">기록 이전 일괄 발송 (최근 60일)</h3>
          <p className="text-xs text-muted-foreground">
            2026-11-03 이전 방식으로 보낸 일괄 문자입니다. 이때는 한 사람마다 솔라피를 따로 호출해 <b>5초당 100회 한도</b>를 넘긴 뒤의 수신자가 모두 거부됐습니다(&lsquo;실패&rsquo;). [수신 결과 확인]을 누르면 솔라피 계정에서 실제 수신 여부·실패 사유를 조회합니다.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">보낸 시각</th>
                  <th className="px-3 py-2 text-right">대상</th>
                  <th className="px-3 py-2 text-right">접수</th>
                  <th className="px-3 py-2 text-right">거부(미발송)</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {legacy.map((l) => (
                  <tr key={l.auditId} className={cn('border-b last:border-0', legacyDetail?.auditId === l.auditId && 'bg-primary/5')}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {when(l.createdAt)}
                      {l.actorName && <div className="text-[11px] text-muted-foreground">{l.actorName}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.sent}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', l.failed > 0 && 'font-semibold text-rose-700 dark:text-rose-300')}>{l.failed}</td>
                    <td className="px-3 py-2 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/settings/sms?tab=history&legacy=${l.auditId}`}>수신 결과 확인</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ItemTable({ rows }: { rows: { key: string; name: string; phone: string; status: string; statusCode: string | null; reason: string | null; retried?: boolean }[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [q, setQ] = useState('');
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, retry: 0, delivered: 0, pending: 0, failed: 0, rejected: 0 };
    for (const r of rows) {
      c[r.status] = (c[r.status] ?? 0) + 1;
      if (isRetryable(r.status)) c.retry! += 1;
    }
    return c;
  }, [rows]);
  const qd = q.replace(/\D/g, '');
  const shown = rows
    .filter((r) => filter === 'all' || (filter === 'retry' ? isRetryable(r.status) : r.status === filter))
    .filter((r) => !q.trim() || r.name.includes(q.trim()) || (qd.length >= 3 && r.phone.replace(/\D/g, '').includes(qd)));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={cn('rounded-full border px-2.5 py-1 font-semibold', filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent')}>
            {f.label} {counts[f.key] ?? 0}
          </button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·번호 검색" className="h-9 w-40" />
      </div>
      <div className="max-h-[480px] overflow-auto rounded-lg border">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">휴대폰</th>
              <th className="px-3 py-2">결과</th>
              <th className="px-3 py-2">실패 사유</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className="whitespace-nowrap px-3 py-1.5 font-medium">{r.name}</td>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">{r.phone}</td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  <StatusBadge status={r.status} />
                  {r.retried && <span className="ml-1 text-[10px] text-muted-foreground">재발송함</span>}
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">{isRetryable(r.status) ? describeSmsReason(r.statusCode, r.reason) || '-' : ''}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">해당하는 수신자가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BatchDetail({ batch, items, canSend }: { batch: HistoryBatch; items: HistoryItem[]; canSend: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const retryable = items.filter((it) => isRetryable(it.status) && !it.retriedInBatchId);
  const c = batch.counts;

  const sync = () =>
    start(async () => {
      const r = await syncSmsBatchAction(batch.id);
      toast({ title: r.ok ? r.message : r.error, variant: r.ok ? undefined : 'destructive' });
      router.refresh();
    });
  const retry = async () => {
    const ok = await confirm({
      title: `실패자 ${retryable.length}명에게 다시 보내기`,
      description: '같은 문구(수신자별로 이미 치환된 내용)를 다시 보냅니다.',
      impact: ['접수 실패·수신 실패 건 중 아직 다시 보내지 않은 수신자만 대상입니다.', '지금 이 행사에서 비활성·소속 해제된 회원은 제외하고, 휴대폰 번호가 바뀌었으면 새 번호로 보냅니다.', '새 발송 묶음(실패자 재발송)으로 기록됩니다.'],
      confirmLabel: '다시 보내기',
    });
    if (!ok) return;
    start(async () => {
      const r = await retrySmsBatchAction(batch.id);
      toast({ title: r.ok ? '재발송 접수' : '재발송 실패', description: r.ok ? r.message : r.error, variant: r.ok ? undefined : 'destructive' });
      if (r.ok && r.batchId) router.push(`/admin/settings/sms?tab=history&batch=${r.batchId}`);
      else router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      {dialog}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">
            {KIND_LABELS[batch.kind] ?? batch.kind} · {when(batch.createdAt)}
          </h3>
          <p className="text-xs text-muted-foreground">
            {batch.createdByName ? `${batch.createdByName} · ` : ''}결과 확인 {batch.lastSyncedAt ? when(batch.lastSyncedAt) : '전'} — 이통사 결과는 보통 1~2분, 늦으면 수십 분 뒤에 들어옵니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={sync}>{pending ? '확인 중…' : '결과 새로고침'}</Button>
          {canSend && (
            <Button size="sm" variant="destructive" disabled={pending || retryable.length === 0} onClick={() => void retry()}>
              실패자 {retryable.length}명 다시 보내기
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ['전체', c.total, ''],
          ['수신 완료', c.delivered, 'text-emerald-700 dark:text-emerald-300'],
          ['전송 중', c.pending, 'text-sky-700 dark:text-sky-300'],
          ['수신 실패', c.failed, 'text-rose-700 dark:text-rose-300'],
          ['접수 실패', c.rejected, 'text-amber-700 dark:text-amber-300'],
        ].map(([label, n, cls]) => (
          <div key={String(label)} className="rounded-lg border bg-background p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={cn('text-xl font-bold tabular-nums', String(cls))}>{n}</div>
          </div>
        ))}
      </div>
      <Bar c={c} />
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">보낸 문구 보기</summary>
        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-sans">{batch.template}</pre>
      </details>
      <ItemTable rows={items.map((it) => ({ key: it.id, name: it.name, phone: it.phone, status: it.status, statusCode: it.statusCode, reason: it.reason, retried: !!it.retriedInBatchId }))} />
    </section>
  );
}

function LegacyDetail({ detail, legacy, canSend }: { detail: HistoryLegacyDetail; legacy: HistoryLegacy | null; canSend: boolean }) {
  if (detail.error) {
    return <p className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">수신 결과를 조회하지 못했습니다: {detail.error}</p>;
  }
  const retryIds = Array.from(new Set(detail.rows.filter((r) => isRetryable(r.status) && r.userId).map((r) => r.userId!)));
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">기록 이전 일괄 발송 · {legacy ? when(legacy.createdAt) : ''}</h3>
          <p className="text-xs text-muted-foreground">
            솔라피 계정에서 발송 시각 직전 10분의 발송 내역을 조회해 회원과 대조했습니다. 접수 거부(한도 초과)된 수신자는 솔라피에 남지 않아 감사 기록으로 표시합니다.
            {detail.missingFailed > 0 && <> 예전 기록은 실패 회원을 200명까지만 남겨 <b>{detail.missingFailed}명</b>은 이름을 알 수 없습니다.</>}
          </p>
        </div>
        {canSend && retryIds.length > 0 && (
          <Button asChild size="sm" variant="destructive">
            <Link href={`/admin/settings/sms?tab=send&to=${retryIds.join(',')}`}>실패자 {retryIds.length}명 선택해 다시 보내기</Link>
          </Button>
        )}
      </div>
      {detail.sampleText && (
        <details className="text-xs" open>
          <summary className="cursor-pointer text-muted-foreground">그때 보낸 문구(첫 수신자 기준) — 다시 보낼 때 참고해 붙여 넣으세요</summary>
          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-sans">{detail.sampleText}</pre>
        </details>
      )}
      <ItemTable rows={detail.rows.map((r, i) => ({ key: `${r.userId ?? r.phone}-${i}`, name: r.name, phone: r.phone, status: r.status, statusCode: r.statusCode, reason: r.reason }))} />
    </section>
  );
}
