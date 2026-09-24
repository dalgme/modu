'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing, CheckCircle2 } from 'lucide-react';

import type { DelayedCase, DelayKind } from '@/lib/reports/delays-shared';
import { DELAY_LABELS } from '@/lib/reports/delays-shared';
import { previewDelayNudgeAction, sendDelayNudgeAction, type NudgePreviewMentor } from '@/lib/reports/delay-actions';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { menteeLabel } from '@/lib/utils/labels';
import { formatDate } from '@/lib/utils/format';

const MENTOR_KINDS: DelayKind[] = ['no_round', 'stalled', 'revision'];
/** 이 기간 안에 같은 멘토에게 다시 보내면 경고 */
const RESEND_WARN_DAYS = 7;

const KIND_TONE: Record<DelayKind, string> = {
  unassigned: 'bg-muted text-foreground',
  reassign: 'bg-muted text-foreground',
  no_round: 'bg-amber-100 text-amber-900',
  stalled: 'bg-destructive/10 text-destructive',
  revision: 'bg-amber-100 text-amber-900',
};

const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const md = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 지연 케이스 목록 (P22·P30) — 운영사는 멘토 책임 지연을 선택해 독려 문자 발송(미리보기 → 확인 → 발송).
 * `lastNudges` = 멘토별 최근 독려 시각(감사로그) → 행에 "최근 독려 M/D" 표시, 7일 내 재발송은 확인창에서 경고.
 * 발주처는 열람 전용.
 */
export function DelayList({ items, caseHrefBase, canNudge, lastNudges = {} }: { items: DelayedCase[]; caseHrefBase: string; canNudge: boolean; lastNudges?: Record<string, string> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<NudgePreviewMentor[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);

  if (items.length === 0) {
    return <EmptyState compact icon={CheckCircle2} title="지연 케이스가 없습니다" hint="배정·첫 회차·장기 무진행·보완 지연 기준(7·14·21일)에 걸린 케이스가 없습니다." />;
  }
  const nudgeable = items.filter((i) => MENTOR_KINDS.includes(i.kind) && i.mentorId);
  const selectedIds = Array.from(selected);

  const openPreview = () =>
    start(async () => {
      const r = await previewDelayNudgeAction(selectedIds);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setPreview(r.mentors);
      setPreviewOpen(r.mentors[0]?.mentorId ?? null);
    });

  const send = () =>
    start(async () => {
      const r = await sendDelayNudgeAction(selectedIds);
      toast(r.ok ? { title: `독려 문자 발송 — 멘토 ${r.sent}명 (실패 ${r.failed} · 제외 ${r.skipped})` } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        setSelected(new Set());
        setPreview(null);
        router.refresh();
      }
    });

  const recent = (preview ?? []).filter((m) => lastNudges[m.mentorId] && daysAgo(lastNudges[m.mentorId]!) < RESEND_WARN_DAYS);
  const noPhone = (preview ?? []).filter((m) => !m.phoneMasked);

  return (
    <div className="flex flex-col gap-2">
      {canNudge && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">
            멘토 책임 지연(첫 회차 없음·장기 무진행·보완 지연)을 선택하면 멘토별로 묶어 독려 문자를 1건씩 보냅니다. 보내기 전에 문안을 확인합니다.
          </span>
          <Button size="sm" className="ml-auto gap-1" disabled={pending || selectedIds.length === 0} onClick={openPreview}>
            <BellRing className="h-4 w-4" /> 독려 문자 ({selectedIds.length})
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border-2 bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              {canNudge && (
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={nudgeable.length > 0 && nudgeable.every((i) => selected.has(i.caseId))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(nudgeable.map((i) => i.caseId)) : new Set())}
                  />
                </th>
              )}
              <th className="px-3 py-2">멘티 (이름/소속)</th>
              <th className="px-3 py-2">그룹</th>
              <th className="px-3 py-2">지연 종류</th>
              <th className="px-3 py-2 text-right">경과</th>
              <th className="px-3 py-2 text-right">회차</th>
              <th className="px-3 py-2">담당 멘토</th>
              <th className="px-3 py-2 whitespace-nowrap">최근 독려</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const nudge = MENTOR_KINDS.includes(i.kind) && !!i.mentorId;
              const last = i.mentorId ? lastNudges[i.mentorId] : undefined;
              const lastRecent = last ? daysAgo(last) < RESEND_WARN_DAYS : false;
              return (
                <tr key={`${i.caseId}-${i.kind}`} className="border-b last:border-0">
                  {canNudge && (
                    <td className="px-3 py-2">
                      {nudge && (
                        <input
                          type="checkbox"
                          checked={selected.has(i.caseId)}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(i.caseId)) next.delete(i.caseId);
                              else next.add(i.caseId);
                              return next;
                            })
                          }
                          aria-label={`${i.ownerName} 선택`}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium">
                    <Link href={`${caseHrefBase}/${i.caseId}`} className="hover:underline">
                      {menteeLabel(i.ownerName, i.businessName)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{i.groupName ?? '-'}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-[10px] font-semibold ${KIND_TONE[i.kind]}`} variant="outline">{DELAY_LABELS[i.kind]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-destructive">{i.days}일</td>
                  <td className="px-3 py-2 text-right tabular-nums">{i.roundsDone}/{i.requiredRounds}</td>
                  <td className="px-3 py-2 text-xs">{i.mentorName ?? <span className="text-muted-foreground">미배정</span>}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {last ? (
                      <span className={lastRecent ? 'font-semibold text-amber-700' : 'text-muted-foreground'} title={formatDate(last)}>
                        {md(last)}{lastRecent ? ` (${daysAgo(last)}일 전)` : ''}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 발송 전 미리보기 + 확인 */}
      <ConfirmDialog
        open={preview !== null}
        onOpenChange={(o) => {
          if (!o) setPreview(null);
        }}
        title={`독려 문자 발송 — 멘토 ${preview?.length ?? 0}명`}
        description="멘토별로 아래 문안이 1건씩 발송됩니다. 행사별 문자 API 가 등록돼 있으면 그 발신번호로 나갑니다."
        impact={[
          `발송 대상 ${(preview ?? []).filter((m) => m.phoneMasked).length}명${noPhone.length ? ` · 휴대폰 없음(제외) ${noPhone.length}명` : ''}`,
          ...(recent.length ? [`최근 ${RESEND_WARN_DAYS}일 안에 이미 독려한 멘토 ${recent.length}명: ${recent.map((m) => `${m.name}(${md(lastNudges[m.mentorId]!)})`).join(', ')}`] : []),
          '발송 이력은 멘토별 감사로그에 남고 "최근 독려" 열에 표시됩니다.',
        ]}
        confirmLabel={recent.length ? '그래도 발송' : '발송'}
        severity={recent.length ? 'danger' : 'normal'}
        pending={pending}
        onConfirm={send}
        className="max-w-2xl"
      >
        {preview && preview.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {preview.map((m) => (
                <button
                  key={m.mentorId}
                  type="button"
                  onClick={() => setPreviewOpen(m.mentorId)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${previewOpen === m.mentorId ? 'border-primary bg-primary/10 text-primary' : 'bg-background text-muted-foreground hover:bg-accent'} ${!m.phoneMasked ? 'line-through opacity-60' : ''}`}
                  title={m.phoneMasked ?? '휴대폰 없음 — 발송 제외'}
                >
                  {m.name} ({m.caseIds.length})
                </button>
              ))}
            </div>
            {(() => {
              const cur = preview.find((m) => m.mentorId === previewOpen) ?? preview[0]!;
              return (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                  <p className="mb-1 text-muted-foreground">
                    수신 {cur.name} · {cur.phoneMasked ?? '휴대폰 없음(제외)'} · {cur.text.length}자
                  </p>
                  <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed">{cur.text}</pre>
                </div>
              );
            })()}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
