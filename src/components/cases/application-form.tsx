'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Wrench, Camera, PenLine, Info } from 'lucide-react';

import { draftApplicationAction } from '@/lib/workflow/application-actions';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/ui/amount-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatKRW } from '@/lib/utils/format';

// 붙임5(경영개선) 신청항목 — server-only 모듈과 값 동기화
const CATEGORY_OPTIONS = [
  { key: 'hygiene', label: '위생관리' },
  { key: 'safety', label: '안전관리' },
  { key: 'promo', label: '홍보(광고)' },
  { key: 'env', label: '환경개선' },
  { key: 'pos', label: 'POS경비' },
] as const;

interface ContractorSummary {
  company_name: string;
  business_reg_no: string | null;
  representative: string | null;
  phone: string | null;
  address: string | null;
  work_type: string | null;
  estimate_amount: number | null;
}

interface AttachmentGuide {
  doc_name: string;
  is_required: boolean;
  condition: string | null;
  attachment_no: string | null;
  uploaded: boolean;
}


interface ConstructionValues {
  construction_company: string;
  construction_region: string;
  construction_reg_no: string;
  construction_rep: string;
  construction_biztype: string;
  construction_phone: string;
  construction_mobile: string;
  construction_period: string;
  construction_content: string;
}

const CONSTRUCTION_FIELDS: { key: keyof ConstructionValues; label: string; full?: boolean }[] = [
  { key: 'construction_company', label: '외주 업체명' },
  { key: 'construction_reg_no', label: '사업자등록번호' },
  { key: 'construction_rep', label: '대표자' },
  { key: 'construction_biztype', label: '업태·종목' },
  { key: 'construction_region', label: '소재지', full: true },
  { key: 'construction_phone', label: '전화번호' },
  { key: 'construction_mobile', label: '휴대전화' },
  { key: 'construction_period', label: '시공(제작)기간' },
  { key: 'construction_content', label: '시공(제작) 내용', full: true },
];

interface ApplicationFormProps {
  caseId: string;
  businessName: string;
  supportLimit: number;
  contractorName: string | null;
  /** 5단계에서 멘티가 등록한 공사업체(시공내용) 목록 */
  contractors?: ContractorSummary[];
  /** 4.시공내용 프리필값 (멘티 등록값 or 멘토 편집 저장값) */
  initialConstruction?: ConstructionValues;
  /** 신청업체(대표자=멘티) 서명이 멘토링 일지에서 캡처되었는지 */
  hasApplicantSignature?: boolean;
  /** 지원유형별 첨부서류 안내(제출 여부 포함) */
  attachments?: AttachmentGuide[];
  /** 경영개선(management_improvement)일 때만 신청항목·소요금액 노출 */
  showCategories?: boolean;
  initialReason?: string;
  initialAmount?: number | null;
  initialCostExclVat?: number | null;
  initialCategories?: string[];
  initialPlan?: {
    plan_intro?: string;
    plan_status?: string;
    plan_need?: string;
    plan_effect?: string;
  };
}

const PLAN_FIELDS = [
  { key: 'plan_intro', label: '사업소개', hint: '업체현황·특징·장점 등' },
  { key: 'plan_status', label: '경영상황', hint: '현재 경영상황·애로사항 등' },
  { key: 'plan_need', label: '지원 필요성', hint: '컨설팅·경영개선 필요성' },
  { key: 'plan_effect', label: '기대효과', hint: '지원을 통한 기대효과·성장계획' },
] as const;

export function ApplicationForm({
  caseId,
  businessName,
  supportLimit,
  contractorName,
  contractors = [],
  initialConstruction,
  hasApplicantSignature = false,
  attachments = [],
  showCategories = false,
  initialReason,
  initialAmount,
  initialCostExclVat,
  initialCategories,
  initialPlan,
}: ApplicationFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState(initialReason ?? '');
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '');
  const [costExclVat, setCostExclVat] = useState(
    initialCostExclVat ? String(initialCostExclVat) : '',
  );
  const [categories, setCategories] = useState<string[]>(initialCategories ?? []);
  const [plan, setPlan] = useState<Record<string, string>>({
    plan_intro: initialPlan?.plan_intro ?? '',
    plan_status: initialPlan?.plan_status ?? '',
    plan_need: initialPlan?.plan_need ?? '',
    plan_effect: initialPlan?.plan_effect ?? '',
  });
  const [construction, setConstruction] = useState<ConstructionValues>({
    construction_company: initialConstruction?.construction_company ?? '',
    construction_region: initialConstruction?.construction_region ?? '',
    construction_reg_no: initialConstruction?.construction_reg_no ?? '',
    construction_rep: initialConstruction?.construction_rep ?? '',
    construction_biztype: initialConstruction?.construction_biztype ?? '',
    construction_phone: initialConstruction?.construction_phone ?? '',
    construction_mobile: initialConstruction?.construction_mobile ?? '',
    construction_period: initialConstruction?.construction_period ?? '',
    construction_content: initialConstruction?.construction_content ?? '',
  });
  function toggleCategory(key: string) {
    setCategories((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }

  async function onSave(finalize: boolean) {
    setSubmitting(true);
    const result = await draftApplicationAction({
      caseId,
      finalize,
      reason,
      requested_amount: amount,
      cost_excl_vat: costExclVat,
      categories,
      ...plan,
      ...construction,
    });
    setSubmitting(false);
    if (result.ok) {
      toast({
        title: finalize
          ? '지원신청서를 최종 저장했습니다. (PDF 생성 포함)'
          : '임시 저장되었습니다.',
      });
      if (finalize) router.push(`/mentor/cases/${caseId}`);
      else router.refresh();
    } else {
      toast({ title: '저장 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">자동 연동 정보</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div>
            <span className="text-xs text-muted-foreground">업체명</span>
            <p className="font-medium">{businessName}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">지원한도</span>
            <p className="font-medium">{formatKRW(supportLimit)}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">공사·설비업체</span>
            <p className="font-medium">{contractorName ?? '-'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">신청 내용</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {showCategories && (
            <div className="flex flex-col gap-1.5">
              <Label>경영개선 신청항목</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {CATEGORY_OPTIONS.map((c) => (
                  <label key={c.key} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={categories.includes(c.key)}
                      onChange={() => toggleCategory(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {showCategories && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cost_excl_vat">소요금액 (부가세 제외)</Label>
                <AmountInput
                  id="cost_excl_vat"
                  placeholder="0"
                  value={costExclVat}
                  onValueChange={setCostExclVat}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="requested_amount">지원금 신청액</Label>
              <AmountInput
                id="requested_amount"
                placeholder="0"
                value={amount}
                onValueChange={setAmount}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">신청 사유·사업내용 (시공·제작 내용)</Label>
            <Textarea
              id="reason"
              rows={6}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
        </CardContent>
      </Card>

      {showCategories && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">추진계획 (붙임5 · 신청서에 자동 반영)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PLAN_FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Textarea
                  id={f.key}
                  rows={4}
                  placeholder={f.hint}
                  value={plan[f.key] ?? ''}
                  onChange={(e) => setPlan((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground sm:col-span-2">
              ※ 사업장 사진은 서류 업로드 단계에서 첨부합니다. (신청서 PDF에는 사진란만 표시)
            </p>
          </CardContent>
        </Card>
      )}

      {/* 4. 시공(제작) 내용 — 5단계에서 멘티가 등록한 공사업체 자동 연동 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-muted-foreground" />4. 시공(제작) 내용
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            멘티가 등록한 공사업체 정보가 아래에 자동 채워집니다. <b>멘토가 직접 수정·보완</b>할 수
            있으며, 저장 시 신청서(붙임5 4.시공내용) PDF에 반영됩니다.
          </p>
          {contractors.length === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-status-rejected/40 bg-status-rejected/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-rejected" />
              <p>
                멘티가 아직 <b>공사업체(외주업체) 정보</b>를 등록하지 않았습니다. 프리필된 값이 없으니
                직접 입력하거나, 멘티에게 등록을 요청해 주세요.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CONSTRUCTION_FIELDS.map((f) => (
              <div
                key={f.key}
                className={`flex flex-col gap-1.5 ${f.full ? 'sm:col-span-2' : ''}`}
              >
                <Label htmlFor={f.key} className="text-xs">
                  {f.label}
                </Label>
                {f.key === 'construction_content' ? (
                  <Textarea
                    id={f.key}
                    rows={3}
                    value={construction[f.key]}
                    onChange={(e) =>
                      setConstruction((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                ) : (
                  <Input
                    id={f.key}
                    value={construction[f.key]}
                    onChange={(e) =>
                      setConstruction((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 6. 사업장 사진 + 신청업체(대표자) 서명 안내 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-muted-foreground" />6. 사업장 사진 · 신청업체 서명
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">
            사업장 내·외부 사진(간판 포함)·시공 장소 사진은 <b>서류 업로드 단계</b>에서 첨부하며,
            인쇄본에는 사진란으로 표시됩니다.
          </p>
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              신청업체(대표자·멘티) 서명:{' '}
              {hasApplicantSignature ? (
                <span className="font-semibold text-status-approved">
                  캡처됨 — 신청서에 자동 삽입됩니다.
                </span>
              ) : (
                <span className="font-semibold text-status-rejected">
                  아직 없음 — 멘토링 일지에서 멘티 서명을 먼저 받아 주세요.
                </span>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 첨부서류 안내 — 멘토 참고용 정보(첨부·요청 기능 아님) */}
      <Card className="border-muted bg-muted/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-muted-foreground" />첨부서류 안내
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            신청서에 필요한 첨부서류 목록입니다. (참고용 안내 — 이 영역에서 첨부하거나 멘티에게
            요청하지 않습니다)
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 첨부서류 안내가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {attachments.map((a, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md border bg-card p-2.5 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{a.doc_name}</span>
                      <span
                        className={
                          a.is_required
                            ? 'rounded-full bg-status-rejected/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-rejected'
                            : 'rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground'
                        }
                      >
                        {a.is_required ? '필수' : '해당시'}
                      </span>
                    </div>
                    {a.condition && <p className="text-xs text-muted-foreground">· {a.condition}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            ※ 붙임5 첨부서류: (필수) 외주업체 사업자등록증 사본·견적서(100만원 이상 시 2개 이상)·중복지원
            금지 확약서 / (해당 시) 옥외광고업 등록증.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          취소
        </Button>
        <Button type="button" variant="secondary" disabled={submitting} onClick={() => onSave(false)}>
          {submitting ? '저장 중…' : '임시 저장'}
        </Button>
        <Button type="button" disabled={submitting} onClick={() => onSave(true)}>
          {submitting ? '저장·PDF 생성 중…' : '최종 저장'}
        </Button>
      </div>
    </form>
  );
}
