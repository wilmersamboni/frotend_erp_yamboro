# ---------- Etapa 1: build ----------
# node:22-slim (Debian/glibc) en vez de alpine: lightningcss (dependencia nativa
# de Tailwind v4) no publica binario para musl (la libc de Alpine) y falla el build.
FROM node:22-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

# El package-lock.json se generó en Windows: varios paquetes con binarios
# nativos (lightningcss, @tailwindcss/oxide, esbuild) solo quedaron
# resueltos para win32. npm ci no los corrige (no re-resuelve).
# No usamos "npm install <pkg>" para agregarlos porque eso obliga a npm a
# recalcular el árbol completo y termina podando paquetes como
# @angular/cdk, @ng-web-apis/* y @taiga-ui/polymorpheus (peer-deps de
# taiga-ui que sí instaló npm ci, pero no están declaradas como
# dependencia directa). En vez de eso, se descarga el .tgz de cada
# paquete y se extrae directo a node_modules, sin tocar el resto del árbol.
# Las 3 versiones de abajo deben coincidir EXACTO con lo que resuelve
# package-lock.json para lightningcss / @tailwindcss/oxide / esbuild — si
# quedan desalineadas, esbuild falla en build con "Host version X does not
# match binary version Y". Revisar tras cualquier npm install/update.
RUN set -e; \
    mkdir -p node_modules/lightningcss-linux-x64-gnu \
             node_modules/@tailwindcss/oxide-linux-x64-gnu \
             node_modules/@esbuild/linux-x64; \
    npm pack lightningcss-linux-x64-gnu@1.32.0 --pack-destination /tmp --silent; \
    tar -xzf /tmp/lightningcss-linux-x64-gnu-1.32.0.tgz -C node_modules/lightningcss-linux-x64-gnu --strip-components=1; \
    npm pack @tailwindcss/oxide-linux-x64-gnu@4.3.3 --pack-destination /tmp --silent; \
    tar -xzf /tmp/tailwindcss-oxide-linux-x64-gnu-4.3.3.tgz -C node_modules/@tailwindcss/oxide-linux-x64-gnu --strip-components=1; \
    npm pack @esbuild/linux-x64@0.28.1 --pack-destination /tmp --silent; \
    tar -xzf /tmp/esbuild-linux-x64-0.28.1.tgz -C node_modules/@esbuild/linux-x64 --strip-components=1; \
    rm -f /tmp/*.tgz

COPY . .
RUN npm run build -- --configuration production

# ---------- Etapa 2: runtime (nginx) ----------
FROM nginx:1.27-alpine AS runtime

# La salida del builder @angular/build queda en dist/epsas-angular/browser
COPY --from=build /app/dist/epsas-angular/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
