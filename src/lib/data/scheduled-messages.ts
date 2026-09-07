import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export interface ScheduledMessageRow {
  id: string;
  text: string;
  senderIndex: number;
  recipientCount: number;
  scheduledAt: string;
  status: string;
  sentCount: number;
  failedCount: number;
  dispatchedAt: string | null;
  createdAt: string;
}

/**
 * 예약 문자 목록 (예약 대기 우선, 최근 발송/취소 일부 포함).
 * 넥스트랩 문자 발송 페이지에서 예약 현황·취소에 사용한다.
 */
export async function listScheduledMessages(limit = 30): Promise<ScheduledMessageRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('scheduled_messages')
    .select(
      'id, text, sender_index, recipient_count, scheduled_at, status, sent_count, failed_count, dispatched_at, created_at',
    )
    .order('scheduled_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    text: r.text,
    senderIndex: r.sender_index,
    recipientCount: r.recipient_count,
    scheduledAt: r.scheduled_at,
    status: r.status,
    sentCount: r.sent_count,
    failedCount: r.failed_count,
    dispatchedAt: r.dispatched_at,
    createdAt: r.created_at,
  }));
}
