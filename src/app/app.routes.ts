import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { SERVICIOS_ADMIN_PANEL } from './features/tenant-administration/config/admin.config';
import { SCHEDULE_ROUTES } from './features/schedules/schedules.routes';
import { SURVEY_ROUTES } from './features/surveys/surveys.routes';
import { MATERIALS_ROUTES } from './features/materiales/materiales.routes';

function tieneSubdominio(): boolean {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
  // *.localhost en desarrollo (ej: tenant1.localhost)
  if (hostname.endsWith('.localhost')) return true;
  // Producción: subdominio.dominio.tld (3+ partes)
  return hostname.split('.').length >= 3;
}

export const routes: Routes = [
  // ─────────────────────────────────────────────
  // SIN SUBDOMINIO → Panel de administración de tenants
  // ─────────────────────────────────────────────
  {
    path: '',
    canMatch: [() => !tieneSubdominio()],
    loadChildren: () => import('./admin-panel.routes').then((m) => m.ADMIN_PANEL_ROUTES),
  },

  // ─────────────────────────────────────────────
  // CON SUBDOMINIO → Main ERP (app de tenant)
  // ─────────────────────────────────────────────
  {
    path: '',
    canMatch: [() => tieneSubdominio()],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/access/login/login.component').then((m) => m.LoginComponent),
      },
      {
        // Alias: authGuard redirige a /login — debe resolver al mismo login de la raíz
        path: 'login',
        loadComponent: () => import('./features/access/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: '404',
        loadComponent: () => import('./features/errors/not-found.component').then((m) => m.NotFoundComponent),
      },
      {
        path: '',
        // authGuard en el padre cubre todas las rutas internas; corre antes que
        // los roleGuard de los hijos (los guards del padre se evalúan primero).
        canActivate: [authGuard],
        loadComponent: () => import('./shell/tenant-layout/main-layout.component').then((m) => m.MainLayoutComponent),
        children: [
          { path: 'home', loadComponent: () => import('./features/dashboard/home.component').then((m) => m.HomeComponent) },
          // Sin `roles`: admin/instructor entran libres; el aprendiz solo si ya
          // tiene etapa práctica (deep-link — el link del sidebar ya se filtra).
          { path: 'seguimiento', canActivate: [roleGuard], data: { soloAprendizConEtapa: true }, loadComponent: () => import('./features/practice/seguimiento.component').then((m) => m.SeguimientoComponent) },
          // 'servicios' es alternativa OR a 'roles' (misma lógica que /admin):
          // quien no es admin por cargo pero tiene los servicios que esta
          // pantalla realmente consume (busca por cédula en personas +
          // matrículas) puede entrar igual.
          // Herramienta de consulta por cédula ("Historial del aprendiz"): staff-only
          // por cargo. NO se gatea por personas.ver/matriculas.ver — son baseline de
          // todo rol (aprendiz incluido) y dejaban entrar al aprendiz. Sync con sidebar.
          // Admin entra por `roles`; instructor solo si le otorgan
          // `practica.historial.ver` como excepción personal (no viene de
          // fábrica — mismo patrón OR que Migración, pedido explícito
          // 2026-09-15: "un instructor... solo debería poder acceder a este
          // de igual manera con la gestión de formatos, solo si le conceden
          // el permiso").
          { path: 'docs', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'], servicios: ['practica.historial.ver'] }, loadComponent: () => import('./features/practice/history/historial.component').then((m) => m.HistorialComponent) },
          // Formatos: accesible a cualquiera con `practica.formatos.ver`
          // (aprendiz lo trae por defecto) — ya NO exige tener una etapa
          // práctica activa (corregido 2026-09-16, pedido explícito: "el
          // aprendiz por defecto debería tener acceso a verlos"). El
          // componente no depende de ninguna etapa (lista formatos globales),
          // así que la restricción era puramente de visibilidad, no técnica.
          { path: 'format', canActivate: [roleGuard], loadComponent: () => import('./features/practice/templates/formatos.component').then((m) => m.FormatosComponent) },
          { path: 'blog', loadComponent: () => import('./features/assistant/chat.component').then((m) => m.ChatComponent) },
          // Sin 'roles': el acceso a /admin es por cargo NADA — es 100% por
          // servicio, vía SERVICIOS_ADMIN_PANEL (admin.config.ts). Antes era
          // un único servicio ('permisos.gestionar'), lo que bloqueaba de
          // /admin a cualquiera con solo un permiso puntual real (ej.
          // Ambientes o el nivel '.administrar' de un recurso de Etapa
          // Práctica) que no fuera RBAC. SERVICIOS_ADMIN_PANEL amplía la
          // lista pero a propósito NO incluye ningún servicio que instructor
          // o aprendiz ya reciban por defecto (ver el comentario largo en su
          // definición) — evita reintroducir el bug original: antes esto fue
          // un OR de 11 servicios "básicos" (personas.ver, practica.*.ver,
          // etc.) que dejaba entrar a cualquier instructor aunque se le
          // revocara 'permisos.gestionar' explícitamente. Ver plan "Ronda 3"
          // (continuación, Fase 10/11).
          { path: 'admin', canActivate: [roleGuard], data: { servicios: SERVICIOS_ADMIN_PANEL }, loadComponent: () => import('./features/tenant-administration/admin-panel/admin-panel.component').then((m) => m.AdminPanelComponent) },
          { path: 'settings', loadComponent: () => import('./features/preferences/settings.component').then((m) => m.SettingsComponent) },
          // OJO: 'servicios' (OR), no 'serviciosRequeridos' (AND) — roles=admin
          // y "instructor con practica.migracion otorgado" son POBLACIONES
          // DISTINTAS (misma lección de Fase 3.2: AND es solo para cuando
          // roles y el servicio gatean a la MISMA gente). Con AND, un
          // instructor con el servicio nunca pasaba porque 'roles' ya lo
          // bloqueaba antes de que el servicio tuviera chance de rescatarlo.
          { path: 'migracion', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'], servicios: ['practica.migracion'] }, loadComponent: () => import('./features/practice/migration/migration.component').then((m) => m.MigrationComponent) },

          // ── Horarios (portado de ChronoGest) ──────────────────────────────
          // Solo el servicio elevado gatea la ruta (no 'horarios.ver'/'horarios.competencias':
          // esos ya son parte del acceso por defecto de todo instructor/aprendiz — incluirlos
          // acá abriría la página admin completa a cualquiera, no solo a quien recibió el
          // permiso extra). Ver PermisoService/SERVICIOS_POR_ROL en backend-erp.
          ...SCHEDULE_ROUTES,

          // ── Encuestas de satisfacción docente ─────────────────────────────
          ...SURVEY_ROUTES,

          // ── Mi Bodega — consola del encargado de bodega (sitio.id_responsable),
          // cualquier cargo salvo admin (tiene su propia vista de abajo). Sin
          // gate de `roles`; el guard mira si es responsable de ≥1 sitio y
          // excluye admin explícitamente. Ver plan "Encargado de bodega", Fase B4.

          // ── Todas las bodegas — misma consola de Mi Bodega, pero admin-only
          // y sin recortar a "las mías": `data.todasLasBodegas` le dice al
          // componente que traiga TODOS los sitios (`listarSitios()`) en vez
          // de `sitiosACargo()`.

          // ── Materiales (bodega) — pantallas compartidas por los 3 cargos
          // (ítem 5, "extraer componentes repetidos"): un solo componente y
          // una sola ruta, gateados por `serviciosRequeridos` (sin `roles` —
          // igual que Encuestas/Horarios, ver docblock de roleGuard) en vez
          // de vivir triplicados en features/{admin,instructor,aprendiz}/.
          // Categorías y Sitios no tienen variante aprendiz (nunca la
          // tuvieron); Lotes es admin-only (instructor/aprendiz nunca
          // tuvieron esa pantalla).
          // `productosGuard` corre además de `roleGuard`: un encargado de bodega
          // sigue teniendo `materiales.productos.ver` (lo necesita Mi Bodega),
          // así que sin este guard aparte la URL seguía siendo accesible a mano
          // aunque se le quitara el link del sidebar.

          // Lotes: se abre por servicio (no por `roles`) como el resto de las
          // 5 pantallas unificadas, para que un encargado de bodega o líder de
          // área de CUALQUIER cargo entre con su bundle de excepción personal.
          // Un instructor/aprendiz común YA NO trae 'materiales.lotes.ver' por
          // defecto (recorte 2026-09-16, MATERIALES_INSTRUCTOR/MATERIALES_APRENDIZ,
          // backend-epsas) — antes sí lo traían, este comentario quedó desactualizado.

          // ── Materiales (bodega) — slice de admin ──

          // ── Materiales (bodega) — instructor: solo lectura salvo lo suyo,
          // más acciones elevadas de "responsable de bodega" gateadas en el
          // propio componente vía PermisosService. Paths con prefijo
          // 'instructor/' (no 'materiales/...') porque roleGuard devuelve un
          // UrlTree en vez de false: dos rutas hermanas con el mismo path no
          // se "turnan" según el rol, la primera que matchea gana siempre
          // (mismo criterio que /mis-horarios vs /aprendiz-mis-horarios).
          // `roles` sigue siendo necesario acá (a diferencia de Encuestas/
          // Horarios): es lo que evita que un admin, que también tiene estos
          // mismos materiales.*.ver por defecto, vea esta pantalla de
          // instructor duplicada junto a la suya propia (/materiales/sitios).
          // `serviciosRequeridos` es un AND aparte, no un OR — revocarle el
          // servicio a UN instructor puntual le bloquea la ruta sin afectar
          // a los demás instructores ni depender de que 'roles' no matchee.

          // ── Materiales (bodega) — aprendiz: solo lectura + solicitar/recibir préstamos propios. Mismo criterio que instructor arriba.
          // `materiales.devoluciones.ver` está en MATERIALES_APRENDIZ por defecto desde 2026-09-16 ("devoluciones de él") — cualquier aprendiz llega acá, no solo uno encargado de bodega.
          ...MATERIALS_ROUTES,
        ],
      },
      // Responder encuesta: sin sidebar y sin sesión — el backend ya trata
      // /responder/:token como público (@Public(), sin personaId en la
      // respuesta), así que el link/QR se responde de forma anónima, sin
      // loguearse ni pasar por ninguna página de "Mis Encuestas".
      { path: 'responder/:token', loadComponent: () => import('./features/surveys/public-response/responder-encuesta.component').then((m) => m.ResponderEncuestaComponent) },
      // Link/QR único por grupo (una ficha, varios instructores) — también
      // público: sin personaId no se puede resolver "el siguiente pendiente",
      // así que el componente lista todos los instructores del grupo y el
      // aprendiz anónimo elige a cuál responder (ver GrupoPublicoController).
      { path: 'responder-grupo/:grupoId', loadComponent: () => import('./features/surveys/public-group/responder-grupo.component').then((m) => m.ResponderGrupoComponent) },
      { path: '**', redirectTo: '404' },
    ],
  },

  // Comodín global (por si ningún canMatch pasa)
  { path: '**', redirectTo: '' },
];
