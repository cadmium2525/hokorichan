// オフライン用のサービスワーカー。
// ページ本体はネット優先（更新をすぐ反映）、ビルド済みの画像・スクリプトはキャッシュ優先。
const CACHE = 'hokorichan-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // ゲーム本体だけを index.html としてしまう（dev.html・bgm.html はしまわない）
    const isGame = /\/(index\.html)?$/.test(new URL(req.url).pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isGame && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match(isGame ? './index.html' : req)),
    );
    return;
  }

  // BGM はファイル名が変わらないので、ネット優先（作り直した曲がすぐ届く）
  if (new URL(req.url).pathname.includes('/bgm/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
