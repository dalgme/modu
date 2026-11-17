import { describe, expect, it } from 'vitest';

import { detectRightCell, findLabelBoxes, observationFileName, rightCellsOf, type CellBox, type ImageLike } from './observation-redact-shared';

/** 흰 바탕에 표 선을 그린 가짜 쪽 그림 */
function page(w: number, h: number): ImageLike & { line: (x0: number, y0: number, x1: number, y1: number, t?: number) => void; fill: (x: number, y: number, w: number, h: number, v: number) => void } {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const set = (x: number, y: number, v: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v;
  };
  return {
    width: w,
    height: h,
    data,
    line(x0, y0, x1, y1, t = 2) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let k = 0; k < t; k++) set(x0 === x1 ? x + k : x, y0 === y1 ? y + k : y, 0);
    },
    fill(x, y, fw, fh, v) {
      for (let yy = y; yy < y + fh; yy++) for (let xx = x; xx < x + fw; xx++) set(xx, yy, v);
    },
  };
}

describe('findLabelBoxes', () => {
  it('한 덩어리 · 띄어 쓴 라벨 · 여러 상자로 나뉜 라벨을 찾는다', () => {
    expect(findLabelBoxes([{ text: '운영기관', x: 10, y: 10, w: 40, h: 10 }])).toEqual([{ x: 10, y: 10, w: 40, h: 10 }]);
    const spaced = findLabelBoxes([{ text: '운 영 기 관', x: 10, y: 10, w: 70, h: 10 }]);
    expect(spaced).toHaveLength(1);
    expect(spaced[0]!.x).toBe(10);
    const split = findLabelBoxes([
      { text: '기관', x: 30, y: 10, w: 20, h: 10 },
      { text: '운영', x: 10, y: 11, w: 20, h: 10 },
    ]);
    expect(split).toHaveLength(1);
    expect(split[0]!.w).toBe(40);
  });

  it('다른 줄·다른 칸의 글자는 이어 붙이지 않는다', () => {
    expect(findLabelBoxes([{ text: '운영', x: 10, y: 10, w: 20, h: 10 }, { text: '기관', x: 30, y: 40, w: 20, h: 10 }])).toEqual([]);
    expect(findLabelBoxes([{ text: '운영', x: 10, y: 10, w: 20, h: 10, cellKey: 'a' }, { text: '기관', x: 30, y: 10, w: 20, h: 10, cellKey: 'b' }])).toEqual([]);
  });

  it('글자별 경계(charX) · 짧은 꾸밈(※·명)은 항목 이름으로 인정', () => {
    const r = findLabelBoxes([{ text: '※운영기관명', x: 100, y: 0, w: 60, h: 10, charX: [0, 10, 20, 30, 40, 50, 60] }]);
    expect(r).toEqual([{ x: 100, y: 0, w: 60, h: 10 }]);
    // 옆 칸의 값(간격이 넓음)은 덩어리에 넣지 않는다
    expect(findLabelBoxes([{ text: '운영기관', x: 0, y: 0, w: 40, h: 10 }, { text: '(주)운영사', x: 52, y: 0, w: 40, h: 10 }])).toEqual([{ x: 0, y: 0, w: 40, h: 10 }]);
  });

  it('문장 속 낱말은 항목 이름이 아니다', () => {
    expect(findLabelBoxes([{ text: '멘티는 운영기관의 안내에 따라', x: 0, y: 0, w: 170, h: 10 }])).toEqual([]);
    // 띄어쓰기 폭 ≈ 글자 높이의 0.3 (실제 글꼴 배치처럼 글자별 경계를 준다)
    const text = '따라 운영기관 담당자가';
    const charX = [0];
    for (const ch of text) charX.push(charX[charX.length - 1]! + (ch === ' ' ? 3 : 10));
    expect(findLabelBoxes([{ text, x: 0, y: 0, w: charX[charX.length - 1]!, h: 10, charX }])).toEqual([]);
  });
});

describe('rightCellsOf', () => {
  const cells: CellBox[] = [
    { cellIdx: 0, row: 0, col: 0, rowSpan: 2, colSpan: 1, x: 0, y: 0, w: 10, h: 20 },
    { cellIdx: 1, row: 0, col: 1, rowSpan: 1, colSpan: 1, x: 10, y: 0, w: 10, h: 10 },
    { cellIdx: 2, row: 0, col: 2, rowSpan: 1, colSpan: 1, x: 20, y: 0, w: 10, h: 10 },
    { cellIdx: 3, row: 1, col: 1, rowSpan: 1, colSpan: 2, x: 10, y: 10, w: 20, h: 10 },
    { cellIdx: 4, row: 2, col: 0, rowSpan: 1, colSpan: 1, x: 0, y: 20, w: 10, h: 10 },
    { cellIdx: 5, row: 2, col: 1, rowSpan: 1, colSpan: 2, x: 10, y: 20, w: 20, h: 10 },
  ];
  it('바로 오른쪽 열에서 행이 겹치는 칸만', () => {
    expect(rightCellsOf(cells, 0).map((c) => c.cellIdx)).toEqual([1, 3]);
    expect(rightCellsOf(cells, 4).map((c) => c.cellIdx)).toEqual([5]);
    expect(rightCellsOf(cells, 2)).toEqual([]);
    expect(rightCellsOf(cells, 99)).toEqual([]);
  });
});

describe('detectRightCell', () => {
  // 표: 세로선 x=20,120,320,420 · 가로선 y=20,60,100  → 2행 3열, "운영기관" 은 (1,0) 칸
  const make = () => {
    const p = page(500, 200);
    for (const y of [20, 60, 100]) p.line(20, y, 421, y);
    for (const x of [20, 120, 320, 420]) p.line(x, 20, x, 101);
    return p;
  };
  const label = { x: 40, y: 72, w: 56, h: 14 };

  it('라벨 칸 오른쪽 칸 안쪽을 돌려준다', () => {
    const p = make();
    // 값 글자(어두운 점들)가 있어도 선으로 보지 않는다
    p.fill(150, 74, 80, 10, 0);
    p.fill(60, 74, 3, 10, 0);
    const r = detectRightCell(p, label);
    expect(r).toEqual({ x: 122, y: 62, w: 198, h: 38 });
  });

  it('연한 칸 배경색은 선이 아니다', () => {
    const p = make();
    p.fill(22, 62, 98, 38, 220);
    expect(detectRightCell(p, label)).toEqual({ x: 122, y: 62, w: 198, h: 38 });
  });

  it('오른쪽 칸이 두 줄 높이(병합)면 그 칸 전체', () => {
    const p = page(500, 200);
    for (const y of [20, 100]) p.line(20, y, 421, y);
    p.line(20, 60, 120, 60); // 라벨 열만 가로선
    for (const x of [20, 120, 320, 420]) p.line(x, 20, x, 101);
    expect(detectRightCell(p, label)).toEqual({ x: 122, y: 22, w: 198, h: 78 });
  });

  it('표가 아니면(선이 없으면) null', () => {
    expect(detectRightCell(page(500, 200), label)).toBeNull();
    const p = page(500, 200);
    for (const y of [60, 100]) p.line(20, y, 421, y);
    p.line(20, 60, 20, 101);
    expect(detectRightCell(p, label)).toBeNull(); // 오른쪽 세로선 없음
  });
});

describe('observationFileName', () => {
  it('번호 · 순서 · 미적용 표시', () => {
    expect(observationFileName(3, 24, '강석우', '남준현', 'mentor', 'full')).toBe('003. 강석우멘토-남준현멘티 관찰의견서.pdf');
    expect(observationFileName(12, 1200, '강석우', '남준현', 'mentee', 'none')).toBe('0012. 남준현멘티-강석우멘토 관찰의견서 (블라인드 미적용).pdf');
    expect(observationFileName(1, 5, '가', '나', 'mentor', 'partial', 'docx')).toBe('001. 가멘토-나멘티 관찰의견서 (블라인드 일부 확인 필요).docx');
  });
});
