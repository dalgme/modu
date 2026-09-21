import { NextResponse } from 'next/server';

import { sendAutoSurveyReminders } from '@/lib/surveys/satisfaction';
import { safeEqual } from '@/lib/auth/secret';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization'), `Bearer ${secret}`);
}

/** Vercel Cron: 만족도 조사 개시 1주일 미응답 자동 리마인드 문자 (케이스당 1회) — P20 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await sendAutoSurveyReminders();
  return NextResponse.json(result);
}
