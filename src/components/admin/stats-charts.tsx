'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CaseStats } from '@/lib/data/stats';

const BAR_COLOR = '#334e7a'; // 네이비 (primary 계열)

export function StatsCharts({ stats }: { stats: CaseStats }) {
  const statusData = stats.byStatus.map((s) => ({ name: `${s.step}.${s.label}`, count: s.count }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="전체 케이스" value={stats.total} />
        <Tile label="승인 대기" value={stats.pendingApproval} accent="text-status-progress" />
        <Tile
          label="종료(지급완료)"
          value={stats.byStatus.find((s) => s.status === 'payment_approved')?.count ?? 0}
          accent="text-status-approved"
        />
        <Tile
          label="평균 처리일수"
          value={stats.avgProcessingDays === null ? '-' : `${stats.avgProcessingDays}일`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">단계별 케이스 분포</CardTitle>
        </CardHeader>
        <CardContent>
          {statusData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">데이터가 없습니다.</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} layout="vertical" margin={{ left: 24, right: 16 }}>
                  <XAxis type="number" allowDecimals={false} fontSize={12} />
                  <YAxis type="category" dataKey="name" width={140} fontSize={11} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">지원유형별 건수</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {stats.byType.length === 0 ? (
            <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
          ) : (
            stats.byType.map((t) => (
              <div key={t.name} className="flex flex-col">
                <span className="text-xs text-muted-foreground">{t.name}</span>
                <span className="text-xl font-semibold tabular-nums">{t.count}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent ?? 'text-foreground'}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
