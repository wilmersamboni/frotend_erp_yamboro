import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, tap } from 'rxjs';
import { AdminAuthUser, AdminLoginRequest, AdminLoginResponse } from './admin-auth.model';

/**
 * Marcador de sesión del panel root: solo id, correo y vencimiento, para
 * saber qué mostrar sin pedirle nada al backend. El token NO se guarda acá
 * (plan de seguridad 2026-10, H10): vive en la cookie httpOnly `root_token`
 * que pone el backend, y que ningún script de la página puede leer — antes
 * estaba en localStorage, al alcance de cualquier XSS del mismo origen.
 */
export const SESION_ADMIN_KEY = 'tenant_admin_sesion';
/** Clave vieja (token en claro). Se borra al iniciar por si quedó de antes. */
const TOKEN_VIEJO_KEY = 'tenant_admin_token';

interface SesionAdmin extends AdminAuthUser {
  expiraEn: number;
}

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly sesionSignal = signal<SesionAdmin | null>(this.leerSesion());

  readonly isAuthenticated = computed(() => {
    const s = this.sesionSignal();
    return !!s && s.expiraEn > Date.now();
  });
  readonly currentUser = computed<AdminAuthUser | null>(() => {
    const s = this.sesionSignal();
    return s ? { id: s.id, correo: s.correo } : null;
  });

  constructor(private http: HttpClient, private router: Router) {
    localStorage.removeItem(TOKEN_VIEJO_KEY);
  }

  login(credenciales: AdminLoginRequest): Observable<AdminLoginResponse> {
    return this.http
      .post<AdminLoginResponse>('/api/admin/auth/login', credenciales, { withCredentials: true })
      .pipe(tap((resp) => this.guardarSesion(resp)));
  }

  logout(): void {
    // La cookie es httpOnly: solo el backend puede borrarla.
    this.http.post('/api/admin/auth/logout', {}, { withCredentials: true }).subscribe({ error: () => undefined });
    localStorage.removeItem(SESION_ADMIN_KEY);
    this.sesionSignal.set(null);
    this.router.navigate(['/login']);
  }

  // El id sale del propio token (req.rootUser.sub en el backend) — nunca se
  // manda por acá, así nadie puede cambiarle la contraseña a otro root user
  // usando este endpoint (ver PATCH /admin/auth/cambiar-password).
  cambiarPassword(passwordActual: string, passwordNuevo: string): Promise<{ mensaje: string }> {
    return firstValueFrom(
      this.http.patch<{ mensaje: string }>('/api/admin/auth/cambiar-password', {
        passwordActual,
        passwordNuevo,
      }),
    );
  }

  private guardarSesion(resp: AdminLoginResponse): void {
    const sesion: SesionAdmin = { id: resp.id, correo: resp.correo, expiraEn: resp.expiraEn };
    localStorage.setItem(SESION_ADMIN_KEY, JSON.stringify(sesion));
    this.sesionSignal.set(sesion);
  }

  private leerSesion(): SesionAdmin | null {
    try {
      const s = JSON.parse(localStorage.getItem(SESION_ADMIN_KEY) ?? 'null') as SesionAdmin | null;
      return s && typeof s.expiraEn === 'number' && s.expiraEn > Date.now() ? s : null;
    } catch {
      return null;
    }
  }
}
