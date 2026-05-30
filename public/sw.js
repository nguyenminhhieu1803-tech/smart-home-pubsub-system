const CACHE_NAME = "smarthome-v2";
const CACHE_FILES = [
    "/dashboard/index.html",
    "/dashboard/dashboard.css",
    "/dashboard/dashboard.js",
    "/assets/js/mqtt.min.js",
    "/assets/images/icon-192.png",
    "/assets/images/icon-512.png",
];

self.addEventListener("install", function(e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log("[SW] Caching files");
            return cache.addAll(CACHE_FILES);
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener("fetch", function(e) {
    if (e.request.url.includes("/api/")    ||
        e.request.url.includes("mqtt")     ||
        e.request.url.includes("ws://")    ||
        e.request.url.includes("/login")   ||
        e.request.url.includes("/logout")  ||
        e.request.method !== "GET") {
        return;
    }

    e.respondWith(
        fetch(e.request)
            .then(function(response) {
                if (response && response.status === 200 &&
                    response.type !== "opaque") {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(e.request, clone);
                    });
                }
                return response;
            })
            .catch(function() {
                return caches.match(e.request).then(function(cached) {
                    return cached || new Response("Offline", {
                        status: 503,
                        statusText: "Service Unavailable"
                    });
                });
            })
    );
});
