import Link from 'next/link';

import { requirePlatformAdmin } from '@/lib/auth/guards';
import { PLATFORM_BRANDING } from '@/lib/programs/branding';
import { AppHeader } from '@/components/common/app-header';

/** 플랫폼 관리자 콘솔 — 행사 개설·복제·계정. 컨텍스트(행사) 밖에서 동작한다. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const profile = await requirePlatformAdmin();
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader name={profile.name} role={profile.role} branding={PLATFORM_BRANDING} />
      <nav className="sticky top-14 z-30 border-b bg-background/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 py-2 text-sm font-semibold">
          <Link href="/platform" className="rounded-lg px-3.5 py-2 hover:bg-accent">행사 목록</Link>
          <Link href="/platform/new" className="rounded-lg px-3.5 py-2 hover:bg-accent">행사 개설</Link>
          <Link href="/platform/admins" className="rounded-lg px-3.5 py-2 hover:bg-accent">플랫폼 관리자</Link>
          <Link href="/hub" className="ml-auto rounded-lg px-3.5 py-2 text-muted-foreground hover:bg-accent">허브로</Link>
        </div>
      </nav>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
