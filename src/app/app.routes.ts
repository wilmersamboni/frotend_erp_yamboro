import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

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
        loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
      },
      {
        // Alias: authGuard redirige a /login — debe resolver al mismo login de la raíz
        path: 'login',
        loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
      },
      // {
      //   path: 'ForgotPassword',
      //   loadComponent: () =>
      //     import('./features/auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent),
      // },
      {
        path: '404',
        loadComponent: () => import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
      },
      {
        path: '',
        // authGuard en el padre cubre todas las rutas internas; corre antes que
        // los roleGuard de los hijos (los guards del padre se evalúan primero).
        canActivate: [authGuard],
        loadComponent: () => import('./layout/main-layout/main-layout.component').then((m) => m.MainLayoutComponent),
        children: [
          { path: 'home', loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent) },
          // Sin `roles`: admin/instructor entran libres; el aprendiz solo si ya
          // tiene etapa práctica (deep-link — el link del sidebar ya se filtra).
          { path: 'seguimiento', canActivate: [roleGuard], data: { soloAprendizConEtapa: true }, loadComponent: () => import('./features/seguimiento/seguimiento.component').then((m) => m.SeguimientoComponent) },
          // 'servicios' es alternativa OR a 'roles' (misma lógica que /admin):
          // quien no es admin por cargo pero tiene los servicios que esta
          // pantalla realmente consume (busca por cédula en personas +
          // matrículas) puede entrar igual.
          // Herramienta de consulta por cédula ("Historial del aprendiz"): staff-only
          // por cargo. NO se gatea por personas.ver/matriculas.ver — son baseline de
          // todo rol (aprendiz incluido) y dejaban entrar al aprendiz. Sync con sidebar.
          { path: 'docs', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp', 'instructor'] }, loadComponent: () => import('./features/historial/historial.component').then((m) => m.HistorialComponent) },
          // Formatos = plantillas de la etapa práctica: admin/instructor libres;
          // el aprendiz solo con etapa práctica (mismo criterio que el sidebar).
          { path: 'format', canActivate: [roleGuard], data: { soloAprendizConEtapa: true }, loadComponent: () => import('./features/formatos/formatos.component').then((m) => m.FormatosComponent) },
          { path: 'blog', loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent) },
          // Sin 'roles': el acceso a /admin es 100% por 'permisos.gestionar'
          // (el servicio de RBAC), no por cargo. OJO: antes esto era un OR de
          // 11 servicios (personas.ver, practica.*.ver, etc.) — se achicó a
          // uno solo porque esos otros 10 son de lectura BÁSICA que
          // instructor ya trae por defecto en su rol (ver SERVICIOS_POR_ROL,
          // tenant-admin.service.ts) — con el OR, revocarle solo
          // 'permisos.gestionar' a un instructor no lo bloqueaba de /admin
          // porque le quedaban los otros 10 (bug real, reportado por el
          // usuario). administrador/administrador_erp siguen entrando en la
          // práctica porque 'permisos.gestionar' ya viene en su
          // SERVICIOS_POR_ROL por defecto — si se revoca explícitamente,
          // pierden el acceso igual que cualquier otro cargo. Ver plan
          // "Ronda 3" (continuación, Fase 10/11).
          { path: 'admin', canActivate: [roleGuard], data: { servicios: ['permisos.gestionar'] }, loadComponent: () => import('./features/admin/admin-panel/admin-panel.component').then((m) => m.AdminPanelComponent) },
          { path: 'settings', loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent) },
          { path: 'area-detail/:idArea', loadComponent: () => import('./features/seguimiento/page-course/page-course.component').then((m) => m.PageCourseComponent) },
          { path: 'pagetable/:idCurso', loadComponent: () => import('./features/seguimiento/page-table/aprendices.page.ts').then((m) => m.AprendicesPage) },
          // OJO: 'servicios' (OR), no 'serviciosRequeridos' (AND) — roles=admin
          // y "instructor con practica.migracion otorgado" son POBLACIONES
          // DISTINTAS (misma lección de Fase 3.2: AND es solo para cuando
          // roles y el servicio gatean a la MISMA gente). Con AND, un
          // instructor con el servicio nunca pasaba porque 'roles' ya lo
          // bloqueaba antes de que el servicio tuviera chance de rescatarlo.
          { path: 'migracion', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'], servicios: ['practica.migracion'] }, loadComponent: () => import('./features/migracion/migration.component').then((m) => m.MigrationComponent) },

          // ── Horarios (portado de ChronoGest) ──────────────────────────────
          // Solo el servicio elevado gatea la ruta (no 'horarios.ver'/'horarios.competencias':
          // esos ya son parte del acceso por defecto de todo instructor/aprendiz — incluirlos
          // acá abriría la página admin completa a cualquiera, no solo a quien recibió el
          // permiso extra). Ver PermisoService/SERVICIOS_POR_ROL en backend-erp.
          { path: 'horarios', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'], servicios: ['horarios.gestionar'] }, loadComponent: () => import('./features/admin/horarios/horarios.component').then((m) => m.AdminHorariosComponent) },
          { path: 'programador-eventos', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'], servicios: ['horarios.eventos'] }, loadComponent: () => import('./features/admin/programador-eventos/programador-eventos.component').then((m) => m.ProgramadorEventosComponent) },
          { path: 'mis-horarios', canActivate: [roleGuard], data: { roles: ['instructor'] }, loadComponent: () => import('./features/instructor/mis-horarios/instructor-mis-horarios.component').then((m) => m.InstructorMisHorariosComponent) },
          { path: 'aprendiz-mis-horarios', canActivate: [roleGuard], data: { roles: ['aprendiz'] }, loadComponent: () => import('./features/aprendiz/mis-horarios/aprendiz-mis-horarios.component').then((m) => m.AprendizMisHorariosComponent) },

          // ── Encuestas de satisfacción docente ─────────────────────────────
          { path: 'encuestas', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'], servicios: ['encuestas.gestionar'] }, loadComponent: () => import('./features/admin/encuestas/encuestas.component').then((m) => m.EncuestasComponent) },
          { path: 'encuestas/preguntas', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'], servicios: ['encuestas.gestionar'] }, loadComponent: () => import('./features/admin/encuestas/preguntas.component').then((m) => m.PreguntasComponent) },

          // ── Materiales (bodega) — slice de admin, ver plan temporal-seeking-hare ──
          { path: 'materiales/categorias', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/categorias.component').then((m) => m.MaterialesCategoriasComponent) },
          { path: 'materiales/sitios', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/sitios.component').then((m) => m.MaterialesSitiosComponent) },
          { path: 'materiales/productos', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/productos.component').then((m) => m.MaterialesProductosComponent) },
          { path: 'materiales/inventario', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/inventario.component').then((m) => m.MaterialesInventarioComponent) },
          { path: 'materiales/items', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/items.component').then((m) => m.MaterialesItemsComponent) },
          { path: 'materiales/kardex', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/kardex.component').then((m) => m.MaterialesKardexComponent) },
          { path: 'materiales/novedades', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/novedades.component').then((m) => m.MaterialesNovedadesComponent) },
          { path: 'materiales/traslados', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/traslados.component').then((m) => m.MaterialesTrasladosComponent) },
          { path: 'materiales/solicitudes', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/solicitudes.component').then((m) => m.MaterialesSolicitudesComponent) },
          { path: 'materiales/devoluciones', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/devoluciones.component').then((m) => m.MaterialesDevolucionesComponent) },
          { path: 'materiales/asignaciones', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./features/admin/materiales/asignaciones.component').then((m) => m.MaterialesAsignacionesComponent) },

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
          { path: 'instructor/materiales/sitios', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.sitios.ver'] }, loadComponent: () => import('./features/instructor/materiales/sitios.component').then((m) => m.InstructorMaterialesSitiosComponent) },
          { path: 'instructor/materiales/productos', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.productos.ver'] }, loadComponent: () => import('./features/instructor/materiales/productos.component').then((m) => m.InstructorMaterialesProductosComponent) },
          { path: 'instructor/materiales/items', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.items.ver'] }, loadComponent: () => import('./features/instructor/materiales/items.component').then((m) => m.InstructorMaterialesItemsComponent) },
          { path: 'instructor/materiales/inventario', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.inventario.ver'] }, loadComponent: () => import('./features/instructor/materiales/inventario.component').then((m) => m.InstructorMaterialesInventarioComponent) },
          { path: 'instructor/materiales/kardex', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.kardex.ver'] }, loadComponent: () => import('./features/instructor/materiales/kardex.component').then((m) => m.InstructorMaterialesKardexComponent) },
          { path: 'instructor/materiales/devoluciones', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.devoluciones.ver'] }, loadComponent: () => import('./features/instructor/materiales/devoluciones.component').then((m) => m.InstructorMaterialesDevolucionesComponent) },
          { path: 'instructor/materiales/solicitudes', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.solicitudes.ver'] }, loadComponent: () => import('./features/instructor/materiales/solicitudes.component').then((m) => m.InstructorMaterialesSolicitudesComponent) },
          { path: 'instructor/materiales/traslados', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.traslados.ver'] }, loadComponent: () => import('./features/instructor/materiales/traslados.component').then((m) => m.InstructorMaterialesTrasladosComponent) },
          { path: 'instructor/materiales/novedades', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.novedades.ver'] }, loadComponent: () => import('./features/instructor/materiales/novedades.component').then((m) => m.InstructorMaterialesNovedadesComponent) },
          { path: 'instructor/materiales/asignaciones', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.asignaciones.ver'] }, loadComponent: () => import('./features/instructor/materiales/asignaciones.component').then((m) => m.InstructorMaterialesAsignacionesComponent) },
          // Sin servicio propio ('materiales.categorias.*' no existe en el catálogo, ver comentario en el componente) — reusa materiales.inventario.ver.
          { path: 'instructor/materiales/categorias', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.inventario.ver'] }, loadComponent: () => import('./features/instructor/materiales/categorias.component').then((m) => m.InstructorMaterialesCategoriasComponent) },

          // ── Materiales (bodega) — aprendiz: solo lectura + solicitar/recibir préstamos propios. Mismo criterio que instructor arriba.
          { path: 'aprendiz/materiales/inventario', canActivate: [roleGuard], data: { roles: ['aprendiz'], serviciosRequeridos: ['materiales.inventario.ver'] }, loadComponent: () => import('./features/aprendiz/materiales/inventario.component').then((m) => m.AprendizMaterialesInventarioComponent) },
          { path: 'aprendiz/materiales/productos', canActivate: [roleGuard], data: { roles: ['aprendiz'], serviciosRequeridos: ['materiales.productos.ver'] }, loadComponent: () => import('./features/aprendiz/materiales/productos.component').then((m) => m.AprendizMaterialesProductosComponent) },
          { path: 'aprendiz/materiales/items', canActivate: [roleGuard], data: { roles: ['aprendiz'], serviciosRequeridos: ['materiales.items.ver'] }, loadComponent: () => import('./features/aprendiz/materiales/items.component').then((m) => m.AprendizMaterialesItemsComponent) },
          { path: 'aprendiz/materiales/solicitudes', canActivate: [roleGuard], data: { roles: ['aprendiz'], serviciosRequeridos: ['materiales.solicitudes.ver'] }, loadComponent: () => import('./features/aprendiz/materiales/solicitudes.component').then((m) => m.AprendizMaterialesSolicitudesComponent) },
        ],
      },
      // Responder encuesta: sin sidebar y sin sesión — el backend ya trata
      // /responder/:token como público (@Public(), sin personaId en la
      // respuesta), así que el link/QR se responde de forma anónima, sin
      // loguearse ni pasar por ninguna página de "Mis Encuestas".
      { path: 'responder/:token', loadComponent: () => import('./features/public/responder-encuesta/responder-encuesta.component').then((m) => m.ResponderEncuestaComponent) },
      // Link/QR único por grupo (una ficha, varios instructores) — también
      // público: sin personaId no se puede resolver "el siguiente pendiente",
      // así que el componente lista todos los instructores del grupo y el
      // aprendiz anónimo elige a cuál responder (ver GrupoPublicoController).
      { path: 'responder-grupo/:grupoId', loadComponent: () => import('./features/public/responder-grupo/responder-grupo.component').then((m) => m.ResponderGrupoComponent) },
      { path: '**', redirectTo: '404' },
    ],
  },

  // Comodín global (por si ningún canMatch pasa)
  { path: '**', redirectTo: '' },
];
