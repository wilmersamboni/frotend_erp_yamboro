import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE2 = environment.apiPracticaUrl;

@Injectable({ providedIn: 'root' })
export class SeguimientoService {
  constructor(private http: HttpClient) {}

  /**
   * Descarga un archivo de /uploads/* como blob autenticado.
   * `window.open`/`<a href>` a esas rutas directamente NO pasan por el
   * interceptor de Angular (que agrega el header x-tenant y la cookie de
   * sesión vía withCredentials) y devuelven 401.
   */
  async descargarArchivo(carpeta: 'actas' | 'bitacoras', nombre: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`/uploads/${carpeta}/${nombre}`, { responseType: 'blob' })
    );
  }

  // ── Seguimientos ──────────────────────────────────────────────────────────

  async obtenerSeguimientos(idAlumno: string): Promise<any[]> {
    const resp: any = await firstValueFrom(this.http.get(`${BASE2}/seguimientos/alumno/${idAlumno}`));
    if (Array.isArray(resp)) return resp;
    if (resp?.data         && Array.isArray(resp.data))         return resp.data;
    if (resp?.seguimientos && Array.isArray(resp.seguimientos)) return resp.seguimientos;
    return [];
  }

  async obtenerSeguimientosPorEtapa(etapaId: string): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(this.http.get(`${BASE2}/seguimientos/etapa/${etapaId}`));
      if (Array.isArray(resp)) return resp;
      if (resp?.data         && Array.isArray(resp.data))         return resp.data;
      if (resp?.seguimientos && Array.isArray(resp.seguimientos)) return resp.seguimientos;
      return [];
    } catch { return []; }
  }

  async actualizarSeguimiento(id: string, datos: { observacion?: string; estado?: string }): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/seguimientos/${id}`, datos));
  }

  async cambiarEstado(id: string, estado: string): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/seguimientos/${id}/estado`, { estado }));
  }

  async subirActa(id: string, file: File): Promise<any> {
    const fd = new FormData();
    fd.append('file', file);
    return firstValueFrom(this.http.patch(`${BASE2}/seguimientos/${id}/acta`, fd));
  }

  // ── Bitácoras ─────────────────────────────────────────────────────────────

  async obtenerBitacoras(idSeguimiento: string): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(this.http.get(`${BASE2}/bitacoras/seguimiento/${idSeguimiento}`));
      if (Array.isArray(resp)) return resp;
      if (resp?.data      && Array.isArray(resp.data))      return resp.data;
      if (resp?.bitacoras && Array.isArray(resp.bitacoras)) return resp.bitacoras;
      return [];
    } catch { return []; }
  }

  async actualizarEstadoBitacora(idBitacora: string, estado: string): Promise<any> {
    return firstValueFrom(
      this.http.patch(`${BASE2}/bitacoras/${idBitacora}/estado`, { estado })
    );
  }

  async crearBitacoraArchivo(formData: FormData): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE2}/bitacoras`, formData));
  }

  async subirPdfBitacora(idBitacora: string, file: File): Promise<any> {
    const fd = new FormData();
    fd.append('file', file);
    return firstValueFrom(this.http.post(`${BASE2}/bitacoras/${idBitacora}/pdf`, fd));
  }

  // ── Observaciones ─────────────────────────────────────────────────────────

  async crearObservacion(etapaId: string, datos: {
    descripcion: string;
    persona: string;
    fecha: string;
  }): Promise<any> {
    return firstValueFrom(
      this.http.post(`${BASE2}/observaciones/etapa/${etapaId}`, datos)
    );
  }

  async listarObservacionesPorEtapa(etapaId: string): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(
        this.http.get(`${BASE2}/observaciones/etapa/${etapaId}`)
      );
      if (Array.isArray(resp)) return resp;
      if (resp?.data && Array.isArray(resp.data)) return resp.data;
      return [];
    } catch { return []; }
  }

  async listarObservacionesPorSeguimiento(seguimientoId: string): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(
        this.http.get(`${BASE2}/observaciones/seguimiento/${seguimientoId}`)
      );
      if (Array.isArray(resp)) return resp;
      if (resp?.data && Array.isArray(resp.data)) return resp.data;
      return [];
    } catch { return []; }
  }

  async crearObservacionEnSeguimiento(
    seguimientoId: string,
    datos: { descripcion: string; persona: string; fecha: string; evidencia_foto: string; }
  ): Promise<any> {
    return firstValueFrom(
      this.http.post(`${BASE2}/observaciones`, {
        ...datos,
        seguimientoId,
      })
    );
  }

  async subirEvidenciaObservacion(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    const resp: any = await firstValueFrom(
      this.http.post(`${BASE2}/observaciones/upload/evidencia`, fd)
    );
    return resp.url as string;
  }
}
