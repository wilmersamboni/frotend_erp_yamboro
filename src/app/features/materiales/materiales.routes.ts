import { Routes } from '@angular/router';
import { miBodegaGuard } from '../../core/guards/mi-bodega.guard';
import { productosGuard } from '../../core/guards/productos.guard';
import { roleGuard } from '../../core/guards/role.guard';

/**
 * Rutas de Materiales. Los paths históricos se conservan mientras las páginas
 * se trasladan a este dominio; así sidebar, enlaces y deep-links no cambian.
 */
export const MATERIALS_ROUTES: Routes = [
  { path: 'mi-bodega', canActivate: [miBodegaGuard], loadComponent: () => import('./warehouse/mi-bodega.component').then((m) => m.MiBodegaComponent) },
  { path: 'materiales/bodegas', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'], todasLasBodegas: true }, loadComponent: () => import('./warehouse/mi-bodega.component').then((m) => m.MiBodegaComponent) },
  { path: 'materiales/categorias', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.categorias.ver'] }, loadComponent: () => import('./categorias.component').then((m) => m.MaterialesCategoriasComponent) },
  { path: 'materiales/sitios', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.sitios.ver'] }, loadComponent: () => import('./sitios.component').then((m) => m.MaterialesSitiosComponent) },
  { path: 'materiales/productos', canActivate: [roleGuard, productosGuard], data: { serviciosRequeridos: ['materiales.productos.ver'] }, loadComponent: () => import('./productos.component').then((m) => m.MaterialesProductosComponent) },
  { path: 'materiales/existencias', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.existencias.ver'] }, loadComponent: () => import('./existencias.component').then((m) => m.MaterialesExistenciasComponent) },
  { path: 'materiales/items', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.items.ver'] }, loadComponent: () => import('./items.component').then((m) => m.MaterialesItemsComponent) },
  { path: 'materiales/vencimientos', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.solicitudes.ver'] }, loadComponent: () => import('./vencimientos.component').then((m) => m.MaterialesVencimientosComponent) },
  { path: 'materiales/importar', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.productos.crear'] }, loadComponent: () => import('./importar.component').then((m) => m.MaterialesImportarComponent) },
  { path: 'materiales/lotes', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.lotes.ver'] }, loadComponent: () => import('./administration/lotes.component').then((m) => m.MaterialesLotesComponent) },
  { path: 'materiales/kardex', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.kardex.ver'] }, loadComponent: () => import('./ui/kardex-entry.component').then((m) => m.KardexEntryComponent) },
  { path: 'materiales/novedades', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.novedades.ver'] }, loadComponent: () => import('./ui/novedades-entry.component').then((m) => m.NovedadesEntryComponent) },
  { path: 'materiales/traslados', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.traslados.ver'] }, loadComponent: () => import('./ui/traslados-entry.component').then((m) => m.TrasladosEntryComponent) },
  { path: 'materiales/solicitudes', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.solicitudes.ver'] }, loadComponent: () => import('./ui/solicitudes-entry.component').then((m) => m.SolicitudesEntryComponent) },
  { path: 'materiales/devoluciones', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.devoluciones.ver'] }, loadComponent: () => import('./ui/devoluciones-entry.component').then((m) => m.DevolucionesEntryComponent) },
  { path: 'materiales/actas', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.actas.ver'] }, loadComponent: () => import('./actas.component').then((m) => m.MaterialesActasComponent) },
  { path: 'materiales/asignaciones', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'], servicios: ['materiales.asignaciones.ver'] }, loadComponent: () => import('./administration/asignaciones.component').then((m) => m.MaterialesAsignacionesComponent) },
  { path: 'instructor/materiales/kardex', pathMatch: 'full', redirectTo: 'materiales/kardex' },
  { path: 'instructor/materiales/devoluciones', pathMatch: 'full', redirectTo: 'materiales/devoluciones' },
  { path: 'instructor/materiales/solicitudes', pathMatch: 'full', redirectTo: 'materiales/solicitudes' },
  { path: 'instructor/materiales/traslados', pathMatch: 'full', redirectTo: 'materiales/traslados' },
  { path: 'instructor/materiales/novedades', pathMatch: 'full', redirectTo: 'materiales/novedades' },
  { path: 'aprendiz/materiales/solicitudes', pathMatch: 'full', redirectTo: 'materiales/solicitudes' },
  { path: 'aprendiz/materiales/devoluciones', pathMatch: 'full', redirectTo: 'materiales/devoluciones' },
];
