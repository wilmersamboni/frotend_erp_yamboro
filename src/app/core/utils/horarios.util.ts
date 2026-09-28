/** Funciones puras compartidas por las pantallas de horarios (portadas de ChronoGest). */

export const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;
export const DIAS_LABELS: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
  jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado',
};

export function fechaInicioDelDia(fecha: string): Date {
  return new Date(fecha.slice(0, 10) + 'T00:00:00');
}
export function fechaFinDelDia(fecha: string): Date {
  return new Date(fecha.slice(0, 10) + 'T23:59:59');
}

export interface Resultado {
  texto: string;
  fechaInicio: string | null;
  fechaFin: string | null;
}

/** Normaliza resultados de competencia — soporta el formato legado (string[]). */
export function normalizarResultados(raw: any[] | null | undefined): Resultado[] {
  return (raw ?? []).map((r) =>
    typeof r === 'string' ? { texto: r, fechaInicio: null, fechaFin: null } : { ...r },
  );
}

export type ResultadoEstado = 'sin-fecha' | 'pendiente' | 'en-curso' | 'completado';

export function estadoResultado(r: Resultado, hoyIso: string): ResultadoEstado {
  if (!r.fechaInicio && !r.fechaFin) return 'sin-fecha';
  if (r.fechaInicio && hoyIso < r.fechaInicio) return 'pendiente';
  if (r.fechaFin && hoyIso > r.fechaFin) return 'completado';
  return 'en-curso';
}

/** Formato 12h (ej. "07:00" → "7:00 am"). */
export function to12h(time: string | null | undefined): string {
  if (!time) return '';
  const [hStr, mStr] = time.slice(0, 5).split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return time;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr ?? '00'} ${ampm}`;
}

export function nombreCompleto(p: { nombre?: string; apellido?: string } | null | undefined): string {
  if (!p) return '';
  return `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim();
}

// ── Compartidas por la vista de grid y el historial de competencias ──────

export const RESULTADO_ESTADO_INFO: Record<ResultadoEstado, { label: string; bg: string; text: string }> = {
  'sin-fecha':  { label: 'Sin fecha',  bg: 'var(--surface3)', text: 'var(--text-muted)' },
  'pendiente':  { label: 'Pendiente',  bg: 'var(--warn-bg)', text: 'var(--warn-text)' },
  'en-curso':   { label: 'En curso',   bg: 'var(--info-bg)', text: 'var(--info-text)' },
  'completado': { label: 'Completado', bg: 'var(--ok-bg)', text: 'var(--ok-text)' },
};

/** Ícono según el estado del resultado: check si ya completó, reloj en otro caso */
export function estadoResultadoIcon(r: Resultado, hoyIso: string): string {
  return estadoResultado(r, hoyIso) === 'completado' ? 'check-circle' : 'hourglass';
}

export function estadoResultadoInfo(r: Resultado, hoyIso: string) {
  return RESULTADO_ESTADO_INFO[estadoResultado(r, hoyIso)];
}

/** "lunes" → "lunes", "sabado" → "sábados" (para "Todos los ___") */
export function diaPluralLabel(dia: string): string {
  const map: Record<string, string> = {
    lunes: 'lunes', martes: 'martes', miercoles: 'miércoles', miércoles: 'miércoles',
    jueves: 'jueves', viernes: 'viernes', sabado: 'sábados', sábado: 'sábados', domingo: 'domingos',
  };
  return map[dia?.toLowerCase()] ?? dia ?? '';
}

/** "10/06" — solo la fecha, sin nombre del día (para listas compactas) */
export function formatFechaCorta(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function getDiaLabel(dia?: string): string {
  if (!dia) return '—';
  return DIAS_LABELS[dia] || dia;
}

export function jornadaLabel(j: string | null | undefined): string {
  return ({ manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' } as Record<string, string>)[j?.toLowerCase() ?? ''] ?? j ?? '—';
}

export function durHorarioMin(h: { horaInicio?: string; horaFin?: string } | null | undefined): number {
  if (!h?.horaInicio || !h?.horaFin) return 0;
  const [sh, sm] = h.horaInicio.split(':').map(Number);
  const [eh, em] = h.horaFin.split(':').map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em;
  return e < s ? (e + 1440) - s : e - s;
}

/** "Xh" — duración del horario en texto corto */
export function formatHorasPorDiaStr(h: { horaInicio?: string; horaFin?: string } | null | undefined): string {
  if (!h?.horaInicio || !h?.horaFin) return '';
  const durMin = durHorarioMin(h);
  const hrs = Math.floor(durMin / 60);
  const min = durMin % 60;
  if (min === 0) return `${hrs}h`;
  if (hrs === 0) return `${min}min`;
  return `${hrs}h ${min}min`;
}

export function calcHorasCompetencia(
  comp: { diasClase?: string[] } | null | undefined,
  h: { horaInicio?: string; horaFin?: string } | null | undefined,
): string {
  const dias = (comp?.diasClase ?? []).length;
  if (!dias) return '0h';
  const totalMin = dias * durHorarioMin(h);
  const hrs = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (min === 0) return `${hrs}h`;
  if (hrs === 0) return `${min}min`;
  return `${hrs}h ${min}min`;
}

// ── Estado de las competencias de un horario (icono de libro + tooltip) ──

/** Fecha LOCAL "YYYY-MM-DD" — toISOString() da UTC y en Colombia salta de día desde las 7 pm. */
export function hoyIsoLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Días de calendario entre dos fechas ISO (b - a). */
export function diasEntre(aIso: string, bIso: string): number {
  const a = new Date(aIso.slice(0, 10) + 'T00:00:00').getTime();
  const b = new Date(bIso.slice(0, 10) + 'T00:00:00').getTime();
  return Math.round((b - a) / 86_400_000);
}

export type EstadoCompetencias = 'sin' | 'proxima' | 'vigente' | 'por-terminar' | 'vencida';

/** Una competencia vigente que termina en este número de días o menos, sin otra cargada después, se marca "por terminar". */
export const DIAS_AVISO_FIN_COMPETENCIA = 7;

/**
 * Resume en qué punto está el horario respecto a sus competencias:
 * - sin: nunca se le asignó ninguna.
 * - vigente: hay una en curso (y, si termina pronto, ya hay otra cargada después).
 * - por-terminar: la vigente termina en ≤ 7 días y no hay ninguna posterior.
 * - proxima: ninguna en curso, pero hay una que todavía no empieza.
 * - vencida: todas terminaron y no hay una nueva.
 * `comp` es la competencia más relevante para mostrar en cada caso.
 */
export function estadoCompetencias(
  comps: any[] | null | undefined,
  hoy: string = hoyIsoLocal(),
): { estado: EstadoCompetencias; comp: any | null; dias: number | null } {
  const lista = comps ?? [];
  if (!lista.length) return { estado: 'sin', comp: null, dias: null };

  const vigente = lista.find(c =>
    (!c.fechaInicio || c.fechaInicio.slice(0, 10) <= hoy) &&
    (!c.fechaFin || c.fechaFin.slice(0, 10) >= hoy));
  const futuras = lista
    .filter(c => c.fechaInicio && c.fechaInicio.slice(0, 10) > hoy)
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));

  if (vigente) {
    const dias = vigente.fechaFin ? diasEntre(hoy, vigente.fechaFin) : null;
    const porTerminar = dias !== null && dias <= DIAS_AVISO_FIN_COMPETENCIA && !futuras.length;
    return { estado: porTerminar ? 'por-terminar' : 'vigente', comp: vigente, dias };
  }
  if (futuras.length) {
    return { estado: 'proxima', comp: futuras[0], dias: diasEntre(hoy, futuras[0].fechaInicio) };
  }
  const ultima = [...lista].sort((a, b) => (b.fechaFin ?? '').localeCompare(a.fechaFin ?? ''))[0];
  return { estado: 'vencida', comp: ultima, dias: ultima?.fechaFin ? diasEntre(ultima.fechaFin, hoy) : null };
}
