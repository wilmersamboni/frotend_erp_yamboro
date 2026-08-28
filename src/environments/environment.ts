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
  // tenant; sin valor por defecto acá.
  defaultTenant: '',
};
