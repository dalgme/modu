import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  listSupportItems,
  listPostSupportDocs,
  listContractorSignatures,
} from '@/lib/data/support-items';
import { requiredItemDocs, POST_DOCS } from '@/lib/support/catalog';

export interface DocLine {
  docType: string;
  name: string;
  present: boolean;
}

export interface UnitSummary {
  id: string;
  companyName: string;
  docs: DocLine[];
  complete: boolean;
}

export interface PhaseSummary {
  requiredTotal: number;
  presentTotal: number;
  /** "업체명 – 서류명" 형태의 부족 서류 목록 */
  missing: string[];
  submittedAt: string | null;
  complete: boolean;
}

export interface MenteeSubmissionSummary {
  pre: PhaseSummary & { hasUnits: boolean; units: UnitSummary[] };
  post: PhaseSummary & { docs: DocLine[] };
  signatures: number;
}

/**
 * 멘티의 실제 제출 현황(지원신청 사전 / 자금신청 사후 / 공사업체 서명)을 신청단위 시스템(si:/post:)
 * 기준으로 계산한다. 대시보드 '제출 현황' 카드와 업로드 페이지 상단 부족서류 배너에서 공용 사용.
 */
export async function getMenteeSubmissionSummary(
  caseId: string,
): Promise<MenteeSubmissionSummary> {
  const admin = createAdminClient();
  const [items, postDocs, signatures, caseRow] = await Promise.all([
    listSupportItems(caseId),
    listPostSupportDocs(caseId),
    listContractorSignatures(caseId),
    admin
      .from('cases')
      .select('pre_support_submitted_at, post_support_submitted_at')
      .eq('id', caseId)
      .maybeSingle(),
  ]);

  // 사전(지원신청) — 신청단위별 필요서류 충족
  const units: UnitSummary[] = items.map((it) => {
    const specs = requiredItemDocs(it.estimateAmount, it.workType);
    const docs: DocLine[] = specs.map((spec) => ({
      docType: spec.docType,
      name: spec.name,
      present: it.docs.some((d) => d.docType === spec.docType),
    }));
    return {
      id: it.id,
      companyName: it.companyName || '이름 미입력 업체',
      docs,
      complete: docs.length > 0 && docs.every((d) => d.present),
    };
  });
  const preMissing: string[] = [];
  let preRequired = 0;
  let prePresent = 0;
  for (const u of units) {
    for (const d of u.docs) {
      preRequired += 1;
      if (d.present) prePresent += 1;
      else preMissing.push(`${u.companyName} – ${d.name}`);
    }
  }
  const hasUnits = units.length > 0;

  // 사후(자금신청) — 지급증빙 필수서류(POST_DOCS)
  const postLines: DocLine[] = POST_DOCS.map((spec) => ({
    docType: spec.docType,
    name: spec.name,
    present: postDocs.some((d) => d.docType === spec.docType),
  }));
  const postMissing = postLines.filter((d) => !d.present).map((d) => d.name);

  return {
    pre: {
      hasUnits,
      units,
      requiredTotal: preRequired,
      presentTotal: prePresent,
      missing: preMissing,
      submittedAt: caseRow.data?.pre_support_submitted_at ?? null,
      complete: hasUnits && preMissing.length === 0,
    },
    post: {
      docs: postLines,
      requiredTotal: postLines.length,
      presentTotal: postLines.filter((d) => d.present).length,
      missing: postMissing,
      submittedAt: caseRow.data?.post_support_submitted_at ?? null,
      complete: postMissing.length === 0,
    },
    signatures: signatures.length,
  };
}
