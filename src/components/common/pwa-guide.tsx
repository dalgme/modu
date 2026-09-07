import { Smartphone, Share, SquarePlus, MoreVertical, Download } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * PWA(홈 화면 추가) 설치 안내 — 일반 사용자가 이해하기 쉬운 표현으로 설명한다.
 * 발주처 '플랫폼 안내' · 멘토 '이용안내' 등에서 공용으로 사용.
 */
export function PwaGuide() {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Smartphone className="h-5 w-5 text-primary" />
        휴대폰에 ‘앱처럼’ 설치해서 쓰기
      </h2>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 text-sm leading-relaxed text-muted-foreground">
          이 시스템은 <b className="text-foreground">앱스토어(플레이스토어)에서 따로 내려받지
          않아도</b> 됩니다. 휴대폰 인터넷으로 한 번 접속한 뒤{' '}
          <b className="text-foreground">‘홈 화면에 추가’</b>를 해 두면, 바탕화면에 아이콘이 생겨
          다음부터는 <b className="text-foreground">아이콘만 눌러 앱처럼 바로</b> 열 수 있습니다.
          현장에서 주소를 매번 입력할 필요가 없어 편리합니다.
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* 아이폰 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">아이폰 (사파리)</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2 text-sm">
              <li className="flex gap-2">
                <span className="font-semibold text-primary">1.</span>
                <span>
                  <b>사파리(Safari)</b> 브라우저로 이 사이트에 접속합니다.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">2.</span>
                <span className="flex flex-wrap items-center gap-1">
                  화면 아래쪽의 <Share className="inline h-4 w-4 text-foreground" />
                  <b>공유 버튼</b>(네모에서 화살표가 올라오는 모양)을 누릅니다.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">3.</span>
                <span className="flex flex-wrap items-center gap-1">
                  목록을 내려 <SquarePlus className="inline h-4 w-4 text-foreground" />
                  <b>‘홈 화면에 추가’</b>를 누릅니다.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">4.</span>
                <span>
                  오른쪽 위 <b>‘추가’</b>를 누르면 바탕화면에 아이콘이 생깁니다.
                </span>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* 안드로이드 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">안드로이드 (크롬)</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2 text-sm">
              <li className="flex gap-2">
                <span className="font-semibold text-primary">1.</span>
                <span>
                  <b>크롬(Chrome)</b> 브라우저로 이 사이트에 접속합니다.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">2.</span>
                <span className="flex flex-wrap items-center gap-1">
                  오른쪽 위 <MoreVertical className="inline h-4 w-4 text-foreground" />
                  <b>점 세 개(⋮) 메뉴</b>를 누릅니다.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">3.</span>
                <span className="flex flex-wrap items-center gap-1">
                  <Download className="inline h-4 w-4 text-foreground" />
                  <b>‘앱 설치’</b> 또는 <b>‘홈 화면에 추가’</b>를 누릅니다.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">4.</span>
                <span>
                  <b>‘설치’</b>를 누르면 바탕화면·앱 목록에 아이콘이 생깁니다.
                </span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>

      <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        💡 설치해도 <b>새 앱을 받는 것이 아니라</b> 바로가기 아이콘이 생기는 것이라 저장공간을 거의
        차지하지 않습니다. 로그인 정보도 그대로 유지되어, 다음부터는 아이콘만 눌러 접속하면 됩니다.
      </p>
    </div>
  );
}
