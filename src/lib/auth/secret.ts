import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/**
 * 타이밍 공격에 안전한 시크릿 문자열 비교.
 * 길이가 다르거나 둘 중 하나가 비어 있으면 false. (부트스트랩 토큰·Cron 시크릿 검증용)
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
