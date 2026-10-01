import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface ConfiguracionCorreo {
  proveedor: string;
  remitenteCorreo: string | null;
  remitenteNombre: string | null;
  activo: boolean;
  /** La clave nunca llega al navegador: solo si hay una guardada y sus últimos 4 caracteres. */
  claveGuardada: boolean;
  claveFinal: string | null;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
}

export interface GuardarCorreo {
  apiKey?: string;
  remitenteCorreo?: string;
  remitenteNombre?: string;
  activo?: boolean;
}

/** Configuración del correo saliente (Brevo) del panel de plataforma. */
@Injectable({ providedIn: 'root' })
export class CorreoAdminService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/admin/correo';

  obtener(): Promise<ConfiguracionCorreo> {
    return firstValueFrom(this.http.get<ConfiguracionCorreo>(this.base));
  }

  guardar(dto: GuardarCorreo): Promise<ConfiguracionCorreo> {
    return firstValueFrom(this.http.put<ConfiguracionCorreo>(this.base, dto));
  }

  probar(destino: string): Promise<{ mensaje: string }> {
    return firstValueFrom(this.http.post<{ mensaje: string }>(`${this.base}/prueba`, { destino }));
  }
}
