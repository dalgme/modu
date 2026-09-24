import type { Json } from '@/types/database';
import type { DB } from '@/lib/workflow/audit';
import { getImpersonation } from '@/lib/auth/impersonation';

interface QueueNotificationInput {
  caseId?: string | null;
  /** 케이스 없는 알림(품의 등)도 행사에 묶는다 */
  programId?: string | null;
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
  // 대행(view-as) 중 (P31): 실행자 본인에게 가는 알림은 건너뛰고, 나머지 payload 에 via:'view-as' 를 남긴다.
  // Cron 등 요청 컨텍스트 밖에서는 cookies() 가 없어 예외가 날 수 있으므로 격리한다.
  let imp: Awaited<ReturnType<typeof getImpersonation>> = null;
  try {
    imp = await getImpersonation();
  } catch {
    imp = null;
  }
  if (imp && input.recipientId && input.recipientId === imp.actorId) return;
  const base = input.payload ?? null;
  const payload = (
    imp
      ? { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}), via: 'view-as', on_behalf_of: imp.target.id }
      : base
  ) as Json;
  const { error } = await supabase.from('notifications').insert({
    case_id: input.caseId ?? null,
    program_id: input.programId ?? null,
    recipient_id: input.recipientId ?? null,
    recipient_phone: input.recipientPhone ?? null,
    channel: 'alimtalk',
    trigger_event: input.triggerEvent,
    template_code: input.templateCode ?? null,
    status: 'pending',
    payload,
  });
  if (error) console.error('[notifications] queue failed', { event: input.triggerEvent, message: error.message });
}
