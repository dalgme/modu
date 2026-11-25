'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Sparkles } from 'lucide-react';

import { addMenteeRoundAction, getMenteeRoundsAction, removeMenteeRoundAction, type MenteeExtensionItem, type MenteeRoundItem } from '@/lib/workflow/mentee-round-actions';
import { setCaseExtensionAction } from '@/lib/workflow/extension-actions';
import { hoursText } from '@/lib/workflow/extension-rule';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * 회원 명단 > 멘티 [정보 수정]의 라운드 선택 칩 (2026-11-05) — 멘토의 [그룹 지정] 칩과 같은 모양.
 * 켜진 칩 = 그 라운드에 등록됨(케이스 있음). 누르면 켜기(라운드 추가) / 끄기(진행 기록 없는 케이스만 빼기).
 * 버튼 상태와 서버 게이트는 같은 규칙(mentee-round-rule.ts)을 쓴다. 패널이 열릴 때 행사 전체 라운드를 불러온다.
 */
export function MenteeRoundControls({ userId, name }: { userId: string; name: string }) {
  const [rounds, setRounds] = useState<MenteeRoundItem[] | null>(null);
  const [extensions, setExtensions] = useState<MenteeExtensionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const { toast } = useToast();
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const r = await getMenteeRoundsAction(userId);
      if (r.ok) {
        setRounds(r.rounds);
        setExtensions(r.extensions ?? []);
        setError(null);
      } else setError(r.error);
    } catch {
      setError('라운드 정보를 불러오지 못했습니다.');
    }
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (r: MenteeRoundItem) => {
    if (r.block) {
      toast({ title: r.block, variant: 'destructive' });
      return;
    }
    const ok = r.on
      ? await confirm({
          title: `${name} · ${r.groupName}에서 빼기`,
          description: '이 라운드의 케이스를 지웁니다. 회차·서류·정산이 없는 케이스만 뺄 수 있습니다(실수 등록 정리용).',
          impact: [
            `${r.groupName} 케이스 삭제 (상태: ${r.statusLabel ?? '-'})`,
            ...(r.mentorName ? [`담당 멘토 ${r.mentorName} 배정도 함께 해제`] : []),
            '이 라운드의 매칭 추천·멘티 프로필(희망분야·순위 등)도 함께 지워집니다',
            '다른 라운드 케이스와 로그인 계정은 그대로입니다',
          ],
          confirmLabel: '라운드에서 빼기',
          severity: 'danger',
        })
      : await confirm({
          title: `${name} · ${r.groupName}에 추가`,
          description: '이 라운드에 멘티 케이스를 새로 만듭니다. 이름·닉네임·연락처·아이템·희망분야는 최근 라운드 정보를 복사합니다.',
          impact: ['순위·희망 멘토는 비워 둡니다(라운드별 값)', '멘토는 자동 배정하지 않습니다 — 매칭 리스트에서 배정하세요'],
          confirmLabel: '라운드 추가',
        });
    if (!ok) return;
    start(async () => {
      const res = r.on ? await removeMenteeRoundAction(userId, r.caseId!) : await addMenteeRoundAction(userId, r.groupId);
      toast(res.ok ? { title: res.message } : { title: res.error, variant: 'destructive' });
      if (res.ok) {
        await load();
        router.refresh();
      }
    });
  };

  /** (2026-11-25) 라운드 연장 선정 — 예: 1기 2라운드 멘티 중 '1기 3라운드' 진출자 */
  const toggleExtension = async (x: MenteeExtensionItem) => {
    if (x.block) {
      toast({ title: x.block, variant: 'destructive' });
      return;
    }
    const ok = x.selected
      ? await confirm({
          title: `${name} · ${x.label} 선정 해제`,
          description: `${x.groupName} 케이스의 ${x.label} 선정을 해제합니다.`,
          impact: ['추가 회차를 등록할 수 없게 됩니다', '선정으로 다시 연 케이스는 정산 상태에 맞는 단계로 되돌립니다'],
          confirmLabel: '선정 해제',
          severity: 'danger',
        })
      : await confirm({
          title: `${name} · ${x.label} 선정`,
          description: `${x.groupName}의 연장으로 멘토링 ${x.extraHours}시간을 더 진행합니다(새 라운드·새 케이스를 만들지 않음).`,
          impact: [
            `멘토가 회차를 ${x.extraHours}칸 더 등록할 수 있고, 모든 회차를 합쳐 ${x.totalHours ?? '-'}시간까지 (지금 ${hoursText(x.usedMinutes)})`,
            '시간당 수당·보고서 기준은 이 라운드 설정 그대로',
            '검수·정산이 끝난 케이스는 진행 중으로 다시 열립니다 — 이미 확정된 정산·품의는 그대로이고, 추가 회차는 검수 승인 때 따로 정산됩니다',
            '담당 멘토에게 자동 문자는 가지 않습니다 — 필요하면 문자 발송으로 안내하세요',
          ],
          confirmLabel: `${x.label} 선정`,
        });
    if (!ok) return;
    start(async () => {
      const res = await setCaseExtensionAction(x.caseId, !x.selected);
      toast(res.ok ? { title: res.message } : { title: res.error, variant: 'destructive' });
      if (res.ok) {
        await load();
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-background p-3 text-xs">
      {dialog}
      <span className="font-semibold">라운드 선택</span>
      {error && <span className="text-destructive">{error}</span>}
      {!rounds && !error && <span className="text-muted-foreground">불러오는 중…</span>}
      {rounds && (
        <div className="flex flex-wrap gap-1">
          {rounds.map((r) => (
            <button
              key={r.groupId}
              type="button"
              disabled={pending}
              onClick={() => void toggle(r)}
              title={r.block ?? (r.on ? `${r.groupName} 등록됨 — 누르면 이 라운드에서 빼기` : `${r.groupName}에 추가`)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-60',
                r.on ? 'border-sky-500 bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200' : 'border-border text-muted-foreground',
                r.block && 'cursor-not-allowed',
              )}
            >
              {r.block && <Lock className="h-3 w-3" />}
              {r.groupName}
              {r.on && r.statusLabel && <span className="font-normal">· {r.statusLabel}</span>}
            </button>
          ))}
        </div>
      )}
      {extensions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-t pt-1.5">
          {extensions.map((x) => (
            <button
              key={x.caseId}
              type="button"
              disabled={pending}
              onClick={() => void toggleExtension(x)}
              title={x.block ?? (x.selected ? `${x.label} 선정됨 — 누르면 선정 해제` : `${x.groupName} 멘티를 ${x.label}로 선정 (멘토링 ${x.extraHours}시간 추가)`)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-60',
                x.selected ? 'border-violet-500 bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200' : 'border-dashed border-violet-400 text-violet-700',
                x.block && 'cursor-not-allowed',
              )}
            >
              {x.block ? <Lock className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {x.label}
              <span className="font-normal">
                {x.selected ? `· 선정 · ${hoursText(x.usedMinutes)}/${x.totalHours ?? '-'}시간` : `· ${x.groupName} 연장 +${x.extraHours}시간`}
              </span>
            </button>
          ))}
        </div>
      )}
      <span className="text-[10px] text-muted-foreground">
        보라 칩 = 라운드 연장 선정(예: 1기 3라운드 — 별도 라운드 없이 같은 케이스에서 멘토링 시간 추가). 파란 칩 = 등록된 라운드. 누르면 추가하거나 뺄 수 있습니다. 회차·서류·정산이 있는 라운드(자물쇠)는 뺄 수 없습니다.
      </span>
    </div>
  );
}
