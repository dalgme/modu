import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FileViewerProvider } from '@/components/common/file-viewer';
import { PwaRegister } from '@/components/common/pwa-register';
import { PwaInstallPrompt } from '@/components/common/pwa-install-prompt';
import { ImpersonationBanner } from '@/components/common/impersonation-banner';

// Pretendard 가변 폰트 (한글 UI 기본)
const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  weight: '45 920',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '멘토링 운영관리 플랫폼',
  description: '멘토링 프로그램 운영관리 시스템',
  // 내부 업무도구 — 전체 페이지 검색 비노출 (CLAUDE.md 14절)
  robots: { index: false, follow: false, nocache: true },
  applicationName: '멘토링',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '멘토링',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#ef6148',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="min-h-[100dvh] bg-background font-sans antialiased">
        {/* 대행(view-as) 중이면 모든 화면 최상단에 경고 배너 (대행이 아니면 렌더 없음) */}
        <ImpersonationBanner />
        <FileViewerProvider>{children}</FileViewerProvider>
        <Toaster />
        <PwaRegister />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
