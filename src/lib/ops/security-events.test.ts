import { describe, expect, it } from 'vitest';

import { detectBruteforce, escalate, ESCALATION } from './security-rules';

const at = (minAgo: number, now: number) => new Date(now - minAgo * 60_000).toISOString();

describe('escalate (P35-B 승격 규칙)', () => {
  const now = Date.UTC(2026, 8, 28, 3, 0, 0);
  it('같은 사용자 반출 5회/10분 → warn 승격, 다른 사용자는 info 유지', () => {
    const rows = [
      ...Array.from({ length: ESCALATION.exportPerUser.count }, (_, i) => ({ id: `a${i}`, kind: 'export', severity: 'info', user_id: 'u1', created_at: at(i, now) })),
      { id: 'b0', kind: 'export', severity: 'info', user_id: 'u2', created_at: at(1, now) },
    ];
    const { effective, reasons } = escalate(rows, now);
    expect(effective.get('a0')).toBe('warn');
    expect(effective.get('b0')).toBe('info');
    expect(reasons).toHaveLength(1);
  });
  it('창(10분) 밖의 반출은 세지 않는다', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, kind: 'export', severity: 'info', user_id: 'u1', created_at: at(i === 0 ? 1 : 30, now) }));
    const { effective } = escalate(rows, now);
    expect(effective.get('a0')).toBe('info');
  });
  it('권한 거부 10회/10분 → warn, critical 은 그대로', () => {
    const rows = [
      ...Array.from({ length: ESCALATION.deniedPerUser.count }, (_, i) => ({ id: `d${i}`, kind: 'denied', severity: 'info', user_id: 'u1', created_at: at(i, now) })),
      { id: 'c0', kind: 'bruteforce', severity: 'critical', user_id: null, created_at: at(1, now) },
    ];
    const { effective } = escalate(rows, now);
    expect(effective.get('d9')).toBe('warn');
    expect(effective.get('c0')).toBe('critical');
  });
});

describe('detectBruteforce', () => {
  const base = { created_at: new Date().toISOString() };
  it('같은 IP 실패 20회 → 대상', () => {
    const attempts = Array.from({ length: ESCALATION.bruteforcePerIp.count }, () => ({ ...base, ip_hash: 'ip1', identifier: 'a@x', failed: true }));
    expect(detectBruteforce(attempts)).toEqual([{ ipHash: 'ip1', failures: 20, accounts: 1 }]);
  });
  it('서로 다른 계정 5개 실패 → 대상, 성공 기록은 무시', () => {
    const attempts = [
      ...Array.from({ length: ESCALATION.bruteforceAccounts.count }, (_, i) => ({ ...base, ip_hash: 'ip2', identifier: `u${i}@x`, failed: true })),
      { ...base, ip_hash: 'ip3', identifier: 'ok@x', failed: false },
    ];
    const hits = detectBruteforce(attempts);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.ipHash).toBe('ip2');
    expect(hits[0]!.accounts).toBe(5);
  });
  it('임계치 미만은 없음', () => {
    expect(detectBruteforce([{ ...base, ip_hash: 'ip4', identifier: 'a@x', failed: true }])).toEqual([]);
  });
});
