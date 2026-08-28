import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// Direcciones IPv4 (ej: 192.168.50.108) — no son subdominios de tenant. Sin
// este chequeo, el primer octeto ("192") se interpretaba como slug de
// tenant, igual que el bug que ya se cubrió en el backend (TenantMiddleware).
const IPV4_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/;

function resolveTenant(): string | null {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || IPV4_REGEX.test(hostname)) {
    return null;
  }
  // *.localhost en desarrollo (ej: tenant1.localhost)
  if (hostname.endsWith('.localhost')) {
    return hostname.slice(0, hostname.lastIndexOf('.localhost')).toLowerCase();
  }
  // Producción: subdominio.dominio.tld (3+ partes)
  const parts = hostname.split('.');
  return parts.length >= 3 ? parts[0].toLowerCase() : null;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Rutas del panel admin → Bearer token
  if (req.url.includes('/admin/')) {
    const token = localStorage.getItem('tenant_admin_token');
    if (token) {
      return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
    }
    return next(req);
  }

  // Rutas del ERP principal → x-tenant header + cookie de sesión
  const tenantSlug = localStorage.getItem('tenantSlug');
  // Orden: subdominio > tenant guardado de un login previo > tenant fijo
  // del despliegue (solo aplica al entrar por IP, sin subdominio).
  const tenant = resolveTenant() ?? tenantSlug ?? environment.defaultTenant ?? null;

  const headers: Record<string, string> = {};
  if (tenant) headers['x-tenant'] = tenant;

  // withCredentials envía la cookie JWT desde subdominios (ej: tenant1.localhost)
  return next(req.clone({ setHeaders: headers, withCredentials: true }));
};
