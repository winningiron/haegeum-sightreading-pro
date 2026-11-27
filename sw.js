/* 해금 초견 프로 Service Worker (3단계 PWA).
   악보 파일(scores/*)과 앱 껍데기(index/app.js/styles.css)를 캐싱해
   오프라인에서도 연다. 등록에 실패해도 사이트는 정상 동작한다(app.js에서
   register 실패를 무시한다). 캐시 버전은 pieces.json version과 맞춘다. */
const CACHE_NAME = "hspro-v4";
const CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
  "./scores/pieces.json"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE);
    }).catch(function () {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; })
        .map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 외부 요청은 건드리지 않는다
  const isScore = url.pathname.indexOf("/scores/") !== -1;
  const isCore = CORE.some(function (p) { return url.pathname.endsWith(p.replace("./", "/")) || url.pathname === "/" && p === "./"; });
  if (isScore || isCore) {
    // 악보·껍데기: 캐시 우선, 없으면 네트워크에서 받아 캐시에 저장
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); }).catch(function () {});
          }
          return res;
        }).catch(function () { return caches.match("./index.html"); });
      })
    );
    return;
  }
  // 그 외 같은 출처 요청: 네트워크 우선, 실패 시 캐시
  event.respondWith(
    fetch(req).catch(function () { return caches.match(req, { ignoreSearch: true }); })
  );
});
