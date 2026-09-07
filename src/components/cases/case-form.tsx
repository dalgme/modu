'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { caseFormSchema, type CaseFormInput, type CaseFormValues } from '@/lib/validations/case';
import { registerCase, type ApplicationStaging } from '@/lib/workflow/case-actions';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type SupportTypeOption = { id: string; code: string; name: string };

function Field({
  label,
  htmlFor,
  error,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

export function CaseForm({ supportTypes }: { supportTypes: SupportTypeOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [application, setApplication] = useState<ApplicationStaging | null>(null);
  const [credential, setCredential] = useState<{
    caseId: string;
    email: string;
    tempPassword: string;
    phone: string;
    name: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CaseFormValues, unknown, CaseFormInput>({
    resolver: zodResolver(caseFormSchema),
  });

  /** 등록 완료 후 '추가 등록하기' — 폼·첨부·자격증명 카드를 초기화해 새 등록을 시작한다. */
  function startNewRegistration() {
    reset();
    setApplication(null);
    setCredential(null);
  }

  const selectedTypeId = watch('support_type_id');
  const isClosure = supportTypes.find((t) => t.id === selectedTypeId)?.code === 'closure';

  /**
   * 신청서 PDF(붙임1·2) 업로드 → 서버(API 라우트)가 원본을 스테이징 저장 + 텍스트 파싱 →
   * 폼 자동 채움 + 등록 시 케이스에 첨부. (진흥원 확인 후 등록)
   */
  async function handlePdfImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') {
      toast({ title: 'PDF 파일만 업로드할 수 있습니다.', variant: 'destructive' });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: '파일이 너무 큽니다. (최대 20MB)', variant: 'destructive' });
      return;
    }
    setImporting(true);
    let payload: {
      ok: boolean;
      error?: string;
      matchedCount?: number;
      fields?: Record<string, string | undefined>;
      supportTypeCode?: 'management_improvement' | 'closure';
      staging?: ApplicationStaging;
    };
    try {
      // 1) 서명 업로드 URL 발급 (서버)
      const urlRes = await fetch('/api/institution/cases/application-upload-url', {
        method: 'POST',
      });
      const urlJson = await urlRes.json();
      if (!urlJson.ok) throw new Error(urlJson.error ?? '업로드 URL 발급 실패');

      // 2) 브라우저 → Supabase 스토리지로 원본 직접 업로드 (Vercel 본문 한도 우회)
      const supabase = createBrowserSupabase();
      const { error: upErr } = await supabase.storage
        .from('documents')
        .uploadToSignedUrl(urlJson.path, urlJson.token, file, { contentType: 'application/pdf' });
      if (upErr) throw new Error(`스토리지 업로드 실패: ${upErr.message}`);

      // 3) 서버가 경로로 내려받아 파싱 (본문은 경로만)
      const res = await fetch('/api/institution/cases/parse-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stagingPath: urlJson.path, fileName: file.name }),
      });
      payload = await res.json();
    } catch (err) {
      setImporting(false);
      toast({
        title: '업로드 실패',
        description:
          err instanceof Error ? err.message : '신청서를 처리하지 못했습니다. 다시 시도하세요.',
        variant: 'destructive',
      });
      return;
    }
    setImporting(false);

    if (!payload.ok || !payload.staging) {
      toast({
        title: '신청서 처리 실패',
        description: payload.error ?? 'PDF를 처리하지 못했습니다.',
        variant: 'destructive',
      });
      return;
    }

    // 원본 PDF 첨부 확정 (등록 시 케이스로 이관)
    setApplication(payload.staging);

    // 지원유형 자동 선택 (신청서 제목 괄호: 컨설팅·경영개선 / 폐업정리)
    if (payload.supportTypeCode) {
      const matchedType = supportTypes.find((t) => t.code === payload.supportTypeCode);
      if (matchedType) {
        setValue('support_type_id', matchedType.id, { shouldValidate: true, shouldDirty: true });
      }
    }

    const f = payload.fields ?? {};
    const KEYS = [
      'business_name',
      'owner_name',
      'business_reg_no',
      'phone',
      'address',
      'email',
      'business_type',
      'item',
      'opened_at',
      'employee_count',
      'revenue_last_year',
    ] as const;
    for (const k of KEYS) {
      const v = f[k];
      if (v !== undefined && v !== '') {
        setValue(k as keyof CaseFormValues, v as never, { shouldValidate: true, shouldDirty: true });
      }
    }

    const typeHint = payload.supportTypeCode
      ? ''
      : ' 지원유형은 자동 감지되지 않았으니 직접 선택하세요.';
    const matched = payload.matchedCount ?? 0;
    if (matched > 0) {
      toast({
        title: `신청서에서 ${matched}개 항목을 채웠습니다.`,
        description: `내용을 확인·보완한 뒤 등록하세요. (PDF 원본이 첨부됩니다)${typeHint}`,
      });
    } else {
      toast({
        title: 'PDF 원본이 첨부되었습니다.',
        description: `자동 채움 항목이 없습니다(스캔본 등). 기본정보를 직접 입력하세요.${typeHint}`,
      });
    }
  }

  /** 유효성 검사 실패 시 — 어떤 항목이 문제인지 안내 (버튼 무반응처럼 보이지 않도록) */
  function onInvalid(formErrors: typeof errors) {
    const first = Object.keys(formErrors)[0];
    const label =
      first === 'support_type_id'
        ? '지원유형을 선택하세요.'
        : '입력값을 확인하세요. (필수 항목 누락)';
    toast({ title: '등록할 수 없습니다', description: label, variant: 'destructive' });
  }

  async function onSubmit(values: CaseFormInput) {
    setSubmitting(true);
    const result = await registerCase(values, application ?? undefined);
    setSubmitting(false);
    if (result.ok) {
      if (result.menteeCredential) {
        // 멘티 로그인 계정이 자동 발급됨 — 임시비번을 진흥원에 1회 노출
        toast({ title: '케이스가 등록되고 멘티 계정이 발급되었습니다.' });
        setCredential({
          caseId: result.caseId,
          email: result.menteeCredential.email,
          tempPassword: result.menteeCredential.tempPassword,
          phone: values.phone,
          name: values.owner_name,
        });
      } else {
        toast({ title: '케이스가 등록되었습니다.' });
        router.push(`/institution/cases/${result.caseId}`);
      }
    } else {
      toast({ title: '등록 실패', description: result.error, variant: 'destructive' });
    }
  }

  // 등록 성공 + 멘티 계정 자동발급 → 자격증명 안내(임시비번 1회 표시)
  if (credential) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">멘티 계정이 발급되었습니다</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            멘티기업에게 아래 로그인 정보를 전달하세요. 멘티는 <b>아이디(이름+휴대폰 뒷4자리)</b>로
            로그인하며, 최초 로그인 시 비밀번호 변경·개인정보 동의를 거쳐 활성화됩니다. (임시
            비밀번호는 이 화면에서만 표시됩니다.)
          </p>
          {/* 주 로그인: 멘티 아이디 + 임시 비밀번호 */}
          <div className="grid grid-cols-1 gap-2 rounded-md border border-primary/40 bg-background p-3 sm:grid-cols-2">
            <div>
              <span className="text-xs text-muted-foreground">멘티 아이디</span>
              <p className="font-mono text-base font-semibold text-primary">
                {`${credential.name.replace(/\s+/g, '')}${credential.phone.replace(/\D/g, '').slice(-4)}`}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">임시 비밀번호</span>
              <p className="font-mono text-base font-semibold">{credential.tempPassword}</p>
            </div>
          </div>
          {/* 대체 로그인 수단 */}
          <div className="grid grid-cols-1 gap-2 rounded-md border bg-background p-3 text-xs sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">대체 로그인(휴대폰)</span>
              <p className="font-mono font-medium">{credential.phone}</p>
            </div>
            <div>
              <span className="text-muted-foreground">대체 로그인(이메일)</span>
              <p className="break-all font-medium">{credential.email}</p>
            </div>
          </div>
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            💡 <b>멘티 아이디</b>는 이름(띄어쓰기 없이)+휴대폰 뒷4자리입니다. 휴대폰 번호·이메일로도
            로그인할 수 있습니다. 임시 비밀번호는 <b>휴대폰 번호(숫자만)</b>이며, 하이픈을 넣어도
            로그인됩니다.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/institution/dashboard')}
            >
              대시보드로 이동
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/institution/cases/${credential.caseId}`)}
            >
              케이스로 이동
            </Button>
            <Button
              type="button"
              onClick={startNewRegistration}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              + 추가 등록하기
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex flex-col gap-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">신청서 PDF로 자동 등록</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            공식 신청서(붙임1 사업신청서 · 붙임2 추진계획서) PDF를 올리면 멘티기업 정보를 자동으로
            채웁니다. 내용 확인 후 등록하면 넥스트랩으로 이관됩니다.
          </p>
          <div className="flex items-center gap-3">
            <input
              id="pdf-import"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handlePdfImport}
              disabled={importing}
            />
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => document.getElementById('pdf-import')?.click()}
            >
              {importing ? '분석 중…' : application ? '다른 PDF로 다시 채우기' : 'PDF 업로드로 자동 채우기'}
            </Button>
            {application && (
              <span className="inline-flex items-center gap-1 rounded-md border border-status-approved/40 bg-status-approved/10 px-2 py-1 text-xs font-medium text-status-approved">
                📎 {application.fileName} 첨부됨
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            ※ 디지털(텍스트) PDF 기준. 스캔(이미지) PDF는 일부만 채워지거나 직접 입력이 필요할 수
            있습니다. 업로드한 원본 PDF는 등록 시 케이스에 첨부되어 목록에서 열람할 수 있습니다.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">지원유형 · 기본정보</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="지원유형" error={errors.support_type_id?.message}>
              <Controller
                control={control}
                name="support_type_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="지원유형 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {supportTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <Field label="업체명" htmlFor="business_name" error={errors.business_name?.message}>
            <Input id="business_name" {...register('business_name')} />
          </Field>
          <Field label="대표자명" htmlFor="owner_name" error={errors.owner_name?.message}>
            <Input id="owner_name" {...register('owner_name')} />
          </Field>
          <Field
            label="사업자등록번호"
            htmlFor="business_reg_no"
            error={errors.business_reg_no?.message}
          >
            <Input
              id="business_reg_no"
              placeholder="000-00-00000"
              {...register('business_reg_no')}
            />
          </Field>
          <Field label="연락처" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" {...register('phone')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="사업장 주소" htmlFor="address" error={errors.address?.message}>
              <Input id="address" {...register('address')} />
            </Field>
          </div>
          <Field label="이메일" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" {...register('email')} />
          </Field>
          <Field
            label="상시근로자수"
            htmlFor="employee_count"
            error={errors.employee_count?.message}
          >
            <Input id="employee_count" type="number" min={0} {...register('employee_count')} />
          </Field>
          <Field label="업태" htmlFor="business_type" error={errors.business_type?.message}>
            <Input id="business_type" {...register('business_type')} />
          </Field>
          <Field label="종목" htmlFor="item" error={errors.item?.message}>
            <Input id="item" {...register('item')} />
          </Field>
          <Field label="개업연월일" htmlFor="opened_at" error={errors.opened_at?.message}>
            <Input id="opened_at" type="date" {...register('opened_at')} />
          </Field>
        </CardContent>
      </Card>

      {isClosure && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">폐업정리 전용 정보</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="폐업 구분" error={errors.closure_status?.message}>
              <Controller
                control={control}
                name="closure_status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closed">폐업</SelectItem>
                      <SelectItem value="pending">폐업예정</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="폐업(예정)연월일" htmlFor="closed_at" error={errors.closed_at?.message}>
              <Input id="closed_at" type="date" {...register('closed_at')} />
            </Field>
            <Field
              label="전용면적(평)"
              htmlFor="exclusive_area_pyeong"
              error={errors.exclusive_area_pyeong?.message}
              hint="평당 20만원 × 면적 과 500만원 중 낮은 금액이 지원한도"
            >
              <Input
                id="exclusive_area_pyeong"
                type="number"
                step="0.01"
                min={0}
                {...register('exclusive_area_pyeong')}
              />
            </Field>
            <Field
              label="매출액(전년)"
              htmlFor="revenue_last_year"
              error={errors.revenue_last_year?.message}
            >
              <Controller
                control={control}
                name="revenue_last_year"
                render={({ field }) => (
                  <AmountInput
                    id="revenue_last_year"
                    placeholder="0"
                    value={field.value == null ? '' : String(field.value)}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </Field>
            <Field
              label="임대차보증금"
              htmlFor="lease_deposit"
              error={errors.lease_deposit?.message}
            >
              <Controller
                control={control}
                name="lease_deposit"
                render={({ field }) => (
                  <AmountInput
                    id="lease_deposit"
                    placeholder="0"
                    value={field.value == null ? '' : String(field.value)}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </Field>
            <Field label="월세금액" htmlFor="monthly_rent" error={errors.monthly_rent?.message}>
              <Controller
                control={control}
                name="monthly_rent"
                render={({ field }) => (
                  <AmountInput
                    id="monthly_rent"
                    placeholder="0"
                    value={field.value == null ? '' : String(field.value)}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </Field>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          취소
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? '등록 중…' : '케이스 등록'}
        </Button>
      </div>
    </form>
  );
}
