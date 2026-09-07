'use client';

import dynamic from 'next/dynamic';

/**
 * StatsCharts(recharts 포함, ~150kB) 를 클라이언트에서 지연 로드해 초기 번들에서 분리한다.
 * 차트는 대시보드 하단에 있어 즉시 필요하지 않으므로 ssr:false + 스켈레톤으로 로드한다.
 */
export const StatsChartsLazy = dynamic(
  () => import('@/components/admin/stats-charts').then((m) => m.StatsCharts),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted/40" />,
  },
);
