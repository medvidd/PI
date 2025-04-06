const CACHE_NAME = "pwa-cache-v1";
const DYNAMIC_CACHE = "pwa-dynamic-v1";
const ASSETS = [
    '/PI/',
    '/PI/index.html',
    '/PI/dashboard.html',
    '/PI/tasks.html',
    '/PI/script.js',
    '/PI/style.css',
    '/PI/manifest.json',
    '/PI/sw.js',
    '/PI/images/account.png',
    '/PI/images/bell1.png',
    '/PI/images/lg92px.png',
    '/PI/images/lg144px.png',
    '/PI/images/lg384px.png',
    '/PI/images/lg512px.png',
    'https://fonts.googleapis.com/css2?family=Hind:wght@300;400;500;600;700&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Nunito:ital,wght@0,200..1000;1,200..1000&family=Rubik:ital,wght@0,300..900;1,300..900&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Caching static assets');
            return cache.addAll(ASSETS).catch((err) => {
                console.error('Failed to cache assets:', err);
            });
        })
    );
    self.skipWaiting(); 
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                const responseToCache = networkResponse.clone();
                caches.open(DYNAMIC_CACHE).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME && name !== DYNAMIC_CACHE)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});