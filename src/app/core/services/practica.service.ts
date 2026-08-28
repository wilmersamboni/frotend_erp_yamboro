import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE2 = environment.apiPracticaUrl;

@Injectable({ providedIn: 'root' })
export class PracticaService {
  constructor(private http: HttpClient) {}

  // ── Prácticas ─────────────────────────────────────────────────────────────

  async listarPracticas(): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(this.http.get(`${BASE2}/etapa-practica`));
      if (Array.isArray(resp)) return resp;
      if (resp?.data      && Array.isArray(resp.data))      return resp.data;
      if (resp?.practicas && Array.isArray(resp.practicas)) return resp.practicas;
      return [];
    } catch { return []; }
  }

  async crearPractica(datos: {
    matriculaId: string; modalidadId: string;
    fecha_inicio: string; fecha_fin: string;
    empresaId: string; estado: string; observacion: string;
    asignacion?: {
      instructor: string;
      fecha_inicio: string;
      fecha_fin: string;
      estado: string;
      horas: number;
    };
  }): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE2}/etapa-practica`, datos));
  }

  async obtenerPractica(id: string): Promise<any> {
    return firstValueFrom(this.http.get(`${BASE2}/etapa-practica/${id}`));
  }

  async actualizarPractica(id: string, datos: {
    empresaId?: string; modalidadId?: string;
    fecha_inicio?: string; fecha_fin?: string;
    estado?: string; observacion?: string;
  }): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/etapa-practica/${id}`, datos));
  }

  async activarPractica(id: string): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/etapa-practica/${id}/activar`, {}));
  }

  async inactivarPractica(id: string): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/etapa-practica/${id}/inactivar`, {}));
  }

  async actualizarAvancePractica(idPractica: string | number): Promise<any> {
    return firstValueFrom(
      this.http.patch(`${BASE2}/etapa-practica/avance/${idPractica}`, {})
    );
  }

  /** @deprecated Usar ObservacionService.crearObservacion() */
  async actualizarObservacion(idPractica: number, observacion: string): Promise<any> {
    return firstValueFrom(
      this.http.patch(`${BASE2}/etapa-practica/observacion/${idPractica}`, { observacion })
    );
  }

  // ── Asignaciones de instructor ────────────────────────────────────────────

  async listarAsignacionesPorEtapa(etapaId: string): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(
        this.http.get(`${BASE2}/asignaciones/etapa/${etapaId}`)
      );
      if (Array.isArray(resp)) return resp;
      if (resp?.data && Array.isArray(resp.data)) return resp.data;
      return [];
    } catch { return []; }
  }

  async crearAsignacion(datos: {
    instructor: string; fecha_inicio: string; fecha_fin: string;
    estado: string; horas: number; etapaId: string;
  }): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE2}/asignaciones`, datos));
  }

  async actualizarAsignacion(id: string, datos: {
    instructor?: string; fecha_inicio?: string; fecha_fin?: string;
    estado?: string; horas?: number;
  }): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/asignaciones/${id}`, datos));
  }

  async eliminarAsignacion(id: string): Promise<any> {
    return firstValueFrom(this.http.delete(`${BASE2}/asignaciones/${id}`));
  }

  // ── Documentos ───────────────────────────────────────────────────────────

  async subirDocumentos(etapaId: string, formData: FormData): Promise<any> {
    return firstValueFrom(
      this.http.post(`${BASE2}/etapas-practicas/${etapaId}/documentos`, formData)
    );
  }

  async listarDocumentos(etapaId: string): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(
        this.http.get(`${BASE2}/etapas-practicas/${etapaId}/documentos`)
      );
      return Array.isArray(resp) ? resp : resp?.data ?? [];
    } catch { return []; }
  }

  async eliminarDocumento(etapaId: string, documentoId: string): Promise<any> {
    return firstValueFrom(
      this.http.delete(`${BASE2}/etapas-practicas/${etapaId}/documentos/${documentoId}`)
    );
  }

  /** URL del endpoint de descarga */
  urlDescargar(etapaId: string, documentoId: string): string {
    return `${BASE2}/etapas-practicas/${etapaId}/documentos/${documentoId}/descargar`;
  }

  /**
   * Descarga un documento pasando por HttpClient para que el interceptor
   * agregue el header x-tenant y la cookie de sesión (withCredentials)
   * requeridos por el backend. Crea un Blob URL temporal y lo revoca al
   * terminar.
   */
  async descargarDocumento(
    etapaId: string,
    documentoId: string,
    nombreOriginal: string,
  ): Promise<void> {
    const url  = this.urlDescargar(etapaId, documentoId);
    const blob = await firstValueFrom(
      this.http.get(url, { responseType: 'blob' }),
    );
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href          = objectUrl;
    a.download      = nombreOriginal;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  // ── Modalidades y Empresas ────────────────────────────────────────────────

  async listarModalidades(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/modalidad`));
  }

  async listarEmpresas(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/empresas`));
  }
}
