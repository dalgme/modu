import { notFound, redirect } from 'next/navigation';

import { getSessionProfile } from '@/lib/auth/guards';
import { docFileHref, safeViewerMetaUrl } from '@/lib/files/preview-kind';
import { FileViewerPage } from '@/components/files/file-preview';

export const dynamic = 'force-dynamic';

/**
 * 파일 새 창 뷰어 (2026-09-30) — 미리보기 팝업의 [새 창]이 여는 플랫폼 자체 뷰어.
 * 원본 파일 주소를 새 탭에 열면 브라우저 PDF 뷰어의 저장·인쇄 버튼이 생겨 사실상 다운로드가 되므로,
 * 같은 미리보기 엔진을 화면 전체로 띄운다. 권한·다운로드 허용 여부는 팝업과 똑같이 meta 라우트(서버)가 판정한다.
 *  - ?doc={documents.id}  → /api/files/doc/{id}?meta=1
 *  - ?meta=/api/files/…   → 같은 계약의 다른 라우트(멘토 지급서류 합본 등) — 같은 출처 /api/files/ 경로만 허용
 *  - &nodl=1              → 서버가 허용해도 다운로드 버튼 숨김(팝업에서 미리보기 전용으로 연 파일)
 */
export default async function Page({ searchParams }: { searchParams: { doc?: string; meta?: string; nodl?: string } }) {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  const doc = searchParams.doc && /^[0-9a-f-]{36}$/i.test(searchParams.doc) ? searchParams.doc : null;
  const href = doc ? docFileHref(doc, 'meta') : safeViewerMetaUrl(searchParams.meta);
  if (!href) notFound();
  return <FileViewerPage metaHrefValue={href} allowDownload={searchParams.nodl !== '1'} />;
}
