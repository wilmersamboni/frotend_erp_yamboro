import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MaterialesApiService } from '../../features/materiales/data-access/materiales-api.service';

/**
 * Pantallas de Materiales para quien GESTIONA (2026-10-02): admin, encargado
 * de al menos una bodega o líder de área. Hoy: el Reporte de materiales, que
 * muestra nombres y cédulas de quien tiene cada material — un instructor común
 * con `materiales.existencias.ver` no debe verlo. El backend aplica la misma
 * regla (`ExistenciasService.assertPuedeVerReporte`); esto solo evita mostrar
 * una pantalla que respondería 403.
 */
export const gestorMaterialesGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const api = inject(MaterialesApiService);
  const router = inject(Router);
  if (auth.isAdmin()) return true;
  try {
    const [bodegas, lider] = await Promise.all([
      api.sitiosACargo().catch(() => []),
      api.puedeGestionarCatalogo().catch(() => false),
    ]);
    return bodegas.length > 0 || lider ? true : router.createUrlTree(['/']);
  } catch {
    return router.createUrlTree(['/']);
  }
};
