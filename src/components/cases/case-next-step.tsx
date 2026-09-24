import Link from 'next/link';
import { ArrowRight, Lightbulb } from 'lucide-react';

import type { CaseStatus } from '@/types/case-status';
import { CASE_STATUS_META } from '@/types/case-status';

/** 케이스 상세 상단 "지금 할 일" 안내 + 섹션 바로가기 (운영사, P28) — 처음 쓰는 담당자가 아래 긴 화면에서 무엇을 눌러야 하는지 먼저 보이게 한다. */
export interface CaseNextStepInput {
  status: CaseStatus;
  mentorName: string | null;
  roundsReported: number;
  roundsPlanned: number;
  requiredRounds: number;
  pendingRequests: number;
  pendingChangeRequests: number;
  menteeLinked: boolean;
  /** 멘토 입력 대기 요약 (P31, 선택) — 보고서 없는 지난 회차 수·관찰의견서 유무 */
  mentorInput?: { plannedWithoutReport: number; hasObservation: boolean } | null;
  /** 페이지에 실제로 있는 섹션 앵커('#rounds' 등). 생략하면 전부 표시 (P31) */
  sections?: string[];
}

function describe(i: CaseNextStepInput): { title: string; desc: string; anchor?: string; href?: string; hrefLabel?: string; tone: 'action' | 'wait' | 'done' } {
  switch (i.status) {
    case 'registered':
      return i.menteeLinked
        ? { title: '멘토를 배정하세요', desc: '아래 [멘토 배정]에서 직접 고르거나, AI 추천 카드의 [배정]을 누르세요. 여러 멘티를 한 번에 보려면 멘티 매칭 리스트가 편합니다.', anchor: '#assign', href: '/nextlab/roster?tab=mentee-match', hrefLabel: '멘티 매칭 리스트', tone: 'action' }
        : { title: '멘티 계정을 연결하세요', desc: '아래 [멘티 계정]에서 로그인 계정을 발급·연결한 뒤 멘토를 배정합니다.', anchor: '#invite', tone: 'action' };
    case 'reassignment_pending':
      return { title: '새 멘토를 배정하세요 (재배정 대기)', desc: '이전 멘토가 중도 종료되어 잔여 회차를 맡을 멘토가 필요합니다. 진행한 회차와 부분 정산은 그대로 보존됩니다.', anchor: '#assign', tone: 'action' };
    case 'mentor_assigned':
      return { title: `멘토(${i.mentorName ?? '-'})의 첫 회차 등록을 기다리는 중`, desc: i.roundsPlanned > 0 ? '계획 회차는 등록됐고 보고서 등록을 기다립니다.' : '멘토가 회차를 등록하면 진행 중으로 바뀝니다. 오래 멈춰 있으면 리포트 개요의 지연 케이스에서 독려 문자를 보낼 수 있습니다.', anchor: '#rounds', tone: 'wait' };
    case 'in_progress':
      return { title: `컨설팅 진행 중 — 보고서 ${i.roundsReported}/${i.requiredRounds}회차`, desc: i.pendingRequests > 0 ? `처리 대기 요청 ${i.pendingRequests}건이 있습니다. 게시판 › 처리 대기 요청에서 승인·반려하세요.` : i.pendingChangeRequests > 0 ? `멘티의 멘토 변경 요청 ${i.pendingChangeRequests}건이 있습니다. 아래에서 수락·반려하세요.` : '멘토가 모든 회차의 보고서를 올리고 관찰의견서를 제출하면 종결 검수 단계로 넘어옵니다.', anchor: i.pendingChangeRequests > 0 ? '#change' : '#rounds', href: i.pendingRequests > 0 ? '/nextlab/board?tab=requests' : undefined, hrefLabel: '처리 대기 요청', tone: i.pendingRequests + i.pendingChangeRequests > 0 ? 'action' : 'wait' };
    case 'closure_requested':
      return { title: '종결 검수를 하세요', desc: '관찰의견서와 회차 보고서를 확인한 뒤 [검수 승인 · 정산 확정] 또는 [보완 요청]을 누르세요. 승인하면 예상 금액이 그대로 확정됩니다.', anchor: '#review', tone: 'action' };
    case 'revision_requested':
      return { title: '멘토의 보완을 기다리는 중', desc: '보완 요청 사유를 멘토가 확인하고 다시 종결 요청하면 검수 단계로 돌아옵니다.', anchor: '#rounds', tone: 'wait' };
    case 'settlement_pending':
      return { title: '정산이 확정됐습니다 — 지급 품의를 편성하세요', desc: '정산·품의 화면의 [지급 대기]에서 이 건을 골라 품의를 만들고 발주처에 제출합니다.', href: '/nextlab/settlements?tab=pending', hrefLabel: '정산·품의로 이동', anchor: '#settlement', tone: 'action' };
    case 'settlement_batched':
      return { title: '발주처의 정산 확인을 기다리는 중', desc: '품의가 제출되었습니다. 발주처가 정산 확인을 하면 종결로 확정됩니다.', href: '/nextlab/settlements?tab=all', hrefLabel: '품의 보기', anchor: '#settlement', tone: 'wait' };
    case 'closed':
      return { title: '종결 확정', desc: '정산 확인까지 끝났습니다. 서류 일괄 다운로드(ZIP)로 증빙을 보관하세요.', anchor: '#docs', tone: 'done' };
    case 'withdrawn':
      return { title: '중도 종료', desc: '이행한 회차가 있으면 부분 정산이 아래 정산 카드에 남아 있습니다.', anchor: '#settlement', tone: 'done' };
    default:
      return { title: CASE_STATUS_META[i.status as CaseStatus].label, desc: '', tone: 'wait' };
  }
}

const SECTIONS: { anchor: string; label: string }[] = [
  { anchor: '#invite', label: '멘티 계정' },
  { anchor: '#assign', label: '멘토 배정' },
  { anchor: '#profile', label: '멘티 정보' },
  { anchor: '#team', label: '팀' },
  { anchor: '#review', label: '검수' },
  { anchor: '#settlement', label: '정산' },
  { anchor: '#change', label: '멘토 변경' },
  { anchor: '#rounds', label: '회차' },
  { anchor: '#observation', label: '관찰의견서' },
  { anchor: '#docs', label: '서류' },
];

const MENTOR_INPUT_STATUSES: CaseStatus[] = ['mentor_assigned', 'in_progress', 'revision_requested'];

export function CaseNextStep(props: CaseNextStepInput) {
  const d = describe(props);
  const sections = props.sections ? SECTIONS.filter((s) => props.sections!.includes(s.anchor)) : SECTIONS;
  const showMentorInput = !!props.mentorInput && MENTOR_INPUT_STATUSES.includes(props.status);
  const toneCls = d.tone === 'action' ? 'border-brand-coral bg-orange-50/70 dark:bg-orange-950/20' : d.tone === 'done' ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-sky-300 bg-sky-50/60 dark:bg-sky-950/20';
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-col gap-2 rounded-xl border-2 px-4 py-3 ${toneCls}`}>
        <div className="flex items-start gap-2">
          <Lightbulb className={`mt-0.5 h-5 w-5 shrink-0 ${d.tone === 'action' ? 'text-brand-coral' : d.tone === 'done' ? 'text-emerald-600' : 'text-sky-600'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              <span className="mr-2 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{d.tone === 'action' ? '지금 할 일' : d.tone === 'done' ? '완료' : '대기 중'}</span>
              {d.title}
            </p>
            {d.desc && <p className="mt-1 text-xs text-muted-foreground">{d.desc}</p>}
            {showMentorInput && (
              <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                멘토 입력 대기: 보고서 {props.mentorInput!.plannedWithoutReport}회차 · 관찰의견서 {props.mentorInput!.hasObservation ? '있음' : '없음'}
              </p>
            )}
          </div>
        </div>
        {(d.anchor || d.href) && (
          <div className="flex flex-wrap gap-2 pl-7">
            {d.anchor && (
              <a href={d.anchor} className="inline-flex items-center gap-1 rounded-md bg-background px-2.5 py-1 text-xs font-semibold shadow-sm hover:bg-accent">
                해당 섹션으로 <ArrowRight className="h-3 w-3" />
              </a>
            )}
            {d.href && (
              <Link href={d.href} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                {d.hrefLabel ?? '이동'} <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}
      </div>
      {/* 섹션 바로가기 — 폰에서는 헤더 아래 고정(sticky), 가로 스크롤 (P31) */}
      <nav aria-label="케이스 섹션" className="no-scrollbar sticky top-14 z-20 flex gap-1 overflow-x-auto rounded-lg border bg-background px-2 py-1.5 text-xs shadow-sm md:top-[6.75rem]">
        {sections.map((s) => (
          <a key={s.anchor} href={s.anchor} className="whitespace-nowrap rounded-md px-2 py-2 font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
            {s.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
