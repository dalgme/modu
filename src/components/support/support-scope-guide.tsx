import { Wrench, ClipboardCheck, FileText, Coins, Store, DoorClosed } from 'lucide-react';

import { listSupportTypesWithDocs } from '@/lib/data/support-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatKRW } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * 유형별 지원 영역·세부 항목·컨설팅·필요 서류 정리.
 * 한도·산정방식·필요서류는 DB(support_types/support_type_documents) 실시간, 컨설팅은 이용안내와 동일.
 * 지원 영역·세부 항목은 예시(최종 항목은 공고·멘토 안내 기준).
 */
const SCOPE: Record<
  string,
  {
    icon: typeof Store;
    areaTitle: string;
    areaDesc: string;
    detailGroups: { label: string; items: string[]; note?: string }[];
    detailNotes: string[];
    consulting: { required: string; optional: string; content: string };
    accentCard: string;
    accentBadge: string;
    accentText: string;
  }
> = {
  management_improvement: {
    icon: Store,
    areaTitle: '매장 경영개선을 위한 시설·설비·환경 개선',
    areaDesc: '영업을 계속하는 매장의 매출·운영 개선에 필요한 공사·설비·물품을 지원합니다.',
    detailGroups: [
      {
        label: '시설개선비',
        items: [
          '도배·전기조명공사·어닝·샤시·썬팅 등 인테리어',
          'LED·판형(FLEX) 간판 등 옥외광고물 설치·교체 등',
        ],
        note: '* 신고(허가) 대상 옥외광고물인 경우에만 해당되며, 신고(허가) 증명서 필수 제출',
      },
      {
        label: '홍보·광고비',
        items: [
          '홍보용 판촉물·카탈로그 등 (사업장명 기재 필수)',
          '온라인 키워드 광고노출 등 소셜마케팅 광고비용 등',
        ],
      },
      {
        label: '안전관리비',
        items: [
          '소방·위험물(가스·전기 등) 점검, 위험물(석면 등) 철거 비용',
          'CCTV 관련 비용 등',
        ],
      },
      {
        label: '위생관리비',
        items: [
          '소독·청소용역·방역소독 비용 등',
          '위생관리기(살균·소독기·해충퇴치기 등) 비용',
        ],
      },
      {
        label: 'POS 경비',
        items: ['POS·무인주문기(키오스크 등)·테이블오더 관련 비용'],
      },
    ],
    detailNotes: [
      '지원항목은 중복선택 가능',
      '지원 분야는 공고일 기준 상황에 따라 변경될 수 있음',
    ],
    consulting: {
      required: '컨설팅 2회 필수',
      optional: '필요시 1회 추가 가능',
      content: '경영개선 요청사항 현장확인, 경영관련 일반 컨설팅 등',
    },
    accentCard: 'border-l-4 border-l-emerald-500',
    accentBadge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    accentText: 'text-emerald-700 dark:text-emerald-300',
  },
  closure: {
    icon: DoorClosed,
    areaTitle: '폐업에 따른 점포철거·원상복구',
    areaDesc: '폐업을 진행하는 매장의 점포철거·원상복구 등에 필요한 비용을 지원합니다.',
    detailGroups: [
      {
        label: '지원내용',
        items: [
          '폐업 시 소요되는 점포철거 및 원상복구 비용',
          '사업자등록이 되어 있는 외주업체를 통한 철거·원상복구 이행 비용 지원',
        ],
        note: '자력(자체) 철거는 지원 불가',
      },
    ],
    detailNotes: [
      '공급가액 기준으로 최대 500만원 지원 (부가세 제외)',
      '전용면적 1평(3.3㎡)당 20만원 이내로 금액 제한',
      '공급가액은 부가세가 제외된 금액으로, 초과분 및 부가세 등은 자부담',
    ],
    consulting: {
      required: '컨설팅 1회 필수',
      optional: '필요시 1회 추가 가능',
      content: '폐업현장 확인, 지원금 신청항목 확인',
    },
    accentCard: 'border-l-4 border-l-amber-500',
    accentBadge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    accentText: 'text-amber-700 dark:text-amber-300',
  },
};

function Section({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: typeof Store;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={cn('flex items-center gap-1.5 text-sm font-semibold', accent)}>
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}

export async function SupportScopeGuide() {
  const types = await listSupportTypesWithDocs();

  return (
    <div className="flex flex-col gap-5">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 text-sm text-muted-foreground">
          재기지원사업은 <b className="text-foreground">경영개선</b>과{' '}
          <b className="text-foreground">폐업정리</b> 두 유형으로 운영됩니다. 유형별로 지원 한도·컨설팅
          회차·필요 서류가 다릅니다. 아래 <b className="text-foreground">세부 지원 항목은 예시</b>이며,
          최종 지원 항목은 사업 공고와 멘토 상담을 통해 확정됩니다.
        </CardContent>
      </Card>

      {types.map((t) => {
        const scope = SCOPE[t.code] ?? SCOPE.management_improvement!;
        const required = t.documents.filter((d) => d.is_required);
        const conditional = t.documents.filter((d) => !d.is_required);
        const isArea = t.calc_method !== 'fixed';

        return (
          <Card key={t.id} className={scope.accentCard}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <scope.icon className={cn('h-5 w-5', scope.accentText)} />
                  {t.name} 유형
                </CardTitle>
                <Badge className={cn('text-sm', scope.accentBadge)}>
                  지원한도 최대 {formatKRW(t.limit_amount)}
                </Badge>
              </div>
              {isArea && (
                <p className="text-xs text-muted-foreground">
                  전용면적 기준으로 산정
                  {t.area_unit_price ? ` (평당 ${formatKRW(t.area_unit_price)})` : ''} · 최대{' '}
                  {formatKRW(t.limit_amount)}
                </p>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {/* 지원 가능 영역 */}
              <Section icon={Wrench} title="지원 가능 영역" accent={scope.accentText}>
                <p className="text-sm font-medium">{scope.areaTitle}</p>
                <p className="text-sm text-muted-foreground">{scope.areaDesc}</p>
              </Section>

              {/* 세부 지원 항목·내용 */}
              <Section icon={ClipboardCheck} title="세부 지원 항목·내용" accent={scope.accentText}>
                <div className="flex flex-col gap-2.5">
                  {scope.detailGroups.map((g) => (
                    <div key={g.label} className="rounded-lg border bg-background p-3">
                      <span
                        className={cn(
                          'inline-block rounded-md px-2 py-0.5 text-xs font-semibold',
                          scope.accentBadge,
                        )}
                      >
                        {g.label}
                      </span>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {g.items.map((it) => (
                          <li key={it} className="flex gap-1.5 text-sm text-foreground">
                            <span className={cn('shrink-0', scope.accentText)}>·</span>
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                      {g.note && (
                        <p className="mt-1.5 text-xs text-muted-foreground">{g.note}</p>
                      )}
                    </div>
                  ))}
                </div>
                {scope.detailNotes.length > 0 && (
                  <ul className="flex flex-col gap-0.5">
                    {scope.detailNotes.map((n) => (
                      <li key={n} className="text-xs text-muted-foreground">
                        ※ {n}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* 컨설팅 */}
              <Section icon={Coins} title="컨설팅(멘토링) 회차·비용" accent={scope.accentText}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={cn('rounded-md px-2 py-0.5 font-semibold', scope.accentBadge)}>
                    {scope.consulting.required}
                  </span>
                  <span className="text-muted-foreground">· {scope.consulting.optional}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  <b className="text-foreground">컨설팅 내용</b> · {scope.consulting.content}
                </p>
                <p className="text-xs text-muted-foreground">
                  각 컨설팅은 <b className="text-foreground">1회 1시간</b> 기준,{' '}
                  <b className="text-foreground">시간당 12만원</b>입니다.
                </p>
              </Section>

              {/* 필요 서류 */}
              <Section icon={FileText} title="유형별 필요 서류" accent={scope.accentText}>
                {required.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold text-foreground">필수</p>
                    <ul className="flex flex-col gap-1">
                      {required.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                          <span>· {d.doc_name}</span>
                          {d.condition && (
                            <span className="text-xs text-muted-foreground">({d.condition})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {conditional.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1">
                    <p className="text-xs font-semibold text-foreground">해당 시 제출</p>
                    <ul className="flex flex-col gap-1">
                      {conditional.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                          <span className="text-muted-foreground">· {d.doc_name}</span>
                          {d.condition && (
                            <span className="text-xs text-muted-foreground">({d.condition})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {t.documents.length === 0 && (
                  <p className="text-sm text-muted-foreground">등록된 서류 안내가 없습니다.</p>
                )}
              </Section>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
