/**
 * 회차 보고서의 "멘토링 주제" 칸 읽기 (2026-11-18) — 서버·브라우저·테스트 공용 순수 함수.
 * 멘토링 총괄표의 [주요 내용] 칸에 쓴다. 칸 찾기는 관찰의견서 블라인드와 같은 규칙
 * (findLabelBoxes 로 항목 이름 → 오른쪽 칸) 이고, 여기서는 그 칸 안의 글자를 모은다.
 */
import type { Rect, TextBox } from '@/lib/files/observation-redact-shared';

export const TOPIC_LABEL = '멘토링 주제';
/** 총괄표 칸에 넣을 최대 글자 수 */
export const TOPIC_MAX = 300;

/**
 * 글자 상자들을 줄 순서대로 이어 붙인다 — 같은 줄의 조각은 실제 간격이 있을 때만 띄어 쓴다
 * (PDF·한글 모두 한 낱말이 여러 조각으로 나뉘어 오는 경우가 있어 "계약·유통"이 "계약 · 유통"이 되지 않게).
 */
export function joinBoxes(boxes: TextBox[]): string {
  const list = boxes.filter((b) => b.text.trim()).slice();
  list.sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const lines: TextBox[][] = [];
  for (const b of list) {
    const line = lines.find((l) => Math.abs(l[0]!.y + l[0]!.h / 2 - (b.y + b.h / 2)) <= Math.min(l[0]!.h, b.h) * 0.5);
    if (line) line.push(b);
    else lines.push([b]);
  }
  const text = lines
    .map((l) => {
      l.sort((a, b) => a.x - b.x);
      let out = '';
      l.forEach((b, i) => {
        if (i > 0) {
          const prev = l[i - 1]!;
          const gap = b.x - (prev.x + prev.w);
          if (gap > Math.min(prev.h, b.h) * 0.15 && !out.endsWith(' ') && !/^\s/.test(b.text)) out += ' ';
        }
        out += b.text;
      });
      return out;
    })
    .join(' ');
  return cleanTopic(text);
}

/** 칸(rect) 안에 중심이 든 글자 상자를 줄 순서대로 이어 붙인다 */
export function textInRect(boxes: TextBox[], rect: Rect): string {
  return joinBoxes(
    boxes.filter((b) => {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      return cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h;
    }),
  );
}

/** 공백 정리·불릿 제거·길이 제한 */
export function cleanTopic(s: string): string {
  const v = s
    .normalize('NFC')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/^[\s•·\-*▪■□○●◦]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return v.length > TOPIC_MAX ? `${v.slice(0, TOPIC_MAX - 1)}…` : v;
}

/** 표 선을 못 찾았을 때 대체 — 항목 이름과 같은 줄, 그 오른쪽 글자 */
export function textRightOf(boxes: TextBox[], label: Rect): string {
  const cy = label.y + label.h / 2;
  return joinBoxes(boxes.filter((b) => b.x >= label.x + label.w - 1 && Math.abs(b.y + b.h / 2 - cy) <= Math.max(b.h, label.h) * 0.6));
}

/* ── 서버 → 브라우저 목록 ──────────────────────────────────────────────── */

export interface TopicJob {
  logId: string;
  /** 보고서 파일 경로 — 저장할 때 그대로 돌려보내 '그 사이 바뀌지 않았는지' 확인 */
  path: string;
  kind: 'pdf' | 'hwp' | 'other';
  url: string;
}

export interface TopicJobList {
  jobs: TopicJob[];
  /** 이번 목록 뒤에 더 남은 수 */
  remaining: number;
  /** 범위 안 보고서 등록 회차 수 · 이미 읽은 수 */
  total: number;
  done: number;
}
