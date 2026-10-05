import { Route, Routes } from '@angular/router';
import { miBodegaGuard } from '../../core/guards/mi-bodega.guard';
import { gestorMaterialesGuard } from '../../core/guards/gestor-materiales.guard';
import { productosGuard } from '../../core/guards/productos.guard';
import { roleGuard } from '../../core/guards/role.guard';
import { datosRutaMateriales, pantallaMateriales } from './materiales-acceso';

/**
 * Ruta de una pantalla de Materiales: path, título y regla de acceso salen de
 * `PANTALLAS_MATERIALES` (materiales-acceso.ts) — la misma tabla que arma el
 * menú, para que "puede entrar" y "ve el link" no se puedan desincronizar.
 */
function ruta(id: string, loadComponent: NonNullable<Route['loadComponent']>, extra: Partial<Route> = {}): Route {
  const pantalla = pantallaMateriales(id);
  return {
    path: pantalla.path,
    title: `${pantalla.label} | ERP`,
    canActivate: [roleGuard],
    loadComponent,
    ...extra,
    data: { ...datosRutaMateriales(id), ...extra.data },
  };
}

/**
 * Rutas de Materiales. Los paths históricos se conservan mientras las páginas
 * se trasladan a este dominio; así sidebar, enlaces y deep-links no cambian.
 */
export const MATERIALS_ROUTES: Routes = [
  ruta('inicio', () => import('./inicio/inicio-materiales.component').then((m) => m.InicioMaterialesComponent)),
  ruta('escanear', () => import('./inicio/escanear.component').then((m) => m.EscanearComponent)),
  ruta('mi-bodega', () => import('./warehouse/mi-bodega.component').then((m) => m.MiBodegaComponent), { canActivate: [miBodegaGuard] }),
  ruta('bodegas', () => import('./warehouse/mi-bodega.component').then((m) => m.MiBodegaComponent), { data: { todasLasBodegas: true } }),
  ruta('categorias', () => import('./categorias.component').then((m) => m.MaterialesCategoriasComponent)),
  ruta('sitios', () => import('./sitios.component').then((m) => m.MaterialesSitiosComponent)),
  ruta('productos', () => import('./productos.component').then((m) => m.MaterialesProductosComponent), { canActivate: [roleGuard, productosGuard] }),
  ruta('existencias', () => import('./existencias.component').then((m) => m.MaterialesExistenciasComponent)),
  ruta('ingresos', () => import('./ingresos.component').then((m) => m.MaterialesIngresosComponent), { canActivate: [roleGuard, gestorMaterialesGuard] }),
  ruta('marcas', () => import('./marcas.component').then((m) => m.MaterialesMarcasComponent), { canActivate: [roleGuard, gestorMaterialesGuard] }),
  ruta('proveedores', () => import('./proveedores.component').then((m) => m.MaterialesProveedoresComponent), { canActivate: [roleGuard, gestorMaterialesGuard] }),
  ruta('reporte', () => import('./reporte/reporte-materiales.component').then((m) => m.ReporteMaterialesComponent), { canActivate: [roleGuard, gestorMaterialesGuard] }),
  ruta('items', () => import('./items.component').then((m) => m.MaterialesItemsComponent)),
  ruta('vencimientos', () => import('./vencimientos.component').then((m) => m.MaterialesVencimientosComponent)),
  ruta('importar', () => import('./importar.component').then((m) => m.MaterialesImportarComponent)),
  ruta('lotes', () => import('./administration/lotes.component').then((m) => m.MaterialesLotesComponent)),
  ruta('kardex', () => import('./ui/kardex-entry.component').then((m) => m.KardexEntryComponent)),
  ruta('novedades', () => import('./ui/novedades-entry.component').then((m) => m.NovedadesEntryComponent)),
  ruta('traslados', () => import('./ui/traslados-entry.component').then((m) => m.TrasladosEntryComponent)),
  ruta('solicitudes', () => import('./ui/solicitudes-entry.component').then((m) => m.SolicitudesEntryComponent)),
  ruta('devoluciones', () => import('./ui/devoluciones-entry.component').then((m) => m.DevolucionesEntryComponent)),
  ruta('actas', () => import('./actas.component').then((m) => m.MaterialesActasComponent)),
  ruta('asignaciones', () => import('./administration/asignaciones.component').then((m) => m.MaterialesAsignacionesComponent)),
  { path: 'instructor/materiales/kardex', pathMatch: 'full', redirectTo: 'materiales/kardex' },
  { path: 'instructor/materiales/devoluciones', pathMatch: 'full', redirectTo: 'materiales/devoluciones' },
  { path: 'instructor/materiales/solicitudes', pathMatch: 'full', redirectTo: 'materiales/solicitudes' },
  { path: 'instructor/materiales/traslados', pathMatch: 'full', redirectTo: 'materiales/traslados' },
  { path: 'instructor/materiales/novedades', pathMatch: 'full', redirectTo: 'materiales/novedades' },
  { path: 'aprendiz/materiales/solicitudes', pathMatch: 'full', redirectTo: 'materiales/solicitudes' },
  { path: 'aprendiz/materiales/devoluciones', pathMatch: 'full', redirectTo: 'materiales/devoluciones' },
];
