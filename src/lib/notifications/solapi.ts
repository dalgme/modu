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
 * 솔라피 호출 한도 (2026-11-03) — 발송 API 는 계정당 5초에 100회. 넘으면 HTTP 429 TooManyRequests 로 거부된다.
 * 예전 일괄 발송은 1명당 1회 호출을 10건씩 쉬지 않고 보내 100·200건 이후가 전부 거부됐다(407명 중 200명만 발송).
 * 이 함수 하나로 모든 호출을 5초에 80회 이하로 늦추고, 429 를 받으면 x-retry-after 만큼 기다렸다가 최대 3번 다시 보낸다.
 * (한 서버 인스턴스 안에서의 속도 조절 — 대량 발송은 send-many 1회 호출을 쓴다)
 */
const WINDOW_MS = 5000;
const WINDOW_MAX = 80;
const recentCalls: number[] = [];
let slotChain: Promise<void> = Promise.resolve();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function acquireSlot(): Promise<void> {
  const next = slotChain.then(async () => {
    for (;;) {
      const now = Date.now();
      while (recentCalls.length && now - recentCalls[0]! >= WINDOW_MS) recentCalls.shift();
      if (recentCalls.length < WINDOW_MAX) {
        recentCalls.push(now);
        return;
      }
      await sleep(WINDOW_MS - (now - recentCalls[0]!) + 20);
    }
  });
  slotChain = next.catch(() => undefined);
  return next;
}

/** 한도 조절 + 429 재시도. build 는 매 시도마다 새 인증 헤더(date·salt)를 만들도록 함수로 받는다 */
async function solapiFetch(build: () => { url: string; init: RequestInit }, retries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    await acquireSlot();
    const { url, init } = build();
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= retries) return res;
    const after = Number(res.headers.get('x-retry-after') ?? res.headers.get('retry-after') ?? '');
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 10) * 1000 : 2000 * (attempt + 1));
  }
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
    const res = await solapiFetch(() => ({
      url: `${SOLAPI_BASE}/messages/v4/send`,
      init: {
        method: 'POST',
        headers: {
          Authorization: authHeader(apiKey, apiSecret),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      },
    }));
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

// ───────────────────────── 일괄 발송·결과 조회 (2026-11-03) ─────────────────────────

export interface SolapiCreds {
  apiKey: string;
  apiSecret: string;
  senderNumber: string;
}

export interface ManyMessageInput {
  /** 우리 쪽 식별자 — customFields.ref 로 보내 결과를 되짚는다 */
  ref: string;
  to: string;
  text: string;
  subject?: string;
}

export interface ManyMessageResult {
  ref: string;
  /** 솔라피가 접수했는가 (false = 접수 거부 — 번호 오류·수신거부·잔액 등) */
  accepted: boolean;
  messageId: string | null;
  groupId: string | null;
  statusCode: string | null;
  reason: string | null;
}

/** 실패한 HTTP 응답의 오류 문구 */
async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { errorCode?: string; errorMessage?: string };
  return body.errorMessage ?? body.errorCode ?? `solapi_http_${res.status}`;
}

/**
 * 일괄 발송 — POST /messages/v4/send-many/detail (한 번에 최대 10,000건, 여기서는 500건씩).
 * 수신자마다 문구가 달라도 한 번의 호출이라 호출 한도에 걸리지 않는다.
 * 응답: failedMessageList(접수 거부 — statusMessage 가 사유) + messageList(showMessageList=true, 접수된 messageId) + groupInfo.groupId.
 * 각 메시지에 customFields.ref 를 실어 보내 결과를 수신자에 다시 붙인다(없으면 수신번호로 대조).
 */
export async function sendSolapiMany(items: ManyMessageInput[], creds: SolapiCreds): Promise<ManyMessageResult[]> {
  const from = normalizePhone(creds.senderNumber);
  const out: ManyMessageResult[] = [];
  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const messages = chunk.map((m) => {
      const isLms = byteLength(m.text) > 90;
      const msg: Record<string, unknown> = { to: normalizePhone(m.to), from, text: m.text, type: isLms ? 'LMS' : 'SMS', customFields: { ref: m.ref } };
      if (isLms && m.subject) msg.subject = m.subject.slice(0, 40);
      return msg;
    });
    let res: Response;
    try {
      res = await solapiFetch(() => ({
        url: `${SOLAPI_BASE}/messages/v4/send-many/detail`,
        init: {
          method: 'POST',
          headers: { Authorization: authHeader(creds.apiKey, creds.apiSecret), 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, allowDuplicates: true, showMessageList: true }),
        },
      }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'solapi_network_error';
      for (const m of chunk) out.push({ ref: m.ref, accepted: false, messageId: null, groupId: null, statusCode: null, reason });
      continue;
    }
    if (!res.ok) {
      const reason = await errorText(res);
      for (const m of chunk) out.push({ ref: m.ref, accepted: false, messageId: null, groupId: null, statusCode: String(res.status), reason });
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as {
      groupInfo?: { groupId?: string };
      failedMessageList?: { to?: string; messageId?: string; statusCode?: string; statusMessage?: string; customFields?: Record<string, string> }[];
      messageList?: { messageId?: string; statusCode?: string; statusMessage?: string; customFields?: Record<string, string> }[];
    };
    const groupId = body.groupInfo?.groupId ?? null;
    const byRef = new Map<string, ManyMessageResult>();
    const pendingByPhone = new Map<string, string[]>();
    for (const m of chunk) {
      const k = normalizePhone(m.to);
      pendingByPhone.set(k, [...(pendingByPhone.get(k) ?? []), m.ref]);
    }
    const takeRef = (cf: Record<string, string> | undefined, to: string | undefined): string | null => {
      const ref = cf?.ref;
      if (ref && chunk.some((c) => c.ref === ref) && !byRef.has(ref)) return ref;
      const list = to ? pendingByPhone.get(normalizePhone(to)) : undefined;
      while (list && list.length) {
        const r = list.shift()!;
        if (!byRef.has(r)) return r;
      }
      return null;
    };
    for (const f of body.failedMessageList ?? []) {
      const ref = takeRef(f.customFields, f.to);
      if (ref) byRef.set(ref, { ref, accepted: false, messageId: f.messageId ?? null, groupId, statusCode: f.statusCode ?? null, reason: f.statusMessage ?? '접수 실패' });
    }
    const accepted = body.messageList ?? [];
    for (const m of accepted) {
      let ref = m.customFields?.ref && chunk.some((c) => c.ref === m.customFields!.ref) && !byRef.has(m.customFields.ref) ? m.customFields.ref : null;
      // customFields 가 없으면 접수 목록 순서(요청 순서 − 거부 건)로 대조
      if (!ref) ref = chunk.filter((c) => !byRef.has(c.ref))[0]?.ref ?? null;
      if (ref) byRef.set(ref, { ref, accepted: true, messageId: m.messageId ?? null, groupId, statusCode: m.statusCode ?? null, reason: null });
    }
    for (const m of chunk) {
      // 응답에 목록이 없을 때: 그룹이 만들어졌으면 접수된 것으로 보고, 결과는 그룹 조회로 채운다
      out.push(byRef.get(m.ref) ?? { ref: m.ref, accepted: !!groupId, messageId: null, groupId, statusCode: null, reason: groupId ? null : '응답 해석 실패' });
    }
  }
  return out;
}

export interface SolapiStoredMessage {
  messageId: string;
  groupId: string | null;
  to: string;
  status: string | null;
  statusCode: string | null;
  reason: string | null;
  ref: string | null;
  dateCreated: string | null;
  text: string | null;
}

/**
 * 발송 결과 조회 — GET /messages/v4/list (groupId 또는 기간, startKey 이어받기).
 * statusCode: 2000 접수 · 3000 이통사 접수(전송 중) · 4000 수신 완료 · 그 밖의 코드 = 실패(reason 에 사유).
 */
export async function listSolapiMessages(
  creds: SolapiCreds,
  query: { groupId?: string; startDate?: string; endDate?: string },
  maxPages = 10,
): Promise<{ ok: true; messages: SolapiStoredMessage[] } | { ok: false; error: string }> {
  const out: SolapiStoredMessage[] = [];
  let startKey: string | null = null;
  try {
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({ limit: '500' });
      if (query.groupId) params.set('groupId', query.groupId);
      if (query.startDate || query.endDate) params.set('dateType', 'CREATED');
      if (query.startDate) params.set('startDate', query.startDate);
      if (query.endDate) params.set('endDate', query.endDate);
      if (startKey) params.set('startKey', startKey);
      const res = await solapiFetch(() => ({ url: `${SOLAPI_BASE}/messages/v4/list?${params.toString()}`, init: { headers: { Authorization: authHeader(creds.apiKey, creds.apiSecret) } } }));
      if (!res.ok) return { ok: false, error: await errorText(res) };
      const body = (await res.json().catch(() => ({}))) as { nextKey?: string | null; messageList?: Record<string, Record<string, unknown>> };
      for (const [id, m] of Object.entries(body.messageList ?? {})) {
        const cf = (m.customFields ?? null) as Record<string, string> | null;
        out.push({
          messageId: (m.messageId as string) ?? id,
          groupId: (m.groupId as string) ?? null,
          to: Array.isArray(m.to) ? String(m.to[0] ?? '') : ((m.to as string) ?? ''),
          status: (m.status as string) ?? null,
          statusCode: (m.statusCode as string) ?? null,
          reason: (m.reason as string) ?? (m.statusMessage as string) ?? null,
          ref: cf?.ref ?? null,
          dateCreated: (m.dateCreated as string) ?? null,
          text: (m.text as string) ?? null,
        });
      }
      if (!body.nextKey || body.nextKey === startKey) break;
      startKey = body.nextKey;
    }
    return { ok: true, messages: out };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'solapi_network_error' };
  }
}
