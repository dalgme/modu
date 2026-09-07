import type { Json } from '@/types/database';
import type { DB } from '@/lib/workflow/audit';

interface QueueNotificationInput {
  caseId?: string | null;
  recipientId?: string | null;
  recipientPhone?: string | null;
  triggerEvent: string;
  templateCode?: string;
  payload?: Json;
}

/**
 * 알림을 pending 상태로 큐에 등록한다 (실제 발송은 단계 13 알림톡/SMS 연동).
 * 기본 채널은 알림톡, 실패 시 SMS 대체발송은 발송 단계에서 처리한다.
 */
export async function queueNotification(
  supabase: DB,
  input: QueueNotificationInput,
): Promise<void> {
  await supabase.from('notifications').insert({
    case_id: input.caseId ?? null,
    recipient_id: input.recipientId ?? null,
    recipient_phone: input.recipientPhone ?? null,
    channel: 'alimtalk',
    trigger_event: input.triggerEvent,
    template_code: input.templateCode ?? null,
    status: 'pending',
    payload: input.payload ?? null,
  });
}
