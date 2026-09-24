import { cache } from 'react';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 행사의 알림 이벤트 on/off 설정(programs.notification_settings) 로더 (P32).
 * 한 요청(서버 액션·렌더) 안에서 같은 행사는 한 번만 조회한다 — 케이스 한 건 처리에 알림이 여러 통 큐잉되므로 N 쿼리를 막는다.
 * React `cache` 는 요청 컨텍스트 밖(Cron 라우트 등)에서는 캐시 없이 그냥 실행된다.
 * 조회 실패는 `{}`(전부 발송) 로 취급한다 — 설정 조회 오류가 알림을 삼키지 않게(fail-open).
 */
export const loadNotificationSettings = cache(async (programId: string): Promise<Record<string, unknown>> => {
  try {
    const { data, error } = await createAdminClient().from('programs').select('notification_settings').eq('id', programId).maybeSingle();
    if (error || !data) return {};
    const v = data.notification_settings;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
});
