import Link from 'next/link';

import { requirePlatformAdmin } from '@/lib/auth/guards';
import { searchPlatformUsers } from '@/lib/platform/data';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import { PlatformUserActions } from '@/components/platform/user-actions';
import { formatDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const ROLES: UserRole[] = ['nextlab', 'institution', 'mentor', 'mentee'];

/** 계정 통합 조회 — 전 행사 계정 검색·비밀번호 재발급·활성화·행사 소속 */
export default async function Page({ searchParams }: { searchParams: { q?: string; role?: string; program?: string; membership?: string; inactive?: string } }) {
  const me = await requirePlatformAdmin();
  const role = ROLES.includes(searchParams.role as UserRole) ? (searchParams.role as UserRole) : '';
  const { rows, total, programs } = await searchPlatformUsers({ q: searchParams.q, role, programId: searchParams.program, membership: searchParams.membership === 'none' ? 'none' : '', inactiveOnly: searchParams.inactive === '1' });
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">계정 통합 조회</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          모든 행사의 계정을 한 곳에서 찾습니다. 계정 발급 자체는 각 행사의 운영사 회원관리(또는 행사 관리의 스태프 발급)에서 하고, 여기서는 찾기·비밀번호 재발급·활성화·행사 소속을 다룹니다.
        </p>
      </div>

      <form className="grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-6" method="get">
        <input name="q" defaultValue={searchParams.q ?? ''} placeholder="이름 · 이메일 · 휴대폰" className="h-9 rounded-md border bg-background px-2 text-sm sm:col-span-2" />
        <select name="role" defaultValue={role} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">모든 역할</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <select name="program" defaultValue={searchParams.program ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">모든 행사</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.status !== 'active' ? ' (종료)' : ''}</option>
          ))}
        </select>
        <select name="membership" defaultValue={searchParams.membership ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">소속 무관</option>
          <option value="none">행사 소속 없음</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="inactive" value="1" defaultChecked={searchParams.inactive === '1'} /> 비활성만</label>
          <button type="submit" className="ml-auto h-9 rounded-md bg-violet-600 px-3 text-sm font-semibold text-white hover:bg-violet-700">검색</button>
        </div>
      </form>

      <p className="text-xs text-muted-foreground">
        조건에 맞는 계정 {total}건{rows.length < total ? ` 중 최근 ${rows.length}건 표시 (검색어로 좁히세요)` : ''}. 플랫폼 관리자 지정·해제는 <Link href="/platform/admins" className="text-violet-700 underline">플랫폼 관리자</Link> 탭.
      </p>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">계정</th>
              <th className="px-3 py-2">역할</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">가입 / 활성화</th>
              <th className="px-3 py-2">행사 소속 · 조치</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">조건에 맞는 계정이 없습니다.</td></tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className={`border-b align-top last:border-0 ${!u.is_active ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2">
                  <p className="font-medium">
                    {u.name}
                    {u.is_platform_admin && <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">플랫폼 관리자</span>}
                    {u.id === me.id && <span className="ml-1 text-[10px] text-muted-foreground">(나)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{u.email ?? '-'}{u.phone ? ` · ${u.phone}` : ''}</p>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{ROLE_LABELS[u.role]}</span>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">기본 역할 · 행사별 역할은 오른쪽</p>
                </td>
                <td className="px-3 py-2 text-xs">
                  {u.is_active ? <span className="text-emerald-700">활성</span> : <span className="font-semibold text-destructive">비활성</span>}
                  {u.must_change_password && <p className="text-[11px] text-amber-700">임시 비밀번호 상태</p>}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                  {formatDate(u.created_at)}<br />{u.activated_at ? formatDate(u.activated_at) : <span className="text-amber-700">미활성화(첫 로그인 전)</span>}
                </td>
                <td className="px-3 py-2">
                  <PlatformUserActions userId={u.id} isActive={u.is_active} isSelf={u.id === me.id} isPlatformAdmin={u.is_platform_admin} memberOf={u.programs.map((p) => ({ id: p.id, role: p.role }))} programs={programs} defaultRole={u.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
