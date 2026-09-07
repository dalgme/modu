'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, UserCheck } from 'lucide-react';

import type { RecommendationItem } from '@/lib/matching/recommend';
import { recommendMentorsAction } from '@/lib/matching/actions';
import { assignMentorAction, reassignMentorAction } from '@/lib/workflow/case-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

/**
 * AI 멘토 매칭 추천 카드 (docs §14) — 객관 점수 표 + 정성 근거. 배정은 운영사가 버튼을 눌러야 한다(자동 배정 없음).
 */
export function MatchRecommendations({ caseId, initial, assignable, reassignable, currentMentorId, modelConfigured }: { caseId: string; initial: RecommendationItem[]; assignable: boolean; reassignable: boolean; currentMentorId: string | null; modelConfigured: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [items, setItems] = useState(initial);
  const [note, setNote] = useState<string | null>(null);

  const generate = () =>
    start(async () => {
      const r = await recommendMentorsAction(caseId);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setItems(r.items);
      setNote(r.usedModel ? '객관 점수 + 모델 정성 근거로 추천했습니다.' : modelConfigured ? '모델 호출에 실패해 객관 점수만으로 추천했습니다.' : '모델 키가 없어 객관 점수만으로 추천했습니다.');
      router.refresh();
    });

  const adopt = (mentorId: string) => {
    if (!confirm('이 멘토를 배정할까요? 추천 채택으로 기록됩니다.')) return;
    start(async () => {
      const r = assignable ? await assignMentorAction(caseId, mentorId) : await reassignMentorAction(caseId, mentorId, 'AI 매칭 추천 채택');
      toast(r.ok ? { title: '멘토를 배정했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };

  const canAdopt = assignable || reassignable;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> AI 멘토 매칭 추천
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            멘티 프로필(업종·단계·지역·필요분야·키워드)과 멘토 프로필·부하로 객관 점수를 내고, 상위 후보에 대해 모델이 근거를 씁니다. 배정은 아래 버튼으로 직접 합니다.
            {items[0] && <span className="ml-1">최근 생성 {formatDateTime(items[0].generatedAt)}</span>}
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1" disabled={pending} onClick={generate}>
          <Sparkles className="h-4 w-4" /> {pending ? '생성 중…' : items.length ? '재생성' : '추천 생성'}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {items.length === 0 && <p className="text-sm text-muted-foreground">아직 추천이 없습니다. 멘티 프로필을 채운 뒤 추천을 생성하세요.</p>}
        {items.map((r) => {
          const o = r.objective;
          const isCurrent = r.mentorId === currentMentorId;
          return (
            <div key={`${r.mentorId}-${r.rank}`} className={`rounded-lg border p-3 text-sm ${r.adoptedAt ? 'border-emerald-300 bg-emerald-50/40' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{r.rank}</span>
                  <b>{r.mentorName}</b>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">점수 {r.score}</span>
                  <span className="text-xs text-muted-foreground">부하 {r.load}{o?.over_capacity ? ' (초과)' : ''}</span>
                  {r.adoptedAt && <span className="text-xs text-emerald-700">채택됨</span>}
                  {isCurrent && <span className="text-xs text-muted-foreground">현재 담당</span>}
                </span>
                {canAdopt && !isCurrent && (
                  <Button size="sm" variant={r.rank === 1 ? 'default' : 'outline'} className="gap-1" disabled={pending} onClick={() => adopt(r.mentorId)}>
                    <UserCheck className="h-4 w-4" /> {assignable ? '이 멘토 배정' : '이 멘토로 교체'}
                  </Button>
                )}
              </div>
              {o && (
                <p className="mt-1 text-xs text-muted-foreground">
                  필요분야 겹침 {o.tag_overlap?.need_expertise ?? 0} · 업종 {o.tag_overlap?.industry ? '일치' : '-'} · 키워드 {o.tag_overlap?.keyword ?? 0} · 지역 {o.region_match ? '일치' : '-'} · 단계 {o.stage_match ? '일치' : '-'} · 유형 {o.mode_match ? '가능' : '불일치'}
                  {o.prior_mentor ? ' · 이전 단계 담당 멘토' : ''}
                </p>
              )}
              {r.rationale ? <p className="mt-1 whitespace-pre-wrap">{r.rationale}</p> : <p className="mt-1 text-xs text-muted-foreground">객관 점수만 (정성 근거 없음)</p>}
              {r.model && <p className="mt-0.5 text-[10px] text-muted-foreground">근거 생성: {r.model}</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
