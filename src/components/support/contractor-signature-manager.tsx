'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, PenLine, RefreshCw, X } from 'lucide-react';

import {
  addContractorSignatureAction,
  replaceContractorSignatureAction,
  deleteContractorSignatureAction,
} from '@/lib/workflow/support-items-actions';
import type { ContractorSignatureItem } from '@/lib/data/support-items';
import { SignaturePad } from '@/components/common/signature-pad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';

type FormMode = { kind: 'idle' } | { kind: 'add' } | { kind: 'edit'; id: string };

/**
 * 공사업체 서명받기 — 납품업체명·대표명·서명을 여러 건 받아 저장한다.
 * 한 번 받은 서명은 이미지로 계속 노출되고, [다시 서명]으로 재서명(수정·재업로드),
 * [폐기]로 삭제할 수 있다. 멘티가 현장에서 받거나 멘토가 대리 입력한다.
 */
export function ContractorSignatureManager({
  caseId,
  signatures,
  editable,
}: {
  caseId: string;
  signatures: ContractorSignatureItem[];
  editable: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  // 서명이 없으면 바로 입력 폼을, 있으면 목록만 노출(추가는 버튼으로)
  const [mode, setMode] = useState<FormMode>(
    signatures.length === 0 ? { kind: 'add' } : { kind: 'idle' },
  );
  const [company, setCompany] = useState('');
  const [rep, setRep] = useState('');
  const [sig, setSig] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function openAdd() {
    setCompany('');
    setRep('');
    setSig(null);
    setMode({ kind: 'add' });
  }

  function openEdit(item: ContractorSignatureItem) {
    setCompany(item.companyName);
    setRep(item.representative);
    setSig(null);
    setMode({ kind: 'edit', id: item.id });
  }

  function closeForm() {
    setCompany('');
    setRep('');
    setSig(null);
    setMode({ kind: 'idle' });
  }

  async function onSave() {
    if (!company.trim() || !rep.trim()) {
      toast({ title: '납품업체명과 대표명을 입력하세요.', variant: 'destructive' });
      return;
    }
    if (!sig) {
      toast({ title: '서명을 입력하세요.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const res =
      mode.kind === 'edit'
        ? await replaceContractorSignatureAction(caseId, mode.id, company, rep, sig)
        : await addContractorSignatureAction(caseId, company, rep, sig);
    setSaving(false);
    if (res.ok) {
      toast({ title: mode.kind === 'edit' ? '서명을 재등록했습니다.' : '공사업체 서명이 저장되었습니다.' });
      closeForm();
      router.refresh();
    } else {
      toast({ title: '저장 실패', description: res.error, variant: 'destructive' });
    }
  }

  async function onDelete(id: string) {
    setBusyId(id);
    const res = await deleteContractorSignatureAction(caseId, id);
    setBusyId(null);
    if (res.ok) {
      toast({ title: '폐기되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '폐기 실패', description: res.error, variant: 'destructive' });
    }
  }

  const showForm = mode.kind !== 'idle';

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 text-sm text-muted-foreground">
          공사·납품업체 <b className="text-foreground">사장님(대표)의 서명</b>을 현장에서 받아
          등록합니다. 업체가 여러 곳이면 <b className="text-foreground">건별로 추가</b>해 각각 서명을
          받아 주세요. 한 번 받은 서명은 계속 사용되며,{' '}
          <b className="text-foreground">[다시 서명]</b>으로 수정,{' '}
          <b className="text-foreground">[폐기]</b>로 삭제할 수 있습니다.
        </CardContent>
      </Card>

      {/* 등록된 서명 목록 (이미지 포함) */}
      {signatures.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 받은 서명이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {signatures.map((s) => (
            <div key={s.id} className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-approved/10 text-status-approved">
                  <PenLine className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.companyName}</p>
                  <p className="text-xs text-muted-foreground">
                    대표 {s.representative} · {formatDate(s.createdAt)} 서명 완료
                  </p>
                </div>
              </div>

              {/* 저장된 서명 이미지 */}
              <div className="flex items-center justify-center rounded-md border bg-white p-1 sm:w-40">
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.imageUrl}
                    alt={`${s.companyName} 대표 ${s.representative} 서명`}
                    className="h-16 w-full object-contain"
                  />
                ) : (
                  <span className="py-5 text-xs text-muted-foreground">이미지 없음</span>
                )}
              </div>

              {editable && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => openEdit(s)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    다시 서명
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-status-rejected hover:bg-status-rejected/10"
                    disabled={busyId === s.id}
                    onClick={() => onDelete(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {busyId === s.id ? '폐기 중…' : '폐기'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 서명 추가 버튼 (목록이 있고 폼이 닫혀 있을 때) */}
      {editable && !showForm && (
        <div>
          <Button type="button" variant="outline" onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            다른 공사업체 서명 추가
          </Button>
        </div>
      )}

      {/* 서명 입력 폼 (추가/재서명) */}
      {editable && showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {mode.kind === 'edit' ? '공사업체 서명 다시 받기' : '공사업체 서명 추가'}
            </CardTitle>
            {signatures.length > 0 && (
              <button
                type="button"
                onClick={closeForm}
                aria-label="닫기"
                className="rounded p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>납품업체명</Label>
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="예: (주)가나간판"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>대표명</Label>
                <Input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="예: 홍길동" />
              </div>
            </div>
            {/* 폼을 열 때마다 새 캔버스로 (key 로 리마운트) */}
            <SignaturePad
              key={mode.kind === 'edit' ? `edit-${mode.id}` : 'add'}
              label="공사업체(대표) 서명"
              onChange={setSig}
            />
            <div className="flex gap-2">
              <Button type="button" onClick={onSave} disabled={saving} className="gap-1.5">
                <Plus className="h-4 w-4" />
                {saving ? '저장 중…' : mode.kind === 'edit' ? '재서명 저장' : '서명 추가'}
              </Button>
              {signatures.length > 0 && (
                <Button type="button" variant="ghost" onClick={closeForm} disabled={saving}>
                  취소
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
