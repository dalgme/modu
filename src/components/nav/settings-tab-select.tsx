'use client';

import { useRouter } from 'next/navigation';

export interface SettingsTabGroup {
  label: string;
  items: { key: string; label: string; href: string }[];
}

/** (P31) 운영 설정 메뉴 — 폰 전용 `<select>` (optgroup 3묶음). sm 이상은 칩 메뉴가 대신한다. */
export function SettingsTabSelect({ groups, value, className }: { groups: SettingsTabGroup[]; value: string; className?: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="운영 설정 메뉴"
      value={value}
      onChange={(e) => {
        const href = groups.flatMap((g) => g.items).find((i) => i.key === e.target.value)?.href;
        if (href) router.push(href);
      }}
      className={className ?? 'h-11 w-full rounded-lg border border-input bg-background px-3 text-base font-semibold sm:hidden'}
    >
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((i) => (
            <option key={i.key} value={i.key}>
              {i.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
