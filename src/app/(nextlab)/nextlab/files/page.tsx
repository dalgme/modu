import Link from 'next/link';
import { FileText, Lock, ReceiptText, Unlock } from 'lucide-react';

import { requireNextlab } from '@/lib/auth/guards';
import { hasCapability } from '@/lib/auth/capabilities';
import { requireContext } from '@/lib/programs/context';
import { listMyGroups } from '@/lib/programs/data';
import { isRosterActive, listProgramMembers } from '@/lib/data/members';
import { parseFilePolicy } from '@/lib/files/business-plan-shared';
import { loadRoundBusinessPlans } from '@/lib/files/business-plans';
import { listMentorPaymentFiles } from '@/lib/files/mentor-payment';
import { BusinessPlanManager } from '@/components/files/business-plan-manager';
import { MentorPaymentManager, type MentorPaymentRowView } from '@/components/files/mentor-payment-files';
import { RoundPicker } from '@/components/files/round-picker';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const MENUS = [
  { key: 'plans', label: '멘티 사업계획서', desc: '파일명 맨 앞 멘티명으로 자동 귀속', icon: FileText },
  { key: 'payment', label: '멘토 지급서류', desc: '멘토별 지급증빙 2~4종 · 모든 라운드 공통', icon: ReceiptText },
] as const;
type MenuKey = (typeof MENUS)[number]['key'];

/**
 * 파일 관리 (2026-09-30) — 라운드(범위 스위처의 사업그룹)별로 멘티 사업계획서·멘토 지급서류를 일괄 업로드한다.
 *  - 멘티 사업계획서: `case.manage` 권한으로 업로드·삭제, 멘토는 케이스 화면에서 미리보기(다운로드는 운영 설정 [파일 보안])
 *  - 멘토 지급서류: `mentors.docs` 권한으로 등록·교체·삭제·열람. 행사 단위 저장이라 라운드를 바꿔도 같은 파일
 */
export default async function Page({ searchParams }: { searchParams: { menu?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const menu = (MENUS.find((m) => m.key === searchParams.menu)?.key ?? 'plans') as MenuKey;
  const groupId = ctx.supportTypeId;
  const roundName = ctx.group?.name ?? '';

  let body: React.ReactNode = null;
  if (!groupId) {
    const groups = await listMyGroups(ctx.programId, { id: profile.id, role: ctx.role, isPlatformAdmin: false });
    body = <RoundPicker groups={groups.map((g) => ({ id: g.group.id, code: g.group.code, name: g.group.name, caseCount: g.caseCount, ended: g.group.status !== 'active' }))} />;
  } else if (menu === 'plans') {
    const { rows, candidates } = await loadRoundBusinessPlans(ctx.programId, groupId);
    const allowDownload = parseFilePolicy(ctx.program.file_policy).businessPlanDownload;
    body = (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border-2 border-sky-300 bg-sky-50/70 px-4 py-3 text-sm leading-relaxed text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
          <p className="text-base font-bold">파일명 맨 앞에 멘티 이름을 적어 주세요</p>
          <p className="mt-1">
            예) <code className="rounded bg-white/70 px-1 dark:bg-black/30">홍길동_사업계획서.pdf</code> · <code className="rounded bg-white/70 px-1 dark:bg-black/30">홍길동-참고자료.hwp</code> ·{' '}
            <code className="rounded bg-white/70 px-1 dark:bg-black/30">[홍길동] 사업계획서.docx</code> — 이름 뒤에는 <b>_ - 공백 괄호</b> 중 하나로 구분합니다. 이 라운드({roundName}) 멘티 이름과 맞는 파일만 그 멘티에게 저장되고, 맞지 않는 파일은 저장하지 않고 사유를 알려 드립니다.
          </p>
          <p className="mt-1 text-xs">
            <b>동명이인</b>은 이름 바로 뒤에 고유번호나 닉네임을 적어 구분하세요 — 예) <code className="rounded bg-white/70 px-1 dark:bg-black/30">홍길동(A-012)_사업계획서.pdf</code>. 규칙대로 적기 어려운 파일은 표의 멘티 행 [업로드]로 올리면 됩니다.
          </p>
        </div>
        <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm', allowDownload ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30')}>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            {allowDownload ? <Unlock className="h-4 w-4 text-amber-600" /> : <Lock className="h-4 w-4 text-emerald-600" />}
            멘토 화면: {allowDownload ? '미리보기 + 다운로드·인쇄 허용' : '미리보기만 (인쇄·다운로드 차단)'}
          </span>
          <Link href="/nextlab/settings?tab=files" className="text-xs font-semibold underline underline-offset-2">
            운영 설정 › 파일 보안에서 변경
          </Link>
        </div>
        <BusinessPlanManager rows={rows} candidates={candidates} canEdit={hasCapability(ctx, 'case.manage')} roundName={roundName} />
      </div>
    );
  } else {
    // 라운드 멘토 = 그룹 지정 규칙상 이 라운드 후보이거나 이 라운드에 배정이 있는 멘토 (회원 명단 멘토 탭과 같은 로더)
    const members = (await listProgramMembers(ctx.programId, groupId)).filter((m) => m.role === 'mentor' && isRosterActive(m));
    const files = await listMentorPaymentFiles(ctx.programId, members.map((m) => m.id));
    const rows: MentorPaymentRowView[] = members.map((m) => ({
      mentorId: m.id,
      name: m.name,
      assignedCount: m.assignedCount,
      organization: m.organization,
      position: m.position,
      phone: m.phone,
      email: m.email,
      files: files[m.id] ?? [],
    }));
    const canDocs = hasCapability(ctx, 'mentors.docs');
    body = (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border-2 border-sky-300 bg-sky-50/70 px-4 py-3 text-sm leading-relaxed text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
          <p className="text-base font-bold">멘토별 지급증빙 서류(이력서·통장사본·신분증사본 등 2~4종)를 한 번에 등록하세요</p>
          <p className="mt-1">
            [업로드]에서 여러 파일을 함께 올리면 버튼이 <b>[첨부 파일(N개)]</b>로 바뀌고, 누르면 PDF·이미지를 <b>하나의 PDF</b>로 합쳐 미리 봅니다. 한 번 등록한 서류는 <b>모든 라운드에서 공통</b>으로 쓰이며, 팝업에서 파일 추가·교체·삭제·순서 변경을 할 수 있습니다. 발주처도 멘토별로 확인·저장할 수 있습니다.
          </p>
        </div>
        {!canDocs && <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">현재 등급에는 &apos;멘토 지급서류·평가&apos; 권한이 없어 등록 현황만 볼 수 있습니다.</p>}
        <MentorPaymentManager rows={rows} canEdit={canDocs} canView={canDocs} />
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">파일 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <b>{ctx.program.name}</b>
          {ctx.group ? ` · ${ctx.group.name}` : ''} — 라운드별로 멘티 사업계획서와 멘토 지급서류를 여러 개씩 한 번에 올립니다. 라운드는 상단 범위에서 바꿉니다.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
        {/* 폰·태블릿: 위쪽 가로 알약 / 데스크톱: 왼쪽 세로 메뉴 */}
        <nav className="no-scrollbar flex h-fit flex-row gap-1 overflow-x-auto rounded-xl border bg-background p-2 lg:flex-col" aria-label="파일 관리 메뉴">
          {MENUS.map((m) => {
            const Icon = m.icon;
            const active = m.key === menu;
            return (
              <Link
                key={m.key}
                href={`/nextlab/files?menu=${m.key}`}
                aria-current={active ? 'page' : undefined}
                className={cn('flex shrink-0 items-start gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold lg:whitespace-normal', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex flex-col">
                  <span>{m.label}</span>
                  <span className={cn('hidden text-[11px] font-normal lg:block', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{m.desc}</span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0">{body}</div>
      </div>
    </main>
  );
}
