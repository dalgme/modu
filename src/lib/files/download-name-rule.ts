/**
 * 다운로드 파일명 규칙 (2026-09-30 사용자 결정) — 서버·클라이언트 중립.
 * 플랫폼에서 받는 파일 이름은 한글로, 다음 세 모양 중 하나다(확장자만 원래 파일 것).
 *   ① 멘토명-파일구분명                (멘토 본인 서류: 지급서류 등)
 *   ② 멘티명-파일구분명                (멘티 서류: 사업계획서·참고자료·필수서류·멘티 서류)
 *   ③ 멘토명-멘티명-파일구분명         (멘토링 산출물: 회차 보고서·사진·관찰의견서·정산서)
 * 같은 구분의 파일이 여러 개면 구분명 뒤에 번호를 붙인다(예: "홍길동-참고자료 2.pdf").
 * 저장된 원본 파일명(doc_name)은 바꾸지 않는다 — 내려받을 때의 이름만 이 규칙을 따른다.
 */

export interface DownloadNameInput {
  docKey: string;
  /** 원래 파일명 또는 저장 경로 — 확장자만 쓴다 */
  sourceName: string;
  menteeName: string | null;
  mentorName: string | null;
  roundNo?: number | null;
  /** 필수서류 이름 등 구분명 보조 */
  label?: string | null;
  /** 같은 구분의 n번째(1부터). 같은 구분이 하나뿐이면 null */
  seq?: number | null;
}

/** 파일 이름에 쓸 수 없는 문자 정리 */
export function cleanNamePart(s: string | null | undefined): string {
  return (s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 확장자 — 영문·숫자 1~5자만 인정(없으면 빈 문자열) */
export function fileExt(name: string | null | undefined): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec((name ?? '').trim());
  return m ? `.${m[1]!.toLowerCase()}` : '';
}

/**
 * 회차 보고서 이름 (2026-10-06 사용자 결정) — '책임멘토 멘토링 보고서 및 결과보고서(김진태 멘토-전시우 멘티)_1회차'.
 * 회차마다 파일이 하나씩이라 같은 케이스 안에서 구분되도록 끝에 회차를 붙인다. 저장 파일명·다운로드 파일명이 같은 함수를 쓴다.
 */
export function roundReportTitle(mentorName: string | null | undefined, menteeName: string | null | undefined, roundNo?: number | null): string {
  const mentor = cleanNamePart(mentorName) || '멘토';
  const mentee = cleanNamePart(menteeName) || '멘티';
  return `책임멘토 멘토링 보고서 및 결과보고서(${mentor} 멘토-${mentee} 멘티)${roundNo ? `_${roundNo}회차` : ''}`;
}

/** doc_key → 파일 구분명과 이름 모양 */
export function docKind(docKey: string, roundNo?: number | null, label?: string | null): { kind: string; shape: 'mentor' | 'mentee' | 'pair' } {
  const n = roundNo ? `${roundNo}회차 ` : '';
  if (docKey.startsWith('mentoring_report:')) return { kind: `${n}보고서`, shape: 'pair' };
  if (docKey.startsWith('mentoring_photo:')) return { kind: `${n}사진`, shape: 'pair' };
  if (docKey === 'observation_report') return { kind: '관찰의견서', shape: 'pair' };
  if (docKey.startsWith('settlement_statement')) return { kind: '정산서', shape: 'pair' };
  if (docKey === 'business_plan') return { kind: '사업계획서', shape: 'mentee' };
  if (docKey === 'business_ref') return { kind: '참고자료', shape: 'mentee' };
  if (docKey.startsWith('req')) return { kind: cleanNamePart(label) || '필수서류', shape: 'mentee' };
  if (docKey === 'application_pdf') return { kind: '등록 원본', shape: 'mentee' };
  if (docKey === 'case_doc') return { kind: '멘티 서류', shape: 'mentee' };
  return { kind: '첨부파일', shape: 'mentee' };
}

export function buildDownloadName(input: DownloadNameInput): string {
  if (input.docKey.startsWith('mentoring_report:')) return `${roundReportTitle(input.mentorName, input.menteeName, input.roundNo).slice(0, 150)}${input.seq ? ` ${input.seq}` : ''}${fileExt(input.sourceName)}`;
  const { kind, shape } = docKind(input.docKey, input.roundNo, input.label);
  const mentor = cleanNamePart(input.mentorName);
  const mentee = cleanNamePart(input.menteeName);
  const who = shape === 'pair' ? [mentor, mentee] : shape === 'mentor' ? [mentor] : [mentee];
  const parts = who.filter(Boolean);
  const kindWithSeq = input.seq ? `${kind} ${input.seq}` : kind;
  const base = [...parts, kindWithSeq].join('-');
  return `${base.slice(0, 120)}${fileExt(input.sourceName)}`;
}

/** 멘토 본인 서류(지급서류 등) — "멘토명-구분명" */
export function buildMentorFileName(mentorName: string | null, kind: string, sourceName: string, seq?: number | null): string {
  const base = [cleanNamePart(mentorName), seq ? `${kind} ${seq}` : kind].filter(Boolean).join('-');
  return `${base.slice(0, 120)}${fileExt(sourceName)}`;
}
