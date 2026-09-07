'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, PenLine, Check } from 'lucide-react';

import {
  resetMenteePasswordAction,
  captureMeetingSignatureAction,
} from '@/lib/workflow/mentor-mentee-actions';
import { SignaturePad } from '@/components/common/signature-pad';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface MentorMenteePanelProps {
  caseId: string;
  menteeName: string | null;
  menteePhone: string | null;
  hasMentee: boolean;
  hasMeetingSignature: boolean;
}

/**
 * 멘토 미팅 지원: 담당 멘티의 임시 비밀번호 재설정 + 미팅 확인 서명 캡처.
 * 미팅 확인 서명은 멘토링보고서·지원신청서 등 서식에 자동 재사용된다.
 */
export function MentorMenteePanel({
  caseId,
  menteeName,
  menteePhone,
  hasMentee,
  hasMeetingSignature,
}: MentorMenteePanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'pw' | 'sig' | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  // 멘티 로그인 아이디 = 이름(공백 제거) + 휴대폰 뒤 4자리 (menteeLoginKey 와 동일 규칙)
  const nameKey = (menteeName ?? '').replace(/\s+/g, '');
  const last4 = (menteePhone ?? '').replace(/\D/g, '').slice(-4);
  const loginId = nameKey && last4.length === 4 ? `${nameKey}${last4}` : null;

  if (!hasMentee) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">미팅 확인 서명 (멘티)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            아직 멘티 계정이 연결되지 않았습니다. 진흥원 등록 후 이용할 수 있습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function onResetPassword() {
    if (!window.confirm('멘티의 임시 비밀번호를 재설정할까요? (임시비번 = 휴대폰 번호)')) return;
    setBusy('pw');
    const result = await resetMenteePasswordAction(caseId);
    setBusy(null);
    if (result.ok) {
      setTempPassword(result.tempPassword ?? null);
      toast({ title: result.message ?? '재설정되었습니다.' });
    } else {
      toast({ title: '재설정 실패', description: result.error, variant: 'destructive' });
    }
  }

  async function onSaveSignature() {
    if (!signature) {
      toast({ title: '먼저 서명을 입력하세요.', variant: 'destructive' });
      return;
    }
    setBusy('sig');
    const result = await captureMeetingSignatureAction(caseId, signature);
    setBusy(null);
    if (result.ok) {
      toast({ title: result.message ?? '서명이 저장되었습니다.' });
      setSignature(null);
      router.refresh();
    } else {
      toast({ title: '서명 저장 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">미팅 확인 서명 (멘티)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="text-sm">
          <span className="text-xs text-muted-foreground">담당 멘티</span>
          <p className="font-medium">
            {menteeName ?? '-'}{' '}
            <span className="font-normal text-muted-foreground">{menteePhone ?? ''}</span>
          </p>
        </div>

        {/* 미팅 확인 서명 (핵심) */}
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <PenLine className="h-4 w-4 text-muted-foreground" />미팅 확인 서명 (멘티)
          </p>
          {hasMeetingSignature && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-status-approved">
              <Check className="h-3.5 w-3.5" />서명이 저장되어 있습니다. 서식(멘토링보고서·지원신청서)에
              자동 반영됩니다. 새로 받으면 최신 서명으로 교체됩니다.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            미팅 현장에서 멘티의 확인 서명을 받아두면 멘토링보고서·지원신청서 등 서식의 신청업체
            서명 자리에 자동으로 사용됩니다.
          </p>
          <SignaturePad label="멘티 서명" onChange={setSignature} />
          <div>
            <Button type="button" size="sm" disabled={busy !== null || !signature} onClick={onSaveSignature}>
              {busy === 'sig' ? '저장 중…' : '미팅 확인 서명 저장'}
            </Button>
          </div>
        </div>

        {/* 임시 비밀번호 재설정 (거의 사용 안 함 · 하단 보조) */}
        <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="text-muted-foreground">멘티 로그인 아이디 : </span>
              <span className="font-medium">{loginId ?? '-'}</span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy !== null}
              onClick={onResetPassword}
            >
              <KeyRound className="h-4 w-4" />
              {busy === 'pw' ? '재설정 중…' : '임시 비밀번호 재설정'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            멘티가 로그인에 어려움이 있을 때 미팅 현장에서{' '}
            <span className="font-medium text-primary">임시 비밀번호(=휴대폰 번호)로 재설정</span>
            합니다. 최초 로그인 시 비밀번호 변경이 다시 요구됩니다.
          </p>
          {tempPassword && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-sm">
              <span className="text-xs text-primary">임시 비밀번호 (한 번만 표시)</span>
              <code className="mt-0.5 block break-all font-mono text-base">{tempPassword}</code>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
