import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Area, Curso, Formato, Persona } from '../../shared/models';
import { environment } from '../../../environments/environment';

const BASE  = environment.apiUrl;          // → http://localhost:3000 vía proxy
const BASE2 = environment.apiPracticaUrl;  // → http://localhost:3001 vía proxy

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // ── Áreas ────────────────────────────────────────────────────────────────
  async listarAreas(params?: any): Promise<Area[]> {
    const resp: any = await firstValueFrom(this.http.get(`${BASE}/areas`, { params }));
    if (Array.isArray(resp)) return resp;
    if (resp?.data  && Array.isArray(resp.data))  return resp.data;
    if (resp?.areas && Array.isArray(resp.areas)) return resp.areas;
    return [];
  }
  async crearArea(data: Partial<Area>): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE}/area/registrar_jwsv`, data));
  }
  async editarArea(id: number, data: Partial<Area>): Promise<any> {
    return firstValueFrom(this.http.put(`${BASE}/area/actualizar_jwsv/${id}`, data));
  }
  async eliminarArea(id: number): Promise<any> {
    return firstValueFrom(this.http.delete(`${BASE}/area/eliminar_jwsv/${id}`));
  }

  // ── Cursos ────────────────────────────────────────────────────────────────
  async listarCursosArea(idArea: number): Promise<Curso[]> {
    return firstValueFrom(this.http.get<Curso[]>(`${BASE}/curso/listar_jwsv/${idArea}`));
  }
  async crearCurso(data: Partial<Curso>): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE}/curso/registrar_jwsv`, data));
  }
  async editarCurso(id: number, data: Partial<Curso>): Promise<any> {
    return firstValueFrom(this.http.put(`${BASE}/curso/actualizar_jwsv/${id}`, data));
  }
  async eliminarCurso(id: number): Promise<any> {
    return firstValueFrom(this.http.delete(`${BASE}/curso/eliminar_jwsv/${id}`));
  }

  // ── Formatos ──────────────────────────────────────────────────────────────
  async listarFormatos(): Promise<Formato[]> {
    return firstValueFrom(this.http.get<Formato[]>(`${BASE2}/formatos`));
  }
  async listarFormatosPorEtapa(etapaId: string, tipo?: string): Promise<Formato[]> {
    const url = tipo
      ? `${BASE2}/formatos/etapa/${etapaId}?tipo=${tipo}`
      : `${BASE2}/formatos/etapa/${etapaId}`;
    return firstValueFrom(this.http.get<Formato[]>(url));
  }
  async subirFormato(nombre: string, tipo: string, file: File, etapaId?: string): Promise<any> {
    const fd = new FormData();
    fd.append('nombre', nombre);
    fd.append('tipo', tipo);
    if (etapaId) fd.append('etapaId', etapaId);
    fd.append('file', file);
    return firstValueFrom(this.http.post(`${BASE2}/formatos`, fd));
  }
  async eliminarFormato(id: string): Promise<any> {
    return firstValueFrom(this.http.delete(`${BASE2}/formatos/${id}`));
  }

  // ── Personas / Aprendices ─────────────────────────────────────────────────

  /** Trae TODAS las personas del backend (uso interno). */
  private async listarTodasPersonas(): Promise<any[]> {
    const resp: any = await firstValueFrom(
      this.http.get(`${BASE}/personas`, { withCredentials: true })
    );
    if (Array.isArray(resp))                              return resp;
    if (resp?.data       && Array.isArray(resp.data))       return resp.data;
    if (resp?.aprendices && Array.isArray(resp.aprendices)) return resp.aprendices;
    if (resp?.personas   && Array.isArray(resp.personas))   return resp.personas;
    return [];
  }

  /** Retorna SOLO las personas con cargo === 'aprendiz'. */
  async listarAprendices(): Promise<any[]> {
    const todas = await this.listarTodasPersonas();
    return todas.filter((p: any) => p.cargo === 'aprendiz');
  }

  /** Retorna solo personas con cargo 'instructor' o 'administrador'. */
  async listarInstructores(): Promise<any[]> {
    const todas = await this.listarTodasPersonas();
    return todas.filter((p: any) =>
      p.cargo === 'instructor' || p.cargo === 'administrador'
    );
  }

  async buscarPersona(id: number): Promise<Persona> {
    return firstValueFrom(this.http.get<Persona>(`${BASE}/persona/buscar_jwsv/${id}`));
  }
  async actualizarPersona(id: number, data: Partial<Persona>): Promise<any> {
    return firstValueFrom(this.http.put(`${BASE}/persona/${id}`, data));
  }
  async crearPersona(data: Partial<Persona>): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE}/persona/registrar_jwsv`, data));
  }

  // ── Matrículas ────────────────────────────────────────────────────────────
  async listarMatriculasPorAlumno(idAlumno: string): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(this.http.get(`${BASE}/matriculas/persona/${idAlumno}`));
      if (Array.isArray(resp)) return resp;
      if (resp?.data      && Array.isArray(resp.data))      return resp.data;
      if (resp?.matriculas && Array.isArray(resp.matriculas)) return resp.matriculas;
      return [];
    } catch { return []; }
  }

  async listarTodasMatriculas(): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(this.http.get(`${BASE}/matriculas`));
      if (Array.isArray(resp)) return resp;
      if (resp?.data       && Array.isArray(resp.data))       return resp.data;
      if (resp?.matriculas && Array.isArray(resp.matriculas)) return resp.matriculas;
      return [];
    } catch (error) {
      console.error('Error listando todas las matrículas:', error);
      return [];
    }
  }

  // ── Prácticas ─────────────────────────────────────────────────────────────
  /** Solo trae etapas activas — las inactivadas no deben verse en Seguimiento ni en el home. */
  async listarPracticas(): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(this.http.get(`${BASE2}/etapa-practica?soloActivas=true`));
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

  /**
   * Estados de matrícula que sacan a un aprendiz de Seguimiento (y de la
   * lista para iniciar una nueva etapa práctica): ya no cursa ese programa.
   * 'aplazado' queda fuera a propósito — es una pausa, no una salida, y
   * ocultarlo por defecto le haría perder seguimiento a alguien que va a
   * retomar.
   */
  private static readonly ESTADOS_MATRICULA_OCULTOS = new Set([
    'cancelado', 'retiro voluntario', 'trasladado',
  ]);

  /**
   * Aprendices cruzados con su matrícula y etapa práctica (si tiene) — mismo
   * shape que usa la tabla de Seguimiento, reutilizado también por el panel
   * de administración para que "Crear etapa práctica" sea el mismo formulario
   * en ambos módulos. Excluye personas inactivas o con la matrícula cancelada/
   * retirada/trasladada — ver ESTADOS_MATRICULA_OCULTOS.
   */
  async listarAprendicesConPractica(): Promise<any[]> {
    const [aprendices, practicas, todasMatriculas] = await Promise.all([
      this.listarAprendices(),
      this.listarPracticas(),
      this.listarTodasMatriculas(),
    ]);

    const practicaMap = new Map<any, any>();
    practicas.forEach((p: any) => {
      const key = p.matriculaId ?? p.fk_matricula;
      if (key != null) practicaMap.set(key, p);
    });

    const matriculasPorPersona = new Map<any, any[]>();
    todasMatriculas.forEach((m: any) => {
      const personaId = m.idPersona ?? m.id_persona ?? m.fk_persona;
      if (personaId == null) return;
      if (!matriculasPorPersona.has(personaId)) matriculasPorPersona.set(personaId, []);
      matriculasPorPersona.get(personaId)!.push(m);
    });

    return aprendices
      .filter((persona: any) => {
        if (persona.estado === 'inactivo') return false;
        const personaId = persona.idPersona ?? persona.id_persona;
        const estadoMatricula = matriculasPorPersona.get(personaId)?.[0]?.estado;
        return !estadoMatricula
          || !ApiService.ESTADOS_MATRICULA_OCULTOS.has(String(estadoMatricula).toLowerCase());
      })
      .map((persona: any) => {
      const personaId  = persona.idPersona ?? persona.id_persona;
      const matriculas = matriculasPorPersona.get(personaId) ?? [];
      const practica    = matriculas
        .map((m: any) => practicaMap.get(m.idMatricula ?? m.id_matricula))
        .find((p: any) => p != null) ?? null;
      const curso      = matriculas[0]?.curso ?? null;
      const matricula  = matriculas[0] ?? null;

      return {
        id:                   personaId,
        name:                 persona.nombre,
        lastName:             persona.apellido,
        age:                  persona.cedula,
        email:                persona.correo,
        programa:             curso?.programa?.nombre ?? '',
        area:                 curso?.area?.nombre ?? '',
        number:               curso?.codigo ?? '',
        estado:               practica?.estado ?? persona.estado,
        fecha_inicio:         practica?.fecha_inicio ?? practica?.fechaInicio ?? '',
        fecha_fin:            practica?.fecha_fin    ?? practica?.fechaFin    ?? '',
        avance:               practica?.avance ?? 0,
        resultados_aprobados: matricula?.resultadosAprobados ?? false,
        id_matricula:         matricula?.idMatricula ?? matricula?.id_matricula ?? null,
        observacion:          practica?.observacion ?? '',
        id_practica:          practica?.id ?? null,
      };
    });
  }
  async actualizarPractica(id: string, datos: {
    empresaId?: string; modalidadId?: string;
    fecha_inicio?: string; fecha_fin?: string;
    estado?: string; observacion?: string;
  }): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/etapa-practica/${id}`, datos));
  }
  async cambiarEstadoPractica(id: string, estado: string): Promise<{ id: string; estado: string }> {
    return firstValueFrom(
      this.http.patch<{ id: string; estado: string }>(`${BASE2}/etapa-practica/${id}/estado`, { estado })
    );
  }
  async activarPractica(id: string): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/etapa-practica/${id}/activar`, {}));
  }
  async inactivarPractica(id: string): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/etapa-practica/${id}/inactivar`, {}));
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

  /** Crea una observación en el seguimiento más reciente de la etapa (tabla observaciones) */
  async crearObservacion(etapaId: string, datos: {
    descripcion: string;
    persona: string;
    fecha: string;
  }): Promise<any> {
    return firstValueFrom(
      this.http.post(`${BASE2}/observaciones/etapa/${etapaId}`, datos)
    );
  }

  /** Lista todas las observaciones registradas en los seguimientos de una etapa */
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

/** Crea una observación vinculada a un seguimiento específico */
async crearObservacionEnSeguimiento(
  seguimientoId: string,
  datos: { descripcion: string; persona: string; fecha: string, evidencia_foto: string; }
): Promise<any> {
  return firstValueFrom(
    this.http.post(`${BASE2}/observaciones`, {
      ...datos,
      seguimientoId,          // ← campo que espera CreateObservacioneDto
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

  /** @deprecated Usar crearObservacion() — este método solo actualiza el campo de texto de la etapa */
  async actualizarObservacion(idPractica: number, observacion: string): Promise<any> {
    return firstValueFrom(
      this.http.patch(`${BASE2}/etapa-practica/observacion/${idPractica}`, { observacion })
    );
  }
  async actualizarAvancePractica(idPractica: string | number): Promise<any> {
    // El backend calcula el avance internamente — no necesitamos enviar el valor
    return firstValueFrom(
      this.http.patch(`${BASE2}/etapa-practica/avance/${idPractica}`, {})
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
  async actualizarSeguimiento(id: number, datos: { observacion: string }): Promise<any> {
    return firstValueFrom(this.http.put(`${BASE2}/seguimiento/actualizar/${id}`, datos));
  }
  async subirActa(id: number, file: File): Promise<any> {
    const fd = new FormData();
    fd.append('acta', file);
    return firstValueFrom(this.http.put(`${BASE2}/seguimiento/acta/${id}`, fd));
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

  // ── Modalidades y Empresas ────────────────────────────────────────────────
  async listarModalidades(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/modalidad`));
  }
  async listarEmpresas(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/empresas`));
  }

  // ── Usuarios y Credenciales ───────────────────────────────────────────────
  async crearUsuario(data: { fk_persona: number; fk_aplicativo: number }): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE}/usuario/registrar_jwsv`, data));
  }
  async crearCredencial(data: {
    login: string; password: string; fk_usuario: number; fk_rol: number;
  }): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE}/credencial/registrar_jwsv`, data));
  }

  // ── Resultados de aprendizaje aprobados (matrícula) ──────────────────────
  /** Actualiza SOLO el flag de resultados de aprendizaje aprobados de una matrícula */
  async actualizarResultadosAprobadosMatricula(matriculaId: string, resultadosAprobados: boolean): Promise<any> {
    return firstValueFrom(
      this.http.patch(`${BASE}/matriculas/${matriculaId}/resultados-aprobados`, { resultadosAprobados })
    );
  }

  // ── Notificaciones ────────────────────────────────────────────────────────
  async listarNotificaciones(): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(this.http.get(`${BASE}/notificaciones`));
      return Array.isArray(resp) ? resp : [];
    } catch { return []; }
  }

  async contarNotificacionesNoLeidas(): Promise<number> {
    try {
      const resp: any = await firstValueFrom(this.http.get(`${BASE}/notificaciones/count`));
      return resp?.count ?? 0;
    } catch { return 0; }
  }

  async marcarNotificacionLeida(id: string): Promise<void> {
    await firstValueFrom(this.http.patch(`${BASE}/notificaciones/${id}/leer`, {}));
  }

  async marcarTodasNotificacionesLeidas(): Promise<void> {
    await firstValueFrom(this.http.patch(`${BASE}/notificaciones/leer-todas`, {}));
  }

  async crearNotificacion(payload: {
    tipo:          string;
    titulo:        string;
    mensaje:       string;
    destinatarios: string[];
    data?:         Record<string, any>;
  }): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${BASE}/notificaciones`, payload));
    } catch (e) {
      console.warn('[ApiService] Error creando notificación:', e);
    }
  }

  // ── Recuperación de contraseña ────────────────────────────────────────────
  /** Paso 1: Solicitar el código de recuperación por correo */
  async solicitarRecuperacion(correo: string): Promise<any> {
    return firstValueFrom(
      this.http.post(`${BASE}/auth/recuperar-password/solicitar`, { correo })
    );
  }

  /** Paso 2+3: Verificar código y cambiar contraseña en un solo paso */
  async restablecerPassword(correo: string, codigo: string, passwordNuevo: string): Promise<any> {
    return firstValueFrom(
      this.http.post(`${BASE}/auth/recuperar-password/restablecer`, { correo, codigo, passwordNuevo })
    );
  }
}