'use client';

import { useState } from 'react';
import { Loader2, UserCog } from 'lucide-react';

import { startViewAsAction } from '@/lib/auth/impersonation-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * 대행 시작 — 운영사가 대상 멘토 명의로 **실제 업무를 처리**할 수 있는 상태로 전환한다.
 * 성공하면 서버 액션이 멘토 홈으로 redirect 하므로 이 컴포넌트로 제어가 돌아오지 않는다.
 */
export function ViewAsStartButton({
  targetUserId,
  targetName,
  className,
  size,
  variant,
  label,
}: {
  targetUserId: string;
  targetName: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'secondary';
  /** 버튼 문구 커스텀 (기본: "{이름} 멘토로 대행 시작") */
  label?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function onStart() {
    setBusy(true);
    try {
      const res = await startViewAsAction(targetUserId);
      // 성공 시 redirect 되므로 여기 도달하면 실패다.
      if (res && !res.ok) {
        toast({ title: '대행 시작 실패', description: res.error, variant: 'destructive' });
        setBusy(false);
      }
    } catch (err) {
      // redirect()/notFound() 는 예외로 전파되므로 그대로 던져 Next 가 처리하게 둔다.
      setBusy(false);
      throw err;
    }
  }

  return (
    <Button
      type="button"
      onClick={onStart}
      disabled={busy}
      size={size}
      variant={variant}
      className={className}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
      {busy ? '전환 중…' : (label ?? `${targetName} 멘토로 대행 시작`)}
    </Button>
  );
}
