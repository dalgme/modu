import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { BUSINESS_DOC_KEYS, type BusinessDocKey } from '@/lib/files/business-plan-shared';
import type { MenteeMatchCandidate } from '@/lib/files/business-plan-match';
import { menteeOrg } from '@/lib/utils/labels';

/**
 * 멘티 사업계획서·참고파일 조회 (2026-09-30) — documents(doc_key business_plan / business_ref).
 * service_role 로 읽는다 — 호출부(페이지·액션)가 행사·라운드·담당 여부를 먼저 확인한다 (CLAUDE.md §6-2).
 */

export interface BusinessDocItem {
  id: string;
  docKey: BusinessDocKey;
  name: string;
  mime: string | null;
  size: number | null;
  createdAt: string;
}

export interface RoundBusinessPlanRow {
  caseId: string;
  menteeName: string;
  /** 닉네임(이름과 같으면 빈 문자열) */
  nickname: string;
  externalNo: string | null;
  mentorName: string | null;
  phone: string | null;
  email: string | null;
  withdrawn: boolean;
  files: BusinessDocItem[];
}

type DocRow = { id: string; case_id: string; doc_key: string; doc_name: string; mime_type: string | null; file_size: number | null; created_at: string };

const toItem = (d: DocRow): BusinessDocItem => ({ id: d.id, docKey: d.doc_key as BusinessDocKey, name: d.doc_name, mime: d.mime_type, size: d.file_size, createdAt: d.created_at });
/** 사업계획서 먼저, 같은 종류는 올린 순 */
const docOrder = (a: BusinessDocItem, b: BusinessDocItem) => (a.docKey === b.docKey ? a.createdAt.localeCompare(b.createdAt) : a.docKey === 'business_plan' ? -1 : 1);

/**
 * 라운드(사업그룹)의 멘티별 사업계획서 표 + 파일명 매칭 후보.
 * 후보는 사람 단위 — 같은 멘티의 케이스가 라운드 안에 여럿(중도 종료 후 재등록 등)이면 진행 중 케이스를 우선한다.
 */
export async function loadRoundBusinessPlans(programId: string, supportTypeId: string): Promise<{ rows: RoundBusinessPlanRow[]; candidates: MenteeMatchCandidate[] }> {
  const admin = createAdminClient();
  const cases = await fetchAll<{ id: string; owner_name: string; business_name: string; mentee_id: string | null; phone: string; email: string | null; status: string; created_at: string }>((from, to) =>
    admin.from('cases').select('id, owner_name, business_name, mentee_id, phone, email, status, created_at').eq('program_id', programId).eq('support_type_id', supportTypeId).order('created_at', { ascending: false }).range(from, to),
  );
  const caseIds = cases.map((c) => c.id);
  const menteeIds = Array.from(new Set(cases.map((c) => c.mentee_id).filter((v): v is string => !!v)));
  const [profiles, assigns, users, docs] = await Promise.all([
    fetchAllIn<{ case_id: string; external_no: string | null }>(caseIds, (chunk, from, to) => admin.from('mentee_profiles').select('case_id, external_no').in('case_id', chunk).range(from, to)),
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean; assigned_at: string }>(caseIds, (chunk, from, to) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active, assigned_at').in('case_id', chunk).order('assigned_at', { ascending: false }).range(from, to),
    ),
    fetchAllIn<{ id: string; phone: string | null; email: string | null }>(menteeIds, (chunk, from, to) => admin.from('users').select('id, phone, email').in('id', chunk).range(from, to)),
    fetchAllIn<DocRow>(caseIds, (chunk, from, to) =>
      admin.from('documents').select('id, case_id, doc_key, doc_name, mime_type, file_size, created_at').in('case_id', chunk).in('doc_key', [...BUSINESS_DOC_KEYS]).order('created_at').range(from, to),
    ),
  ]);
  // 담당 멘토 = 활성 배정, 없으면 가장 최근 배정
  const mentorOfCase = new Map<string, string>();
  for (const a of assigns) if (a.is_active) mentorOfCase.set(a.case_id, a.mentor_id);
  for (const a of assigns) if (!mentorOfCase.has(a.case_id)) mentorOfCase.set(a.case_id, a.mentor_id);
  const mentorIds = Array.from(new Set(mentorOfCase.values()));
  const mentors = await fetchAllIn<{ id: string; name: string }>(mentorIds, (chunk, from, to) => admin.from('users').select('id, name').in('id', chunk).range(from, to));
  const mentorName = new Map(mentors.map((m) => [m.id, m.name]));
  const extNo = new Map(profiles.map((p) => [p.case_id, p.external_no]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const docsByCase = new Map<string, BusinessDocItem[]>();
  for (const d of docs) (docsByCase.get(d.case_id) ?? docsByCase.set(d.case_id, []).get(d.case_id)!).push(toItem(d));

  const rows: RoundBusinessPlanRow[] = cases
    .map((c) => {
      const u = c.mentee_id ? userById.get(c.mentee_id) : undefined;
      const mid = mentorOfCase.get(c.id);
      return {
        caseId: c.id,
        menteeName: c.owner_name,
        nickname: menteeOrg(c.owner_name, c.business_name),
        externalNo: extNo.get(c.id) ?? null,
        mentorName: mid ? (mentorName.get(mid) ?? null) : null,
        // 연락처는 계정(회원 정보 수정 반영) 우선, 없으면 등록 당시 값
        phone: u?.phone || c.phone || null,
        email: u?.email || c.email || null,
        withdrawn: c.status === 'withdrawn',
        files: (docsByCase.get(c.id) ?? []).sort(docOrder),
      };
    })
    .sort((a, b) => Number(a.withdrawn) - Number(b.withdrawn) || a.menteeName.localeCompare(b.menteeName, 'ko'));

  // 매칭 후보: 사람(mentee_id) 단위로 하나 — 진행 중 케이스 우선, 같으면 최신(cases 는 최신순)
  const byPerson = new Map<string, (typeof cases)[number]>();
  for (const c of cases) {
    const key = c.mentee_id ?? `case:${c.id}`;
    const cur = byPerson.get(key);
    if (!cur || (cur.status === 'withdrawn' && c.status !== 'withdrawn')) byPerson.set(key, c);
  }
  const candidates: MenteeMatchCandidate[] = Array.from(byPerson.values()).map((c) => ({
    caseId: c.id,
    name: c.owner_name,
    externalNo: extNo.get(c.id) ?? null,
    nickname: menteeOrg(c.owner_name, c.business_name) || null,
  }));
  return { rows, candidates };
}

/**
 * 케이스 한 건의 사업계획서·참고파일 (멘토 케이스 화면·운영사 케이스 화면 카드용).
 * 호출부가 그 케이스를 볼 권한(담당 멘토·행사 스태프)을 먼저 확인한다.
 */
export async function listCaseBusinessDocs(caseId: string): Promise<{ programId: string; menteeName: string; files: BusinessDocItem[] } | null> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, owner_name').eq('id', caseId).maybeSingle();
  if (!c) return null;
  const { data: docs } = await admin
    .from('documents')
    .select('id, case_id, doc_key, doc_name, mime_type, file_size, created_at')
    .eq('case_id', caseId)
    .in('doc_key', [...BUSINESS_DOC_KEYS])
    .order('created_at');
  return { programId: c.program_id, menteeName: c.owner_name, files: (docs ?? []).map(toItem).sort(docOrder) };
}
