import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Recuperación de contraseña de un usuario del centro (sin sesión). El centro
 * lo pone el interceptor en la cabecera `x-tenant`, igual que en el login.
 * Backend: `backend-epsas/src/recuperacion/`.
 */
@Injectable({ providedIn: 'root' })
export class RecuperacionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth/recuperar`;

  async disponible(): Promise<boolean> {
    try {
      const r = await firstValueFrom(this.http.get<{ disponible: boolean }>(`${this.base}/disponible`));
      return r.disponible;
    } catch {
      return false;
    }
  }

  solicitar(login: string): Promise<{ mensaje: string }> {
    return firstValueFrom(this.http.post<{ mensaje: string }>(`${this.base}/solicitar`, { login }));
  }

  restablecer(login: string, codigo: string, nuevoPassword: string): Promise<{ mensaje: string }> {
    return firstValueFrom(this.http.post<{ mensaje: string }>(`${this.base}/restablecer`, { login, codigo, nuevoPassword }));
  }
}
