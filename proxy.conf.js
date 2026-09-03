const PROXY_CONFIG = {
  "/api/": {
    target: "http://localhost:3000",
    secure: false,
    changeOrigin: true,
    ws: true,
    logLevel: "debug"
  },
  "/uploads/": {
    // Mismo backend que /api2/ (backend-hexagonal, puerto 3001). Los links
    // "Ver"/"Descargar" de formatos/bitácoras son navegaciones <a href> /
    // [download] planas del navegador: NO pasan por el HttpClient de Angular,
    // así que el interceptor no puede adjuntar el header x-tenant. Con
    // changeOrigin:true el backend tampoco ve el subdominio en el Host, y sin
    // slug el JwtExtractorMiddleware no arma contexto de tenant → RlsGuard
    // responde 401 "No se encontró sesión válida". Solución: derivar el slug
    // del subdominio del Host entrante (prueba.localhost → "prueba") y
    // setearlo como header x-tenant acá en el proxy.
    //
    // OJO: el dev-server de Angular 21 (@angular/build:dev-server) usa Vite,
    // cuyo proxy es 'http-proxy' puro — NO soporta las claves onProxyReq /
    // onProxyRes de webpack-dev-server. El punto de extensión es configure().
    // (La cookie de sesión http-proxy la reenvía sola; changeOrigin solo
    // reescribe el Host, no toca Cookie.)
    target: "http://localhost:3001",
    secure: false,
    changeOrigin: true,
    logLevel: "debug",
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq, req) => {
        const host = (req.headers.host || "").split(":")[0];
        const label = host.split(".")[0];
        const sinSubdominio =
          !label ||
          host === "localhost" ||
          host === label || // host sin punto → no hay subdominio de tenant
          /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
        if (!sinSubdominio) {
          proxyReq.setHeader("x-tenant", label.toLowerCase());
        }
      });
    }
  },
  "/api2/": {
    // backend-practica-hexagonal: práctica + horarios + encuestas (fusionado,
    // ya no hay un backend-encuestas aparte en el puerto 3002/api3)
    target: "http://localhost:3001",
    secure: false,
    changeOrigin: true,
    ws: true,
    logLevel: "debug",
    cookieDomainRewrite: "localhost",
    onProxyReq(proxyReq, req) {
      if (req.headers.cookie) {
        proxyReq.setHeader("Cookie", req.headers.cookie);
      }
    },
    onProxyRes(proxyRes) {
      const cookies = proxyRes.headers["set-cookie"];
      if (cookies) {
        proxyRes.headers["set-cookie"] = cookies.map(c =>
          c.replace(/; SameSite=None/gi, "")
           .replace(/; Secure/gi, "")
        );
      }
    }
  }
};

module.exports = PROXY_CONFIG;



// const PROXY_CONFIG = {
//   "/api/": {
//     target: "http://2.24.77.37",  // ← IP del VPS
//     secure: false,
//     changeOrigin: true,
//     logLevel: "debug"
//   },
//   "/uploads/": {
//     target: "http://2.24.77.37",  // ← IP del VPS
//     secure: false,
//     changeOrigin: true,
//     logLevel: "debug"
//   },
//   "/api2/": {
//     target: "http://2.24.77.37",  // ← IP del VPS
//     secure: false,
//     changeOrigin: true,
//     logLevel: "debug",
//     cookieDomainRewrite: "localhost",
//     onProxyReq(proxyReq, req) {
//       if (req.headers.cookie) {
//         proxyReq.setHeader("Cookie", req.headers.cookie);
//       }
//     },
//     onProxyRes(proxyRes) {
//       const cookies = proxyRes.headers["set-cookie"];
//       if (cookies) {
//         proxyRes.headers["set-cookie"] = cookies.map(c =>
//           c.replace(/; SameSite=None/gi, "")
//            .replace(/; Secure/gi, "")
//         );
//       }
//     },
//     logLevel: "debug"
//   }
// };

// module.exports = PROXY_CONFIG;