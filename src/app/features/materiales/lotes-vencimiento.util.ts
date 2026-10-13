/**
 * "Primero lo que vence primero" (PEPS por vencimiento / FEFO, pedido del dueño 2026-10-09).
 *
 * Cuando alguien elige un lote para gastarlo (Nueva solicitud, Nueva salida, Entregas a fichas) y hay OTRO lote del
 * mismo producto en la misma bodega que vence antes, se le sugiere ese. Es una sugerencia: no bloquea, porque a veces
 * hay razones para usar otro (el que vence antes está abierto en otra práctica, no alcanza, etc.).
 *
 * Funciones puras, sin Angular: cada pantalla mapea sus lotes a `LoteVencimiento`.
 */
export interface LoteVencimiento {
  id: string;
  id_producto: string;
  /** Bodega del lote; null = no se compara (el formulario ya recorta a una bodega). */
  id_sitio?: string | null;
  /** 'YYYY-MM-DD' o ISO; null = sin fecha (no vence o no se registró). */
  fecha_vencimiento: string | null;
  /** Saldo que se puede usar (libre de reservas). */
  libres: number;
}

/** Fecha de hoy en Bogotá como 'YYYY-MM-DD' (la comparación es por día, no por hora). */
export function hoyBogota(ahora = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

function dia(fecha: string | null | undefined): string | null {
  return fecha ? fecha.slice(0, 10) : null;
}

export function estaVencido(fecha: string | null | undefined, hoy = hoyBogota()): boolean {
  const d = dia(fecha);
  return !!d && d < hoy;
}

/** Orden para listar: por vencimiento ascendente, los sin fecha al final. */
export function compararVencimiento(a: string | null | undefined, b: string | null | undefined): number {
  const da = dia(a);
  const db = dia(b);
  if (da === db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da < db ? -1 : 1;
}

function mismoGrupo(a: LoteVencimiento, b: LoteVencimiento): boolean {
  return a.id_producto === b.id_producto && (a.id_sitio ?? null) === (b.id_sitio ?? null);
}

/** Candidatos a gastar primero: con saldo, no vencidos y con fecha. */
function usables(lotes: LoteVencimiento[], hoy: string): LoteVencimiento[] {
  return lotes.filter((l) => l.libres > 0 && !!dia(l.fecha_vencimiento) && !estaVencido(l.fecha_vencimiento, hoy));
}

/**
 * Otro lote del mismo producto y bodega que vence ANTES que el elegido (el más próximo), o null.
 * `excluir`: ids ya usados en otras líneas del formulario (no se sugiere elegirlos dos veces).
 * Un lote vencido nunca se sugiere. Si el elegido no tiene fecha, cualquier lote con fecha vence antes.
 */
export function loteQueVenceAntes(
  elegidoId: string,
  lotes: LoteVencimiento[],
  excluir: Iterable<string> = [],
  hoy = hoyBogota(),
): LoteVencimiento | null {
  const elegido = lotes.find((l) => l.id === elegidoId);
  if (!elegido) return null;
  const fuera = new Set(excluir);
  const fechaElegido = dia(elegido.fecha_vencimiento);
  const antes = usables(lotes, hoy)
    .filter((l) => l.id !== elegido.id && !fuera.has(l.id) && mismoGrupo(l, elegido))
    // Si el elegido está vencido, cualquier lote vigente es mejor opción.
    .filter((l) => !fechaElegido || estaVencido(fechaElegido, hoy) || dia(l.fecha_vencimiento)! < fechaElegido)
    .sort((a, b) => compararVencimiento(a.fecha_vencimiento, b.fecha_vencimiento));
  return antes[0] ?? null;
}

/**
 * Ids de los lotes que "vencen primero" en su producto y bodega, solo donde hay más de un lote con saldo
 * (con uno solo no hay nada que elegir). Sirve para marcarlos en la lista de opciones.
 */
export function idsVencenPrimero(lotes: LoteVencimiento[], hoy = hoyBogota()): Set<string> {
  const conSaldo = lotes.filter((l) => l.libres > 0);
  const ids = new Set<string>();
  for (const l of usables(conSaldo, hoy)) {
    const grupo = conSaldo.filter((o) => mismoGrupo(o, l));
    if (grupo.length < 2) continue;
    const primero = usables(grupo, hoy).sort((a, b) => compararVencimiento(a.fecha_vencimiento, b.fecha_vencimiento))[0];
    if (primero?.id === l.id) ids.add(l.id);
  }
  return ids;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "12 oct 2026" (sin depender de la zona horaria del navegador). */
export function fechaCortaVencimiento(fecha: string | null | undefined): string {
  const d = dia(fecha);
  if (!d) return '';
  const [a, m, dd] = d.split('-');
  return `${Number(dd)} ${MESES[Number(m) - 1] ?? m} ${a}`;
}

/**
 * Texto para el label de una opción: " · vence 12 oct 2026 · vence primero", " · VENCIDO 3 oct 2026" o "".
 * `primero`: el lote está en `idsVencenPrimero`.
 */
export function sufijoVencimiento(fecha: string | null | undefined, primero: boolean, hoy = hoyBogota()): string {
  if (!dia(fecha)) return '';
  if (estaVencido(fecha, hoy)) return ` · VENCIDO ${fechaCortaVencimiento(fecha)}`;
  return ` · vence ${fechaCortaVencimiento(fecha)}${primero ? ' · vence primero' : ''}`;
}
