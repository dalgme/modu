'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { runBackupNowAction } from '@/lib/ops/backup-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/** [지금 백업] — 플랫폼 통합관리자(owner)만 활성. 서버 액션 결과를 토스트로 보여주고 표를 새로고침한다. */
export function BackupNowButton({ isOwner, keyConfigured }: { isOwner: boolean; keyConfigured: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const disabled = !isOwner || !keyConfigured || pending;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => {
          if (!confirm('지금 전체 테이블을 읽어 암호화 백업을 만들까요? 데이터 양에 따라 수십 초가 걸립니다.')) return;
          start(async () => {
            const r = await runBackupNowAction();
            if (!r.ok) {
              toast({ title: r.error, variant: 'destructive' });
            } else {
              const rows = Object.values(r.result.tables).reduce((a, b) => a + b, 0);
              toast({ title: `백업 완료 — 테이블 ${Object.keys(r.result.tables).length}개 · ${rows.toLocaleString('ko-KR')}행 · ${(r.result.bytes / 1024).toFixed(0)} KB` });
            }
            router.refresh();
          });
        }}
      >
        {pending ? '백업 중…' : '지금 백업'}
      </Button>
      {!isOwner && <span className="text-[11px] text-muted-foreground">플랫폼 통합관리자(owner)만 실행</span>}
      {isOwner && !keyConfigured && <span className="text-[11px] text-amber-700">SMS_KEK 미설정 — 암호화 키가 없어 백업할 수 없습니다</span>}
    </div>
  );
}
