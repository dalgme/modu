'use client';

import { useState } from 'react';
import { Loader2, UserCog } from 'lucide-react';

import { startViewAsAction, type ViewAsOptions } from '@/lib/auth/impersonation-actions';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useToast } from '@/hooks/use-toast';

const SKIP_KEY = 'modu.viewas.skipConfirm';

/**
 * 대행 시작 — 운영사가 대상 멘토·멘티 명의로 **실제 업무를 처리**할 수 있는 상태로 전환한다.
 * 성공하면 서버 액션이 대상 화면(케이스 지정 시 그 케이스)으로 redirect 하므로 이 컴포넌트로 제어가 돌아오지 않는다.
 * P31: `caseId`(바로 그 케이스로 진입)·`returnTo`(종료 후 복귀) 옵션, 공용 ConfirmDialog + "오늘은 다시 묻지 않기".
 */
export function ViewAsStartButton({
  targetUserId,
  targetName,
  caseId = null,
  returnTo = null,
  className,
  size,
  variant,
  label,
}: {
  targetUserId: string;
  targetName: string;
  caseId?: string | null;
  returnTo?: string | null;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'secondary';
  /** 버튼 문구 커스텀 (기본: "{이름} 계정으로 대행 로그인") */
  label?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [skipToday, setSkipToday] = useState(false);

  function skipConfirmToday(): boolean {
    try {
      return sessionStorage.getItem(SKIP_KEY) === new Date().toISOString().slice(0, 10);
    } catch {
      return false;
    }
  }

  async function run() {
    setBusy(true);
    if (skipToday) {
      try {
        sessionStorage.setItem(SKIP_KEY, new Date().toISOString().slice(0, 10));
      } catch {
        /* ignore */
      }
    }
    try {
      const opts: ViewAsOptions = { caseId, returnTo: returnTo ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : null) };
      const res = await startViewAsAction(targetUserId, opts);
      // 성공 시 redirect 되므로 여기 도달하면 실패다.
      if (res && !res.ok) {
        toast({ title: '대행 시작 실패', description: res.error, variant: 'destructive' });
        setBusy(false);
        setOpen(false);
      }
    } catch (err) {
      // redirect()/notFound() 는 예외로 전파되므로 그대로 던져 Next 가 처리하게 둔다.
      setBusy(false);
      throw err;
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => (skipConfirmToday() ? void run() : setOpen(true))}
        disabled={busy}
        size={size}
        variant={variant}
        className={className}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
        {busy ? '전환 중…' : (label ?? `${targetName} 계정으로 대행 로그인`)}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(v) => !busy && setOpen(v)}
        title={`${targetName} 계정으로 대행 로그인`}
        description="대행 중 처리한 작업은 실제로 반영되며, 대상 명의로 기록되고 실행자(본인)가 감사 로그에 남습니다."
        impact={[
          caseId ? '해당 케이스 화면으로 바로 이동합니다.' : '대상의 홈 화면으로 이동합니다.',
          '대행은 현재 행사 안에서만 유효합니다. 종료하면 이 화면으로 돌아옵니다.',
          '서명·개인정보 동의·위촉 서식 등 본인 확인이 필요한 작업은 대행 중 막힙니다.',
        ]}
        confirmLabel="대행 시작"
        pending={busy}
        onConfirm={() => void run()}
      >
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="h-4 w-4" checked={skipToday} onChange={(e) => setSkipToday(e.target.checked)} />
          오늘은 다시 묻지 않기
        </label>
      </ConfirmDialog>
    </>
  );
}
