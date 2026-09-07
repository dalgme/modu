import { PDFDocument } from 'pdf-lib';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadFile, downloadDataUrl } from '@/lib/storage/files';
import { htmlToPdf } from '@/lib/documents/render';
import { logAudit } from '@/lib/workflow/audit';
import { getMentorSignatureImage, getMenteeSignatureImage } from '@/lib/data/signatures';
import { getMentoringPhotoPathsByLog } from '@/lib/data/mentoring-logs';
import { formatVisitRange } from '@/lib/utils/format';
import type { WorkflowResult } from '@/lib/workflow/cases';

/** HTML 특수문자 이스케이프(줄바꿈 \n 은 그대로 두고 CSS white-space:pre-wrap 으로 렌더). */
function esc(value: string | null | undefined): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 공식 서식 제목 (화면 MentoringLogDocument 와 동일) */
const MERGE_REPORT_TITLE = '대전 소상공인·자영업자 재기지원사업 컨설팅 결과보고서';

/**
 * 병합 PDF 문서 스타일. 화면 문서 뷰(MentoringLogDocument)와 동일한 격자·구성으로 맞춘다.
 *  - 본문(애로사항/내용/결과)은 white-space:pre-wrap → 작성 시 넣은 줄바꿈·공백 줄 보존.
 *  - 1페이지: 상단 정보표 + '1. 컨설팅', 2페이지: '2. 현장사진'(상단 배치) — .sec2 page-break.
 *  - 회차가 여러 개면 각 회차가 새 페이지에서 시작(.round page-break).
 */
const MERGE_DOC_STYLE = `<style>
*{box-sizing:border-box}
body{margin:0;color:#111;font-family:'맑은 고딕','함초롬돋움',sans-serif;font-size:13px;line-height:1.55}
h1{text-align:center;font-size:18px;font-weight:700;margin:0 0 4px}
.sub{text-align:center;font-size:12px;color:#555;margin:0 0 12px;font-weight:600}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}
th,td{border:1px solid #333;padding:6px 8px;vertical-align:top;word-break:break-word}
th{background:#f1f1f1;text-align:center;font-weight:600}
td.l{text-align:left}
h2{font-size:15px;font-weight:700;margin:18px 0 6px;padding-left:8px;border-left:4px solid #444}
.pre{white-space:pre-wrap;min-height:56px}
.round{page-break-before:always}
.round:first-child{page-break-before:auto}
.sec2{page-break-before:always}
.photocell{height:150px;text-align:center;vertical-align:middle}
.photocell img{max-height:140px;max-width:100%;object-fit:contain}
.sign img{height:32px;vertical-align:middle;margin-left:4px}
</style>`;

interface MergeRoundInput {
  index: number;
  total: number;
  businessName: string;
  ownerName: string;
  mentorName: string;
  visited: string;
  place: string;
  topic: string;
  difficulties: string;
  content: string;
  result: string;
  mentorSignHtml: string;
  menteeSignHtml: string;
  photo1Html: string;
  photo2Html: string;
}

/** 한 회차(멘토링 일지) → 컨설팅 결과보고서 서식 HTML (1페이지 본문 + 2페이지 현장사진). */
function buildMergeRoundHtml(r: MergeRoundInput): string {
  const roundLabel =
    r.total > 1 ? `<p class="sub">${r.index + 1}회차 / 총 ${r.total}회차</p>` : '';
  return `<div class="round">
  <h1>${esc(MERGE_REPORT_TITLE)}</h1>
  ${roundLabel}
  <table>
    <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
    <tbody>
      <tr><th>업 체 명</th><td class="l">${esc(r.businessName) || '-'}</td><th>대 표 자</th><td class="l">${esc(r.ownerName) || '-'}</td></tr>
      <tr><th>일 시</th><td class="l">${esc(r.visited) || '-'}</td><th>장 소</th><td class="l">${esc(r.place) || '-'}</td></tr>
      <tr><th>컨설팅주제</th><td class="l" colspan="3">${esc(r.topic) || '-'}</td></tr>
      <tr><th>참석자</th><td class="l sign">${esc(r.ownerName) || '-'}${r.menteeSignHtml}</td><th>컨설턴트</th><td class="l sign">${esc(r.mentorName) || '-'}${r.mentorSignHtml}</td></tr>
    </tbody>
  </table>
  <h2>1. 컨설팅</h2>
  <table>
    <colgroup><col style="width:18%"><col style="width:82%"></colgroup>
    <tbody>
      <tr><th>기업 애로사항 등</th><td class="l"><div class="pre">${esc(r.difficulties)}</div></td></tr>
      <tr><th>컨설팅 내용</th><td class="l"><div class="pre">${esc(r.content)}</div></td></tr>
      <tr><th>컨설팅 결과</th><td class="l"><div class="pre">${esc(r.result)}</div></td></tr>
    </tbody>
  </table>
  <div class="sec2">
    <h2>2. 현장사진</h2>
    <table>
      <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
      <tbody>
        <tr><th>사진1</th><th>사진2</th></tr>
        <tr><td class="photocell">${r.photo1Html}</td><td class="photocell">${r.photo2Html}</td></tr>
      </tbody>
    </table>
  </div>
</div>`;
}

/**
 * 단일 멘토링 일지(회차)를 '출력 원본' 서식 PDF 로 렌더한다(다운로드용).
 * 컨설팅 결과보고서 병합과 동일한 서식(buildMergeRoundHtml)을 재사용한다.
 * 접근 권한은 호출부(라우트)에서 검증한다 — 여기서는 admin 으로 렌더만 수행.
 */
export async function renderMentoringLogPdf(
  caseId: string,
  logId: string,
): Promise<Buffer | null> {
  const admin = createAdminClient();
  const { data: caseRow } = await admin
    .from('cases')
    .select('business_name, owner_name')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow) return null;

  const { data: logs } = await admin
    .from('mentoring_logs')
    .select('id, visited_at, duration_minutes, content, place, topic, difficulties, result')
    .eq('case_id', caseId)
    .order('visited_at', { ascending: true })
    .order('created_at', { ascending: true });
  const all = logs ?? [];
  const idx = all.findIndex((l) => l.id === logId);
  if (idx < 0) return null;
  const log = all[idx]!;

  const { data: assign } = await admin
    .from('mentor_assignments')
    .select('mentor_id')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .maybeSingle();
  let mentorName = '';
  if (assign?.mentor_id) {
    const { data: m } = await admin.from('users').select('name').eq('id', assign.mentor_id).maybeSingle();
    mentorName = m?.name ?? '';
  }

  const [signUrl, menteeSignUrl] = await Promise.all([
    getMentorSignatureImage(caseId),
    getMenteeSignatureImage(caseId),
  ]);
  const paths = await getMentoringPhotoPathsByLog(caseId, log.id);
  const [photo1Url, photo2Url] = await Promise.all([
    paths[0] ? downloadDataUrl('photos', paths[0]) : Promise.resolve(null),
    paths[1] ? downloadDataUrl('photos', paths[1]) : Promise.resolve(null),
  ]);
  const photoImg = (url: string | null) =>
    url
      ? `<img src="${url}" alt="현장사진" />`
      : '<span style="color:#888;font-size:12px">(현장사진 첨부)</span>';
  const signImgFor = (url: string | null) =>
    url ? `<img src="${url}" alt="서명" />` : '<span style="color:#888">(인)</span>';

  const inner = buildMergeRoundHtml({
    index: idx,
    total: all.length,
    businessName: caseRow.business_name ?? '',
    ownerName: caseRow.owner_name ?? '',
    mentorName,
    visited: formatVisitRange(log.visited_at, log.duration_minutes),
    place: log.place ?? '',
    topic: log.topic ?? '',
    difficulties: log.difficulties ?? '',
    content: log.content ?? '',
    result: log.result ?? '',
    mentorSignHtml: signImgFor(signUrl),
    menteeSignHtml: signImgFor(menteeSignUrl),
    photo1Html: photoImg(photo1Url),
    photo2Html: photoImg(photo2Url),
  });
  const rendered = `<!doctype html><html lang="ko"><head><meta charset="utf-8">${MERGE_DOC_STYLE}</head><body>${inner}</body></html>`;
  try {
    return await htmlToPdf(rendered);
  } catch {
    return null;
  }
}

/**
 * 케이스의 기존 컨설팅 결과보고서(doc_key='consulting_report')를 스토리지·DB 에서 모두 삭제.
 * 생성/업로드 시 중복 없이 '교체'하기 위해 사용한다.
 */
export async function deleteExistingConsultingReports(caseId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('documents')
    .select('id, storage_path')
    .eq('case_id', caseId)
    .eq('doc_key', 'consulting_report');
  if (!rows || rows.length === 0) return;
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length) await admin.storage.from('documents').remove(paths);
  await admin.from('documents').delete().eq('case_id', caseId).eq('doc_key', 'consulting_report');
}

/**
 * 컨설팅 결과보고서 PDF 생성 = '멘토링 일지 병합'.
 * 새 서식을 다시 만들지 않고, 이미 있는 멘토링 일지를 하나의 PDF 로 단순 병합한다:
 *  (1) 웹으로 작성한 회차별 일지 → 일지 서식 그대로 회차당 1페이지로 렌더
 *  (2) 멘토가 업로드한 완성본 'PDF' 일지(doc_key=mentoring_report)
 * 비-PDF 업로드(이미지/HWP 등)는 병합하지 않고 화면의 회차별 보기/다운로드 버튼으로 제공한다.
 * 결과는 documents(doc_key='consulting_report') 로 저장.
 */
export async function generateConsultingReport(
  caseId: string,
  mentorId: string,
  opts?: {
    /**
     * 실제 실행자. 넥스트랩이 검수 화면에서 대신 재생성할 때 지정한다.
     * 보고서 '명의'(documents.uploaded_by)는 담당 멘토(mentorId)로 두고 감사기록의 실행자만 분리한다.
     * (audit_logs RLS 가 actor_id = auth.uid() 를 요구하므로, 실행자를 넣어야 기록이 남는다)
     */
    performedBy?: string;
  },
): Promise<WorkflowResult> {
  const supabase = createClient();

  const { data: assign } = await supabase
    .from('mentor_assignments')
    .select('id')
    .eq('case_id', caseId)
    .eq('mentor_id', mentorId)
    .eq('is_active', true)
    .maybeSingle();
  if (!assign) return { ok: false, error: '담당 멘토가 아닙니다.' };

  const { data: caseRow } = await supabase.from('cases').select('*').eq('id', caseId).maybeSingle();
  if (!caseRow) return { ok: false, error: '케이스를 찾을 수 없습니다.' };

  // (병합 대상 1) 웹으로 작성한 회차별 일지 — 방문일 오름차순
  const { data: logsData } = await supabase
    .from('mentoring_logs')
    .select('id, visited_at, duration_minutes, content, place, topic, difficulties, result')
    .eq('case_id', caseId)
    .order('visited_at', { ascending: true })
    .order('created_at', { ascending: true });
  const webLogs = logsData ?? [];
  const webCount = webLogs.length;

  // (병합 대상 2) 멘토가 업로드한 완성본 'PDF' 일지 — 등록순. 비-PDF 는 병합 제외.
  const { data: uploadedRows } = await supabase
    .from('documents')
    .select('storage_path, mime_type')
    .eq('case_id', caseId)
    .eq('doc_key', 'mentoring_report')
    .order('created_at', { ascending: true });
  const uploadedPdfs = (uploadedRows ?? []).filter((d) =>
    (d.mime_type ?? '').toLowerCase().includes('pdf'),
  );

  if (webCount === 0 && uploadedPdfs.length === 0) {
    return {
      ok: false,
      error: '병합할 멘토링 일지가 없습니다. 일지를 작성하거나 완성본 PDF 를 첨부하세요.',
    };
  }

  // (1) 웹 회차 일지 → 화면 문서 뷰와 동일한 서식으로 회차별 렌더 → 단일 PDF
  //     (DB 서식 템플릿에 의존하지 않고 코드에서 직접 생성 → 화면/미리보기와 100% 일치)
  let webPdf: Buffer | null = null;
  if (webCount > 0) {
    const { data: mentor } = await supabase
      .from('users')
      .select('name')
      .eq('id', mentorId)
      .maybeSingle();

    // 서명은 케이스 단위(모든 회차 공통). 현장사진은 회차(log)별 태깅을 사용해 각 회차의 사진만 삽입.
    const [signUrl, menteeSignUrl] = await Promise.all([
      getMentorSignatureImage(caseId),
      getMenteeSignatureImage(caseId),
    ]);
    const photoImg = (url: string | null) =>
      url
        ? `<img src="${url}" alt="현장사진" />`
        : '<span style="color:#888;font-size:12px">(현장사진 첨부)</span>';
    const signImgFor = (url: string | null) =>
      url ? `<img src="${url}" alt="서명" />` : '<span style="color:#888">(인)</span>';
    const signImg = signImgFor(signUrl);
    const menteeSignImg = signImgFor(menteeSignUrl);

    const pages: string[] = [];
    for (let i = 0; i < webCount; i++) {
      const log = webLogs[i];
      if (!log) continue;
      const paths = await getMentoringPhotoPathsByLog(caseId, log.id);
      const p1 = paths[0];
      const p2 = paths[1];
      const [photo1Url, photo2Url] = await Promise.all([
        p1 ? downloadDataUrl('photos', p1) : Promise.resolve(null),
        p2 ? downloadDataUrl('photos', p2) : Promise.resolve(null),
      ]);
      pages.push(
        buildMergeRoundHtml({
          index: i,
          total: webCount,
          businessName: caseRow.business_name ?? '',
          ownerName: caseRow.owner_name ?? '',
          mentorName: mentor?.name ?? '',
          visited: formatVisitRange(log.visited_at, log.duration_minutes),
          place: log.place ?? '',
          topic: log.topic ?? '',
          difficulties: log.difficulties ?? '',
          content: log.content ?? '',
          result: log.result ?? '',
          mentorSignHtml: signImg,
          menteeSignHtml: menteeSignImg,
          photo1Html: photoImg(photo1Url),
          photo2Html: photoImg(photo2Url),
        }),
      );
    }
    const rendered = `<!doctype html><html lang="ko"><head><meta charset="utf-8">${MERGE_DOC_STYLE}</head><body>${pages.join('')}</body></html>`;
    try {
      webPdf = await htmlToPdf(rendered);
    } catch {
      return { ok: false, error: '일지 PDF 렌더에 실패했습니다. 잠시 후 다시 시도하세요.' };
    }
  }

  // (2) 업로드된 PDF 일지 다운로드
  const admin = createAdminClient();
  const uploadedBuffers: Buffer[] = [];
  for (const d of uploadedPdfs) {
    const { data: blob } = await admin.storage.from('documents').download(d.storage_path);
    if (blob) uploadedBuffers.push(Buffer.from(await blob.arrayBuffer()));
  }

  // (3) 단순 병합: 웹 회차 PDF → 업로드 PDF 순으로 페이지를 이어붙인다.
  let mergedPdf: Buffer;
  try {
    const out = await PDFDocument.create();
    const append = async (bytes: Buffer) => {
      const src = await PDFDocument.load(bytes);
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach((pg) => out.addPage(pg));
    };
    if (webPdf) await append(webPdf);
    for (const buf of uploadedBuffers) await append(buf);
    if (out.getPageCount() === 0) {
      return { ok: false, error: '병합할 페이지가 없습니다.' };
    }
    mergedPdf = Buffer.from(await out.save());
  } catch {
    return { ok: false, error: '일지 병합(PDF)에 실패했습니다. 잠시 후 다시 시도하세요.' };
  }

  const labelParts: string[] = [];
  if (webCount > 0) labelParts.push(`${webCount}회차`);
  if (uploadedPdfs.length > 0) labelParts.push(`첨부 ${uploadedPdfs.length}`);

  try {
    // 중복 방지: 기존 컨설팅 결과보고서(생성·업로드본)를 삭제하고 새 파일로 교체한다.
    // (DB 의 부분 유니크 인덱스 documents_singleton_doc_key_idx 가 최종 방어선이다)
    await deleteExistingConsultingReports(caseId);
    const meta = await uploadFile('documents', caseId, mergedPdf, 'application/pdf', 'pdf');
    const { error: insErr } = await supabase.from('documents').insert({
      case_id: caseId,
      doc_key: 'consulting_report',
      doc_name: `컨설팅 결과보고서(병합·${labelParts.join(' + ')})`,
      storage_path: meta.storagePath,
      sha256: meta.sha256,
      uploaded_by: mentorId,
      file_size: meta.size,
      mime_type: 'application/pdf',
    });
    // insert 실패를 삼키면 '성공했는데 보고서가 없는' 상태가 된다 → 반드시 표면화
    if (insErr) {
      return { ok: false, error: `병합 파일 등록에 실패했습니다: ${insErr.message}` };
    }
  } catch {
    return { ok: false, error: '병합 파일 저장에 실패했습니다. 잠시 후 다시 시도하세요.' };
  }

  const performedBy = opts?.performedBy;
  await logAudit(supabase, {
    actorId: performedBy ?? mentorId,
    action: 'case.consulting_report',
    entityType: 'cases',
    entityId: caseId,
    metadata:
      performedBy && performedBy !== mentorId
        ? { on_behalf_of: mentorId, via: 'nextlab_review' }
        : null,
  });

  return { ok: true, caseId };
}
