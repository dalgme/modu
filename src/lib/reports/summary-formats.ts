/** 종합결과리포트 내보내기 형식 (클라이언트·서버 공용) */
export type SummaryFormat = 'html' | 'pdf' | 'xlsx' | 'docx' | 'pptx';
export const SUMMARY_FORMATS: { key: SummaryFormat; label: string; mime: string; ext: string }[] = [
  { key: 'html', label: 'HTML', mime: 'text/html; charset=utf-8', ext: 'html' },
  { key: 'pdf', label: 'PDF', mime: 'application/pdf', ext: 'pdf' },
  { key: 'docx', label: 'Word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  { key: 'xlsx', label: 'Excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  { key: 'pptx', label: 'PowerPoint', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
];
