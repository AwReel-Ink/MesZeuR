// MesZeuR Service Worker
// © 2026 LEROY Aurélien - Tous droits réservés

// La version vient de l'URL d'enregistrement (sw.js?v=1.4.0), définie une seule fois dans app.js.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `meszeur-${VERSION}`;
const BASE = self.registration.scope;   // fonctionne en sous-dossier GitHub Pages comme en local
const ASSETS = ['', 'index.html', 'style.css', 'app.js', 'jszip.min.js', 'manifest.json', 'icon192x192.png', 'icon512x512.png']
    .map(p => new URL(p, BASE).href);

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // un fichier manquant n'empêche pas l'installation des autres
            .then(cache => Promise.allSettled(ASSETS.map(url => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(
                names.filter(n => n.startsWith('meszeur-') && n !== CACHE_NAME).map(n => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);
    if (req.method !== 'GET' || !url.protocol.startsWith('http') || url.origin !== location.origin) return;

    event.respondWith(
        // ignoreSearch : "index.html?action=travail" retrouve la page en cache
        caches.match(req, { ignoreSearch: true }).then(cached => {
            if (cached) return cached;
            return fetch(req)
                .then(res => {
                    if (res && res.status === 200 && res.type === 'basic') {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
                    }
                    return res;
                })
                .catch(() => (req.mode === 'navigate' ? caches.match(new URL('index.html', BASE).href) : undefined));
        })
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
