/** 정산·품의 상태 라벨 (클라이언트 안전 — 서버 모듈 import 없음) */
export const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  pending: '지급 대기',
  batched: '품의 편성',
  confirmed: '정산 확인',
  paid: '지급 완료',
  canceled: '취소',
};
export const BATCH_STATUS_LABELS: Record<string, string> = {
  draft: '작성 중',
  submitted: '제출됨',
  confirmed: '정산 확인',
  paid: '지급 완료',
};
