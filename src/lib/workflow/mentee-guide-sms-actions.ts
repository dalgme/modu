'use server';

import { requireNextlab, requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/notifications/provider';
import { normalizePhone, menteeLoginKey } from '@/lib/auth/identifier';
import {
  getMenteeGuideSmsTemplate,
  saveMenteeGuideSmsTemplate,
  renderMenteeGuideSms,
} from '@/lib/data/app-settings';
import { MENTEE_GUIDE_SMS_ACTION } from '@/lib/data/mentee-guide-sms';

export type MenteeGuideSendResult = { ok: true; sentAt: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

/** 플랫폼 접속 주소 (환경변수 없으면 운영 도메인) */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://restart.startmate.kr';

/**
 * 넥스트랩: 해당 멘티에게 '지원신청 서류 업로드 + 플랫폼 사용 안내(아이디·비밀번호·URL)' 문자 발송.
 * 문구는 문자발송 메뉴에서 수정한 템플릿을 사용한다. 이미 발송된 케이스는 중복 발송하지 않고
 * 기존 발송일시를 반환한다. 발송 기록은 audit_logs(action='sms.mentee_guide')로 남긴다.
 */
export async function sendMenteeGuideSmsAction(caseId: string): Promise<MenteeGuideSendResult> {
  const actor = await requireNextlab();
  if (!caseId) return { ok: false, error: '잘못된 요청입니다.' };
  const admin = createAdminClient();

  const { data: c } = await admin
    .from('cases')
    .select('id, business_name, owner_name, phone, mentee_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };

  // 로그인 아이디·수신번호는 멘티 계정 우선, 없으면 케이스 대표자/연락처
  let name = c.owner_name ?? '';
  let phone = c.phone ?? '';
  if (c.mentee_id) {
    const { data: u } = await admin
      .from('users')
      .select('name, phone')
      .eq('id', c.mentee_id)
      .maybeSingle();
    if (u?.name) name = u.name;
    if (u?.phone) phone = u.phone;
  }
  const digits = normalizePhone(phone);
  if (digits.length < 10) {
    return { ok: false, error: '멘티 휴대폰 번호가 없어 발송할 수 없습니다.' };
  }
  const loginId = menteeLoginKey(name, phone) ?? '이름 + 휴대폰 뒷 4자리';

  // 이미 보냈으면 중복 발송하지 않고 기존 발송일시 반환
  const { data: prev } = await admin
    .from('audit_logs')
    .select('created_at')
    .eq('action', MENTEE_GUIDE_SMS_ACTION)
    .eq('entity_type', 'cases')
    .eq('entity_id', caseId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (prev?.created_at) return { ok: true, sentAt: prev.created_at };

  const template = await getMenteeGuideSmsTemplate();
  const text = renderMenteeGuideSms(template, {
    name,
    company: c.business_name ?? '',
    loginId,
    password: `${digits} (본인 휴대폰 번호)`,
    url: APP_URL,
  });

  const sent = await sendSms(digits, text);
  if (!sent.ok) {
    return { ok: false, error: `문자 발송 실패: ${sent.error ?? '알 수 없는 오류'}` };
  }

  const sentAt = new Date().toISOString();
  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    action: MENTEE_GUIDE_SMS_ACTION,
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { to: digits, login_id: loginId },
  });

  return { ok: true, sentAt };
}

/** 관리자: 멘티 안내 문자 템플릿 저장 (문자발송 메뉴) */
export async function saveMenteeGuideSmsTemplateAction(input: {
  template: string;
}): Promise<SimpleResult> {
  const actor = await requireStaff();
  const template = (input.template ?? '').trim();
  if (!template) return { ok: false, error: '안내문 내용을 입력하세요.' };
  await saveMenteeGuideSmsTemplate(template, actor.id);
  return { ok: true };
}
