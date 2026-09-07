import Link from 'next/link';
import { Upload, Clock, CheckCircle2, AlertTriangle, ArrowRight, Phone } from 'lucide-react';

import { type CaseStatus } from '@/types/case-status';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Tone = 'action' | 'waiting' | 'attention' | 'done';

interface NextAction {
  tone: Tone;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}

/**
 * 케이스 현재 단계를 멘티가 바로 이해할 수 있는 '지금 하실 일' 한 문장으로 변환한다.
 * - action: 멘티가 직접 할 일이 있음(큰 버튼)
 * - waiting: 다른 담당자가 처리 중 → "기다리시면 됩니다"로 안심
 * - attention: 확인/보완 필요
 * - done: 완료
 */
export function menteeNextAction(status: CaseStatus): NextAction {
  switch (status) {
    case 'registered':
      return {
        tone: 'waiting',
        title: '곧 담당 멘토가 배정됩니다',
        body: '운영팀이 확인 후 멘토를 배정해 드립니다. 잠시만 기다려 주세요.',
      };
    case 'mentor_assigned':
      return {
        tone: 'waiting',
        title: '담당 멘토의 연락을 기다려 주세요',
        body: '곧 담당 멘토가 전화로 연락드립니다. 연락이 오면 방문·상담 일정을 잡아 주세요.',
      };
    case 'contacted':
      return {
        tone: 'waiting',
        title: '멘토링을 진행하고 있습니다',
        body: '멘토 선생님의 안내에 따라 상담을 진행해 주세요. 다음에 하실 일은 멘토가 알려드립니다.',
      };
    case 'log_completed':
      return {
        tone: 'action',
        title: '지원신청 서류를 올려 주세요',
        body: '공사업체 견적서·사업자등록증 등 필요한 서류를 올립니다. 휴대폰으로 사진을 찍어 올려도 됩니다. 다 올린 뒤 [제출하기]를 눌러 주세요.',
        cta: { label: '지원신청 서류 올리기', href: '/mentee/pre-support' },
      };
    case 'contractor_registered':
      return {
        tone: 'waiting',
        title: '멘토가 지원신청서를 작성하고 있습니다',
        body: '제출하신 서류로 멘토가 지원신청서를 만들고 있습니다. 이 단계는 기다리시면 됩니다.',
      };
    case 'application_drafted':
      return {
        tone: 'waiting',
        title: '멘토가 지원신청서를 작성하고 있습니다',
        body: '멘토가 컨설팅 결과보고서를 바탕으로 지원신청서와 공사업체 서류를 준비하고 있습니다. 이 단계는 기다리시면 됩니다.',
      };
    case 'under_review':
      return {
        tone: 'waiting',
        title: '운영팀(넥스트랩)이 서류를 검토하고 있습니다',
        body: '제출된 지원신청서를 운영팀이 확인 중입니다. 기다려 주세요.',
      };
    case 'reviewed':
      return {
        tone: 'waiting',
        title: '진흥원 승인을 기다리고 있습니다',
        body: '검토가 끝나 진흥원의 승인 절차가 진행 중입니다. 승인되면 문자로 안내드립니다.',
      };
    case 'approved':
      return {
        tone: 'waiting',
        title: '승인되었습니다',
        body: '지원이 승인되었습니다. 곧 승인 통보가 완료되면 다음 단계를 안내드립니다.',
      };
    case 'rejected':
      return {
        tone: 'attention',
        title: '서류 보완이 필요합니다',
        body: '진흥원 검토에서 보완이 필요하다는 의견이 있었습니다. 멘토·운영팀 안내를 확인해 서류를 보완해 주세요.',
        cta: { label: '지원신청 서류 확인·보완', href: '/mentee/pre-support' },
      };
    case 'notified':
      return {
        tone: 'action',
        title: '공사 후 지급 증빙을 올려 주세요',
        body: '공사·설비가 끝나면 세금계산서·이체확인서·시공 전후 사진 등 지급 증빙을 올립니다. 휴대폰 사진으로 올려도 됩니다. 다 올린 뒤 [제출하기]를 눌러 주세요.',
        cta: { label: '지급 증빙 올리기', href: '/mentee/post-support' },
      };
    case 'execution_docs_submitted':
      return {
        tone: 'waiting',
        title: '운영팀이 지급신청서를 작성하고 있습니다',
        body: '제출하신 증빙으로 지급 절차가 진행 중입니다. 기다려 주세요.',
      };
    case 'payment_application_drafted':
      return {
        tone: 'waiting',
        title: '진흥원 지급 승인을 기다리고 있습니다',
        body: '지급신청서가 접수되어 최종 승인 절차가 진행 중입니다. 조금만 기다려 주세요.',
      };
    case 'payment_approved':
      return {
        tone: 'done',
        title: '모든 절차가 끝났습니다. 수고하셨습니다!',
        body: '지원이 완료되었습니다. 그동안 함께해 주셔서 감사합니다.',
      };
    case 'withdrawn':
      return {
        tone: 'done',
        title: '지원이 종결되었습니다',
        body: '궁금한 점이 있으시면 언제든 문의를 남겨 주세요.',
      };
    default:
      return {
        tone: 'waiting',
        title: '진행 상황을 확인하고 있습니다',
        body: '잠시만 기다려 주세요.',
      };
  }
}

const TONE_STYLE: Record<
  Tone,
  { card: string; iconWrap: string; title: string; Icon: typeof Upload }
> = {
  action: {
    card: 'border-primary/40 bg-primary/5',
    iconWrap: 'bg-primary text-primary-foreground',
    title: 'text-foreground',
    Icon: Upload,
  },
  waiting: {
    card: 'border-status-progress/40 bg-status-progress/5',
    iconWrap: 'bg-status-progress/15 text-status-progress',
    title: 'text-foreground',
    Icon: Clock,
  },
  attention: {
    card: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
    iconWrap: 'bg-amber-500 text-white',
    title: 'text-amber-800 dark:text-amber-200',
    Icon: AlertTriangle,
  },
  done: {
    card: 'border-status-approved/40 bg-status-approved/5',
    iconWrap: 'bg-status-approved text-white',
    title: 'text-foreground',
    Icon: CheckCircle2,
  },
};

/**
 * 멘티 대시보드 최상단 '지금 하실 일' 안내 카드.
 * 현재 단계를 쉬운 말 한 문장 + (필요 시) 큰 버튼 하나로 보여준다.
 */
export function MenteeNextAction({
  status,
  viewAsUserId,
}: {
  status: CaseStatus;
  /** 회원 열람 중이면 대상 회원 id — 링크를 view-as 경로로 유지해 열람이 풀리지 않게 한다. */
  viewAsUserId?: string;
}) {
  const action = menteeNextAction(status);
  const s = TONE_STYLE[action.tone];
  // 열람 중에는 멘티 실제 경로 대신 열람 대시보드로(멘티 서브 페이지는 view-as 대응 화면이 없음)
  const ctaHref = viewAsUserId ? `/nextlab/view/${viewAsUserId}` : action.cta?.href;
  const inquiriesHref = viewAsUserId
    ? `/nextlab/view/${viewAsUserId}?tab=inquiries`
    : '/mentee/inquiries';

  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border-2 p-5 shadow-sm', s.card)}>
      <div className="flex items-start gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', s.iconWrap)}>
          <s.Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            지금 하실 일
          </p>
          <h2 className={cn('text-lg font-bold leading-snug sm:text-xl', s.title)}>
            {action.title}
          </h2>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{action.body}</p>

      {action.cta ? (
        <Button asChild size="lg" className="mt-1 w-full gap-2 text-base shadow-sm sm:w-auto sm:self-start">
          <Link href={ctaHref!}>
            <Upload className="h-5 w-5" />
            {action.cta.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : action.tone === 'waiting' ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-background/70 px-3 py-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            지금은 따로 하실 일이 없습니다. 안내를 기다려 주세요.
          </span>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={inquiriesHref}>
              <Phone className="h-4 w-4" />
              궁금하면 문의하기
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
