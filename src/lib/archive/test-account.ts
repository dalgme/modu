import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { phoneTempPassword } from '@/lib/auth/admin-accounts';
import type { Json } from '@/types/database';
import { rebalanceGroupSessions } from '@/lib/workflow/group-mentoring';

/**
 * 테스트 멘티 계정 완전 삭제 + 보관함(복원) — 2026-11-03.
 *
 * 삭제 = ① 연결된 모든 행(케이스·멘토 배정·회차·보고서·관찰의견서·서명·정산·품의(그 정산만 든 것)·메시지·알림·만족도 응답·
 *        명단 값·소속 등)을 JSON 으로 deletion_archives 에 먼저 보관 → ② 스토리지 파일을 `_archive/{보관 id}/…` 로 옮김 →
 *        ③ 행 삭제 + 로그인 계정 삭제. 리포트·정산·대시보드는 원본 행을 읽으므로 삭제와 동시에 집계에서 빠진다.
 * 복원 = 같은 id 로 로그인 계정을 다시 만들고(임시 비밀번호 = 휴대폰 숫자, 첫 로그인 때 변경) 보관한 행을 의존 순서대로 다시 넣고 파일을 되돌린다.
 * 감사 로그(audit_logs)는 지우지 않는다(추가 전용).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** 케이스 단위 행 — 복원 순서(부모 → 자식). pk = 기본키 */
const CASE_TABLES: { table: string; pk: string }[] = [
  { table: 'mentee_profiles', pk: 'case_id' },
  { table: 'case_team_members', pk: 'id' },
  { table: 'mentor_assignments', pk: 'id' },
  { table: 'case_status_history', pk: 'id' },
  { table: 'match_recommendations', pk: 'id' },
  { table: 'settlements', pk: 'id' },
  { table: 'mentoring_logs', pk: 'id' },
  { table: 'signatures', pk: 'id' },
  { table: 'documents', pk: 'id' },
  { table: 'observation_reports', pk: 'case_id' },
  { table: 'reviews', pk: 'id' },
  { table: 'round_extension_requests', pk: 'id' },
  { table: 'mentor_change_requests', pk: 'id' },
  { table: 'mentor_withdrawal_requests', pk: 'id' },
  { table: 'supplement_requests', pk: 'id' },
  { table: 'survey_responses', pk: 'id' },
];

export interface ArchivePayload {
  version: 1;
  auth: { email: string | null; phone: string | null; user_metadata: Json | null };
  users: Record<string, unknown>[];
  program_members: Record<string, unknown>[];
  roster_values: Record<string, unknown>[];
  support_type_members: Record<string, unknown>[];
  cases: Record<string, unknown>[];
  settlement_batches: Record<string, unknown>[];
  /** 다른 정산도 들어 있는 품의 — 삭제 대신 합계에서 뺀 금액 (복원 때 다시 더함) */
  batch_adjustments: { id: string; gross: number; withholding: number; net: number }[];
  case_rows: Record<string, Record<string, unknown>[]>;
  direct_messages: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  inquiries: Record<string, unknown>[];
  board_posts: Record<string, unknown>[];
  board_replies: Record<string, unknown>[];
  survey_campaign_targets: Record<string, unknown>[];
}

export interface StorageMove {
  bucket: string;
  from: string;
  to: string;
  moved: boolean;
}

export interface TestDeletionPreview {
  ok: true;
  name: string;
  email: string | null;
  phone: string | null;
  cases: { id: string; groupName: string | null; status: string; rounds: number; reports: number }[];
  mentors: string[];
  settlements: number;
  settlementNet: number;
  batchesRemoved: number;
  batchesAdjusted: number;
  files: number;
  messages: number;
}

type Blocked = { ok: false; error: string };

async function rowsIn(table: string, column: string, ids: string[]): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const admin = createAdminClient() as Loose;
  return fetchAllIn<Record<string, unknown>>(ids, (chunk, from, to) => admin.from(table).select('*').in(column, chunk).range(from, to));
}

/** 대상 검증 — 이 행사의 멘티 계정이고, 다른 행사 소속·스태프·플랫폼 관리자가 아니어야 한다 */
async function checkTarget(programId: string, userId: string): Promise<{ ok: true; user: Record<string, unknown> } | Blocked> {
  const admin = createAdminClient();
  const { data: user } = await admin.from('users').select('*').eq('id', userId).maybeSingle();
  if (!user) return { ok: false, error: '계정을 찾을 수 없습니다.' };
  if (user.is_platform_admin) return { ok: false, error: '플랫폼 관리자 계정은 삭제할 수 없습니다.' };
  const { data: memberships } = await admin.from('program_members').select('program_id, role').eq('user_id', userId);
  const mine = (memberships ?? []).find((m) => m.program_id === programId);
  if (!mine) return { ok: false, error: '이 행사 소속 회원이 아닙니다.' };
  if (mine.role !== 'mentee') return { ok: false, error: '테스트 계정 완전 삭제는 멘티 계정만 할 수 있습니다.' };
  if ((memberships ?? []).some((m) => m.program_id !== programId)) return { ok: false, error: '다른 행사에도 소속된 계정이라 완전 삭제할 수 없습니다.' };
  const { count: otherCases } = await admin.from('cases').select('id', { count: 'exact', head: true }).eq('mentee_id', userId).neq('program_id', programId);
  if ((otherCases ?? 0) > 0) return { ok: false, error: '다른 행사의 케이스가 연결된 계정이라 완전 삭제할 수 없습니다.' };
  return { ok: true, user: user as unknown as Record<string, unknown> };
}

export async function previewTestMenteeDeletion(programId: string, userId: string): Promise<TestDeletionPreview | Blocked> {
  const t = await checkTarget(programId, userId);
  if (!t.ok) return t;
  const admin = createAdminClient();
  const { data: cases } = await admin.from('cases').select('id, status, support_type_id').eq('mentee_id', userId).eq('program_id', programId);
  const caseIds = (cases ?? []).map((c) => c.id);
  const [logs, settlements, docs, sigs, assigns, msgs, groups] = await Promise.all([
    rowsIn('mentoring_logs', 'case_id', caseIds),
    rowsIn('settlements', 'case_id', caseIds),
    rowsIn('documents', 'case_id', caseIds),
    rowsIn('signatures', 'case_id', caseIds),
    rowsIn('mentor_assignments', 'case_id', caseIds),
    rowsIn('direct_messages', 'case_id', caseIds),
    admin.from('support_types').select('id, name').eq('program_id', programId),
  ]);
  const gName = new Map((groups.data ?? []).map((g) => [g.id, g.name]));
  const batchIds = Array.from(new Set(settlements.map((s) => s.batch_id as string | null).filter((b): b is string => !!b)));
  const batchSettl = await rowsIn('settlements', 'batch_id', batchIds);
  const removed = batchIds.filter((b) => batchSettl.filter((s) => s.batch_id === b).every((s) => caseIds.includes(s.case_id as string))).length;
  const mentorIds = Array.from(new Set(assigns.map((a) => a.mentor_id as string)));
  const mentors = mentorIds.length ? ((await admin.from('users').select('name').in('id', mentorIds)).data ?? []).map((u) => u.name) : [];
  return {
    ok: true,
    name: String(t.user.name ?? ''),
    email: (t.user.email as string | null) ?? null,
    phone: (t.user.phone as string | null) ?? null,
    cases: (cases ?? []).map((c) => ({
      id: c.id,
      groupName: gName.get(c.support_type_id) ?? null,
      status: c.status,
      rounds: logs.filter((l) => l.case_id === c.id).length,
      reports: logs.filter((l) => l.case_id === c.id && l.report_registered_at).length,
    })),
    mentors,
    settlements: settlements.length,
    settlementNet: settlements.reduce((a, s) => a + Number(s.net ?? 0), 0),
    batchesRemoved: removed,
    batchesAdjusted: batchIds.length - removed,
    files: docs.length + sigs.length,
    messages: msgs.length,
  };
}

function bucketOfDoc(docKey: string): string {
  return docKey.startsWith('mentoring_photo:') ? 'photos' : 'documents';
}

/** 보관 → 파일 이동 → 삭제. 보관 행 insert 가 실패하면 아무것도 지우지 않는다 */
export async function archiveAndDeleteTestMentee(input: { programId: string; userId: string; actorId: string; reason: string | null }): Promise<{ ok: true; archiveId: string; label: string; summary: Record<string, unknown> } | Blocked> {
  const t = await checkTarget(input.programId, input.userId);
  if (!t.ok) return t;
  const admin = createAdminClient();
  const loose = admin as Loose;
  const userId = input.userId;

  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const authUser = authData?.user ?? null;
  const cases = await rowsIn('cases', 'mentee_id', [userId]);
  const caseIds = cases.filter((c) => c.program_id === input.programId).map((c) => c.id as string);

  const caseRows: Record<string, Record<string, unknown>[]> = {};
  for (const { table } of CASE_TABLES) caseRows[table] = await rowsIn(table, 'case_id', caseIds);

  const settlements = caseRows.settlements ?? [];
  const batchIds = Array.from(new Set(settlements.map((s) => s.batch_id as string | null).filter((b): b is string => !!b)));
  const batchSettl = await rowsIn('settlements', 'batch_id', batchIds);
  const ownedBatchIds = batchIds.filter((b) => batchSettl.filter((s) => s.batch_id === b).every((s) => caseIds.includes(s.case_id as string)));
  const ownedBatches = await rowsIn('settlement_batches', 'id', ownedBatchIds);
  const batchAdjustments = batchIds
    .filter((b) => !ownedBatchIds.includes(b))
    .map((b) => {
      const mine = settlements.filter((s) => s.batch_id === b);
      return { id: b, gross: mine.reduce((a, s) => a + Number(s.gross ?? 0), 0), withholding: mine.reduce((a, s) => a + Number(s.withholding ?? 0), 0), net: mine.reduce((a, s) => a + Number(s.net ?? 0), 0) };
    });

  const dmByCase = await rowsIn('direct_messages', 'case_id', caseIds);
  const dmSent = await rowsIn('direct_messages', 'sender_id', [userId]);
  const dmRecv = await rowsIn('direct_messages', 'recipient_id', [userId]);
  const dms = Array.from(new Map([...dmByCase, ...dmSent, ...dmRecv].map((r) => [r.id as string, r])).values());
  const notifByCase = await rowsIn('notifications', 'case_id', caseIds);
  const notifByUser = await rowsIn('notifications', 'recipient_id', [userId]);
  const notifs = Array.from(new Map([...notifByCase, ...notifByUser].map((r) => [r.id as string, r])).values());
  const posts = await rowsIn('board_posts', 'author_id', [userId]);
  const repliesByAuthor = await rowsIn('board_replies', 'author_id', [userId]);
  const repliesOnPosts = await rowsIn('board_replies', 'post_id', posts.map((p) => p.id as string));
  const replies = Array.from(new Map([...repliesByAuthor, ...repliesOnPosts].map((r) => [r.id as string, r])).values());

  const payload: ArchivePayload = {
    version: 1,
    auth: { email: authUser?.email ?? (t.user.email as string | null) ?? null, phone: (t.user.phone as string | null) ?? null, user_metadata: (authUser?.user_metadata ?? null) as Json | null },
    users: [t.user],
    program_members: (await rowsIn('program_members', 'user_id', [userId])).filter((r) => r.program_id === input.programId),
    roster_values: await rowsIn('roster_values', 'user_id', [userId]),
    support_type_members: await rowsIn('support_type_members', 'user_id', [userId]),
    cases: cases.filter((c) => c.program_id === input.programId),
    settlement_batches: ownedBatches,
    batch_adjustments: batchAdjustments,
    case_rows: caseRows,
    direct_messages: dms,
    notifications: notifs,
    inquiries: await rowsIn('inquiries', 'mentee_id', [userId]),
    board_posts: posts,
    board_replies: replies,
    survey_campaign_targets: await rowsIn('survey_campaign_targets', 'user_id', [userId]),
  };

  const label = `${String(t.user.name ?? '')}${t.user.phone ? ` (${String(t.user.phone)})` : ''}`;
  const summary = {
    name: t.user.name ?? null,
    email: payload.auth.email,
    cases: caseIds.length,
    rounds: (caseRows.mentoring_logs ?? []).length,
    reports: (caseRows.mentoring_logs ?? []).filter((l) => l.report_registered_at).length,
    settlements: settlements.length,
    settlement_net: settlements.reduce((a, s) => a + Number(s.net ?? 0), 0),
    batches_removed: ownedBatchIds.length,
    batches_adjusted: batchAdjustments.length,
    files: (caseRows.documents ?? []).length + (caseRows.signatures ?? []).length,
  };

  // ① 보관 먼저 — 실패하면 중단
  const { data: archive, error: aErr } = await admin
    .from('deletion_archives')
    .insert({ program_id: input.programId, kind: 'test_mentee', label, target_user_id: userId, summary: summary as Json, payload: payload as unknown as Json, reason: input.reason, created_by: input.actorId })
    .select('id')
    .single();
  if (aErr || !archive) return { ok: false, error: `보관함 기록에 실패해 삭제하지 않았습니다: ${aErr?.message ?? 'unknown'}` };

  // ② 파일을 보관 경로로 이동 (실패해도 계속 — 기록만)
  const moves: StorageMove[] = [];
  const plan: { bucket: string; path: string }[] = [
    ...(caseRows.documents ?? []).map((d) => ({ bucket: bucketOfDoc(String(d.doc_key ?? '')), path: String(d.storage_path ?? '') })),
    ...(caseRows.signatures ?? []).map((s) => ({ bucket: 'signatures', path: String(s.storage_path ?? '') })),
  ].filter((p) => p.path);
  for (const p of plan) {
    const to = `_archive/${archive.id}/${p.path}`;
    const { error } = await admin.storage.from(p.bucket).move(p.path, to);
    moves.push({ bucket: p.bucket, from: p.path, to, moved: !error });
  }
  await admin.from('deletion_archives').update({ storage_moves: moves as unknown as Json }).eq('id', archive.id);

  // ③ 삭제 — 정산 FK 순환 해제 → 정산 → 케이스(하위 CASCADE) → 알림 → 품의 → 로그인 계정(users·소속·명단 값 등 CASCADE)
  const fail = async (step: string, err: { message: string } | null) => {
    if (!err) return null;
    await admin.from('deletion_archives').update({ restore_result: { delete_failed_at: step, error: err.message } as Json }).eq('id', archive.id);
    return { ok: false as const, error: `삭제 중 '${step}' 단계에서 실패했습니다: ${err.message} — 보관함에 기록이 남아 있으니 복원할 수 있습니다.` };
  };
  if (caseIds.length) {
    let r = await fail('회차 정산 연결 해제', (await admin.from('mentoring_logs').update({ settlement_id: null }).in('case_id', caseIds)).error);
    if (r) return r;
    r = await fail('정산', (await admin.from('settlements').delete().in('case_id', caseIds)).error);
    if (r) return r;
    r = await fail('케이스', (await admin.from('cases').delete().in('id', caseIds)).error);
    if (r) return r;
    // 그룹멘토링에 함께했던 다른 멘티 회차로 수당(1회분)을 다시 배정 (2026-11-04)
    await rebalanceGroupSessions((caseRows.mentoring_logs ?? []).map((l) => l.group_session_id as string | null));
  }
  if (notifs.length) {
    const r = await fail('알림', (await loose.from('notifications').delete().in('id', notifs.map((n) => n.id))).error);
    if (r) return r;
  }
  if (ownedBatchIds.length) {
    const r = await fail('품의', (await admin.from('settlement_batches').delete().in('id', ownedBatchIds)).error);
    if (r) return r;
  }
  for (const adj of batchAdjustments) {
    const { data: b } = await admin.from('settlement_batches').select('total_gross, total_withholding, total_net').eq('id', adj.id).maybeSingle();
    if (b) await admin.from('settlement_batches').update({ total_gross: Number(b.total_gross ?? 0) - adj.gross, total_withholding: Number(b.total_withholding ?? 0) - adj.withholding, total_net: Number(b.total_net ?? 0) - adj.net }).eq('id', adj.id);
  }
  {
    const { error } = await admin.auth.admin.deleteUser(userId);
    const r = await fail('로그인 계정', error ? { message: error.message } : null);
    if (r) return r;
  }
  return { ok: true, archiveId: archive.id, label, summary };
}

export interface ArchiveListItem {
  id: string;
  label: string;
  createdAt: string;
  createdByName: string | null;
  reason: string | null;
  summary: Record<string, unknown>;
  restoredAt: string | null;
  restoredByName: string | null;
  deleteFailed: boolean;
}

export async function listDeletionArchives(programId: string): Promise<ArchiveListItem[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('deletion_archives')
    .select('id, label, created_at, created_by, reason, summary, restored_at, restored_by, restore_result')
    .eq('program_id', programId)
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = data ?? [];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.created_by, r.restored_by]).filter((x): x is string => !!x)));
  const users = ids.length ? ((await admin.from('users').select('id, name').in('id', ids)).data ?? []) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    createdAt: r.created_at,
    createdByName: r.created_by ? (nameOf.get(r.created_by) ?? null) : null,
    reason: r.reason,
    summary: (r.summary ?? {}) as Record<string, unknown>,
    restoredAt: r.restored_at,
    restoredByName: r.restored_by ? (nameOf.get(r.restored_by) ?? null) : null,
    deleteFailed: !!(r.restore_result && typeof r.restore_result === 'object' && !Array.isArray(r.restore_result) && 'delete_failed_at' in r.restore_result),
  }));
}

/** 보관함에서 복원 — 같은 id 로 계정 재생성 → 행 다시 넣기(이미 있으면 덮어쓰기) → 파일 되돌리기 */
export async function restoreDeletionArchive(input: { programId: string; archiveId: string; actorId: string }): Promise<{ ok: true; tempPassword: string; email: string | null; warnings: string[] } | Blocked> {
  const admin = createAdminClient();
  const loose = admin as Loose;
  const { data: arc } = await admin.from('deletion_archives').select('*').eq('id', input.archiveId).maybeSingle();
  if (!arc || arc.program_id !== input.programId) return { ok: false, error: '이 행사의 보관 기록이 아닙니다.' };
  if (arc.restored_at) return { ok: false, error: '이미 복원한 기록입니다.' };
  const p = arc.payload as unknown as ArchivePayload;
  if (!p || p.version !== 1) return { ok: false, error: '보관 형식을 읽을 수 없습니다.' };
  const userId = arc.target_user_id;
  const warnings: string[] = [];

  // 같은 이메일·휴대폰이 이미 다른 계정에 쓰였으면 중단
  if (p.auth.email) {
    const { data: dup } = await admin.from('users').select('id').eq('email', p.auth.email).neq('id', userId).maybeSingle();
    if (dup) return { ok: false, error: `같은 이메일(${p.auth.email})을 쓰는 다른 계정이 있어 복원할 수 없습니다.` };
  }

  const tempPassword = phoneTempPassword(p.auth.phone);
  const { data: existing } = await admin.auth.admin.getUserById(userId);
  if (!existing?.user) {
    const { error } = await admin.auth.admin.createUser({ id: userId, email: p.auth.email ?? undefined, password: tempPassword, email_confirm: true, user_metadata: (p.auth.user_metadata ?? {}) as Record<string, unknown> });
    if (error) return { ok: false, error: `로그인 계정을 다시 만들지 못했습니다: ${error.message}` };
  } else {
    await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  }

  const put = async (table: string, rows: Record<string, unknown>[], pk = 'id') => {
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await loose.from(table).upsert(rows.slice(i, i + 200), { onConflict: pk });
      if (error) warnings.push(`${table}: ${error.message}`);
    }
  };
  await put('users', p.users.map((u) => ({ ...u, must_change_password: true })));
  await put('program_members', p.program_members);
  await put('roster_values', p.roster_values);
  await put('support_type_members', p.support_type_members);
  // 승계 링크가 가리키던 케이스가 이제 없으면 비운다
  const predIds = Array.from(new Set(p.cases.map((c) => c.predecessor_case_id as string | null).filter((x): x is string => !!x)));
  const alive = new Set(predIds.length ? ((await admin.from('cases').select('id').in('id', predIds)).data ?? []).map((c) => c.id) : []);
  const ownIds = new Set(p.cases.map((c) => c.id as string));
  await put('cases', p.cases.map((c) => (c.predecessor_case_id && !alive.has(c.predecessor_case_id as string) && !ownIds.has(c.predecessor_case_id as string) ? { ...c, predecessor_case_id: null } : c)));
  await put('settlement_batches', p.settlement_batches);
  // 그룹멘토링 세션이 그사이 정리됐으면(참여 회차가 모두 빠짐) 링크를 비운다 (2026-11-04)
  const sessIds = Array.from(new Set(((p.case_rows.mentoring_logs ?? []) as Record<string, unknown>[]).map((l) => l.group_session_id as string | null).filter((x): x is string => !!x)));
  const aliveSess = new Set(sessIds.length ? ((await admin.from('group_mentoring_sessions').select('id').in('id', sessIds)).data ?? []).map((x) => x.id) : []);
  if (p.case_rows.mentoring_logs) p.case_rows.mentoring_logs = (p.case_rows.mentoring_logs as Record<string, unknown>[]).map((l) => (l.group_session_id && !aliveSess.has(l.group_session_id as string) ? { ...l, group_session_id: null, group_fee_holder: false } : l));
  for (const { table, pk } of CASE_TABLES) await put(table, p.case_rows[table] ?? [], pk);
  await rebalanceGroupSessions(aliveSess);
  await put('direct_messages', p.direct_messages);
  await put('notifications', p.notifications);
  await put('inquiries', p.inquiries);
  await put('board_posts', p.board_posts);
  await put('board_replies', p.board_replies);
  await put('survey_campaign_targets', p.survey_campaign_targets);
  for (const adj of p.batch_adjustments ?? []) {
    const { data: b } = await admin.from('settlement_batches').select('total_gross, total_withholding, total_net').eq('id', adj.id).maybeSingle();
    if (b) await admin.from('settlement_batches').update({ total_gross: Number(b.total_gross ?? 0) + adj.gross, total_withholding: Number(b.total_withholding ?? 0) + adj.withholding, total_net: Number(b.total_net ?? 0) + adj.net }).eq('id', adj.id);
    else warnings.push(`품의 ${adj.id} 가 없어 합계를 되돌리지 못했습니다.`);
  }

  // 파일 되돌리기
  const moves = (Array.isArray(arc.storage_moves) ? arc.storage_moves : []) as unknown as StorageMove[];
  for (const m of moves) {
    if (!m.moved) continue;
    const { error } = await admin.storage.from(m.bucket).move(m.to, m.from);
    if (error) warnings.push(`파일 ${m.from}: ${error.message}`);
  }

  await admin
    .from('deletion_archives')
    .update({ restored_at: new Date().toISOString(), restored_by: input.actorId, restore_result: { warnings } as unknown as Json })
    .eq('id', input.archiveId);
  return { ok: true, tempPassword, email: p.auth.email, warnings };
}
