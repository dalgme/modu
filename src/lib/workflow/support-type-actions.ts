'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireStaff } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/workflow/audit';

export type ActionResult = { ok: true } | { ok: false; error: string };

const limitSchema = z.object({
  id: z.string().uuid(),
  limit_amount: z.coerce.number().min(0),
  area_unit_price: z.coerce.number().min(0).optional(),
});

/** 지원유형 한도·평당단가 수정 */
export async function updateSupportTypeLimit(input: {
  id: string;
  limit_amount: number;
  area_unit_price?: number;
}): Promise<ActionResult> {
  const profile = await requireStaff();
  const parsed = limitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from('support_types')
    .update({
      limit_amount: parsed.data.limit_amount,
      area_unit_price: parsed.data.area_unit_price ?? null,
    })
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  await logAudit(supabase, {
    actorId: profile.id,
    action: 'support_type.update_limit',
    entityType: 'support_types',
    entityId: parsed.data.id,
    metadata: { limit_amount: parsed.data.limit_amount },
  });
  revalidatePath('/admin/settings/support-types');
  return { ok: true };
}

const docSchema = z.object({
  support_type_id: z.string().uuid(),
  doc_key: z.string().trim().min(1, 'doc_key를 입력하세요.'),
  doc_name: z.string().trim().min(1, '서류명을 입력하세요.'),
  is_required: z.boolean(),
  condition: z.string().trim().optional(),
});

/** 유형별 필수서류 추가 */
export async function addSupportTypeDocument(input: {
  support_type_id: string;
  doc_key: string;
  doc_name: string;
  is_required: boolean;
  condition?: string;
}): Promise<ActionResult> {
  const profile = await requireStaff();
  const parsed = docSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }
  const supabase = createClient();
  const { error } = await supabase.from('support_type_documents').insert({
    support_type_id: parsed.data.support_type_id,
    doc_key: parsed.data.doc_key,
    doc_name: parsed.data.doc_name,
    is_required: parsed.data.is_required,
    condition: parsed.data.condition || null,
    sort_order: 100,
  });
  if (error) return { ok: false, error: error.message };
  await logAudit(supabase, {
    actorId: profile.id,
    action: 'support_type.add_document',
    entityType: 'support_type_documents',
    metadata: { doc_key: parsed.data.doc_key },
  });
  revalidatePath('/admin/settings/support-types');
  return { ok: true };
}

/** 필수 여부 토글 */
export async function toggleDocumentRequired(
  id: string,
  isRequired: boolean,
): Promise<ActionResult> {
  await requireStaff();
  const supabase = createClient();
  const { error } = await supabase
    .from('support_type_documents')
    .update({ is_required: isRequired })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/settings/support-types');
  return { ok: true };
}

/** 필수서류 삭제 */
export async function deleteSupportTypeDocument(id: string): Promise<ActionResult> {
  await requireStaff();
  const supabase = createClient();
  const { error } = await supabase.from('support_type_documents').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/settings/support-types');
  return { ok: true };
}
