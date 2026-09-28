'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { revokeTrustedDevicesAction } from '@/lib/platform/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * [신뢰 기기 해제] (P35-A) — 그 계정의 "이 기기 30일 기억" 을 전부 무효화한다.
 * 기기 분실·퇴사·의심 접속 시 사용. 다음 로그인부터 문자 인증번호를 다시 묻는다.
 */
export function RevokeDevicesButton({ userId, userName }: { userId: string; userName: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2 text-xs"
      disabled={pending}
      onClick={() => {
        if (!confirm(`${userName} 님의 신뢰 기기를 모두 해제할까요? 다음 로그인부터 문자 인증번호를 다시 묻습니다.`)) return;
        start(async () => {
          const r = await revokeTrustedDevicesAction(userId);
          toast(r.ok ? { title: r.count > 0 ? `신뢰 기기 ${r.count}대를 해제했습니다.` : '등록된 신뢰 기기가 없습니다.' } : { title: r.error, variant: 'destructive' });
          if (r.ok) router.refresh();
        });
      }}
    >
      신뢰 기기 해제
    </Button>
  );
}
