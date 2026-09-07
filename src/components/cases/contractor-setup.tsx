'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Building2 } from 'lucide-react';

import { saveContractorConfigAction } from '@/lib/workflow/mentor-doc-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface ContractorConfigView {
  companyCount: number;
  signageIncluded: boolean;
  signageCompanyIndex: number | null;
}

/** 공사업체 구성(업체 수·간판 포함·간판업체 지정) 입력 — 저장 시 접히고, '구성 변경하기'로 다시 펼침 */
export function ContractorSetup({
  caseId,
  initial,
}: {
  caseId: string;
  initial: ContractorConfigView | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [count, setCount] = useState<number>(initial?.companyCount ?? 1);
  const [signage, setSignage] = useState<boolean>(initial?.signageIncluded ?? false);
  const [signageIdx, setSignageIdx] = useState<number>(initial?.signageCompanyIndex ?? 1);
  const [saving, setSaving] = useState(false);
  // 구성이 이미 있으면 접힌 상태로 시작
  const [expanded, setExpanded] = useState<boolean>(!initial);

  async function save() {
    setSaving(true);
    const res = await saveContractorConfigAction(caseId, {
      companyCount: count,
      signageIncluded: signage,
      signageCompanyIndex: signage ? signageIdx : null,
    });
    setSaving(false);
    if (res.ok) {
      toast({ title: '공사업체 구성을 저장했습니다.' });
      setExpanded(false); // 저장하면 접어서 공간 절약
      router.refresh();
    } else {
      toast({ title: '저장 실패', description: res.error, variant: 'destructive' });
    }
  }

  // 접힌 상태: 요약 + 초록 '구성 변경하기'
  if (!expanded) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-semibold">공사업체 구성</span>
            <span className="text-muted-foreground">
              업체 {count}개 · 간판 {signage ? `포함(업체 ${signageIdx})` : '미포함'}
            </span>
          </div>
          <Button
            type="button"
            onClick={() => setExpanded(true)}
            className="gap-2 bg-status-approved text-white hover:bg-status-approved/90"
          >
            <Pencil className="h-4 w-4" />
            구성 변경하기
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">공사업체 구성 (필수)</CardTitle>
        <p className="text-xs text-muted-foreground">
          예산 범위 안에서 1개 또는 여러 업체와 진행할 수 있습니다. 업체 수와 간판(옥외광고) 공사업체
          포함 여부를 선택하고 저장하면, 업체별 업로드 버튼이 생성됩니다.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-count">공사업체 수</Label>
          <div className="flex items-center gap-2">
            <Input
              id="company-count"
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => {
                const v = Math.min(Math.max(parseInt(e.target.value || '1', 10), 1), 10);
                const next = Number.isNaN(v) ? 1 : v;
                setCount(next);
                if (signageIdx > next) setSignageIdx(next);
              }}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">개</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>간판(옥외광고) 공사업체 포함</Label>
          <div className="flex gap-2">
            {[
              { v: true, l: '포함' },
              { v: false, l: '미포함' },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                onClick={() => setSignage(o.v)}
                aria-pressed={signage === o.v}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  signage === o.v
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'text-muted-foreground hover:bg-muted/40',
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {signage && (
          <div className="flex flex-col gap-1.5">
            <Label>간판 공사업체 지정</Label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSignageIdx(n)}
                  aria-pressed={signageIdx === n}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    signageIdx === n
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  업체 {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              지정한 간판업체는 <b>옥외광고업등록증</b> 첨부가 필수입니다.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {initial && (
            <Button type="button" variant="outline" onClick={() => setExpanded(false)}>
              취소
            </Button>
          )}
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? '저장 중…' : initial ? '구성 변경 저장' : '구성 저장 · 업로드 버튼 만들기'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
