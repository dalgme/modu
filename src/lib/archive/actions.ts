'use server';

import { revalidatePath } from 'next/cache';

import { getRealSessionProfile, realRoleOrNull } from '@/lib/auth/guards';
import { getImpersonation } from '@/lib/auth/impersonation';
import { contextOrNull, type ProgramContext } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { reauthenticate } from '@/lib/sms/reauth';
import { createAdminClient } from '@/lib/supabase/admin';
import { archiveAndDeleteTestMentee, previewTestMenteeDeletion, restoreDeletionArchive, type TestDeletionPreview } from '@/lib/archive/test-account';
import type { Json } from '@/types/database';

type Gate = { ok: true; ctx: ProgramContext; real: { id: string; email: string | null } } | { ok: false; error: string };

/** 운영사 실제 신원 + case.delete 권한(기본 PL) + 대행 중 차단 */
async function gate(): Promise<Gate> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  if (await getImpersonation()) return { ok: false, error: '대행(화면 보기) 중에는 실행할 수 없습니다. 대행을 종료하세요.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.delete');
  if (denied) return { ok: false, error: denied };
  const real = await getRealSessionProfile();
  if (!real) return { ok: false, error: '로그인이 필요합니다.' };
  return { ok: true, ctx, real: { id: real.id, email: real.email } };
}

async function audit(programId: string, actorId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  const { error } = await createAdminClient().from('audit_logs').insert({ actor_id: actorId, program_id: programId, action, entity_type: 'deletion_archives', entity_id: entityId, metadata: metadata as Json });
  if (error) console.error('[archive] audit insert failed:', action, error.message);
}

export async function previewTestAccountDeletionAction(userId: string): Promise<TestDeletionPreview | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  return previewTestMenteeDeletion(g.ctx.programId, userId);
}

/**
 * 테스트 멘티 계정 완전 삭제 (2026-11-03) — 확인 체크 2개 + 실행자 로그인 비밀번호 재인증.
 * 삭제 전에 연결 데이터 전부를 보관함(deletion_archives)에 남기고 파일은 보관 경로로 옮긴다 → 운영 설정 [삭제 보관함]에서 복원.
 */
export async function deleteTestAccountAction(input: { userId: string; confirmTest: boolean; confirmImpact: boolean; password: string; reason?: string }): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  if (!input.confirmTest || !input.confirmImpact) return { ok: false, error: '확인 항목 두 개를 모두 체크하세요.' };
  if (input.userId === g.real.id) return { ok: false, error: '본인 계정은 삭제할 수 없습니다.' };
  const re = await reauthenticate(g.real, input.password ?? '');
  if (!re.ok) return re;
  const r = await archiveAndDeleteTestMentee({ programId: g.ctx.programId, userId: input.userId, actorId: g.real.id, reason: (input.reason ?? '').trim() || null });
  if (!r.ok) return r;
  await audit(g.ctx.programId, g.real.id, 'account.test_delete', r.archiveId, { archive_id: r.archiveId, target_user_id: input.userId, label: r.label, ...r.summary });
  for (const p of ['/nextlab/roster', '/nextlab/dashboard', '/nextlab/reports', '/nextlab/settlements', '/nextlab/settings', '/institution/reports', '/institution/dashboard']) revalidatePath(p);
  return { ok: true, message: `${r.label} 테스트 계정과 연결 데이터를 삭제했습니다. 운영 설정 > [삭제 보관함]에서 복원할 수 있습니다.` };
}

/** 보관함에서 복원 — 실행자 비밀번호 재인증. 임시 비밀번호(휴대폰 숫자)는 화면에 한 번만 보여 준다 */
export async function restoreDeletionArchiveAction(input: { archiveId: string; password: string }): Promise<{ ok: true; message: string; tempPassword: string; email: string | null; warnings: string[] } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  const re = await reauthenticate(g.real, input.password ?? '');
  if (!re.ok) return re;
  const r = await restoreDeletionArchive({ programId: g.ctx.programId, archiveId: input.archiveId, actorId: g.real.id });
  if (!r.ok) return r;
  await audit(g.ctx.programId, g.real.id, 'account.test_restore', input.archiveId, { archive_id: input.archiveId, warnings: r.warnings.slice(0, 20) });
  for (const p of ['/nextlab/roster', '/nextlab/dashboard', '/nextlab/reports', '/nextlab/settlements', '/nextlab/settings']) revalidatePath(p);
  return { ok: true, message: r.warnings.length ? `복원했습니다. 확인할 항목 ${r.warnings.length}건이 있습니다.` : '복원했습니다.', tempPassword: r.tempPassword, email: r.email, warnings: r.warnings };
}
