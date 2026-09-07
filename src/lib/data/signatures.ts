import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/supabase/admin';
import { downloadDataUrl } from '@/lib/storage/files';

/** 케이스의 3자 서명 이미지 (data:URI). 없으면 null. */
export interface CaseSignatureImages {
  /** 신청업체 대표 (멘티) */
  applicant: string | null;
  /** 컨설턴트 (멘토) */
  consultant: string | null;
  /** 외주(공사·설비)업체 대표 */
  contractor: string | null;
}

/** 주어진 케이스 집합에서 signer_type 의 최신 서명 이미지(data:URI). 없으면 null. */
async function latestSignatureImageForCases(
  admin: SupabaseClient,
  caseIds: string[],
  signer: 'mentee' | 'mentor' | 'contractor',
): Promise<string | null> {
  if (caseIds.length === 0) return null;
  const { data } = await admin
    .from('signatures')
    .select('storage_path')
    .in('case_id', caseIds)
    .eq('signer_type', signer)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.storage_path) return null;
  return downloadDataUrl('signatures', data.storage_path);
}

/**
 * 멘토 서명: 해당 케이스에 배정된 멘토가 '어느 케이스에서든' 1회 서명했다면 그 최신 서명을 재사용한다.
 * (멘토는 여러 케이스를 담당하므로, 케이스별로 다시 받지 않도록 배정된 모든 케이스를 통틀어 조회)
 */
async function mentorSignature(admin: SupabaseClient, caseId: string): Promise<string | null> {
  const { data: assign } = await admin
    .from('mentor_assignments')
    .select('mentor_id')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const mentorId = assign?.mentor_id;
  if (!mentorId) return latestSignatureImageForCases(admin, [caseId], 'mentor');

  const { data: assigns } = await admin
    .from('mentor_assignments')
    .select('case_id')
    .eq('mentor_id', mentorId);
  const caseIds = Array.from(new Set([caseId, ...(assigns ?? []).map((a) => a.case_id)]));
  return latestSignatureImageForCases(admin, caseIds, 'mentor');
}

/**
 * 멘티 서명: 해당 케이스의 멘티가 '어느 곳에서든' 1회 서명했다면 재사용한다.
 * (멘티는 보통 케이스 1개지만, 동일 멘티의 케이스를 통틀어 조회)
 */
async function menteeSignature(admin: SupabaseClient, caseId: string): Promise<string | null> {
  const { data: c } = await admin.from('cases').select('mentee_id').eq('id', caseId).maybeSingle();
  const menteeId = c?.mentee_id;
  if (!menteeId) return latestSignatureImageForCases(admin, [caseId], 'mentee');

  const { data: cases } = await admin.from('cases').select('id').eq('mentee_id', menteeId);
  const caseIds = Array.from(new Set([caseId, ...(cases ?? []).map((x) => x.id)]));
  return latestSignatureImageForCases(admin, caseIds, 'mentee');
}

/**
 * 케이스에 사용할 서명(신청업체=멘티, 컨설턴트=멘토, 외주업체=contractor)을 이미지 data:URI 로 모아 반환한다.
 * 멘토·멘티는 1회 받아둔 서명을 어느 서식·케이스에서든 자동 재사용한다(외주업체는 케이스별).
 * 렌더용 이미지 조회이며 호출부(서식 생성 액션)에서 접근 제어된다 → service_role 로 조회.
 */
export async function getCaseSignatureImages(caseId: string): Promise<CaseSignatureImages> {
  const admin = createAdminClient();
  const [applicant, consultant, contractor] = await Promise.all([
    menteeSignature(admin, caseId),
    mentorSignature(admin, caseId),
    latestSignatureImageForCases(admin, [caseId], 'contractor'),
  ]);
  return { applicant, consultant, contractor };
}

/** 멘토 서명 이미지(data:URI) — 1회 받아둔 서명을 어느 케이스·서식에서든 재사용. */
export async function getMentorSignatureImage(caseId: string): Promise<string | null> {
  return mentorSignature(createAdminClient(), caseId);
}

/** 멘티 서명 이미지(data:URI) — 1회 받아둔 서명을 어느 서식에서든 재사용. */
export async function getMenteeSignatureImage(caseId: string): Promise<string | null> {
  return menteeSignature(createAdminClient(), caseId);
}

/** 서명 이미지 HTML (없으면 도장 자리표시 '(인)') */
export function signHtml(dataUrl: string | null): string {
  return dataUrl ? `<img src="${dataUrl}" style="height:30px;vertical-align:middle" />` : '(인)';
}

/** 템플릿 원시 삽입용 서명 플레이스홀더 세트 ({{{sign_*}}}) */
export function signaturePlaceholders(imgs: CaseSignatureImages): Record<string, string> {
  return {
    sign_applicant: signHtml(imgs.applicant),
    sign_consultant: signHtml(imgs.consultant),
    sign_contractor: signHtml(imgs.contractor),
  };
}
