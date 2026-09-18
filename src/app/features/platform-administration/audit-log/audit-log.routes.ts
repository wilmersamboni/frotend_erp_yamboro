import { Routes } from '@angular/router';

export const ADMIN_AUDIT_LOG_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./audit-log-list/audit-log-list.component').then((m) => m.AuditLogListComponent),
  },
];
