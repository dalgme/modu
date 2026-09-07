import Image from 'next/image';
import { Users } from 'lucide-react';

import { PwaGuide } from '@/components/common/pwa-guide';
import { Card, CardContent } from '@/components/ui/card';

/**
 * '휴대폰 설치' 안내 본문 — 앱 아이콘 미리보기 + 설치 방법(PwaGuide) + 멘티도 사용 가능 안내.
 * 멘토 '휴대폰 설치' 메뉴에서 사용. 일반 사용자도 이해하기 쉬운 표현으로 구성.
 */
export function PwaInstallGuide() {
  return (
    <div className="flex flex-col gap-6">
      {/* 앱 아이콘 미리보기 — 바탕화면에서 이 아이콘을 찾도록 */}
      <Card className="border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30">
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center sm:flex-row sm:text-left">
          <div className="flex flex-col items-center gap-1.5">
            <Image
              src="/icon-192.png"
              alt="재기지원 앱 아이콘"
              width={72}
              height={72}
              className="rounded-2xl border bg-white shadow-md"
            />
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              재기지원
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold">휴대폰에 앱처럼 설치해 두세요</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              한 번만 설치하면 휴대폰 바탕화면에{' '}
              <b className="text-foreground">위와 같은 아이콘</b>이 생깁니다. 다음부터는 인터넷 주소를
              입력할 필요 없이 <b className="text-foreground">아이콘만 눌러</b> 현장에서 바로 접속할 수
              있습니다. (별도 앱스토어 설치가 아니라 바로가기라 저장공간도 거의 차지하지 않습니다.)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 아이폰 / 안드로이드 설치 방법 */}
      <PwaGuide />

      {/* 멘티도 사용 가능 안내 */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <b className="text-foreground">멘티(참여기업)</b>도 똑같이 설치할 수 있습니다. 멘티가
            휴대폰으로 로그인하면 화면 아래에 설치 안내가 자동으로 뜨며, 위와 같은 방법으로 홈 화면에
            추가하면 됩니다. 멘티가 어려워하면 이 안내를 함께 보여 주세요.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
