import { crearInformePdf, RGB, TINTA } from '../../../shared/utils/informe-pdf';
import { ColXl, ExportService, fechaXl } from '../../../core/services/export.service';
import type { ReporteLote, ReporteUnidad } from '../data-access/materiales-api.service';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_ORIGEN,
  ETIQUETA_TIPO_SITIO,
  GrupoProducto,
  GrupoResponsable,
  GrupoUbicacion,
  ResumenReporte,
  cantidadConUnidad,
  devolucionVencida,
  diasEntre,
  fechaCorta,
  fraseResumen,
  hoyIso,
  plural,
} from './reporte-materiales.util';

/**
 * PDF y Excel del Reporte de materiales. Se carga con `import()` solo al
 * exportar: jsPDF y ExcelJS no viajan con la pantalla.
 */
export interface DatosReporteMateriales {
  unidades: ReporteUnidad[];
  lotes: ReporteLote[];
  resumen: ResumenReporte;
  porProducto: GrupoProducto[];
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
  nombre ? `${nombre}${doc ? `\nC.C. ${doc}` : ''}` : 'Nadie a cargo';
const ORDEN_ESTADOS = ['DISPONIBLE', 'PRESTADO', 'RESERVADO', 'EN_MANTENIMIENTO', 'DAÑADO', 'PERDIDO'];
const ESTADO_CONTADO: Record<string, [string, string]> = {
  DISPONIBLE: ['disponible', 'disponibles'],
  PRESTADO: ['prestado', 'prestados'],
  RESERVADO: ['apartado para traslado', 'apartados para traslado'],
  EN_MANTENIMIENTO: ['en mantenimiento', 'en mantenimiento'],
  'DAÑADO': ['dañado', 'dañados'],
  PERDIDO: ['perdido', 'perdidos'],
};
const contar = (e: string, n: number) => {
  const [uno, varios] = ESTADO_CONTADO[e] ?? [estado(e).toLowerCase(), estado(e).toLowerCase()];
  return plural(n, uno, varios);
};
const ordenados = (por: Record<string, number>) =>
  Object.entries(por).filter(([, n]) => n > 0)
    .sort((a, b) => (ORDEN_ESTADOS.indexOf(a[0]) + 1 || 99) - (ORDEN_ESTADOS.indexOf(b[0]) + 1 || 99));
/** "Todos disponibles" o "20 disponibles, 3 prestados y 1 dañado". */
const conteoEstados = (por: Record<string, number>) => {
  const total = Object.values(por).reduce((a, b) => a + b, 0);
  if (!total) return '—';
  if ((por['DISPONIBLE'] ?? 0) === total) return total === 1 ? 'Disponible' : 'Todos disponibles';
  const partes = ordenados(por).map(([e, n]) => contar(e, n));
  return partes.length < 2 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
};
const lugaresTexto = (l: string[]) =>
  !l.length ? '—' : l.length <= 3 ? l.join(', ') : `${l.slice(0, 3).join(', ')} y ${plural(l.length - 3, 'más', 'más')}`;

/** "Lo tiene prestado · debe volver el 15/10/2026" — por qué y hasta cuándo responde. */
function respondePor(u: ReporteUnidad | ReporteLote): string {
  const r = u.responsable;
  const base = r.origen === 'ASIGNACION' ? r.referencia ?? ETIQUETA_ORIGEN.ASIGNACION : ETIQUETA_ORIGEN[r.origen];
  if (r.origen === 'PRESTAMO' || r.origen === 'ASIGNACION') {
    return `${base}${r.desde ? ` · desde el ${fechaCorta(r.desde)}` : ''}${r.hasta ? ` · debe volver el ${fechaCorta(r.hasta)}` : ''}`;
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
  let n = 0;
  const sec = () => String(++n);
  const inf = await crearInformePdf({ marca: 'Materiales · SENA', tipo: 'Reporte general de materiales' });
  inf.encabezado(
    'Reporte general de materiales',
    'Todo lo que hay en el centro: qué es, dónde está y quién lo cuida',
    `${d.filtros}   ·   Generado el ${generadoTexto()}`,
  );
  inf.cifras([
    { valor: r.unidades.toLocaleString('es-CO'), etiqueta: 'Equipos y herramientas', detalle: `${r.disponibles.toLocaleString('es-CO')} disponibles` },
    { valor: r.prestadas.toLocaleString('es-CO'), etiqueta: 'Prestados', detalle: r.devolucionesVencidas ? plural(r.devolucionesVencidas, 'ya debía volver', 'ya debían volver') : undefined, color: r.devolucionesVencidas ? TINTA.alerta : undefined },
    { valor: r.novedad.toLocaleString('es-CO'), etiqueta: 'Con algún problema', color: r.novedad ? TINTA.error : undefined },
    { valor: r.productosConsumibles.toLocaleString('es-CO'), etiqueta: 'Material de consumo', detalle: 'tipos' },
  ]);
  const frase = fraseResumen(r);
  inf.nota('En pocas palabras', `${frase.titulo} ${frase.detalle}`);

  // ── Cómo están los equipos ──────────────────────────────────────────────
  if (r.unidades) {
    const por: Record<string, number> = {};
    for (const u of d.unidades) por[u.estado] = (por[u.estado] ?? 0) + 1;
    inf.seccion(sec(), 'Cómo están los equipos');
    inf.barras(ordenados(por).map(([e, v]) => ({
      etiqueta: estado(e), valor: v, pct: Math.round((v / r.unidades) * 100), color: COLOR_ESTADO[e],
    })));
  }

  // ── ¿Qué hay? ───────────────────────────────────────────────────────────
  inf.seccion(sec(), '¿Qué hay? — por material');
  if (d.porProducto.length) {
    inf.tabla(
      ['Material', 'Cuántos hay', 'Cómo están', 'Dónde están'],
      d.porProducto.map((p) => [
        `${p.producto}\n${p.tipo === 'CONSUMO' ? 'Material de consumo' : p.categoria ?? 'Equipo o herramienta'}`,
        p.tipo === 'EQUIPO' ? p.total.toLocaleString('es-CO') : cantidadConUnidad(p.cantidad, p.unidad),
        p.tipo === 'EQUIPO' ? conteoEstados(p.porEstado) : p.porVencer ? plural(p.porVencer, 'lote vence pronto', 'lotes vencen pronto') : 'Sin vencimientos cercanos',
        lugaresTexto(p.lugares),
      ]),
      {
        columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 52 } },
        didParseCell: (c: any) => {
          if (c.section !== 'body' || c.column.index !== 2) return;
          const p = d.porProducto[c.row.index];
          if (p.novedad) c.cell.styles.textColor = TINTA.error;
          else if (p.porVencer) c.cell.styles.textColor = TINTA.alerta;
        },
      },
    );
  } else {
    inf.vacio('No hay materiales con los filtros elegidos.');
  }

  // ── ¿Dónde está? ────────────────────────────────────────────────────────
  inf.seccion(sec(), '¿Dónde está? — por lugar');
  if (d.porUbicacion.length) {
    inf.tabla(
      ['Lugar', 'Encargado', 'Equipos', 'Cómo están', 'Consumo'],
      d.porUbicacion.map((g) => [
        `${g.sitio}${g.tipo ? `\n${tipoSitio(g.tipo)}` : ''}`, g.responsable ?? 'Nadie a cargo', g.unidades.length || '—',
        `${conteoEstados(g.porEstado)}${g.fueraDelSitio ? `\n(${plural(g.fueraDelSitio, 'está prestado', 'están prestados')} o en ficha)` : ''}`,
        g.lotes.length ? plural(g.lotes.length, 'lote', 'lotes') : '—',
      ]),
      {
        columnStyles: {
          0: { cellWidth: 38 }, 1: { cellWidth: 38 }, 2: { cellWidth: 18, halign: 'center', fontStyle: 'bold' }, 4: { cellWidth: 20, halign: 'center' },
        },
        didParseCell: (c: any) => {
          if (c.section === 'body' && c.column.index === 1 && !d.porUbicacion[c.row.index].responsable) {
            c.cell.styles.textColor = TINTA.error;
          }
        },
      },
    );
  } else {
    inf.vacio('Sin lugares.');
  }

  // ── ¿Quién responde? ────────────────────────────────────────────────────
  inf.seccion(sec(), '¿Quién responde? — por persona');
  if (d.porResponsable.length) {
    inf.tabla(
      ['Persona', 'Por qué responde', 'Equipos', 'Prestados', 'Consumo', 'Cómo están'],
      d.porResponsable.map((g) => [
        g.sinResponsable ? 'Nadie a cargo' : persona(g.nombre, g.documento),
        g.motivos.join('\n'),
        g.unidades.length,
        g.enPrestamo ? `${g.enPrestamo}${g.devolucionesVencidas ? ` (${g.devolucionesVencidas} atrasados)` : ''}` : '—',
        g.lotes.length || '—',
        conteoEstados(g.porEstado),
      ]),
      {
        columnStyles: {
          0: { cellWidth: 40, fontStyle: 'bold' }, 1: { cellWidth: 42 }, 2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 20, halign: 'center' },
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

  // ── Devoluciones atrasadas ──────────────────────────────────────────────
  const vencidas = d.unidades.filter((u) => devolucionVencida(u.responsable, hoy));
  if (vencidas.length) {
    inf.seccion(sec(), 'Préstamos que ya debían volver');
    inf.tabla(
      ['Placa', 'Qué es', 'Quién lo tiene', 'Debía volver el', 'Atraso'],
      vencidas.map((u) => [
        identificacion(u), u.producto, persona(u.responsable.nombre, u.responsable.documento),
        fechaCorta(u.responsable.hasta), plural(diasEntre(u.responsable.hasta!, hoy), 'día', 'días'),
      ]),
      { columnStyles: { 0: { cellWidth: 26 }, 3: { cellWidth: 28 }, 4: { cellWidth: 18, textColor: TINTA.error, fontStyle: 'bold' } } },
    );
  }

  // ── Lista de equipos ────────────────────────────────────────────────────
  // Los equipos con placa van uno por fila (son identificables); los que no
  // tienen placa e iguales en todo lo demás se juntan en una fila con su
  // cantidad — si no, 1.000 arduinos sin placa eran 40 páginas idénticas.
  const detalle = agruparDetalle(d.unidades);
  inf.seccion(sec(), `Lista de equipos (${d.unidades.length.toLocaleString('es-CO')})`);
  if (detalle.length) {
    inf.tabla(
      ['Placa', 'Cant.', 'Qué es', 'Estado', 'Dónde está', 'Quién responde', 'Por qué'],
      detalle.map(({ u, cantidad }) => [
        identificacion(u), cantidad, u.producto, estado(u.estado),
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
    inf.vacio('No hay equipos con los filtros elegidos.');
  }

  // ── Material de consumo ─────────────────────────────────────────────────
  inf.seccion(sec(), `Material de consumo (${plural(d.lotes.length, 'lote', 'lotes')})`);
  if (d.lotes.length) {
    inf.tabla(
      ['Material', 'Lote', 'Queda', 'Vence', 'Dónde está', 'Quién responde'],
      d.lotes.map((l) => [
        l.producto, l.codigo_lote ?? '—',
        `${cantidadConUnidad(l.cantidad_disponible, l.unidad_medida)}${l.cantidad_reservada ? `\n(${l.cantidad_reservada} apartado)` : ''}`,
        l.fecha_vencimiento ? fechaCorta(l.fecha_vencimiento) : 'No vence', l.sitio ?? 'Sin ubicación', persona(l.responsable.nombre, l.responsable.documento),
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
    inf.vacio('No hay material de consumo con los filtros elegidos.');
  }

  inf.terminar({ izquierda: `Reporte general de materiales  ·  ${d.filtros}`, derechaEncabezado: 'Reporte general de materiales' });
  inf.doc.save(`reporte-materiales-${hoy}.pdf`);
}

export async function exportarReporteMaterialesExcel(d: DatosReporteMateriales, xl: ExportService): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EPSAS';
  wb.created = new Date();
  const hoy = hoyIso();
  const sub = `${d.filtros}   ·   Generado el ${generadoTexto()}`;
  const pie = 'Reporte general de materiales · EPSAS';
  const r = d.resumen;

  // Resumen
  xl.hojaExcel(wb, 'Resumen', sub, pie,
    [{ titulo: 'Qué se cuenta', ancho: 46, tipo: 'negrita' }, { titulo: 'Cantidad', ancho: 14, tipo: 'numero' }],
    [
      ['Equipos y herramientas (se prestan y se devuelven)', r.unidades],
      ['  Disponibles', r.disponibles],
      ['  Prestados o entregados a una ficha', r.prestadas],
      ['  Ya debían volver', r.devolucionesVencidas],
      ['  Con algún problema (dañados, perdidos, en mantenimiento)', r.novedad],
      ['Material de consumo (tipos distintos)', r.productosConsumibles],
      ['  Lotes de material de consumo', r.lotes],
      ['Materiales sin nadie a cargo', r.sinResponsable],
      ['Personas que responden', r.responsables],
      ['Lugares', r.ubicaciones],
    ]);

  xl.hojaExcel(wb, 'Qué hay', sub, pie,
    [
      { titulo: 'Material', ancho: 36, tipo: 'negrita' }, { titulo: 'Tipo', ancho: 20 }, { titulo: 'Categoría', ancho: 18 },
      { titulo: 'Cuántos hay', ancho: 13, tipo: 'numero' }, { titulo: 'Unidad', ancho: 12 },
      { titulo: 'Disponibles', ancho: 12, tipo: 'numero' }, { titulo: 'Prestados', ancho: 11, tipo: 'numero' },
      { titulo: 'Con problema', ancho: 13, tipo: 'numero' }, { titulo: 'Cómo están', ancho: 40 }, { titulo: 'Dónde están', ancho: 40 },
    ],
    d.porProducto.map((p) => [
      p.producto, p.tipo === 'CONSUMO' ? 'Material de consumo' : 'Equipo o herramienta', p.categoria ?? '—',
      p.tipo === 'EQUIPO' ? p.total : p.cantidad, p.tipo === 'EQUIPO' ? 'unidades' : (p.unidad ?? '').toLowerCase(),
      p.tipo === 'EQUIPO' ? p.disponibles : '—', p.tipo === 'EQUIPO' ? p.prestados : '—', p.tipo === 'EQUIPO' ? p.novedad : '—',
      p.tipo === 'EQUIPO' ? conteoEstados(p.porEstado) : p.porVencer ? plural(p.porVencer, 'lote vence pronto', 'lotes vencen pronto') : 'Sin vencimientos cercanos',
      p.lugares.join(', '),
    ]),
    'No hay materiales con los filtros elegidos.');

  xl.hojaExcel(wb, 'Quién responde', sub, pie,
    [
      { titulo: 'Persona', ancho: 32, tipo: 'negrita' }, { titulo: 'Documento', ancho: 15 },
      { titulo: 'Por qué responde', ancho: 40 }, { titulo: 'Equipos', ancho: 11, tipo: 'numero' },
      { titulo: 'Prestados', ancho: 11, tipo: 'numero' }, { titulo: 'Atrasados', ancho: 11, tipo: 'numero' },
      { titulo: 'Lotes de consumo', ancho: 15, tipo: 'numero' }, { titulo: 'Cómo están', ancho: 44 },
    ],
    d.porResponsable.map((g) => [
      g.sinResponsable ? 'Nadie a cargo' : g.nombre, g.documento ?? '—', g.motivos.join(' · '), g.unidades.length, g.enPrestamo,
      g.devolucionesVencidas, g.lotes.length, conteoEstados(g.porEstado),
    ]));

  xl.hojaExcel(wb, 'Dónde está', sub, pie,
    [
      { titulo: 'Lugar', ancho: 28, tipo: 'negrita' }, { titulo: 'Tipo de lugar', ancho: 13 },
      { titulo: 'Encargado', ancho: 30 }, { titulo: 'Equipos', ancho: 11, tipo: 'numero' },
      { titulo: 'Disponibles', ancho: 12, tipo: 'numero' }, { titulo: 'Prestados (fuera)', ancho: 15, tipo: 'numero' },
      { titulo: 'Lotes de consumo', ancho: 15, tipo: 'numero' }, { titulo: 'Cómo están', ancho: 44 },
    ],
    d.porUbicacion.map((g) => [
      g.sitio, tipoSitio(g.tipo), g.responsable ?? 'Nadie a cargo', g.unidades.length,
      g.porEstado['DISPONIBLE'] ?? 0, g.fueraDelSitio, g.lotes.length, conteoEstados(g.porEstado),
    ]));

  const colsUnidad: ColXl[] = [
    { titulo: 'Placa SENA', ancho: 15 }, { titulo: 'SKU', ancho: 18 }, { titulo: 'Producto', ancho: 30, tipo: 'negrita' },
    { titulo: 'UNSPSC', ancho: 11 }, { titulo: 'Categoría', ancho: 16 }, { titulo: 'Estado', ancho: 16, tipo: 'estado' },
    { titulo: 'Dónde está', ancho: 22 }, { titulo: 'Tipo de lugar', ancho: 13 }, { titulo: 'Quién responde', ancho: 28 },
    { titulo: 'Documento', ancho: 14 }, { titulo: 'Por qué responde', ancho: 22 }, { titulo: 'Desde', ancho: 12, tipo: 'fecha' },
    { titulo: 'Debe volver', ancho: 12, tipo: 'fecha' }, { titulo: 'Atrasado', ancho: 9 },
  ];
  const wsU = xl.hojaExcel(wb, 'Lista de equipos', sub, pie, colsUnidad,
    d.unidades.map((u) => [
      u.placa_sena ?? '—', u.codigo_sku ?? '—', u.producto, u.codigo_unspsc ?? '—', u.categoria ?? '—', estado(u.estado),
      u.sitio ?? 'Sin ubicación', tipoSitio(u.sitio_tipo), u.responsable.nombre ?? 'Nadie a cargo', u.responsable.documento ?? '—',
      u.responsable.origen === 'ASIGNACION' ? u.responsable.referencia ?? 'Asignación' : ETIQUETA_ORIGEN[u.responsable.origen],
      fechaXl(u.responsable.desde), fechaXl(u.responsable.hasta), devolucionVencida(u.responsable, hoy) ? 'Sí' : '',
    ]),
    'No hay equipos con los filtros elegidos.');
  // Colores de estado propios de Materiales (los genéricos son de prácticas).
  d.unidades.forEach((u, i) => {
    const c = wsU.getRow(5 + i).getCell(6);
    const rgb = COLOR_ESTADO[u.estado];
    if (rgb) c.font = { ...(c.font ?? {}), bold: true, color: { argb: 'FF' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase() } };
    if (u.responsable.origen === 'SIN_RESPONSABLE') wsU.getRow(5 + i).getCell(9).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
    if (devolucionVencida(u.responsable, hoy)) wsU.getRow(5 + i).getCell(14).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB45309' } };
  });
  wsU.views = [{ state: 'frozen', ySplit: 4, xSplit: 1, showGridLines: false }];

  xl.hojaExcel(wb, 'Material de consumo', sub, pie,
    [
      { titulo: 'Material', ancho: 30, tipo: 'negrita' }, { titulo: 'UNSPSC', ancho: 11 }, { titulo: 'Lote', ancho: 14 },
      { titulo: 'Queda', ancho: 12, tipo: 'numero' }, { titulo: 'Apartado', ancho: 11, tipo: 'numero' },
      { titulo: 'Unidad', ancho: 12 }, { titulo: 'Llegó', ancho: 12, tipo: 'fecha' }, { titulo: 'Vence', ancho: 12, tipo: 'fecha' },
      { titulo: 'Dónde está', ancho: 22 }, { titulo: 'Quién responde', ancho: 28 }, { titulo: 'Documento', ancho: 14 },
    ],
    d.lotes.map((l) => [
      l.producto, l.codigo_unspsc ?? '—', l.codigo_lote ?? '—', l.cantidad_disponible, l.cantidad_reservada, l.unidad_medida,
      fechaXl(l.fecha_ingreso), fechaXl(l.fecha_vencimiento), l.sitio ?? 'Sin ubicación',
      l.responsable.nombre ?? 'Nadie a cargo', l.responsable.documento ?? '—',
    ]),
    'No hay material de consumo con los filtros elegidos.');

  await xl.descargarExcel(wb, `reporte-materiales-${hoy}.xlsx`);
}
