import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AprendizContextService } from '../services/aprendiz-context.service';

/**
 * Guard de roles: combina `route.data['roles']` (cargo) y
 * `route.data['servicios']` (sistema de permisos dinámico) de DOS formas
 * distintas, según qué se necesite:
 *
 * - `roles` / `servicios` (ambos opcionales) → OR: pasa si el cargo está en
 *   `roles`, O si tiene alguno de `servicios`. Pensado para cuando ambos
 *   apuntan a POBLACIONES DISTINTAS — ej. Encuestas: `roles` = admin,
 *   `servicios` = alternativa para instructor/aprendiz que reciban el
 *   permiso. Si una ruta no define `servicios`, el comportamiento es
 *   exactamente el de antes (solo `roles`).
 *
 * - `serviciosRequeridos` (opcional, independiente de lo anterior) → AND:
 *   sin importar si pasó por `roles` o por `servicios`, TAMBIÉN debe tener
 *   cada servicio listado acá. Pensado para cuando `roles` y el servicio
 *   gatean a la MISMA población — ej. Materiales instructor: la ruta ya es
 *   `roles: ['instructor']` porque es una pantalla distinta a la de admin,
 *   y `serviciosRequeridos` es lo que permite revocarle el acceso a un
 *   instructor puntual sin afectar a los demás. Usar `servicios` (OR) acá
 *   sería un no-op: el cargo del propio usuario siempre matchea su propio
 *   `roles`, así que el servicio nunca se llegaría a chequear.
 *
 * Uso en rutas:
 *   { path: 'admin', data: { roles: ['administrador'] } }
 *   { path: 'encuestas', data: { roles: ['administrador', 'administrador_erp'], servicios: ['encuestas.gestionar'] } }
 *   { path: 'instructor/materiales/sitios', data: { roles: ['instructor'], serviciosRequeridos: ['materiales.sitios.ver'] } }
 *
 * - `soloAprendizConEtapa` (opcional, bool) → AND extra SOLO para cargo
 *   'aprendiz': la ruta solo se deja entrar si el aprendiz ya tiene una
 *   etapa práctica creada (`AprendizContextService`). No afecta a
 *   admin/instructor. Espeja el filtro `soloAprendizConEtapa` del sidebar,
 *   para que el deep-link a `/format` o `/seguimiento` tampoco entre.
 *
 * Si el usuario no cumple las condiciones, redirige al Home (/).
 */
export const roleGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const allowedRoles: string[] = route.data['roles'] ?? [];
  const allowedServicios: string[] = route.data['servicios'] ?? [];
  const serviciosRequeridos: string[] = route.data['serviciosRequeridos'] ?? [];

  const sinRestriccionRolServicio = allowedRoles.length === 0 && allowedServicios.length === 0;
  const pasaPorRolOServicio =
    sinRestriccionRolServicio ||
    (allowedRoles.length > 0 && auth.hasRole(allowedRoles)) ||
    (allowedServicios.length > 0 && allowedServicios.some((s) => auth.tieneServicio(s)));

  const pasaServiciosRequeridos = serviciosRequeridos.every((s) => auth.tieneServicio(s));

  if (!pasaPorRolOServicio || !pasaServiciosRequeridos) {
    return router.createUrlTree(['/']);
  }

  // Recorte extra: rutas de etapa práctica que un aprendiz solo puede abrir
  // si YA tiene una etapa (deep-link — el link del sidebar ya se filtra aparte).
  if (route.data['soloAprendizConEtapa'] && auth.cargo() === 'aprendiz') {
    const aprendizCtx = inject(AprendizContextService);
    await aprendizCtx.cargar(); // idempotente y cacheado por usuario
    if (aprendizCtx.tieneEtapa() !== true) {
      return router.createUrlTree(['/']);
    }
  }

  return true;
};
