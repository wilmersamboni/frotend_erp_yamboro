import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, retry, throwError, timer } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { ToastService } from '../services/toast.service';

/**
 * Marca una request para que sus errores (403/429/0/503) no disparen el
 * toast global de abajo — para llamadas "best effort" que el propio
 * servicio ya degrada en silencio (try/catch → []), donde un 403 esperado
 * (p.ej. un admin de un aplicativo consultando datos de otro) no debería
 * interrumpir al usuario con una alerta. El 401 NO se puede silenciar así:
 * ahí la sesión realmente expiró y el aviso es siempre relevante.
 */
export const SILENCIAR_TOAST_ERROR = new HttpContextToken<boolean>(() => false);

/**
 * Manejo global de errores HTTP.
 *
 * - Reintenta (hasta 2 veces, backoff 300/600 ms) los GET que fallan con un
 *   error TRANSITORIO (0 red, 500/502/503/504 — típicamente pool de conexiones
 *   saturado bajo carga). Sin esto, al loguearse la ráfaga de ~8 requests en
 *   paralelo saturaba el pool de backend-erp y partes del panel quedaban en
 *   blanco hasta refrescar. POST/PATCH/DELETE NO se reintentan (podrían no ser
 *   idempotentes); 401/403/404/409/422 tampoco (no son transitorios).
 * - 401: la sesión del backend expiró (el JWT dura 12 h pero el `user` de
 *   localStorage no caduca). Limpia la sesión y redirige al login UNA sola
 *   vez, aunque fallen N requests en paralelo.
 * - 403: toast de "sin permiso" — NO desloguea.
 * - 429: toast de rate limit (el backend limita a 30 req/10 s).
 * - 0 / 503: toast de servicio no disponible (solo si agotó los reintentos).
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

/** Status de conexión/gateway que valen un reintento SOLO si el fallo fue rápido. */
const STATUS_REINTENTABLE = new Set([0, 502, 503, 504]);

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

  const inicio = Date.now();

  return next(req).pipe(
    retry({
      count: 1,
      delay: (err, retryCount) => {
        const status = err instanceof HttpErrorResponse ? err.status : -1;
        const rapido = Date.now() - inicio < 2000; // solo si falló RÁPIDO
        // Reintenta 1 vez un GET que falló rápido con un error de
        // conexión/gateway (0/502/503/504) — típico de pool momentáneamente
        // saturado. Un fallo lento (> 2 s) NO se reintenta: suele ser un query
        // lento que termina en error, y reintentarlo solo dobla la espera.
        // El 500 tampoco se reintenta (puede ser un query pesado, no transitorio).
        if (req.method === 'GET' && !esRequestDeLogin(req.url) && rapido && STATUS_REINTENTABLE.has(status)) {
          return timer(400 * retryCount);
        }
        return throwError(() => err);
      },
    }),
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        return throwError(() => err);
      }

      const silencioso = req.context.get(SILENCIAR_TOAST_ERROR);
      if (silencioso && err.status !== 401) {
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
