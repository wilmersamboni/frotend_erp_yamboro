import type {
  OrigenResponsable,
  ReporteLote,
  ReporteMateriales,
  ReporteUnidad,
  ResponsableMaterial,
} from '../data-access/materiales-api.service';

/**
 * Cálculos del Reporte de materiales, compartidos por la pantalla, el PDF y
 * el Excel (así los tres muestran exactamente las mismas cifras). Puro: sin
 * Angular ni librerías de exportación (jsPDF/ExcelJS se cargan solo al exportar).
 */

export const ETIQUETA_ESTADO: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  PRESTADO: 'Prestado',
  'DAÑADO': 'Dañado',
  PERDIDO: 'Perdido',
  EN_MANTENIMIENTO: 'En mantenimiento',
  RESERVADO: 'Reservado (traslado)',
};

export const ETIQUETA_ORIGEN: Record<OrigenResponsable, string> = {
  PRESTAMO: 'Préstamo',
  ASIGNACION: 'Asignado a ficha',
  SITIO: 'Responsable del sitio',
  SIN_RESPONSABLE: 'Sin responsable',
};

export const ETIQUETA_TIPO_SITIO: Record<string, string> = {
  BODEGA: 'Bodega',
  AMBIENTE: 'Ambiente',
  LABORATORIO: 'Laboratorio',
  OTRO: 'Otro',
};

/** Estados que significan "hay que revisar esta unidad". */
export const ESTADOS_NOVEDAD = ['DAÑADO', 'PERDIDO', 'EN_MANTENIMIENTO'];

export const SIN_SITIO = '__sin_sitio';
const SIN_RESPONSABLE = '__sin_responsable';

export interface FiltrosReporte {
  q: string;
  /** id del sitio, `SIN_SITIO` o '' (todos). */
  sitio: string;
  /** Estado de la unidad, 'LOTE' (solo consumibles) o '' (todos). */
  estado: string;
  origen: '' | OrigenResponsable;
  tipoSitio: string;
}

export const FILTROS_VACIOS: FiltrosReporte = { q: '', sitio: '', estado: '', origen: '', tipoSitio: '' };

/** Hoy en hora local, AAAA-MM-DD (`toISOString` daría mañana después de las 7 pm en Colombia). */
export function hoyIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Días de `desde` a `hasta` (AAAA-MM-DD); negativo si `hasta` ya pasó. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Un préstamo/asignación cuya fecha de devolución ya pasó. */
export function devolucionVencida(r: ResponsableMaterial, hoy = hoyIso()): boolean {
  return (r.origen === 'PRESTAMO' || r.origen === 'ASIGNACION') && !!r.hasta && r.hasta < hoy;
}

function norm(v: string | null | undefined): string {
  return (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function coincideComun(x: ReporteUnidad | ReporteLote, f: FiltrosReporte): boolean {
  if (f.sitio && (f.sitio === SIN_SITIO ? x.id_sitio !== null : x.id_sitio !== f.sitio)) return false;
  if (f.tipoSitio && x.sitio_tipo !== f.tipoSitio) return false;
  if (f.origen && x.responsable.origen !== f.origen) return false;
  return true;
}

function textoDe(x: ReporteUnidad | ReporteLote): string {
  const r = x.responsable;
  const extra = 'id_item' in x ? [x.placa_sena, x.codigo_sku, x.marca, x.modelo] : [x.codigo_lote];
  return norm([x.producto, x.codigo_unspsc, x.categoria, x.sitio, r.nombre, r.documento, r.referencia, ...extra].join(' '));
}

export function filtrarReporte(r: ReporteMateriales, f: FiltrosReporte): { unidades: ReporteUnidad[]; lotes: ReporteLote[] } {
  const palabras = norm(f.q).split(/\s+/).filter(Boolean);
  const texto = (x: ReporteUnidad | ReporteLote) => palabras.every((p) => textoDe(x).includes(p));
  const unidades = f.estado === 'LOTE'
    ? []
    : r.unidades.filter((u) => (!f.estado || u.estado === f.estado) && coincideComun(u, f) && texto(u));
  const lotes = f.estado && f.estado !== 'LOTE' ? [] : r.lotes.filter((l) => coincideComun(l, f) && texto(l));
  return { unidades, lotes };
}

export interface ResumenReporte {
  unidades: number;
  disponibles: number;
  /** Prestadas por solicitud o asignadas a ficha. */
  prestadas: number;
  novedad: number;
  sinResponsable: number;
  devolucionesVencidas: number;
  lotes: number;
  productosConsumibles: number;
  responsables: number;
  ubicaciones: number;
}

export function resumir(unidades: ReporteUnidad[], lotes: ReporteLote[], hoy = hoyIso()): ResumenReporte {
  const todos = [...unidades, ...lotes];
  const responsables = new Set(
    todos.filter((x) => x.responsable.origen !== 'SIN_RESPONSABLE').map((x) => claveResponsable(x.responsable)),
  );
  return {
    unidades: unidades.length,
    disponibles: unidades.filter((u) => u.estado === 'DISPONIBLE').length,
    prestadas: unidades.filter((u) => u.estado === 'PRESTADO').length,
    novedad: unidades.filter((u) => ESTADOS_NOVEDAD.includes(u.estado)).length,
    sinResponsable: todos.filter((x) => x.responsable.origen === 'SIN_RESPONSABLE').length,
    devolucionesVencidas: unidades.filter((u) => devolucionVencida(u.responsable, hoy)).length,
    lotes: lotes.length,
    productosConsumibles: new Set(lotes.map((l) => l.id_producto)).size,
    responsables: responsables.size,
    ubicaciones: new Set(todos.map((x) => x.id_sitio ?? SIN_SITIO)).size,
  };
}

function claveResponsable(r: ResponsableMaterial): string {
  if (r.origen === 'SIN_RESPONSABLE') return SIN_RESPONSABLE;
  return r.documento ? `doc:${r.documento}` : `nom:${norm(r.nombre)}`;
}

export interface GrupoResponsable {
  clave: string;
  nombre: string;
  documento: string | null;
  sinResponsable: boolean;
  /** Por qué responde: préstamo, ficha, sitio(s)… sin repetir. */
  motivos: string[];
  unidades: ReporteUnidad[];
  lotes: ReporteLote[];
  porEstado: Record<string, number>;
  enPrestamo: number;
  devolucionesVencidas: number;
}

/** Una fila por persona responsable; "Sin responsable" va primero (es lo que hay que resolver). */
export function agruparPorResponsable(unidades: ReporteUnidad[], lotes: ReporteLote[], hoy = hoyIso()): GrupoResponsable[] {
  const grupos = new Map<string, GrupoResponsable>();
  const grupo = (r: ResponsableMaterial): GrupoResponsable => {
    const clave = claveResponsable(r);
    let g = grupos.get(clave);
    if (!g) {
      g = {
        clave,
        nombre: r.origen === 'SIN_RESPONSABLE' ? 'Sin responsable asignado' : r.nombre ?? 'Persona sin nombre registrado',
        documento: r.origen === 'SIN_RESPONSABLE' ? null : r.documento,
        sinResponsable: r.origen === 'SIN_RESPONSABLE',
        motivos: [],
        unidades: [],
        lotes: [],
        porEstado: {},
        enPrestamo: 0,
        devolucionesVencidas: 0,
      };
      grupos.set(clave, g);
    }
    const motivo = r.origen === 'SITIO' ? `Responsable de ${r.referencia ?? 'un sitio'}`
      : r.origen === 'ASIGNACION' ? (r.referencia ?? 'Asignación a ficha')
      : r.origen === 'PRESTAMO' ? 'Préstamos por solicitud'
      : r.referencia ? `Sitio ${r.referencia} sin responsable` : 'Sin sitio asignado';
    if (!g.motivos.includes(motivo)) g.motivos.push(motivo);
    return g;
  };
  for (const u of unidades) {
    const g = grupo(u.responsable);
    g.unidades.push(u);
    g.porEstado[u.estado] = (g.porEstado[u.estado] ?? 0) + 1;
    if (u.responsable.origen === 'PRESTAMO' || u.responsable.origen === 'ASIGNACION') g.enPrestamo++;
    if (devolucionVencida(u.responsable, hoy)) g.devolucionesVencidas++;
  }
  for (const l of lotes) grupo(l.responsable).lotes.push(l);
  return [...grupos.values()].sort((a, b) =>
    Number(b.sinResponsable) - Number(a.sinResponsable) ||
    b.unidades.length + b.lotes.length - (a.unidades.length + a.lotes.length) ||
    a.nombre.localeCompare(b.nombre),
  );
}

export interface GrupoUbicacion {
  clave: string;
  sitio: string;
  tipo: string | null;
  responsable: string | null;
  unidades: ReporteUnidad[];
  lotes: ReporteLote[];
  porEstado: Record<string, number>;
  /** Unidades de este sitio que hoy están en manos de otra persona (préstamo / ficha). */
  fueraDelSitio: number;
  /** Resumen por producto: devolutivos por estado y consumibles por cantidad. */
  productos: { producto: string; unidades: number; disponibles: number; cantidad: number; unidad: string | null }[];
}

export function agruparPorUbicacion(unidades: ReporteUnidad[], lotes: ReporteLote[]): GrupoUbicacion[] {
  const grupos = new Map<string, GrupoUbicacion>();
  const productos = new Map<string, Map<string, GrupoUbicacion['productos'][number]>>();
  const grupo = (x: ReporteUnidad | ReporteLote): GrupoUbicacion => {
    const clave = x.id_sitio ?? SIN_SITIO;
    let g = grupos.get(clave);
    if (!g) {
      g = {
        clave, sitio: x.sitio ?? 'Sin ubicación', tipo: x.sitio_tipo, responsable: x.sitio_responsable,
        unidades: [], lotes: [], porEstado: {}, fueraDelSitio: 0, productos: [],
      };
      grupos.set(clave, g);
      productos.set(clave, new Map());
    }
    return g;
  };
  const prod = (clave: string, x: ReporteUnidad | ReporteLote) => {
    const m = productos.get(clave)!;
    let p = m.get(x.id_producto);
    if (!p) {
      p = { producto: x.producto, unidades: 0, disponibles: 0, cantidad: 0, unidad: 'unidad_medida' in x ? x.unidad_medida : null };
      m.set(x.id_producto, p);
    }
    return p;
  };
  for (const u of unidades) {
    const g = grupo(u);
    g.unidades.push(u);
    g.porEstado[u.estado] = (g.porEstado[u.estado] ?? 0) + 1;
    if (u.responsable.origen === 'PRESTAMO' || u.responsable.origen === 'ASIGNACION') g.fueraDelSitio++;
    const p = prod(g.clave, u);
    p.unidades++;
    if (u.estado === 'DISPONIBLE') p.disponibles++;
  }
  for (const l of lotes) {
    const g = grupo(l);
    g.lotes.push(l);
    prod(g.clave, l).cantidad += l.cantidad_disponible;
  }
  for (const g of grupos.values()) {
    g.productos = [...productos.get(g.clave)!.values()].sort((a, b) => a.producto.localeCompare(b.producto));
  }
  return [...grupos.values()].sort((a, b) =>
    Number(a.clave === SIN_SITIO) - Number(b.clave === SIN_SITIO) || a.sitio.localeCompare(b.sitio),
  );
}

/** "AAAA-MM-DD" → "dd/mm/aaaa" sin pasar por Date (evita el corrimiento de zona horaria). */
export function fechaCorta(v: string | null | undefined): string {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

/** Texto legible de los filtros activos, para el encabezado del PDF/Excel. */
export function describirFiltros(f: FiltrosReporte, nombreSitio: (id: string) => string): string {
  const partes: string[] = [];
  if (f.sitio) partes.push(`Ubicación: ${f.sitio === SIN_SITIO ? 'sin ubicación' : nombreSitio(f.sitio)}`);
  if (f.tipoSitio) partes.push(`Tipo: ${ETIQUETA_TIPO_SITIO[f.tipoSitio] ?? f.tipoSitio}`);
  if (f.estado) partes.push(`Estado: ${f.estado === 'LOTE' ? 'solo consumibles' : ETIQUETA_ESTADO[f.estado] ?? f.estado}`);
  if (f.origen) partes.push(`Responsable por: ${ETIQUETA_ORIGEN[f.origen]}`);
  if (f.q.trim()) partes.push(`Búsqueda: "${f.q.trim()}"`);
  return partes.length ? partes.join(' · ') : 'Todos los materiales';
}
