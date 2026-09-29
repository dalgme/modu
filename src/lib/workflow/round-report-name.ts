/**
 * 회차 보고서 저장 파일명 규칙 (2026-09-29 사용자 결정) — 서버(저장)·클라이언트(안내) 공용 순수 모듈.
 * "멘토명-멘티명-회차-온/오프라인" + 원래 확장자. 예) 홍길동-김철수-1회차-오프라인.pdf
 * documents.doc_name 이 서명 URL 다운로드 파일명으로 쓰이므로(P33) 내려받는 파일명도 이 규칙을 따른다.
 */
import { safeFileName } from '@/lib/http/download';

export function roundModeLabel(mode: string | null | undefined): string {
  return mode === 'online' ? '온라인' : '오프라인';
}

/** 원래 파일명의 확장자 (소문자, 점 포함) — 없거나 이상하면 '' */
export function fileExtension(originalName: string | null | undefined): string {
  const name = (originalName ?? '').trim();
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  const ext = name.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,6}$/.test(ext) ? ext : '';
}

export function roundReportFileName(input: { mentorName: string | null | undefined; menteeName: string | null | undefined; roundNo: number; mode: string | null | undefined; originalName?: string | null }): string {
  const part = (s: string | null | undefined, fallback: string) => (s ?? '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
  const base = [part(input.mentorName, '멘토'), part(input.menteeName, '멘티'), `${input.roundNo}회차`, roundModeLabel(input.mode)].join('-');
  return safeFileName(`${base}${fileExtension(input.originalName)}`);
}
