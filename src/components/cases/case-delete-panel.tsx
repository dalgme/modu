'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

import { deleteCaseAction, resetCaseProgressAction } from '@/lib/workflow/case-delete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type Mode = 'reset' | 'delete' | null;

/**
 * 위험 구역 (P21 → 2026-10-01 개편).
 *  ① 진행 내역 삭제(초기화) — 회차·보고서·관찰의견서·서명·검수·정산(품의 전)만 지우고 **라운드(그룹)·멘토 매칭·멘티 정보는 유지**. 기본 권장.
 *  ② 케이스 완전 삭제 — 라운드·매칭 정보까지 모두 사라진다. 테스트 계정을 지우기 전 정리용.
 * 확인 문구 입력 후에만 실행. 품의 편성 건은 서버에서 차단된다.
 */
export function CaseDeletePanel({ caseId, ownerName, businessName }: { caseId: string; ownerName: string; businessName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<Mode>(null);
  const [confirmText, setConfirmText] = useState('');
  const label = businessName && businessName !== ownerName ? `${ownerName}/${businessName}` : ownerName;
  const word = mode === 'reset' ? '초기화' : '삭제';

  const run = () =>
    start(async () => {
      if (mode === 'reset') {
        const r = await resetCaseProgressAction(caseId, confirmText);
        if (!r.ok) return void toast({ title: r.error, variant: 'destructive' });
        toast({ title: '진행 내역을 삭제했습니다. 라운드·멘토 매칭 정보는 그대로 남아 있습니다.' });
        setMode(null);
        setConfirmText('');
        router.refresh();
        return;
      }
      const r = await deleteCaseAction(caseId, confirmText);
      if (!r.ok) return void toast({ title: r.error, variant: 'destructive' });
      toast({ title: '케이스를 완전히 삭제했습니다.' });
      router.push('/nextlab/dashboard');
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-destructive">
        <AlertTriangle className="h-4 w-4" /> 위험 구역 — {label}
      </p>

      <div className="rounded-lg border bg-background p-3">
        <p className="text-sm font-semibold">① 진행 내역 삭제 (권장)</p>
        <p className="mt-1 text-xs text-muted-foreground">
          회차·보고서·사진·관찰의견서·서명·검수 기록·요청·만족도 응답·정산(품의 편성 전)만 지웁니다. <b>라운드(그룹)·멘토 매칭·멘티 정보·사업계획서·멘티 서류는 그대로 남고</b>, 상태는 ‘멘토 배정’(멘토가 없으면 ‘멘티 등록’)으로 돌아갑니다.
        </p>
        {mode !== 'reset' && (
          <Button size="sm" variant="outline" className="mt-2 gap-1 border-destructive/50 text-destructive" onClick={() => { setMode('reset'); setConfirmText(''); }}>
            <RotateCcw className="h-4 w-4" /> 진행 내역 삭제
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-background p-3">
        <p className="text-sm font-semibold">② 케이스 완전 삭제</p>
        <p className="mt-1 text-xs text-muted-foreground">
          케이스 자체를 지웁니다 — <b>라운드·멘토 매칭 정보까지 모두 사라지며 복구할 수 없습니다.</b> 테스트 계정을 회원 명단에서 지우기 전 정리용입니다. 삭제 사실은 감사 로그에 남습니다.
        </p>
        {mode !== 'delete' && (
          <Button size="sm" variant="destructive" className="mt-2 gap-1" onClick={() => { setMode('delete'); setConfirmText(''); }}>
            <Trash2 className="h-4 w-4" /> 케이스 완전 삭제
          </Button>
        )}
      </div>

      {mode && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium">{mode === 'reset' ? '진행 내역 삭제' : '완전 삭제'} 확인:</span>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={`확인 문구 "${word}" 입력`} className="h-9 w-48" disabled={pending} />
          <Button size="sm" variant="destructive" disabled={pending || confirmText.trim() !== word} onClick={run}>
            {pending ? '처리 중…' : mode === 'reset' ? '진행 내역 삭제 실행' : '영구 삭제 실행'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setMode(null); setConfirmText(''); }} disabled={pending}>
            취소
          </Button>
        </div>
      )}
    </div>
  );
}
