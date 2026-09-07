'use client';

import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';

import type { SolapiMessage } from '@/lib/notifications/solapi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  institution: '발주처',
  nextlab: '운영사',
  mentor: '멘토',
  mentee: '멘티기업',
};

export interface SmsRecipientLite {
  name: string;
  phone: string;
  role: string;
  businessName?: string | null;
}

/** 전화번호를 숫자만 남긴 표준형으로 (국가코드 82 → 0) */
function normPhone(raw: string | null | undefined): string {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('82')) d = '0' + d.slice(2);
  return d;
}

function dateLabel(iso: string): string {
  const day = iso.slice(0, 10);
  return day ? day.replace(/-/g, '.') : '날짜 미상';
}

function timeLabel(iso: string): string {
  return iso ? iso.replace('T', ' ').slice(0, 16) : '-';
}

interface BatchRecipient {
  to: string;
  status: string;
  member?: SmsRecipientLite;
}
interface Batch {
  key: string;
  date: string;
  dateReceived: string;
  from: string;
  text: string;
  recipients: BatchRecipient[];
}

/**
 * 문자발송 현황 — 동일 내용으로 일괄발송된 건을 한 줄로 묶어 보여준다.
 * 각 행: 발송일시 · 발송번호 · 내용 · 수신 인원수 · [수신인 보기].
 * '수신인 보기'는 구분(회원등급)·성명·연락처·비고(멘티=기업명)를 팝업으로 표시한다.
 */
export function SmsSendList({
  messages,
  recipients = [],
}: {
  messages: SolapiMessage[];
  recipients?: SmsRecipientLite[];
}) {
  const [membersOnly, setMembersOnly] = useState(true);
  const [openBatch, setOpenBatch] = useState<Batch | null>(null);

  const memberByPhone = useMemo(() => {
    const map = new Map<string, SmsRecipientLite>();
    for (const r of recipients) {
      const n = normPhone(r.phone);
      if (n) {
        map.set(n, r);
        if (n.length >= 8) map.set(n.slice(-8), r);
      }
    }
    return map;
  }, [recipients]);

  function memberFor(to: string): SmsRecipientLite | undefined {
    const n = normPhone(to);
    return memberByPhone.get(n) ?? (n.length >= 8 ? memberByPhone.get(n.slice(-8)) : undefined);
  }

  // 필터 → 동일내용 시간창(버스트) 묶기 → 날짜별 그룹
  const dateGroups = useMemo(() => {
    const filtered = membersOnly
      ? messages.filter((m) => memberFor(m.to) !== undefined)
      : messages;

    // 같은 발신번호·같은 내용을 30분 이내 연속 발송하면 하나의 발송건으로 묶는다.
    // (건별로 개별 발송돼 groupId 가 제각각인 알림 문자도 한 줄로 합쳐진다.)
    const WINDOW_MS = 30 * 60 * 1000;
    const toMs = (s: string): number => {
      const t = Date.parse(s.replace(' ', 'T'));
      return Number.isNaN(t) ? 0 : t;
    };
    const sorted = filtered.slice().sort((a, b) => (a.dateReceived < b.dateReceived ? -1 : 1));
    const batches: Batch[] = [];
    const openByKey = new Map<string, { batch: Batch; lastMs: number }>();
    for (const m of sorted) {
      const key = `${m.from}|${m.text}`;
      const t = toMs(m.dateReceived);
      const open = openByKey.get(key);
      const recipient = { to: m.to, status: m.status, member: memberFor(m.to) };
      if (open && t - open.lastMs <= WINDOW_MS) {
        open.batch.recipients.push(recipient);
        open.lastMs = t;
        if (m.dateReceived > open.batch.dateReceived) {
          open.batch.dateReceived = m.dateReceived;
          open.batch.date = m.dateReceived.slice(0, 10);
        }
      } else {
        const b: Batch = {
          key: `${key}|${m.messageId}`,
          date: m.dateReceived.slice(0, 10),
          dateReceived: m.dateReceived,
          from: m.from,
          text: m.text,
          recipients: [recipient],
        };
        batches.push(b);
        openByKey.set(key, { batch: b, lastMs: t });
      }
    }

    const byDate = new Map<string, Batch[]>();
    for (const b of batches) {
      const list = byDate.get(b.date) ?? [];
      list.push(b);
      byDate.set(b.date, list);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, batches]) => ({
        date,
        batches: batches.sort((x, y) => (x.dateReceived < y.dateReceived ? 1 : -1)),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, membersOnly, memberByPhone]);

  const totalBatches = dateGroups.reduce((n, g) => n + g.batches.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {membersOnly ? '회원(등록 휴대폰) 대상' : '전체'} 발송 {totalBatches}건(동일내용 묶음) ·
          날짜별
        </p>
        <div className="flex rounded-lg border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMembersOnly(true)}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium transition-colors',
              membersOnly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            회원만
          </button>
          <button
            type="button"
            onClick={() => setMembersOnly(false)}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium transition-colors',
              !membersOnly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            전체
          </button>
        </div>
      </div>

      {totalBatches === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {membersOnly ? '회원에게 발송된 내역이 없습니다.' : '발송 내역이 없습니다.'}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {dateGroups.map((g) => (
            <div key={g.date} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
                  {dateLabel(g.date)}
                </span>
                <span className="text-xs text-muted-foreground">{g.batches.length}건</span>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">발송일시</th>
                      <th className="px-3 py-2 font-medium">발송번호</th>
                      <th className="px-3 py-2 font-medium">문자내용</th>
                      <th className="px-3 py-2 text-center font-medium">수신 인원</th>
                      <th className="px-3 py-2 font-medium">수신인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.batches.map((b) => (
                      <tr key={b.key} className="border-b align-top last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {timeLabel(b.dateReceived)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                          {b.from}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          <span className="line-clamp-2">{b.text}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center">
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            {b.recipients.length}명
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setOpenBatch(b)}
                          >
                            <Users className="h-3.5 w-3.5" />
                            수신인 보기
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 수신인 목록 팝업 */}
      <Dialog open={!!openBatch} onOpenChange={(o) => !o && setOpenBatch(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>수신인 목록 ({openBatch?.recipients.length ?? 0}명)</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {timeLabel(openBatch?.dateReceived ?? '')} · {openBatch?.text}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">구분</th>
                  <th className="px-3 py-2 font-medium">성명</th>
                  <th className="px-3 py-2 font-medium">연락처</th>
                  <th className="px-3 py-2 font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {openBatch?.recipients.map((r, i) => {
                  const failed = r.status === 'FAILED' || r.status === 'CANCELED';
                  return (
                    <tr key={`${r.to}-${i}`} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.member ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {ROLE_LABEL[r.member.role] ?? r.member.role}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">비회원</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {r.member?.name ?? '-'}
                        {failed && (
                          <span className="ml-1.5 text-xs font-normal text-status-rejected">
                            (발송실패)
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                        {r.to}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.member?.role === 'mentee' ? r.member.businessName ?? '-' : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
