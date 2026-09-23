import { requireRole } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { ConsentForm } from '@/components/mentee/consent-form';

export const dynamic = 'force-dynamic';

/** 멘티 개인정보 동의 — 행사 설정의 발주처·용역사명으로 문안을 채운다 (기관명 리터럴 금지). 상단 메뉴·하단 탭은 레이아웃에서 이 경로일 때 숨긴다. */
export default async function ConsentPage() {
  const profile = await requireRole(['mentee']);
  const ctx = await requireContext(profile);
  const b = ctx.branding;
  return (
    <main className="flex min-h-[70vh] items-center justify-center">
      <ConsentForm programName={b.programName} clientName={b.clientName} operatorName={b.operatorName} />
    </main>
  );
}
