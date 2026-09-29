// pdf.js 정적 자산을 public/pdfjs/ 로 복사한다 (2026-09-30, 업로드 PDF 웹 미리보기).
//  - 워커(pdf.worker.min.js) · 한중일 문자 CMap(cmaps/) · 표준 글꼴(standard_fonts/)
//  - 결과물은 저장소에 커밋한다(배포 때 복사 단계에 기대지 않음). pdfjs-dist 버전을 올리면 이 스크립트를 다시 실행할 것:
//      npm run pdfjs:assets
//    워커와 라이브러리 버전이 다르면 PDF 가 열리지 않는다 — src/lib/files/pdfjs-assets.test.ts 가 버전 일치를 검사한다.
//  - 워커는 확장자를 .js 로 바꿔 둔다: 정적 호스팅이 .mjs 를 자바스크립트 MIME 으로 주지 않으면 모듈 워커가 거부된다.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist');
const out = path.join(root, 'public', 'pdfjs');
const version = JSON.parse(readFileSync(path.join(src, 'package.json'), 'utf8')).version;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(src, 'legacy', 'build', 'pdf.worker.min.mjs'), path.join(out, 'pdf.worker.min.js'));
cpSync(path.join(src, 'cmaps'), path.join(out, 'cmaps'), { recursive: true });
cpSync(path.join(src, 'standard_fonts'), path.join(out, 'standard_fonts'), { recursive: true });
writeFileSync(path.join(out, 'VERSION'), `${version}\n`);
console.log(`✔ pdf.js ${version} 자산 → public/pdfjs/`);
