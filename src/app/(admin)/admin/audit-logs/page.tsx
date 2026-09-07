import { requireStaff } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils/format';

export default async function Page() {
  await requireStaff();
  const supabase = createClient();
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('id, actor_id, action, entity_type, entity_id, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(200);

  // 대행(view-as)으로 수행된 기록은 metadata.on_behalf_of 에 '명의'가 들어 있다.
  const onBehalfOf = (m: unknown): string | null => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const v = (m as Record<string, unknown>).on_behalf_of;
    return typeof v === 'string' ? v : null;
  };

  const ids = new Set<string>();
  for (const l of logs ?? []) {
    if (l.actor_id) ids.add(l.actor_id);
    const ob = onBehalfOf(l.metadata);
    if (ob) ids.add(ob);
  }
  const actorIds = Array.from(ids);
  const { data: users } = actorIds.length
    ? await supabase.from('users').select('id, name').in('id', actorIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">감사 로그</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          관리자 액션 이력 (INSERT-only · 위변조 방지). 최근 200건.
        </p>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>시각</TableHead>
              <TableHead>수행자</TableHead>
              <TableHead>액션</TableHead>
              <TableHead>대상</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(logs ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  기록이 없습니다.
                </TableCell>
              </TableRow>
            )}
            {(logs ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(l.created_at)}
                </TableCell>
                <TableCell className="text-sm">
                  {l.actor_id ? (nameById.get(l.actor_id) ?? '알 수 없음') : '시스템'}
                  {(() => {
                    const ob = onBehalfOf(l.metadata);
                    if (!ob) return null;
                    return (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        {nameById.get(ob) ?? '멘토'} 대행
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell className="font-mono text-xs">{l.action}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {l.entity_type ?? '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
