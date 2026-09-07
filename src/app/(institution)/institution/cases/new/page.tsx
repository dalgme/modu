import { requireInstitution } from '@/lib/auth/guards';
import { listSupportTypes } from '@/lib/data/cases';
import { CaseForm } from '@/components/cases/case-form';

// 신청서 PDF 분석(unpdf) 콜드스타트 여유
export const maxDuration = 30;

export default async function Page() {
  await requireInstitution();
  const supportTypes = await listSupportTypes();

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">멘티기업 등록 (플랫폼 등록·회원가입)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          사업신청서(붙임1·2) PDF를 업로드하면 멘티기업 정보가 자동으로 채워집니다. 등록하면 해당
          멘티기업의 <b>로그인 계정이 자동 발급</b>되고(임시비번=휴대폰) 넥스트랩으로 이관됩니다.
          (자격심사·선정은 진흥원 별도 절차)
        </p>
      </div>
      <CaseForm supportTypes={supportTypes} />
    </main>
  );
}
