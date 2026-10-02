import { crearInformePdf, RGB, TINTA } from '../../../shared/utils/informe-pdf';
import { ColXl, ExportService, fechaXl } from '../../../core/services/export.service';
import type { ReporteLote, ReporteUnidad } from '../data-access/materiales-api.service';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_ORIGEN,
  ETIQUETA_TIPO_SITIO,
  GrupoResponsable,
  GrupoUbicacion,
  ResumenReporte,
  devolucionVencida,
  diasEntre,
  fechaCorta,
  hoyIso,
} from './reporte-materiales.util';

/**
 * PDF y Excel del Reporte de materiales. Se carga con `import()` solo al
 * exportar: jsPDF y ExcelJS no viajan con la pantalla.
 */
export interface DatosReporteMateriales {
  unidades: ReporteUnidad[];
  lotes: ReporteLote[];
  resumen: ResumenReporte;
  porResponsable: GrupoResponsable[];
  porUbicacion: GrupoUbicacion[];
  /** Filtros activos en texto ("Todos los materiales" si no hay). */
  filtros: string;
}

const COLOR_ESTADO: Record<string, RGB> = {
  DISPONIBLE: TINTA.ok,
  PRESTADO: TINTA.info,
  'DAÑADO': TINTA.error,
  PERDIDO: TINTA.error,
  EN_MANTENIMIENTO: TINTA.alerta,
  RESERVADO: TINTA.alerta,
};

const estado = (e: string) => ETIQUETA_ESTADO[e] ?? e;
const tipoSitio = (t: string | null) => (t ? ETIQUETA_TIPO_SITIO[t] ?? t : '—');
const identificacion = (u: ReporteUnidad) => u.placa_sena || u.codigo_sku || 'Sin placa';
const persona = (nombre: string | null, doc: string | null) =>
  nombre ? `${nombre}${doc ? `\nC.C. ${doc}` : ''}` : 'Sin responsable';
const conteoEstados = (por: Record<string, number>) =>
  Object.entries(por)
    .sort((a, b) => b[1] - a[1])
    .map(([e, n]) => `${n} ${estado(e).toLowerCase()}`)
    .join(', ') || '—';

/** "Préstamo · hasta 15/10/2026" — a qué título y hasta cuándo responde. */
function respondePor(u: ReporteUnidad | ReporteLote): string {
  const r = u.responsable;
  const base = r.origen === 'ASIGNACION' ? r.referencia ?? ETIQUETA_ORIGEN.ASIGNACION : ETIQUETA_ORIGEN[r.origen];
  if (r.origen === 'PRESTAMO' || r.origen === 'ASIGNACION') {
    return `${base}${r.desde ? ` · desde ${fechaCorta(r.desde)}` : ''}${r.hasta ? ` · devolver ${fechaCorta(r.hasta)}` : ''}`;
  }
  return base;
}

/** Unidades con placa: una fila cada una. Sin placa: iguales (producto, estado, sitio, responsable) en una fila con cantidad. */
export function agruparDetalle(unidades: ReporteUnidad[]): { u: ReporteUnidad; cantidad: number }[] {
  const filas: { u: ReporteUnidad; cantidad: number }[] = [];
  const iguales = new Map<string, { u: ReporteUnidad; cantidad: number }>();
  for (const u of unidades) {
    if (u.placa_sena) {
      filas.push({ u, cantidad: 1 });
      continue;
    }
    const r = u.responsable;
    const clave = [u.id_producto, u.codigo_sku, u.estado, u.id_sitio, r.origen, r.nombre, r.documento, r.referencia, r.desde, r.hasta].join('|');
    const fila = iguales.get(clave);
    if (fila) fila.cantidad++;
    else {
      const nueva = { u, cantidad: 1 };
      iguales.set(clave, nueva);
      filas.push(nueva);
    }
  }
  return filas;
}

function generadoTexto(): string {
  return new Date().toLocaleString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export async function exportarReporteMaterialesPdf(d: DatosReporteMateriales): Promise<void> {
  const { resumen: r } = d;
  const hoy = hoyIso();
  const inf = await crearInformePdf({ marca: 'Materiales · SENA', tipo: 'Reporte de materiales' });
  inf.encabezado(
    'Reporte de materiales',
    'Qué hay, dónde está, en qué estado y quién responde por cada material',
    `${d.filtros}   ·   Generado el ${generadoTexto()}`,
  );
  inf.cifras([
    { valor: r.unidades.toLocaleString('es-CO'), etiqueta: 'Unidades', detalle: `${r.disponibles} disponibles` },
    { valor: r.prestadas.toLocaleString('es-CO'), etiqueta: 'Prestadas o asignadas', detalle: r.devolucionesVencidas ? `${r.devolucionesVencidas} vencidas` : undefined, color: r.devolucionesVencidas ? TINTA.alerta : undefined },
    { valor: r.novedad.toLocaleString('es-CO'), etiqueta: 'Con novedad', detalle: 'dañadas, perdidas o en mant.', color: r.novedad ? TINTA.error : undefined },
    { valor: r.sinResponsable.toLocaleString('es-CO'), etiqueta: 'Sin responsable', color: r.sinResponsable ? TINTA.error : TINTA.ok },
  ]);

  // ── 1. Responsables ─────────────────────────────────────────────────────
  inf.seccion('1', 'Responsables');
  if (d.porResponsable.length) {
    inf.tabla(
      ['Responsable', 'Responde por', 'Unid.', 'Prest.', 'Lotes', 'Estado de las unidades'],
      d.porResponsable.map((g) => [
        g.sinResponsable ? 'Sin responsable asignado' : persona(g.nombre, g.documento),
        g.motivos.join('\n'),
        g.unidades.length,
        g.enPrestamo ? `${g.enPrestamo}${g.devolucionesVencidas ? ` (${g.devolucionesVencidas} venc.)` : ''}` : '—',
        g.lotes.length || '—',
        conteoEstados(g.porEstado),
      ]),
      {
        columnStyles: {
          0: { cellWidth: 40, fontStyle: 'bold' }, 1: { cellWidth: 42 }, 2: { cellWidth: 12, halign: 'center' },
          3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 14, halign: 'center' },
        },
        didParseCell: (c: any) => {
          if (c.section !== 'body') return;
          const g = d.porResponsable[c.row.index];
          if (g.sinResponsable && c.column.index === 0) c.cell.styles.textColor = TINTA.error;
          if (c.column.index === 3 && g.devolucionesVencidas) c.cell.styles.textColor = TINTA.alerta;
        },
      },
    );
  } else {
    inf.vacio('No hay materiales con los filtros elegidos.');
  }

  // ── 2. Ubicaciones ──────────────────────────────────────────────────────
  inf.seccion('2', 'Ubicaciones');
  if (d.porUbicacion.length) {
    inf.tabla(
      ['Ubicación', 'Tipo', 'Responsable del sitio', 'Unid.', 'Fuera', 'Lotes', 'Estado de las unidades'],
      d.porUbicacion.map((g) => [
        g.sitio, tipoSitio(g.tipo), g.responsable ?? 'Sin responsable', g.unidades.length,
        g.fueraDelSitio || '—', g.lotes.length || '—', conteoEstados(g.porEstado),
      ]),
      {
        columnStyles: {
          0: { cellWidth: 32, fontStyle: 'bold' }, 1: { cellWidth: 20 }, 2: { cellWidth: 34 },
          3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 13, halign: 'center' }, 5: { cellWidth: 14, halign: 'center' },
        },
        didParseCell: (c: any) => {
          if (c.section === 'body' && c.column.index === 2 && !d.porUbicacion[c.row.index].responsable) {
            c.cell.styles.textColor = TINTA.error;
          }
        },
      },
    );
    inf.nota('Fuera', 'Unidades de ese sitio que hoy están prestadas o asignadas a una ficha: responde por ellas quien las tiene.');
  } else {
    inf.vacio('Sin ubicaciones.');
  }

  // ── 3. Devoluciones vencidas ───────────────────────────────────────────
  const vencidas = d.unidades.filter((u) => devolucionVencida(u.responsable, hoy));
  if (vencidas.length) {
    inf.seccion('3', 'Préstamos con devolución vencida');
    inf.tabla(
      ['Placa', 'Producto', 'Responsable', 'Debía devolverse', 'Atraso'],
      vencidas.map((u) => [
        identificacion(u), u.producto, persona(u.responsable.nombre, u.responsable.documento),
        fechaCorta(u.responsable.hasta), `${diasEntre(u.responsable.hasta!, hoy)} días`,
      ]),
      { columnStyles: { 0: { cellWidth: 26 }, 3: { cellWidth: 28 }, 4: { cellWidth: 18, textColor: TINTA.error, fontStyle: 'bold' } } },
    );
  }

  // ── 4. Detalle de unidades ──────────────────────────────────────────────
  // Las unidades con placa van una por fila (son identificables); las que no
  // tienen placa e iguales en todo lo demás se juntan en una fila con su
  // cantidad — si no, 1.000 arduinos sin placa eran 40 páginas idénticas.
  const detalle = agruparDetalle(d.unidades);
  inf.seccion(vencidas.length ? '4' : '3', `Detalle de unidades (${d.unidades.length})`);
  if (detalle.length) {
    inf.tabla(
      ['Placa / SKU', 'Cant.', 'Producto', 'Estado', 'Ubicación', 'Responsable', 'Responde por'],
      detalle.map(({ u, cantidad }) => [
        identificacion(u), cantidad, `${u.producto}${u.codigo_unspsc ? `\nUNSPSC ${u.codigo_unspsc}` : ''}`, estado(u.estado),
        u.sitio ?? 'Sin ubicación', persona(u.responsable.nombre, u.responsable.documento), respondePor(u),
      ]),
      {
        styles: { fontSize: 7.6 },
        columnStyles: {
          0: { cellWidth: 25 }, 1: { cellWidth: 11, halign: 'center' }, 2: { cellWidth: 29 }, 3: { cellWidth: 25, fontStyle: 'bold' },
          4: { cellWidth: 22 }, 5: { cellWidth: 30 },
        },
        didParseCell: (c: any) => {
          if (c.section !== 'body') return;
          const { u } = detalle[c.row.index];
          if (c.column.index === 3) c.cell.styles.textColor = COLOR_ESTADO[u.estado] ?? TINTA.texto;
          if (c.column.index === 5 && u.responsable.origen === 'SIN_RESPONSABLE') c.cell.styles.textColor = TINTA.error;
          if (c.column.index === 6 && devolucionVencida(u.responsable, hoy)) c.cell.styles.textColor = TINTA.alerta;
        },
      },
    );
  } else {
    inf.vacio('No hay unidades devolutivas con los filtros elegidos.');
  }

  // ── 5. Consumibles ──────────────────────────────────────────────────────
  inf.seccion(vencidas.length ? '5' : '4', `Consumibles y perecederos (${d.lotes.length} lotes)`);
  if (d.lotes.length) {
    inf.tabla(
      ['Producto', 'Lote', 'Disponible', 'Vence', 'Ubicación', 'Responsable'],
      d.lotes.map((l) => [
        l.producto, l.codigo_lote ?? '—',
        `${l.cantidad_disponible.toLocaleString('es-CO')} ${l.unidad_medida.toLowerCase()}${l.cantidad_reservada ? `\n(${l.cantidad_reservada} reservado)` : ''}`,
        fechaCorta(l.fecha_vencimiento), l.sitio ?? 'Sin ubicación', persona(l.responsable.nombre, l.responsable.documento),
      ]),
      {
        styles: { fontSize: 7.6 },
        columnStyles: { 1: { cellWidth: 22 }, 2: { cellWidth: 26 }, 3: { cellWidth: 20 }, 4: { cellWidth: 28 }, 5: { cellWidth: 34 } },
        didParseCell: (c: any) => {
          if (c.section !== 'body' || c.column.index !== 3) return;
          const v = d.lotes[c.row.index].fecha_vencimiento;
          if (v && v < hoy) c.cell.styles.textColor = TINTA.error;
        },
      },
    );
  } else {
    inf.vacio('No hay lotes de consumibles con los filtros elegidos.');
  }

  inf.terminar({ izquierda: `Reporte de materiales  ·  ${d.filtros}`, derechaEncabezado: 'Reporte de materiales' });
  inf.doc.save(`reporte-materiales-${hoy}.pdf`);
}

export async function exportarReporteMaterialesExcel(d: DatosReporteMateriales, xl: ExportService): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EPSAS';
  wb.created = new Date();
  const hoy = hoyIso();
  const sub = `${d.filtros}   ·   Generado el ${generadoTexto()}`;
  const pie = 'Reporte de materiales · EPSAS';
  const r = d.resumen;

  // Resumen
  xl.hojaExcel(wb, 'Resumen', sub, pie,
    [{ titulo: 'Indicador', ancho: 42, tipo: 'negrita' }, { titulo: 'Cantidad', ancho: 14, tipo: 'numero' }],
    [
      ['Unidades devolutivas', r.unidades],
      ['  Disponibles', r.disponibles],
      ['  Prestadas o asignadas a ficha', r.prestadas],
      ['  Con devolución vencida', r.devolucionesVencidas],
      ['  Con novedad (dañadas, perdidas, en mantenimiento)', r.novedad],
      ['Lotes de consumibles / perecederos', r.lotes],
      ['  Productos consumibles distintos', r.productosConsumibles],
      ['Materiales sin responsable', r.sinResponsable],
      ['Personas responsables', r.responsables],
      ['Ubicaciones', r.ubicaciones],
    ]);

  xl.hojaExcel(wb, 'Por responsable', sub, pie,
    [
      { titulo: 'Responsable', ancho: 32, tipo: 'negrita' }, { titulo: 'Documento', ancho: 15 },
      { titulo: 'Responde por', ancho: 40 }, { titulo: 'Unidades', ancho: 11, tipo: 'numero' },
      { titulo: 'Prestadas', ancho: 11, tipo: 'numero' }, { titulo: 'Vencidas', ancho: 11, tipo: 'numero' },
      { titulo: 'Lotes', ancho: 9, tipo: 'numero' }, { titulo: 'Estado de las unidades', ancho: 44 },
    ],
    d.porResponsable.map((g) => [
      g.nombre, g.documento ?? '—', g.motivos.join(' · '), g.unidades.length, g.enPrestamo,
      g.devolucionesVencidas, g.lotes.length, conteoEstados(g.porEstado),
    ]));

  xl.hojaExcel(wb, 'Por ubicación', sub, pie,
    [
      { titulo: 'Ubicación', ancho: 28, tipo: 'negrita' }, { titulo: 'Tipo', ancho: 13 },
      { titulo: 'Responsable del sitio', ancho: 30 }, { titulo: 'Unidades', ancho: 11, tipo: 'numero' },
      { titulo: 'Disponibles', ancho: 12, tipo: 'numero' }, { titulo: 'Fuera (prestadas)', ancho: 15, tipo: 'numero' },
      { titulo: 'Lotes', ancho: 9, tipo: 'numero' }, { titulo: 'Estado de las unidades', ancho: 44 },
    ],
    d.porUbicacion.map((g) => [
      g.sitio, tipoSitio(g.tipo), g.responsable ?? 'Sin responsable', g.unidades.length,
      g.porEstado['DISPONIBLE'] ?? 0, g.fueraDelSitio, g.lotes.length, conteoEstados(g.porEstado),
    ]));

  const colsUnidad: ColXl[] = [
    { titulo: 'Placa SENA', ancho: 15 }, { titulo: 'SKU', ancho: 18 }, { titulo: 'Producto', ancho: 30, tipo: 'negrita' },
    { titulo: 'UNSPSC', ancho: 11 }, { titulo: 'Categoría', ancho: 16 }, { titulo: 'Estado', ancho: 16, tipo: 'estado' },
    { titulo: 'Ubicación', ancho: 22 }, { titulo: 'Tipo de sitio', ancho: 13 }, { titulo: 'Responsable', ancho: 28 },
    { titulo: 'Documento', ancho: 14 }, { titulo: 'Responde por', ancho: 22 }, { titulo: 'Desde', ancho: 12, tipo: 'fecha' },
    { titulo: 'Devolver', ancho: 12, tipo: 'fecha' }, { titulo: 'Vencido', ancho: 9 },
  ];
  const wsU = xl.hojaExcel(wb, 'Unidades', sub, pie, colsUnidad,
    d.unidades.map((u) => [
      u.placa_sena ?? '—', u.codigo_sku ?? '—', u.producto, u.codigo_unspsc ?? '—', u.categoria ?? '—', estado(u.estado),
      u.sitio ?? 'Sin ubicación', tipoSitio(u.sitio_tipo), u.responsable.nombre ?? 'Sin responsable', u.responsable.documento ?? '—',
      u.responsable.origen === 'ASIGNACION' ? u.responsable.referencia ?? 'Asignación' : ETIQUETA_ORIGEN[u.responsable.origen],
      fechaXl(u.responsable.desde), fechaXl(u.responsable.hasta), devolucionVencida(u.responsable, hoy) ? 'Sí' : '',
    ]),
    'No hay unidades con los filtros elegidos.');
  // Colores de estado propios de Materiales (los genéricos son de prácticas).
  d.unidades.forEach((u, i) => {
    const c = wsU.getRow(5 + i).getCell(6);
    const rgb = COLOR_ESTADO[u.estado];
    if (rgb) c.font = { ...(c.font ?? {}), bold: true, color: { argb: 'FF' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase() } };
    if (u.responsable.origen === 'SIN_RESPONSABLE') wsU.getRow(5 + i).getCell(9).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
    if (devolucionVencida(u.responsable, hoy)) wsU.getRow(5 + i).getCell(14).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB45309' } };
  });
  wsU.views = [{ state: 'frozen', ySplit: 4, xSplit: 1, showGridLines: false }];

  xl.hojaExcel(wb, 'Consumibles', sub, pie,
    [
      { titulo: 'Producto', ancho: 30, tipo: 'negrita' }, { titulo: 'UNSPSC', ancho: 11 }, { titulo: 'Lote', ancho: 14 },
      { titulo: 'Disponible', ancho: 12, tipo: 'numero' }, { titulo: 'Reservado', ancho: 11, tipo: 'numero' },
      { titulo: 'Unidad', ancho: 12 }, { titulo: 'Ingreso', ancho: 12, tipo: 'fecha' }, { titulo: 'Vence', ancho: 12, tipo: 'fecha' },
      { titulo: 'Ubicación', ancho: 22 }, { titulo: 'Responsable', ancho: 28 }, { titulo: 'Documento', ancho: 14 },
    ],
    d.lotes.map((l) => [
      l.producto, l.codigo_unspsc ?? '—', l.codigo_lote ?? '—', l.cantidad_disponible, l.cantidad_reservada, l.unidad_medida,
      fechaXl(l.fecha_ingreso), fechaXl(l.fecha_vencimiento), l.sitio ?? 'Sin ubicación',
      l.responsable.nombre ?? 'Sin responsable', l.responsable.documento ?? '—',
    ]),
    'No hay lotes con los filtros elegidos.');

  await xl.descargarExcel(wb, `reporte-materiales-${hoy}.xlsx`);
}
