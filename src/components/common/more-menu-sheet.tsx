'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, LogOut, Menu } from 'lucide-react';

import { signOut } from '@/lib/auth/actions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface MoreMenuItem {
  href: string;
  label: string;
  /** 새 창으로 여는 정적 링크(이용안내 등) */
  external?: boolean;
  /** 보조 설명 한 줄 */
  hint?: string;
}

/**
 * 하단 탭바의 [더보기] 시트 (P31) — 폰에서 탭바 5칸에 들어가지 못한 나머지 메뉴(리포트·정산·조사·설정·이용안내·설치·로그아웃)를
 * 하단 시트(Dialog 모바일 변형)로 띄운다. 항목은 레이아웃에서 역할별로 넘긴다.
 */
export function MoreMenuSheet({ items, active = false, className }: { items: MoreMenuItem[]; active?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn('flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active ? 'text-primary' : 'text-muted-foreground', className)}
      >
        <Menu className={cn('h-5 w-5', active && 'text-primary')} />
        <span className="leading-none">더보기</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>전체 메뉴</DialogTitle>
          </DialogHeader>
          <ul className="grid grid-cols-2 gap-2">
            {items.map((it) => {
              const isActive = !it.external && (pathname === it.href.split('?')[0] || pathname.startsWith(`${it.href.split('?')[0]}/`));
              const cls = cn(
                'flex min-h-14 flex-col justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
                isActive ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:bg-accent',
              );
              if (it.external) {
                return (
                  <li key={it.href}>
                    <a href={it.href} target="_blank" rel="noreferrer" className={cls} onClick={() => setOpen(false)}>
                      <span className="inline-flex items-center gap-1">
                        {it.label} <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                      {it.hint && <span className="text-[11px] font-normal text-muted-foreground">{it.hint}</span>}
                    </a>
                  </li>
                );
              }
              return (
                <li key={it.href}>
                  <Link href={it.href} className={cls} onClick={() => setOpen(false)}>
                    <span>{it.label}</span>
                    {it.hint && <span className="text-[11px] font-normal text-muted-foreground">{it.hint}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <form action={signOut} className="mt-1">
            <button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 text-sm font-semibold text-destructive hover:bg-destructive/5">
              <LogOut className="h-4 w-4" /> 로그아웃
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
