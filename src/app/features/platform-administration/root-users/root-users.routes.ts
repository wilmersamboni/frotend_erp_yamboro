import { Routes } from '@angular/router';
import { conAvisoDeCambios } from '../../../core/services/unsaved-changes.service';

export const ADMIN_ROOT_USER_ROUTES: Routes = conAvisoDeCambios([
  {
    path: '',
    loadComponent: () => import('./root-user-list/root-user-list.component').then((m) => m.RootUserListComponent),
  },
  {
    path: 'nuevo',
    loadComponent: () => import('./root-user-form/root-user-form.component').then((m) => m.RootUserFormComponent),
  },
  {
    path: ':id/editar',
    loadComponent: () => import('./root-user-form/root-user-form.component').then((m) => m.RootUserFormComponent),
  },
]);
