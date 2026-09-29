/**
 * 멘토 지급증빙 서류 공용 상수·판정 (2026-09-30) — 서버·클라이언트 중립 파일.
 * 운영사가 [파일 관리 > 멘토 지급서류]에서 멘토별로 2~4종(이력서·통장사본·신분증사본 등)을 일괄 등록한다.
 * 파일은 **행사 단위**(mentor_payment_files.program_id) — 한 번 등록하면 모든 라운드(그룹)에서 공통으로 보인다.
 * 팝업에서는 PDF·이미지를 하나의 PDF 로 합쳐 미리 보고, 한글·워드 파일은 개별 미리보기로 본다.
 */
import { fileExt } from '@/lib/files/business-plan-match';

export const MENTOR_PAYMENT_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'hwp', 'hwpx', 'doc', 'docx'] as const;
/** 파일 1개 최대 크기 */
export const MENTOR_PAYMENT_MAX_BYTES = 20 * 1024 * 1024;
/** 멘토 1명당 최대 파일 수 */
export const MENTOR_PAYMENT_MAX_FILES = 10;

export function mentorPaymentExtAllowed(fileName: string): boolean {
  return (MENTOR_PAYMENT_EXTS as readonly string[]).includes(fileExt(fileName));
}

export type MergeKind = 'pdf' | 'jpg' | 'png' | null;

/** 하나의 PDF 로 합칠 수 있는 형식 — PDF 는 쪽 단위, JPG/PNG 는 한 쪽에 한 장. 한글·워드는 변환 불가(null) */
export function mergeKindOf(fileName: string, mime?: string | null): MergeKind {
  const ext = fileExt(fileName);
  const m = (mime ?? '').toLowerCase();
  if (ext === 'pdf' || m === 'application/pdf') return 'pdf';
  if (ext === 'jpg' || ext === 'jpeg' || m === 'image/jpeg') return 'jpg';
  if (ext === 'png' || m === 'image/png') return 'png';
  return null;
}

/** 팝업·표에 쓰는 파일 한 건 (서버 → 클라이언트 직렬화 가능한 값만) */
export interface MentorPaymentFileItem {
  id: string;
  name: string;
  mime: string | null;
  size: number | null;
  /** 하나의 PDF 로 합칠 수 있는지 */
  mergeable: boolean;
  createdAt: string;
}

/** 라우트 경로 — 미리보기 메타(JSON) · 새 창(인라인) · 다운로드 */
export const mentorPaymentMergedHref = (mentorId: string, mode: 'meta' | 'inline' | 'download' = 'inline') =>
  `/api/files/mentor-payment/merged/${mentorId}${mode === 'meta' ? '?meta=1' : mode === 'download' ? '?download=1' : ''}`;
export const mentorPaymentFileHref = (fileId: string, mode: 'meta' | 'inline' | 'download' = 'inline') =>
  `/api/files/mentor-payment/file/${fileId}${mode === 'meta' ? '?meta=1' : mode === 'download' ? '?download=1' : ''}`;

export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
