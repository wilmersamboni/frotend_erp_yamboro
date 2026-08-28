import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Equivalente al componente <ProtectedRoute> de React.
 *
 * React:
 *   if (!user) return <Navigate to="/login" replace />;
 *   return children;
 *
 * Angular:
 *   if (!isAuthenticated) → redirect al login (path '', no existe '/login'
 *   como ruta propia) guardando a dónde volver en returnUrl
 *   else → allow navigation
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/'], { queryParams: { returnUrl: state.url } });
};
