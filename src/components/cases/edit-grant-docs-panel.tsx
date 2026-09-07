import { PencilRuler } from 'lucide-react';

import { listCaseDocsByKey } from '@/lib/data/case-docs';
import { getContractorConfig, contractorDocSpecsForCompany } from '@/lib/data/contractor-config';
import { CaseDocUpload } from '@/components/cases/case-doc-upload';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * 임시 수정권한이 열려 있는 동안 노출되는 '서류 재업로드' 패널 (넥스트랩·담당 멘토 공용).
 * 검수 완료 단계에서도 지원신청서·멘티 사업자등록증·확약서·공사업체 서류를 인라인으로 재업로드/교체한다.
 * 업로드/삭제 액션은 resolveCaseDocEditor 로 권한을 판정한다(담당 멘토 또는 임시권한 보유 넥스트랩).
 */
export async function EditGrantDocsPanel({ caseId }: { caseId: string }) {
  const [appFiles, bizReg, pledge, config] = await Promise.all([
    listCaseDocsByKey(caseId, 'support_application_file'),
    listCaseDocsByKey(caseId, 'applicant_biz_reg'),
    listCaseDocsByKey(caseId, 'pledge_no_overlap_file'),
    getContractorConfig(caseId),
  ]);

  const companies = config
    ? Array.from({ length: config.companyCount }, (_, i) => i + 1)
    : [];
  const contractorByKey = new Map<string, Awaited<ReturnType<typeof listCaseDocsByKey>>>();
  for (const i of companies) {
    for (const spec of contractorDocSpecsForCompany(config!, i)) {
      contractorByKey.set(spec.key, await listCaseDocsByKey(caseId, spec.key));
    }
    contractorByKey.set(`contractor_extra_${i}`, await listCaseDocsByKey(caseId, `contractor_extra_${i}`));
  }

  return (
    <Card className="border-amber-300/60 dark:border-amber-800/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PencilRuler className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          임시 수정 · 서류 재업로드
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          임시 수정권한이 열려 있는 동안 아래 서류를 재업로드·추가·교체할 수 있습니다. 기존 파일을
          삭제한 뒤 다시 올리면 교체됩니다.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CaseDocUpload
          caseId={caseId}
          docKey="support_application_file"
          label="지원신청서 (파일)"
          files={appFiles}
          uploadLabel="지원신청서 파일 업로드"
          hint="완성한 지원신청서 파일을 올립니다(여러 개 첨부 가능)."
        />
        <CaseDocUpload
          caseId={caseId}
          docKey="applicant_biz_reg"
          label="멘티기업 사업자등록증"
          files={bizReg}
          multiple={false}
          uploadLabel="멘티기업 사업자등록증 업로드"
        />
        <CaseDocUpload
          caseId={caseId}
          docKey="pledge_no_overlap_file"
          label="사업참여 및 중복지원 금지 확약서"
          files={pledge}
          multiple={false}
          uploadLabel="확약서 파일 업로드"
        />

        {config && companies.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">공사업체 서류</p>
            {companies.map((i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  업체 {i}
                  {config.signageIncluded && config.signageCompanyIndex === i ? '(간판)' : ''}
                </p>
                {contractorDocSpecsForCompany(config, i).map((spec) => (
                  <CaseDocUpload
                    key={spec.key}
                    caseId={caseId}
                    docKey={spec.key}
                    label={spec.label}
                    files={contractorByKey.get(spec.key) ?? []}
                    multiple={false}
                    required={spec.required}
                    uploadLabel={`${spec.label} 업로드`}
                  />
                ))}
                <CaseDocUpload
                  caseId={caseId}
                  docKey={`contractor_extra_${i}`}
                  label="추가 첨부서류"
                  files={contractorByKey.get(`contractor_extra_${i}`) ?? []}
                  uploadLabel="추가 첨부서류 업로드"
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
