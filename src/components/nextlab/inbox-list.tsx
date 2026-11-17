'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { InboxItem } from '@/lib/data/requests';
import { decideExtensionAction, decideMentorWithdrawalAction } from '@/lib/settlement/actions';
import { INBOX_GROUPS, inboxGroupOf, type InboxGroup } from '@/lib/workflow/mentor-request-kind';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = { pending: '대기', approved: '승인', rejected: '반려', accepted: '수락' };

function kindLabel(it: InboxItem): string {
  if (it.kind === 'extension') return '추가 회차 요청';
  if (it.kind === 'mentor_change') return '멘토 변경 요청(멘티)';
  return it.withdrawalKind === 'early_closure' ? '중도 종결 요청(멘토)' : '멘토 변경 요청(멘토)';
}

const GROUP_HINT: Record<InboxGroup, string> = {
  change: '승인하면 진행한 회차는 바로 정산(품의 자동)되고, 멘티는 재배정 대기로 옮겨져 다른 멘토를 배정합니다. 멘티가 요청한 멘토 변경은 케이스 상세에서 새 멘토를 골라 처리합니다.',
  closure: '승인하면 보고서까지 올린 회차까지로 멘토링이 끝나고, 멘티가 [검수] 화면으로 넘어갑니다. 정산은 검수 승인 때 확정됩니다.',
  extension: '승인하면 멘토가 승인된 회차만큼 회차를 더 등록할 수 있습니다.',
};

/**
 * 요청함 (2026-11-17 탭 분리) — [멘토 변경 | 중도 종결 | 추가 회차] 탭, 탭 이름 옆 숫자 = 처리 대기 건수.
 * 대시보드 [처리 대기 요청] 팝업과 게시판 › 처리 대기 요청이 같은 목록을 쓴다.
 * 멘토의 멘토 변경·중도 종결·추가 회차는 여기서 바로 승인/반려, 멘티의 멘토 변경 요청은 새 멘토 선택이 필요해 케이스 상세로.
 */
export function InboxList({ items }: { items: InboxItem[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const byGroup = useMemo(() => {
    const m: Record<InboxGroup, InboxItem[]> = { change: [], closure: [], extension: [] };
    for (const it of items) m[inboxGroupOf(it)].push(it);
    return m;
  }, [items]);
  const pendingCount = (g: InboxGroup) => byGroup[g].filter((i) => i.status === 'pending').length;
  const firstWithPending = INBOX_GROUPS.find((g) => pendingCount(g.key) > 0)?.key ?? 'change';
  const [tab, setTab] = useState<InboxGroup>(firstWithPending);

  // 링크로 특정 요청(#req-…)을 열면 그 요청이 든 탭으로
  useEffect(() => {
    const id = typeof window !== 'undefined' ? window.location.hash.replace(/^#req-/, '') : '';
    if (!id) return;
    const hit = items.find((i) => i.id === id);
    if (hit) setTab(inboxGroupOf(hit));
  }, [items]);

  const decide = async (it: InboxItem, decision: 'approved' | 'rejected') => {
    const note = notes[it.id] ?? '';
    if (decision === 'rejected' && !note.trim()) {
      toast({ title: '반려 사유를 입력하세요.', variant: 'destructive' });
      return;
    }
    const early = it.kind === 'mentor_withdrawal' && it.withdrawalKind === 'early_closure';
    const ok = await confirm(
      decision === 'rejected'
        ? { title: '요청을 반려할까요?', description: `${kindLabel(it)} · ${it.ownerName}`, impact: ['처리 메모가 요청자에게 전달됩니다.'], confirmLabel: '반려' }
        : it.kind === 'extension'
          ? { title: `추가 ${it.extraRounds}회를 승인할까요?`, description: it.ownerName, impact: ['멘토가 승인된 회차만큼 회차를 더 등록할 수 있습니다.'], confirmLabel: '승인' }
          : early
            ? { title: '중도 종결을 승인할까요?', description: `${it.ownerName} · 요청자 ${it.requesterName}`, impact: ['보고서까지 올린 회차까지로 멘토링을 끝내고 [검수] 대기로 옮깁니다.', '보고서가 없는 예정 회차는 정리됩니다.', '정산은 [검수] 화면에서 승인할 때 확정됩니다(관찰의견서 없이 승인 가능).', '멘티는 회원 명단에 「중도 종료」로 표시됩니다.'], confirmLabel: '승인 · 검수로' }
            : { title: '멘토 변경을 승인할까요?', description: `${it.ownerName} · 요청자 ${it.requesterName}`, impact: ['요청한 멘토의 담당이 끝나고, 진행한 회차는 바로 부분 정산(지급 품의 자동)됩니다.', '멘티는 재배정 대기로 옮겨집니다 — 매칭 리스트에서 새 멘토를 배정하세요.'], confirmLabel: '승인 · 재배정' },
    );
    if (!ok) return;
    start(async () => {
      const r = it.kind === 'extension' ? await decideExtensionAction(it.id, decision, note) : await decideMentorWithdrawalAction(it.id, decision, note);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({
        title: decision === 'rejected' ? '반려했습니다.' : early ? '중도 종결을 승인했습니다 — [검수] 화면에서 승인하면 정산이 확정됩니다.' : it.kind === 'extension' ? '승인했습니다.' : '멘토 변경을 승인했습니다 — 재배정 대기로 옮겼습니다.',
      });
      router.refresh();
    });
  };

  const shown = byGroup[tab];
  return (
    <div className="flex flex-col gap-3">
      {dialog}
      <div role="tablist" aria-label="요청 분류" className="flex flex-wrap gap-1 rounded-xl bg-midnight p-1">
        {INBOX_GROUPS.map((g) => {
          const n = pendingCount(g.key);
          const active = tab === g.key;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(g.key)}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors', active ? 'bg-white text-brand-coral' : 'text-white/85 hover:bg-white/10')}
            >
              {g.label}
              <span className={cn('min-w-[1.5rem] rounded-full px-1.5 text-center text-xs tabular-nums', n > 0 ? 'bg-brand-coral text-white' : active ? 'bg-muted text-muted-foreground' : 'bg-white/15 text-white/80')}>{n}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{GROUP_HINT[tab]}</p>
      {shown.length === 0 ? (
        <p className="rounded-xl border bg-background p-6 text-center text-sm text-muted-foreground">처리할 요청이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((it) => {
            const early = it.kind === 'mentor_withdrawal' && it.withdrawalKind === 'early_closure';
            return (
              <li key={it.id} id={`req-${it.id}`} className={`scroll-mt-40 rounded-xl border bg-background p-4 ${it.status === 'pending' ? 'border-amber-300' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <b className={early ? 'text-red-700 dark:text-red-300' : undefined}>{kindLabel(it)}</b>
                    {it.extraRounds ? ` +${it.extraRounds}회` : ''} ·{' '}
                    <Link href={`/nextlab/cases/${it.caseId}`} className="text-primary hover:underline">
                      {it.businessName} ({it.ownerName})
                    </Link>{' '}
                    · {it.supportTypeName ?? '-'} · 요청자 {it.requesterName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(it.createdAt)} · <span className={it.status === 'pending' ? 'font-semibold text-amber-700' : ''}>{STATUS_LABEL[it.status] ?? it.status}</span>
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{it.reason}</p>
                {it.status !== 'pending' && it.decisionNote && <p className="mt-1 text-xs text-muted-foreground">처리 메모: {it.decisionNote}</p>}
                {it.status !== 'pending' && early && it.status === 'approved' && (
                  <p className="mt-1 text-xs">
                    <Link href="/nextlab/review" className="font-semibold text-primary hover:underline">
                      검수 화면에서 승인하기 →
                    </Link>
                  </p>
                )}
                {it.status === 'pending' && it.kind === 'mentor_change' && (
                  <div className="mt-2 flex justify-end">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/nextlab/cases/${it.caseId}`}>케이스 상세에서 새 멘토 지정 · 처리</Link>
                    </Button>
                  </div>
                )}
                {it.status === 'pending' && it.kind !== 'mentor_change' && (
                  <div className="mt-2 flex flex-col gap-2">
                    <Textarea rows={2} value={notes[it.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [it.id]: e.target.value }))} placeholder="처리 메모 (반려 시 필수 · 요청자에게 전달)" disabled={pending} />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => void decide(it, 'rejected')}>
                        반려
                      </Button>
                      <Button size="sm" disabled={pending} onClick={() => void decide(it, 'approved')}>
                        {it.kind === 'extension' ? '승인' : early ? '승인 · 검수로' : '승인 · 재배정'}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
