#!/usr/bin/env node
/**
 * RSC 직렬화 검사 (P34) — 서버 컴포넌트 파일이 클라이언트 컴포넌트('use client')에
 * 컴포넌트 객체(lucide 아이콘 등)·인라인 콜백을 props 로 넘기는 곳을 찾는다.
 * 이 유형은 빌드·타입검사·린트가 잡지 못하고 런타임에서 페이지 전체가 500 이 난다
 * (2026-09-28 장애: "Functions cannot be passed directly to Client Components"). CLAUDE.md §6-10.
 *
 * 규칙
 *  1) 서버 파일(첫 300자에 'use client' 없음)에서 클라이언트 컴포넌트 태그의 props 에
 *     lucide 아이콘·@/components 에서 import 한 대문자 식별자를 `icon: X` / `icon={X}` 형태로 넘기면 오류.
 *  2) 서버 파일에서 JSX 요소(호스트 요소·클라이언트 컴포넌트)에 `onXxx={` 인라인 핸들러를 쓰면 오류.
 *     (예외: 서버 액션 함수를 `action=`/`formAction=` 로 넘기는 것은 허용 — on* 만 검사)
 *  3) 서버 파일에서 React 훅(useState/useEffect/…)을 호출하면 오류.
 * 종료 코드: 위반 0건이면 0, 아니면 1.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.tsx$/.test(name)) files.push(p);
  }
})(ROOT);

const src = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const isClient = (f) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src.get(f).slice(0, 300));

// 컴포넌트 이름 → 정의 파일 (export function X / export const X / export default function X)
const defs = new Map();
for (const [f, s] of src) {
  for (const m of s.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9]*)|export\s+const\s+([A-Z][A-Za-z0-9]*)\s*[=:]/g)) {
    defs.set(m[1] ?? m[2], f);
  }
}
const clientComps = new Set([...defs].filter(([, f]) => isClient(f)).map(([n]) => n));

const HOOK_RE = /\buse(State|Effect|Ref|Router|Pathname|SearchParams|Transition|Memo|Callback|FormStatus|FormState|Reducer|LayoutEffect|Context)\s*\(/g;
const violations = [];

for (const [f, s] of src) {
  if (isClient(f)) continue;
  const lineOf = (idx) => s.slice(0, idx).split('\n').length;

  // 3) 훅
  for (const m of s.matchAll(HOOK_RE)) violations.push(`${f}:${lineOf(m.index)}  서버 컴포넌트에서 훅 ${m[0].trim()} 호출 — 'use client' 파일로 분리`);

  // import 한 컴포넌트 이름(아이콘·컴포넌트)
  const compNames = new Set();
  for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(lucide-react|@\/components[^']*)'/g)) {
    for (let n of m[1].split(',')) {
      n = n.trim().replace(/^type\s+/, '');
      if (!n || n === 'LucideIcon') continue;
      n = n.split(/\s+as\s+/).pop().trim();
      if (/^[A-Z]/.test(n)) compNames.add(n);
    }
  }

  // JSX 요소 단위로 props 문자열 추출 (중첩 <…> 한 단계까지 허용)
  for (const m of s.matchAll(/<([A-Za-z][A-Za-z0-9.]*)\b((?:[^<>]|<[^<>]*>)*?)\/?>/gs)) {
    const [, tag, props] = m;
    const line = lineOf(m.index);
    // 2) on* 인라인 핸들러 (호스트 요소·클라이언트 컴포넌트 모두)
    for (const h of props.matchAll(/\bon[A-Z][A-Za-z]*\s*=\s*\{/g)) {
      violations.push(`${f}:${line}  <${tag}> 에 이벤트 핸들러 ${h[0].replace(/\s*=\s*\{$/, '')} — 서버 컴포넌트에서는 불가, 조각을 'use client' 로 분리`);
    }
    // 1) 컴포넌트 객체를 클라이언트 컴포넌트 props 로
    if (!clientComps.has(tag)) continue;
    for (const n of compNames) {
      const re = new RegExp(`(?:^|[\\s,{(])(?:[a-zA-Z_]*[iI]con[A-Za-z]*)\\s*[:=]\\s*\\{?\\s*${n}\\b`);
      if (re.test(props)) violations.push(`${f}:${line}  <${tag}> 에 컴포넌트 객체 ${n} 을 props 로 전달 — 이름 문자열로 넘기고 클라이언트에서 매핑`);
    }
  }
}

if (violations.length) {
  console.error(`✖ RSC 직렬화 위반 ${violations.length}건 (CLAUDE.md §6-10)`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('✔ RSC 직렬화 위반 0건');
