'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { toStoredPhone } from '@/lib/auth/identifier';

export type OperatorRegisterState =
  | { ok: true; programName: string; email: string }
  | { ok: false; error: string }
  | undefined;

/**
 * 운영사 총괄담당자 셀프 등록 (P16, 공개 페이지 /register/operator).
 * 확인코드(programs.operator_signup_code)가 일치하는 활성 행사에
 * 운영사(nextlab) · 메인 담당(PL) 로 등록된다. 아이디(이메일)·비밀번호는 본인이 정하므로
 * 임시 비밀번호 없이 바로 로그인한다. 코드가 비어 있는 행사는 셀프 등록이 닫힌 상태.
 */
export async function registerOperatorAction(
  _prev: OperatorRegisterState,
  formData: FormData,
): Promise<OperatorRegisterState> {
  const name = String(formData.get('name') ?? '').trim().slice(0, 40);
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const phoneRaw = String(formData.get('phone') ?? '').trim();
  const position = String(formData.get('position') ?? '').trim().slice(0, 60);
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const code = String(formData.get('code') ?? '').trim();

  if (!name) return { ok: false, error: '이름을 입력하세요.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: '올바른 이메일(로그인 아이디)을 입력하세요.' };
  const phone = toStoredPhone(phoneRaw);
  if (!phone) return { ok: false, error: '휴대폰 번호를 확인하세요. (예: 010-0000-0000)' };
  if (!position) return { ok: false, error: '직위를 입력하세요. (예: 팀장)' };
  if (password.length < 8) return { ok: false, error: '비밀번호는 8자 이상이어야 합니다.' };
  if (password !== confirm) return { ok: false, error: '비밀번호가 일치하지 않습니다.' };
  if (!code) return { ok: false, error: '확인코드를 입력하세요.' };

  const admin = createAdminClient();
  // 확인코드 → 행사 매칭 (활성 행사만). 코드 노출을 줄이려 오류 문구는 일치 여부만 알려준다.
  const { data: program } = await admin
    .from('programs')
    .select('id, name')
    .eq('operator_signup_code', code)
    .eq('status', 'active')
    .maybeSingle();
  if (!program) return { ok: false, error: '확인코드가 올바르지 않습니다. 운영사 내부 안내를 확인하세요.' };

  // 중복 계정 방지 — 이미 있는 이메일·휴대폰이면 로그인/비밀번호 재설정으로 안내
  const [{ data: byEmail }, { data: byPhone }] = await Promise.all([
    admin.from('users').select('id').eq('email', email).maybeSingle(),
    admin.from('users').select('id').eq('phone', phone).maybeSingle(),
  ]);
  if (byEmail) return { ok: false, error: '이미 등록된 이메일입니다. 로그인하거나 비밀번호 재설정을 이용하세요.' };
  if (byPhone) return { ok: false, error: '이미 등록된 휴대폰 번호입니다. 로그인하거나 운영사에 문의하세요.' };

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (authError || !created.user) {
    return { ok: false, error: authError?.message ?? '계정 생성에 실패했습니다.' };
  }

  const now = new Date().toISOString();
  const { error: profileError } = await admin.from('users').insert({
    id: created.user.id,
    role: 'nextlab',
    name,
    email,
    phone,
    position,
    must_change_password: false,
    invited_at: now,
    activated_at: now,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: profileError.message };
  }

  const { error: memberError } = await admin
    .from('program_members')
    .upsert(
      { program_id: program.id, user_id: created.user.id, role: 'nextlab', grade: 'pl', is_active: true, left_at: null },
      { onConflict: 'program_id,user_id' },
    );
  if (memberError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: memberError.message };
  }

  await admin.from('audit_logs').insert({
    actor_id: created.user.id,
    program_id: program.id,
    action: 'account.self_register',
    entity_type: 'users',
    entity_id: created.user.id,
    metadata: { role: 'nextlab', grade: 'pl', email, via: 'operator_signup_code' },
  });

  return { ok: true, programName: program.name, email };
}
