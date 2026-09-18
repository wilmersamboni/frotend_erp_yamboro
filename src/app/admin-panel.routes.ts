import { Routes } from '@angular/router';
import { adminAuthGuard } from './core/admin-auth/admin-auth.guard';
import { AdminLayoutComponent } from './shell/platform-layout/admin-layout.component';

export const ADMIN_PANEL_ROUTES: Routes = [
  {
    path: 'login',
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
        loadComponent: () => import('./features/platform-administration/dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'tenants',
        loadChildren: () => import('./features/platform-administration/tenants/tenants.routes').then((m) => m.ADMIN_TENANTS_ROUTES),
      },
      {
        path: 'root-users',
        loadChildren: () => import('./features/platform-administration/root-users/root-users.routes').then((m) => m.ADMIN_ROOT_USER_ROUTES),
      },
      {
        path: 'dominios',
        loadChildren: () => import('./features/platform-administration/dominios/dominios.routes').then((m) => m.ADMIN_DOMINIOS_ROUTES),
      },
      {
        path: 'audit-log',
        loadChildren: () => import('./features/platform-administration/audit-log/audit-log.routes').then((m) => m.ADMIN_AUDIT_LOG_ROUTES),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/platform-administration/settings/admin-settings.component').then((m) => m.AdminSettingsComponent),
      },
    ],
  },
];
