import { PDF_ONLY_DETAIL, PDF_ONLY_NOTICE } from '@/lib/files/pdf-only';

/** (2026-11-16) 멘토 보고서·관찰의견서 업로드 칸 안내 — 훅 없음(서버·클라이언트 공용) */
export function PdfOnlyNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
      <b className="text-[13px]">※ {PDF_ONLY_NOTICE}</b>
      {!compact && <span className="ml-1">— {PDF_ONLY_DETAIL}</span>}
    </p>
  );
}
