import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Recuperación de contraseña de un usuario del centro (sin sesión), por el correo de su persona. El centro
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

  /** Se busca por correo: cada correo pertenece a una sola persona del centro. */
  solicitar(correo: string): Promise<{ mensaje: string }> {
    return firstValueFrom(this.http.post<{ mensaje: string }>(`${this.base}/solicitar`, { correo }));
  }

  /** Comprueba el código (sin gastarlo) y trae los usuarios de esa persona para elegir uno. */
  verificar(correo: string, codigo: string): Promise<{ usuarios: string[] }> {
    return firstValueFrom(this.http.post<{ usuarios: string[] }>(`${this.base}/verificar`, { correo, codigo }));
  }

  restablecer(correo: string, codigo: string, login: string, nuevoPassword: string): Promise<{ mensaje: string; usuario: string }> {
    return firstValueFrom(
      this.http.post<{ mensaje: string; usuario: string }>(`${this.base}/restablecer`, { correo, codigo, login, nuevoPassword }),
    );
  }
}
