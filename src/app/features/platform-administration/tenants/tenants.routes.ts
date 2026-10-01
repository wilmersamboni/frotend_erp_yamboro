import { Routes } from '@angular/router';
import { conAvisoDeCambios } from '../../../core/services/unsaved-changes.service';

export const ADMIN_TENANTS_ROUTES: Routes = conAvisoDeCambios([
  {
    path: '',
    loadComponent: () => import('./tenant-list/tenant-list.component').then((m) => m.TenantListComponent),
  },
  {
    path: 'nuevo',
    loadComponent: () => import('./tenant-form/tenant-form.component').then((m) => m.TenantFormComponent),
  },
  {
    path: ':id/editar',
    loadComponent: () => import('./tenant-form/tenant-form.component').then((m) => m.TenantFormComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./tenant-detail/tenant-detail.component').then((m) => m.TenantDetailComponent),
  },
]);
