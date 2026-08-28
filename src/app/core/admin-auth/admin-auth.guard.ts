import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

export const adminAuthGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  router.navigate(['/login']);
  return false;
};
