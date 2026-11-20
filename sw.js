// Permite instalar la página como app y abrirla sin conexión.
// - La página siempre se pide primero a internet (así los cambios se ven de inmediato);
//   si no hay conexión, se usa la última copia guardada.
// - Los datos (del intermediario) también van primero a internet y guardan una copia de respaldo.
// - Las librerías y tipografías (con versión fija) se guardan una vez y se reutilizan.
// No se guarda ningún dato de quien usa la página: ni ubicación ni nada parecido.
const SHELL = "shell-v2";
const LIBS = "libs-v1";
const DATA = "data-v2";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => cache.addAll(["./", "./manifest.webmanifest", "./icons/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL, LIBS, DATA].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const save = (cacheName, key, response) => {
  const copy = response.clone();
  caches.open(cacheName).then(cache => cache.put(key, copy));
  return response;
};

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // La página: internet primero, copia guardada si no hay conexión
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req, { cache: "no-cache" })
        .then(res => (res.ok ? save(SHELL, "./", res) : res))
        .catch(() => caches.match("./"))
    );
    return;
  }

  // El intermediario: internet primero; sin conexión, la última respuesta a esa misma pregunta
  if (url.hostname === "script.google.com" || url.hostname === "script.googleusercontent.com") {
    if (url.searchParams.get("a") === "vote") return; // un voto nunca se responde desde la copia
    event.respondWith(
      fetch(req)
        .then(res => (res.ok ? save(DATA, req.url, res) : res))
        .catch(() => caches.match(req.url).then(hit => hit || Response.error()))
    );
    return;
  }

  // Librerías, tipografías, íconos: se guardan la primera vez
  const isLib = ["cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname);
  const isOwnFile = url.origin === self.location.origin;
  if (isLib || isOwnFile) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res =>
        (res.ok || res.type === "opaque") ? save(isLib ? LIBS : SHELL, req, res) : res))
    );
  }
  // Las imágenes del mapa no se guardan: son demasiadas
});
