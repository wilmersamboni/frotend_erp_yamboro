import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

// encuestas se fusionó dentro de backend-practica-hexagonal (mismo backend
// que horarios/asignaciones, puerto 3001, prefijo api2 vía proxy) — ya no
// es un backend-encuestas standalone en el puerto 3002.
const BASE3 = environment.apiPracticaUrl;

export interface Pregunta {
  id: string;
  texto: string;
  activo: boolean;
}

export interface InstructorInfo {
  id: string;
  nombre: string;
  cedula: string;
}

export type EstadoEncuesta = 'ACTIVA' | 'CERRADA';

export interface Encuesta {
  id: string;
  grupoId: string;
  sedeId: string | null;
  fichaId: string;
  numeroFicha: string;
  instructorId: string;
  instructorNombre: string;
  token: string;
  fechaInicio: string;
  fechaFin: string | null;
  fechaLimite: string | null;
  maxRespuestas: number;
  respuestasActuales: number;
  estado: EstadoEncuesta;
  preguntas?: { encuestaPreguntaId: string; preguntaId: string; texto: string }[];
}

export interface InstructorConfig {
  instructorId: string;
  /** Preguntas extra solo para este instructor, además de las base compartidas. */
  preguntaIdsExtra: string[];
}

export interface CrearEncuestaGrupoDto {
  fichaId: string;
  instructores: InstructorConfig[];
  preguntaIdsBase: string[];
  fechaLimite?: string;
}

export interface MetricasEncuesta {
  encuesta: {
    id: string;
    numeroFicha: string;
    instructorNombre: string;
    estado: EstadoEncuesta;
    respuestasActuales: number;
    maxRespuestas: number;
  };
  porPregunta: { pregunta: string; totalSi: number; totalRespuestas: number; porcentajeSi: number }[];
  promedioGlobal: number;
  semaforo: 'verde' | 'amarillo' | 'rojo';
}

export interface FormularioEncuesta {
  numeroFicha: string;
  instructorNombre: string;
  preguntas: { encuestaPreguntaId: string; texto: string }[];
}

export interface EncuestaDeGrupoPublico {
  token: string;
  instructorNombre: string;
  numeroFicha: string;
  estado: EstadoEncuesta;
}

@Injectable({ providedIn: 'root' })
export class EncuestasApiService {
  constructor(private http: HttpClient) {}

  // ── Preguntas ───────────────────────────────────────────────────────────────

  getPreguntas(soloActivas = false): Promise<Pregunta[]> {
    return firstValueFrom(this.http.get<Pregunta[]>(`${BASE3}/preguntas`, { params: { soloActivas } }));
  }
  crearPregunta(texto: string): Promise<Pregunta> {
    return firstValueFrom(this.http.post<Pregunta>(`${BASE3}/preguntas`, { texto }));
  }
  actualizarPregunta(id: string, dto: { texto?: string; activo?: boolean }): Promise<Pregunta> {
    return firstValueFrom(this.http.patch<Pregunta>(`${BASE3}/preguntas/${id}`, dto));
  }
  eliminarPregunta(id: string): Promise<{ message: string }> {
    return firstValueFrom(this.http.delete<{ message: string }>(`${BASE3}/preguntas/${id}`));
  }

  // ── Encuestas ───────────────────────────────────────────────────────────────

  getInstructores(): Promise<InstructorInfo[]> {
    return firstValueFrom(this.http.get<InstructorInfo[]>(`${BASE3}/encuestas/instructores`));
  }
  /** Crea una encuesta por cada instructor en dto.instructores, agrupadas bajo el mismo grupoId. */
  crearEncuestas(dto: CrearEncuestaGrupoDto): Promise<Encuesta[]> {
    return firstValueFrom(this.http.post<Encuesta[]>(`${BASE3}/encuestas`, dto));
  }
  getEncuestas(estado?: EstadoEncuesta): Promise<Encuesta[]> {
    return firstValueFrom(
      this.http.get<Encuesta[]>(`${BASE3}/encuestas`, { params: estado ? { estado } : {} }),
    );
  }
  getEncuesta(id: string): Promise<Encuesta> {
    return firstValueFrom(this.http.get<Encuesta>(`${BASE3}/encuestas/${id}`));
  }
  cerrarEncuesta(id: string): Promise<Encuesta> {
    return firstValueFrom(this.http.patch<Encuesta>(`${BASE3}/encuestas/${id}/cerrar`, {}));
  }

  // ── Responder por link (público, sin sesión) ───────────────────────────────

  /** Listado público (sin sesión) de instructores del grupo — para el link/QR anónimo de ficha. */
  getGrupoPublico(grupoId: string): Promise<EncuestaDeGrupoPublico[]> {
    return firstValueFrom(this.http.get<EncuestaDeGrupoPublico[]>(`${BASE3}/responder-grupo/${grupoId}`));
  }

  // ── Reportes (de una encuesta cerrada puntual) ─────────────────────────────

  getMetricas(id: string): Promise<MetricasEncuesta> {
    return firstValueFrom(this.http.get<MetricasEncuesta>(`${BASE3}/reportes/encuestas/${id}/metricas`));
  }

  /**
   * Un <a href> normal navega fuera de Angular y no pasa por el
   * authInterceptor (que agrega x-tenant + cookie) — sin eso el backend no
   * puede resolver el tenant y responde 401. Por eso el archivo se pide acá
   * por HttpClient (sí pasa por el interceptor) y se dispara la descarga
   * manualmente desde el blob recibido.
   */
  private async descargarBlob(url: string, filenameFallback: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.get(url, { responseType: 'blob', observe: 'response' }),
    );
    const filename = this.extraerFilename(res.headers.get('content-disposition')) ?? filenameFallback;
    const objectUrl = URL.createObjectURL(res.body!);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
  }

  /** El backend arma el nombre real (ficha+instructor+fecha) en Content-Disposition. */
  private extraerFilename(contentDisposition: string | null): string | null {
    if (!contentDisposition) return null;
    const match = /filename="?([^";]+)"?/.exec(contentDisposition);
    return match ? match[1] : null;
  }

  descargarExcel(id: string): Promise<void> {
    return this.descargarBlob(`${BASE3}/reportes/encuestas/${id}/excel`, `encuesta-${id}.xlsx`);
  }
  descargarPdf(id: string): Promise<void> {
    return this.descargarBlob(`${BASE3}/reportes/encuestas/${id}/pdf`, `encuesta-${id}.pdf`);
  }

  // ── Responder (público, con o sin sesión) ──────────────────────────────────

  getFormulario(token: string): Promise<FormularioEncuesta> {
    return firstValueFrom(this.http.get<FormularioEncuesta>(`${BASE3}/responder/${token}`));
  }
  responder(token: string, respuestas: { encuestaPreguntaId: string; valor: boolean }[]): Promise<{ message: string }> {
    return firstValueFrom(
      this.http.post<{ message: string }>(`${BASE3}/responder/${token}`, { respuestas }),
    );
  }
}
