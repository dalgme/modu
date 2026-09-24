import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { mentorEligibleForGroup } from '@/lib/matching/eligibility';
import type { Json } from '@/types/database';

/**
 * 멘토 서류 수령 체크 (P32) — 위촉 서식 직접 제출 대신 **오프라인으로 수령한 사실**만 체크한다.
 *  - 체크리스트(서류명 목록 + 사용 여부)는 행사 공통(support_type_id null) 또는 그룹 override.
 *  - 해석 = 그룹 행 → 행사 공통 → 없음. 멘토 개인에게는 지정 그룹(그룹명순 첫째 override) → 행사 공통.
 *  - 수령 기록의 스코프 = 그 멘토에게 적용된 체크리스트의 스코프 (공통이면 null).
 */

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
export const MAX_DOC_ITEMS = 20;

export interface MentorDocItem {
  /** 안정 슬러그 — 이름을 바꿔도 유지된다 (수령 기록의 키) */
  key: string;
  name: string;
}

export interface MentorDocChecklist {
  /** 행 id (스코프에 직접 저장된 행이 없으면 null) */
  id: string | null;
  scope: { supportTypeId: string | null };
  enabled: boolean;
  items: MentorDocItem[];
  /** 요청한 스코프에 직접 저장된 행인지 (그룹에서 false = 행사 공통을 따르는 중) */
  defined: boolean;
}

type ChecklistRow = { id: string; support_type_id: string | null; enabled: boolean; items: Json };

/** jsonb → 항목 배열 (형식이 어긋난 원소는 버린다) */
export function parseDocItems(json: Json | null | undefined): MentorDocItem[] {
  if (!Array.isArray(json)) return [];
  const out: MentorDocItem[] = [];
  const seen = new Set<string>();
  for (const raw of json) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const key = String((raw as Record<string, unknown>).key ?? '').trim();
    const name = String((raw as Record<string, unknown>).name ?? '').trim();
    if (!key || !name || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name });
  }
  return out;
}

function rowToChecklist(row: ChecklistRow | undefined, scope: string | null, defined: boolean): MentorDocChecklist | null {
  if (!row) return null;
  return { id: row.id, scope: { supportTypeId: scope }, enabled: row.enabled, items: parseDocItems(row.items), defined };
}

async function loadRows(programId: string): Promise<ChecklistRow[]> {
  const { data } = await createAdminClient().from('mentor_doc_checklists').select('id, support_type_id, enabled, items').eq('program_id', programId);
  return (data ?? []) as ChecklistRow[];
}

/** 설정 화면용 — 한 스코프의 체크리스트(그룹이면 override 가 없을 때 공통 값을 폴백으로, defined=false) */
export async function getChecklistForScope(programId: string, supportTypeId: string | null): Promise<MentorDocChecklist | null> {
  const rows = await loadRows(programId);
  const common = rows.find((r) => !r.support_type_id);
  if (!supportTypeId) return rowToChecklist(common, null, true);
  const group = rows.find((r) => r.support_type_id === supportTypeId);
  if (group) return rowToChecklist(group, supportTypeId, true);
  return common ? { ...rowToChecklist(common, null, true)!, defined: false } : null;
}

/**
 * 그룹에 적용되는 체크리스트 — 그룹 행이 있으면 그 행(스코프 = 그룹), 없으면 행사 공통(스코프 = null), 둘 다 없으면 null.
 * supportTypeId = null 이면 행사 공통.
 */
export async function resolveChecklistForGroup(programId: string, supportTypeId: string | null): Promise<MentorDocChecklist | null> {
  const rows = await loadRows(programId);
  return resolveFromRows(rows, supportTypeId);
}

function resolveFromRows(rows: ChecklistRow[], supportTypeId: string | null): MentorDocChecklist | null {
  if (supportTypeId) {
    const group = rows.find((r) => r.support_type_id === supportTypeId);
    if (group) return rowToChecklist(group, supportTypeId, true);
  }
  return rowToChecklist(rows.find((r) => !r.support_type_id), null, true);
}

/** 멘토들의 지정 그룹 (이 행사 그룹만, is_active) */
async function mentorGroupMap(programId: string, mentorIds: string[]): Promise<{ map: Map<string, string[]>; groupNames: Map<string, string> }> {
  const map = new Map<string, string[]>();
  const admin = createAdminClient();
  const { data: groups } = await admin.from('support_types').select('id, name').eq('program_id', programId);
  const groupNames = new Map((groups ?? []).map((g) => [g.id, g.name]));
  if (mentorIds.length === 0) return { map, groupNames };
  const groupIds = Array.from(groupNames.keys());
  if (groupIds.length === 0) return { map, groupNames };
  const roster = await fetchAllIn<{ support_type_id: string; user_id: string }>(mentorIds, (chunk, from, to) =>
    admin.from('support_type_members').select('support_type_id, user_id').eq('member_role', 'mentor').eq('is_active', true).in('user_id', chunk).in('support_type_id', groupIds).range(from, to),
  );
  for (const r of roster) map.set(r.user_id, [...(map.get(r.user_id) ?? []), r.support_type_id]);
  return { map, groupNames };
}

/** 멘토별 유효 체크리스트 — 지정 그룹 중 override 가 있는 첫 그룹(그룹명순) → 행사 공통 → null */
function resolveForMentor(rows: ChecklistRow[], groupIds: string[], groupNames: Map<string, string>): MentorDocChecklist | null {
  const candidates = groupIds
    .filter((g) => rows.some((r) => r.support_type_id === g))
    .sort((a, b) => (groupNames.get(a) ?? '').localeCompare(groupNames.get(b) ?? '', 'ko'));
  const first = candidates[0];
  if (first) return resolveFromRows(rows, first);
  return resolveFromRows(rows, null);
}

/** 멘토 개인에게 적용되는 체크리스트 (멘토 대시보드·수령 액션 검증용) */
export async function effectiveChecklistForMentor(programId: string, mentorId: string): Promise<MentorDocChecklist | null> {
  const [rows, { map, groupNames }] = await Promise.all([loadRows(programId), mentorGroupMap(programId, [mentorId])]);
  return resolveForMentor(rows, map.get(mentorId) ?? [], groupNames);
}

/* ── 수령 현황 ─────────────────────────────────────────────────────────── */

export interface MentorDocReceiptItem {
  key: string;
  name: string;
  received: boolean;
  receivedAt: string | null;
  receivedBy: string | null;
  note: string | null;
}

export interface MentorDocStatusRow {
  mentorId: string;
  name: string;
  items: MentorDocReceiptItem[];
  receivedCount: number;
  total: number;
}

export interface MentorDocStatusSection {
  /** 이 섹션의 수령 스코프 (null = 행사 공통) */
  scope: { supportTypeId: string | null; name: string };
  enabled: boolean;
  items: MentorDocItem[];
  mentors: MentorDocStatusRow[];
}

export interface MentorDocStatus {
  /** 요청 범위에 적용된 섹션들 — 행사 전체 범위에서 그룹 override 가 있으면 여러 섹션('그룹별 상이') */
  sections: MentorDocStatusSection[];
  /** 사용 중인(enabled) 섹션이 하나라도 있는지 */
  anyEnabled: boolean;
  /** 행사 전체 범위인데 그룹별 목록이 갈리는지 */
  mixed: boolean;
}

type ReceiptRow = { mentor_id: string; support_type_id: string | null; item_key: string; received: boolean; received_at: string | null; received_by: string | null; note: string | null };

/** 멘토 본인의 수령 현황 (대시보드) — 유효 체크리스트가 없거나 꺼져 있으면 null */
export async function getMentorDocStatusForMentor(programId: string, mentorId: string): Promise<{ items: MentorDocReceiptItem[]; receivedCount: number; total: number } | null> {
  const checklist = await effectiveChecklistForMentor(programId, mentorId);
  if (!checklist || !checklist.enabled || checklist.items.length === 0) return null;
  const receipts = await loadReceipts(programId, [mentorId]);
  const row = buildRow(mentorId, '', checklist, receipts, new Map());
  return { items: row.items, receivedCount: row.receivedCount, total: row.total };
}

async function loadReceipts(programId: string, mentorIds: string[]): Promise<ReceiptRow[]> {
  const admin = createAdminClient();
  return fetchAllIn<ReceiptRow>(mentorIds, (chunk, from, to) =>
    admin.from('mentor_doc_receipts').select('mentor_id, support_type_id, item_key, received, received_at, received_by, note').eq('program_id', programId).in('mentor_id', chunk).range(from, to),
  );
}

function buildRow(mentorId: string, name: string, checklist: MentorDocChecklist, receipts: ReceiptRow[], nameOf: Map<string, string>): MentorDocStatusRow {
  const scope = checklist.scope.supportTypeId;
  const mine = receipts.filter((r) => r.mentor_id === mentorId && (r.support_type_id ?? null) === scope);
  const items = checklist.items.map((it) => {
    const r = mine.find((x) => x.item_key === it.key);
    return {
      key: it.key,
      name: it.name,
      received: r?.received ?? false,
      receivedAt: r?.received ? r.received_at : null,
      receivedBy: r?.received && r.received_by ? nameOf.get(r.received_by) ?? null : null,
      note: r?.note ?? null,
    };
  });
  return { mentorId, name, items, receivedCount: items.filter((i) => i.received).length, total: items.length };
}

/**
 * 운영사 수령 현황 — 범위(행사 전체 | 그룹)의 멘토 × 서류.
 *  - 그룹 범위: 그 그룹에 적용되는 체크리스트 1개 + 그 그룹에서 쓸 수 있는 멘토(지정 없음 = 전체, 지정 있으면 그 그룹 지정, 또는 그 그룹 케이스 담당 중).
 *  - 행사 전체: 멘토별 유효 체크리스트로 묶어 스코프별 섹션. 그룹 override 가 있으면 mixed=true.
 *  사용 중(enabled)인 체크리스트만 집계한다.
 */
export async function listMentorDocStatus(programId: string, supportTypeId: string | null): Promise<MentorDocStatus> {
  const admin = createAdminClient();
  const [rows, members] = await Promise.all([
    loadRows(programId),
    fetchAll<{ user_id: string }>((from, to) => admin.from('program_members').select('user_id').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true).range(from, to)),
  ]);
  const empty: MentorDocStatus = { sections: [], anyEnabled: false, mixed: false };
  if (rows.length === 0) return empty;
  const mentorIds = members.map((m) => m.user_id);
  const users = await fetchAllIn<{ id: string; name: string }>(mentorIds, (chunk, from, to) => admin.from('users').select('id, name').in('id', chunk).eq('is_active', true).range(from, to));
  users.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (users.length === 0) return empty;
  const ids = users.map((u) => u.id);
  const { map: groupMap, groupNames } = await mentorGroupMap(programId, ids);

  // 섹션 구성: (스코프 → 멘토 목록)
  const sections = new Map<string, { checklist: MentorDocChecklist; mentors: { id: string; name: string }[] }>();
  if (supportTypeId) {
    const checklist = resolveFromRows(rows, supportTypeId);
    if (!checklist) return empty;
    // 그룹에서 쓸 수 있는 멘토 = 지정 규칙(eligibility) 또는 그 그룹 케이스를 담당 중
    const assigned = await fetchAllIn<{ mentor_id: string; cases: { support_type_id: string } | null }>(ids, (chunk, from, to) =>
      admin.from('mentor_assignments').select('mentor_id, cases!inner(support_type_id)').in('mentor_id', chunk).eq('is_active', true).eq('cases.support_type_id', supportTypeId).range(from, to),
    );
    const assignedHere = new Set(assigned.map((a) => a.mentor_id));
    const mentors = users.filter((u) => mentorEligibleForGroup(groupMap.get(u.id) ?? [], supportTypeId) || assignedHere.has(u.id));
    sections.set(checklist.scope.supportTypeId ?? ZERO_UUID, { checklist, mentors });
  } else {
    for (const u of users) {
      const checklist = resolveForMentor(rows, groupMap.get(u.id) ?? [], groupNames);
      if (!checklist) continue;
      const k = checklist.scope.supportTypeId ?? ZERO_UUID;
      const s = sections.get(k) ?? sections.set(k, { checklist, mentors: [] }).get(k)!;
      s.mentors.push(u);
    }
  }

  const receipts = await loadReceipts(programId, ids);
  const byIds = Array.from(new Set(receipts.map((r) => r.received_by).filter((x): x is string => !!x)));
  const staff = await fetchAllIn<{ id: string; name: string }>(byIds, (chunk, from, to) => admin.from('users').select('id, name').in('id', chunk).range(from, to));
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));

  const out: MentorDocStatusSection[] = [];
  const ordered = Array.from(sections.values()).sort((a, b) => {
    const an = a.checklist.scope.supportTypeId ? groupNames.get(a.checklist.scope.supportTypeId) ?? '' : '';
    const bn = b.checklist.scope.supportTypeId ? groupNames.get(b.checklist.scope.supportTypeId) ?? '' : '';
    if (!a.checklist.scope.supportTypeId) return -1;
    if (!b.checklist.scope.supportTypeId) return 1;
    return an.localeCompare(bn, 'ko');
  });
  for (const s of ordered) {
    const sid = s.checklist.scope.supportTypeId;
    out.push({
      scope: { supportTypeId: sid, name: sid ? groupNames.get(sid) ?? '그룹' : '행사 공통' },
      enabled: s.checklist.enabled && s.checklist.items.length > 0,
      items: s.checklist.items,
      mentors: s.mentors.map((m) => buildRow(m.id, m.name, s.checklist, receipts, nameOf)),
    });
  }
  return {
    sections: out,
    anyEnabled: out.some((s) => s.enabled),
    mixed: !supportTypeId && out.some((s) => s.scope.supportTypeId !== null),
  };
}

/** 여러 멘토의 유효 체크리스트를 한 번에 (일괄 수령 액션 검증용) */
export async function effectiveChecklistsForMentors(programId: string, mentorIds: string[]): Promise<Map<string, MentorDocChecklist | null>> {
  const [rows, { map, groupNames }] = await Promise.all([loadRows(programId), mentorGroupMap(programId, mentorIds)]);
  const out = new Map<string, MentorDocChecklist | null>();
  for (const id of mentorIds) out.set(id, resolveForMentor(rows, map.get(id) ?? [], groupNames));
  return out;
}
