import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/supabase/admin';
import { toStoredPhone } from '@/lib/auth/identifier';
import { AUTO_SEND_TOGGLE_KEYS } from '@/lib/notifications/templates';
import { createCase, assignMentor } from '@/lib/workflow/cases';
import { submitRound } from '@/lib/workflow/rounds';
import { logAudit } from '@/lib/workflow/audit';
import type { UserRole } from '@/lib/auth/roles';
import type { Json } from '@/types/database';

/**
 * 배포 전/후 자동 화면 점검(스모크 E2E, P34-A) 전용 데이터 시드.
 *
 * - 행사 1개(slug `smoke`) · 사업그룹 1개(코드 `SMOKE`) · 단가/한도 · 계정 4개(역할별) · 케이스 1건 + 멘토 배정 + 회차 1건.
 * - **멱등**: 몇 번을 호출해도 같은 결과. 이미 있으면 비밀번호만 재설정한다.
 * - 이 행사의 알림 이벤트는 전부 꺼서(`programs.notification_settings`) 문자·알림톡이 나가지 않게 한다.
 *   배정 안내 문자는 `mentor_assignments.notice_sent_at` 을 미리 채워 막는다.
 * - 서비스롤만 사용하고 **slug `smoke` 행사 밖의 데이터는 읽지도 쓰지도 않는다**(계정 조회는 고정 이메일 4개뿐).
 * - 기관명 리터럴 금지 규칙(§2-5)에 따라 실제 기관명은 쓰지 않는다 — 더미 "점검 발주처/점검 운영사".
 */

export const SMOKE_PROGRAM_SLUG = 'smoke';
export const SMOKE_GROUP_CODE = 'SMOKE';

export type SmokeRole = Extract<UserRole, 'institution' | 'nextlab' | 'mentor' | 'mentee'>;

export interface SmokeAccountDef {
  role: SmokeRole;
  email: string;
  name: string;
  phone: string;
  position: string | null;
}

/** 점검 계정 4개 — 이메일은 고정(스모크 스펙이 같은 값을 쓴다). 휴대폰은 더미 번호. */
export const SMOKE_ACCOUNTS: readonly SmokeAccountDef[] = [
  { role: 'institution', email: 'smoke-institution@modu.test', name: '점검 발주처담당', phone: '010-0000-0001', position: '점검 담당' },
  { role: 'nextlab', email: 'smoke-nextlab@modu.test', name: '점검 운영담당', phone: '010-0000-0002', position: '점검 PL' },
  { role: 'mentor', email: 'smoke-mentor@modu.test', name: '점검 멘토', phone: '010-0000-0003', position: null },
  { role: 'mentee', email: 'smoke-mentee@modu.test', name: '점검 멘티', phone: '010-0000-0004', position: null },
] as const;

export interface SmokeSeedResult {
  ok: true;
  programId: string;
  supportTypeId: string;
  users: { role: SmokeRole; email: string }[];
  caseId: string | null;
  /** 치명적이지 않은 단계(회차 등록 등)의 실패 사유 — 응답에 담아 원인을 바로 보이게 한다 */
  warnings: string[];
}

type Admin = ReturnType<typeof createAdminClient>;

/** 단가·한도 적용 시작일 — 회차를 어느 날짜에 등록해도 단가가 해석되도록 충분히 과거로 */
const EFFECTIVE_FROM = '2020-01-01';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 알림 이벤트 전부 off — 점검 행사에서는 어떤 알림도 큐에 들어가지 않는다 */
function allNotificationsOff(): Json {
  const out: Record<string, boolean> = {};
  // 큐 알림 23종 + 직발송 자동문자 스위치(P36) 전부 끔 — 점검 행사에서 실제 문자가 나가지 않게
  for (const key of AUTO_SEND_TOGGLE_KEYS) out[key] = false;
  return out;
}

// ---------------------------------------------------------------------------
// 1) 행사
// ---------------------------------------------------------------------------
async function ensureProgram(admin: Admin): Promise<string> {
  const patch = {
    name: '자동 점검(스모크)',
    status: 'active',
    client_name: '점검 발주처',
    client_short: '점검발주',
    operator_name: '점검 운영사',
    operator_short: '점검운영',
    app_title: '자동 점검',
    default_required_rounds: 4,
    notification_settings: allNotificationsOff(),
  };
  const { data: existing } = await admin.from('programs').select('id').eq('slug', SMOKE_PROGRAM_SLUG).maybeSingle();
  if (existing) {
    const { error } = await admin.from('programs').update(patch).eq('id', existing.id);
    if (error) throw new Error(`행사 갱신 실패: ${error.message}`);
    return existing.id;
  }
  const { data: created, error } = await admin
    .from('programs')
    .insert({ ...patch, slug: SMOKE_PROGRAM_SLUG, created_by: null })
    .select('id')
    .single();
  if (error || !created) throw new Error(`행사 생성 실패: ${error?.message ?? 'unknown'}`);
  return created.id;
}

// ---------------------------------------------------------------------------
// 2) 사업그룹 · 단가 · 한도
// ---------------------------------------------------------------------------
async function ensureGroup(admin: Admin, programId: string): Promise<string> {
  const { data: existing } = await admin.from('support_types').select('id').eq('program_id', programId).eq('code', SMOKE_GROUP_CODE).maybeSingle();
  if (existing) {
    // 종료돼 있으면 되살린다(회차 등록 게이트 ends_on 도 비움)
    await admin.from('support_types').update({ status: 'active', ends_on: null, required_rounds: 4 }).eq('id', existing.id);
    return existing.id;
  }
  const { data: created, error } = await admin
    .from('support_types')
    .insert({ program_id: programId, code: SMOKE_GROUP_CODE, name: '점검 그룹', description: '자동 화면 점검용 사업그룹', required_rounds: 4, sort_order: 1, status: 'active' })
    .select('id')
    .single();
  if (error || !created) throw new Error(`사업그룹 생성 실패: ${error?.message ?? 'unknown'}`);
  return created.id;
}

/** 표현식 유니크(coalesce(support_type_id)) 라 onConflict upsert 불가 → 수동 select→insert */
async function ensureRatesAndLimits(admin: Admin, programId: string): Promise<void> {
  const rates: { mode: 'online' | 'offline'; unit_price: number; daily_cap_amount: number }[] = [
    { mode: 'online', unit_price: 80000, daily_cap_amount: 240000 },
    { mode: 'offline', unit_price: 100000, daily_cap_amount: 300000 },
  ];
  for (const r of rates) {
    const { data: hit } = await admin
      .from('consulting_rates')
      .select('id')
      .eq('program_id', programId)
      .is('support_type_id', null)
      .eq('mode', r.mode)
      .eq('effective_from', EFFECTIVE_FROM)
      .maybeSingle();
    if (hit) continue;
    const { error } = await admin.from('consulting_rates').insert({ program_id: programId, support_type_id: null, mode: r.mode, unit_price: r.unit_price, daily_cap_amount: r.daily_cap_amount, effective_from: EFFECTIVE_FROM, created_by: null });
    if (error && error.code !== '23505') throw new Error(`단가 생성 실패(${r.mode}): ${error.message}`);
  }
  const { data: limit } = await admin.from('operating_limits').select('id').eq('program_id', programId).is('support_type_id', null).eq('effective_from', EFFECTIVE_FROM).maybeSingle();
  if (!limit) {
    const { error } = await admin.from('operating_limits').insert({ program_id: programId, support_type_id: null, mentor_daily_case_limit: 3, case_daily_round_limit: 3, effective_from: EFFECTIVE_FROM, created_by: null });
    if (error && error.code !== '23505') throw new Error(`운영 한도 생성 실패: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 3) 계정 4개 (auth.users → public.users → program_members) — 회원 등록과 같은 절차
// ---------------------------------------------------------------------------
async function findAuthUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  // users 프로필이 있으면 그 id. 없으면(과거 부분 실패) auth 목록에서 찾는다.
  const { data: profile } = await admin.from('users').select('id').ilike('email', email).maybeSingle();
  if (profile) return profile.id;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth 사용자 조회 실패: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

/** 현재 비밀번호로 로그인이 되는가 — 쿠키 없는 독립 클라이언트로 확인(세션은 만들자마자 버린다) */
async function passwordWorks(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const probe = createSupabaseClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await probe.auth.signOut({ scope: 'local' }).catch(() => undefined);
  return true;
}

async function ensureAccount(admin: Admin, programId: string, def: SmokeAccountDef, password: string): Promise<string> {
  const email = def.email.toLowerCase();
  const now = new Date().toISOString();
  let userId = await findAuthUserIdByEmail(admin, email);

  if (userId) {
    // 비밀번호는 지금 값으로 로그인이 안 될 때만 재설정한다 — admin.updateUserById({ password }) 는 그 계정의 **기존 세션을 전부 무효화**하므로
    // 동시에 도는 다른 스모크 실행(또는 사람이 열어 둔 점검 세션)을 깨뜨린다(2026-09-28 run #6·#7 발주처·운영사 전 화면 /login 튕김).
    if (!(await passwordWorks(email, password))) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true, user_metadata: { name: def.name } });
      if (error) throw new Error(`${email} 비밀번호 재설정 실패: ${error.message}`);
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: def.name } });
    if (error || !data.user) throw new Error(`${email} 계정 생성 실패: ${error?.message ?? 'unknown'}`);
    userId = data.user.id;
  }

  const profile = {
    role: def.role,
    name: def.name,
    phone: toStoredPhone(def.phone),
    email,
    position: def.position,
    organization: def.role === 'mentor' ? '점검 멘토기관' : def.role === 'mentee' ? '점검 팀' : null,
    is_active: true,
    is_platform_admin: false,
    platform_role: null,
    must_change_password: false,
    password_changed_at: now,
    activated_at: now,
    // 멘티 개인정보 동의 게이트(/mentee/consent) 통과 — agreePrivacy 가 쓰는 컬럼 그대로
    privacy_agreed_at: def.role === 'mentee' ? now : null,
  };
  const { data: existingProfile } = await admin.from('users').select('id').eq('id', userId).maybeSingle();
  if (existingProfile) {
    const { error } = await admin.from('users').update(profile).eq('id', userId);
    if (error) throw new Error(`${email} 프로필 갱신 실패: ${error.message}`);
  } else {
    const { error } = await admin.from('users').insert({ id: userId, ...profile });
    if (error) throw new Error(`${email} 프로필 생성 실패: ${error.message}`);
  }

  const { error: memberError } = await admin
    .from('program_members')
    .upsert(
      { program_id: programId, user_id: userId, role: def.role, grade: def.role === 'nextlab' ? 'pl' : null, is_active: true, left_at: null },
      { onConflict: 'program_id,user_id' },
    );
  if (memberError) throw new Error(`${email} 행사 소속 실패: ${memberError.message}`);

  if (def.role === 'mentor') {
    const { error: profileError } = await admin
      .from('mentor_profiles')
      .upsert({ program_id: programId, user_id: userId, expertise: ['자동 점검'], regions: [], mentor_institution: '점검 멘토기관', note: '스모크 점검 계정' }, { onConflict: 'program_id,user_id' });
    if (profileError) throw new Error(`${email} 멘토 프로필 실패: ${profileError.message}`);
  }
  return userId;
}

// ---------------------------------------------------------------------------
// 4) 케이스 · 배정 · 회차
// ---------------------------------------------------------------------------
async function ensureCase(admin: Admin, ids: { programId: string; supportTypeId: string; nextlabId: string; menteeId: string; mentorId: string }, warnings: string[]): Promise<string | null> {
  const mentee = SMOKE_ACCOUNTS.find((a) => a.role === 'mentee')!;
  const { data: existing } = await admin
    .from('cases')
    .select('id, status')
    .eq('program_id', ids.programId)
    .eq('support_type_id', ids.supportTypeId)
    .eq('mentee_id', ids.menteeId)
    .neq('status', 'withdrawn')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let caseId = existing?.id ?? null;
  if (!caseId) {
    const res = await createCase({
      programId: ids.programId,
      createdBy: ids.nextlabId,
      support_type_id: ids.supportTypeId,
      business_name: '점검 팀',
      owner_name: mentee.name,
      phone: mentee.phone,
      email: mentee.email,
      item: '자동 화면 점검용 아이템',
      business_reg_no: undefined,
      address: undefined,
      business_type: undefined,
      opened_at: undefined,
      employee_count: undefined,
      menteeId: ids.menteeId,
    });
    if (!res.ok) throw new Error(`케이스 등록 실패: ${res.error}`);
    caseId = res.caseId;
  }

  // 멘토 배정 (활성 배정이 없고 registered 상태일 때만)
  const { data: active } = await admin.from('mentor_assignments').select('id, notice_sent_at, confirmed_at').eq('case_id', caseId).eq('is_active', true).maybeSingle();
  if (!active) {
    const res = await assignMentor(caseId, ids.mentorId, ids.nextlabId, 'manual');
    if (!res.ok) warnings.push(`멘토 배정 건너뜀: ${res.error}`);
  }
  // 전원 배정 안내 문자(auto-match notifyMentorsIfAllMatched)가 이 배정으로 나가지 않도록 발송 기록을 미리 채운다
  const now = new Date().toISOString();
  await admin.from('mentor_assignments').update({ notice_sent_at: now, confirmed_at: now }).eq('case_id', caseId).eq('is_active', true).is('notice_sent_at', null);

  // 회차 1건 계획 등록 (오늘 10:00~11:00 KST, 온라인) — 이미 회차가 있으면 건너뜀
  const { count } = await admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', caseId);
  if ((count ?? 0) === 0) {
    const day = kstToday();
    const res = await submitRound({
      caseId,
      mentorId: ids.mentorId,
      mode: 'online',
      startedAt: new Date(`${day}T10:00:00+09:00`).toISOString(),
      endedAt: new Date(`${day}T11:00:00+09:00`).toISOString(),
      place: '온라인(점검)',
      participants: [{ name: mentee.name, role: 'representative' }],
    });
    if (!res.ok) warnings.push(`회차 등록 건너뜀: ${res.error}`);
  }
  return caseId;
}

// ---------------------------------------------------------------------------
// 진입점
// ---------------------------------------------------------------------------
export async function runSmokeSeed(password: string): Promise<SmokeSeedResult> {
  if (!password || password.length < 8) throw new Error('SMOKE_PASSWORD 는 8자 이상이어야 합니다.');
  const admin = createAdminClient();
  const warnings: string[] = [];

  const programId = await ensureProgram(admin);
  const supportTypeId = await ensureGroup(admin, programId);
  await ensureRatesAndLimits(admin, programId);

  const userIds: Partial<Record<SmokeRole, string>> = {};
  for (const def of SMOKE_ACCOUNTS) {
    userIds[def.role] = await ensureAccount(admin, programId, def, password);
  }

  const caseId = await ensureCase(
    admin,
    { programId, supportTypeId, nextlabId: userIds.nextlab!, menteeId: userIds.mentee!, mentorId: userIds.mentor! },
    warnings,
  );

  // 감사로그 — actor 는 시스템(null). 서비스롤 경로라 RLS(actor_id = auth.uid()) 영향 없음.
  await logAudit(admin, {
    actorId: null,
    programId,
    action: 'ops.smoke_seed',
    entityType: 'programs',
    entityId: programId,
    metadata: { slug: SMOKE_PROGRAM_SLUG, case_id: caseId, users: SMOKE_ACCOUNTS.map((a) => a.email), warnings },
  });

  return {
    ok: true,
    programId,
    supportTypeId,
    users: SMOKE_ACCOUNTS.map((a) => ({ role: a.role, email: a.email })),
    caseId,
    warnings,
  };
}
