/**
 * (P35-D) Vercel Deployment Protection 우회 헤더 — 설정·globalSetup·헬퍼가 공용으로 읽는다.
 * Vercel → 프로젝트 → Settings → Deployment Protection → "Protection Bypass for Automation" 에서 만든 비밀값을
 * `VERCEL_AUTOMATION_BYPASS_SECRET` 환경변수로 주면 모든 요청에 `x-vercel-protection-bypass` 를 붙인다.
 * 보호를 켜지 않았으면 비워 두면 된다(헤더 없음). playwright 모듈을 import 하지 않는다(설정 파일에서 읽기 때문).
 */
export const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '';
export const EXTRA_HEADERS: Record<string, string> | undefined = BYPASS_SECRET ? { 'x-vercel-protection-bypass': BYPASS_SECRET } : undefined;
