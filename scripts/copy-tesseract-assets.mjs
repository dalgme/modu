// tesseract.js(글자 인식 OCR) 정적 자산을 public/tesseract/ 로 복사한다 (2026-11-18, 스캔 관찰의견서 블라인드).
//  - worker.min.js · core/(LSTM 전용 3종 — 브라우저가 relaxed-SIMD → SIMD → 기본 순으로 고른다) · lang/kor.traineddata.gz(best_int)
//  - 결과물은 저장소에 커밋한다. tesseract.js 를 올리면 다시 실행: npm run tesseract:assets
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'public', 'tesseract');
const ver = (p) => JSON.parse(readFileSync(path.join(nm, p, 'package.json'), 'utf8')).version;

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'core'), { recursive: true });
mkdirSync(path.join(out, 'lang'), { recursive: true });
cpSync(path.join(nm, 'tesseract.js', 'dist', 'worker.min.js'), path.join(out, 'worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) cpSync(path.join(nm, 'tesseract.js-core', f), path.join(out, 'core', f));
cpSync(path.join(nm, '@tesseract.js-data', 'kor', '4.0.0_best_int', 'kor.traineddata.gz'), path.join(out, 'lang', 'kor.traineddata.gz'));
writeFileSync(path.join(out, 'VERSION'), `tesseract.js ${ver('tesseract.js')} · core ${ver('tesseract.js-core')} · kor 4.0.0_best_int\n`);
console.log(`✔ tesseract 자산 → public/tesseract/`);
