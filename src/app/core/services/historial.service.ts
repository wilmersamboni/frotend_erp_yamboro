import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Observable,
  OperatorFunction,
  forkJoin,
  from,
  map,
  mergeMap,
  of,
  shareReplay,
  switchMap,
  throwError,
  toArray,
  catchError,
} from 'rxjs';
import {
  ResultadoConsulta,
  Estudiante,
  HistorialAcademico,
  EtapaPracticaItem,
  SeguimientoItem,
  BitacoraItem,
  AsignacionItem,
} from '../../shared/models/estudiante.model';
import { environment } from '../../../environments/environment';

// Backend-epsas (personas, matrículas, cursos, programas)
const BASE = environment.apiUrl;
// Backend-practica-hexagonal (etapa práctica, seguimientos, bitácoras)
const BASE2 = environment.apiPracticaUrl;

/**
 * Máximo de requests en vuelo por lote. El backend limita a 30 req/10 s:
 * el forkJoin masivo original disparaba TODAS las llamadas a la vez y un
 * aprendiz con varias matrículas/seguimientos gatillaba 429 al instante.
 */
const CONCURRENCIA_MAX = 4;

/** El backend crea actas_pdf/bitacora_pdf con el placeholder 'pendiente' — no es un archivo real. */
function archivoReal(nombre: string | null | undefined): string | undefined {
  return nombre && nombre !== 'pendiente' ? nombre : undefined;
}

@Injectable({ providedIn: 'root' })
export class HistorialService {
  private http = inject(HttpClient);

  /** Cache de personas activas — se comparte entre todas las suscripciones */
  private activos$: Observable<any[]> | null = null;

  /**
   * Un 404 significa "este recurso no tiene datos" y se traduce al valor vacío.
   * Cualquier otro error (401, 429, 500, backend caído) se loguea con contexto
   * y se PROPAGA, para que la vista muestre su estado de error en vez de
   * renderizar una tabla vacía sin explicación.
   */
  private vacioSolo404<T>(endpoint: string, vacio: T): OperatorFunction<T, T> {
    return catchError((err: HttpErrorResponse) => {
      if (err.status === 404) return of(vacio);
      console.error(`[historial] GET ${endpoint} → ${err.status}`, err);
      return throwError(() => err);
    });
  }

  /**
   * Como forkJoin (espera todos y conserva el orden) pero con máximo
   * CONCURRENCIA_MAX observables suscritos a la vez, para no reventar el
   * rate limit del backend con ráfagas de requests simultáneas.
   */
  private forkJoinLimitado<T>(fuentes: Observable<T>[]): Observable<T[]> {
    if (!fuentes.length) return of([]);
    return from(fuentes.map((fuente, i) => ({ fuente, i }))).pipe(
      mergeMap(({ fuente, i }) => fuente.pipe(map((valor) => ({ valor, i }))), CONCURRENCIA_MAX),
      toArray(),
      map((res) => res.sort((a, b) => a.i - b.i).map((r) => r.valor)),
    );
  }

  /**
   * Devuelve todos las personas activas del sistema.
   * La primera llamada hace el HTTP; las siguientes devuelven el mismo resultado
   * en memoria (shareReplay) sin repetir la petición.
   */
  listarActivos(): Observable<any[]> {
    if (!this.activos$) {
      this.activos$ = this.http.get<any>(`${BASE}/personas`).pipe(
        map((resp) => this.extractArray(resp, 'personas')),
        catchError((err: HttpErrorResponse) => {
          console.error(`[historial] GET ${BASE}/personas → ${err.status}`, err);
          // No cachear el fallo: el próximo suscriptor vuelve a intentar el HTTP
          this.activos$ = null;
          return throwError(() => err);
        }),
        shareReplay(1),
      );
    }
    return this.activos$;
  }

  /**
   * Consulta compuesta del historial del aprendiz.
   *
   * Flujo:
   *   1. /api/personas/cedula/:cedula           → datos del aprendiz
   *   2. /api/matriculas/persona/:idPersona     → matrículas + cursos + programa
   *   3. /api2/etapa-practica/matricula/:idMat  → etapa práctica por cada matrícula
   *   4. /api2/seguimientos/etapa/:idEtapa      → seguimientos de la etapa
   *   5. /api2/bitacoras/seguimiento/:idSeg     → bitácoras de cada seguimiento
   *
   * El parámetro `documento` puede ser la cédula (numérica) del aprendiz.
   */
  consultar(documento: string): Observable<ResultadoConsulta> {
    const cedula = (documento ?? '').toString().trim();
    if (!cedula) return throwError(() => new Error('Documento vacío'));

    return this.http
      .get<any>(`${BASE}/personas/cedula/${cedula}`)
      .pipe(
        switchMap((persona) => {
          if (!persona) {
            return throwError(() => new Error('Persona no encontrada'));
          }
          const idPersona = persona.idPersona ?? persona.id_persona;

          return this.http
            .get<any>(`${BASE}/matriculas/persona/${idPersona}`)
            .pipe(
              map((resp) => this.extractArray(resp, 'matriculas')),
              this.vacioSolo404(`${BASE}/matriculas/persona/${idPersona}`, [] as any[]),
              switchMap((matriculas) =>
                this.resolverPracticas(matriculas).pipe(
                  map((practicas) => this.ensamblar(persona, matriculas, practicas)),
                ),
              ),
            );
        }),
      );
  }

  // ─── Resolvemos en paralelo la etapa-práctica de cada matrícula ────────────
  private resolverPracticas(matriculas: any[]): Observable<EtapaPracticaItem[]> {
    if (!matriculas.length) return of([]);

    const calls = matriculas.map((m) => {
      const idMat = m.idMatricula ?? m.id_matricula ?? m.id;
      if (!idMat) return of(null);

      return this.http
        .get<any>(`${BASE2}/etapa-practica/matricula/${idMat}`)
        .pipe(
          this.vacioSolo404(`${BASE2}/etapa-practica/matricula/${idMat}`, null as any),
          switchMap((etapa) => {
            if (!etapa || (Array.isArray(etapa) && !etapa.length)) {
              return of(null);
            }
            const etapaObj = Array.isArray(etapa) ? etapa[0] : etapa;
            return forkJoin({
              seguimientos: this.resolverSeguimientos(etapaObj.id),
              asignaciones: this.http
                .get<any>(`${BASE2}/asignaciones/etapa/${etapaObj.id}`)
                .pipe(
                  map((r) => this.extractArray(r, 'asignaciones')),
                  this.vacioSolo404(`${BASE2}/asignaciones/etapa/${etapaObj.id}`, [] as any[]),
                ),
            }).pipe(
              map(({ seguimientos, asignaciones }) =>
                this.mapEtapa(etapaObj, m, seguimientos, asignaciones),
              ),
            );
          }),
        );
    });

    return this.forkJoinLimitado(calls).pipe(
      map((arr) => arr.filter((x): x is EtapaPracticaItem => !!x)),
    );
  }

  // ─── Seguimientos + sus bitácoras ──────────────────────────────────────────
  // Nota F4: antes también se pedía observaciones/etapa/:id en paralelo, pero el
  // resultado nunca se usaba (las observaciones se resuelven por seguimiento).
  // Se eliminó esa request muerta: una menos por etapa contra el rate limit.
  private resolverSeguimientos(etapaId: string): Observable<SeguimientoItem[]> {
  if (!etapaId) return of([]);

  return this.http
    .get<any>(`${BASE2}/seguimientos/etapa/${etapaId}`)
    .pipe(
      map((resp) => this.extractArray(resp, 'seguimientos')),
      this.vacioSolo404(`${BASE2}/seguimientos/etapa/${etapaId}`, [] as any[]),
      switchMap((seguimientos) => {
      if (!seguimientos.length) return of([]);

      const conDatos = seguimientos.map((s: any) =>
  forkJoin({
    bitacoras: this.http
      .get<any>(`${BASE2}/bitacoras/seguimiento/${s.id}`)
      .pipe(
        map((r) => this.extractArray(r, 'bitacoras')),
        this.vacioSolo404(`${BASE2}/bitacoras/seguimiento/${s.id}`, [] as any[])
      ),

    observaciones: this.http
      .get<any>(`${BASE2}/observaciones/seguimiento/${s.id}`)
      .pipe(
        map((r) => this.extractArray(r, 'observaciones')),
        this.vacioSolo404(`${BASE2}/observaciones/seguimiento/${s.id}`, [] as any[])
      ),
  }).pipe(
    map(({ bitacoras, observaciones }) =>
      this.mapSeguimiento(s, bitacoras, observaciones)
    )
  )
);

return this.forkJoinLimitado(conDatos);
    })
  );
}

  // ─── Mapeos ────────────────────────────────────────────────────────────────
  private mapEtapa(
    e: any,
    mat: any,
    seguimientos: SeguimientoItem[],
    asignaciones: any[] = [],
  ): EtapaPracticaItem {
    const curso = mat?.curso ?? {};
    const programa = curso?.programa ?? {};
    return {
      id: e.id,
      idMatricula: e.matriculaId ?? mat.idMatricula ?? mat.id_matricula,
      fichaCurso: curso.codigo ?? '',
      programa: programa.nombre ?? '',
      fechaInicio: e.fecha_inicio ?? '',
      fechaFin: e.fecha_fin ?? '',
      estado: e.estado ?? '',
      observacion: e.observacion ?? '',
      empresa: e.empresa?.nombre ?? e.empresa?.razonSocial ?? '',
      modalidad: e.modalidad?.nombre ?? '',
      seguimientos,
      asignaciones: (asignaciones ?? []).map((a: any) => ({
        id: a.id,
        instructor: a.instructor ?? '',
        fechaInicio: a.fecha_inicio ?? '',
        fechaFin: a.fecha_fin ?? '',
        estado: a.estado ?? '',
        horas: a.horas ?? 0,
      })),
    };
  }

 private mapSeguimiento(
  s: any,
  bitacoras: any[],
  observaciones: any[]
): SeguimientoItem {
  return {
    id: s.id,
    estado: s.estado ?? '',
    observacion: s.observacion ?? '',
    fechaInicio: s.fecha_inicio ?? '',
    fechaFin: s.fecha_fin ?? '',
    // El backend crea cada seguimiento con actas_pdf: 'pendiente' como placeholder
    // (no es un archivo real) — se normaliza a undefined para que el frontend
    // no lo trate como "acta ya cargada".
    actasPdf: archivoReal(s.actas_pdf),

    bitacoras: (bitacoras ?? []).map(b => ({
      id: b.id,
      fecha: b.fecha ?? '',
      estado: b.estado ?? '',
      pdf: archivoReal(b.bitacora_pdf),
    })),

    observaciones: (observaciones ?? []).map(o => ({
      id: o.id,
      fecha: o.fecha ?? '',
      descripcion: o.descripcion ?? '',
    })),
  };
}

  // ─── Ensambla el resultado final ───────────────────────────────────────────
  private ensamblar(
    persona: any,
    matriculas: any[],
    practicas: EtapaPracticaItem[],
  ): ResultadoConsulta {
    // `persona.apellido` ya viene poblado por separado desde el backend
    // (ver migrate_aprendices.py). El split de `nombre` queda solo como
    // fallback para personas legado que aún no se hayan re-migrado y cuyo
    // `nombre` todavía trae el nombre completo concatenado.
    const nombreCompleto = String(persona.nombre ?? '').trim();
    const apellidoDb = String(persona.apellido ?? '').trim();
    let nombre = nombreCompleto;
    let apellido = apellidoDb;
    if (!apellidoDb) {
      const [nombreSplit, ...apellidoSplit] = nombreCompleto.split(/\s+/);
      nombre = nombreSplit ?? nombreCompleto;
      apellido = apellidoSplit.join(' ');
    }

    const programaPrincipal =
      matriculas[0]?.curso?.programa?.nombre ??
      matriculas[0]?.curso?.programa?.tipo ??
      'Sin programa asignado';

    const estudiante: Estudiante = {
      idPersona: persona.idPersona ?? persona.id_persona,
      documento: String(persona.cedula ?? persona.numeroDocumento ?? ''),
      nombre,
      apellido,
      email: persona.correo ?? persona.email ?? '',
      telefono: String(persona.telefono ?? ''),
      programa: programaPrincipal,
      semestre: matriculas.length, // proxy: nº de matrículas
      estado: this.mapEstado(persona.estado),
    };

    const historial: HistorialAcademico[] = matriculas.map((m) => {
      const curso = m.curso ?? {};
      const programa = curso.programa ?? {};
      return {
        idMatricula: m.idMatricula ?? m.id_matricula ?? m.id,
        idCurso: curso.codigo ?? curso.idCurso ?? '',
        nombreCurso: programa.nombre ?? curso.codigo ?? 'Curso',
        creditos: 0,
        nota: 0,
        periodo: this.calcPeriodo(curso.fechaInicio ?? curso.fecha_inicio),
        estado: this.mapEstadoMatricula(m.estado, curso),
      };
    });

    return { estudiante, historial, practicas };
  }

  // ─── Utilidades ────────────────────────────────────────────────────────────
  private extractArray(resp: any, alt?: string): any[] {
    if (Array.isArray(resp)) return resp;
    if (resp?.data && Array.isArray(resp.data)) return resp.data;
    if (alt && Array.isArray(resp?.[alt])) return resp[alt];
    return [];
  }

  private mapEstado(estado: any): Estudiante['estado'] {
    const v = String(estado ?? '').toLowerCase();
    if (v === 'activo') return 'Activo';
    if (v === 'graduado') return 'Graduado';
    return 'Inactivo';
  }

  private mapEstadoMatricula(estado: any, curso: any): HistorialAcademico['estado'] {
    const v = String(estado ?? '').toLowerCase();
    if (v.includes('aprob')) return 'Aprobado';
    if (v.includes('reprob') || v.includes('cancel')) return 'Reprobado';
    // Si el curso aún no ha finalizado → "En curso"
    const fin = curso?.fechaFin ?? curso?.fecha_fin;
    if (fin && new Date(fin).getTime() > Date.now()) return 'En curso';
    return 'Aprobado';
  }

  private calcPeriodo(fecha: any): string {
    if (!fecha) return '';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const trimestre = Math.ceil((d.getMonth() + 1) / 3);
    return `${year}-${trimestre}`;
  }
}
