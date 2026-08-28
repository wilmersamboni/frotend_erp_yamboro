// ───────────────────────────────────────────────────────────────────────────────
// Modelos para el módulo "Historial" del aprendiz.
// El historial se arma uniendo:
//   • backend-epsas (localhost:3000 → /api) → persona, matrículas, cursos, programas
//   • backend-practica-hexagonal (localhost:3001 → /api2) → etapa práctica,
//     seguimientos y bitácoras.
// ───────────────────────────────────────────────────────────────────────────────

/** Persona / aprendiz (viene de /api/personas). */
export interface Estudiante {
  idPersona?: string;
  documento: string;       // cédula
  nombre: string;
  apellido: string;        // se deriva del campo nombre si el backend lo envía junto
  email: string;
  telefono: string;
  programa: string;        // nombre del programa más reciente
  semestre: number;        // opcional, si no existe se calcula a partir de matrículas
  estado: 'Activo' | 'Inactivo' | 'Graduado';
}

/** Cada curso/ficha en el que el aprendiz está o estuvo matriculado. */
export interface HistorialAcademico {
  idMatricula: string;
  idCurso: string;         // código de ficha
  nombreCurso: string;     // nombre del programa asociado al curso
  creditos: number;        // se deja en 0 si el backend no lo expone
  nota: number;            // 0 si no aplica
  periodo: string;         // año-trimestre calculado a partir de fechas
  estado: 'Aprobado' | 'Reprobado' | 'En curso';
}

/** Bitácora asociada a un seguimiento de práctica. */
export interface BitacoraItem {
  id: string;
  fecha: string;
  estado: string;
  pdf?: string;
}

/** Seguimiento de la etapa práctica. */
export interface SeguimientoItem {
  id: string;
  estado: string;
  observacion: string;
  fechaInicio: string;
  fechaFin: string;
  actasPdf?: string;
  bitacoras: BitacoraItem[];
  observaciones: ObservacionItem[];
}

/** Asignación de instructor a una etapa práctica. */
export interface AsignacionItem {
  id: string;
  instructor: string;   // UUID del instructor
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  horas: number;
}

/** Etapa práctica asociada a una matrícula. */
export interface EtapaPracticaItem {
  id: string;
  idMatricula: string;
  fichaCurso: string;
  programa: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  observacion: string;
  empresa?: string;
  modalidad?: string;
  seguimientos: SeguimientoItem[];
  asignaciones: AsignacionItem[];
}

/** Resultado completo de la consulta compuesta. */
export interface ResultadoConsulta {
  estudiante: Estudiante;
  historial: HistorialAcademico[];
  practicas: EtapaPracticaItem[];
}


export interface ObservacionItem {
  id: string;
  fecha: string;
  descripcion: string;
}