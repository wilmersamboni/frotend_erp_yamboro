import { Routes } from '@angular/router';

export const ADMIN_DOMINIOS_ROUTES: Routes = [
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
];
