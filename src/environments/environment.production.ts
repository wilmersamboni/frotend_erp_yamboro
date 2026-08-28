/**
 * Entorno de producción (`ng build --configuration production`).
 *
 * Decisión de despliegue (Fase F6): reverse proxy (nginx) en el MISMO
 * dominio/subdominio del tenant sirve el build estático y enruta:
 *   /api  → :3000 (ERP)
 *   /api2 → :3001 (prácticas)
 * Por eso las rutas siguen siendo relativas, igual que en desarrollo — no
 * son URLs absolutas porque el navegador ya está en el dominio correcto.
 * Si el modelo de despliegue cambiara (backends en un dominio separado del
 * estático), este es el único archivo que habría que tocar.
 */
export const environment = {
  production: true,
  apiUrl: '/api',
  apiPracticaUrl: '/api2',
  // Tenant al que se atribuye una petición cuando no hay forma de
  // detectarlo por subdominio (se entra por IP, no por dominio). Este
  // despliegue solo sirve al tenant "yamboro".
  defaultTenant: 'yamboro',
};
