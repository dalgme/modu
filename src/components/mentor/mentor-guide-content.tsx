import Link from 'next/link';
import {
  ClipboardList,
  Users,
  NotebookPen,
  FileSignature,
  FolderCheck,
  Send,
  ArrowRight,
  HelpCircle,
  Wallet,
  Clock,
} from 'lucide-react';

import { GuideScreenshot } from '@/components/mentor/guide-screenshot';
import { PwaGuide } from '@/components/common/pwa-guide';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export type GuideFaq = { id: string; question: string; answer: string };

/** 컨설팅 유형 안내 — 단가·상한은 운영 설정(행사/그룹) 값이 회차 등록 화면에 표시된다 */
const CONSULTING = [
  { type: '온라인 컨설팅', required: '화상·전화 등 비대면', optional: '회차 등록 시 유형 선택', content: '사업계획·마케팅·재무 등 비대면 상담', accent: 'border-emerald-300 dark:border-emerald-800', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { type: '오프라인 컨설팅', required: '대면 방문·현장', optional: '회차 등록 시 유형 선택', content: '현장 방문 상담, 워크숍, 대면 코칭', accent: 'border-amber-300 dark:border-amber-800', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
];

/** 본 사업 전체 여정(약식) */
const OVERALL = ['멘티 등록', '멘토 배정', '컨설팅 회차 등록', '멘티 확인 서명', '관찰의견서·종결 요청', '운영사 검수·정산 확정', '발주처 정산 확인·종결'];

/** 멘토 입장의 플랫폼 여정 */
const JOURNEY = [
  {
    icon: ClipboardList,
    title: '배정 확인',
    desc: '운영사가 케이스에 멘토님을 배정하면 대시보드 상단에 신규 배정 케이스가 표시됩니다. 케이스를 열어 멘티 정보, 그룹 회차 수, 진행 단계를 확인하세요.',
    features: ['신규 배정 알림', '담당 케이스 목록', '진행단계 실시간 확인'],
    screenshot: 'mentor-dashboard',
    caption: '멘토 대시보드',
    href: '/mentor/dashboard',
    cta: '대시보드 열기',
  },
  {
    icon: NotebookPen,
    title: '컨설팅 회차 등록',
    desc: '회차마다 일시·장소·유형(온라인/오프라인)을 입력하고 내용을 웹으로 작성하거나 보고서 파일을 올립니다. 사진도 첨부할 수 있습니다. 단가는 등록 시점 값으로 고정됩니다.',
    features: ['웹 작성 시 행사/그룹 양식으로 보고서 PDF 자동 생성', '같은 멘티·같은 날 상한, 1일 최대 건수 자동 검증', '멘티 서명 전까지 수정 가능'],
    screenshot: 'mentor-log',
    caption: '회차 등록',
    href: '/mentor/dashboard',
    cta: '케이스에서 등록',
  },
  {
    icon: FileSignature,
    title: '내 서명 등록',
    desc: '운영사가 보고서 양식에 멘토 서명 컬럼을 두고 자동 서명을 켠 그룹에서는, 등록한 서명이 보고서 저장 시 자동으로 붙습니다.',
    features: ['직접 그리기 또는 이미지 업로드', '본인만 등록·교체', '대행 중에는 등록 불가'],
    screenshot: 'mentor-signature',
    caption: '내 서명 등록',
    href: '/mentor/signature',
    cta: '서명 등록',
  },
  {
    icon: Users,
    title: '멘티 확인 서명 · 서류',
    desc: '회차를 등록하면 멘티에게 확인 알림이 가고 멘티가 서명합니다(정책 설정 시). 멘티가 멘토에게 공개한 서류를 케이스 상세에서 볼 수 있습니다.',
    features: ['회차별 멘티 서명 상태', '멘티 서류(공개본) 열람', '멘티 관련 서류 첨부'],
    screenshot: 'mentor-mentee-panel',
    caption: '케이스 상세 · 멘티 서류',
    href: '/mentor/dashboard',
    cta: '케이스에서 확인',
  },
  {
    icon: FolderCheck,
    title: '추가 회차 · 중도 종료 요청',
    desc: '회차가 더 필요하면 추가 회차를, 부득이하게 계속할 수 없으면 사유를 적어 중도 종료를 요청합니다. 운영사가 승인하면 반영됩니다.',
    features: ['추가 회차 요청(운영사 승인)', '중도 종료 요청 → 이행 회차 부분 정산', '처리 결과 알림'],
    screenshot: 'mentor-requests',
    caption: '요청',
    href: '/mentor/dashboard',
    cta: '케이스에서 요청',
  },
  {
    icon: Send,
    title: '관찰의견서 · 종결 요청 → 정산',
    desc: '필수 회차를 채운 뒤 관찰의견서(멘티당 1건)를 작성하거나 완성본을 올리고 종결을 요청합니다. 운영사가 검수 승인하면 정산이 확정되어 정산서와 함께 통보되며, 정산 내역 메뉴에서 확인할 수 있습니다.',
    features: ['관찰의견서 임시 저장·제출', '예상 정산액(미확정) 확인', '확정 정산·정산서 PDF 열람'],
    screenshot: 'mentor-report',
    caption: '관찰의견서 · 정산',
    href: '/mentor/settlements',
    cta: '정산 내역',
  },
];

/**
 * 멘토 이용 안내 본문 (전체 여정 약식 + 멘토 여정 6단계 + FAQ).
 * 멘토 안내 페이지와 운영사 회원 열람(view-as) 안내 탭에서 공용으로 사용한다.
 * @param showCtas false 이면 각 단계의 이동 버튼을 숨긴다(열람 전용).
 */
export function MentorGuideContent({
  faqs,
  showCtas = true,
}: {
  faqs: GuideFaq[];
  showCtas?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* 유형별 컨설팅 회차·비용 안내 */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            컨설팅 유형 · 비용 안내
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CONSULTING.map((c) => (
              <div key={c.type} className={`flex flex-col gap-2 rounded-lg border ${c.accent} p-4`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{c.type}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.badge}`}
                  >
                    {c.required}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">({c.optional})</p>
                <p className="text-sm leading-relaxed">
                  <span
                    className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${c.badge}`}
                  >
                    컨설팅 내용
                  </span>
                  {c.content}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm">
            <Clock className="h-4 w-4 shrink-0 text-primary" />
            <span>
              단가와 1일 상한은 <b className="text-primary">행사·그룹 운영 설정</b>에 따르며 회차 등록 화면에 표시됩니다. 회차 등록 시점의 단가가 정산에 그대로 적용됩니다.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 전체 여정 약식 */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">본 사업 전체 여정 (약식)</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
            {OVERALL.map((s, i) => (
              <li key={s} className="flex items-center gap-1">
                <span className="rounded-full bg-background px-2.5 py-1 font-medium shadow-sm">
                  {i + 1}. {s}
                </span>
                {i < OVERALL.length - 1 && (
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            이 중 <b className="text-primary">컨설팅 회차 등록</b>과 <b className="text-primary">관찰의견서·종결 요청</b>이 멘토님의 주요 업무입니다.
          </p>
        </CardContent>
      </Card>

      {/* 멘토 여정 단계 */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">멘토의 플랫폼 여정</h2>
        {JOURNEY.map((step, i) => {
          const Icon = step.icon;
          return (
            <Card key={step.title}>
              <CardContent className="grid grid-cols-1 gap-5 py-5 md:grid-cols-2">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      STEP {i + 1}
                    </span>
                    <h3 className="text-base font-semibold">{step.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {step.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {showCtas && (
                    <div>
                      <Button asChild variant="outline" size="sm">
                        <Link href={step.href}>
                          {step.cta}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
                <GuideScreenshot name={step.screenshot} caption={step.caption} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* PWA(홈 화면 추가) 설치 안내 */}
      <PwaGuide />

      {/* FAQ */}
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <HelpCircle className="h-5 w-5 text-primary" />
          자주 묻는 질문 (FAQ)
        </h2>
        {faqs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            등록된 FAQ가 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {faqs.map((f) => (
              <details key={f.id} className="group rounded-lg border p-4 open:bg-muted/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
                  <span>Q. {f.question}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{f.answer}</p>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
