'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2 } from 'lucide-react';

import { deleteCaseAction } from '@/lib/workflow/case-delete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

/**
 * 케이스 완전 삭제 (위험 구역) — 테스트 데이터 청소용 (P21).
 * "삭제" 확인 문구 입력 후에만 실행. 품의 편성 건은 서버에서 차단된다.
 */
export function CaseDeletePanel({ caseId, ownerName, businessName }: { caseId: string; ownerName: string; businessName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-destructive">
        <AlertTriangle className="h-4 w-4" /> 위험 구역 — 케이스 완전 삭제
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        이 케이스({ownerName}/{businessName})의 회차·보고서·서명·정산(품의 편성 전)·메시지·서류 파일이 <b>모두 영구 삭제</b>되며 복구할 수 없습니다.
        테스트 데이터 정리용입니다. 삭제 사실은 감사 로그에 남습니다. 케이스를 모두 지운 뒤에는 회원 명단에서 해당 테스트 계정도 [삭제]할 수 있습니다.
      </p>
      {!open ? (
        <Button size="sm" variant="destructive" className="mt-3 gap-1" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" /> 케이스 삭제
        </Button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='확인 문구 "삭제" 입력'
            className="h-9 w-44"
            disabled={pending}
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || confirmText.trim() !== '삭제'}
            onClick={() =>
              start(async () => {
                const r = await deleteCaseAction(caseId, confirmText);
                if (!r.ok) {
                  toast({ title: r.error, variant: 'destructive' });
                  return;
                }
                toast({ title: '케이스를 완전히 삭제했습니다.' });
                router.push('/nextlab/dashboard');
                router.refresh();
              })
            }
          >
            {pending ? '삭제 중…' : '영구 삭제 실행'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setConfirmText(''); }} disabled={pending}>
            취소
          </Button>
        </div>
      )}
    </div>
  );
}
