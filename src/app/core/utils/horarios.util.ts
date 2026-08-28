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
  'sin-fecha':  { label: 'Sin fecha',  bg: '#f3f4f6', text: '#6b7280' },
  'pendiente':  { label: 'Pendiente',  bg: '#fef3c7', text: '#92400e' },
  'en-curso':   { label: 'En curso',   bg: '#dbeafe', text: '#1d4ed8' },
  'completado': { label: 'Completado', bg: '#dcfce7', text: '#166534' },
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
