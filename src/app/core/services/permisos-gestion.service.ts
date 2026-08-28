import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/permisos`;

export interface Permiso {
  idPermiso: string;
  rolId: string;
  servicioId: string;
  usuarioId: string | null;
  activo: boolean | null;
  rol?: { idRol: string; nombre: string };
  servicio?: { idServicio: string; nombre: string; modulo?: { idModulo: string; nombre: string } };
  usuario?: { idUsuario: string; persona?: { nombre: string } };
}

/**
 * CRUD de filas `Permiso` (rol+servicio, o rol+servicio+usuario para una
 * excepción puntual) usado por los paneles de permisos embebidos en las
 * pestañas Roles y Usuarios del panel admin (ver plan "Adaptar la interfaz
 * de permisos de SGM al ERP"). Roles/servicios/usuarios se resuelven vía
 * `AdminService` ya existente — este servicio solo hace las altas/bajas.
 */
@Injectable({ providedIn: 'root' })
export class PermisosGestionService {
  constructor(private http: HttpClient) {}

  listar(): Promise<Permiso[]> {
    return firstValueFrom(this.http.get<Permiso[]>(BASE));
  }

  otorgar(rolId: string, servicioId: string, usuarioId?: string, activo = true): Promise<Permiso> {
    return firstValueFrom(
      this.http.post<Permiso>(BASE, usuarioId ? { rolId, servicioId, usuarioId, activo } : { rolId, servicioId }),
    );
  }

  revocar(idPermiso: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/${idPermiso}`));
  }

  /** Otorga varios servicios de una vez (botones "activar todo el módulo" / "activar todos"). */
  otorgarLote(rolId: string, servicioIds: string[], usuarioId?: string): Promise<{ creados: number; reactivados: number; sinCambios: number }> {
    return firstValueFrom(
      this.http.post<{ creados: number; reactivados: number; sinCambios: number }>(
        `${BASE}/otorgar-lote`,
        usuarioId ? { rolId, servicioIds, usuarioId } : { rolId, servicioIds },
      ),
    );
  }

  /** Borra todas las excepciones personales de un usuario (botón "restablecer al rol"). */
  restablecerUsuario(idUsuario: string): Promise<{ eliminados: number }> {
    return firstValueFrom(this.http.delete<{ eliminados: number }>(`${BASE}/usuario/${idUsuario}/excepciones`));
  }
}
