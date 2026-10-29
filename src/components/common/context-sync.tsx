'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';

const CHANNEL = 'modu-scope';

/**
 * 탭 간 범위 동기화 (2026-10-29) — 행사·그룹(기수) 컨텍스트와 대행은 쿠키 하나라 모든 탭이 함께 쓴다.
 * 한 탭에서 2기로 들어가면 다른 탭은 화면은 1기인데 다음 조회·저장은 2기로 나가 "1기에 2기 멘티" 처럼 보인다.
 * 이 탭이 그린 범위(scopeKey)와 다른 범위가 다른 탭에서 알려지면, 이 탭으로 돌아오는 순간 새로 불러온다.
 */
export function ContextSync({ scopeKey }: { scopeKey: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const stale = useRef(false);

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(CHANNEL);
    } catch {
      return;
    }
    stale.current = false;
    const refresh = () => {
      stale.current = false;
      toast({ title: '다른 탭에서 행사·그룹(기수)이 바뀌어 이 화면을 새로 불러왔습니다.' });
      router.refresh();
    };
    ch.onmessage = (e: MessageEvent) => {
      const key = typeof e.data === 'string' ? e.data : null;
      if (key === null) return;
      // 다른 탭이 다시 이 탭과 같은 범위로 돌아왔으면 새로 고칠 필요 없음
      stale.current = key !== scopeKey;
      if (stale.current && document.visibilityState === 'visible') refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && stale.current) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    ch.postMessage(scopeKey);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      ch?.close();
    };
  }, [scopeKey, router, toast]);

  return null;
}
