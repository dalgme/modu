import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';

export type DirectMessage = Tables<'direct_messages'>;

export interface MessageItem extends DirectMessage {
  senderName: string;
  senderRole: 'mentor' | 'mentee' | 'unknown';
}

export interface MessageThreadInfo {
  caseId: string;
  businessName: string;
  ownerName: string;
  mentorId: string | null;
  mentorName: string | null;
  menteeId: string | null;
  /** 나에게 도착한 미확인 메시지 수 */
  unread: number;
  lastAt: string | null;
  lastPreview: string | null;
}

async function nameMap(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await createAdminClient().from('users').select('id, name').in('id', Array.from(new Set(ids)));
  return new Map((data ?? []).map((u) => [u.id, u.name]));
}

/** 케이스 스레드 메시지 (오래된 순) — 호출부에서 당사자/스태프 확인 */
export async function listCaseThread(caseId: string): Promise<MessageItem[]> {
  const admin = createAdminClient();
  const [{ data: msgs }, { data: caseRow }] = await Promise.all([
    admin.from('direct_messages').select('*').eq('case_id', caseId).order('created_at', { ascending: true }),
    admin.from('cases').select('mentee_id').eq('id', caseId).maybeSingle(),
  ]);
  const names = await nameMap((msgs ?? []).flatMap((m) => [m.sender_id, m.recipient_id]));
  return (msgs ?? []).map((m) => ({
    ...m,
    senderName: names.get(m.sender_id) ?? '-',
    senderRole: caseRow?.mentee_id === m.sender_id ? 'mentee' : 'mentor',
  }));
}

/** 나에게 도착한 메시지를 읽음 처리 (스레드 열람 시) */
export async function markThreadRead(caseId: string, userId: string): Promise<void> {
  await createAdminClient()
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('case_id', caseId)
    .eq('recipient_id', userId)
    .is('read_at', null);
}

/** 내가 당사자인 케이스 스레드 목록 (멘토 = 배정 케이스들, 멘티 = 본인 케이스들) */
export async function listMyThreads(userId: string, role: 'mentor' | 'mentee', programId: string): Promise<MessageThreadInfo[]> {
  const admin = createAdminClient();
  let caseRows: { id: string; business_name: string; owner_name: string; mentee_id: string | null }[] = [];
  if (role === 'mentee') {
    const { data } = await admin
      .from('cases')
      .select('id, business_name, owner_name, mentee_id')
      .eq('program_id', programId)
      .eq('mentee_id', userId)
      .order('created_at', { ascending: false });
    caseRows = data ?? [];
  } else {
    const { data: assigns } = await admin
      .from('mentor_assignments')
      .select('case_id, cases!inner(id, business_name, owner_name, mentee_id, program_id)')
      .eq('mentor_id', userId)
      .eq('is_active', true);
    caseRows = (assigns ?? [])
      .map((a) => a.cases as unknown as { id: string; business_name: string; owner_name: string; mentee_id: string | null; program_id: string })
      .filter((c) => c && c.program_id === programId);
  }
  if (caseRows.length === 0) return [];
  const caseIds = caseRows.map((c) => c.id);
  const [{ data: assigns }, { data: msgs }] = await Promise.all([
    admin.from('mentor_assignments').select('case_id, mentor_id').in('case_id', caseIds).eq('is_active', true),
    admin.from('direct_messages').select('case_id, recipient_id, read_at, created_at, body').in('case_id', caseIds).order('created_at', { ascending: true }),
  ]);
  const mentorByCase = new Map((assigns ?? []).map((a) => [a.case_id, a.mentor_id]));
  const mentorNames = await nameMap(Array.from(mentorByCase.values()));
  const info = new Map<string, { unread: number; lastAt: string | null; lastPreview: string | null }>();
  for (const m of msgs ?? []) {
    const cur = info.get(m.case_id) ?? { unread: 0, lastAt: null, lastPreview: null };
    if (m.recipient_id === userId && !m.read_at) cur.unread += 1;
    cur.lastAt = m.created_at;
    cur.lastPreview = m.body.slice(0, 40);
    info.set(m.case_id, cur);
  }
  return caseRows.map((c) => {
    const mentorId = mentorByCase.get(c.id) ?? null;
    const i = info.get(c.id);
    return {
      caseId: c.id,
      businessName: c.business_name,
      ownerName: c.owner_name,
      mentorId,
      mentorName: mentorId ? (mentorNames.get(mentorId) ?? null) : null,
      menteeId: c.mentee_id,
      unread: i?.unread ?? 0,
      lastAt: i?.lastAt ?? null,
      lastPreview: i?.lastPreview ?? null,
    };
  });
}

/** 나에게 도착한 미확인 메시지 수 (대시보드 알람) */
export async function countUnreadMessages(userId: string, programId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from('direct_messages')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId)
    .eq('recipient_id', userId)
    .is('read_at', null);
  return count ?? 0;
}

export interface ProgramMessageRow {
  id: string;
  caseId: string;
  businessName: string;
  ownerName: string;
  senderName: string;
  senderRole: 'mentor' | 'mentee';
  body: string;
  createdAt: string;
  read: boolean;
}

/** 행사 전체 메시지 (운영사 모니터링 — 최신순) */
export async function listProgramMessages(programId: string, limit = 200): Promise<ProgramMessageRow[]> {
  const admin = createAdminClient();
  const { data: msgs } = await admin
    .from('direct_messages')
    .select('*')
    .eq('program_id', programId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!msgs || msgs.length === 0) return [];
  const caseIds = Array.from(new Set(msgs.map((m) => m.case_id)));
  const [{ data: cases }, names] = await Promise.all([
    admin.from('cases').select('id, business_name, owner_name, mentee_id').in('id', caseIds),
    nameMap(msgs.map((m) => m.sender_id)),
  ]);
  const caseById = new Map((cases ?? []).map((c) => [c.id, c]));
  return msgs.map((m) => {
    const c = caseById.get(m.case_id);
    return {
      id: m.id,
      caseId: m.case_id,
      businessName: c?.business_name ?? '-',
      ownerName: c?.owner_name ?? '-',
      senderName: names.get(m.sender_id) ?? '-',
      senderRole: c?.mentee_id === m.sender_id ? 'mentee' : 'mentor',
      body: m.body,
      createdAt: m.created_at,
      read: !!m.read_at,
    };
  });
}
