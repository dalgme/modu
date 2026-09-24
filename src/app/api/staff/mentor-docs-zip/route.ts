import { NextResponse } from 'next/server';
import JSZip from 'jszip';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim() || '이름없음';
const extOf = (name: string | null, path: string) => {
  const src = name && name.includes('.') ? name : path;
  const e = src.split('.').pop() ?? '';
  return e && e.length <= 8 ? `.${e}` : '';
};

/**
 * 멘토 서류 일괄 다운로드 (P22) — 발주처·운영사 공용.
 * 멘토별 폴더( 멘토명_뒷4자리/ )로 멘토가 올린 지급서류(이력서·통장사본·신분증사본)를 정리해 ZIP 으로 내려준다.
 * 파일이 없는 멘토는 폴더를 만들지 않는다. (P32) 위촉 서식 제출 파일은 폐지 — 오프라인 수령 체크로 대체.
 */
export async function GET(): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: '발주처·운영사 담당자만 내려받을 수 있습니다.' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: '행사를 먼저 선택하세요.' }, { status: 400 });
  // 운영사: 멘토 지급서류 권한(mentors.docs — 옵저버 차단). 발주처: 행사 설정 staff_permissions.institution_docs_zip=true 일 때만 (개인정보 서류 일괄 반출 통제)
  if (ctx.role === 'nextlab') {
    const denied = denyUnless(ctx, 'mentors.docs');
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });
  } else {
    const perms = ctx.program.staff_permissions;
    const allowed = !!perms && typeof perms === 'object' && !Array.isArray(perms) && (perms as Record<string, unknown>).institution_docs_zip === true;
    if (!allowed) return NextResponse.json({ error: '발주처 계정의 멘토 서류 일괄 다운로드는 이 행사에서 허용되지 않았습니다. 운영사(메인 담당자)에게 요청하세요.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: members } = await admin
    .from('program_members')
    .select('user_id')
    .eq('program_id', ctx.programId)
    .eq('role', 'mentor')
    .eq('is_active', true);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return NextResponse.json({ error: '멘토가 없습니다.' }, { status: 404 });

  const [{ data: users }, { data: payDocs }] = await Promise.all([
    admin.from('users').select('id, name, phone').in('id', ids),
    admin.from('mentor_payment_docs').select('*').eq('program_id', ctx.programId).in('user_id', ids),
  ]);
  const userById = new Map((users ?? []).map((u) => [u.id, u]));
  const folderOf = (userId: string) => {
    const u = userById.get(userId);
    const tail = (u?.phone ?? '').replace(/\D/g, '').slice(-4);
    return safe(`${u?.name ?? userId}${tail ? `_${tail}` : ''}`);
  };

  const zip = new JSZip();
  let added = 0;
  const put = async (userId: string, label: string, path: string | null, fileName: string | null) => {
    if (!path) return;
    const { data: blob } = await admin.storage.from('documents').download(path);
    if (!blob) return;
    const buf = Buffer.from(await blob.arrayBuffer());
    zip.file(`${folderOf(userId)}/${safe(label)}${extOf(fileName, path)}`, buf);
    added += 1;
  };

  for (const d of payDocs ?? []) {
    await put(d.user_id, '이력서', d.resume_path, d.resume_file_name);
    await put(d.user_id, '통장사본', d.bankbook_path, d.bankbook_file_name);
    await put(d.user_id, '신분증사본', d.id_card_path, d.id_card_file_name);
  }

  if (added === 0) {
    return NextResponse.json({ error: '다운로드할 제출 파일이 없습니다. 멘토가 지급서류를 업로드하면 여기서 일괄 수령할 수 있습니다.' }, { status: 404 });
  }

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: profile.id,
    program_id: ctx.programId,
    action: 'mentor.docs_zip_export',
    entity_type: 'programs',
    entity_id: ctx.programId,
    metadata: { files: added, mentors: ids.length, role: ctx.role },
  });
  if (auditError) console.error('docs zip audit failed:', auditError.message);

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filename = encodeURIComponent(`${ctx.program.name}_멘토서류_${new Date().toISOString().slice(0, 10)}.zip`);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
