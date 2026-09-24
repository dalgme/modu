'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Ban, RefreshCw, Undo2 } from 'lucide-react';

import {
  assignMentorAction,
  reassignMentorAction,
  recallMentorAction,
} from '@/lib/workflow/case-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface MentorAssignPanelProps {
  caseId: string;
  mentors: { id: string; name: string }[];
  /** 이미 배정됐거나 registered 가 아니면 비활성 */
  assignable: boolean;
  currentMentorName: string | null;
  /** 현재 담당 멘토 id — 재배정 시 후보에서 제외 */
  currentMentorId?: string | null;
  /** 이미 배정된 케이스에서 다른 멘토로 재배정 가능한지 (진행중 상태) */
  reassignable?: boolean;
  /** 배정 회수 가능(회차 등록 전 mentor_assigned) — 회차 시작 후 해제는 중도 종료 패널 */
  recallable?: boolean;
  /** 강제 중도 종료 가능(케이스 상태 기준) — ③ 카드 활성 조건 */
  forceEndable?: boolean;
  /** 대시보드로 이동 버튼 링크 (기본 운영사 대시보드) */
  dashboardHref?: string;
}

export function MentorAssignPanel({
  caseId,
  mentors,
  assignable,
  currentMentorName,
  currentMentorId,
  reassignable = false,
  recallable = false,
  forceEndable = false,
  dashboardHref = '/nextlab/dashboard',
}: MentorAssignPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [mentorId, setMentorId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // 재배정 다이얼로그
  const [reassignOpen, setReassignOpen] = useState(false);
  const [newMentorId, setNewMentorId] = useState<string | undefined>();
  const [reassigning, setReassigning] = useState(false);
  const [recalling, setRecalling] = useState(false);

  const reassignCandidates = mentors.filter((m) => m.id !== currentMentorId);

  async function onAssign() {
    if (!mentorId) {
      toast({ title: '멘토를 선택하세요.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const result = await assignMentorAction(caseId, mentorId);
    setSubmitting(false);
    if (result.ok) {
      toast({ title: '멘토가 배정되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '배정 실패', description: result.error, variant: 'destructive' });
    }
  }

  async function onReassign() {
    if (!newMentorId) {
      toast({ title: '재배정할 멘토를 선택하세요.', variant: 'destructive' });
      return;
    }
    setReassigning(true);
    const result = await reassignMentorAction(caseId, newMentorId, undefined, currentMentorId ?? undefined);
    setReassigning(false);
    if (result.ok) {
      toast({ title: '멘토가 재배정되었습니다.' });
      setReassignOpen(false);
      setNewMentorId(undefined);
      router.refresh();
    } else {
      toast({ title: '재배정 실패', description: result.error, variant: 'destructive' });
    }
  }

  async function onRecall() {
    if (
      !window.confirm(
        '멘토 배정을 회수하고 멘티 등록(배정 대기) 단계로 되돌립니다.\n회차가 등록되기 전에만 가능하며, 이후 다른 멘토를 다시 배정할 수 있습니다. 계속할까요?',
      )
    ) {
      return;
    }
    setRecalling(true);
    const result = await recallMentorAction(caseId);
    setRecalling(false);
    if (result.ok) {
      toast({ title: '멘토 배정을 회수했습니다. 배정 대기 단계로 돌아갑니다.' });
      router.refresh();
    } else {
      toast({ title: '회수 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">멘토 배정</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {currentMentorName ? (
          <p className="text-sm">
            현재 담당 멘토: <span className="font-medium">{currentMentorName}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">아직 멘토가 배정되지 않았습니다.</p>
        )}

        {assignable && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={mentorId} onValueChange={setMentorId}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder="멘토 선택" />
              </SelectTrigger>
              <SelectContent>
                {mentors.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={onAssign} disabled={submitting}>
              {submitting ? '배정 중…' : '배정'}
            </Button>
          </div>
        )}
        {!assignable && !currentMentorName && (
          <p className="text-xs text-muted-foreground">멘토 배정은 &lsquo;멘티 등록&rsquo; 또는 &lsquo;재배정 대기&rsquo; 단계에서만 가능합니다. 추천·수동 검색은 회원 명단 › 멘티 매칭 리스트에서도 할 수 있습니다.</p>
        )}

        {/* 배정 관리 3경로 (P22) — 담당 멘토가 있으면 세 가지 방법을 항상 카드로 보여준다.
            불가한 경로도 회색으로 남겨 "왜 안 되는지 + 대신 무엇을 쓰는지"가 화면에 보이게 한다. */}
        {currentMentorName && (
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs font-bold text-muted-foreground">배정 해제·변경 — 3가지 방법</p>
            <div className="grid gap-2 lg:grid-cols-3">
              {/* ① 재배정 (즉시 교체) */}
              <button
                type="button"
                disabled={!reassignable}
                onClick={() => setReassignOpen(true)}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-colors ${
                  reassignable
                    ? 'border-amber-400 bg-amber-50/60 hover:bg-amber-100/70 dark:border-amber-700 dark:bg-amber-950/30'
                    : 'cursor-not-allowed border-dashed bg-muted/40 opacity-60'
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
                  <RefreshCw className="h-4 w-4" /> ① 멘토 재배정 (즉시 교체)
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  지금 바로 다른 멘토로 교체합니다. 진행한 회차는 그대로 두고 <b>잔여 회차를 새 멘토가 승계</b>합니다.
                </span>
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  {reassignable ? '누르면 새 멘토 선택 창이 열립니다 →' : '이 단계에서는 사용할 수 없습니다'}
                </span>
              </button>

              {/* ② 배정 회수 (해제 → 등록 단계) */}
              <button
                type="button"
                disabled={!recallable || recalling}
                onClick={onRecall}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-colors ${
                  recallable
                    ? 'border-rose-400 bg-rose-50/60 hover:bg-rose-100/70 dark:border-rose-700 dark:bg-rose-950/30'
                    : 'cursor-not-allowed border-dashed bg-muted/40 opacity-60'
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold text-rose-700 dark:text-rose-300">
                  <Undo2 className="h-4 w-4" /> ② 배정 회수 (해제)
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  배정을 해제하고 <b>멘티 등록 단계로 되돌립니다</b>. 회차가 시작되기 전에만 가능합니다.
                </span>
                <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                  {recallable ? (recalling ? '회수 중…' : '누르면 즉시 회수합니다 →') : '회차가 이미 시작됨 — ③ 을 사용하세요'}
                </span>
              </button>

              {/* ③ 강제 중도 종료 → 재배정 대기 */}
              <button
                type="button"
                disabled={!forceEndable}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('modu:open-force-end'));
                  document.getElementById('case-end-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-colors ${
                  forceEndable
                    ? 'border-slate-400 bg-slate-50/60 hover:bg-slate-100/70 dark:border-slate-600 dark:bg-slate-900/40'
                    : 'cursor-not-allowed border-dashed bg-muted/40 opacity-60'
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-300">
                  <Ban className="h-4 w-4" /> ③ 강제 중도 종료 → 재배정 대기
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  새 멘토를 아직 정하지 않고 배정만 해제합니다. 이행 회차는 <b>부분 정산</b>되고, 나중에 새 멘토를 배정하면 <b>잔여 회차가 승계</b>됩니다.
                </span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-400">
                  {forceEndable ? (
                    <>아래 [중도 종료 처리] 패널이 열립니다 <ArrowRight className="h-3 w-3" /></>
                  ) : (
                    '이 단계에서는 사용할 수 없습니다'
                  )}
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button asChild className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href={dashboardHref}>
              <ArrowLeft className="h-4 w-4" />
              대시보드로 이동
            </Link>
          </Button>
        </div>
      </CardContent>

      {/* 멘토 재배정 다이얼로그 */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>멘토 재배정</DialogTitle>
            <DialogDescription>
              현재 담당 멘토({currentMentorName ?? '-'})를 다른 멘토로 교체합니다. 재배정 후 새 멘토에게
              배정 알림이 전달되며, 진행 이력에 재배정 기록이 남습니다.
            </DialogDescription>
          </DialogHeader>
          <Select value={newMentorId} onValueChange={setNewMentorId}>
            <SelectTrigger>
              <SelectValue placeholder="새 멘토 선택" />
            </SelectTrigger>
            <SelectContent>
              {reassignCandidates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  배정 가능한 다른 멘토가 없습니다.
                </div>
              ) : (
                reassignCandidates.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReassignOpen(false)}
              disabled={reassigning}
            >
              취소
            </Button>
            <Button type="button" onClick={onReassign} disabled={reassigning || !newMentorId}>
              {reassigning ? '재배정 중…' : '재배정'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
