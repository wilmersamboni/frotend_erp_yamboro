import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { errorInterceptor } from './error.interceptor';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: Router;
  let auth: AuthService;
  let toast: ToastService;

  function conSesion(): void {
    localStorage.setItem('user', JSON.stringify({ id: 'u1', nombre: 'Test', cargo: 'administrador' }));
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        MessageService,
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('401 con sesión: limpia la sesión y redirige a /login UNA sola vez aunque fallen varias requests en paralelo', () => {
    conSesion();
    auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBe(true);

    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const errores: number[] = [];
    for (let i = 0; i < 20; i++) {
      http.get(`/api2/etapa-practica/${i}`).subscribe({ error: (e) => errores.push(e.status) });
    }
    httpMock.match(() => true).forEach((req) =>
      req.flush({ message: 'no autorizado' }, { status: 401, statusText: 'Unauthorized' }),
    );

    // El error se relanza a cada suscriptor (nadie se queda colgado)
    expect(errores).toHaveLength(20);
    expect(errores.every((s) => s === 401)).toBe(true);
    // Sesión limpia y UN solo redirect
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('user')).toBeNull();
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
  });

  it('401 en la request de login: NO limpia sesión ni redirige (el componente maneja el error)', () => {
    conSesion();
    auth = TestBed.inject(AuthService);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    let status = 0;
    http.post('/api/auth/login', {}).subscribe({ error: (e) => (status = e.status) });
    httpMock.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(auth.isAuthenticated()).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('401 en el panel admin (/api/admin/*): limpia el token root en vez de la sesión del ERP', () => {
    localStorage.setItem(
      'tenant_admin_token',
      // JWT falso con payload {"sub":"r1","correo":"root@x"} — solo para que isAuthenticated() sea true
      'x.' + btoa(JSON.stringify({ sub: 'r1', correo: 'root@x' })) + '.y',
    );
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    http.get('/api/admin/tenants').subscribe({ error: () => {} });
    httpMock.expectOne('/api/admin/tenants').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(localStorage.getItem('tenant_admin_token')).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  it('403: muestra toast y NO desloguea', () => {
    conSesion();
    auth = TestBed.inject(AuthService);
    const warnSpy = vi.spyOn(toast, 'warn');
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api2/recurso-prohibido').subscribe({ error: () => {} });
    httpMock.expectOne('/api2/recurso-prohibido').flush({}, { status: 403, statusText: 'Forbidden' });

    expect(warnSpy).toHaveBeenCalledWith('Sin permiso', expect.any(String));
    expect(auth.isAuthenticated()).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('429 en ráfaga: los toasts repetidos se deduplican dentro de la ventana', () => {
    const warnSpy = vi.spyOn(toast, 'warn');

    for (let i = 0; i < 5; i++) {
      http.get(`/api2/burst/${i}`).subscribe({ error: () => {} });
    }
    httpMock.match(() => true).forEach((req) =>
      req.flush({}, { status: 429, statusText: 'Too Many Requests' }),
    );

    const llamadas429 = warnSpy.mock.calls.filter(([summary]) => summary === 'Demasiadas solicitudes');
    expect(llamadas429).toHaveLength(1);
  });

  it('503: muestra toast de servicio no disponible sin tocar la sesión', () => {
    conSesion();
    auth = TestBed.inject(AuthService);
    const errorSpy = vi.spyOn(toast, 'error');

    http.get('/api2/caido').subscribe({ error: () => {} });
    httpMock.expectOne('/api2/caido').flush({}, { status: 503, statusText: 'Service Unavailable' });

    expect(errorSpy).toHaveBeenCalledWith('Servicio no disponible', expect.any(String));
    expect(auth.isAuthenticated()).toBe(true);
  });
});
