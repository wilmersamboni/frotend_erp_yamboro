import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AdminAuthUser, AdminLoginRequest, AdminLoginResponse } from './admin-auth.model';

const TOKEN_KEY = 'tenant_admin_token';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly tokenSignal = signal<string | null>(this.leerToken());
  private readonly userSignal = signal<AdminAuthUser | null>(this.decodificarUsuario(this.leerToken()));

  readonly isAuthenticated = computed(() => !!this.tokenSignal());
  readonly currentUser = computed(() => this.userSignal());

  constructor(private http: HttpClient, private router: Router) {}

  login(credenciales: AdminLoginRequest): Observable<AdminLoginResponse> {
    return this.http
      .post<AdminLoginResponse>('/api/admin/auth/login', credenciales)
      .pipe(tap((resp) => this.guardarSesion(resp)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.tokenSignal();
  }

  private guardarSesion(resp: AdminLoginResponse): void {
    localStorage.setItem(TOKEN_KEY, resp.token);
    this.tokenSignal.set(resp.token);
    this.userSignal.set(this.decodificarUsuario(resp.token));
  }

  private leerToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private decodificarUsuario(token: string | null): AdminAuthUser | null {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { id: payload.sub, correo: payload.correo };
    } catch {
      return null;
    }
  }
}
