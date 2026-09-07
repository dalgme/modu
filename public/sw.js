// 재기지원 운영관리 PWA 서비스워커
// 설치형(홈 화면 추가) + 정적 자산 캐시. 인증 HTML 은 항상 네트워크(최신 유지).
const CACHE = 'restart-static-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  const isStatic =
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/images') ||
    /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname);

  // 정적 자산: 캐시 우선(오프라인·재방문 속도)
  if (isStatic) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res && res.status === 200) cache.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }
  // 그 외(인증 HTML·API): 네트워크 우선 — 캐시하지 않음(최신 데이터 보장)
});
