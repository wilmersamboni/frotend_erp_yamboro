import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { tap } from 'rxjs/operators';

/**
 * Interceptor de depuración — loguea en consola cualquier respuesta
 * que no sea JSON válido aunque venga con status 200.
 * Quitar en producción.
 */
export const debugInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse && !event.ok) {
          console.warn(
            `[DEBUG] ${req.method} ${req.url} → status ${event.status} pero ok=false`,
            '\nBody:', event.body
          );
        }
      },
      error: (err) => {
        console.error(
          `[DEBUG] ${req.method} ${req.url} → ERROR`,
          '\nStatus:', err.status,
          '\nBody:', err.error
        );
      },
    })
  );
};
