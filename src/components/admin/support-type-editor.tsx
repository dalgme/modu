'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

import {
  updateSupportTypeLimit,
  addSupportTypeDocument,
  toggleDocumentRequired,
  deleteSupportTypeDocument,
} from '@/lib/workflow/support-type-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface DocItem {
  id: string;
  doc_key: string;
  doc_name: string;
  is_required: boolean;
  condition: string | null;
}

interface SupportTypeEditorProps {
  id: string;
  name: string;
  code: string;
  calcMethod: string;
  limitAmount: number;
  areaUnitPrice: number | null;
  documents: DocItem[];
}

export function SupportTypeEditor(props: SupportTypeEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const isAreaCap = props.calcMethod === 'area_cap';

  const [limit, setLimit] = useState(String(props.limitAmount));
  const [unitPrice, setUnitPrice] = useState(
    props.areaUnitPrice ? String(props.areaUnitPrice) : '',
  );
  const [busy, setBusy] = useState(false);

  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newRequired, setNewRequired] = useState(true);
  const [newCondition, setNewCondition] = useState('');

  async function saveLimit() {
    setBusy(true);
    const result = await updateSupportTypeLimit({
      id: props.id,
      limit_amount: Number(limit),
      area_unit_price: isAreaCap ? Number(unitPrice) : undefined,
    });
    setBusy(false);
    if (result.ok) {
      toast({ title: '한도가 저장되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '저장 실패', description: result.error, variant: 'destructive' });
    }
  }

  async function addDoc() {
    if (!newKey || !newName) {
      toast({ title: 'doc_key와 서류명을 입력하세요.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const result = await addSupportTypeDocument({
      support_type_id: props.id,
      doc_key: newKey,
      doc_name: newName,
      is_required: newRequired,
      condition: newCondition || undefined,
    });
    setBusy(false);
    if (result.ok) {
      setNewKey('');
      setNewName('');
      setNewCondition('');
      toast({ title: '서류가 추가되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '추가 실패', description: result.error, variant: 'destructive' });
    }
  }

  async function toggle(id: string, current: boolean) {
    const result = await toggleDocumentRequired(id, !current);
    if (result.ok) router.refresh();
    else toast({ title: '변경 실패', description: result.error, variant: 'destructive' });
  }

  async function remove(id: string) {
    const result = await deleteSupportTypeDocument(id);
    if (result.ok) {
      toast({ title: '삭제되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '삭제 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {props.name}
          <Badge variant="outline">{isAreaCap ? '면적당 한도' : '정액'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>지원한도(원)</Label>
            <AmountInput value={limit} onValueChange={setLimit} />
          </div>
          {isAreaCap && (
            <div className="flex flex-col gap-1.5">
              <Label>평당 단가(원)</Label>
              <AmountInput value={unitPrice} onValueChange={setUnitPrice} />
            </div>
          )}
          <div className="flex items-end">
            <Button onClick={saveLimit} disabled={busy} size="sm">
              한도 저장
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-sm">필수·조건부 서류</Label>
          <div className="flex flex-col divide-y rounded-md border">
            {props.documents.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">등록된 서류가 없습니다.</p>
            )}
            {props.documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {d.doc_name}{' '}
                    <span className="text-xs text-muted-foreground">({d.doc_key})</span>
                  </p>
                  {d.condition && (
                    <p className="truncate text-xs text-muted-foreground">{d.condition}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggle(d.id, d.is_required)}>
                    {d.is_required ? '필수' : '선택'}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(d.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
          <Label className="text-sm">서류 추가</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              placeholder="doc_key (예: tax_cert)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <Input
              placeholder="서류명"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              placeholder="조건(선택, 예: 100만원 이상 2개)"
              value={newCondition}
              onChange={(e) => setNewCondition(e.target.value)}
              className="sm:col-span-2"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="h-4 w-4"
              />
              필수 서류
            </label>
            <Button onClick={addDoc} disabled={busy} size="sm">
              추가
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
