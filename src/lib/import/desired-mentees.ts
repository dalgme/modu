/**
 * 라운드별 멘토 희망 멘티 수 엑셀 → 멘토 대조 (2026-10-23). 서버·테스트 공용 순수 함수.
 *
 * 규칙: 멘토명으로 찾는다. 같은 이름의 멘토가 둘 이상이면 전화번호로, 그래도 못 가리면 이메일로 구분한다.
 * 희망 멘티 수 = 0~99 정수. 빈 칸·'-' 는 값 해제(null).
 */
import { normalizeEmail, normalizePhone } from '@/lib/utils/phone';

export interface DesiredMentor {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface DesiredRow {
  line: number;
  name: string;
  phone: string;
  email: string;
  desired: string;
}

export interface DesiredMatchResult {
  /** 멘토 id → 희망 멘티 수(null = 해제) */
  values: Map<string, number | null>;
  notFound: string[];
  ambiguous: string[];
  invalid: string[];
  /** 같은 멘토가 여러 행이면 마지막 행 적용 */
  duplicate: string[];
}

const nameKey = (v: string) => v.normalize('NFKC').replace(/\s+/g, '');

export function parseDesired(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.normalize('NFKC').trim().replace(/명$/, '').trim();
  if (t === '' || t === '-') return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 99) return { ok: false };
  return { ok: true, value: n };
}

export function matchDesiredRows(rows: DesiredRow[], mentors: DesiredMentor[]): DesiredMatchResult {
  const byName = new Map<string, DesiredMentor[]>();
  for (const m of mentors) {
    const k = nameKey(m.name);
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(m);
  }
  const out: DesiredMatchResult = { values: new Map(), notFound: [], ambiguous: [], invalid: [], duplicate: [] };
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) continue;
    const label = `${r.line}행 ${name}`;
    const parsed = parseDesired(r.desired);
    if (!parsed.ok) {
      out.invalid.push(`${label}: '${r.desired}' (0~99 정수, 비우거나 '-' 는 해제)`);
      continue;
    }
    let hits = byName.get(nameKey(name)) ?? [];
    if (hits.length > 1) {
      const phone = normalizePhone(r.phone);
      if (phone) hits = hits.filter((m) => normalizePhone(m.phone ?? '') === phone);
      if (hits.length !== 1) {
        const email = normalizeEmail(r.email);
        const pool = byName.get(nameKey(name)) ?? [];
        const byEmail = email ? pool.filter((m) => normalizeEmail(m.email ?? '') === email) : [];
        if (byEmail.length === 1) hits = byEmail;
      }
      if (hits.length !== 1) {
        out.ambiguous.push(`${label} (같은 이름 ${(byName.get(nameKey(name)) ?? []).length}명 — 등록된 전화번호와 일치하지 않음)`);
        continue;
      }
    }
    if (hits.length === 0) {
      out.notFound.push(`${label} (이 행사에 등록된 멘토가 아님)`);
      continue;
    }
    const id = hits[0]!.id;
    if (out.values.has(id)) out.duplicate.push(label);
    out.values.set(id, parsed.value);
  }
  return out;
}
