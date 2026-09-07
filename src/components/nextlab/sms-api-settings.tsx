'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Send, ShieldCheck, ShieldOff } from 'lucide-react';

import type { SmsSettingsView } from '@/lib/sms/secrets';
import { disableSmsCredentialsAction, saveSmsCredentialsAction, testSmsAction } from '@/lib/sms/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

export function SmsApiSettings({ view }: { view: SmsSettingsView }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!view.configured);

  const submit = (fd: FormData) =>
    start(async () => {
      const r = await saveSmsCredentialsAction(fd);
      toast(r.ok ? { title: r.message ?? '저장했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) setEditing(false);
    });

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            {view.configured ? (
              <p className="flex items-center gap-2">
                {view.isActive ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldOff className="h-5 w-5 text-muted-foreground" />}
                <span>
                  솔라피 · API 키 <b>{view.apiKeyHint}…</b> · 발신번호 <b>…{view.senderHint}</b>
                  {view.isActive ? '' : ' (비활성 — 플랫폼 기본 사용)'}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">행사 문자 API 가 등록되지 않았습니다. {view.platformFallback ? '플랫폼 기본 발신번호로 발송됩니다.' : '문자가 발송되지 않습니다.'}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {view.verifiedAt ? `테스트 발송 확인: ${formatDateTime(view.verifiedAt)}` : '테스트 발송 미확인'}
              {view.rotatedAt ? ` · 마지막 변경: ${formatDateTime(view.rotatedAt)}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {view.configured && view.isActive && (
              <Button variant="outline" size="sm" disabled={pending} className="gap-1" onClick={() => start(async () => { const r = await testSmsAction(); toast(r.ok ? { title: r.message ?? '발송' } : { title: r.error, variant: 'destructive' }); })}>
                <Send className="h-4 w-4" /> 내 휴대폰으로 테스트
              </Button>
            )}
            <Button size="sm" variant={editing ? 'ghost' : 'default'} onClick={() => setEditing(!editing)} className="gap-1">
              <KeyRound className="h-4 w-4" /> {view.configured ? '키 교체' : '등록'}
            </Button>
          </div>
        </div>
        {!view.kekConfigured && (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            서버에 암호화 키(SMS_KEK)가 설정되지 않아 행사별 자격증명을 저장할 수 없습니다. 플랫폼 관리자가 환경변수를 넣어야 합니다.
          </p>
        )}
      </section>

      {editing && (
        <form action={submit} className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-background p-4" autoComplete="off">
          <p className="text-sm font-semibold">{view.configured ? 'API 키 교체' : 'API 키 등록'}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="apiKey">API Key</Label>
              <Input id="apiKey" name="apiKey" required autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="apiSecret">API Secret</Label>
              <Input id="apiSecret" name="apiSecret" type="password" required autoComplete="new-password" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="senderNumber">발신번호 (사전 등록된 번호)</Label>
              <Input id="senderNumber" name="senderNumber" inputMode="numeric" placeholder="0212345678" required />
            </div>
          </div>
          <div className="flex flex-col gap-1 sm:max-w-xs">
            <Label htmlFor="password">내 비밀번호 (재인증)</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <p className="text-xs text-muted-foreground">
            저장 즉시 행사 전용 키로 암호화되어 DB 와 서버 어느 쪽 단독으로도 복호화할 수 없습니다. 화면에는 앞/뒤 4자리만 표시됩니다.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={pending}>취소</Button>
            <Button type="submit" disabled={pending || !view.kekConfigured}>{pending ? '저장 중…' : '암호화 저장'}</Button>
          </div>
        </form>
      )}

      {view.configured && view.isActive && (
        <form action={(fd) => start(async () => { const r = await disableSmsCredentialsAction(fd); toast(r.ok ? { title: r.message ?? '비활성화' } : { title: r.error, variant: 'destructive' }); })} className="flex flex-wrap items-end gap-2 rounded-xl border bg-background p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pw2" className="text-xs">비활성화 (플랫폼 기본으로 폴백) — 비밀번호</Label>
            <Input id="pw2" name="password" type="password" required autoComplete="current-password" className="max-w-xs" />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>비활성화</Button>
        </form>
      )}
    </div>
  );
}
