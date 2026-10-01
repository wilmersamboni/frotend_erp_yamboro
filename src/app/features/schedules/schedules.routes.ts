import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

/**
 * Rutas del dominio Horarios. Las URLs se mantienen para no romper enlaces
 * existentes; solo se retira su definición del enrutador raíz del tenant.
 */
export const SCHEDULE_ROUTES: Routes = [
  {
    path: 'horarios',
    title: 'Horarios | ERP',
    canActivate: [roleGuard],
    data: { roles: ['administrador', 'administrador_erp'], servicios: ['horarios.gestionar'] },
    loadComponent: () => import('./management/horarios.component').then((m) => m.AdminHorariosComponent),
  },
  {
    path: 'programador-eventos',
    title: 'Programador de eventos | ERP',
    canActivate: [roleGuard],
    data: { roles: ['administrador', 'administrador_erp'], servicios: ['horarios.eventos'] },
    loadComponent: () => import('./events/programador-eventos.component').then((m) => m.ProgramadorEventosComponent),
  },
  {
    path: 'mis-horarios',
    title: 'Mis horarios | ERP',
    canActivate: [roleGuard],
    data: { roles: ['instructor'] },
    loadComponent: () => import('./instructor/instructor-mis-horarios.component').then((m) => m.InstructorMisHorariosComponent),
  },
  {
    path: 'aprendiz-mis-horarios',
    title: 'Mis horarios | ERP',
    canActivate: [roleGuard],
    data: { roles: ['aprendiz'] },
    loadComponent: () => import('./apprentice/aprendiz-mis-horarios.component').then((m) => m.AprendizMisHorariosComponent),
  },
];
