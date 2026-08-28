import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Servicios efectivos (rol ∪ excepciones personales) del usuario
 * autenticado, resueltos por `backend-erp` — NO por `backend-epsas-horarios`
 * (Materiales vive ahí, pero el modelo de permisos/servicios es del ERP).
 * `GET /api/permisos/mis-servicios` es autoservicio (sin guard, cualquier
 * usuario autenticado consulta los suyos) y devuelve un array plano de
 * nombres de servicio, ej. ['materiales.solicitudes.crear', 'materiales.traslados.aprobar', ...].
 *
 * Usado para mostrar/ocultar acciones "de responsable de bodega" en la UI
 * de instructor (solicitudes/traslados/novedades) — es solo UX, el backend
 * re-valida todo server-side.
 */
@Injectable({ providedIn: 'root' })
export class PermisosService {
  private _servicios = signal<string[] | null>(null);
  private cargando: Promise<void> | null = null;

  constructor(private http: HttpClient) {}

  /** Idempotente: si ya cargó (o está cargando), no repite la llamada HTTP. */
  cargar(): Promise<void> {
    if (this._servicios() !== null) return Promise.resolve();
    if (this.cargando) return this.cargando;

    this.cargando = firstValueFrom(this.http.get<string[]>(`${environment.apiUrl}/permisos/mis-servicios`))
      .then((servicios) => {
        this._servicios.set(servicios ?? []);
      })
      .catch(() => {
        // Sin permisos efectivos conocidos → todo gating queda oculto (fail-closed en UI).
        this._servicios.set([]);
      })
      .finally(() => {
        this.cargando = null;
      });

    return this.cargando;
  }

  tieneServicio(nombre: string): boolean {
    return this._servicios()?.includes(nombre) ?? false;
  }
}
