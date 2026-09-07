import { NextResponse } from 'next/server';

import { dispatchPending } from '@/lib/notifications/dispatch';
import { dispatchScheduledMessages } from '@/lib/notifications/scheduled-sms';
import { safeEqual } from '@/lib/auth/secret';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization'), `Bearer ${secret}`);
}

/** Vercel Cron: pending 알림 발송(알림톡 → SMS fallback) + 예약 문자(예약시각 도달분) 발송 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const summary = await dispatchPending();
  const scheduled = await dispatchScheduledMessages();
  return NextResponse.json({ ...summary, scheduled });
}
