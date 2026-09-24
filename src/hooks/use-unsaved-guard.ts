'use client';

import { useEffect } from 'react';

/**
 * 저장하지 않은 변경이 있을 때 탭 닫기·새로고침을 브라우저 확인창으로 막는다.
 * (Next App Router 의 클라이언트 내비게이션은 beforeunload 를 타지 않으므로 화면 내 [취소] 버튼에는 별도 확인을 둔다.)
 */
export function useUnsavedGuard(dirty: boolean, message = '저장하지 않은 변경 사항이 있습니다. 페이지를 떠나시겠습니까?'): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 최신 브라우저는 커스텀 문구를 무시하지만 returnValue 가 있어야 확인창이 뜬다
      e.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, message]);
}
