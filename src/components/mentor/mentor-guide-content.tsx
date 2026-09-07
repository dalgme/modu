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

/** 유형별 컨설팅 회차·내용 안내 */
const CONSULTING = [
  {
    type: '경영개선 유형',
    required: '컨설팅 2회 필수',
    optional: '필요시 1회 추가 가능',
    content: '경영개선 요청사항 현장확인, 경영관련 일반 컨설팅 등',
    accent: 'border-emerald-300 dark:border-emerald-800',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  {
    type: '폐업정리 유형',
    required: '컨설팅 1회 필수',
    optional: '필요시 1회 추가 가능',
    content: '폐업현장 확인, 지원금 신청항목 확인',
    accent: 'border-amber-300 dark:border-amber-800',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
];

/** 본 사업 전체 여정(약식) */
const OVERALL = [
  '진흥원 멘티기업 등록',
  '넥스트랩 멘토 배정',
  '멘토링·서명',
  '지원신청서·부속서류',
  '넥스트랩 검수',
  '진흥원 승인',
  '증빙·지급',
];

/** 멘토 입장의 플랫폼 여정 */
const JOURNEY = [
  {
    icon: ClipboardList,
    title: '배정 확인',
    desc: '넥스트랩이 케이스에 멘토님을 배정하면 멘토 대시보드 상단에 신규 배정 케이스가 표시됩니다. 케이스를 열어 멘티기업 정보와 진행 단계를 확인하세요.',
    features: ['신규 배정 알림', '멘티별 업무진행 보드', '진행단계 실시간 확인'],
    screenshot: 'mentor-dashboard',
    caption: '멘토 대시보드',
    href: '/mentor/dashboard',
    cta: '대시보드 열기',
  },
  {
    icon: Users,
    title: '멘티 미팅 지원',
    desc: '케이스 상세의 ‘멘티 미팅 지원’ 패널에서 멘티가 로그인을 못 하면 임시 비밀번호를 재설정하고, 미팅 확인 서명을 받아둘 수 있습니다.',
    features: ['멘티 임시 비밀번호 재설정', '미팅 확인 서명(멘티) 캡처', '서명은 서식에 자동 재사용'],
    screenshot: 'mentor-mentee-panel',
    caption: '케이스 상세 · 멘티 미팅 지원',
    href: '/mentor/dashboard',
    cta: '케이스에서 확인',
  },
  {
    icon: NotebookPen,
    title: '멘토링 일지·서명·사진',
    desc: '미팅 후 멘토링 일지를 작성합니다. 방문일·주제·내용과 함께 멘토·멘티 서명, 현장 사진을 기록하면 다음 단계로 진행됩니다.',
    features: ['방문 회차·내용 기록', '멘토·멘티 서명', '현장 사진 첨부'],
    screenshot: 'mentor-log',
    caption: '멘토링 일지 작성',
    href: '/mentor/tasks',
    cta: '업무진행 보드',
  },
  {
    icon: FileSignature,
    title: '지원신청서 작성',
    desc: '경영개선 지원신청서(붙임5)를 작성합니다. 멘티가 등록한 공사업체·첨부서류가 자동으로 채워지고, 필요한 항목을 수정·보완할 수 있습니다.',
    features: ['시공(제작)내용 자동 채움·편집', '멘티 첨부서류 하단 연동(팝업 열람)', '제출 시 붙임서식 PDF 자동 생성'],
    screenshot: 'mentor-apply',
    caption: '지원신청서 작성',
    href: '/mentor/dashboard',
    cta: '케이스에서 작성',
  },
  {
    icon: FolderCheck,
    title: '부속서류 생성',
    desc: '동의·확약 등 부속서류(붙임3·4·6·8~12)를 업체 정보로 채워 PDF로 생성합니다. 첨부서류 안내를 참고해 멘티에게 필요한 서류를 요청하세요.',
    features: ['동의·확약 서식 PDF 생성', '생성 서식 팝업 열람', '첨부서류 안내 체크리스트'],
    screenshot: 'mentor-forms',
    caption: '동의·확약 부속서류',
    href: '/mentor/dashboard',
    cta: '케이스에서 생성',
  },
  {
    icon: Send,
    title: '멘토링 결과보고서 제출 → 이관',
    desc: '멘토링 결과보고서를 생성·제출하면 멘토님의 업무 범위가 완료됩니다. 이후 검수·승인·지급 절차는 (주)넥스트랩과 진흥원이 이어받아 진행합니다.',
    features: ['컨설팅 결과보고서 생성', '지원신청서 검수 요청(넥스트랩)', '이후 단계는 운영기관이 진행'],
    screenshot: 'mentor-report',
    caption: '결과보고서 생성',
    href: '/mentor/dashboard',
    cta: '케이스에서 제출',
  },
];

/**
 * 멘토 이용 안내 본문 (전체 여정 약식 + 멘토 여정 6단계 + FAQ).
 * 멘토 안내 페이지와 넥스트랩 회원 열람(view-as) 안내 탭에서 공용으로 사용한다.
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
            유형별 컨설팅 회차 · 비용 안내
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
              각 컨설팅은 <b className="text-primary">1회당 1시간</b> 기준,{' '}
              <b className="text-primary">시간당 12만원</b>입니다.
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
            이 중 <b className="text-primary">멘토링·서명</b> 및{' '}
            <b className="text-primary">지원신청서·부속서류</b> 단계가 멘토님의 주요 업무입니다.
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
