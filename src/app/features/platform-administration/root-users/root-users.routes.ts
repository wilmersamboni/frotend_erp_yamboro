import { Routes } from '@angular/router';

export const ADMIN_ROOT_USER_ROUTES: Routes = [
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
];
