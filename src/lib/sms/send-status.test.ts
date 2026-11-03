import { describe, expect, it } from 'vitest';

import { classifySolapiStatus, countStatuses, describeSmsReason, isRetryable } from './send-status';

describe('classifySolapiStatus', () => {
  it('4000 = 수신 완료, 2000·3000 = 전송 중, 그 밖의 코드 = 실패', () => {
    expect(classifySolapiStatus('4000', 'COMPLETE')).toBe('delivered');
    expect(classifySolapiStatus('2000', 'PENDING')).toBe('pending');
    expect(classifySolapiStatus('3000', 'SENDING')).toBe('pending');
    expect(classifySolapiStatus('3059', 'COMPLETE')).toBe('failed');
    expect(classifySolapiStatus('', 'FAILED')).toBe('failed');
    expect(classifySolapiStatus(null, null)).toBe('pending');
  });
});

describe('isRetryable / countStatuses / describeSmsReason', () => {
  it('접수 실패·수신 실패만 다시 보낼 대상', () => {
    expect(['rejected', 'failed', 'pending', 'delivered'].filter(isRetryable)).toEqual(['rejected', 'failed']);
    expect(countStatuses(['delivered', 'delivered', 'failed', 'rejected', 'pending'])).toEqual({ total: 5, rejected: 1, pending: 1, delivered: 2, failed: 1 });
  });
  it('호출 한도 거부는 쉬운 말로', () => {
    expect(describeSmsReason('429', 'TooManyRequests')).toContain('너무 몰려');
    expect(describeSmsReason('3041', '착신 거부')).toBe('착신 거부 (코드 3041)');
    expect(describeSmsReason('3059', '변작된 발신번호')).toContain('발신번호 문제');
    expect(describeSmsReason(null, null)).toBe('');
  });
});
