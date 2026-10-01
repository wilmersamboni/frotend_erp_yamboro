import { Routes } from '@angular/router';
import { conAvisoDeCambios } from '../../../core/services/unsaved-changes.service';

export const ADMIN_DOMINIOS_ROUTES: Routes = conAvisoDeCambios([
  {
    path: '',
    loadComponent: () => import('./dominio-list/dominio-list.component').then((m) => m.DominioListComponent),
  },
  {
    path: 'nuevo',
    loadComponent: () => import('./dominio-form/dominio-form.component').then((m) => m.DominioFormComponent),
  },
  {
    path: ':id/editar',
    loadComponent: () => import('./dominio-form/dominio-form.component').then((m) => m.DominioFormComponent),
  },
]);
