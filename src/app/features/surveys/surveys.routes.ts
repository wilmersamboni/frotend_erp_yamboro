import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

/** Rutas autenticadas del dominio Encuestas. */
export const SURVEY_ROUTES: Routes = [
  {
    path: 'encuestas',
    canActivate: [roleGuard],
    data: { roles: ['administrador', 'administrador_erp'], servicios: ['encuestas.gestionar'] },
    loadComponent: () => import('./management/encuestas.component').then((m) => m.EncuestasComponent),
  },
  {
    path: 'encuestas/preguntas',
    canActivate: [roleGuard],
    data: { roles: ['administrador', 'administrador_erp'], servicios: ['encuestas.gestionar'] },
    loadComponent: () => import('./management/preguntas.component').then((m) => m.PreguntasComponent),
  },
];
