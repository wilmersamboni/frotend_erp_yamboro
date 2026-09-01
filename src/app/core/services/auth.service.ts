import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Usuario, LoginRequest, LoginResponse } from '../../shared/models';
import { NotificacionesRealtimeService } from './realtime/notificaciones-realtime.service';
import { EncuestasRealtimeService } from './realtime/encuestas-realtime.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // ── Estado reactivo (señales, equivale al useState de React) ──────────────
  private _user = signal<Usuario | null>(this._loadUser());
  readonly user            = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  /** Cargo del usuario autenticado: 'administrador' | 'instructor' | 'aprendiz' | '' */
  readonly cargo       = computed(() => this._user()?.cargo ?? '');
  readonly isAdmin     = computed(() => this.cargo() === 'administrador' || this.cargo() === 'administrador_erp');
  readonly isAdminErp  = computed(() => this.cargo() === 'administrador_erp');

  /**
   * Aplicativo al que pertenece el usuario (p.ej. "Horarios", "Etapa Práctica",
   * o el aplicativo propio del tenant). administrador_erp no está scoped a
   * ninguno — ve todos — así que el resto del código debe chequear
   * isAdminErp() aparte antes de comparar contra este valor.
   */
  readonly aplicativoId     = computed(() => this._user()?.aplicativoId ?? '');
  readonly aplicativoNombre = computed(() => this._user()?.aplicativoNombre ?? '');

  /** true si el usuario ve todo (superadmin) o pertenece al aplicativo dado */
  perteneceAplicativo(nombre: string): boolean {
    return this.isAdminErp() || this.aplicativoNombre() === nombre;
  }

  /** Devuelve true si el cargo del usuario está en la lista de roles permitidos */
  hasRole(roles: string[]): boolean {
    return roles.includes(this.cargo());
  }

  // ── Servicios efectivos (sistema de permisos dinámico) ────────────────────
  // Rol ∪ excepciones personales, vía GET /permisos/mis-servicios — persistido
  // en localStorage igual que `user` para que roleGuard/sidebar lo tengan
  // disponible de forma síncrona incluso justo después de un refresh.
  private _misServicios = signal<string[]>(this._loadServicios());
  readonly misServicios  = this._misServicios.asReadonly();

  /** true si el usuario tiene el servicio otorgado (por rol o excepción propia) */
  tieneServicio(nombre: string): boolean {
    return this._misServicios().includes(nombre);
  }

  constructor(
    private http: HttpClient,
    private router: Router,
    private notifRealtime: NotificacionesRealtimeService,
    private encuestasRealtime: EncuestasRealtimeService,
  ) {
    // Sin esto, un permiso otorgado/revocado desde el panel de admin solo se
    // reflejaba para el usuario afectado si cerraba sesión y volvía a entrar
    // (misServicios solo se cargaba en login()). No hay push en tiempo real
    // todavía, así que se refresca en segundo plano cada 30s mientras haya
    // sesión — suficiente para que el sidebar/roleGuard se pongan al día
    // solos sin que el usuario tenga que hacer nada.
    setInterval(() => {
      if (this.isAuthenticated()) this.cargarMisServicios();
    }, 30_000);
  }

  // ── Inicializar desde localStorage (igual que el init del useState) ────────
  private _loadUser(): Usuario | null {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      // localStorage corrupto (p.ej. quedó "undefined" de un login fallido) —
      // no debe tumbar el arranque de toda la app, solo tratarlo como sesión
      // inválida y forzar un login limpio.
      localStorage.removeItem('user');
      return null;
    }
  }

  private _loadServicios(): string[] {
    const saved = localStorage.getItem('misServicios');
    if (!saved) return [];
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem('misServicios');
      return [];
    }
  }

  /** GET /permisos/mis-servicios — autoservicio, sin gate de permisos.gestionar. */
  private async cargarMisServicios(): Promise<void> {
    try {
      const servicios = await firstValueFrom(
        this.http.get<string[]>('/api/permisos/mis-servicios', { withCredentials: true }),
      );
      localStorage.setItem('misServicios', JSON.stringify(servicios));
      this._misServicios.set(servicios);
    } catch {
      // Si falla (red, servicio caído), se queda con lo que ya tenía en
      // localStorage — no debe tumbar el login por esto.
    }
  }

  // ── login() ────────────────────────────────────────────────────────────────
  // El login va DIRECTO a :3000 (sin proxy) para que el navegador
  // reciba y guarde la cookie de sesión correctamente.
  // Esa misma cookie la envía luego en las peticiones a :3001 vía proxy.
 async login(data: LoginRequest): Promise<void> {
  const resp = await firstValueFrom(
    this.http.post<LoginResponse>(
      '/api/auth/login',   // ← relativo, pasa por el proxy de Angular
      data,
      { withCredentials: true }
    )
  );
  localStorage.setItem('user', JSON.stringify(resp.usuario));
  localStorage.setItem('centroId', resp.centroId ?? '');
  localStorage.setItem('tenantSlug', resp.tenantSlug ?? '');
  localStorage.setItem('cargo', resp.usuario.cargo ?? '');
  this._user.set(resp.usuario);
  await this.cargarMisServicios();
}

  // ── clearSession() ────────────────────────────────────────────────────────
  /** Limpia la sesión local sin navegar — la usa el errorInterceptor en 401
   *  para decidir él mismo a dónde redirigir. */
  clearSession(): void {
    localStorage.removeItem('user');
    //localStorage.removeItem('token');
    localStorage.removeItem('centroId');
    localStorage.removeItem('tenantSlug');
    localStorage.removeItem('cargo');
    localStorage.removeItem('misServicios');
    this._user.set(null);
    this._misServicios.set([]);
    this.notifRealtime.desconectar();
    this.encuestasRealtime.desconectar();
  }

  // ── logout() ──────────────────────────────────────────────────────────────
  /**
   * Logout desde la UI: avisa al backend (marca fecha_salida en el registro
   * de acceso — antes esto nunca se llamaba, así que esa columna nunca se
   * llenaba), limpia la sesión local y navega a la raíz (login). Si la
   * llamada al backend falla (red caída, sesión ya vencida, etc.) igual se
   * limpia la sesión local — no queremos dejar a alguien atrapado sin poder
   * salir solo porque el POST de auditoría no pudo completarse.
   */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}, { withCredentials: true }));
    } catch {
      // Ignorado a propósito — ver comentario arriba.
    }
    this.clearSession();
    this.router.navigate(['/'], { replaceUrl: true });
  }

  // ── actualizarUser() — actualiza parcialmente el usuario ──────────────────
  actualizarUser(datos: Partial<Usuario>): void {
    const current = this._user();
    const nuevo = { ...current, ...datos };
    localStorage.setItem('user', JSON.stringify(nuevo));
    this._user.set(nuevo);
  }

  // ── Obtener el token del storage ──────────────────────────────────────────
  // getToken(): string | null {
  //   return localStorage.getItem('token');
  // }

}