import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MaterialesApiService } from '../services/materiales/materiales-api.service';

/**
 * Redirige a `/mi-bodega` a cualquier encargado de bodega (cualquier cargo)
 * que intente entrar a `/materiales/productos` — la vista genérica sigue
 * siendo la que usan admin y líder de área.
 *
 * No alcanza con quitarle el link del sidebar: el encargado de bodega SIGUE
 * teniendo el servicio `materiales.productos.ver` (lo necesita para que Mi
 * Bodega funcione, viene con `BUNDLE_ENCARGADO_BODEGA`), así que la ruta
 * quedaba igual de accesible tecleando la URL a mano. Este guard corre
 * ADEMÁS de `roleGuard` (que sigue validando el servicio) — este solo decide
 * si, teniendo el servicio, corresponde mandarlo a la pantalla acotada.
 */
export const productosGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  if (auth.isAdmin()) return true;

  const api = inject(MaterialesApiService);
  const router = inject(Router);
  try {
    const aCargo = await api.sitiosACargo();
    if (aCargo.length > 0) return router.createUrlTree(['/mi-bodega']);
  } catch {
    // Si no se pudo resolver, mejor dejar pasar que romper el acceso a Productos.
  }
  return true;
};
