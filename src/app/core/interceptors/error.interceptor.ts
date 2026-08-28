import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { ToastService } from '../services/toast.service';

/**
 * Manejo global de errores HTTP.
 *
 * - 401: la sesión del backend expiró (el JWT dura 12 h pero el `user` de
 *   localStorage no caduca). Limpia la sesión y redirige al login UNA sola
 *   vez, aunque fallen N requests en paralelo.
 * - 403: toast de "sin permiso" — NO desloguea.
 * - 429: toast de rate limit (el backend limita a 30 req/10 s).
 * - 0 / 503: toast de servicio no disponible.
 *
 * Siempre relanza el error (`throwError`) para que el `catchError` de cada
 * servicio/componente pueda manejarlo además del aviso global. Registrado
 * DESPUÉS de authInterceptor en app.config.ts, por lo que su catchError corre
 * antes que los pipes de los servicios.
 */

/** El login (ERP y panel admin) devuelve 401 con credenciales malas — ahí el
 *  componente muestra su propio error y no hay sesión que limpiar. */
function esRequestDeLogin(url: string): boolean {
  return url.includes('/auth/login');
}

/** Si 20 requests fallan a la vez con el mismo status, un solo toast. */
const ultimoToastPorStatus = new Map<number, number>();
function toastRepetido(status: number, ventanaMs = 5000): boolean {
  const ahora = Date.now();
  if (ahora - (ultimoToastPorStatus.get(status) ?? 0) < ventanaMs) return true;
  ultimoToastPorStatus.set(status, ahora);
  return false;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth      = inject(AuthService);
  const adminAuth = inject(AdminAuthService);
  const router    = inject(Router);
  const toast     = inject(ToastService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        return throwError(() => err);
      }

      switch (err.status) {
        case 401: {
          if (esRequestDeLogin(req.url)) break;
          // La presencia de sesión actúa de flag anti-repetición: el primer
          // 401 la limpia (síncrono, signals), así que los 401 de las demás
          // requests en vuelo ya no entran aquí.
          if (req.url.includes('/admin/')) {
            if (adminAuth.isAuthenticated()) {
              toast.warn('Sesión expirada', 'Vuelve a iniciar sesión.');
              adminAuth.logout(); // limpia token y navega a /login del panel
            }
          } else if (auth.isAuthenticated()) {
            toast.warn('Sesión expirada', 'Vuelve a iniciar sesión.');
            auth.clearSession();
            router.navigate(['/login'], { replaceUrl: true });
          }
          break;
        }
        case 403:
          if (!toastRepetido(403)) toast.warn('Sin permiso', 'No tienes permiso para realizar esta acción.');
          break;
        case 429:
          if (!toastRepetido(429)) toast.warn('Demasiadas solicitudes', 'Espera unos segundos e intenta de nuevo.');
          break;
        case 0:
        case 503:
          if (!toastRepetido(503)) toast.error('Servicio no disponible', 'Revisa tu conexión o reintenta en unos momentos.');
          break;
      }

      return throwError(() => err);
    }),
  );
};
