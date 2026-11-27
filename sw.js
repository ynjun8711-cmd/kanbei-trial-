/* 官兵衛 営業入力：オフライン用のキャッシュ。アプリの本体（HTML・アイコン）を、iPhoneの中に保存し、通信なしでも開けるようにする。営業のデータは、ここには入れない（端末内の保存領域だけ）。
   v4（2026-11-20）：古い画面が出続ける問題の修正。
   ・原因：画面（HTML）を「先に保存済みの版を返し、裏で更新する」方式で、しかも更新の取得が、ブラウザの一時保存（10分）に当たっていたため、公開後も、何度か開くまで、古い版が出ていた。
   ・対策：画面（HTML）は、通信できる時は、必ず、最新を確認して表示する（通信の確認は no-cache＝一時保存を使わず、サーバーに最新かを問い合わせる）。電波が悪い・圏外の時は、3秒待って、保存済みの版で開く。
   ・版を v4 に上げ、古い保存（v3以前）は、起動時に、整理する。更新を受け取った時は、開いている画面を、1回だけ、再読み込みする。
   ・営業の記録（localStorage・IndexedDB）には、一切、触れない（ここで扱うのは、アプリ本体のキャッシュだけ）。 */
/* v5（2026-11-22）：機内モード・圏外では、一切、通信しない（iPhoneの「機内モードをオフにするか、Wi-Fiを使用してください」の警告の対策）。
   ・通信できない状態（navigator.onLine が false）では、画面もアイコンも、保存済みのものだけで開く。裏での更新の取得もしない。
   ・通信できる時は、v4と同じ（最新を優先して取り、保存し直す）。営業の記録には、一切、触れない。 */
/* v6.2（2026-11-25）：鍵なしのデモ画面（demo.html）は、遅い回線でも、古い保存や index.html を代わりに返さない（毎回、通信で取る）。
/* v6.1（2026-11-24）：ページの取得が、5xx（GitHubの一時的な不調＝ユニコーン画面）の時も、保存済みの版で開く（以前は、5xxの応答を、そのまま、表示していた）。
   v6（試作）：d/ の暗号化データは、保存せず、毎回、通信で取る（古い版が、残らないように）。 */
var CACHE = 'kanbei-trial-b42';
var FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
var WAIT_MS = 3000;
self.addEventListener('install', function (e) {
  /* 保存するときも、ブラウザの一時保存を使わず、サーバーから最新を取る */
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  var upgraded = false;
  e.waitUntil(
    caches.keys().then(function (ks) {
      var old = ks.filter(function (k) { return k !== CACHE && k.indexOf('kanbei-trial-') === 0; });
      upgraded = old.length > 0;                                                 /* 古い版（v3以前）が、あった＝更新を受け取った */
      return Promise.all(old.map(function (k) { return caches.delete(k); }));
    })
      .then(function () { return self.clients.claim(); })
      .then(function () { return upgraded ? self.clients.matchAll({ type: 'window' }) : []; })
      .then(function (cs) { cs.forEach(function (c) { if (c.navigate) { try { c.navigate(c.url); } catch (x) {} } }); })   /* 更新を受け取った時だけ：開いている画面を、最新に（初めて入れた時は、しない） */
  );
});
/* 最新を、確実に取る：ブラウザの一時保存（GitHubは10分）にも、途中の中継にも当たらないよう、毎回、違うURL（?_sw=時刻）で、保存なしで取りに行く（同じサイトの中だけ）。
   （試験で確認：fetch(e.request, {cache:'no-cache'}) だけでは、画面の読み込みが、一時保存から返り、新しい版が出なかった） */
function fresh(req) {
  var u = new URL(req.url);
  u.searchParams.set('_sw', String(Date.now()));
  return fetch(u.toString(), { cache: 'no-store', credentials: 'same-origin' });
}
function offline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }   /* 機内モード・圏外：通信を試さない */
function isPage(req) {
  var p = new URL(req.url).pathname;
  return req.mode === 'navigate' || /\/$/.test(p) || /\.html$/.test(p);
}
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  if (new URL(e.request.url).pathname.indexOf('/d/') >= 0) return;                  /* 暗号化データ：このSWは、触れない（通信できなければ、アプリ側が、保存済みを使う） */
  if (/\/demo\.html$/.test(new URL(e.request.url).pathname)) {                    /* デモ画面（鍵なしの表示）：遅い回線で、古い版や、別のページ（index.html）を、代わりに返さない。毎回、通信で取る。取れなければ、空の応答（アプリは、そのまま使える） */
    e.respondWith(offline() ? caches.match(e.request, { ignoreSearch: true }).then(function (h) { return h || new Response('', { status: 504 }); })
      : fresh(e.request).then(function (r) { if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); } return r; }).catch(function () { return caches.match(e.request, { ignoreSearch: true }).then(function (h) { return h || new Response('', { status: 504 }); }); }));
    return;
  }
  if (offline()) {                                                               /* 通信できない：保存済みだけで返す（通信を試さない＝iPhoneの警告が出ない） */
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (h) { return h || (isPage(e.request) ? (caches.match('./index.html') || caches.match('./')) : null) || new Response('', { status: 504 }); }));
    return;
  }
  if (isPage(e.request)) {                                                       /* 画面（HTML）：最新を優先。取れなければ、保存済みの版 */
    var net = fresh(e.request).then(function (r) {
      if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return r;
    });
    var cached = function () { return caches.match(e.request, { ignoreSearch: true }).then(function (h) { return h || caches.match('./index.html') || caches.match('./'); }); };
    var timer = new Promise(function (res) { setTimeout(function () { res(null); }, WAIT_MS); });
    e.respondWith(Promise.race([net.catch(function () { return null; }), timer]).then(function (r) {
      if (r && r.ok) return r;                                                   /* 取れた */
      return cached().then(function (h) { return h || r || net; });             /* 3秒待っても取れない／圏外／サーバーの不調（5xx・GitHubのユニコーン画面など）：保存済みの版で開く（保存が無い時だけ、その応答） */
    }));
    e.waitUntil(net.catch(function () {}));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {   /* アイコンなど：保存済みを返し、裏で最新に */
    if (hit) { fresh(e.request).then(function (r) { if (r && r.ok) caches.open(CACHE).then(function (c) { c.put(e.request, r); }); }).catch(function () {}); return hit; }
    return fetch(e.request).catch(function () { return caches.match('./index.html'); });
  }));
});
