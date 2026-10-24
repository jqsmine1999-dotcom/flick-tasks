// App-shell cache so the composer opens instantly, even offline.
const CACHE = 'flick-v2'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  if (e.request.mode === 'navigate' && url.pathname === '/') {
    // Stale-while-revalidate: paint the cached shell immediately, refresh it in the background.
    const network = fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put('/', copy))
      }
      return res
    })
    e.respondWith(caches.match('/').then((hit) => hit || network))
    e.waitUntil(network.then(() => undefined, () => undefined))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    // Hashed, immutable files: cache first.
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copy))
            return res
          }),
      ),
    )
  }
})
