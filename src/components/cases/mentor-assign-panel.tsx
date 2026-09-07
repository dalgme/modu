'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Undo2 } from 'lucide-react';

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
  /** 대시보드로 이동 버튼 링크 (기본 넥스트랩 대시보드) */
  dashboardHref?: string;
}

export function MentorAssignPanel({
  caseId,
  mentors,
  assignable,
  currentMentorName,
  currentMentorId,
  reassignable = false,
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
    const result = await reassignMentorAction(caseId, newMentorId);
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
        '멘토 배정을 회수하고 대상자 등록 단계로 되돌립니다.\n진흥원이 내용을 수정·재업로드해 다시 배정 요청할 수 있습니다. 계속할까요?',
      )
    ) {
      return;
    }
    setRecalling(true);
    const result = await recallMentorAction(caseId);
    setRecalling(false);
    if (result.ok) {
      toast({ title: '멘토 배정을 회수했습니다. 대상자 등록 단계로 돌아갑니다.' });
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

        {assignable ? (
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
        ) : reassignable ? (
          <p className="text-xs text-muted-foreground">
            멘토 사정으로 담당자 변경이 필요하면 다른 멘토로 재배정할 수 있습니다.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            멘토 배정은 &lsquo;대상자 등록&rsquo; 단계에서만 가능합니다.
          </p>
        )}

        {/* 액션 버튼 — 멘토 재배정 + 대시보드로 이동 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {reassignable && (
            <Button
              onClick={() => setReassignOpen(true)}
              className="gap-1.5 bg-amber-500 text-white hover:bg-amber-600"
            >
              <RefreshCw className="h-4 w-4" />
              멘토 재배정
            </Button>
          )}
          {reassignable && (
            <Button
              onClick={onRecall}
              disabled={recalling}
              className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
            >
              <Undo2 className="h-4 w-4" />
              {recalling ? '회수 중…' : '배정 회수'}
            </Button>
          )}
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
