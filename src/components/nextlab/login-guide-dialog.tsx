'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquareText, RotateCcw } from 'lucide-react';

import { getLoginGuidePreviewAction, sendLoginGuideAction, type LoginGuidePreviewResult } from '@/lib/auth/member-actions';
import {
  LMS_BYTE_LIMIT,
  LOGIN_GUIDE_SKIP_LABELS,
  LOGIN_GUIDE_TEMPLATE_MAX,
  SMS_BYTE_LIMIT,
  defaultLoginGuideTemplate,
  fieldsForRole,
  loginGuideFieldValue,
  renderLoginGuide,
  smsByteLength,
  smsKind,
  validateLoginGuideTemplate,
  type LoginGuideRecipient,
  type LoginGuideRole,
  type LoginGuideSkip,
} from '@/lib/sms/login-guide-template';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STORAGE_KEY = (role: LoginGuideRole) => `modu:login-guide-template:${role}`;

function readSaved(role: LoginGuideRole): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY(role));
  } catch {
    return null;
  }
}

function writeSaved(role: LoginGuideRole, template: string): void {
  try {
    if (template.trim() === defaultLoginGuideTemplate(role).trim()) window.localStorage.removeItem(STORAGE_KEY(role));
    else window.localStorage.setItem(STORAGE_KEY(role), template);
  } catch {
    /* 저장 불가(사생활 보호 모드 등) — 무시 */
  }
}

/**
 * 로그인 안내 문자 미리보기·발송 다이얼로그 (회원 명단 멘토/멘티 탭).
 * 템플릿 편집(자동화 필드 칩 → 커서 위치에 삽입) + 수신자별 미리보기 + 제외 인원 안내.
 * 미리보기와 서버 발송은 같은 렌더 함수(`renderLoginGuide`)를 쓴다.
 */
export function LoginGuideDialog({
  open,
  onOpenChange,
  userIds,
  role,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userIds: string[];
  role: LoginGuideRole;
  onSent: () => void;
}) {
  const [data, setData] = useState<LoginGuidePreviewResult | null>(null);
  const [template, setTemplate] = useState(() => defaultLoginGuideTemplate(role));
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const router = useRouter();
  const idsKey = userIds.join(',');

  // 열릴 때: 저장된 템플릿 복원 + 서버에서 수신자 치환 데이터 조회
  useEffect(() => {
    if (!open) return;
    setTemplate(readSaved(role) ?? defaultLoginGuideTemplate(role));
    setData(null);
    let alive = true;
    getLoginGuidePreviewAction(idsKey ? idsKey.split(',') : [])
      .then((r) => {
        if (!alive) return;
        setData(r);
        if (r.ok) setPreviewId((r.recipients.find((x) => x.skip === null) ?? r.recipients[0])?.id ?? null);
      })
      .catch(() => {
        if (alive) setData({ ok: false, error: '미리보기 정보를 불러오지 못했습니다. 잠시 후 다시 시도하세요.' });
      });
    return () => {
      alive = false;
    };
  }, [open, idsKey, role]);

  const recipients: LoginGuideRecipient[] = useMemo(() => (data?.ok ? data.recipients : []), [data]);
  const context = data?.ok ? data.context : null;
  const sendable = recipients.filter((r) => r.skip === null);
  const skippedBy = useMemo(() => {
    const m = new Map<LoginGuideSkip, string[]>();
    for (const r of recipients) if (r.skip) (m.get(r.skip) ?? m.set(r.skip, []).get(r.skip)!).push(r.name);
    return m;
  }, [recipients]);
  const notMember = data?.ok ? userIds.length - recipients.length : 0;
  const invalid = validateLoginGuideTemplate(template);
  const previewRecipient = recipients.find((r) => r.id === previewId) ?? sendable[0] ?? recipients[0] ?? null;
  const previewText = previewRecipient && context && !invalid ? renderLoginGuide(template, previewRecipient, context) : '';
  const previewBytes = smsByteLength(previewText);
  // 전체 발송 대상의 SMS/LMS 분포 — 이름·멘티 수에 따라 길이가 달라진다
  const kindCounts = useMemo(() => {
    const c = { SMS: 0, LMS: 0, TOO_LONG: 0 };
    if (!context || invalid) return c;
    for (const r of sendable) c[smsKind(renderLoginGuide(template, r, context))] += 1;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, context, invalid, recipients]);
  const fields = fieldsForRole(role);

  const insertField = (key: string) => {
    const token = `{${key}}`;
    const el = textRef.current;
    const start = el ? el.selectionStart : template.length;
    const end = el ? el.selectionEnd : template.length;
    const next = template.slice(0, start) + token + template.slice(end);
    setTemplate(next);
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const send = () => {
    if (invalid || sendable.length === 0 || kindCounts.TOO_LONG > 0) return;
    const fd = new FormData();
    fd.set('userIds', JSON.stringify(userIds));
    fd.set('template', template);
    startTransition(async () => {
      try {
        const r = await sendLoginGuideAction(undefined, fd);
        if (r?.ok) {
          writeSaved(role, template);
          toast({ title: r.message });
          onSent();
          onOpenChange(false);
          router.refresh();
        } else {
          toast({ title: r?.ok === false ? r.error : '발송에 실패했습니다.', variant: 'destructive' });
        }
      } catch {
        toast({ title: '발송 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.', variant: 'destructive' });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" /> 로그인 안내 문자 미리보기 · 발송
          </DialogTitle>
          <DialogDescription className="text-left">
            문구를 고치고 받는 사람별 실제 문자를 확인한 뒤 발송하세요. 자동화 필드를 누르면 커서 위치에 들어갑니다.
          </DialogDescription>
        </DialogHeader>

        {!data && <p className="py-8 text-center text-sm text-muted-foreground">받는 사람 정보를 불러오는 중…</p>}
        {data && !data.ok && <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{data.error}</p>}

        {data?.ok && context && (
          <div className="flex flex-col gap-4">
            {/* 발송 인원 요약 */}
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <b>발송 {sendable.length}명</b>
              {Array.from(skippedBy, ([k, names]) => (
                <span key={k} className="text-xs text-muted-foreground" title={names.join(', ')}>
                  · 제외 {LOGIN_GUIDE_SKIP_LABELS[k]} {names.length}명
                </span>
              ))}
              {notMember > 0 && <span className="text-xs text-muted-foreground">· 제외 이 행사 소속 아님 {notMember}명</span>}
              {sendable.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  SMS {kindCounts.SMS}건 · LMS {kindCounts.LMS}건{kindCounts.TOO_LONG ? <b className="text-destructive"> · 한도 초과 {kindCounts.TOO_LONG}건</b> : null}
                </span>
              )}
            </div>
            {skippedBy.size > 0 && (
              <details className="-mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">제외되는 회원 보기</summary>
                <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                  {Array.from(skippedBy, ([k, names]) => (
                    <li key={k}>{LOGIN_GUIDE_SKIP_LABELS[k]}: {names.join(', ')}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {/* 템플릿 편집 */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="login-guide-template" className="text-sm font-semibold">문자 내용 (템플릿)</label>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
                    onClick={() => setTemplate(defaultLoginGuideTemplate(role))}
                  >
                    <RotateCcw className="h-3 w-3" /> 기본 문구로 복원
                  </button>
                </div>
                <textarea
                  id="login-guide-template"
                  ref={textRef}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={9}
                  maxLength={LOGIN_GUIDE_TEMPLATE_MAX + 200}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-base leading-relaxed sm:text-sm"
                />
                <div className="flex flex-wrap gap-1.5">
                  {fields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => insertField(f.key)}
                      title={`{${f.key}} — ${f.desc}`}
                      className="rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      + {f.label}
                    </button>
                  ))}
                </div>
                <p className={cn('text-xs', invalid ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                  {invalid ?? `${template.trim().length} / ${LOGIN_GUIDE_TEMPLATE_MAX}자 · 이 기기에 마지막으로 보낸 문구가 저장됩니다.`}
                </p>
              </div>

              {/* 미리보기 */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="login-guide-preview-who" className="text-sm font-semibold">미리보기</label>
                  <select
                    id="login-guide-preview-who"
                    value={previewRecipient?.id ?? ''}
                    onChange={(e) => setPreviewId(e.target.value)}
                    className="h-10 max-w-[60%] rounded-md border border-input bg-background px-2 text-base sm:h-8 sm:text-xs"
                  >
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.skip ? ` (제외: ${LOGIN_GUIDE_SKIP_LABELS[r.skip]})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-h-[12rem] whitespace-pre-wrap break-words rounded-2xl border bg-muted/40 px-4 py-3 text-sm leading-relaxed">
                  {previewText || <span className="text-muted-foreground">{invalid ? '템플릿 오류를 먼저 고쳐 주세요.' : '미리볼 회원이 없습니다.'}</span>}
                </div>
                {previewText && (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{previewText.length}자 · 약 {previewBytes}바이트</span>
                    <Badge variant={smsKind(previewText) === 'SMS' ? 'secondary' : 'outline'} className="text-[10px]">
                      {smsKind(previewText) === 'SMS' ? 'SMS' : smsKind(previewText) === 'LMS' ? 'LMS(장문)' : '한도 초과'}
                    </Badge>
                    <span>{SMS_BYTE_LIMIT}바이트(한글 약 45자)를 넘으면 장문(LMS)으로 발송됩니다 · 최대 {LMS_BYTE_LIMIT.toLocaleString()}바이트</span>
                  </p>
                )}
                {previewRecipient?.skip && (
                  <p className="text-xs text-amber-700">이 회원은 {LOGIN_GUIDE_SKIP_LABELS[previewRecipient.skip]} 이라 발송되지 않습니다.</p>
                )}
              </div>
            </div>

            {/* 자동화 필드 범례 */}
            <details className="rounded-md border" open>
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">자동화 필드 안내</summary>
              <div className="overflow-x-auto border-t">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-1.5 font-semibold">필드</th>
                      <th className="px-3 py-1.5 font-semibold">의미</th>
                      <th className="px-3 py-1.5 font-semibold">예시값{previewRecipient ? ` (${previewRecipient.name})` : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => {
                      const v = previewRecipient ? loginGuideFieldValue(f.key, previewRecipient, context) : f.sample;
                      return (
                        <tr key={f.key} className="border-t align-top">
                          <td className="whitespace-nowrap px-3 py-1.5">
                            <button type="button" onClick={() => insertField(f.key)} className="font-mono text-primary hover:underline" title="커서 위치에 넣기">
                              {`{${f.key}}`}
                            </button>
                          </td>
                          <td className="px-3 py-1.5">{f.label} — <span className="text-muted-foreground">{f.desc}</span></td>
                          <td className="px-3 py-1.5 text-muted-foreground">{v || <i>{f.blankWhenEmpty ? '(값 없음 — 빈칸)' : '(값 없음 — "-")'}{f.optional ? ' · 이 필드만 있는 줄은 생략' : ''}</i>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            취소
          </Button>
          <Button type="button" onClick={send} disabled={pending || !data?.ok || !!invalid || sendable.length === 0 || kindCounts.TOO_LONG > 0}>
            {pending ? '발송 중…' : `${sendable.length}명에게 발송`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
