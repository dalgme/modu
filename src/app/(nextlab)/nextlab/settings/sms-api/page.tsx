import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getProgramSmsSettingsView } from '@/lib/sms/secrets';
import { createAdminClient } from '@/lib/supabase/admin';
import { SmsApiSettings } from '@/components/nextlab/sms-api-settings';
import { formatDateTime } from '@/lib/utils/format';

export default async function Page() {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const view = await getProgramSmsSettingsView(ctx.programId);
  const { data: logs } = await createAdminClient()
    .from('program_sms_access_log')
    .select('id, action, detail, created_at, actor_id')
    .eq('program_id', ctx.programId)
    .order('created_at', { ascending: false })
    .limit(30);
  const actorIds = Array.from(new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean))) as string[];
  const { data: actors } = actorIds.length
    ? await createAdminClient().from('users').select('id, name').in('id', actorIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((actors ?? []).map((a) => [a.id, a.name]));

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">문자 API 설정 (행사별)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name} 의 문자 발송 자격증명입니다. 값은 저장 즉시 암호화되고 다시 표시되지 않습니다. 변경에는 비밀번호 재인증이 필요합니다.
        </p>
      </div>
      <SmsApiSettings view={view} />
      <section className="rounded-xl border bg-background p-4">
        <h2 className="text-base font-semibold">접근 이력 (최근 30건)</h2>
        <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
          {(logs ?? []).length === 0 && <li>이력이 없습니다.</li>}
          {(logs ?? []).map((l) => (
            <li key={l.id} className="flex flex-wrap gap-2">
              <span className="tabular-nums">{formatDateTime(l.created_at)}</span>
              <span className="font-medium text-foreground">{l.action}</span>
              <span>{l.actor_id ? (nameById.get(l.actor_id) ?? '알 수 없음') : '시스템'}</span>
              {l.detail ? <span className="truncate">{JSON.stringify(l.detail)}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
