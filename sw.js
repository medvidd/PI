const CACHE_NAME = "pwa-cache-v1";
const ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/tasks.html',
    '/script.js',
    '/style.css',
    '/manifest.json',
    '/images/account.png',
    '/images/bell1.png',
    '/images/lg92px.png',
    '/images/lg144px.png',
    '/images/lg384px.png',
    '/images/lg512px.png',
    'https://fonts.googleapis.com/css2?family=Hind:wght@300;400;500;600;700&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Nunito:ital,wght@0,200..1000;1,200..1000&family=Rubik:ital,wght@0,300..900;1,300..900&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', evt => {
    evt.waitUntil(  
        caches.open(CACHE_NAME).then((cache) => {
          return cache.addAll(ASSETS);
        })
      );
});

self.addEventListener('fetch', evt => {
    evt.respondWith(
        cashes.match(evt.request).then(function(response) {
            return response || fetch(evt.request); //.catch(function() {
                /*return cashes.match('/offline.html');
            })*/
        })
    )
})

self.addEventListener("activate", evt => {
    evt.waitUntil(
        caches.keys().then((keys) => {
          return Promise.all(
            keys
              .filter((key) => key !== CACHE_NAME && key !== dynamicCash)
              .map((key) => caches.delete(key))
          );
        })
        .then(() => {
          return self.clients.claim(); 
        })
    );
});