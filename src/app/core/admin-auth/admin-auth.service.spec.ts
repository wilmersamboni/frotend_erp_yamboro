import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AdminAuthService, SESION_ADMIN_KEY } from './admin-auth.service';

describe('AdminAuthService (H10)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  it('al iniciar sesión guarda solo id/correo/vencimiento, nunca un token, y manda la cookie', () => {
    const svc = TestBed.inject(AdminAuthService);
    svc.login({ correo: 'root@x.com', password: 'x' }).subscribe();
    const req = http.expectOne('/api/admin/auth/login');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ id: 'ru-1', correo: 'root@x.com', expiraEn: Date.now() + 60_000 });

    expect(svc.isAuthenticated()).toBe(true);
    expect(svc.currentUser()).toEqual({ id: 'ru-1', correo: 'root@x.com' });
    const guardado = localStorage.getItem(SESION_ADMIN_KEY) ?? '';
    expect(guardado).not.toMatch(/token|eyJ/);
  });

  it('borra el token viejo que quedara en localStorage de versiones anteriores', () => {
    localStorage.setItem('tenant_admin_token', 'eyJ.viejo.token');
    TestBed.inject(AdminAuthService);
    expect(localStorage.getItem('tenant_admin_token')).toBeNull();
  });

  it('una sesión vencida no cuenta como autenticada', () => {
    localStorage.setItem(SESION_ADMIN_KEY, JSON.stringify({ id: 'ru-1', correo: 'a', expiraEn: Date.now() - 1 }));
    expect(TestBed.inject(AdminAuthService).isAuthenticated()).toBe(false);
  });

  it('cerrar sesión le pide al backend borrar la cookie y limpia el marcador', () => {
    localStorage.setItem(SESION_ADMIN_KEY, JSON.stringify({ id: 'ru-1', correo: 'a', expiraEn: Date.now() + 60_000 }));
    // Sin esto el router de prueba (sin rutas) rechaza '/login' y vitest lo
    // reporta como error no manejado (falla el CI aunque los tests pasen).
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const svc = TestBed.inject(AdminAuthService);
    svc.logout();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
    http.expectOne('/api/admin/auth/logout').flush({});
    expect(svc.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(SESION_ADMIN_KEY)).toBeNull();
  });
});
