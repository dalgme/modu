import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { caseExtensionOf, extensionHoursError, groupExtensionOf, minutesOf, type CaseExtension } from '@/lib/workflow/extension-rule';

/**
 * 라운드 연장(예: 1기 3라운드) 서버 조회 (2026-11-25).
 * 컬럼이 없는 DB 에서도 깨지지 않도록 select('*') 로 읽는다(없으면 연장 없음).
 */
export async function loadCaseExtension(caseId: string): Promise<CaseExtension> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('*').eq('id', caseId).maybeSingle();
  if (!c) return caseExtensionOf(groupExtensionOf(null), null);
  const { data: g } = await admin.from('support_types').select('*').eq('id', (c as { support_type_id: string }).support_type_id).maybeSingle();
  return caseExtensionOf(groupExtensionOf(g as never), (c as { extension_selected_at?: string | null }).extension_selected_at);
}

/** 여러 케이스의 연장 상태 */
export async function loadCaseExtensions(caseIds: string[]): Promise<Map<string, CaseExtension>> {
  const out = new Map<string, CaseExtension>();
  if (caseIds.length === 0) return out;
  const admin = createAdminClient();
  const rows: { id: string; support_type_id: string; extension_selected_at?: string | null }[] = [];
  for (let i = 0; i < caseIds.length; i += 200) {
    const { data } = await admin.from('cases').select('*').in('id', caseIds.slice(i, i + 200));
    rows.push(...((data ?? []) as never[]));
  }
  const groupIds = Array.from(new Set(rows.map((r) => r.support_type_id)));
  const { data: groups } = groupIds.length ? await admin.from('support_types').select('*').in('id', groupIds) : { data: [] };
  const byGroup = new Map(((groups ?? []) as { id: string }[]).map((g) => [g.id, groupExtensionOf(g as never)]));
  for (const r of rows) out.set(r.id, caseExtensionOf(byGroup.get(r.support_type_id) ?? groupExtensionOf(null), r.extension_selected_at));
  return out;
}

/**
 * 연장 선정 케이스의 총 시간 상한 검사 — 새(또는 바뀐) 회차를 넣어도 상한 이하인지.
 * 미선정 케이스는 항상 통과. excludeLogId = 바꾸는 회차(자기 자신은 빼고 합산).
 */
export async function checkExtensionHours(caseId: string, started: Date, ended: Date, excludeLogId?: string | null): Promise<string | null> {
  const ext = await loadCaseExtension(caseId);
  if (!ext.active || ext.capMinutes === null) return null;
  const admin = createAdminClient();
  let q = admin.from('mentoring_logs').select('id, started_at, ended_at').eq('case_id', caseId);
  if (excludeLogId) q = q.neq('id', excludeLogId);
  const { data } = await q;
  const other = (data ?? []).reduce((s, l) => s + minutesOf(l.started_at, l.ended_at), 0);
  return extensionHoursError(ext, other, minutesOf(started, ended));
}
