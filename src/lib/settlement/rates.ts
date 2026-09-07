import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Enums } from '@/types/database';

export type ConsultingMode = Enums<'consulting_mode'>;

export interface ResolvedRate {
  rateId: string;
  mode: ConsultingMode;
  unitPrice: number;
  dailyCapAmount: number;
  effectiveFrom: string;
  /** 그룹 override 인지 (false = 행사 기본) */
  fromGroup: boolean;
}

export interface ResolvedLimits {
  mentorDailyCaseLimit: number;
  caseDailyRoundLimit: number;
  fromGroup: boolean;
}

const NIL = '00000000-0000-0000-0000-000000000000';

/**
 * 단가 해석 — docs/MODU-DESIGN.md §4-3·§6-1.
 * 순서: 그룹 행(support_type_id) → 행사 기본(null). 같은 범위 안에서는 effective_from ≤ 기준일 중 최신.
 * 코드에 단가 숫자를 두지 않는다 — 없으면 null 을 돌려주고 호출부가 "단가 미설정"으로 거부한다.
 */
export async function resolveRate(
  programId: string,
  supportTypeId: string | null,
  mode: ConsultingMode,
  onDate: string, // YYYY-MM-DD (KST)
): Promise<ResolvedRate | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('consulting_rates')
    .select('id, mode, unit_price, daily_cap_amount, effective_from, support_type_id')
    .eq('program_id', programId)
    .eq('mode', mode)
    .lte('effective_from', onDate)
    .order('effective_from', { ascending: false });
  const rows = data ?? [];
  const pick = (supportTypeId ? rows.find((r) => r.support_type_id === supportTypeId) : undefined) ?? rows.find((r) => r.support_type_id === null);
  if (!pick) return null;
  return {
    rateId: pick.id,
    mode: pick.mode,
    unitPrice: Number(pick.unit_price),
    dailyCapAmount: Number(pick.daily_cap_amount),
    effectiveFrom: pick.effective_from,
    fromGroup: pick.support_type_id !== null && pick.support_type_id !== NIL,
  };
}

/** 운영 한도 해석 (행사 기본 → 그룹 override). 없으면 안전한 기본값 대신 null → 호출부가 거부. */
export async function resolveLimits(programId: string, supportTypeId: string | null, onDate: string): Promise<ResolvedLimits | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('operating_limits')
    .select('mentor_daily_case_limit, case_daily_round_limit, effective_from, support_type_id')
    .eq('program_id', programId)
    .lte('effective_from', onDate)
    .order('effective_from', { ascending: false });
  const rows = data ?? [];
  const pick = (supportTypeId ? rows.find((r) => r.support_type_id === supportTypeId) : undefined) ?? rows.find((r) => r.support_type_id === null);
  if (!pick) return null;
  return {
    mentorDailyCaseLimit: pick.mentor_daily_case_limit,
    caseDailyRoundLimit: pick.case_daily_round_limit,
    fromGroup: pick.support_type_id !== null,
  };
}

/** KST 기준 날짜 문자열 (YYYY-MM-DD) */
export function kstDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
