import { getProgramSmsSettingsView } from '@/lib/sms/secrets';
import { createAdminClient } from '@/lib/supabase/admin';
import { SmsApiSettings } from '@/components/nextlab/sms-api-settings';
import { formatDateTime } from '@/lib/utils/format';

/** 접근 이력 action 코드 → 쉬운 말 */
const ACTION_LABELS: Record<string, string> = {
  set: '최초 등록',
  rotate: '키 교체',
  disable: '비활성화',
  test_send: '테스트 발송',
  send_use: '문자 발송에 사용',
  decrypt_fail: '복호화 실패',
  reauth_fail: '비밀번호 재인증 실패',
  reveal_hint: '앞자리 확인',
};

/**
 * 운영 설정 > 관리 > [문자 API] 탭 (2026-09-30) — 구 `/nextlab/settings/sms-api` 별도 페이지를 설정 탭 안으로.
 * 서버 컴포넌트: 등록 상태(평문 없음)와 접근 이력 30건만 읽어 클라이언트 폼에 직렬화 가능한 값으로 넘긴다.
 */
export async function SmsApiSection({ programId, programName }: { programId: string; programName: string }) {
  const admin = createAdminClient();
  const [view, { data: logs }] = await Promise.all([
    getProgramSmsSettingsView(programId),
    admin
      .from('program_sms_access_log')
      .select('id, action, detail, created_at, actor_id')
      .eq('program_id', programId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  const actorIds = Array.from(new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean))) as string[];
  const { data: actors } = actorIds.length
    ? await admin.from('users').select('id, name').in('id', actorIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((actors ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">문자 API 설정 (행사별)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {programName} 에서 보내는 모든 문자(로그인 안내·리마인더·알림·독려)가 여기 등록한 <b>솔라피(SOLAPI)</b> 계정과 발신번호로 나갑니다.
          등록하지 않으면 플랫폼 기본 발신번호로 발송됩니다.
        </p>
      </div>
      <SmsApiSettings view={view} />
      <details className="rounded-xl border bg-background p-4">
        <summary className="cursor-pointer text-sm font-semibold">접근 이력 (최근 30건)</summary>
        <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
          {(logs ?? []).length === 0 && <li>이력이 없습니다.</li>}
          {(logs ?? []).map((l) => (
            <li key={l.id} className="flex flex-wrap gap-2">
              <span className="tabular-nums">{formatDateTime(l.created_at)}</span>
              <span className="font-medium text-foreground">{ACTION_LABELS[l.action] ?? l.action}</span>
              <span>{l.actor_id ? (nameById.get(l.actor_id) ?? '알 수 없음') : '시스템'}</span>
              {l.detail ? <span className="truncate">{JSON.stringify(l.detail)}</span> : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
