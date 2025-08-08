// Versión del Service Worker - incrementar cuando hay cambios importantes
const SW_VERSION = '2.0.222';
const CACHE_NAME = `mi-diario-cache-v${SW_VERSION}`;

// Archivos críticos para cachear
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png'
];

// Estrategia: Network First, fallback to cache
const networkFirstStrategy = async (request) => {
  try {
    // Intentar obtener de la red primero
    const networkResponse = await fetch(request);
    
    // Si la respuesta es exitosa, cachearla
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Si falla la red, intentar desde caché
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Si no hay caché, devolver error
    throw error;
  }
};

// Estrategia: Cache First, fallback to network (para recursos estáticos)
const cacheFirstStrategy = async (request) => {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    throw error;
  }
};

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log(`[SW] Instalando versión ${SW_VERSION}`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando archivos críticos');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Activar inmediatamente el nuevo Service Worker
        return self.skipWaiting();
      })
  );
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  console.log(`[SW] Activando versión ${SW_VERSION}`);
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // Eliminar caches antiguos
            if (cacheName !== CACHE_NAME) {
              console.log(`[SW] Eliminando cache antiguo: ${cacheName}`);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Tomar control de todas las páginas inmediatamente
        return self.clients.claim();
      })
  );
});

// Interceptar requests
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar requests no-GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Estrategia según el tipo de recurso
  if (url.pathname === '/' || url.pathname === '/index.html') {
    // Para la página principal, usar Network First
    event.respondWith(networkFirstStrategy(request));
  } else if (url.pathname.startsWith('/src/') || url.pathname.includes('.js') || url.pathname.includes('.css')) {
    // Para archivos de la aplicación, usar Network First con cache
    event.respondWith(networkFirstStrategy(request));
  } else {
    // Para recursos estáticos (imágenes, etc.), usar Cache First
    event.respondWith(cacheFirstStrategy(request));
  }
});

// Escuchar mensajes de la aplicación
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
}); 