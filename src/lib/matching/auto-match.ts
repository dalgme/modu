import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { assignMentor } from '@/lib/workflow/cases';
import { sendSolapiSms } from '@/lib/notifications/solapi';
import { resolveSmsCredentials } from '@/lib/sms/secrets';

/**
 * P24 자동 매칭 (2026-09-22).
 * 규칙:
 *  1) 멘티 등록(개별·엑셀) 시 "재배치 희망 멘토" 이름이 이 행사 멘토와 일치하고
 *     그 멘토가 아직 아무 멘티와도 매칭되지 않았으면 → 즉시 자동 배정 확정.
 *  2) 희망 멘토가 이미 매칭 완료(활성 배정 보유)면 → 희망분야 1~6순위를 순서대로
 *     멘토의 '분야'와 대조해 "미배정 멘토"를 최대 3명 자동 추천(확정은 담당자 클릭).
 *  3) 어떤 멘토가 배정 확정되면 다른 멘티의 추천 목록에서 그 멘토를 빼고
 *     같은 규칙으로 다시 채운다.
 *  4) 등록된 멘티 전원이 배정되면 매칭된 멘토에게만 로그인 안내 문자를 1회 발송.
 * 추천 저장은 기존 match_recommendations 재사용 (prompt_version='auto-v1').
 */

export const AUTO_MATCH_VERSION = 'auto-v1';
const MAX_RECOMMEND = 3;

const norm = (s: string) => s.toLowerCase().replace(/[\s·,/()-]/g, '');

/** 분야 적합: 정규화 후 동일하거나 한쪽이 다른 쪽을 포함 */
function fieldMatches(need: string, expertise: string[]): string | null {
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
  activeCases: number;
}

/** 행사 멘토 + 이 행사 케이스 기준 활성 배정 수 */
async function loadProgramMentors(programId: string): Promise<ProgramMentor[]> {
  const admin = createAdminClient();
  const [{ data: members }, { data: assigns }, { data: cases }] = await Promise.all([
    admin.from('program_members').select('user_id, is_active, users!inner(id, name, is_active)').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true),
    admin.from('mentor_assignments').select('mentor_id, case_id').eq('is_active', true),
    admin.from('cases').select('id').eq('program_id', programId),
  ]);
  const inProgram = new Set((cases ?? []).map((c) => c.id));
  const load = new Map<string, number>();
  for (const a of assigns ?? []) if (inProgram.has(a.case_id)) load.set(a.mentor_id, (load.get(a.mentor_id) ?? 0) + 1);
  const users = (members ?? [])
    .map((m) => m.users as unknown as { id: string; name: string; is_active: boolean })
    .filter((u) => u.is_active);
  const ids = users.map((u) => u.id);
  const { data: profiles } = ids.length
    ? await admin.from('mentor_profiles').select('user_id, expertise').eq('program_id', programId).in('user_id', ids)
    : { data: [] as { user_id: string; expertise: string[] }[] };
  const expertiseByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.expertise ?? []]));
  return users.map((u) => ({ id: u.id, name: u.name, expertise: expertiseByUser.get(u.id) ?? [], activeCases: load.get(u.id) ?? 0 }));
}

/**
 * 희망분야 순차 적용으로 "미배정 멘토" 최대 3명 추천을 다시 계산해 저장.
 * 기존 자동 추천(미채택)은 지우고 새로 만든다. 분야가 하나도 안 맞으면 미배정 멘토로 잔여 슬롯을 채운다(사유 표기).
 */
export async function rebuildAutoRecommendations(caseId: string, actorId: string | null): Promise<number> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, status').eq('id', caseId).maybeSingle();
  if (!c) return 0;
  const { data: assign } = await admin.from('mentor_assignments').select('id').eq('case_id', caseId).eq('is_active', true).maybeSingle();
  // 이미 배정된 케이스는 추천이 필요 없다 — 기존 자동 추천만 정리
  await admin.from('match_recommendations').delete().eq('case_id', caseId).eq('prompt_version', AUTO_MATCH_VERSION).is('adopted_at', null);
  if (assign) return 0;
  if (c.status !== 'registered' && c.status !== 'reassignment_pending') return 0;

  const { data: prof } = await admin.from('mentee_profiles').select('needs, preferred_mentor').eq('case_id', caseId).maybeSingle();
  const needs = (prof?.needs ?? []).slice(0, 6);
  const mentors = await loadProgramMentors(c.program_id);
  const unassigned = mentors.filter((m) => m.activeCases === 0);

  const picks: { mentorId: string; need: string | null; needRank: number | null; matched: string | null }[] = [];
  const picked = new Set<string>();
  for (let i = 0; i < needs.length && picks.length < MAX_RECOMMEND; i += 1) {
    for (const m of unassigned) {
      if (picks.length >= MAX_RECOMMEND) break;
      if (picked.has(m.id)) continue;
      const matched = fieldMatches(needs[i]!, m.expertise);
      if (matched) {
        picked.add(m.id);
        picks.push({ mentorId: m.id, need: needs[i]!, needRank: i + 1, matched });
      }
    }
  }
  // 분야 일치가 부족하면 미배정 멘토로 잔여 슬롯을 채운다 (담당자가 판단할 수 있게 사유 없음 표기)
  for (const m of unassigned) {
    if (picks.length >= MAX_RECOMMEND) break;
    if (picked.has(m.id)) continue;
    picked.add(m.id);
    picks.push({ mentorId: m.id, need: null, needRank: null, matched: null });
  }
  if (picks.length === 0) return 0;

  const rows = picks.map((p, idx) => ({
    program_id: c.program_id,
    case_id: caseId,
    mentor_id: p.mentorId,
    rank: idx + 1,
    score: p.needRank ? Math.max(100 - (p.needRank - 1) * 10, 40) : 30,
    objective: {
      auto: true,
      need: p.need,
      need_rank: p.needRank,
      matched_expertise: p.matched,
      preferred_mentor: prof?.preferred_mentor ?? null,
    },
    rationale: p.need
      ? `희망분야 ${p.needRank}순위 '${p.need}' ↔ 멘토 분야 '${p.matched}' 일치 · 미배정 멘토`
      : '희망분야와 일치하는 미배정 멘토가 부족해 미배정 멘토를 후보로 채움',
    model: null,
    prompt_version: AUTO_MATCH_VERSION,
    generated_by: actorId,
  }));
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

/**
 * 멘티 등록 직후 호출 — 재배치 희망 멘토 자동 확정 또는 추천 생성.
 * 실패해도 등록 자체를 막지 않도록 호출부에서 try/catch 로 감싼다.
 */
export async function autoMatchMentee(caseId: string, actorId: string): Promise<AutoMatchOutcome> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, status').eq('id', caseId).maybeSingle();
  if (!c || c.status !== 'registered') return { assigned: false, recommended: 0 };
  const { data: prof } = await admin.from('mentee_profiles').select('preferred_mentor').eq('case_id', caseId).maybeSingle();
  const preferred = (prof?.preferred_mentor ?? '').trim();

  if (preferred) {
    const mentors = await loadProgramMentors(c.program_id);
    const nameMatches = mentors.filter((m) => m.name.trim() === preferred);
    // 동명이인이면 자동 확정하지 않고 추천으로 넘긴다
    if (nameMatches.length === 1 && nameMatches[0]!.activeCases === 0) {
      const r = await assignMentor(caseId, nameMatches[0]!.id, actorId);
      if (r.ok) {
        await admin.from('audit_logs').insert({
          actor_id: actorId,
          program_id: c.program_id,
          action: 'match.auto_assign',
          entity_type: 'cases',
          entity_id: caseId,
          metadata: { mentor_id: nameMatches[0]!.id, mentor_name: preferred, reason: '재배치 희망 멘토 · 미배정' },
        });
        await afterAssignmentConfirmed(c.program_id, nameMatches[0]!.id, actorId);
        return { assigned: true, mentorName: preferred, recommended: 0 };
      }
    }
  }
  const n = await rebuildAutoRecommendations(caseId, actorId);
  return { assigned: false, recommended: n };
}

/**
 * 멘토 등록(개별·엑셀) 직후 호출 — 이 멘토를 재배치 희망으로 지정한 미배정 멘티가 있으면
 * 가장 먼저 등록된 1건에 자동 확정하고, 나머지 미배정 멘티의 추천을 다시 계산한다.
 */
export async function autoMatchNewMentor(programId: string, mentorId: string, actorId: string): Promise<AutoMatchOutcome> {
  const admin = createAdminClient();
  const mentors = await loadProgramMentors(programId);
  const me = mentors.find((m) => m.id === mentorId);
  if (!me) return { assigned: false, recommended: 0 };

  let assigned = false;
  if (me.activeCases === 0 && mentors.filter((m) => m.name.trim() === me.name.trim()).length === 1) {
    const { data: waiting } = await admin
      .from('cases')
      .select('id, created_at, mentee_profiles!inner(preferred_mentor)')
      .eq('program_id', programId)
      .eq('status', 'registered')
      .eq('mentee_profiles.preferred_mentor', me.name.trim())
      .order('created_at')
      .limit(1);
    const target = waiting?.[0];
    if (target) {
      const r = await assignMentor(target.id, mentorId, actorId);
      if (r.ok) {
        assigned = true;
        await admin.from('audit_logs').insert({
          actor_id: actorId,
          program_id: programId,
          action: 'match.auto_assign',
          entity_type: 'cases',
          entity_id: target.id,
          metadata: { mentor_id: mentorId, mentor_name: me.name, reason: '멘토 등록 시 재배치 희망 대기 멘티 자동 확정' },
        });
        await afterAssignmentConfirmed(programId, mentorId, actorId);
      }
    }
  }
  if (!assigned) {
    // 새 멘토가 미배정 후보로 들어갈 수 있으니 미배정 멘티 추천을 다시 계산
    await rebalanceAllOpenRecommendations(programId, actorId);
  }
  return { assigned, recommended: 0 };
}

/** 미배정(등록·재배정 대기) 케이스 전체의 자동 추천을 다시 계산 */
export async function rebalanceAllOpenRecommendations(programId: string, actorId: string | null): Promise<void> {
  const admin = createAdminClient();
  const { data: open } = await admin
    .from('cases')
    .select('id')
    .eq('program_id', programId)
    .in('status', ['registered', 'reassignment_pending']);
  for (const c of open ?? []) {
    await rebuildAutoRecommendations(c.id, actorId);
  }
}

/**
 * 배정 확정 직후 호출(자동·수동 공통):
 *  - 확정된 멘토가 들어있는 다른 멘티의 추천을 제거·재계산
 *  - 전원 배정 완료면 매칭 멘토에게 안내 문자
 * 실패가 배정 자체를 되돌리면 안 되므로 내부에서 오류를 삼키지 않되 throw 하지 않는다.
 */
export async function afterAssignmentConfirmed(programId: string, mentorId: string, actorId: string | null): Promise<void> {
  const admin = createAdminClient();
  try {
    // 이 멘토가 추천에 남아 있는 미배정 케이스 → 재계산 (rebuild 가 제거+재채움을 함께 수행)
    const { data: stale } = await admin
      .from('match_recommendations')
      .select('case_id')
      .eq('program_id', programId)
      .eq('mentor_id', mentorId)
      .eq('prompt_version', AUTO_MATCH_VERSION)
      .is('adopted_at', null);
    const caseIds = Array.from(new Set((stale ?? []).map((r) => r.case_id)));
    for (const id of caseIds) await rebuildAutoRecommendations(id, actorId);
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
  const { data: open } = await admin
    .from('cases')
    .select('id')
    .eq('program_id', programId)
    .in('status', ['registered', 'reassignment_pending'])
    .limit(1);
  if ((open ?? []).length > 0) return { sent: 0 };

  const { data: cases } = await admin.from('cases').select('id').eq('program_id', programId).neq('status', 'withdrawn');
  const caseIds = (cases ?? []).map((c) => c.id);
  if (caseIds.length === 0) return { sent: 0 };
  const { data: assigns } = await admin
    .from('mentor_assignments')
    .select('id, mentor_id, notice_sent_at')
    .eq('is_active', true)
    .in('case_id', caseIds);
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
    if (u.must_change_password) lines.push('임시 비밀번호: 본인 휴대폰 번호(숫자만). 첫 로그인 시 비밀번호를 새로 설정해야 합니다.');
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

/**
 * 멘토가 로그인해 배정을 확인(대시보드·케이스 열람)하면 확인 표시.
 * 대행(view-as) 중에는 기록하지 않는다 — 호출부가 실행자 검증 후 부른다.
 */
export async function markAssignmentsConfirmed(mentorId: string, programId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: cases } = await admin.from('cases').select('id').eq('program_id', programId);
  const ids = (cases ?? []).map((c) => c.id);
  if (ids.length === 0) return;
  const { error } = await admin
    .from('mentor_assignments')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('mentor_id', mentorId)
    .eq('is_active', true)
    .is('confirmed_at', null)
    .in('case_id', ids);
  if (error) console.error('assignment confirm mark failed:', error.message);
}
