import { Routes } from '@angular/router';
import { adminAuthGuard } from './core/admin-auth/admin-auth.guard';
import { conAvisoDeCambios } from './core/services/unsaved-changes.service';
import { AdminLayoutComponent } from './shell/platform-layout/admin-layout.component';

export const ADMIN_PANEL_ROUTES: Routes = conAvisoDeCambios([
  {
    path: 'login',
    title: 'Ingresar · EPSAS Admin',
    loadComponent: () => import('./features/platform-administration/login/admin-login.component').then((m) => m.AdminLoginComponent),
  },
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [adminAuthGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        title: 'Resumen general · EPSAS Admin',
        loadComponent: () => import('./features/platform-administration/dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'tenants',
        title: 'Centros de Formación · EPSAS Admin',
        loadChildren: () => import('./features/platform-administration/tenants/tenants.routes').then((m) => m.ADMIN_TENANTS_ROUTES),
      },
      {
        path: 'root-users',
        title: 'Usuarios Root · EPSAS Admin',
        loadChildren: () => import('./features/platform-administration/root-users/root-users.routes').then((m) => m.ADMIN_ROOT_USER_ROUTES),
      },
      {
        path: 'dominios',
        title: 'Dominios · EPSAS Admin',
        loadChildren: () => import('./features/platform-administration/dominios/dominios.routes').then((m) => m.ADMIN_DOMINIOS_ROUTES),
      },
      {
        path: 'audit-log',
        title: 'Auditoría · EPSAS Admin',
        loadChildren: () => import('./features/platform-administration/audit-log/audit-log.routes').then((m) => m.ADMIN_AUDIT_LOG_ROUTES),
      },
      {
        path: 'settings',
        title: 'Configuración · EPSAS Admin',
        loadComponent: () => import('./features/platform-administration/settings/admin-settings.component').then((m) => m.AdminSettingsComponent),
      },
    ],
  },
]);
