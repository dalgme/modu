import { NextResponse } from 'next/server';

import { runDueMentorReminders } from '@/lib/notifications/mentor-weekly-reminder';
import { safeEqual } from '@/lib/auth/secret';

export const dynamic = 'force-dynamic';
// 대상 멘토가 많을 경우 순차 발송에 시간이 걸릴 수 있어 여유
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization'), `Bearer ${secret}`);
}

/**
 * Vercel Cron: 매시 :30 (UTC) — 행사·그룹별 리마인더 설정(mentor_reminder_settings) 중
 * KST 기준 오늘 요일·설정 시각이 지났고 아직 오늘 안 보낸 행을 발송한다 (P29). 최대 1시간 지연.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runDueMentorReminders();
  return NextResponse.json(result);
}
