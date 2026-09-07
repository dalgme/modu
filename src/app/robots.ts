import type { MetadataRoute } from 'next';

// 내부 업무도구 — 전체 크롤링 차단
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
