'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, LockOpen, Send } from 'lucide-react';

import { setMatchingPublishedAction } from '@/lib/matching/publish-actions';
import type { MatchingPublishGroup } from '@/lib/matching/publish-data';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * 운영 설정 › 매칭 공개 (P54) — 라운드(그룹)별 [매칭정보 감추기] ↔ [매칭정보 공개].
 * 감추기(기본) 동안 운영사는 매칭 작업을 하고, 공개하는 순간 멘토·멘티가 로그인하면 매칭 결과를 본다.
 */
export function MatchingPublishPanel({ groups, canEdit }: { groups: MatchingPublishGroup[]; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border-2 border-sky-300 bg-sky-50/70 p-5 dark:border-sky-800 dark:bg-sky-950/30">
        <h2 className="text-lg font-bold text-sky-950 dark:text-sky-100">매칭정보 공개 설정</h2>
        <p className="mt-1 text-sm leading-relaxed text-sky-950/80 dark:text-sky-100/80">
          라운드(사업그룹)마다 멘토·멘티 화면에 매칭 결과를 <b>언제 보여줄지</b> 정합니다. 매칭 작업 중에는 일부만 배정된 상태가 보여 혼란이 생기므로,
          <b> 감추기</b>로 두고 매칭을 끝낸 뒤 <b>한 번에 공개</b>하세요.
        </p>
        <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          {[
            ['1', '감추기 상태에서 매칭', '회원 명단 › 매칭 리스트에서 배정·변경. 멘토·멘티 화면에는 아무것도 보이지 않습니다.'],
            ['2', '매칭 현황 확인', '아래 박스의 미매칭 수가 0 인지, 멘토 배정이 맞는지 확인합니다.'],
            ['3', '[매칭정보 공개]', '누르는 즉시 그 라운드의 모든 멘토가 로그인하면 자기 멘티를 확인할 수 있습니다.'],
          ].map(([n, t, d]) => (
            <li key={n} className="flex gap-2 rounded-xl bg-background/80 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">{n}</span>
              <span>
                <b className="block">{t}</b>
                <span className="text-xs text-muted-foreground">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {groups.length === 0 && <p className="text-sm text-muted-foreground">사업그룹이 없습니다. [사업그룹·필수서류] 탭에서 먼저 개설하세요.</p>}
      {groups.map((g) => (
        <GroupPublishBox key={g.id} group={g} canEdit={canEdit} />
      ))}
      {!canEdit && <p className="text-xs text-muted-foreground">공개 전환은 &lsquo;멘토 배정·교체·매칭&rsquo; 권한이 있는 담당자만 할 수 있습니다.</p>}
    </div>
  );
}

function GroupPublishBox({ group: g, canEdit }: { group: MatchingPublishGroup; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const [notifyMentors, setNotifyMentors] = useState(true);
  const [notifyMentees, setNotifyMentees] = useState(false);
  const pct = g.mentees > 0 ? Math.round((g.matched / g.mentees) * 100) : 0;

  const run = async (published: boolean) => {
    const ok = await confirm(
      published
        ? {
            title: `${g.name} 매칭정보를 공개할까요?`,
            description: '공개하는 즉시 이 라운드의 멘토는 자기 멘티를, 멘티는 담당 멘토를 화면에서 확인합니다.',
            impact: [
              `매칭 완료 ${g.matched}명 · 매칭된 멘토 ${g.mentors}명에게 보입니다`,
              ...(g.unmatched > 0 ? [`아직 미매칭 ${g.unmatched}명 — 공개 후 배정하는 멘티는 배정 즉시 보입니다`] : []),
              notifyMentors ? `멘토 안내 문자: 아직 받지 않은 멘토 ${g.mentorsWithoutNotice}명에게 발송` : '멘토 안내 문자: 보내지 않음',
              notifyMentees ? `멘티 알림: 매칭된 멘티 ${g.matched}명에게 '담당 멘토 배정' 알림` : '멘티 알림: 보내지 않음',
            ],
            confirmLabel: '매칭정보 공개',
          }
        : {
            title: `${g.name} 매칭정보를 다시 감출까요?`,
            description: '멘토·멘티 화면에서 이 라운드의 매칭 결과가 보이지 않게 됩니다. 멘토는 회차 등록·보고서 업로드도 할 수 없습니다.',
            impact: g.casesWithRounds > 0 ? [`이미 회차가 등록된 멘티 ${g.casesWithRounds}명 — 진행 중인 멘토링이 화면에서 사라집니다`] : undefined,
            confirmLabel: '다시 감추기',
            severity: g.casesWithRounds > 0 ? 'danger' : 'normal',
          },
    );
    if (!ok) return;
    start(async () => {
      const r = await setMatchingPublishedAction({ groupId: g.id, published, notifyMentors: published && notifyMentors, notifyMentees: published && notifyMentees });
      toast(r.ok ? { title: r.message } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };

  return (
    <section
      className={cn(
        'rounded-2xl border-2 p-5 shadow-sm',
        g.published ? 'border-emerald-400 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20' : 'border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20',
        g.ended && 'opacity-70',
      )}
      aria-labelledby={`pub-${g.id}`}
    >
      {dialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{g.code}{g.ended ? ' · 종료된 그룹' : ''}</p>
          <h3 id={`pub-${g.id}`} className="text-xl font-bold">{g.name}</h3>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-bold',
            g.published ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white',
          )}
        >
          {g.published ? <LockOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          {g.published ? '매칭정보 공개 중' : '매칭정보 감추기 중'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['등록 멘티', g.mentees, ''],
          ['매칭 완료', g.matched, 'text-emerald-700 dark:text-emerald-300'],
          ['미매칭', g.unmatched, g.unmatched > 0 ? 'text-rose-600 dark:text-rose-300' : ''],
          ['매칭된 멘토', g.mentors, ''],
        ].map(([label, n, tone]) => (
          <div key={label as string} className="rounded-xl bg-background p-3 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('text-2xl font-bold tabular-nums', tone as string)}>{n as number}</p>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>매칭 진행률</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-background" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className={cn('h-full', g.published ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-background p-3 text-sm leading-relaxed">
        {g.published ? <Eye className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
        <span>
          {g.published ? (
            <>
              <b>지금 멘토·멘티에게 보입니다.</b> 멘토는 로그인하면 자기 멘티를, 멘티는 담당 멘토를 확인하고 회차를 진행합니다.
              {g.publishedAt && <span className="text-muted-foreground"> (공개: {formatDateTime(g.publishedAt)})</span>}
            </>
          ) : (
            <>
              <b>지금 멘토·멘티에게 보이지 않습니다.</b> 멘토 화면에는 이 라운드 멘티가 나타나지 않고, 멘티 화면에는 &ldquo;담당 멘토 배정 전&rdquo;으로 보입니다.
              배정 알림과 자동 안내 문자도 공개 전까지 보내지 않습니다. 운영사 화면(명단·매칭 리스트·리포트)에는 그대로 보입니다.
            </>
          )}
        </span>
      </p>

      {canEdit && (
        <div className="mt-4 flex flex-col gap-3 border-t pt-4">
          {!g.published && (
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={notifyMentors} onChange={(e) => setNotifyMentors(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" disabled={pending} />
                <span>
                  <b>공개와 함께 멘토에게 안내 문자 발송</b> — &ldquo;담당 멘티 배정이 확정되었습니다. 로그인해 확인해 주세요&rdquo; + 로그인 주소·아이디.
                  아직 받지 않은 멘토 <b>{g.mentorsWithoutNotice}명</b>에게만 1회 발송합니다.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={notifyMentees} onChange={(e) => setNotifyMentees(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" disabled={pending} />
                <span>
                  <b>멘티에게도 &lsquo;담당 멘토 배정&rsquo; 알림</b> — 매칭된 멘티 {g.matched}명 (문자 발송 › 자동발송 탭에서 꺼 둔 알림은 나가지 않습니다)
                </span>
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {g.published ? (
              <Button type="button" variant="outline" size="lg" className="gap-2 border-amber-500 text-amber-800 hover:bg-amber-50 dark:text-amber-200" disabled={pending} onClick={() => void run(false)}>
                <EyeOff className="h-5 w-5" /> 다시 감추기
              </Button>
            ) : (
              <Button type="button" size="lg" className="gap-2 bg-emerald-600 px-6 text-base font-bold text-white hover:bg-emerald-700" disabled={pending} onClick={() => void run(true)}>
                {notifyMentors ? <Send className="h-5 w-5" /> : <Eye className="h-5 w-5" />} 매칭정보 공개
              </Button>
            )}
            {!g.published && g.unmatched > 0 && <span className="text-sm font-semibold text-rose-600 dark:text-rose-300">미매칭 {g.unmatched}명이 남아 있습니다. 매칭을 마친 뒤 공개하는 것을 권장합니다.</span>}
            {pending && <span className="text-sm text-muted-foreground">처리 중…</span>}
          </div>
        </div>
      )}
    </section>
  );
}
