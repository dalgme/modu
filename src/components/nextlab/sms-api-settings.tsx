'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Circle, ExternalLink, KeyRound, Send, ShieldCheck, ShieldOff } from 'lucide-react';

import type { SmsSettingsView } from '@/lib/sms/secrets';
import { disableSmsCredentialsAction, saveSmsCredentialsAction, testSmsAction } from '@/lib/sms/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

const SOLAPI_HOME = 'https://solapi.com';
const SOLAPI_CONSOLE = 'https://console.solapi.com';

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary underline underline-offset-2">
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/** 솔라피 준비 4단계 — 처음 등록하는 담당자용 (2026-09-30) */
const PREP_STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: '솔라피 회원가입',
    body: (
      <>
        <Ext href={SOLAPI_HOME}>solapi.com</Ext> 에서 회원가입합니다. 문자 요금을 낼 기관(보통 운영사) 명의로 가입하세요. 가입 후 콘솔(
        <Ext href={SOLAPI_CONSOLE}>console.solapi.com</Ext>)에 로그인합니다.
      </>
    ),
  },
  {
    title: '발신번호 등록 (법으로 필수)',
    body: (
      <>
        콘솔 메뉴 <b>[발신번호 관리]</b> 에서 문자를 보낼 번호를 등록합니다. 휴대폰 번호는 본인 인증으로 바로 끝나고,
        사무실 전화·대표번호는 <b>통신서비스 이용증명원</b> 같은 서류 심사가 있어 1~3일 걸릴 수 있습니다.
        <span className="block text-muted-foreground">등록되지 않은 번호로는 문자가 나가지 않습니다(발신번호 사전등록제).</span>
      </>
    ),
  },
  {
    title: '잔액 충전',
    body: (
      <>
        솔라피는 <b>미리 충전한 금액</b>에서 문자 요금이 빠지는 방식입니다. 콘솔에서 충전해 두세요. 잔액이 없으면 발송이 실패합니다.
        <span className="block text-muted-foreground">짧은 문자(SMS)보다 긴 문자(LMS)가 비쌉니다. 정확한 단가는 솔라피 요금표를 확인하세요.</span>
      </>
    ),
  },
  {
    title: 'API Key 발급',
    body: (
      <>
        콘솔 메뉴 <b>[개발/연동] → [API Key 관리]</b> 에서 <b>새 API Key 만들기</b>를 누릅니다. 화면에 나온
        <b> API Key</b> 와 <b>API Secret</b> 두 값을 복사해 아래 칸에 붙여 넣습니다.
        <span className="block text-muted-foreground">API Secret 은 만들 때 한 번만 보여 주는 경우가 많으니 바로 복사하세요. 잃어버리면 새로 만들면 됩니다.</span>
        <span className="block text-muted-foreground">
          키 설정에 <b>허용 IP</b> 제한이 있다면 비워 두세요(모든 IP 허용). 이 플랫폼 서버는 IP 가 고정되어 있지 않아 제한을 걸면 발송이 막힙니다.
        </span>
      </>
    ),
  },
];

/** 입력 칸 설명 — 칸 이름 · 어디서 찾나 · 예시 */
const FIELD_HELP: { field: string; where: string; example: string }[] = [
  { field: 'API Key', where: '솔라피 콘솔 [개발/연동] → [API Key 관리]', example: 'NCSABCDEFGH12345 (영문 대문자·숫자, 보통 16자리)' },
  { field: 'API Secret', where: '같은 화면, API Key 옆의 긴 값', example: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 (보통 32자리)' },
  { field: '발신번호', where: '솔라피 콘솔 [발신번호 관리]에 등록·승인된 번호', example: '010-1234-5678 또는 02-123-4567 (하이픈 있어도 됨)' },
  { field: '내 비밀번호', where: '지금 이 플랫폼에 로그인한 비밀번호', example: '보안을 위해 한 번 더 확인합니다 (솔라피 비밀번호 아님)' },
];

/** 자주 막히는 경우 */
const TROUBLES: { symptom: string; fix: string }[] = [
  { symptom: '“API 키/시크릿 형식이 올바르지 않습니다”', fix: '복사할 때 앞뒤 공백이나 일부 글자가 빠졌는지 확인하고 다시 붙여 넣으세요.' },
  { symptom: '테스트 발송 실패 — 인증 오류', fix: 'API Key 와 Secret 이 서로 다른 키의 값이 섞였을 수 있습니다. 솔라피에서 키를 새로 만들어 두 값을 함께 교체하세요.' },
  { symptom: '테스트 발송 실패 — 발신번호 관련', fix: '솔라피 [발신번호 관리]에서 그 번호가 “승인 완료”인지 확인하세요. 심사 중이면 승인 후 다시 테스트합니다.' },
  { symptom: '테스트 발송 실패 — 잔액·IP 관련', fix: '솔라피 잔액을 충전하거나, API Key 의 허용 IP 제한을 해제하세요.' },
  { symptom: '“내 계정에 휴대폰 번호가 없어…”', fix: '테스트 문자는 내 계정 휴대폰으로만 보냅니다. 회원 명단에서 내 휴대폰 번호를 먼저 등록하세요.' },
];

function StepPill({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-muted text-muted-foreground'}`}>
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

export function SmsApiSettings({ view }: { view: SmsSettingsView }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!view.configured);
  const registered = view.configured && view.isActive;

  const submit = (fd: FormData) =>
    start(async () => {
      const r = await saveSmsCredentialsAction(fd);
      toast(r.ok ? { title: r.message ?? '저장했습니다.', description: '이어서 [내 휴대폰으로 테스트]를 눌러 실제로 문자가 오는지 확인하세요.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) setEditing(false);
    });

  return (
    <div className="flex flex-col gap-4">
      {/* 진행 상태 — 준비 → 등록 → 테스트 확인 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-muted-foreground">진행 상태</span>
        <StepPill done={registered} label="① 키 등록" />
        <span className="text-muted-foreground">→</span>
        <StepPill done={registered && !!view.verifiedAt} label="② 테스트 문자 수신 확인" />
      </div>

      <section className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            {view.configured ? (
              <p className="flex items-center gap-2">
                {view.isActive ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldOff className="h-5 w-5 text-muted-foreground" />}
                <span>
                  솔라피 · API 키 <b>{view.apiKeyHint}…</b> · 발신번호 <b>…{view.senderHint}</b>
                  {view.isActive ? ' — 이 행사 문자는 이 번호로 나갑니다' : ' (비활성 — 플랫폼 기본 발신번호 사용)'}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">
                아직 등록하지 않았습니다. {view.platformFallback ? '지금은 플랫폼 기본 발신번호로 발송됩니다.' : '지금은 문자가 발송되지 않습니다.'}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {view.verifiedAt ? `테스트 발송 확인: ${formatDateTime(view.verifiedAt)}` : '테스트 발송 미확인'}
              {view.rotatedAt ? ` · 마지막 변경: ${formatDateTime(view.rotatedAt)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {registered && (
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

      {/* 처음 등록하는 담당자용 안내 — 등록 전에는 펼친 상태 */}
      <details open={!view.configured} className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20">
        <summary className="cursor-pointer text-sm font-semibold">처음이신가요? 솔라피(SOLAPI) 준비 방법 4단계</summary>
        <ol className="mt-3 flex flex-col gap-3">
          {PREP_STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">{i + 1}</span>
              <div className="text-sm leading-relaxed">
                <p className="font-semibold">{s.title}</p>
                <div className="text-[13px]">{s.body}</div>
              </div>
            </li>
          ))}
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">5</span>
            <div className="text-sm leading-relaxed">
              <p className="font-semibold">여기서 등록 → 테스트</p>
              <p className="text-[13px]">
                위의 <b>[등록]</b> 버튼을 눌러 값을 넣고 <b>[암호화 저장]</b> → <b>[내 휴대폰으로 테스트]</b>를 눌러 문자가 오면 끝입니다.
                테스트 문자는 <b>내 계정의 휴대폰 번호</b>로만 갑니다.
              </p>
            </div>
          </li>
        </ol>
      </details>

      {editing && (
        <form action={submit} className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-background p-4" autoComplete="off">
          <p className="text-sm font-semibold">{view.configured ? 'API 키 교체' : 'API 키 등록'}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="apiKey">API Key</Label>
              <Input id="apiKey" name="apiKey" required autoComplete="off" spellCheck={false} placeholder="예: NCSABCDEFGH12345" />
              <p className="text-[11px] text-muted-foreground">솔라피 [API Key 관리]의 짧은 값</p>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="apiSecret">API Secret</Label>
              <Input id="apiSecret" name="apiSecret" type="password" required autoComplete="new-password" spellCheck={false} placeholder="긴 값 붙여 넣기" />
              <p className="text-[11px] text-muted-foreground">API Key 옆의 긴 값 (입력해도 가려져 보입니다)</p>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="senderNumber">발신번호</Label>
              <Input id="senderNumber" name="senderNumber" type="tel" inputMode="numeric" placeholder="예: 010-1234-5678" required />
              <p className="text-[11px] text-muted-foreground">솔라피에 등록·승인된 번호만 (하이픈 있어도 됨)</p>
            </div>
          </div>
          <div className="flex flex-col gap-1 sm:max-w-xs">
            <Label htmlFor="password">내 비밀번호 (재인증)</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
            <p className="text-[11px] text-muted-foreground">이 플랫폼 로그인 비밀번호입니다. 솔라피 비밀번호가 아닙니다.</p>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr><th className="px-3 py-1.5">칸</th><th className="px-3 py-1.5">어디서 찾나요</th><th className="px-3 py-1.5">이런 모양이에요</th></tr>
              </thead>
              <tbody>
                {FIELD_HELP.map((f) => (
                  <tr key={f.field} className="border-t">
                    <td className="whitespace-nowrap px-3 py-1.5 font-semibold">{f.field}</td>
                    <td className="px-3 py-1.5">{f.where}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{f.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            🔒 저장하는 즉시 이 행사 전용 키로 암호화되며, DB 와 서버 어느 한쪽만으로는 풀 수 없습니다. 저장 후에는 화면에 앞 4자리·뒤 4자리만 보이고,
            누가 언제 등록·교체·사용했는지 아래 접근 이력에 남습니다.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={pending}>취소</Button>
            <Button type="submit" disabled={pending || !view.kekConfigured}>{pending ? '저장 중…' : '암호화 저장'}</Button>
          </div>
        </form>
      )}

      <details className="rounded-xl border bg-background p-4">
        <summary className="cursor-pointer text-sm font-semibold">잘 안 될 때 확인할 것</summary>
        <ul className="mt-2 flex flex-col gap-2 text-xs">
          {TROUBLES.map((t) => (
            <li key={t.symptom}>
              <p className="font-semibold">{t.symptom}</p>
              <p className="text-muted-foreground">{t.fix}</p>
            </li>
          ))}
        </ul>
      </details>

      {registered && (
        <form action={(fd) => start(async () => { const r = await disableSmsCredentialsAction(fd); toast(r.ok ? { title: r.message ?? '비활성화' } : { title: r.error, variant: 'destructive' }); })} className="flex flex-col gap-2 rounded-xl border bg-background p-4">
          <p className="text-sm font-semibold">행사 문자 API 끄기</p>
          <p className="text-xs text-muted-foreground">
            잘못 발송되고 있거나 키가 유출된 것 같을 때 누르세요. 끄면 이 행사 문자는 플랫폼 기본 발신번호로 나갑니다(기본 번호가 없으면 발송 중단). 다시 켜려면 [키 교체]로 등록합니다.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pw2" className="text-xs">내 비밀번호</Label>
              <Input id="pw2" name="password" type="password" required autoComplete="current-password" className="max-w-xs" />
            </div>
            <Button type="submit" variant="outline" size="sm" disabled={pending}>비활성화</Button>
          </div>
        </form>
      )}
    </div>
  );
}
