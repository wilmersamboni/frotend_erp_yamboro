/**
 * Entorno de desarrollo (`ng serve`). Las rutas son relativas porque
 * `proxy.conf.js` las reenvía a los backends locales:
 *   /api  → http://localhost:3000 (ERP)
 *   /api2 → http://localhost:3001 (prácticas)
 */
export const environment = {
  production: false,
  apiUrl: '/api',
  apiPracticaUrl: '/api2',
  // En dev se entra por *.localhost, así que el subdominio ya resuelve el
  // tenant y este valor no se usa en ese camino. Sirve de respaldo para
  // cuando se entra por IP LAN (ej. probar el escáner desde un celular
  // contra `ng serve --host 0.0.0.0` — el celular no puede resolver
  // `tenant1.localhost` de la laptop) — mismo valor que
  // `environment.production.ts` usa para el mismo caso.
  defaultTenant: 'yamboro',
};
