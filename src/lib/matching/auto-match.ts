import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { assignMentor } from '@/lib/workflow/cases';
import { sendSolapiSms } from '@/lib/notifications/solapi';
import { resolveSmsCredentials } from '@/lib/sms/secrets';
import { mentorEligibleForGroup } from '@/lib/matching/eligibility';
import { DEFAULT_MAX_MENTEES_PER_MENTOR } from '@/lib/matching/capacity';

/**
 * P24 자동 매칭 (2026-09-22) · P25 그룹(라운드) 단위 개정 (2026-09-23).
 * 규칙:
 *  1) 멘티 등록(개별·엑셀) 시 "재배치 희망 멘토" 이름이 이 행사 멘토와 일치하고, 그 멘토가
 *     그 라운드에서 **후보 자격**(그룹 지정 규칙 + 정원 미달)이면 → 즉시 자동 배정 확정.
 *  2) 아니면 → 희망분야 1~6순위를 순서대로 멘토의 '분야'와 대조해 후보 자격이 있는 멘토를
 *     최대 3명 자동 추천(확정은 담당자 클릭). 배정을 하나도 받지 않은 멘토가 먼저, 그다음 정원 미달 멘토.
 *  3) 어떤 멘토가 배정 확정되면 다른 멘티의 추천 목록을 같은 규칙으로 다시 채운다.
 *  4) 등록된 멘티 전원이 배정되면 매칭된 멘토에게만 로그인 안내 문자를 1회 발송.
 * 부하(활성 배정 수)·정원(support_types.max_mentees_per_mentor)·그룹 지정은 전부 **라운드 단위**다.
 * 추천 저장은 match_recommendations 재사용 (prompt_version='auto-v1').
 */

export const AUTO_MATCH_VERSION = 'auto-v1';
const MAX_RECOMMEND = 3;
const OPEN_STATUSES = ['registered', 'reassignment_pending'] as const;

const norm = (s: string) => s.toLowerCase().replace(/[\s·,/()-]/g, '');

/** 분야 적합: 정규화 후 동일하거나 한쪽이 다른 쪽을 포함 */
export function fieldMatches(need: string, expertise: string[]): string | null {
  const n = norm(need);
  if (!n) return null;
  for (const e of expertise) {
    const x = norm(e);
    if (!x) continue;
    if (x === n || x.includes(n) || n.includes(x)) return e;
  }
  return null;
}

interface ProgramMentor {
  id: string;
  name: string;
  expertise: string[];
  /** 그룹(라운드)별 활성 배정 수 */
  activeByGroup: Map<string, number>;
  /** 그룹 지정 (비어 있으면 모든 그룹에서 사용) */
  designated: Set<string>;
}

interface MentorPool {
  mentors: ProgramMentor[];
  /** 그룹별 멘토 1인당 정원 */
  caps: Map<string, number>;
}

const activeIn = (m: ProgramMentor, groupId: string) => m.activeByGroup.get(groupId) ?? 0;
const capOf = (pool: MentorPool, groupId: string) => pool.caps.get(groupId) ?? DEFAULT_MAX_MENTEES_PER_MENTOR;
/** 이 라운드에서 배정 후보가 될 수 있는가 — 그룹 지정 규칙 + 정원 미달 */
const eligible = (pool: MentorPool, m: ProgramMentor, groupId: string) => mentorEligibleForGroup(m.designated, groupId) && activeIn(m, groupId) < capOf(pool, groupId);

/** 행사 멘토 풀: 이름·분야·그룹별 부하·그룹 지정 + 그룹별 정원 (1회 로드 후 메모리에서 갱신) */
async function loadMentorPool(programId: string): Promise<MentorPool> {
  const admin = createAdminClient();
  const [{ data: members }, { data: assigns }, { data: roster }, { data: groups }] = await Promise.all([
    admin.from('program_members').select('user_id, is_active, users!inner(id, name, is_active)').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true),
    // 반드시 행사 범위로 조인 필터 — 전역 조회는 1000행 캡에 잘려 부하가 과소 집계된다
    admin.from('mentor_assignments').select('mentor_id, cases!inner(program_id, support_type_id)').eq('is_active', true).eq('cases.program_id', programId),
    admin.from('support_type_members').select('user_id, support_type_id, support_types!inner(program_id)').eq('is_active', true).eq('member_role', 'mentor').eq('support_types.program_id', programId),
    admin.from('support_types').select('id, max_mentees_per_mentor').eq('program_id', programId),
  ]);
  const activeByUser = new Map<string, Map<string, number>>();
  for (const a of assigns ?? []) {
    const gid = (a.cases as unknown as { support_type_id: string } | null)?.support_type_id;
    if (!gid) continue;
    const m = activeByUser.get(a.mentor_id) ?? activeByUser.set(a.mentor_id, new Map()).get(a.mentor_id)!;
    m.set(gid, (m.get(gid) ?? 0) + 1);
  }
  const designatedByUser = new Map<string, Set<string>>();
  for (const r of roster ?? []) (designatedByUser.get(r.user_id) ?? designatedByUser.set(r.user_id, new Set()).get(r.user_id)!).add(r.support_type_id);
  const users = (members ?? [])
    .map((m) => m.users as unknown as { id: string; name: string; is_active: boolean })
    .filter((u) => u.is_active);
  const ids = users.map((u) => u.id);
  const { data: profiles } = ids.length
    ? await admin.from('mentor_profiles').select('user_id, expertise').eq('program_id', programId).in('user_id', ids)
    : { data: [] as { user_id: string; expertise: string[] }[] };
  const expertiseByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.expertise ?? []]));
  return {
    mentors: users.map((u) => ({
      id: u.id,
      name: u.name,
      expertise: expertiseByUser.get(u.id) ?? [],
      activeByGroup: activeByUser.get(u.id) ?? new Map(),
      designated: designatedByUser.get(u.id) ?? new Set(),
    })),
    caps: new Map((groups ?? []).map((g) => [g.id, g.max_mentees_per_mentor ?? DEFAULT_MAX_MENTEES_PER_MENTOR])),
  };
}

/** 이름이 정확히 하나만 일치하는 멘토 (동명이인이면 null — 자동 확정 금지) */
function uniqueByName(pool: MentorPool, name: string): ProgramMentor | null {
  const hits = pool.mentors.filter((m) => m.name.trim() === name);
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * 희망분야 1~6순위 순차 대조로 후보 멘토 최대 3명을 골라 추천 행을 만든다 (단일·배치 공용).
 * 후보 = 이 라운드에서 자격 있는 멘토, 배정 0명 우선 → 정원 미달 순. 분야 일치가 부족하면 잔여 슬롯을 후보로 채운다(사유 표기).
 */
function buildRecommendationRows(
  programId: string,
  caseId: string,
  groupId: string,
  needsRaw: string[],
  preferredMentor: string | null,
  pool: MentorPool,
  actorId: string | null,
) {
  const needs = needsRaw.slice(0, 6);
  const candidates = pool.mentors
    .filter((m) => eligible(pool, m, groupId))
    .sort((a, b) => activeIn(a, groupId) - activeIn(b, groupId) || a.name.localeCompare(b.name, 'ko'));

  const picks: { m: ProgramMentor; need: string | null; needRank: number | null; matched: string | null }[] = [];
  const picked = new Set<string>();
  for (let i = 0; i < needs.length && picks.length < MAX_RECOMMEND; i += 1) {
    for (const m of candidates) {
      if (picks.length >= MAX_RECOMMEND) break;
      if (picked.has(m.id)) continue;
      const matched = fieldMatches(needs[i]!, m.expertise);
      if (matched) {
        picked.add(m.id);
        picks.push({ m, need: needs[i]!, needRank: i + 1, matched });
      }
    }
  }
  for (const m of candidates) {
    if (picks.length >= MAX_RECOMMEND) break;
    if (picked.has(m.id)) continue;
    picked.add(m.id);
    picks.push({ m, need: null, needRank: null, matched: null });
  }

  return picks.map((p, idx) => ({
    program_id: programId,
    case_id: caseId,
    mentor_id: p.m.id,
    rank: idx + 1,
    score: p.needRank ? Math.max(100 - (p.needRank - 1) * 10 - activeIn(p.m, groupId) * 5, 40) : 30 - activeIn(p.m, groupId) * 5,
    objective: {
      auto: true,
      group_id: groupId,
      need: p.need,
      need_rank: p.needRank,
      matched_expertise: p.matched,
      mentor_active: activeIn(p.m, groupId),
      mentor_cap: capOf(pool, groupId),
      preferred_mentor: preferredMentor,
    },
    rationale: p.need
      ? `희망분야 ${p.needRank}순위 '${p.need}' ↔ 멘토 분야 '${p.matched}' 일치 · 이 라운드 담당 ${activeIn(p.m, groupId)}명`
      : `희망분야와 일치하는 후보가 부족해 정원이 남은 멘토를 후보로 채움 · 이 라운드 담당 ${activeIn(p.m, groupId)}명`,
    model: null,
    prompt_version: AUTO_MATCH_VERSION,
    generated_by: actorId,
  }));
}

/** 자동 확정 공통: 배정 + 메모리 부하 갱신 + 감사 */
async function confirmAuto(pool: MentorPool, caseId: string, groupId: string, programId: string, m: ProgramMentor, actorId: string, reason: string): Promise<boolean> {
  const r = await assignMentor(caseId, m.id, actorId);
  if (!r.ok) return false;
  m.activeByGroup.set(groupId, activeIn(m, groupId) + 1);
  const { error: auditError } = await createAdminClient().from('audit_logs').insert({
    actor_id: actorId,
    program_id: programId,
    action: 'match.auto_assign',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { mentor_id: m.id, mentor_name: m.name, group_id: groupId, reason },
  });
  if (auditError) console.error('auto assign audit insert failed:', auditError.message);
  return true;
}

/**
 * 한 케이스의 자동 추천 재계산 — 기존 자동 추천(미채택)은 지우고 새로 만든다.
 * 이미 배정된 케이스는 정리만 한다.
 */
export async function rebuildAutoRecommendations(caseId: string, actorId: string | null, preloaded?: MentorPool): Promise<number> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, support_type_id, status').eq('id', caseId).maybeSingle();
  if (!c) return 0;
  const { data: assign } = await admin.from('mentor_assignments').select('id').eq('case_id', caseId).eq('is_active', true).maybeSingle();
  await admin.from('match_recommendations').delete().eq('case_id', caseId).eq('prompt_version', AUTO_MATCH_VERSION).is('adopted_at', null);
  if (assign) return 0;
  if (!(OPEN_STATUSES as readonly string[]).includes(c.status)) return 0;

  const { data: prof } = await admin.from('mentee_profiles').select('needs, preferred_mentor').eq('case_id', caseId).maybeSingle();
  const pool = preloaded ?? (await loadMentorPool(c.program_id));
  const rows = buildRecommendationRows(c.program_id, caseId, c.support_type_id, prof?.needs ?? [], prof?.preferred_mentor ?? null, pool, actorId);
  if (rows.length === 0) return 0;
  const { error } = await admin.from('match_recommendations').insert(rows);
  if (error) {
    console.error('auto recommendation insert failed:', error.message);
    return 0;
  }
  return rows.length;
}

export interface AutoMatchOutcome {
  assigned: boolean;
  mentorName?: string;
  recommended: number;
}

/** 멘티 등록(개별) 직후 — 재배치 희망 멘토 자동 확정 또는 추천 생성. 호출부가 try/catch. */
export async function autoMatchMentee(caseId: string, actorId: string): Promise<AutoMatchOutcome> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, support_type_id, status').eq('id', caseId).maybeSingle();
  if (!c || c.status !== 'registered') return { assigned: false, recommended: 0 };
  const { data: prof } = await admin.from('mentee_profiles').select('preferred_mentor').eq('case_id', caseId).maybeSingle();
  const preferred = (prof?.preferred_mentor ?? '').trim();
  const pool = await loadMentorPool(c.program_id);

  if (preferred) {
    const m = uniqueByName(pool, preferred);
    if (m && eligible(pool, m, c.support_type_id)) {
      if (await confirmAuto(pool, caseId, c.support_type_id, c.program_id, m, actorId, '재배치 희망 멘토 · 후보 자격(그룹 지정·정원)')) {
        await afterAssignmentConfirmed(c.program_id, m.id, actorId);
        return { assigned: true, mentorName: preferred, recommended: 0 };
      }
    }
  }
  const n = await rebuildAutoRecommendations(caseId, actorId, pool);
  return { assigned: false, recommended: n };
}

/** 멘토 등록(개별) 직후 — 이 멘토를 재배치 희망으로 지정한 대기 멘티가 있으면 자격이 되는 라운드마다 순서대로 확정, 나머지 추천 재계산 */
export async function autoMatchNewMentor(programId: string, mentorId: string, actorId: string): Promise<AutoMatchOutcome> {
  const admin = createAdminClient();
  const pool = await loadMentorPool(programId);
  const me = pool.mentors.find((m) => m.id === mentorId);
  if (!me) return { assigned: false, recommended: 0 };

  let assigned = false;
  if (uniqueByName(pool, me.name.trim())) {
    const { data: waiting } = await admin
      .from('cases')
      .select('id, support_type_id, created_at, mentee_profiles!inner(preferred_mentor)')
      .eq('program_id', programId)
      .eq('status', 'registered')
      .eq('mentee_profiles.preferred_mentor', me.name.trim())
      .order('created_at');
    for (const w of waiting ?? []) {
      if (!eligible(pool, me, w.support_type_id)) continue;
      if (await confirmAuto(pool, w.id, w.support_type_id, programId, me, actorId, '멘토 등록 시 재배치 희망 대기 멘티 자동 확정')) assigned = true;
    }
  }
  await rebalanceAllOpenRecommendations(programId, actorId, pool);
  if (assigned) await notifyMentorsIfAllMatched(programId);
  return { assigned, recommended: 0 };
}

/** 미배정(등록·재배정 대기) 케이스 전체의 자동 추천 일괄 재계산 — 프로필 일괄 로드 + 삭제·삽입 각 1회 */
export async function rebalanceAllOpenRecommendations(programId: string, actorId: string | null, preloaded?: MentorPool): Promise<void> {
  const admin = createAdminClient();
  const { data: open } = await admin.from('cases').select('id, support_type_id').eq('program_id', programId).in('status', [...OPEN_STATUSES]);
  if (!open || open.length === 0) return;
  const pool = preloaded ?? (await loadMentorPool(programId));
  const openIds = open.map((c) => c.id);
  const [{ data: profiles }, { data: activeAssigns }, { error: deleteError }] = await Promise.all([
    admin.from('mentee_profiles').select('case_id, needs, preferred_mentor').in('case_id', openIds),
    admin.from('mentor_assignments').select('case_id').eq('is_active', true).in('case_id', openIds),
    admin.from('match_recommendations').delete().eq('prompt_version', AUTO_MATCH_VERSION).is('adopted_at', null).in('case_id', openIds),
  ]);
  if (deleteError) console.error('auto recommendation cleanup failed:', deleteError.message);
  const hasActive = new Set((activeAssigns ?? []).map((a) => a.case_id));
  const profileByCase = new Map((profiles ?? []).map((p) => [p.case_id, p]));
  const rows = open
    .filter((c) => !hasActive.has(c.id))
    .flatMap((c) => {
      const p = profileByCase.get(c.id);
      return buildRecommendationRows(programId, c.id, c.support_type_id, p?.needs ?? [], p?.preferred_mentor ?? null, pool, actorId);
    });
  if (rows.length > 0) {
    const { error } = await admin.from('match_recommendations').insert(rows);
    if (error) console.error('auto recommendation insert failed:', error.message);
  }
}

/**
 * 엑셀 일괄 등록 후 1회 실행하는 배치 자동 매칭 — 멘토 풀을 1회만 로드해 메모리에서 부하를 갱신하며
 * 1) 재배치 희망 멘토가 후보 자격이면 등록 순서대로 자동 확정 2) 남은 미배정 케이스 추천 일괄 재계산 3) 전원 배정 시 문자 1회
 */
export async function runProgramAutoMatch(programId: string, actorId: string): Promise<{ assigned: number }> {
  const admin = createAdminClient();
  const pool = await loadMentorPool(programId);
  const { data: waiting } = await admin
    .from('cases')
    .select('id, support_type_id, created_at, mentee_profiles!inner(preferred_mentor)')
    .eq('program_id', programId)
    .eq('status', 'registered')
    .order('created_at');

  let assigned = 0;
  for (const row of waiting ?? []) {
    const prof = row.mentee_profiles as unknown as { preferred_mentor: string | null } | { preferred_mentor: string | null }[] | null;
    const preferred = (Array.isArray(prof) ? prof[0]?.preferred_mentor : prof?.preferred_mentor)?.trim() ?? '';
    if (!preferred) continue;
    const m = uniqueByName(pool, preferred);
    if (!m || !eligible(pool, m, row.support_type_id)) continue;
    if (await confirmAuto(pool, row.id, row.support_type_id, programId, m, actorId, '일괄 등록 배치 — 재배치 희망 멘토 · 후보 자격')) assigned += 1;
  }
  await rebalanceAllOpenRecommendations(programId, actorId, pool);
  await notifyMentorsIfAllMatched(programId);
  return { assigned };
}

/**
 * 배정 확정 직후 호출(자동·수동·재배정 공통) — 확정된 멘토가 든 다른 멘티의 추천을 재계산하고,
 * 전원 배정 완료면 매칭 멘토에게 안내 문자. 실패가 배정을 되돌리면 안 되므로 throw 하지 않는다.
 */
export async function afterAssignmentConfirmed(programId: string, mentorId: string, actorId: string | null): Promise<void> {
  const admin = createAdminClient();
  try {
    const { data: stale } = await admin
      .from('match_recommendations')
      .select('case_id')
      .eq('program_id', programId)
      .eq('mentor_id', mentorId)
      .eq('prompt_version', AUTO_MATCH_VERSION)
      .is('adopted_at', null);
    const caseIds = Array.from(new Set((stale ?? []).map((r) => r.case_id)));
    if (caseIds.length > 0) {
      const pool = await loadMentorPool(programId);
      for (const id of caseIds) await rebuildAutoRecommendations(id, actorId, pool);
    }
    await notifyMentorsIfAllMatched(programId);
  } catch (err) {
    console.error('afterAssignmentConfirmed failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * 등록된 멘티(중도 종료 제외) 전원이 배정 완료면, 매칭된 멘토에게만 로그인 안내 문자를 1회 발송.
 * 문자 실패는 본 작업을 막지 않는다(§6-5). 발송 여부는 mentor_assignments.notice_sent_at 로 기록.
 */
export async function notifyMentorsIfAllMatched(programId: string): Promise<{ sent: number }> {
  const admin = createAdminClient();
  const { data: open } = await admin.from('cases').select('id').eq('program_id', programId).in('status', [...OPEN_STATUSES]).limit(1);
  if ((open ?? []).length > 0) return { sent: 0 };

  const { data: cases } = await admin.from('cases').select('id').eq('program_id', programId).neq('status', 'withdrawn');
  const caseIds = (cases ?? []).map((c) => c.id);
  if (caseIds.length === 0) return { sent: 0 };
  const { data: assigns } = await admin.from('mentor_assignments').select('id, mentor_id, notice_sent_at').eq('is_active', true).in('case_id', caseIds);
  const pending = (assigns ?? []).filter((a) => !a.notice_sent_at);
  if (pending.length === 0) return { sent: 0 };

  const mentorIds = Array.from(new Set(pending.map((a) => a.mentor_id)));
  const [{ data: program }, { data: users }] = await Promise.all([
    admin.from('programs').select('name, sms_footer').eq('id', programId).maybeSingle(),
    admin.from('users').select('id, name, email, phone, must_change_password, is_active').in('id', mentorIds),
  ]);
  if (!program) return { sent: 0 };
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const creds = await resolveSmsCredentials(programId, 'send');

  let sent = 0;
  for (const u of users ?? []) {
    const digits = (u.phone ?? '').replace(/\D/g, '');
    const rowIds = pending.filter((a) => a.mentor_id === u.id).map((a) => a.id);
    if (!u.is_active || digits.length < 10) continue;
    const lines = [
      `[${program.name}] ${u.name} 멘토님, 담당 멘티 배정이 확정되었습니다.`,
      '플랫폼에 로그인하여 배정된 멘티를 확인해 주세요.',
      base ? `${base}/login` : '',
      `아이디: 이메일(${u.email ?? '-'}) 또는 휴대폰 번호`,
    ].filter(Boolean);
    if (u.must_change_password) lines.push('첫 로그인 시 비밀번호를 새로 설정해야 합니다. 임시 비밀번호는 등록 시 안내된 값(기본: 본인 휴대폰 번호 숫자)입니다.');
    if (program.sms_footer) lines.push(program.sms_footer);
    try {
      const r = await sendSolapiSms(digits, lines.join('\n'), creds ? { creds } : {});
      if (r.ok) {
        sent += 1;
        const { error } = await admin.from('mentor_assignments').update({ notice_sent_at: new Date().toISOString() }).in('id', rowIds);
        if (error) console.error('notice_sent_at update failed:', error.message);
      }
    } catch (err) {
      console.error('match notice sms failed:', err instanceof Error ? err.message : err);
    }
  }
  return { sent };
}

/** 멘토가 로그인해 배정을 확인(대시보드 열람)하면 확인 표시 — 대행 중에는 호출하지 않는다. */
export async function markAssignmentsConfirmed(mentorId: string, programId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from('mentor_assignments')
    .select('id, cases!inner(program_id)')
    .eq('mentor_id', mentorId)
    .eq('is_active', true)
    .is('confirmed_at', null)
    .eq('cases.program_id', programId);
  const ids = (pending ?? []).map((a) => a.id);
  if (ids.length === 0) return;
  const { error } = await admin.from('mentor_assignments').update({ confirmed_at: new Date().toISOString() }).in('id', ids);
  if (error) console.error('assignment confirm mark failed:', error.message);
}
