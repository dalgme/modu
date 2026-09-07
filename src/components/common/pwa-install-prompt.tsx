'use client';

import { useEffect, useState } from 'react';
import { Share, SquarePlus, X, Download, Smartphone, Compass, MoreVertical } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** 최근 닫음 기록 키 — 닫으면 14일간 다시 뜨지 않는다. */
const DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Platform = 'android' | 'android-inapp' | 'ios-safari' | 'ios-inapp';

/** 이미 홈 화면 앱(standalone)으로 실행 중인지 */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** 최근에 닫았는지 (14일 이내면 다시 표시하지 않음) */
function recentlyDismissed(): boolean {
  try {
    const ts = window.localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * PWA 설치 안내 배너 (모바일 전용 자동 노출). 현장 모바일 접속 편의용이라 데스크톱에서는 뜨지 않는다.
 *  - 아이폰(사파리): iOS 는 자동 설치 프롬프트가 없으므로 '공유 → 홈 화면에 추가' 절차를 직접 안내한다.
 *  - 아이폰(웨일·크롬·네이버·카카오 등): 애플 정책상 사파리만 설치 가능 → 사파리로 열도록 안내한다.
 *  - 안드로이드(크롬·웨일·삼성 등 정식 브라우저): beforeinstallprompt 를 가로채 '설치' 버튼 제공.
 *  - 안드로이드(네이버·카카오 등 인앱 브라우저): 웹뷰라 설치 불가 → 외부 브라우저로 열도록 안내한다.
 * 이미 설치(standalone)됐거나 최근 14일 내 닫았으면 표시하지 않는다.
 */
export function PwaInstallPrompt() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone() || recentlyDismissed()) return;

    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS =
      /iphone|ipad|ipod/.test(ua) ||
      // iPadOS 13+ 는 데스크톱 UA 로 위장 → 터치 지원으로 보정
      (/macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
    const isAndroid = /android/.test(ua);

    // 앱 속 웹뷰(인앱 브라우저) — 홈 화면 추가 불가. 웨일·크롬 등 정식 브라우저는 제외.
    const inApp =
      /kakaotalk|naver|instagram|fban|fbav|fb_iab|line\/|daumapps|band|everytimeapp|snapchat/.test(
        ua,
      );

    if (isIOS) {
      // iOS 는 사파리만 홈 화면 추가 가능 (웨일·크롬·파폭·인앱 모두 불가)
      const iosNonSafari = /crios|fxios|edgios|whale/.test(ua) || inApp;
      setPlatform(iosNonSafari ? 'ios-inapp' : 'ios-safari');
      setVisible(true);
      return;
    }

    if (isAndroid) {
      if (inApp) {
        setPlatform('android-inapp');
        setVisible(true);
        return;
      }
      // 정식 안드로이드 브라우저(크롬·웨일·삼성 등): 설치 가능 시점에 이벤트가 온다
      const onBeforeInstall = (e: Event) => {
        e.preventDefault();
        setDeferred(e as BeforeInstallPromptEvent);
        setPlatform('android');
        setVisible(true);
      };
      window.addEventListener('beforeinstallprompt', onBeforeInstall);
      const onInstalled = () => setVisible(false);
      window.addEventListener('appinstalled', onInstalled);
      return () => {
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    // 데스크톱(윈도우·맥 등)은 현장 모바일 접속용 기능이 아니므로 배너를 띄우지 않는다.
    return;
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* 저장 실패 무시 */
    }
  }

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* 사용자 취소 등 무시 */
    }
    setDeferred(null);
    dismiss();
  }

  /**
   * 안드로이드 인앱 브라우저(네이버·카카오 등)에서 현재 페이지를 크롬으로 다시 연다.
   * intent:// 스킴으로 크롬 패키지를 지정하고, 크롬 미설치 시 기본 브라우저로 폴백한다.
   * 크롬으로 열리면 그 곳에서 '홈 화면에 추가'로 설치할 수 있다.
   */
  function openInChrome() {
    const href = window.location.href;
    const hostAndPath = href.replace(/^https?:\/\//, '');
    const intentUrl =
      `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;` +
      `S.browser_fallback_url=${encodeURIComponent(href)};end`;
    window.location.href = intentUrl;
  }

  if (!visible || !platform) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">휴대폰에 앱처럼 설치하기</p>

            {platform === 'android' && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                홈 화면에 추가하면 다음부터 아이콘만 눌러 바로 접속할 수 있습니다. 저장공간은 거의
                차지하지 않습니다.
              </p>
            )}

            {platform === 'ios-safari' && (
              <div className="mt-1.5 flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <span>아이폰은 아래 순서로 직접 추가합니다.</span>
                <span className="flex flex-wrap items-center gap-1">
                  <span className="font-semibold text-primary">1.</span>
                  화면 아래 <Share className="inline h-4 w-4 text-foreground" />
                  <b className="text-foreground">공유</b> 버튼을 누르고
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <span className="font-semibold text-primary">2.</span>
                  목록을 내려 <SquarePlus className="inline h-4 w-4 text-foreground" />
                  <b className="text-foreground">‘홈 화면에 추가’</b>를 누릅니다.
                </span>
              </div>
            )}

            {platform === 'ios-inapp' && (
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-muted-foreground">
                지금은 다른 앱 안의 브라우저로 열려 있어 설치할 수 없습니다. 아이폰은{' '}
                <Compass className="inline h-4 w-4 text-foreground" />
                <b className="text-foreground">사파리(Safari)</b>에서만 홈 화면에 추가할 수 있으니,
                사파리로 열어 다시 시도해 주세요.
              </p>
            )}

            {platform === 'android-inapp' && (
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-muted-foreground">
                지금은 앱 안의 브라우저(네이버·카카오 등)로 열려 있어 여기서는 설치할 수 없습니다.
                아래 <b className="text-foreground">‘크롬으로 열기’</b>를 누르면 크롬으로 이동하며,
                거기서 홈 화면에 추가해 설치할 수 있습니다. (버튼이 동작하지 않으면 화면의{' '}
                <MoreVertical className="inline h-4 w-4 text-foreground" />
                <b className="text-foreground">메뉴(⋮) → ‘다른 브라우저로 열기’</b>를 이용하세요.)
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="닫기"
            className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {platform === 'android' && (
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
              나중에
            </Button>
            <Button type="button" size="sm" onClick={install} className="gap-1.5">
              <Download className="h-4 w-4" />앱 설치
            </Button>
          </div>
        )}

        {platform === 'android-inapp' && (
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
              나중에
            </Button>
            <Button type="button" size="sm" onClick={openInChrome} className="gap-1.5">
              <Compass className="h-4 w-4" />크롬으로 열기
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
