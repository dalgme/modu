import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Lock, Check } from 'lucide-react';

import { requireMentor } from '@/lib/auth/guards';
import { getCaseById } from '@/lib/data/cases';
import { listCaseDocsByKeys } from '@/lib/data/case-docs';
import { getMentorWorkflowState } from '@/lib/data/mentor-workflow';
import {
  getContractorConfig,
  contractorDocSpecsForCompany,
  contractorCompanyStatuses,
} from '@/lib/data/contractor-config';
import { CaseDocUpload } from '@/components/cases/case-doc-upload';
import { ContractorSetup } from '@/components/cases/contractor-setup';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { company?: string };
}) {
  await requireMentor();
  const item = await getCaseById(params.id);
  if (!item) notFound();

  const state = await getMentorWorkflowState(item.id, item.supportTypeCode, item.status);
  const config = state.contractorEnabled ? await getContractorConfig(item.id) : null;

  const statuses = config ? await contractorCompanyStatuses(item.id, config) : [];
  const selected = config
    ? Math.min(Math.max(parseInt(searchParams?.company ?? '1', 10) || 1, 1), config.companyCount)
    : 1;
  const isSignage = !!config && config.signageIncluded && config.signageCompanyIndex === selected;

  const keys: string[] = [];
  if (config) {
    for (const s of contractorDocSpecsForCompany(config, selected)) keys.push(s.key);
    keys.push(`contractor_extra_${selected}`);
  }
  const docsByKey = await listCaseDocsByKeys(item.id, keys);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={`/mentor/cases/${item.id}`}>
            <ArrowLeft className="h-3.5 w-3.5" />
            케이스로 이동
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">공사업체 서류 업로드</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.business_name} · 업체별 견적서 · 비교견적서 · 공급업체 사업자등록증(필수)을
              업로드하세요.
            </p>
          </div>
          {/* 상단 오른쪽: 공사업체 구성 변경 */}
          {config && (
            <div className="w-full sm:w-[340px]">
              <ContractorSetup caseId={item.id} initial={config} />
            </div>
          )}
        </div>
      </div>

      {!state.contractorEnabled ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            지원신청서를 최종 저장한 후 공사업체 서류를 업로드할 수 있습니다.
          </CardContent>
        </Card>
      ) : !config ? (
        <ContractorSetup caseId={item.id} initial={null} />
      ) : (
        <>
          {/* 업체 전환 버튼 */}
          <div className="flex flex-wrap gap-2">
            {statuses.map((c) => {
              const active = c.index === selected;
              return (
                <Link
                  key={c.index}
                  href={`/mentor/cases/${item.id}/contractor-docs?company=${c.index}`}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : c.done
                        ? 'border border-status-approved/40 bg-status-approved/10 text-status-approved hover:bg-status-approved/15'
                        : 'border border-input bg-card text-foreground hover:bg-accent',
                  )}
                >
                  {c.done && <Check className="h-4 w-4" />}
                  업체 {c.index}
                  {c.isSignage ? '(간판)' : ''}
                </Link>
              );
            })}
          </div>

          {/* 선택된 업체 서류 */}
          <Card className={isSignage ? 'border-primary/40' : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                업체 {selected}
                {isSignage && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    간판(옥외광고) 업체
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {contractorDocSpecsForCompany(config, selected).map((s) => (
                <CaseDocUpload
                  key={s.key}
                  caseId={item.id}
                  docKey={s.key}
                  label={s.label}
                  files={docsByKey.get(s.key) ?? []}
                  required={s.required}
                  multiple={false}
                />
              ))}
              <CaseDocUpload
                caseId={item.id}
                docKey={`contractor_extra_${selected}`}
                label="추가 첨부서류"
                files={docsByKey.get(`contractor_extra_${selected}`) ?? []}
                hint="필요 시 여러 개를 추가로 첨부할 수 있습니다."
              />
            </CardContent>
          </Card>

          {state.contractorDocsDone ? (
            <Card className="border-status-approved/30 bg-status-approved/5">
              <CardContent className="flex items-center gap-2 py-4 text-sm font-medium text-status-approved">
                <Check className="h-4 w-4 shrink-0" />
                모든 업체의 필수 서류가 준비되었습니다. 케이스 화면에서 &lsquo;신청서 송신하기&rsquo;를
                진행하세요.
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">
              각 업체의 필수 서류(견적서 · 비교견적서 · 공급업체 사업자등록증
              {config.signageIncluded ? ' · 간판업체 옥외광고업등록증' : ''})를 모두 올리면 송신
              단계가 활성화됩니다.
            </p>
          )}

          {/* 하단: 저장하기 → 상위 단계(케이스)로 이동 (파일은 업로드 즉시 저장됨) */}
          <div className="flex justify-end">
            <Button
              asChild
              className="gap-2 bg-status-approved text-white hover:bg-status-approved/90"
            >
              <Link href={`/mentor/cases/${item.id}`}>저장하기</Link>
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
