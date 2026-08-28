const PROXY_CONFIG = {
  "/api/": {
    target: "http://localhost:3000",
    secure: false,
    changeOrigin: true,
    ws: true,
    logLevel: "debug"
  },
  "/uploads/": {
    target: "http://localhost:3001",
    secure: false,
    changeOrigin: true,
    logLevel: "debug"
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