'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadReportFiles, OBS_REQUEST_ACTION } from '@/lib/data/report-files';
import { sendTracked } from '@/lib/sms/tracked-send';
import { renderObservationRequest, validateObservationRequest, type ObsMissingRow } from '@/lib/reports/observation-missing-shared';
import type { Json } from '@/types/database';

/**
 * 관찰의견서 미제출 멘토에게 요청 문자 (2026-11-22) — 리포트 › 보고서 파일 › 관찰의견서 카드의 [미제출 멘토] 탭.
 * 클라이언트가 고른 멘토를 믿지 않고 서버가 미제출 명단을 다시 계산해 교집합만 보낸다. 멘토 1명당 문자 1건
 * ({mentees} = 그 멘토의 미제출 멘티 목록). 발송은 sendTracked(문자 발송 › 발송 현황에서 수신 결과·실패자 재발송),
 * 감사는 멘토별 1행(sms.observation_request) — "최근 요청" 표시 근거.
 */

export interface ObsRequestPreview {
  mentorId: string;
  name: string;
  phoneMasked: string | null;
  mentees: string[];
  text: string;
}
export type ObsRequestPreviewResult = { ok: true; mentors: ObsRequestPreview[] } | { ok: false; error: string };
export type ObsRequestSendResult = { ok: true; batchId: string; sent: number; rejected: number; skipped: number } | { ok: false; error: string };

type Prepared =
  | { ok: false; error: string }
  | { ok: true; actorId: string; programId: string; items: (ObsRequestPreview & { phone: string | null; caseIds: string[] })[]; template: string };

async function prepare(input: { groupId: string | null; mentorIds: string[]; template: string; includeMarked: boolean }): Promise<Prepared> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { ok: false, error: '운영사 담당자만 보낼 수 있습니다.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'sms');
  if (denied) return { ok: false, error: denied };
  if (!Array.isArray(input.mentorIds) || input.mentorIds.length === 0) return { ok: false, error: '문자를 보낼 멘토를 선택하세요.' };
  const bad = validateObservationRequest(input.template ?? '');
  if (bad) return { ok: false, error: bad };

  // 라운드: 범위가 그룹이면 그 그룹만, 행사 전체면 이 행사의 그룹(또는 전체)
  let groupId = input.groupId ?? null;
  if (ctx.supportTypeId) groupId = ctx.supportTypeId;
  else if (groupId) {
    const { data: g } = await createAdminClient().from('support_types').select('id').eq('id', groupId).eq('program_id', ctx.programId).maybeSingle();
    if (!g) return { ok: false, error: '이 행사의 라운드가 아닙니다.' };
  }

  const data = await loadReportFiles(ctx.programId, groupId);
  const want = new Set(input.mentorIds);
  const byMentor = new Map<string, ObsMissingRow[]>();
  for (const r of data.obsMissing.rows) {
    if (!r.mentorId || !want.has(r.mentorId)) continue;
    if (r.outcomeLabel && !input.includeMarked) continue;
    (byMentor.get(r.mentorId) ?? byMentor.set(r.mentorId, []).get(r.mentorId)!).push(r);
  }
  if (byMentor.size === 0) return { ok: false, error: '선택한 멘토 중 관찰의견서 미제출 멘티가 있는 멘토가 없습니다(그사이 제출됐을 수 있습니다). 화면을 새로 고쳐 주세요.' };

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const multiGroup = new Set(Array.from(byMentor.values()).flat().map((r) => r.groupId)).size > 1;
  const items = Array.from(byMentor.entries())
    .map(([mentorId, list]) => {
      const first = list[0]!;
      const digits = (first.mentorPhone ?? '').replace(/\D/g, '');
      const mentees = list.map((r) => (multiGroup ? `${r.menteeName} (${r.groupName})` : r.menteeName));
      return {
        mentorId,
        name: first.mentorName ?? '(이름 없음)',
        phone: digits.length >= 10 ? digits : null,
        phoneMasked: digits.length >= 10 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : null,
        mentees,
        caseIds: list.map((r) => r.caseId),
        text: renderObservationRequest(input.template, { program: ctx.program.name, name: first.mentorName ?? '', mentees, link: `${base}/mentor/dashboard` }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { ok: true, actorId: actor.id, programId: ctx.programId, items, template: input.template };
}

/** 미리보기 — 멘토별로 실제 나갈 문자(발송과 같은 함수) */
export async function previewObservationRequestAction(input: { groupId: string | null; mentorIds: string[]; template: string; includeMarked: boolean }): Promise<ObsRequestPreviewResult> {
  const p = await prepare(input);
  if (!p.ok) return p;
  return { ok: true, mentors: p.items.map(({ mentorId, name, phoneMasked, mentees, text }) => ({ mentorId, name, phoneMasked, mentees, text })) };
}

export async function sendObservationRequestAction(input: { groupId: string | null; mentorIds: string[]; template: string; includeMarked: boolean }): Promise<ObsRequestSendResult> {
  const p = await prepare(input);
  if (!p.ok) return p;
  const sendable = p.items.filter((it) => it.phone);
  const skipped = p.items.length - sendable.length;
  if (sendable.length === 0) return { ok: false, error: '선택한 멘토 모두 휴대폰 번호가 없어 보낼 수 없습니다.' };

  const res = await sendTracked({
    programId: p.programId,
    actorId: p.actorId,
    kind: 'bulk',
    title: '관찰의견서 제출 요청',
    template: p.template,
    items: sendable.map((it) => ({ userId: it.mentorId, name: it.name, phone: it.phone!, text: it.text })),
  });
  if (!res.ok) return res;

  const rejectedIds = new Set(res.rejectedItems.map((r) => r.userId));
  const auditRows: { actor_id: string; program_id: string; action: string; entity_type: string; entity_id: string; metadata: Json }[] = p.items.map((it) => ({
    actor_id: p.actorId,
    program_id: p.programId,
    action: OBS_REQUEST_ACTION,
    entity_type: 'users',
    entity_id: it.mentorId,
    metadata: { case_ids: it.caseIds, mentees: it.mentees.length, sent: !!it.phone && !rejectedIds.has(it.mentorId), outcome: !it.phone ? 'no_phone' : rejectedIds.has(it.mentorId) ? 'rejected' : 'accepted', batch_id: res.batchId },
  }));
  // 감사 insert 오류는 삼키지 않는다 (규칙 6-3)
  const { error } = await createAdminClient().from('audit_logs').insert(auditRows);
  if (error) {
    console.error('[observation-request] audit insert failed', error);
    return { ok: false, error: `문자는 접수됐지만 요청 이력 기록에 실패했습니다: ${error.message}` };
  }
  revalidatePath('/nextlab/reports');
  return { ok: true, batchId: res.batchId, sent: res.accepted, rejected: res.rejected, skipped };
}
