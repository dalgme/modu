import { NextResponse } from 'next/server';
import JSZip from 'jszip';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim() || '파일';

/** doc_key → ZIP 폴더 (정산 증빙 제출 시 찾기 쉽게 종류별 정리) */
function folderOf(docKey: string): string {
  if (docKey.startsWith('mentoring_report:')) return '회차 보고서';
  if (docKey.startsWith('mentoring_photo:')) return '회차 사진';
  if (docKey === 'observation_report') return '관찰의견서';
  if (docKey.startsWith('settlement_statement')) return '정산서';
  if (docKey.startsWith('req')) return '필수서류';
  return '기타 서류';
}

/**
 * 케이스 서류 일괄 다운로드 (P22) — 발주처·운영사 공용. 정산 증빙 제출용.
 * 케이스의 모든 서류·사진·정산서를 종류별 폴더로 정리해 ZIP 으로 내려준다.
 */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });

  const caseId = new URL(request.url).searchParams.get('case') ?? '';
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, owner_name, business_name').eq('id', caseId).maybeSingle();
  if (!c || c.program_id !== ctx.programId) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: docs } = await admin
    .from('documents')
    .select('doc_key, doc_name, storage_path')
    .eq('case_id', caseId)
    .order('created_at');
  if (!docs || docs.length === 0) return NextResponse.json({ error: '이 케이스에 등록된 서류가 없습니다.' }, { status: 404 });
  // 취소된 정산의 정산서는 증빙 ZIP 에서 제외 (P30)
  const { data: canceled } = await admin.from('settlements').select('id').eq('case_id', caseId).eq('status', 'canceled');
  const canceledKeys = new Set((canceled ?? []).map((s) => `settlement_statement:${s.id}`));

  const zip = new JSZip();
  const used = new Set<string>();
  let added = 0;
  for (const d of docs.filter((d) => !canceledKeys.has(d.doc_key))) {
    const bucket = d.doc_key.startsWith('mentoring_photo:') ? 'photos' : 'documents';
    const { data: blob } = await admin.storage.from(bucket).download(d.storage_path);
    if (!blob) continue;
    let name = `${folderOf(d.doc_key)}/${safe(d.doc_name)}`;
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      name = dot > 0 ? `${name.slice(0, dot)}_${added}${name.slice(dot)}` : `${name}_${added}`;
    }
    used.add(name);
    zip.file(name, Buffer.from(await blob.arrayBuffer()));
    added += 1;
  }
  if (added === 0) return NextResponse.json({ error: '다운로드 가능한 파일이 없습니다.' }, { status: 404 });

  await admin.from('audit_logs').insert({
    actor_id: profile.id,
    program_id: ctx.programId,
    action: 'case.docs_zip_export',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { files: added },
  });

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filename = encodeURIComponent(`${safe(c.owner_name)}_${safe(c.business_name)}_서류일체_${new Date().toISOString().slice(0, 10)}.zip`);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
