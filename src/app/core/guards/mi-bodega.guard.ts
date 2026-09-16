import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MaterialesApiService } from '../services/materiales/materiales-api.service';

/**
 * Deja pasar a `/mi-bodega` solo si el usuario es `id_responsable` de al menos
 * una bodega. No usa `roles` — cualquier cargo puede ser encargado de bodega.
 * Si no lo es, redirige a home.
 *
 * El admin queda excluido a propósito (aunque además sea `id_responsable` de
 * alguna bodega): tiene su propia consola de "Todas las bodegas"
 * (`/materiales/bodegas`, mismo componente con `todasLasBodegas`), que no
 * recorta a "las mías" — usar "Mi Bodega" ahí sería confuso y redundante.
 */
export const miBodegaGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const api = inject(MaterialesApiService);
  const router = inject(Router);
  if (auth.isAdmin()) return router.createUrlTree(['/']);
  try {
    const bodegas = await api.sitiosACargo();
    return bodegas.length > 0 ? true : router.createUrlTree(['/']);
  } catch {
    return router.createUrlTree(['/']);
  }
};
