import 'server-only';

import crypto from 'node:crypto';

/**
 * Solapi(솔라피, 구 CoolSMS) v4 SMS/LMS 발송 클라이언트.
 * - 인증: HMAC-SHA256 (apiKey + apiSecret, 매 요청 date+salt 서명)
 * - 발신번호 2개(SOLAPI_SENDER_NUMBER_1/2) — senderIndex 로 선택
 * - 길이에 따라 SMS(≤90byte) / LMS 자동 전환
 * 키는 Vercel 환경변수로 주입한다(코드/저장소에 넣지 않음).
 */

const SOLAPI_BASE = 'https://api.solapi.com';

export type SolapiResult = { ok: true; providerId?: string } | { ok: false; error: string };

export function solapiConfigured(): boolean {
  return Boolean(
    process.env.SOLAPI_API_KEY &&
      process.env.SOLAPI_API_SECRET &&
      process.env.SOLAPI_SENDER_NUMBER_1,
  );
}

/** senderIndex(1|2) → 발신번호. 미설정 시 기본 발신번호로 폴백. */
export function solapiSender(senderIndex: 1 | 2 = 1): string | undefined {
  const primary = process.env.SOLAPI_SENDER_NUMBER_1;
  const secondary = process.env.SOLAPI_SENDER_NUMBER_2;
  return senderIndex === 2 ? (secondary ?? primary) : primary;
}

/** 전화번호 정규화: 숫자만 (Solapi 는 하이픈 없는 형식 권장) */
function normalizePhone(raw: string): string {
  return (raw.match(/[0-9]/g) ?? []).join('');
}

/** 한글 2byte 기준 바이트 길이 (SMS/LMS 판정용) */
function byteLength(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return n;
}

/** HMAC-SHA256 인증 헤더 (Authorization) 생성 — 자격증명은 호출 시점에만 메모리에 둔다 */
function authHeader(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(date + salt)
    .digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/**
 * 단건 SMS/LMS 발송. text 길이에 따라 자동으로 LMS 전환.
 * @param subject LMS 제목(선택). SMS 로 발송되면 무시된다.
 */
export async function sendSolapiSms(
  to: string,
  text: string,
  opts: {
    senderIndex?: 1 | 2;
    subject?: string;
    /** 행사별 자격증명(§21). 없으면 플랫폼 환경변수 */
    creds?: { apiKey: string; apiSecret: string; senderNumber: string };
  } = {},
): Promise<SolapiResult> {
  const apiKey = opts.creds?.apiKey ?? process.env.SOLAPI_API_KEY;
  const apiSecret = opts.creds?.apiSecret ?? process.env.SOLAPI_API_SECRET;
  const from = opts.creds?.senderNumber ?? solapiSender(opts.senderIndex ?? 1);
  if (!apiKey || !apiSecret) return { ok: false, error: 'solapi_not_configured' };
  if (!from) return { ok: false, error: 'solapi_sender_missing' };

  const isLms = byteLength(text) > 90;
  const message: Record<string, unknown> = {
    to: normalizePhone(to),
    from: normalizePhone(from),
    text,
    type: isLms ? 'LMS' : 'SMS',
  };
  if (isLms && opts.subject) message.subject = opts.subject.slice(0, 40);

  try {
    const res = await fetch(`${SOLAPI_BASE}/messages/v4/send`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(apiKey, apiSecret),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      messageId?: string;
      groupId?: string;
      statusCode?: string;
      statusMessage?: string;
      errorCode?: string;
      errorMessage?: string;
    };
    if (res.ok && (body.messageId || body.groupId)) {
      return { ok: true, providerId: body.messageId ?? body.groupId };
    }
    return {
      ok: false,
      error: body.errorMessage ?? body.statusMessage ?? `solapi_http_${res.status}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'solapi_network_error' };
  }
}

export interface SolapiMessage {
  messageId: string;
  /** 일괄발송 배치 식별자 — 같은 groupId 는 한 번에 보낸 동일 발송 건 */
  groupId: string;
  to: string;
  from: string;
  type: string;
  text: string;
  status: string;
  statusMessage: string;
  dateReceived: string;
}

/** Solapi 상태코드/상태 → 한글 라벨 */
export function solapiStatusLabel(status: string, statusMessage?: string): string {
  const map: Record<string, string> = {
    PENDING: '대기',
    SENDING: '발송중',
    COMPLETE: '발송완료',
    FAILED: '실패',
    CANCELED: '취소',
  };
  return map[status] ?? statusMessage ?? status ?? '-';
}

function mapSolapiMessage(id: string, m: Record<string, unknown>): SolapiMessage {
  return {
    messageId: (m.messageId as string) ?? id,
    groupId: (m.groupId as string) ?? '',
    to: (m.to as string) ?? '',
    from: (m.from as string) ?? '',
    type: (m.type as string) ?? 'SMS',
    text: (m.text as string) ?? '',
    status: (m.status as string) ?? '',
    statusMessage: (m.statusMessage as string) ?? '',
    dateReceived:
      (m.dateReceived as string) ?? (m.dateCreated as string) ?? (m.dateUpdated as string) ?? '',
  };
}

async function fetchSolapiList(limit: number, from?: string): Promise<SolapiMessage[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (from) params.set('from', from);
  const res = await fetch(`${SOLAPI_BASE}/messages/v4/list?${params.toString()}`, {
    headers: { Authorization: authHeader(process.env.SOLAPI_API_KEY ?? '', process.env.SOLAPI_API_SECRET ?? '') },
  });
  const body = (await res.json().catch(() => ({}))) as {
    messageList?: Record<string, Record<string, unknown>>;
    errorMessage?: string;
  };
  if (!res.ok) throw new Error(body.errorMessage ?? `solapi_http_${res.status}`);
  return Object.entries(body.messageList ?? {}).map(([id, m]) => mapSolapiMessage(id, m));
}

/**
 * 발송 리스트 조회 (최근순, 세부 상태 포함).
 * ⚠️ Solapi 발송내역은 API Key 가 아니라 "계정" 단위로 저장된다(새 키를 발급해도 같은 계정의
 *    전체 이력이 조회됨). 이 서비스가 보낸 문자만 보려면 우리 발신번호로 구분한다.
 * @param onlyOurSenders 기본 true — SOLAPI_SENDER_NUMBER_1/2 발신번호 기준으로 필터.
 *                       false 면 계정 전체(다른 서비스 발송 포함) 조회.
 */
export async function getSolapiMessages(
  limit = 20,
  onlyOurSenders = true,
): Promise<{ ok: true; messages: SolapiMessage[] } | { ok: false; error: string }> {
  if (!solapiConfigured()) return { ok: false, error: 'solapi_not_configured' };

  const ourSenders = Array.from(
    new Set(
      [solapiSender(1), solapiSender(2)]
        .filter((s): s is string => Boolean(s))
        .map((s) => normalizePhone(s)),
    ),
  );

  try {
    let messages: SolapiMessage[];
    if (onlyOurSenders && ourSenders.length > 0) {
      // 발신번호별 서버측 필터 조회 후 병합 (API 가 from 필터를 무시해도 아래 in-memory 필터로 보정)
      const batches = await Promise.all(ourSenders.map((s) => fetchSolapiList(limit, s)));
      const byId = new Map<string, SolapiMessage>();
      for (const batch of batches) for (const m of batch) byId.set(m.messageId, m);
      messages = Array.from(byId.values()).filter((m) =>
        ourSenders.includes(normalizePhone(m.from)),
      );
    } else {
      messages = await fetchSolapiList(limit);
    }
    messages.sort((a, b) => (a.dateReceived < b.dateReceived ? 1 : -1));
    return { ok: true, messages: messages.slice(0, limit) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'solapi_network_error' };
  }
}

/** 잔액 조회 (관리자 확인용) */
export async function getSolapiBalance(): Promise<
  { ok: true; balance: number; point: number } | { ok: false; error: string }
> {
  if (!solapiConfigured()) return { ok: false, error: 'solapi_not_configured' };
  try {
    const res = await fetch(`${SOLAPI_BASE}/cash/v1/balance`, {
      headers: { Authorization: authHeader(process.env.SOLAPI_API_KEY ?? '', process.env.SOLAPI_API_SECRET ?? '') },
    });
    const body = (await res.json().catch(() => ({}))) as {
      balance?: number;
      point?: number;
      errorMessage?: string;
    };
    if (res.ok && typeof body.balance === 'number') {
      return { ok: true, balance: body.balance, point: body.point ?? 0 };
    }
    return { ok: false, error: body.errorMessage ?? `solapi_http_${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'solapi_network_error' };
  }
}
