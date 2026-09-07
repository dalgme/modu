'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';

import { saveFeatureFlagsAction } from '@/lib/workflow/feature-flags-actions';
import type { FeatureFlags } from '@/lib/data/app-settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const ITEMS: { key: keyof FeatureFlags; label: string; desc: string }[] = [
  {
    key: 'formsSelection',
    label: '선정단계 붙임서식 (붙임1~6)',
    desc: '사업 신청서·추진계획서·개인정보/행정정보 동의·중복지원 금지 확약서 등. 선정 과정부터 사용할 때만 켜세요.',
  },
  {
    key: 'formsChangePayment',
    label: '변경·포기·지급 붙임서식 (붙임8~12)',
    desc: '하자보증 이행각서·옥외광고물 비대상 확인서·CCTV 운영방침·변경 승인신청서·포기 신청서. 변경/포기/지급 단계에서 사용할 때만 켜세요.',
  },
  {
    key: 'supplementRequest',
    label: '멘티 보완요청',
    desc: '케이스 화면에서 멘티에게 서류 보완을 요청하는 기능. 필요할 때만 켜세요.',
  },
];

/** 넥스트랩 관리자: 기능 노출 on/off 토글 */
export function FeatureTogglesCard({ initial }: { initial: FeatureFlags }) {
  const router = useRouter();
  const { toast } = useToast();
  const [flags, setFlags] = useState<FeatureFlags>(initial);
  const [saving, setSaving] = useState(false);

  function toggle(key: keyof FeatureFlags) {
    setFlags((f) => ({ ...f, [key]: !f[key] }));
  }

  async function save() {
    setSaving(true);
    const res = await saveFeatureFlagsAction(flags);
    setSaving(false);
    if (res.ok) {
      toast({ title: '기능 노출 설정을 저장했습니다.' });
      router.refresh();
    } else {
      toast({ title: '저장 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">기능 노출 설정</CardTitle>
        <p className="text-xs text-muted-foreground">
          본 컨설팅·지원 단계에서는 기본적으로 감춰집니다. 선정/변경/지급 단계에서 사용할 때만
          켜세요. 켜면 멘토·운영진 케이스 화면에 다시 노출됩니다.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {ITEMS.map((it) => {
          const on = flags[it.key];
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => toggle(it.key)}
              aria-pressed={on}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                on ? 'border-primary bg-primary/5' : 'border-muted hover:bg-muted/40',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
                  on ? 'justify-end bg-primary' : 'justify-start bg-muted-foreground/30',
                )}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow">
                  {on && <Check className="h-3 w-3 text-primary" />}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {it.label}
                  <span
                    className={cn(
                      'ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      on
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {on ? '노출' : '숨김'}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{it.desc}</span>
              </span>
            </button>
          );
        })}
        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
