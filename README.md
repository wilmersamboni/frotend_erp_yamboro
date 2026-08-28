# EpsasAngular

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.2.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Configuración de entorno y despliegue (Fase F6)

Las URLs de los backends viven en `src/environments/environment.ts` (desarrollo)
y `environment.production.ts` (producción), inyectadas vía `fileReplacements`
en `angular.json` al correr `ng build --configuration production`.

**Decisión de despliegue:** el modelo es de **subdominios por tenant**
(`tenant1.dominio.com`) con un **reverse proxy (nginx)** delante, que:
- Sirve el build estático (`dist/epsas-angular/browser`) como raíz del sitio.
- Enruta `/api` → `localhost:3000` (ERP) y `/api2` → `localhost:3001` (prácticas).

Como el proxy vive en el **mismo dominio** que el frontend, las rutas siguen
siendo **relativas** (`/api`, `/api2`) tanto en desarrollo (vía
`proxy.conf.js` de `ng serve`) como en producción (vía nginx) — no hay URLs
absolutas que mantener. Si en el futuro los backends se sirvieran desde un
dominio distinto al del estático, `environment.production.ts` es el único
archivo que habría que tocar (cambiar `apiUrl`/`apiPracticaUrl` a URLs
absolutas); los ~14 servicios que los consumen no necesitarían cambios.

## Archivos estáticos (`public/` vs `src/assets/`)

Angular 21 sirve por defecto la carpeta **`public/`** en la raíz del sitio
(no `src/assets/`). En este proyecto, `src/assets/` solo se usa para los
globs específicos mapeados a mano en `angular.json` (iconos de Taiga UI,
imágenes de Leaflet); cualquier archivo estático nuevo (imágenes, fuentes,
etc.) debe ir en `public/` y se referencia con ruta absoluta desde la raíz
(p. ej. `/login/campus-1.jpg`), no con el prefijo `assets/`.

## Login (carrusel + panel diagonal)

Los dos componentes de inicio de sesión comparten el mismo lenguaje visual:
foto de fondo a pantalla completa, tarjeta con panel izquierdo en diagonal
(`clip-path`) con un carrusel de fotos del Centro Yamboró, y panel derecho
con el formulario.

- `src/app/features/auth/login/` — login de tenant (usuario normal), activo
  cuando se entra por subdominio (`tenant.dominio.com`).
- `src/app/features/panel-admin/login/` — login del panel administrativo
  (superadmin), activo cuando se entra sin subdominio (ver `app.routes.ts`,
  guard `canMatch: [() => !tieneSubdominio()]`).

Ambos usan las mismas 7 fotos en `public/login/campus-1.jpg` … `campus-7.png`
y la misma lógica de carrusel (`signal` de slide activo + `setInterval` de
6s, reiniciado al navegar manualmente con las flechas o los puntos).

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
