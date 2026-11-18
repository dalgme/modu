import { describe, expect, it } from 'vitest';

import { MENTOR_LABEL, OPERATOR_LABEL, SCAN_DETECT, blindStatusOf, detectRightCell, expandWithInk, findLabelBoxes, fuzzyLabelBoxes, observationFileName, observationZipBase, rightCellsOf, type CellBox, type ImageLike } from './observation-redact-shared';

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
  it('원본 = 멘토·멘티 이름 · 순서 / 블라인드 = 멘토 이름 없이 · 미적용 표시', () => {
    expect(observationFileName(3, 24, '강석우', '남준현', 'mentor', 'original')).toBe('003. 강석우멘토-남준현멘티 관찰의견서.pdf');
    expect(observationFileName(3, 24, '강석우', '남준현', 'mentee', 'original')).toBe('003. 남준현멘티-강석우멘토 관찰의견서.pdf');
    expect(observationFileName(4, 24, '강석우', '남준현', 'mentor', 'original', 'none', 'hwp')).toBe('004. 강석우멘토-남준현멘티 관찰의견서 (PDF 변환 실패·원본).hwp');
    expect(observationFileName(3, 24, '강석우', '남준현', 'mentor', 'blind', 'full')).toBe('003. 남준현멘티 관찰의견서.pdf');
    expect(observationFileName(12, 1200, '강석우', '남준현', 'mentee', 'blind', 'none')).toBe('0012. 남준현멘티 관찰의견서 (블라인드 미적용).pdf');
    expect(observationFileName(1, 5, '가', '나', 'mentor', 'blind', 'partial', 'docx')).toBe('001. 나멘티 관찰의견서 (블라인드 일부 확인 필요).docx');
    expect(observationZipBase('B그룹', 'mentor', 'original')).toBe('B그룹 관찰의견서 원본(멘토별)');
    expect(observationZipBase('B그룹', 'mentee', 'blind')).toBe('B그룹 관찰의견서 블라인드(멘티별)');
  });
});

describe('책임멘토명 · 결과 상태', () => {
  it('책임멘토명 항목을 찾는다(띄어 써도), 제목 "책임멘토 관찰 의견서"는 아님', () => {
    expect(findLabelBoxes([{ text: '책임멘토명', x: 0, y: 0, w: 50, h: 10 }], MENTOR_LABEL)).toHaveLength(1);
    expect(findLabelBoxes([{ text: '책임 멘토명', x: 0, y: 0, w: 55, h: 10 }], MENTOR_LABEL)).toHaveLength(1);
    expect(findLabelBoxes([{ text: '책임멘토 관찰 의견서(양식)', x: 0, y: 0, w: 150, h: 10 }], MENTOR_LABEL)).toEqual([]);
  });

  it('좁은 칸에서 두 줄로 꺾인 "책임멘토 / 명"도 찾고, 떨어진 줄·다른 칸은 잇지 않는다', () => {
    expect(findLabelBoxes([{ text: '책임멘토', x: 10, y: 10, w: 40, h: 10 }, { text: '명', x: 25, y: 22, w: 10, h: 10 }], MENTOR_LABEL)).toEqual([{ x: 10, y: 10, w: 40, h: 22 }]);
    expect(findLabelBoxes([{ text: '책임멘토', x: 10, y: 10, w: 40, h: 10 }, { text: '명', x: 25, y: 40, w: 10, h: 10 }], MENTOR_LABEL)).toEqual([]);
    expect(findLabelBoxes([{ text: '책임멘토', x: 10, y: 10, w: 40, h: 10 }, { text: '명', x: 90, y: 22, w: 10, h: 10 }], MENTOR_LABEL)).toEqual([]);
    expect(findLabelBoxes([{ text: '책임멘토', x: 10, y: 10, w: 40, h: 10, cellKey: 'a' }, { text: '명', x: 25, y: 22, w: 10, h: 10, cellKey: 'b' }], MENTOR_LABEL)).toEqual([]);
    // 제목 "책임멘토 관찰 의견서" 아래 "명단" 같은 낱말은 꾸밈 규칙에 걸려 제외
    expect(findLabelBoxes([{ text: '책임멘토', x: 10, y: 10, w: 40, h: 10 }, { text: '명단 안내', x: 10, y: 22, w: 45, h: 10 }], MENTOR_LABEL)).toEqual([]);
  });

  it('두 항목을 모두 가려야 가림 완료, 하나만이면 일부, 못 찾으면 미적용', () => {
    expect(blindStatusOf([{ found: 1, covered: 1 }, { found: 1, covered: 1 }])).toBe('full');
    expect(blindStatusOf([{ found: 1, covered: 1 }, { found: 0, covered: 0 }])).toBe('partial');
    expect(blindStatusOf([{ found: 2, covered: 1 }, { found: 1, covered: 1 }])).toBe('partial');
    expect(blindStatusOf([{ found: 0, covered: 0 }, { found: 0, covered: 0 }])).toBe('none');
    expect(blindStatusOf([{ found: 1, covered: 0 }, { found: 1, covered: 0 }])).toBe('none');
  });
});

describe('expandWithInk — 칸에 걸친 도장', () => {
  const ink = (p: ImageLike, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = (y * p.width + x) * 4;
        p.data[i] = rgb[0];
        p.data[i + 1] = rgb[1];
        p.data[i + 2] = rgb[2];
      }
  };
  const blank = (): ImageLike => ({ width: 300, height: 200, data: new Uint8ClampedArray(300 * 200 * 4).fill(255) });
  const cell = { x: 100, y: 80, w: 100, h: 30 };

  it('칸 안의 빨간 도장이 칸 위로 삐져나오면 그만큼 넓힌다', () => {
    const p = blank();
    ink(p, 170, 60, 190, 95, [210, 40, 40]); // 칸 위(60)부터 칸 안(95)까지
    expect(expandWithInk(p, cell)).toEqual({ x: 100, y: 60, w: 100, h: 50 });
  });

  it('칸 밖에만 있는 색 글자·연한 배경색·검정 글자는 넓히지 않는다', () => {
    const p = blank();
    ink(p, 10, 10, 30, 20, [30, 60, 220]); // 떨어진 파란 글자
    ink(p, 0, 80, 99, 110, [200, 215, 250]); // 옆 라벨 칸의 연한 파란 배경
    ink(p, 120, 85, 150, 95, [20, 20, 20]); // 칸 안 검정 글자
    expect(expandWithInk(p, cell)).toEqual(cell);
  });
});

describe('스캔 PDF — 글자 인식(OCR) 결과로 찾기 (2026-11-18)', () => {
  const ch = (text: string, x: number, y = 100, w = 20, h = 20) => ({ text, x, y, w, h });

  it('한 글자 잘못 읽은 띄어 쓴 항목 이름("문 영 기 관")을 고쳐 찾는다', () => {
    const words = [ch('문', 10), ch('영', 32), ch('기', 54), ch('관', 76), ch('세종', 200, 100, 40)];
    expect(findLabelBoxes(words, OPERATOR_LABEL)).toHaveLength(0);
    const r = findLabelBoxes(fuzzyLabelBoxes(words, OPERATOR_LABEL), OPERATOR_LABEL);
    expect(r).toHaveLength(1);
    expect(r[0]!.x).toBe(10);
    expect(Math.round(r[0]!.x + r[0]!.w)).toBe(96);
  });

  it('두 줄로 꺾인 앞부분("책임멘도" / "명")도 고쳐 잇는다', () => {
    const words = [ch('책임멘도', 10, 100, 80), ch('명', 40, 124)];
    const r = findLabelBoxes(fuzzyLabelBoxes(words, MENTOR_LABEL), MENTOR_LABEL);
    expect(r).toHaveLength(1);
  });

  it('두 글자 이상 다르거나 문장 속 낱말이면 고치지 않는다', () => {
    expect(findLabelBoxes(fuzzyLabelBoxes([ch('운', 10), ch('동', 32), ch('기', 54), ch('간', 76)], OPERATOR_LABEL), OPERATOR_LABEL)).toHaveLength(0);
    const sentence = [ch('문영기관의', 10, 100, 100), ch('안내에', 116, 100, 60)];
    expect(findLabelBoxes(fuzzyLabelBoxes(sentence, OPERATOR_LABEL), OPERATOR_LABEL)).toHaveLength(0);
  });

  it('흐리고 조금 기운 스캔 표 선도 찾는다(SCAN_DETECT)', () => {
    // 회색(170) 선, 오른쪽으로 갈수록 1px 씩 내려가는 가로선(0.5° 기울기 흉내)
    const w = 500;
    const h = 200;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    const set = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 175;
    };
    for (const y0 of [20, 60, 100]) for (let x = 20; x <= 421; x++) set(x, y0 + Math.floor((x - 20) / 200));
    for (const x of [20, 120, 320, 420]) for (let y = 20; y <= 103; y++) set(x, y);
    const img = { width: w, height: h, data };
    const label = { x: 40, y: 72, w: 56, h: 14 };
    expect(detectRightCell(img, label)).toBeNull(); // 깨끗한 PDF 기준(진한 선)으로는 못 찾음
    const r = detectRightCell(img, label, SCAN_DETECT);
    expect(r).not.toBeNull();
    // 라벨 오른쪽 칸(x 121~319, y 61~101 근처)을 덮는다
    expect(r!.x).toBeLessThanOrEqual(122);
    expect(r!.x + r!.w).toBeGreaterThanOrEqual(319);
    expect(r!.y).toBeLessThanOrEqual(62);
    expect(r!.y + r!.h).toBeGreaterThanOrEqual(100);
  });
});
