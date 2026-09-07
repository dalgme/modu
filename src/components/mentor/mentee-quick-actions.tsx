'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PenLine, Building2, ArrowRight } from 'lucide-react';

import {
  captureMeetingSignatureAction,
  getMentorCaseDetailAction,
} from '@/lib/workflow/mentor-mentee-actions';
import type { CaseListItem } from '@/lib/data/cases';
import { SignaturePad } from '@/components/common/signature-pad';
import { ApplicationPdfButton } from '@/components/cases/application-pdf-button';
import { StatusBadge } from '@/components/cases/status-badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || '-'}</dd>
    </div>
  );
}

/**
 * 멘티별 업무진행 헤더용 빠른 작업:
 *  - '멘티 미팅 서명' — 팝업에서 첫 미팅 확인 서명을 바로 받는다(멘티 서명 → 서식 자동 반영).
 *  - '멘티 기업 세부보기' — 팝업으로 케이스 세부정보를 확인한다.
 */
export function MenteeQuickActions({
  caseId,
  businessName,
}: {
  caseId: string;
  businessName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [signOpen, setSignOpen] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<CaseListItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function saveSignature() {
    if (!sig) {
      toast({ title: '서명을 입력하세요.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const res = await captureMeetingSignatureAction(caseId, sig);
    setSaving(false);
    if (res.ok) {
      toast({ title: res.message ?? '미팅 확인 서명이 저장되었습니다.' });
      setSig(null);
      setSignOpen(false);
      router.refresh();
    } else {
      toast({ title: '저장 실패', description: res.error, variant: 'destructive' });
    }
  }

  async function openDetail() {
    setDetailOpen(true);
    if (detail) return;
    setLoadingDetail(true);
    const d = await getMentorCaseDetailAction(caseId);
    setLoadingDetail(false);
    setDetail(d);
  }

  const isClosure = detail?.supportTypeCode === 'closure';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => setSignOpen(true)}
          className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <PenLine className="h-4 w-4" />
          멘티 미팅 서명
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={openDetail} className="gap-1.5">
          <Building2 className="h-4 w-4" />
          멘티 기업 세부보기
        </Button>
      </div>

      {/* 미팅 확인 서명 */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>멘티 미팅 확인 서명</DialogTitle>
            <DialogDescription>
              {businessName} · 첫 미팅 현장에서 멘티(대표자)의 확인 서명을 받아두면
              멘토링보고서·지원신청서 등 서식의 신청업체 서명 자리에 자동 반영됩니다.
            </DialogDescription>
          </DialogHeader>
          <SignaturePad label="멘티(대표자) 서명" onChange={setSig} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSignOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button type="button" onClick={saveSignature} disabled={saving || !sig}>
              {saving ? '저장 중…' : '서명 저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 멘티 기업 세부보기 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {businessName}
              {detail && <StatusBadge status={detail.status} showStep />}
            </DialogTitle>
          </DialogHeader>
          {loadingDetail ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
          ) : !detail ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              세부정보를 불러오지 못했습니다.
            </p>
          ) : (
            <>
              {detail.hasApplicationPdf && (
                <div>
                  <ApplicationPdfButton caseId={detail.id} />
                </div>
              )}
              <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                <DetailRow label="지원유형" value={detail.supportTypeName} />
                <DetailRow label="대표자" value={detail.owner_name} />
                <DetailRow label="사업자등록번호" value={detail.business_reg_no} />
                <DetailRow label="연락처" value={detail.phone} />
                <DetailRow label="이메일" value={detail.email} />
                {detail.menteeLoginId && (
                  <DetailRow label="멘티 로그인 아이디" value={detail.menteeLoginId} />
                )}
                <div className="sm:col-span-2">
                  <DetailRow label="사업장 주소" value={detail.address} />
                </div>
                <DetailRow
                  label="업태 / 종목"
                  value={[detail.business_type, detail.item].filter(Boolean).join(' / ')}
                />
                <DetailRow label="개업연월일" value={formatDate(detail.opened_at)} />
                <DetailRow label="상시근로자수" value={detail.employee_count ?? '-'} />
                {isClosure && (
                  <DetailRow
                    label="폐업 구분"
                    value={
                      detail.closure_status === 'closed'
                        ? '폐업'
                        : detail.closure_status === 'pending'
                          ? '폐업예정'
                          : '-'
                    }
                  />
                )}
              </dl>
              <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/mentor/cases/${detail.id}`}>
                    케이스 상세로 이동
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
