/**
 * 보안 이벤트 순수 규칙 (P35-B) — 라벨·승격 판정·로그인 실패 폭주 판정. server-only 가 없어 vitest·클라이언트에서도 import 가능.
 * 저장·조회는 `security-events.ts`(서비스롤).
 */
export type SecuritySeverity = 'info' | 'warn' | 'critical';
export type SecurityKind = 'scan' | 'impersonation' | 'export' | 'denied' | 'bruteforce';

export const SECURITY_KIND_LABELS: Record<SecurityKind, string> = {
  scan: '스캐너·비정상 요청',
  impersonation: '대행 시작',
  export: '대량 반출(엑셀·ZIP)',
  denied: '권한 거부',
  bruteforce: '로그인 실패 폭주',
};
export const SECURITY_SEVERITY_LABELS: Record<SecuritySeverity, string> = { info: '정보', warn: '주의', critical: '심각' };

export function securityKindLabel(kind: string): string {
  return (SECURITY_KIND_LABELS as Record<string, string>)[kind] ?? kind;
}

/** 승격 규칙 — 집계(Cron·콘솔)와 통보 판정이 같은 상수를 읽는다 */
export const ESCALATION = {
  /** 같은 사용자 반출 N회/10분 → warn */
  exportPerUser: { count: 5, windowMin: 10 },
  /** 같은 사용자 권한 거부 N회/10분 → warn */
  deniedPerUser: { count: 10, windowMin: 10 },
  /** 같은 IP 로그인 실패 N회/10분 → critical */
  bruteforcePerIp: { count: 20, windowMin: 10 },
  /** 같은 IP 가 서로 다른 계정 N개 이상 실패/10분 → critical */
  bruteforceAccounts: { count: 5, windowMin: 10 },
} as const;

export type UnalertedLike = { id: string; kind: string; severity: string; user_id: string | null; created_at: string };

/**
 * 승격 판정 — info 이벤트라도 같은 사용자의 반출·권한 거부가 창(10분) 안에 임계치를 넘으면 warn 으로 본다.
 * 순수 함수(vitest). 반환: 각 이벤트의 유효 심각도 + 승격 사유 목록.
 */
export function escalate(rows: UnalertedLike[], now = Date.now()): {
  effective: Map<string, SecuritySeverity>;
  reasons: string[];
} {
  const effective = new Map<string, SecuritySeverity>();
  const reasons: string[] = [];
  for (const r of rows) effective.set(r.id, (r.severity as SecuritySeverity) ?? 'info');

  const bump = (kind: 'export' | 'denied', rule: { count: number; windowMin: number }, label: string) => {
    const byUser = new Map<string, typeof rows>();
    for (const r of rows) {
      if (r.kind !== kind || !r.user_id) continue;
      if (now - new Date(r.created_at).getTime() > rule.windowMin * 60_000) continue;
      const list = byUser.get(r.user_id) ?? [];
      list.push(r);
      byUser.set(r.user_id, list);
    }
    byUser.forEach((list, userId) => {
      if (list.length < rule.count) return;
      for (const r of list) if (effective.get(r.id) === 'info') effective.set(r.id, 'warn');
      reasons.push(`${label} ${list.length}회/${rule.windowMin}분 (사용자 ${userId.slice(0, 8)})`);
    });
  };
  bump('export', ESCALATION.exportPerUser, '대량 반출');
  bump('denied', ESCALATION.deniedPerUser, '권한 거부');
  return { effective, reasons };
}

export interface LoginAttemptLike {
  ip_hash: string | null;
  identifier: string | null;
  failed: boolean;
  created_at: string;
}

/** 순수 판정 — 같은 IP 실패 N회 또는 서로 다른 계정 M개 실패 → 대상 IP 목록 */
export function detectBruteforce(attempts: LoginAttemptLike[]): { ipHash: string; failures: number; accounts: number }[] {
  const byIp = new Map<string, { failures: number; accounts: Set<string> }>();
  for (const a of attempts) {
    if (!a.failed || !a.ip_hash) continue;
    const e = byIp.get(a.ip_hash) ?? { failures: 0, accounts: new Set<string>() };
    e.failures += 1;
    if (a.identifier) e.accounts.add(a.identifier.toLowerCase());
    byIp.set(a.ip_hash, e);
  }
  const out: { ipHash: string; failures: number; accounts: number }[] = [];
  byIp.forEach((e, ipHash) => {
    if (e.failures >= ESCALATION.bruteforcePerIp.count || e.accounts.size >= ESCALATION.bruteforceAccounts.count) {
      out.push({ ipHash, failures: e.failures, accounts: e.accounts.size });
    }
  });
  return out;
}

