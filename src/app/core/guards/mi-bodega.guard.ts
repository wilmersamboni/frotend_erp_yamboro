import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MaterialesApiService } from '../services/materiales/materiales-api.service';

/**
 * Deja pasar a `/mi-bodega` solo si el usuario es `id_responsable` de al menos
 * una bodega. No usa `roles` — cualquier cargo puede ser encargado de bodega.
 * Si no lo es, redirige a home.
 */
export const miBodegaGuard: CanActivateFn = async () => {
  const api = inject(MaterialesApiService);
  const router = inject(Router);
  try {
    const bodegas = await api.sitiosACargo();
    return bodegas.length > 0 ? true : router.createUrlTree(['/']);
  } catch {
    return router.createUrlTree(['/']);
  }
};
