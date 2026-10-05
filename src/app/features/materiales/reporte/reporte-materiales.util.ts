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

/** Por qué alguien responde por un material, dicho como lo diría una persona (2026-10-05). */
export const ETIQUETA_ORIGEN: Record<OrigenResponsable, string> = {
  PRESTAMO: 'Lo tiene prestado',
  ASIGNACION: 'Entregado a una ficha',
  SITIO: 'Encargado del lugar',
  SIN_RESPONSABLE: 'Nadie a cargo',
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
  /** Estado de la unidad, 'NOVEDAD' (dañado/perdido/mantenimiento), 'LOTE' (solo consumibles) o '' (todos). */
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

function coincideEstado(estado: string, filtro: string): boolean {
  if (!filtro) return true;
  return filtro === 'NOVEDAD' ? ESTADOS_NOVEDAD.includes(estado) : estado === filtro;
}

export function filtrarReporte(r: ReporteMateriales, f: FiltrosReporte): { unidades: ReporteUnidad[]; lotes: ReporteLote[] } {
  const palabras = norm(f.q).split(/\s+/).filter(Boolean);
  const texto = (x: ReporteUnidad | ReporteLote) => palabras.every((p) => textoDe(x).includes(p));
  const unidades = f.estado === 'LOTE'
    ? []
    : r.unidades.filter((u) => coincideEstado(u.estado, f.estado) && coincideComun(u, f) && texto(u));
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
    const motivo = r.origen === 'SITIO' ? `Encargado de ${r.referencia ?? 'un lugar'}`
      : r.origen === 'ASIGNACION' ? (r.referencia ?? 'Entregado a una ficha')
      : r.origen === 'PRESTAMO' ? 'Tiene equipos prestados'
      : r.referencia ? `${r.referencia} no tiene encargado` : 'Sin lugar asignado';
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

/** "1 equipo" / "3 equipos" / "1.250 equipos". */
export function plural(n: number, uno: string, varios: string): string {
  return `${n.toLocaleString('es-CO')} ${n === 1 ? uno : varios}`;
}

const PLURAL_UNIDAD: Record<string, string> = { unidad: 'unidades', kit: 'kits', 'galón': 'galones', par: 'pares' };

/** "30 unidades", "1 metro", "2,5 litros": la unidad de medida en minúscula y en plural cuando toca. */
export function cantidadConUnidad(n: number, unidad: string | null): string {
  const u = (unidad ?? '').toLowerCase().trim();
  if (!u) return n.toLocaleString('es-CO');
  if (n === 1 || u.length <= 2) return `${n.toLocaleString('es-CO')} ${u}`;
  const varios = PLURAL_UNIDAD[u] ?? (/[aeiou]$/.test(u) ? `${u}s` : /s$/.test(u) ? u : `${u}es`);
  return `${n.toLocaleString('es-CO')} ${varios}`;
}

export interface GrupoProducto {
  clave: string;
  producto: string;
  categoria: string | null;
  /** EQUIPO = devolutivo (se presta y se devuelve); CONSUMO = lotes que se gastan. */
  tipo: 'EQUIPO' | 'CONSUMO';
  /** Equipos: cuántas unidades hay. */
  total: number;
  porEstado: Record<string, number>;
  disponibles: number;
  prestados: number;
  novedad: number;
  /** Consumo: cantidad disponible sumando lotes, en `unidad`. */
  cantidad: number;
  unidad: string | null;
  /** Consumo: lotes vencidos o que vencen en 30 días o menos. */
  porVencer: number;
  /** Lugares donde hay, ordenados por cuánto hay en cada uno. */
  lugares: string[];
}

/**
 * La pregunta que primero hace cualquiera ("¿qué hay y cuánto de cada cosa?"):
 * una fila por producto. Primero los equipos, luego el material de consumo;
 * dentro de cada grupo, por nombre.
 */
export function agruparPorProducto(unidades: ReporteUnidad[], lotes: ReporteLote[], hoy = hoyIso()): GrupoProducto[] {
  const grupos = new Map<string, GrupoProducto>();
  const lugares = new Map<string, Map<string, number>>();
  const grupo = (x: ReporteUnidad | ReporteLote, tipo: GrupoProducto['tipo']): GrupoProducto => {
    const clave = `${tipo}:${x.id_producto}`;
    let g = grupos.get(clave);
    if (!g) {
      g = {
        clave, producto: x.producto, categoria: x.categoria, tipo, total: 0, porEstado: {},
        disponibles: 0, prestados: 0, novedad: 0, cantidad: 0,
        unidad: 'unidad_medida' in x ? x.unidad_medida : null, porVencer: 0, lugares: [],
      };
      grupos.set(clave, g);
      lugares.set(clave, new Map());
    }
    const l = lugares.get(clave)!;
    const lugar = x.sitio ?? 'Sin ubicación';
    l.set(lugar, (l.get(lugar) ?? 0) + ('cantidad_disponible' in x ? x.cantidad_disponible : 1));
    return g;
  };
  for (const u of unidades) {
    const g = grupo(u, 'EQUIPO');
    g.total++;
    g.porEstado[u.estado] = (g.porEstado[u.estado] ?? 0) + 1;
    if (u.estado === 'DISPONIBLE') g.disponibles++;
    if (u.estado === 'PRESTADO') g.prestados++;
    if (ESTADOS_NOVEDAD.includes(u.estado)) g.novedad++;
  }
  for (const l of lotes) {
    const g = grupo(l, 'CONSUMO');
    g.cantidad += l.cantidad_disponible;
    if (l.fecha_vencimiento && diasEntre(hoy, l.fecha_vencimiento) <= 30) g.porVencer++;
  }
  for (const g of grupos.values()) {
    g.lugares = [...lugares.get(g.clave)!.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
  }
  return [...grupos.values()].sort((a, b) =>
    Number(a.tipo === 'CONSUMO') - Number(b.tipo === 'CONSUMO') || a.producto.localeCompare(b.producto),
  );
}

/**
 * El reporte contado en dos frases, para leerlo sin mirar tablas:
 * "Hay 612 equipos y herramientas y 11 materiales de consumo en 6 lugares."
 * "3 están prestados (1 ya debía volver) y 2 tienen algún problema."
 */
export function fraseResumen(r: ResumenReporte): { titulo: string; detalle: string; todoBien: boolean } {
  const cosas: string[] = [];
  if (r.unidades) cosas.push(plural(r.unidades, 'equipo o herramienta', 'equipos y herramientas'));
  if (r.productosConsumibles) cosas.push(plural(r.productosConsumibles, 'material de consumo', 'materiales de consumo'));
  if (!cosas.length) return { titulo: 'No hay materiales para mostrar.', detalle: 'Prueba quitando los filtros.', todoBien: true };
  const titulo = `Hay ${cosas.join(' y ')} en ${plural(r.ubicaciones, 'lugar', 'lugares')}, a cargo de ${plural(r.responsables, 'persona', 'personas')}.`;

  const partes: string[] = [];
  if (r.prestadas) {
    partes.push(`${plural(r.prestadas, 'está prestado', 'están prestados')}` +
      (r.devolucionesVencidas ? ` (${plural(r.devolucionesVencidas, 'ya debía volver', 'ya debían volver')})` : ''));
  }
  if (r.novedad) partes.push(`${plural(r.novedad, 'tiene', 'tienen')} algún problema (dañado, perdido o en mantenimiento)`);
  if (r.sinResponsable) partes.push(`${plural(r.sinResponsable, 'no tiene', 'no tienen')} a nadie a cargo`);
  const todoBien = !partes.length;
  const detalle = todoBien
    ? (r.unidades ? 'Todos los equipos están en su lugar y en buen estado.' : 'No hay nada pendiente.')
    : unirConY(partes).replace(/^./, (c) => c.toUpperCase()) + '.';
  return { titulo, detalle, todoBien };
}

function unirConY(partes: string[]): string {
  return partes.length < 2 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
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
  if (f.sitio) partes.push(`Lugar: ${f.sitio === SIN_SITIO ? 'sin ubicación' : nombreSitio(f.sitio)}`);
  if (f.tipoSitio) partes.push(`Tipo de lugar: ${ETIQUETA_TIPO_SITIO[f.tipoSitio] ?? f.tipoSitio}`);
  if (f.estado) {
    const e = f.estado === 'LOTE' ? 'solo material de consumo' : f.estado === 'NOVEDAD' ? 'con algún problema' : ETIQUETA_ESTADO[f.estado] ?? f.estado;
    partes.push(`Estado: ${e}`);
  }
  if (f.origen) partes.push(`Quién responde: ${ETIQUETA_ORIGEN[f.origen]}`);
  if (f.q.trim()) partes.push(`Búsqueda: "${f.q.trim()}"`);
  return partes.length ? partes.join(' · ') : 'Todos los materiales';
}
