'use client';

import { useTransition } from 'react';

import type { ProgramRow } from '@/lib/settings/data';
import { updateClosurePolicyAction, updateRoundReportPolicyAction, updateWithholdingAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type Result = { ok: true; id?: string } | { ok: false; error: string };

function useRun() {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, ok: string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? { title: ok } : { title: r.error, variant: 'destructive' });
    });
  return { pending, run };
}

/** 정산: 행사 기본 원천징수 방식 + 방식별 파라미터 */
export function WithholdingForm({ program }: { program: ProgramRow }) {
  const { pending, run } = useRun();
  const p = (program.withholding_params ?? {}) as Record<string, Record<string, unknown>>;
  const oi = p.other_income ?? {};
  const bi = p.business_income ?? {};
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
  return (
    <form
      className="grid gap-4 rounded-xl border bg-background p-4"
      action={(fd) => {
        const o = Object.fromEntries(fd.entries()) as Record<string, string>;
        run(
          () =>
            updateWithholdingAction({
              default_withholding_method: o.default_withholding_method,
              other_income: { expense_rate: o.oi_expense, tax_rate: o.oi_tax, local_rate: o.oi_local, min_taxable_exempt: o.oi_exempt, rounding: o.oi_rounding },
              business_income: { tax_rate: o.bi_tax, local_rate: o.bi_local, rounding: o.bi_rounding },
            }),
          '정산 설정을 저장했습니다. 이후 확정되는 정산부터 적용됩니다.',
        );
      }}
    >
      <div className="flex flex-col gap-1 sm:max-w-xs">
        <Label>행사 기본 원천징수 방식</Label>
        <select name="default_withholding_method" defaultValue={program.default_withholding_method} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="other_income">기타소득 (필요경비 60% · 22% → 실효 8.8%)</option>
          <option value="business_income">사업소득 (3.3%)</option>
          <option value="none">원천징수 없음</option>
        </select>
        <p className="text-[11px] text-muted-foreground">그룹 일괄 방식은 사업그룹 탭, 그룹 내 멘토별 방식은 멘토 명단에서 지정합니다.</p>
      </div>
      <fieldset className="grid gap-2 rounded-lg border p-3 sm:grid-cols-5">
        <legend className="px-1 text-sm font-semibold">기타소득 파라미터</legend>
        <Num name="oi_expense" label="필요경비율" v={num(oi.expense_rate, 0.6)} step={0.01} />
        <Num name="oi_tax" label="소득세율" v={num(oi.tax_rate, 0.2)} step={0.01} />
        <Num name="oi_local" label="지방소득세율(소득세 대비)" v={num(oi.local_rate, 0.1)} step={0.01} />
        <Num name="oi_exempt" label="과세최저한(소득금액, 원)" v={num(oi.min_taxable_exempt, 50000)} step={1000} />
        <Rounding name="oi_rounding" v={String(oi.rounding ?? 'floor_10')} />
      </fieldset>
      <fieldset className="grid gap-2 rounded-lg border p-3 sm:grid-cols-5">
        <legend className="px-1 text-sm font-semibold">사업소득 파라미터</legend>
        <Num name="bi_tax" label="소득세율" v={num(bi.tax_rate, 0.03)} step={0.001} />
        <Num name="bi_local" label="지방소득세율(소득세 대비)" v={num(bi.local_rate, 0.1)} step={0.01} />
        <Rounding name="bi_rounding" v={String(bi.rounding ?? 'floor_10')} />
      </fieldset>
      <p className="text-xs text-muted-foreground">확정된 정산 스냅샷에는 당시 파라미터가 저장되어 있어 이 값을 바꿔도 소급되지 않습니다.</p>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>저장</Button>
      </div>
    </form>
  );
}

function Num({ name, label, v, step }: { name: string; label: string; v: number; step: number }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type="number" step={step} min={0} defaultValue={v} required />
    </div>
  );
}
function Rounding({ name, v }: { name: string; v: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">절사</Label>
      <select name={name} defaultValue={v} className="h-9 rounded-md border bg-background px-2 text-sm">
        <option value="floor_10">10원 미만 절사</option>
        <option value="floor_1">1원 미만 절사</option>
        <option value="round">반올림</option>
      </select>
    </div>
  );
}

/** 종결 게이트 + 보고서 서명 정책(행사 기본) */
export function GatesForm({ program, programTemplateHasMentorSign }: { program: ProgramRow; programTemplateHasMentorSign: boolean }) {
  const { pending, run } = useRun();
  const cp = (program.closure_policy ?? {}) as Record<string, boolean>;
  const rp = (program.round_report_policy ?? {}) as Record<string, boolean>;
  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-3 rounded-xl border bg-background p-4" action={(fd) => run(() => updateClosurePolicyAction(Object.fromEntries(fd.entries())), '종결 게이트를 저장했습니다.')}>
        <h3 className="font-semibold">종결 게이트 (기본 전부 꺼짐)</h3>
        <Check name="require_mentee_signature" label="종결 요청 시 모든 회차에 멘티 서명 필수" v={!!cp.require_mentee_signature} />
        <Check name="require_group_docs" label="종결 요청 시 멘티 필수서류 모두 제출 필수" v={!!cp.require_group_docs} />
        <Check name="block_batch_on_missing_mentor_docs" label="멘토 지급서류(이력서·통장·신분증) 미수령 시 품의 편성 차단" v={!!cp.block_batch_on_missing_mentor_docs} />
        <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>저장</Button></div>
      </form>

      <form className="flex flex-col gap-3 rounded-xl border bg-background p-4" action={(fd) => run(() => updateRoundReportPolicyAction(Object.fromEntries(fd.entries())), '보고서 서명 정책을 저장했습니다.')}>
        <h3 className="font-semibold">컨설팅 보고서 서명 정책 (행사 기본)</h3>
        <p className="text-xs text-muted-foreground">
          보고서 양식에 멘토 서명 컬럼(<code>{'{{{sign_mentor}}}'}</code>)이 포함된 경우에만 사용할 수 있습니다. 그룹별 override 는 사업그룹 탭에서 지정합니다.
          {!programTemplateHasMentorSign && <span className="ml-1 font-semibold text-destructive">현재 행사 양식에 멘토 서명 컬럼이 없습니다.</span>}
        </p>
        <Check name="mentee_confirm_signature" label="회차 등록 알림 발송 후 멘티가 확인 서명 (서명 후 멘토 수정 잠금)" v={rp.mentee_confirm_signature ?? true} disabled={!programTemplateHasMentorSign} />
        <Check name="mentor_auto_sign" label="보고서 작성·저장 시 멘토 등록 서명을 자동으로 붙임 (멘토가 '내 서명'을 등록해야 함)" v={!!rp.mentor_auto_sign} disabled={!programTemplateHasMentorSign} />
        <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>저장</Button></div>
      </form>
    </div>
  );
}

function Check({ name, label, v, disabled }: { name: string; label: string; v: boolean; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} value="true" defaultChecked={v} disabled={disabled} /> {label}
    </label>
  );
}
