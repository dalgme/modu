/** word-extractor (Word .doc/.docx 글자 추출) 최소 타입 — 패키지에 타입이 없다 (2026-09-30, 글자 추출 미리보기) */
declare module 'word-extractor' {
  interface WordDocument {
    getBody(options?: { filterUnicode?: boolean }): string;
    getFootnotes(options?: { filterUnicode?: boolean }): string;
    getEndnotes(options?: { filterUnicode?: boolean }): string;
  }
  export default class WordExtractor {
    extract(source: string | Buffer): Promise<WordDocument>;
  }
}
