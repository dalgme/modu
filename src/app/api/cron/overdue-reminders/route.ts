import { NextResponse } from 'next/server';

import { queueOverdueReminders, dispatchPending } from '@/lib/notifications/dispatch';
import { safeEqual } from '@/lib/auth/secret';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization'), `Bearer ${secret}`);
}

/** Vercel Cron: 진흥원 승인 대기 3일 초과 독촉 알림 큐 + 발송 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const queued = await queueOverdueReminders();
  const dispatched = await dispatchPending();
  return NextResponse.json({ ...queued, dispatched });
}
