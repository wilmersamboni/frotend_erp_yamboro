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
  { path: 'materiales/kardex', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./administration/kardex.component').then((m) => m.MaterialesKardexComponent) },
  { path: 'materiales/novedades', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./administration/novedades.component').then((m) => m.MaterialesNovedadesComponent) },
  { path: 'materiales/traslados', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./administration/traslados.component').then((m) => m.MaterialesTrasladosComponent) },
  { path: 'materiales/solicitudes', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./administration/solicitudes.component').then((m) => m.MaterialesSolicitudesComponent) },
  { path: 'materiales/devoluciones', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'] }, loadComponent: () => import('./administration/devoluciones.component').then((m) => m.MaterialesDevolucionesComponent) },
  { path: 'materiales/actas', canActivate: [roleGuard], data: { serviciosRequeridos: ['materiales.actas.ver'] }, loadComponent: () => import('./actas.component').then((m) => m.MaterialesActasComponent) },
  { path: 'materiales/asignaciones', canActivate: [roleGuard], data: { roles: ['administrador', 'administrador_erp'], servicios: ['materiales.asignaciones.ver'] }, loadComponent: () => import('./administration/asignaciones.component').then((m) => m.MaterialesAsignacionesComponent) },
  { path: 'instructor/materiales/kardex', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.kardex.ver'] }, loadComponent: () => import('./instructor/kardex.component').then((m) => m.InstructorMaterialesKardexComponent) },
  { path: 'instructor/materiales/devoluciones', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.devoluciones.ver'] }, loadComponent: () => import('./instructor/devoluciones.component').then((m) => m.InstructorMaterialesDevolucionesComponent) },
  { path: 'instructor/materiales/solicitudes', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.solicitudes.ver'] }, loadComponent: () => import('./instructor/solicitudes.component').then((m) => m.InstructorMaterialesSolicitudesComponent) },
  { path: 'instructor/materiales/traslados', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.traslados.ver'] }, loadComponent: () => import('./instructor/traslados.component').then((m) => m.InstructorMaterialesTrasladosComponent) },
  { path: 'instructor/materiales/novedades', canActivate: [roleGuard], data: { roles: ['instructor'], serviciosRequeridos: ['materiales.novedades.ver'] }, loadComponent: () => import('./instructor/novedades.component').then((m) => m.InstructorMaterialesNovedadesComponent) },
  { path: 'aprendiz/materiales/solicitudes', canActivate: [roleGuard], data: { roles: ['aprendiz'], serviciosRequeridos: ['materiales.solicitudes.ver'] }, loadComponent: () => import('./apprentice/solicitudes.component').then((m) => m.AprendizMaterialesSolicitudesComponent) },
  { path: 'aprendiz/materiales/devoluciones', canActivate: [roleGuard], data: { roles: ['aprendiz'], serviciosRequeridos: ['materiales.devoluciones.ver'] }, loadComponent: () => import('./apprentice/devoluciones.component').then((m) => m.AprendizMaterialesDevolucionesComponent) },
];
