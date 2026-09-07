'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save } from 'lucide-react';

import {
  saveSupportItemAction,
  deleteSupportItemAction,
} from '@/lib/workflow/support-items-actions';
import type { SupportItem } from '@/lib/data/support-items';
import {
  requiredItemDocs,
  itemDocKey,
  MAX_SUPPORT_ITEMS,
  COMPARE_ESTIMATE_THRESHOLD,
} from '@/lib/support/catalog';
import { DocUploadRow } from '@/components/support/doc-upload-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AmountInput } from '@/components/ui/amount-input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatKRW } from '@/lib/utils/format';

interface FieldState {
  companyName: string;
  representative: string;
  businessRegNo: string;
  phone: string;
  workType: string;
  estimateAmount: string;
}

function InfoFields({
  value,
  onChange,
  disabled,
}: {
  value: FieldState;
  onChange: (v: FieldState) => void;
  disabled: boolean;
}) {
  const set = (k: keyof FieldState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label>공사업체명</Label>
        <Input value={value.companyName} onChange={set('companyName')} disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>대표자</Label>
        <Input value={value.representative} onChange={set('representative')} disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>사업자등록번호</Label>
        <Input value={value.businessRegNo} onChange={set('businessRegNo')} disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>연락처</Label>
        <Input value={value.phone} onChange={set('phone')} disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>공사·설비 유형</Label>
        <Input
          value={value.workType}
          onChange={set('workType')}
          placeholder="예: 간판 설치, 싱크대 제작/설치, POS기"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>신청(견적) 금액</Label>
        <AmountInput
          value={value.estimateAmount}
          onValueChange={(raw) => onChange({ ...value, estimateAmount: raw })}
          placeholder="0"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/** 기존 신청단위 카드 — 정보 편집 + 조건별 서류 업로드 */
function ItemCard({
  caseId,
  item,
  index,
  editable,
}: {
  caseId: string;
  item: SupportItem;
  index: number;
  editable: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [fields, setFields] = useState<FieldState>({
    companyName: item.companyName,
    representative: item.representative ?? '',
    businessRegNo: item.businessRegNo ?? '',
    phone: item.phone ?? '',
    workType: item.workType ?? '',
    estimateAmount: item.estimateAmount != null ? String(item.estimateAmount) : '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const amountNum = fields.estimateAmount ? Number(fields.estimateAmount) : null;
  const docSpecs = requiredItemDocs(amountNum, fields.workType);

  async function onSave() {
    setSaving(true);
    const res = await saveSupportItemAction({ caseId, id: item.id, ...fields });
    setSaving(false);
    if (res.ok) {
      toast({ title: '신청단위 정보를 저장했습니다.' });
      router.refresh();
    } else {
      toast({ title: '저장 실패', description: res.error, variant: 'destructive' });
    }
  }

  async function onDelete() {
    if (!window.confirm('이 신청단위와 첨부서류를 모두 삭제할까요?')) return;
    setDeleting(true);
    const res = await deleteSupportItemAction(caseId, item.id);
    setDeleting(false);
    if (res.ok) {
      toast({ title: '삭제되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '삭제 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">
          공사·설비 업체 {index + 1}
          {item.companyName ? ` · ${item.companyName}` : ''}
        </CardTitle>
        {editable && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={deleting}
            className="gap-1 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            삭제
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <InfoFields value={fields} onChange={setFields} disabled={!editable} />
        {editable && (
          <div>
            <Button type="button" size="sm" onClick={onSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? '저장 중…' : '업체정보 저장'}
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">필요 서류</p>
          {(amountNum ?? 0) >= COMPARE_ESTIMATE_THRESHOLD && (
            <p className="text-xs text-status-progress">
              신청금액 100만원 이상 — 비교견적서가 필요합니다.
            </p>
          )}
          {docSpecs.map((spec) => (
            <DocUploadRow
              key={spec.docType}
              caseId={caseId}
              docKey={itemDocKey(item.id, spec.docType)}
              docName={spec.name}
              hint={spec.hint}
              required
              multiple={spec.multiple}
              editable={editable}
              docs={item.docs.filter((d) => d.docType === spec.docType)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** 새 신청단위 추가 폼 */
function AddItemForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<FieldState>({
    companyName: '',
    representative: '',
    businessRegNo: '',
    phone: '',
    workType: '',
    estimateAmount: '',
  });

  async function onCreate() {
    setSaving(true);
    const res = await saveSupportItemAction({ caseId, ...fields });
    setSaving(false);
    if (res.ok) {
      toast({ title: '업체가 추가되었습니다. 이어서 서류를 올려 주세요.' });
      setFields({
        companyName: '',
        representative: '',
        businessRegNo: '',
        phone: '',
        workType: '',
        estimateAmount: '',
      });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: '추가 실패', description: res.error, variant: 'destructive' });
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        공사·설비 업체 추가
      </Button>
    );
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">공사·설비 업체 추가</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <InfoFields value={fields} onChange={setFields} disabled={saving} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            취소
          </Button>
          <Button type="button" onClick={onCreate} disabled={saving || !fields.companyName.trim()}>
            {saving ? '추가 중…' : '추가하기'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 지원신청(사전) 관리 — 신청단위(공사업체)별 서류 업로드.
 * 멘티 본인 또는 담당 멘토(대리)가 편집. 최대 3개 신청단위.
 */
export function PreSupportManager({
  caseId,
  items,
  limitAmount,
  editable,
}: {
  caseId: string;
  items: SupportItem[];
  limitAmount: number;
  editable: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 py-4 text-sm">
          <div>
            <p className="font-semibold text-foreground">이렇게 올리시면 됩니다</p>
            <ol className="mt-1.5 flex flex-col gap-1 text-muted-foreground">
              <li>
                <b className="text-primary">1.</b> 아래{' '}
                <b className="text-foreground">[공사·설비 업체 추가]</b>를 눌러 업체명·견적금액을
                적습니다.
              </li>
              <li>
                <b className="text-primary">2.</b> 견적서·사업자등록증 등을{' '}
                <b className="text-foreground">휴대폰으로 촬영해</b> 올립니다.
              </li>
              <li>
                <b className="text-primary">3.</b> 다 올렸으면 위쪽{' '}
                <b className="text-foreground">[제출하기]</b>를 누릅니다.
              </li>
            </ol>
          </div>
          <p className="text-xs text-muted-foreground">
            지원한도 <b className="text-primary">{formatKRW(limitAmount)}</b> 안에서 최대{' '}
            {MAX_SUPPORT_ITEMS}곳까지 신청할 수 있어요. 신청금액 100만원 이상이면 비교견적서,
            간판·옥외광고 공사면 설치 허가서가 추가로 필요합니다. 공사업체 사장님 서명은 상단{' '}
            &lsquo;공사업체 서명받기&rsquo;에서 받습니다.
          </p>
        </CardContent>
      </Card>

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 추가한 업체가 없어요. 아래 &lsquo;공사·설비 업체 추가&rsquo;를 눌러 시작하세요.
        </div>
      )}

      {items.map((it, i) => (
        <ItemCard key={it.id} caseId={caseId} item={it} index={i} editable={editable} />
      ))}

      {editable && items.length < MAX_SUPPORT_ITEMS && <AddItemForm caseId={caseId} />}
    </div>
  );
}
