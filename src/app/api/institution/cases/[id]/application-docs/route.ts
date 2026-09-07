import JSZip from 'jszip';

import { requireInstitution } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { listApplicationBundleDocs } from '@/lib/data/application-bundle';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** storage_path 의 확장자를 이름에 보장 (zip 내 파일이 바로 열리도록) */
function withExt(name: string, storagePath: string): string {
  const ext = storagePath.includes('.') ? storagePath.split('.').pop() : '';
  if (!ext) return name;
  return name.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? name : `${name}.${ext}`;
}

/**
 * 진흥원: 지원신청 서류(컨설팅 결과보고서·지원신청서·멘티 사업자등록증·공사업체 서류) 일괄 ZIP 다운로드.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireInstitution();
  const caseId = params.id;
  const admin = createAdminClient();

  const { data: caseRow } = await admin
    .from('cases')
    .select('business_name')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow) return new Response('not found', { status: 404 });

  const docs = await listApplicationBundleDocs(caseId);
  if (docs.length === 0) {
    return new Response('첨부된 지원신청 서류가 없습니다.', { status: 404 });
  }

  const zip = new JSZip();
  const used = new Set<string>();
  for (const doc of docs) {
    const { data: blob } = await admin.storage.from('documents').download(doc.storagePath);
    if (!blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    let entry = `${doc.category}/${withExt(doc.name, doc.storagePath)}`;
    // 동일 이름 충돌 방지 (같은 카테고리 내 같은 파일명)
    for (let i = 2; used.has(entry) && i < 100; i += 1) {
      entry = `${doc.category}/${withExt(`${doc.name}_${i}`, doc.storagePath)}`;
    }
    used.add(entry);
    zip.file(entry, buf);
  }

  const content = await zip.generateAsync({ type: 'nodebuffer' });
  const base = (caseRow.business_name || 'case').replace(/[\\/:*?"<>|]+/g, '_');
  const filename = encodeURIComponent(`${base}_지원신청서류.zip`);

  return new Response(new Uint8Array(content), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'Cache-Control': 'no-store',
    },
  });
}
