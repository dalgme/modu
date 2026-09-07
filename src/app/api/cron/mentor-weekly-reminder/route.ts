import { NextResponse } from 'next/server';

import { sendMentorWeeklyReminders } from '@/lib/notifications/mentor-weekly-reminder';
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
 * Vercel Cron: 매주 월요일 12:30(KST) 멘토 주간 안내문 자동 발송.
 * 조건: 활성 배정 멘티기업이 있고, '지원신청서 작성' 미완료 기업이 있는 멘토.
 * (vercel.json 은 UTC 기준 — 월요일 03:30 UTC = 월요일 12:30 KST)
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await sendMentorWeeklyReminders();
  return NextResponse.json(result);
}
