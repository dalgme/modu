'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';

export type CaseDeleteResult = { ok: true } | { ok: false; error: string };

/**
 * 케이스 완전 삭제 (P21 — 테스트 데이터 청소용).
 * 회차·보고서·서명·정산·메시지·팀원 등 하위 데이터는 DB FK CASCADE 로 함께 삭제되고,
 * 스토리지 파일(documents/photos/signatures)은 여기서 직접 정리한다.
 *
 * 안전장치:
 *  - 운영사 + case.delete 권한(기본 PL 전용), 행사 컨텍스트 범위 안의 케이스만
 *  - 지급 품의에 편성된 정산(batch_id 있음)이 있으면 차단 — 품의 기록이 오염되지 않게
 *  - 감사기록에 삭제 요약(멘티·회차·정산 건수)을 남긴다 (INSERT-only 라 삭제 이력은 보존)
 */
export async function deleteCaseAction(caseId: string, confirmText: string): Promise<CaseDeleteResult> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  // 완전 삭제는 별도 권한 키(case.delete, 기본 PL 전용) — 케이스 등록 권한(case.manage)만으로는 불가
  const denied = denyUnless(ctx, 'case.delete');
  if (denied) return { ok: false, error: denied };
  if (confirmText.trim() !== '삭제') return { ok: false, error: '확인 문구가 일치하지 않습니다. "삭제" 를 입력하세요.' };

  const admin = createAdminClient();
  const { data: c } = await admin
    .from('cases')
    .select('id, program_id, owner_name, business_name, status, mentee_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };

  const [{ data: settlements }, { count: roundCount }, { data: docRows }, { data: sigRows }] = await Promise.all([
    admin.from('settlements').select('id, batch_id, status').eq('case_id', caseId),
    admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
    admin.from('documents').select('storage_path, doc_key').eq('case_id', caseId),
    admin.from('signatures').select('storage_path').eq('case_id', caseId),
  ]);
  if ((settlements ?? []).some((s) => s.batch_id)) {
    return { ok: false, error: '지급 품의에 편성된 정산이 있는 케이스는 삭제할 수 없습니다. 품의를 먼저 확인하세요.' };
  }

  // 스토리지 파일 정리 (행 삭제 전에 경로 확보) — 파일 삭제 실패가 본 삭제를 막지는 않는다
  const docPaths = { documents: [] as string[], photos: [] as string[] };
  for (const d of docRows ?? []) {
    (d.doc_key.startsWith('mentoring_photo:') ? docPaths.photos : docPaths.documents).push(d.storage_path);
  }
  try {
    if (docPaths.documents.length) await admin.storage.from('documents').remove(docPaths.documents);
    if (docPaths.photos.length) await admin.storage.from('photos').remove(docPaths.photos);
    const sigPaths = (sigRows ?? []).map((s) => s.storage_path).filter(Boolean);
    if (sigPaths.length) await admin.storage.from('signatures').remove(sigPaths);
  } catch {
    /* 스토리지 정리 실패는 무시 — 고아 파일은 남지만 데이터 정합에는 영향 없음 */
  }

  // mentoring_logs.settlement_id → settlements FK 순환을 피하기 위해 참조 해제 후 케이스 삭제(CASCADE)
  await admin.from('mentoring_logs').update({ settlement_id: null }).eq('case_id', caseId).not('settlement_id', 'is', null);
  const { error } = await admin.from('cases').delete().eq('id', caseId);
  if (error) return { ok: false, error: `삭제 실패: ${error.message}` };

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: actor.id,
    program_id: ctx.programId,
    action: 'case.delete',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: {
      owner_name: c.owner_name,
      business_name: c.business_name,
      status: c.status,
      mentee_id: c.mentee_id,
      rounds: roundCount ?? 0,
      settlements: (settlements ?? []).length,
      files: (docRows ?? []).length + (sigRows ?? []).length,
    },
  });
  if (auditError) console.error('case delete audit failed:', auditError.message);

  revalidatePath('/nextlab/dashboard');
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/reports');
  return { ok: true };
}
