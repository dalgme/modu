'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deleteTestAccountAction, previewTestAccountDeletionAction } from '@/lib/archive/actions';
import { formatKRW } from '@/lib/utils/format';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';

type Preview = Awaited<ReturnType<typeof previewTestAccountDeletionAction>>;

/**
 * 테스트 멘티 계정 완전 삭제 (2026-11-03) — 회원 명단 > 멘티 [정보 수정] · [비활성화] 탭.
 * 팝업: 지워지는 데이터 요약 → 확인 체크 2개 → 운영자 로그인 비밀번호 → 삭제. 보관함에서 복원 가능.
 */
export function TestAccountDeleteButton({ userId, name, compact = false }: { userId: string; name: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkTest, setCheckTest] = useState(false);
  const [checkImpact, setCheckImpact] = useState(false);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const openDialog = async () => {
    setOpen(true);
    setCheckTest(false);
    setCheckImpact(false);
    setPassword('');
    setReason('');
    setError(null);
    setPreview(null);
    setLoading(true);
    try {
      setPreview(await previewTestAccountDeletionAction(userId));
    } catch {
      setPreview({ ok: false, error: '정보를 불러오지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await deleteTestAccountAction({ userId, confirmTest: checkTest, confirmImpact: checkImpact, password, reason });
      if (r.ok) {
        toast({ title: '테스트 계정 삭제 완료', description: r.message });
        setOpen(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });

  const p = preview && preview.ok ? preview : null;
  return (
    <>
      <Button type="button" size="sm" variant="outline" className={compact ? 'h-8 border-destructive/60 text-xs text-destructive' : 'h-10 border-destructive/60 text-destructive sm:h-9'} onClick={() => void openDialog()}>
        테스트 계정 완전 삭제
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>테스트 계정 완전 삭제 · {name}</DialogTitle>
            <DialogDescription>실제 참여자가 아닌 테스트 계정만 지우세요. 지운 데이터는 운영 설정 &gt; [삭제 보관함]에 보관되어 복원할 수 있습니다.</DialogDescription>
          </DialogHeader>
          {loading && <p className="py-6 text-center text-sm text-muted-foreground">연결된 데이터를 확인하는 중…</p>}
          {preview && !preview.ok && <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{preview.error}</p>}
          {p && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="font-semibold">함께 삭제되는 데이터</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                  <li>로그인 계정 {p.email ?? ''}{p.phone ? ` · ${p.phone}` : ''} (이 행사 소속·명단 값 포함)</li>
                  {p.cases.length === 0 ? (
                    <li>연결된 케이스 없음</li>
                  ) : (
                    p.cases.map((c) => (
                      <li key={c.id}>
                        {c.groupName ?? '라운드'} 케이스 — 회차 {c.rounds}건(보고서 {c.reports}건) · 상태 {c.status === 'withdrawn' ? '중도 종료' : (CASE_STATUS_META[c.status as CaseStatus]?.short ?? c.status)}
                      </li>
                    ))
                  )}
                  {p.mentors.length > 0 && <li>멘토 배정 {p.mentors.join(', ')} (멘토 계정은 그대로)</li>}
                  {p.settlements > 0 && <li>정산 {p.settlements}건 (실지급 {formatKRW(p.settlementNet)}){p.batchesRemoved ? ` · 이 계정만 든 지급 품의 ${p.batchesRemoved}건` : ''}{p.batchesAdjusted ? ` · 다른 정산과 함께 든 품의 ${p.batchesAdjusted}건은 합계에서 차감` : ''}</li>}
                  <li>보고서·관찰의견서·서명 등 파일 {p.files}개, 메시지 {p.messages}건, 알림·만족도 응답</li>
                  <li>리포트·회차별 현황·정산·대시보드 집계에서 빠집니다. 감사 로그는 남습니다.</li>
                </ul>
              </div>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={checkTest} onChange={(e) => setCheckTest(e.target.checked)} />
                <span><b>{name}</b> 계정은 실제 참여자가 아닌 <b>테스트 계정</b>이 맞습니다.</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={checkImpact} onChange={(e) => setCheckImpact(e.target.checked)} />
                <span>삭제하면 위 데이터가 모두 지워지고 리포트·정산 집계에서 빠진다는 것을 확인했습니다. (보관함에서 복원 가능)</span>
              </label>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`tdel-reason-${userId}`}>메모 (선택)</Label>
                <Input id={`tdel-reason-${userId}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 화면 점검용으로 만든 계정" maxLength={200} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`tdel-pw-${userId}`}>내 로그인 비밀번호</Label>
                <Input id={`tdel-pw-${userId}`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>취소</Button>
                <Button type="button" variant="destructive" disabled={pending || !checkTest || !checkImpact || !password} onClick={submit}>
                  {pending ? '삭제 중…' : '완전 삭제'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
