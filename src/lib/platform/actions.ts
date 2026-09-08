'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getRealSessionProfile } from '@/lib/auth/guards';
import { createStaffOrMentorAccount, phoneTempPassword } from '@/lib/auth/admin-accounts';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROUND_REPORT_TEMPLATE_KEY } from '@/lib/documents/round-report';
import type { Json } from '@/types/database';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** 플랫폼 관리자 — 실제 신원(대행 무관), users.is_platform_admin */
async function platformAdmin(): Promise<{ id: string } | { error: string }> {
  const real = await getRealSessionProfile();
  if (!real || !real.is_active) return { error: '로그인이 필요합니다.' };
  if (!real.is_platform_admin) return { error: '플랫폼 관리자만 실행할 수 있습니다.' };
  return { id: real.id };
}

async function audit(actorId: string, action: string, entityId: string | null, metadata: Json) {
  await createAdminClient().from('audit_logs').insert({ actor_id: actorId, program_id: null, action, entity_type: 'programs', entity_id: entityId, metadata });
}

function revalidate() {
  revalidatePath('/platform');
  revalidatePath('/platform/programs');
  revalidatePath('/hub');
}

/**
 * 관리코드(슬러그) 자동 부여 — 플랫폼이 체계를 갖고 직접 관리한다 (2026-09-08 지시).
 * 형식: p{개설연도}-{연도별 3자리 순번}. 예) p2026-001, p2026-002 … 연도가 바뀌면 001 부터.
 */
async function nextProgramSlug(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `p${year}-`;
  const { data } = await admin.from('programs').select('slug').like('slug', `${prefix}%`);
  const max = (data ?? []).reduce((m, r) => {
    const n = Number(r.slug.slice(prefix.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

const programSchema = z.object({
  name: z.string().trim().min(1, '행사명을 입력하세요.'),
  client_name: z.string().trim().min(1, '발주처 기관명을 입력하세요.'),
  client_short: z.string().trim().optional().transform((v) => v || null),
  operator_name: z.string().trim().min(1, '용역사(운영) 기관명을 입력하세요.'),
  operator_short: z.string().trim().optional().transform((v) => v || null),
  app_title: z.string().trim().optional().transform((v) => v || null),
  starts_on: z.string().trim().optional().transform((v) => v || null),
  ends_on: z.string().trim().optional().transform((v) => v || null),
  default_required_rounds: z.coerce.number().int().min(1).max(20).default(4),
  // 첫 운영사 계정 (선택)
  first_email: z.string().trim().email('올바른 이메일').optional().or(z.literal('')).transform((v) => v || null),
  first_name: z.string().trim().optional().transform((v) => v || null),
  first_phone: z.string().trim().optional().transform((v) => v || null),
  // 복제 원천 (선택)
  clone_from: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
});

/**
 * 행사 개설 (플랫폼 관리자). 선택: 기존 행사에서 설정 복제(그룹·필수서류·단가·한도·정책·만족도·보고서 양식·키워드 — 계정·케이스 제외),
 * 첫 운영사 계정 발급(임시 비밀번호 1회 표시).
 */
export async function createProgramAction(input: unknown): Promise<Result<{ programId: string; credential?: { email: string; tempPassword: string }; warn?: string }>> {
  const op = await platformAdmin();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = programSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const d = parsed.data;
  const admin = createAdminClient();

  let base: Record<string, unknown> = {};
  if (d.clone_from) {
    const { data: src } = await admin.from('programs').select('default_withholding_method, withholding_params, closure_policy, round_report_policy, sms_footer, email_subject_prefix').eq('id', d.clone_from).maybeSingle();
    if (!src) return { ok: false, error: '복제 원천 행사를 찾을 수 없습니다.' };
    base = src;
  }
  const slug = await nextProgramSlug(admin);
  const { data: created, error } = await admin
    .from('programs')
    .insert({
      ...base,
      slug,
      name: d.name,
      client_name: d.client_name,
      client_short: d.client_short,
      operator_name: d.operator_name,
      operator_short: d.operator_short,
      app_title: d.app_title,
      starts_on: d.starts_on,
      ends_on: d.ends_on,
      default_required_rounds: d.default_required_rounds,
      status: 'active',
      created_by: op.id,
    } as never)
    .select('id')
    .single();
  if (error || !created) return { ok: false, error: error?.code === '23505' ? '관리코드 부여가 겹쳤습니다. 다시 시도하세요.' : (error?.message ?? '행사 생성 실패') };

  if (d.clone_from) {
    const r = await cloneProgramSettings(d.clone_from, created.id, op.id);
    if (!r.ok) return { ok: false, error: `행사는 만들었지만 설정 복제에 실패했습니다: ${r.error}` };
  }

  let credential: { email: string; tempPassword: string } | undefined;
  let warn: string | undefined;
  if (d.first_email && d.first_name) {
    try {
      const acc = await createStaffOrMentorAccount({ email: d.first_email, name: d.first_name, phone: d.first_phone ?? undefined, role: 'nextlab', actorId: op.id });
      await admin.from('program_members').upsert({ program_id: created.id, user_id: acc.userId, role: 'nextlab', is_active: true }, { onConflict: 'program_id,user_id' });
      credential = { email: acc.email, tempPassword: acc.tempPassword };
    } catch (err) {
      warn = err instanceof Error ? err.message : '계정 발급 실패';
    }
  }
  await audit(op.id, 'program.create', created.id, { slug, name: d.name, clone_from: d.clone_from, first_account: !!credential, first_account_error: warn ?? null });
  revalidate();
  return { ok: true, programId: created.id, credential, warn };
}

/** 설정 복제 — 계정·케이스·회차·정산은 제외. 그룹 id 매핑을 유지해 그룹 스코프 설정을 옮긴다. */
async function cloneProgramSettings(fromId: string, toId: string, actorId: string): Promise<Result> {
  const admin = createAdminClient();
  const [{ data: groups }, { data: docs }, { data: rates }, { data: limits }, { data: tags }, { data: templates }, { data: surveys }] = await Promise.all([
    admin.from('support_types').select('*').eq('program_id', fromId).order('sort_order'),
    admin.from('support_type_documents').select('*'),
    admin.from('consulting_rates').select('*').eq('program_id', fromId),
    admin.from('operating_limits').select('*').eq('program_id', fromId),
    admin.from('tag_catalog').select('*').eq('program_id', fromId),
    admin.from('document_templates').select('*').eq('program_id', fromId).eq('template_key', ROUND_REPORT_TEMPLATE_KEY),
    admin.from('survey_templates').select('*').eq('program_id', fromId).eq('is_active', true),
  ]);
  const groupMap = new Map<string, string>();
  // 1) 그룹 (승계 원천은 2차 패스)
  for (const g of groups ?? []) {
    const { data: ng, error } = await admin
      .from('support_types')
      .insert({ program_id: toId, code: g.code, name: g.name, description: g.description, status: 'active', required_rounds: g.required_rounds, round_label: g.round_label, withholding_method: g.withholding_method, sort_order: g.sort_order, round_report_policy: g.round_report_policy })
      .select('id')
      .single();
    if (error || !ng) return { ok: false, error: error?.message ?? '그룹 복제 실패' };
    groupMap.set(g.id, ng.id);
  }
  for (const g of groups ?? []) {
    if (g.predecessor_support_type_id && groupMap.has(g.predecessor_support_type_id)) {
      await admin.from('support_types').update({ predecessor_support_type_id: groupMap.get(g.predecessor_support_type_id)! }).eq('id', groupMap.get(g.id)!);
    }
  }
  // 2) 필수서류
  const docRows = (docs ?? []).filter((x) => groupMap.has(x.support_type_id)).map((x) => ({ support_type_id: groupMap.get(x.support_type_id)!, doc_key: x.doc_key, doc_name: x.doc_name, is_required: x.is_required, multiple: x.multiple, for_role: x.for_role, condition: x.condition, attachment_no: x.attachment_no, sort_order: x.sort_order }));
  if (docRows.length) await admin.from('support_type_documents').insert(docRows);
  // 3) 단가·한도 (그룹 override 는 매핑, 매핑 없는 그룹 행은 건너뜀)
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const latest = <T extends { support_type_id: string | null; effective_from: string }>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, T>();
    for (const r of rows) {
      if (r.effective_from > today) continue;
      const k = key(r);
      const cur = m.get(k);
      if (!cur || cur.effective_from < r.effective_from) m.set(k, r);
    }
    return Array.from(m.values());
  };
  const rateRows = latest(rates ?? [], (r) => `${r.support_type_id ?? ''}|${r.mode}`)
    .filter((r) => !r.support_type_id || groupMap.has(r.support_type_id))
    .map((r) => ({ program_id: toId, support_type_id: r.support_type_id ? groupMap.get(r.support_type_id)! : null, mode: r.mode, unit_price: r.unit_price, daily_cap_amount: r.daily_cap_amount, effective_from: today, created_by: actorId }));
  if (rateRows.length) await admin.from('consulting_rates').insert(rateRows);
  const limitRows = latest(limits ?? [], (r) => r.support_type_id ?? '')
    .filter((r) => !r.support_type_id || groupMap.has(r.support_type_id))
    .map((r) => ({ program_id: toId, support_type_id: r.support_type_id ? groupMap.get(r.support_type_id)! : null, mentor_daily_case_limit: r.mentor_daily_case_limit, case_daily_round_limit: r.case_daily_round_limit, effective_from: today, created_by: actorId }));
  if (limitRows.length) await admin.from('operating_limits').insert(limitRows);
  // 4) 키워드
  if ((tags ?? []).length) await admin.from('tag_catalog').insert((tags ?? []).map((t) => ({ program_id: toId, category: t.category, label: t.label, sort_order: t.sort_order })));
  // 5) 보고서 양식
  for (const t of templates ?? []) {
    if (t.support_type_id && !groupMap.has(t.support_type_id)) continue;
    await admin.from('document_templates').insert({ program_id: toId, support_type_id: t.support_type_id ? groupMap.get(t.support_type_id)! : null, template_key: t.template_key, name: t.name, html_content: t.html_content, field_mapping: t.field_mapping, attachment_no: t.attachment_no, is_active: t.is_active, updated_by: actorId });
  }
  // 6) 만족도 양식 (활성본, v1 로)
  for (const s of surveys ?? []) {
    if (s.support_type_id && !groupMap.has(s.support_type_id)) continue;
    const { data: nt } = await admin.from('survey_templates').insert({ program_id: toId, support_type_id: s.support_type_id ? groupMap.get(s.support_type_id)! : null, name: s.name, version: 1, is_active: true, created_by: actorId }).select('id').single();
    if (!nt) continue;
    const { data: qs } = await admin.from('survey_questions').select('*').eq('template_id', s.id).order('sort_order');
    if ((qs ?? []).length) await admin.from('survey_questions').insert((qs ?? []).map((q) => ({ template_id: nt.id, sort_order: q.sort_order, qtype: q.qtype, label: q.label, help: q.help, options: q.options, required: q.required })));
  }
  await audit(actorId, 'program.clone_settings', toId, { from: fromId, groups: groupMap.size, docs: docRows.length, rates: rateRows.length, limits: limitRows.length, tags: (tags ?? []).length, templates: (templates ?? []).length, surveys: (surveys ?? []).length });
  return { ok: true };
}

export async function setProgramStatusAction(programId: string, status: 'active' | 'ended'): Promise<Result> {
  const op = await platformAdmin();
  if ('error' in op) return { ok: false, error: op.error };
  const { error } = await createAdminClient().from('programs').update({ status }).eq('id', programId);
  if (error) return { ok: false, error: error.message };
  await audit(op.id, 'program.status', programId, { status });
  revalidate();
  return { ok: true };
}

/** 행사에 스태프 계정 추가 (기존 계정 이메일로 멤버십 추가, 없으면 발급) */
export async function addProgramStaffAction(programId: string, input: { email: string; name?: string; phone?: string; role: 'nextlab' | 'institution'; position?: string }): Promise<Result<{ credential?: { email: string; tempPassword: string } }>> {
  const op = await platformAdmin();
  if ('error' in op) return { ok: false, error: op.error };
  const email = (input.email ?? '').trim().toLowerCase();
  if (!email) return { ok: false, error: '이메일을 입력하세요.' };
  const admin = createAdminClient();
  const { data: program } = await admin.from('programs').select('id').eq('id', programId).maybeSingle();
  if (!program) return { ok: false, error: '행사를 찾을 수 없습니다.' };
  const { data: existing } = await admin.from('users').select('id, role').eq('email', email).maybeSingle();
  let userId: string;
  let credential: { email: string; tempPassword: string } | undefined;
  if (existing) {
    if (existing.role !== input.role) return { ok: false, error: `이미 다른 역할(${existing.role})로 등록된 계정입니다.` };
    userId = existing.id;
  } else {
    if (!input.name?.trim()) return { ok: false, error: '새 계정은 이름이 필요합니다.' };
    try {
      const acc = await createStaffOrMentorAccount({ email, name: input.name.trim(), phone: input.phone?.trim() || undefined, role: input.role, position: input.position, actorId: op.id });
      userId = acc.userId;
      credential = { email: acc.email, tempPassword: acc.tempPassword };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : '계정 발급 실패' };
    }
  }
  await admin.from('program_members').upsert({ program_id: programId, user_id: userId, role: input.role, is_active: true, left_at: null }, { onConflict: 'program_id,user_id' });
  await audit(op.id, 'program.staff_added', programId, { user_id: userId, role: input.role, issued: !!credential });
  revalidate();
  revalidatePath(`/platform/programs/${programId}`);
  return { ok: true, credential };
}

/** 플랫폼 통합관리자(owner) — 부관리자 지정·해제는 owner 만 */
async function platformOwner(): Promise<{ id: string } | { error: string }> {
  const real = await getRealSessionProfile();
  if (!real || !real.is_active) return { error: '로그인이 필요합니다.' };
  if (!real.is_platform_admin || real.platform_role !== 'owner') return { error: '플랫폼 통합관리자(owner)만 부관리자를 지정·해제할 수 있습니다.' };
  return { id: real.id };
}

/**
 * 플랫폼 부관리자 지정/해제 (이메일 기준) — **owner 전용**.
 * 플랫폼을 개발·운영하는 주체는 행사의 운영사·발주처와 무관하므로, 어느 역할·어느 소속의 계정이든 지정할 수 있다.
 */
export async function setPlatformAdminAction(email: string, isAdmin: boolean): Promise<Result> {
  const op = await platformOwner();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: u } = await admin.from('users').select('id, platform_role').eq('email', email.trim().toLowerCase()).maybeSingle();
  if (!u) return { ok: false, error: '해당 이메일의 계정이 없습니다. 아래에서 새 부관리자 계정을 발급할 수 있습니다.' };
  if (u.platform_role === 'owner') return { ok: false, error: '통합관리자(owner) 계정은 변경할 수 없습니다.' };
  if (isAdmin) {
    const { count } = await admin.from('program_members').select('id', { count: 'exact', head: true }).eq('user_id', u.id).eq('is_active', true);
    if ((count ?? 0) > 0) return { ok: false, error: '행사에 소속된 계정은 부관리자로 지정할 수 없습니다. 플랫폼 관리자는 통합관리 전용 계정이어야 합니다 — 아래에서 전용 계정을 발급하세요.' };
  }
  const { error } = await admin.from('users').update({ is_platform_admin: isAdmin, platform_role: isAdmin ? 'admin' : null }).eq('id', u.id);
  if (error) return { ok: false, error: error.message.includes('소속') ? error.message : error.message };
  await audit(op.id, isAdmin ? 'platform.admin_granted' : 'platform.admin_revoked', null, { user_id: u.id });
  revalidate();
  return { ok: true };
}

/** 소속 없는 새 플랫폼 부관리자 계정 발급 — owner 전용. 기본 역할은 nextlab 이지만 행사 소속은 없다(콘솔 전용). */
export async function createPlatformAdminAction(input: { email: string; name: string; phone?: string; position?: string }): Promise<Result<{ credential: { email: string; tempPassword: string } }>> {
  const op = await platformOwner();
  if ('error' in op) return { ok: false, error: op.error };
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name) return { ok: false, error: '이메일과 이름을 입력하세요.' };
  try {
    const acc = await createStaffOrMentorAccount({ email, name, phone: input.phone?.trim() || undefined, role: 'nextlab', actorId: op.id });
    const admin = createAdminClient();
    await admin.from('users').update({ is_platform_admin: true, platform_role: 'admin', position: input.position?.trim() || null }).eq('id', acc.userId);
    await audit(op.id, 'platform.admin_created', null, { user_id: acc.userId, email });
    revalidate();
    return { ok: true, credential: { email: acc.email, tempPassword: acc.tempPassword } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '계정 발급 실패' };
  }
}

const programInfoSchema = z.object({
  name: z.string().trim().min(1, '행사명을 입력하세요.'),
  client_name: z.string().trim().min(1, '발주처 기관명을 입력하세요.'),
  client_short: z.string().trim().optional().transform((v) => v || null),
  operator_name: z.string().trim().min(1, '용역사(운영) 기관명을 입력하세요.'),
  operator_short: z.string().trim().optional().transform((v) => v || null),
  app_title: z.string().trim().optional().transform((v) => v || null),
  default_required_rounds: z.coerce.number().int().min(1).max(20),
  starts_on: z.string().trim().optional().transform((v) => v || null),
  ends_on: z.string().trim().optional().transform((v) => v || null),
});

/** 행사 개설정보 수정 (플랫폼 관리자). 브랜딩 세부(직인 명의·연락처·문자 꼬리말 등)는 운영사의 운영 설정에서도 고칠 수 있다. */
export async function updateProgramInfoAction(programId: string, input: unknown): Promise<Result> {
  const op = await platformAdmin();
  if ('error' in op) return { ok: false, error: op.error };
  const parsed = programInfoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  const admin = createAdminClient();
  const { data: before } = await admin.from('programs').select('name, client_name, client_short, operator_name, operator_short, app_title, default_required_rounds, starts_on, ends_on').eq('id', programId).maybeSingle();
  if (!before) return { ok: false, error: '행사를 찾을 수 없습니다.' };
  const { error } = await admin.from('programs').update(parsed.data).eq('id', programId);
  if (error) return { ok: false, error: error.message };
  await audit(op.id, 'program.update', programId, { before, after: parsed.data } as unknown as Json);
  revalidate();
  revalidatePath(`/platform/programs/${programId}`);
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 계정 통합 관리 (전 행사) — 플랫폼 관리자 전용. 운영사 회원관리(member-actions)와 달리 행사 범위 제한이 없다.
// ─────────────────────────────────────────────────────────────────────────────

async function auditUser(actorId: string, action: string, userId: string, metadata: Json) {
  await createAdminClient().from('audit_logs').insert({ actor_id: actorId, program_id: null, action, entity_type: 'users', entity_id: userId, metadata });
}

function revalidateUsers() {
  revalidatePath('/platform/users');
  revalidatePath('/platform');
  revalidatePath('/hub');
}

/** 임시 비밀번호 재발급 (휴대폰 번호 기반, 없으면 난수) → 최초 로그인 시 변경 강제 */
export async function platformResetPasswordAction(userId: string): Promise<Result<{ tempPassword: string }>> {
  const op = await platformAdmin();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: u } = await admin.from('users').select('id, phone, role').eq('id', userId).maybeSingle();
  if (!u) return { ok: false, error: '계정을 찾을 수 없습니다.' };
  const tempPassword = phoneTempPassword(u.phone);
  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) return { ok: false, error: error.message };
  await admin.from('users').update({ must_change_password: true, updated_at: new Date().toISOString() }).eq('id', userId);
  await auditUser(op.id, 'platform.account.reset_password', userId, { role: u.role });
  revalidateUsers();
  return { ok: true, tempPassword };
}

/** 활성/비활성 — 비활성 계정은 모든 행사에서 로그인이 막힌다. 본인·다른 플랫폼 관리자는 여기서 못 막는다(플랫폼 관리자 탭에서 해제 후). */
export async function platformSetUserActiveAction(userId: string, active: boolean): Promise<Result> {
  const op = await platformAdmin();
  if ('error' in op) return { ok: false, error: op.error };
  if (userId === op.id) return { ok: false, error: '본인 계정은 변경할 수 없습니다.' };
  const admin = createAdminClient();
  const { data: u } = await admin.from('users').select('is_platform_admin, role').eq('id', userId).maybeSingle();
  if (!u) return { ok: false, error: '계정을 찾을 수 없습니다.' };
  if (u.is_platform_admin && !active) return { ok: false, error: '플랫폼 관리자는 먼저 관리자 지정을 해제한 뒤 비활성화하세요.' };
  const { error } = await admin.from('users').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', userId);
  if (error) return { ok: false, error: error.message };
  await auditUser(op.id, active ? 'platform.account.activate' : 'platform.account.deactivate', userId, { role: u.role });
  revalidateUsers();
  return { ok: true };
}

/** 행사 소속 추가/해제 — 행사별 역할(설계 B)을 지정한다. 해제는 멤버십 행을 지우지 않고 is_active=false·left_at 기록(이력 보존). */
export async function platformSetMembershipAction(userId: string, programId: string, member: boolean, role?: 'institution' | 'nextlab' | 'mentor' | 'mentee'): Promise<Result> {
  const op = await platformAdmin();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const [{ data: u }, { data: p }] = await Promise.all([admin.from('users').select('id, role, is_platform_admin').eq('id', userId).maybeSingle(), admin.from('programs').select('id, name').eq('id', programId).maybeSingle()]);
  if (!u) return { ok: false, error: '계정을 찾을 수 없습니다.' };
  if (!p) return { ok: false, error: '행사를 찾을 수 없습니다.' };
  if (u.is_platform_admin && member) return { ok: false, error: '플랫폼 관리자 계정은 통합관리 전용이라 행사 소속을 가질 수 없습니다.' };
  const now = new Date().toISOString();
  const { error } = member
    ? await admin.from('program_members').upsert({ program_id: programId, user_id: userId, role: role ?? (u.role as 'institution' | 'nextlab' | 'mentor' | 'mentee'), is_active: true, left_at: null, joined_at: now }, { onConflict: 'program_id,user_id' })
    : await admin.from('program_members').update({ is_active: false, left_at: now }).eq('program_id', programId).eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  await auditUser(op.id, member ? 'platform.membership.add' : 'platform.membership.remove', userId, { program_id: programId, program: p.name, role: member ? (role ?? u.role) : null });
  revalidateUsers();
  return { ok: true };
}
