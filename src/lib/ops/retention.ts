import { DEFAULT_RETENTION_YEARS } from '@/lib/programs/branding';

/**
 * 보존기간 계산 (P35-B). 순수 함수 — Cron retention-check 와 플랫폼 콘솔이 같은 함수를 쓴다.
 * 보존 만료일 = 행사 종료일(ends_on, KST 자정) + retention_years 년. ends_on 없으면 null.
 */
export function retentionExpiry(endsOn: string | null, years: number | null | undefined): Date | null {
  if (!endsOn) return null;
  const d = new Date(`${endsOn}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCFullYear(d.getUTCFullYear() + (years && years > 0 ? years : DEFAULT_RETENTION_YEARS));
  return d;
}

/** KST 날짜 문자열 yyyy-mm-dd */
export function kstDateString(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
}

export type PrivacyOfficerEntry = { name?: string | null; phone?: string | null; email?: string | null };
export type PrivacyOfficer = { client?: PrivacyOfficerEntry | null; operator?: PrivacyOfficerEntry | null };

export function parsePrivacyOfficer(v: unknown): PrivacyOfficer {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const pick = (x: unknown): PrivacyOfficerEntry | null => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const e = x as Record<string, unknown>;
    return { name: typeof e.name === 'string' ? e.name : null, phone: typeof e.phone === 'string' ? e.phone : null, email: typeof e.email === 'string' ? e.email : null };
  };
  return { client: pick(o.client), operator: pick(o.operator) };
}
