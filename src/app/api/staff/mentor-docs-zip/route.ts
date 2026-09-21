import { NextResponse } from 'next/server';
import JSZip from 'jszip';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
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
 * 멘토별 폴더( 멘토명_뒷4자리/ )로 지급서류(이력서·통장사본·신분증사본)와
 * 위촉 서식 제출 파일을 정리해 ZIP 으로 내려준다. 파일이 없는 멘토는 폴더를 만들지 않는다.
 */
export async function GET(): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });

  const admin = createAdminClient();
  const { data: members } = await admin
    .from('program_members')
    .select('user_id')
    .eq('program_id', ctx.programId)
    .eq('role', 'mentor')
    .eq('is_active', true);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return NextResponse.json({ error: '멘토가 없습니다.' }, { status: 404 });

  const [{ data: users }, { data: payDocs }, { data: formSubs }] = await Promise.all([
    admin.from('users').select('id, name, phone').in('id', ids),
    admin.from('mentor_payment_docs').select('*').eq('program_id', ctx.programId).in('user_id', ids),
    admin.from('mentor_form_submissions').select('user_id, form_key, file_path, file_name').eq('program_id', ctx.programId).in('user_id', ids).not('file_path', 'is', null),
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
  const FORM_LABEL: Record<string, string> = { appointment: '위촉동의서', privacy: '개인정보동의서', pledge: '서약서', precheck: '사전확인서' };
  for (const s of formSubs ?? []) {
    await put(s.user_id, FORM_LABEL[s.form_key] ?? s.form_key, s.file_path, s.file_name);
  }

  if (added === 0) {
    return NextResponse.json({ error: '다운로드할 제출 파일이 없습니다. 멘토가 지급서류를 업로드하면 여기서 일괄 수령할 수 있습니다.' }, { status: 404 });
  }

  await admin.from('audit_logs').insert({
    actor_id: profile.id,
    program_id: ctx.programId,
    action: 'mentor.docs_zip_export',
    entity_type: 'programs',
    entity_id: ctx.programId,
    metadata: { files: added, mentors: ids.length },
  });

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filename = encodeURIComponent(`${ctx.program.name}_멘토서류_${new Date().toISOString().slice(0, 10)}.zip`);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
