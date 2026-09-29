import { describe, expect, it } from 'vitest';

import { decodeXmlEntities, hwpxBlocksToParagraphs, parseHwpxSection } from './hwpx';

const SEC = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="1"><hp:run charPrIDRef="0"><hp:secPr/><hp:t>사업계획서 &amp; 요약</hp:t></hp:run></hp:p>
  <hp:p id="2"><hp:run><hp:t>첫째<hp:tab width="100"/>둘째<hp:lineBreak/>셋째</hp:t></hp:run></hp:p>
  <hp:p id="3"><hp:run><hp:t>표 앞 글자</hp:t><hp:tbl rowCnt="2" colCnt="2">
    <hp:tr>
      <hp:tc><hp:subList><hp:p><hp:run><hp:t>항목</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="2"/></hp:tc>
      <hp:tc><hp:subList><hp:p><hp:run><hp:t>내용 1</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>내용 2</hp:t></hp:run></hp:p></hp:subList><hp:cellSpan colSpan="1" rowSpan="1"/></hp:tc>
    </hp:tr>
    <hp:tr>
      <hp:tc><hp:subList><hp:p><hp:run><hp:t>셀 &lt;3&gt;</hp:t></hp:run></hp:p></hp:subList><hp:cellSpan colSpan="1" rowSpan="1"/></hp:tc>
    </hp:tr>
  </hp:tbl><hp:t>표 뒤 글자</hp:t></hp:run></hp:p>
  <hp:p><hp:run><hp:pic id="9"><hc:img binaryItemIDRef="image1"/></hp:pic></hp:run></hp:p>
  <hp:p><hp:run><hp:ctrl><hp:header><hp:subList><hp:p><hp:run><hp:t>머리말</hp:t></hp:run></hp:p></hp:subList></hp:header></hp:ctrl></hp:run></hp:p>
  <hp:p><hp:run><hp:t/></hp:run></hp:p>
</hs:sec>`;

describe('parseHwpxSection', () => {
  it('문단·탭·줄바꿈·엔터티를 읽는다', () => {
    const { blocks } = parseHwpxSection(SEC);
    expect(blocks[0]).toEqual({ t: 'p', text: '사업계획서 & 요약' });
    expect(blocks[1]).toEqual({ t: 'p', text: '첫째\t둘째\n셋째' });
  });
  it('표는 셀 병합과 함께 표 블록으로, 표 앞뒤 글자는 순서대로', () => {
    const { blocks, images } = parseHwpxSection(SEC);
    expect(blocks[2]).toEqual({ t: 'p', text: '표 앞 글자' });
    expect(blocks[3]).toEqual({
      t: 'table',
      rows: [
        [
          { text: '항목', colSpan: 1, rowSpan: 2 },
          { text: '내용 1\n내용 2', colSpan: 1, rowSpan: 1 },
        ],
        [{ text: '셀 <3>', colSpan: 1, rowSpan: 1 }],
      ],
    });
    expect(blocks[4]).toEqual({ t: 'p', text: '표 뒤 글자' });
    // 그림은 자리 표시, 머리말은 건너뜀, 빈 문단은 버림
    expect(blocks[5]).toEqual({ t: 'p', text: '[그림]' });
    expect(blocks).toHaveLength(6);
    expect(images).toBe(1);
  });
  it('글자 문단으로 펼치기', () => {
    const paras = hwpxBlocksToParagraphs(parseHwpxSection(SEC).blocks);
    expect(paras).toContain('항목 | 내용 1 내용 2');
  });
  it('망가진 XML 에도 예외 없이', () => {
    expect(() => parseHwpxSection('<hp:p><hp:t>끝나지 않은')).not.toThrow();
    expect(parseHwpxSection('<hp:p><hp:t>끝나지 않은').blocks).toEqual([{ t: 'p', text: '끝나지 않은' }]);
    expect(decodeXmlEntities('&#xAC00;&#44032;&bogus;')).toBe('가가&bogus;');
  });
});
