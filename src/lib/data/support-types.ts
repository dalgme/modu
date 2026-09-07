import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';
import type { CaseListItem } from '@/lib/data/cases';

export type SupportTypeRow = Tables<'support_types'>;
export type SupportTypeDocument = Tables<'support_type_documents'>;

export interface SupportTypeWithDocs extends SupportTypeRow {
  documents: SupportTypeDocument[];
}

/** 지원유형 + 유형별 서류 목록 (관리자 설정·업로드 화면 공통) */
export async function getSupportTypeWithDocs(
  supportTypeId: string,
): Promise<SupportTypeWithDocs | null> {
  const supabase = createClient();
  const { data: type } = await supabase
    .from('support_types')
    .select('*')
    .eq('id', supportTypeId)
    .maybeSingle();
  if (!type) return null;
  const { data: docs } = await supabase
    .from('support_type_documents')
    .select('*')
    .eq('support_type_id', supportTypeId)
    .order('sort_order');
  return { ...type, documents: docs ?? [] };
}

/** 전체 지원유형 + 서류 (관리자 설정 화면) */
export async function listSupportTypesWithDocs(): Promise<SupportTypeWithDocs[]> {
  const supabase = createClient();
  const { data: types } = await supabase.from('support_types').select('*').order('name');
  if (!types) return [];
  const { data: docs } = await supabase
    .from('support_type_documents')
    .select('*')
    .order('sort_order');
  return types.map((t) => ({
    ...t,
    documents: (docs ?? []).filter((d) => d.support_type_id === t.id),
  }));
}

/**
 * 지원한도 계산.
 * - fixed: limit_amount 정액
 * - area_cap: min(평당단가 × 전용면적, limit_amount)
 * 자격심사가 아니라 금액 규칙만 적용한다.
 */
export function computeSupportLimit(
  type: Pick<SupportTypeRow, 'calc_method' | 'limit_amount' | 'area_unit_price'>,
  areaPyeong: number | null | undefined,
): number {
  if (type.calc_method === 'area_cap' && type.area_unit_price && areaPyeong) {
    return Math.min(type.area_unit_price * areaPyeong, type.limit_amount);
  }
  return type.limit_amount;
}

/** 케이스 기준 지원한도 (폐업정리면 전용면적 반영) */
export function computeCaseLimit(
  type: Pick<SupportTypeRow, 'calc_method' | 'limit_amount' | 'area_unit_price'>,
  caseItem: Pick<CaseListItem, 'exclusive_area_pyeong'>,
): number {
  return computeSupportLimit(type, caseItem.exclusive_area_pyeong);
}
