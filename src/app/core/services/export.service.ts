import { Injectable } from '@angular/core';
// Solo tipos: ExcelJS (~920 kB) se carga con `import()` dentro de cada
// exportación — importado acá viajaba con Inicio, la primera pantalla de todos.
import type * as ExcelJS from 'exceljs';
import { Stats, DonaStats, categorizarEstado } from './stats.service';
import { ResultadoConsulta } from '../../shared/models/estudiante.model';
import { crearInformePdf, TINTA, RGB, fechaInforme, hoyLocal } from '../../shared/utils/informe-pdf';
import { agregarGraficosNativos } from '../utils/excel-graficos';

/**
 * Datos del panel de inicio para exportar. Las imágenes de los gráficos ya no
 * se usan (el PDF dibuja los suyos en vectores y el Excel usa barras de datos),
 * pero se aceptan para no romper a quien las siga mandando.
 */
export interface GraficosExport {
  imgEstados?: string;
  imgEvolucion?: string;
  estadosResumen?: Array<{
    key: string; label: string; total: number; porcentaje: number;
    icon: string; color: string; bg: string;
  }>;
  /** Evolución mensual acumulada (activas / certificadas). */
  evolucionMensual?: {
    labels: string[];
    activas: number[];
    certificadas: number[];
  };
}

// ── Estilo común de los Excel (mismo lenguaje que los PDF de informe) ───────
const XL = {
  TX: 'FF1F2937', GRIS: 'FF6B7280', TENUE: 'FF9CA3AF', LINEA: 'FFE5E7EB',
  LINEA_F: 'FFD1D5DB', SUAVE: 'FFF9FAFB', ACENTO: 'FF2D6A0F',
};
const COLOR_ESTADO_XL: Record<string, string> = {
  aprobado: 'FF15803D', aprobada: 'FF15803D', activo: 'FF1D4ED8', activa: 'FF1D4ED8', 'en curso': 'FF1D4ED8', en_curso: 'FF1D4ED8',
  'en proceso': 'FF1D4ED8', completado: 'FF15803D', completada: 'FF15803D', certificado: 'FF15803D', certificada: 'FF15803D',
  finalizada: 'FF15803D', finalizado: 'FF15803D', pendiente: 'FFB45309', suspendido: 'FFB45309', suspendida: 'FFB45309',
  condicionado: 'FFB45309', condicionada: 'FFB45309', reprobado: 'FFB91C1C', rechazada: 'FFB91C1C', cancelada: 'FFB91C1C',
  cancelado: 'FFB91C1C', desertado: 'FFB91C1C', desertada: 'FFB91C1C', desercion: 'FFB91C1C', 'deserción': 'FFB91C1C',
  retirado: 'FFB91C1C', retirada: 'FFB91C1C', 'retiro voluntario': 'FFB91C1C', inactivo: 'FF6B7280',
};
const fuenteXl = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: 'Calibri', size: 10, color: { argb: XL.TX }, ...o });

/** Fecha como fecha de Excel. AAAA-MM-DD se toma tal cual: ExcelJS escribe en UTC y una fecha local se correría un día. */
export function fechaXl(v?: string | null): Date | string {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export type ColXl = { titulo: string; ancho: number; tipo?: 'fecha' | 'numero' | 'estado' | 'negrita' | 'porcentaje' };

/** "activo" → "Activo", "en_curso" → "En curso". */
function etiquetaEstado(e?: string | null): string {
  const t = String(e ?? '').trim().replace(/_/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '—';
}

/** Color del estado de una práctica en el PDF (texto, nunca fondo). */
function colorPractica(estado?: string | null): RGB {
  switch (categorizarEstado(estado)) {
    case 'activa': return TINTA.info;
    case 'certificada': return TINTA.ok;
    case 'desertada': return TINTA.error;
    case 'enRiesgo': return TINTA.alerta;
    default: return TINTA.gris;
  }
}

/** Una práctica que el coordinador debería mirar ya. */
export interface Atencion {
  prioridad: 'Alta' | 'Media';
  nombre: string;
  identificacion: string;
  programa: string;
  ficha: string;
  empresa: string;
  estado: string;
  motivo: string;
  avance: number | null;
  dias: number | null;
}

/** Todo lo que muestran el PDF y el Excel del panel, calculado una sola vez. */
export interface ResumenPanel {
  total: number;
  pct: { activas: number; certificadas: number; desertadas: number; enRiesgo: number; otros: number };
  otros: number;
  casosResueltos: number;
  tasaExito: number;
  distribucion: { etiqueta: string; valor: number; pct: number; color: RGB; argb: string }[];
  hallazgos: { fuerte?: string; texto: string }[];
  atencion: Atencion[];
  ritmo: { labels: string[]; inicios: number[]; cierres: number[]; actual: number };
  porPrograma: { programa: string; total: number; activas: number; certificadas: number; desertadas: number; enRiesgo: number; tasa: number | null }[];
  porEmpresa: { empresa: string; total: number; activas: number; certificadas: number; desertadas: number }[];
  practicas: any[];
}

const DIA_MS = 86_400_000;
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Días desde hoy (local) hasta la fecha; negativo si ya pasó. null si no hay fecha. */
function diasHasta(valor?: string | null): number | null {
  const f = fechaXl(valor);
  if (!(f instanceof Date)) return null;
  const h = new Date();
  return Math.round((f.getTime() - Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())) / DIA_MS);
}

@Injectable({ providedIn: 'root' })
export class ExportService {

  resumenPanel(stats: Stats, practicas: any[], _graficos?: GraficosExport): ResumenPanel {
    const total = Math.max(stats.aprendices, 0);
    const base = Math.max(total, 1);
    const pc = (n: number) => Math.round((n / base) * 100);
    const n = (v: number) => v.toLocaleString('es-CO');
    const otros = Math.max(0, total - stats.activas - stats.certificadas - stats.desertadas - stats.enRiesgo);
    // Tasa de éxito solo sobre casos ya RESUELTOS (certificadas vs. desertadas):
    // las activas todavía no tienen resultado.
    const casosResueltos = stats.certificadas + stats.desertadas;
    const tasaExito = casosResueltos > 0 ? Math.round((stats.certificadas / casosResueltos) * 100) : 0;
    const nombreProg = (p: any) => (p.programa && p.programa !== '—' ? p.programa : 'Sin programa');
    const nombreEmp = (p: any) => (p.empresaNombre && p.empresaNombre !== '—' ? p.empresaNombre : 'Sin empresa');

    // ── Por programa / por empresa ──────────────────────────────────────────
    const progs = new Map<string, ResumenPanel['porPrograma'][number]>();
    const emps = new Map<string, ResumenPanel['porEmpresa'][number]>();
    for (const p of practicas) {
      const cat = categorizarEstado(p.estado);
      const fp = progs.get(nombreProg(p)) ?? { programa: nombreProg(p), total: 0, activas: 0, certificadas: 0, desertadas: 0, enRiesgo: 0, tasa: null };
      const fe = emps.get(nombreEmp(p)) ?? { empresa: nombreEmp(p), total: 0, activas: 0, certificadas: 0, desertadas: 0 };
      fp.total++; fe.total++;
      if (cat === 'activa') { fp.activas++; fe.activas++; }
      else if (cat === 'certificada') { fp.certificadas++; fe.certificadas++; }
      else if (cat === 'desertada') { fp.desertadas++; fe.desertadas++; }
      else if (cat === 'enRiesgo') fp.enRiesgo++;
      progs.set(fp.programa, fp);
      emps.set(fe.empresa, fe);
    }
    const porPrograma = [...progs.values()]
      .map((f) => ({ ...f, tasa: f.certificadas + f.desertadas > 0 ? Math.round((f.certificadas / (f.certificadas + f.desertadas)) * 100) : null }))
      .sort((a, b) => b.total - a.total || a.programa.localeCompare(b.programa, 'es'));
    const porEmpresa = [...emps.values()].sort((a, b) => b.total - a.total || a.empresa.localeCompare(b.empresa, 'es'));

    // ── Requieren atención ──────────────────────────────────────────────────
    const atencion: Atencion[] = [];
    for (const p of practicas) {
      const cat = categorizarEstado(p.estado);
      const dias = diasHasta(p.fecha_fin);
      const avance = typeof p.avance === 'number' ? p.avance : null;
      const fila = {
        nombre: p.nombre ?? '—', identificacion: String(p.identificacion ?? p.documento ?? '—'), programa: nombreProg(p),
        ficha: p.ficha ?? '—', empresa: nombreEmp(p), estado: etiquetaEstado(p.estado), avance, dias,
      };
      if (cat === 'enRiesgo') {
        atencion.push({ ...fila, prioridad: 'Alta', motivo: `Estado «${fila.estado}»: requiere seguimiento del coordinador.` });
      } else if (cat === 'activa' && dias !== null && dias < 0) {
        atencion.push({ ...fila, prioridad: 'Alta', motivo: `La fecha de fin pasó hace ${-dias} ${dias === -1 ? 'día' : 'días'} y sigue activa, sin certificar.` });
      } else if (cat === 'activa' && dias !== null && dias <= 30 && (avance ?? 0) < 70) {
        atencion.push({ ...fila, prioridad: 'Media', motivo: `Termina en ${dias} ${dias === 1 ? 'día' : 'días'} con ${avance ?? 0}% de avance.` });
      }
    }
    atencion.sort((a, b) => (a.prioridad === b.prioridad ? (a.dias ?? 0) - (b.dias ?? 0) : a.prioridad === 'Alta' ? -1 : 1));

    // ── Ritmo: inicios y cierres previstos, de 6 meses atrás a 5 adelante ──
    const hoy = new Date();
    const meses = Array.from({ length: 12 }, (_, i) => new Date(hoy.getFullYear(), hoy.getMonth() - 6 + i, 1));
    const claveMes = (d: Date) => d.getFullYear() * 12 + d.getMonth();
    const indice = new Map(meses.map((d, i) => [claveMes(d), i]));
    const inicios = new Array(12).fill(0);
    const cierres = new Array(12).fill(0);
    for (const p of practicas) {
      const a = fechaXl(p.fecha_inicio);
      const b = fechaXl(p.fecha_fin);
      if (a instanceof Date) { const i = indice.get(a.getUTCFullYear() * 12 + a.getUTCMonth()); if (i !== undefined) inicios[i]++; }
      if (b instanceof Date) { const i = indice.get(b.getUTCFullYear() * 12 + b.getUTCMonth()); if (i !== undefined) cierres[i]++; }
    }
    const ritmo = {
      labels: meses.map((d) => `${MESES_CORTOS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`),
      inicios, cierres, actual: 6,
    };

    // ── Hallazgos: frases calculadas, lo primero que un coordinador quiere saber ──
    const hallazgos: { fuerte?: string; texto: string }[] = [];
    if (casosResueltos > 0) {
      hallazgos.push({ fuerte: `${tasaExito}%`, texto: `de los casos resueltos terminó en certificación (${n(stats.certificadas)} de ${n(casosResueltos)}).` });
    }
    const vencidas = atencion.filter((a) => a.motivo.startsWith('La fecha de fin pasó')).length;
    if (vencidas) hallazgos.push({ fuerte: `${n(vencidas)} ${vencidas === 1 ? 'práctica sigue' : 'prácticas siguen'}`, texto: 'activas con la fecha de fin vencida y sin certificar.' });
    if (stats.enRiesgo > 0) hallazgos.push({ fuerte: `${n(stats.enRiesgo)}`, texto: `${stats.enRiesgo === 1 ? 'práctica está suspendida o condicionada' : 'prácticas están suspendidas o condicionadas'} y requieren seguimiento.` });
    const desertTotal = porPrograma.reduce((t, p) => t + p.desertadas, 0);
    const peorDesercion = [...porPrograma].sort((a, b) => b.desertadas - a.desertadas)[0];
    if (peorDesercion && peorDesercion.desertadas > 0 && porPrograma.length > 1) {
      hallazgos.push({ fuerte: peorDesercion.programa, texto: `concentra ${peorDesercion.desertadas} de las ${desertTotal} deserciones (${Math.round((peorDesercion.desertadas / desertTotal) * 100)}%).` });
    }
    const mejor = porPrograma
      .filter((p) => p.tasa !== null && p.certificadas + p.desertadas >= 3)
      .sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0) || b.total - a.total)[0];
    if (mejor && mejor.programa !== peorDesercion?.programa) hallazgos.push({ fuerte: mejor.programa, texto: `tiene la mejor tasa de éxito: ${mejor.tasa}%.` });
    const proximas = practicas.filter((p) => { const d = diasHasta(p.fecha_fin); return categorizarEstado(p.estado) === 'activa' && d !== null && d >= 0 && d <= 30; }).length;
    if (proximas) hallazgos.push({ fuerte: `${n(proximas)} ${proximas === 1 ? 'práctica termina' : 'prácticas terminan'}`, texto: 'en los próximos 30 días.' });
    const empTop = porEmpresa.find((e) => e.empresa !== 'Sin empresa');
    if (empTop && empTop.total > 1) hallazgos.push({ fuerte: empTop.empresa, texto: `es la empresa con más aprendices (${empTop.total}).` });
    if (!hallazgos.length) hallazgos.push({ texto: 'Todavía no hay suficientes datos para destacar tendencias.' });

    const tono = (rgb: RGB) => 'FF' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    const OTROS: RGB = [203, 213, 225];
    return {
      total,
      pct: { activas: pc(stats.activas), certificadas: pc(stats.certificadas), desertadas: pc(stats.desertadas), enRiesgo: pc(stats.enRiesgo), otros: pc(otros) },
      otros, casosResueltos, tasaExito,
      distribucion: [
        { etiqueta: 'En etapa productiva', valor: stats.activas, pct: pc(stats.activas), color: TINTA.info, argb: tono(TINTA.info) },
        { etiqueta: 'Certificadas', valor: stats.certificadas, pct: pc(stats.certificadas), color: TINTA.ok, argb: tono(TINTA.ok) },
        { etiqueta: 'Desertadas', valor: stats.desertadas, pct: pc(stats.desertadas), color: TINTA.error, argb: tono(TINTA.error) },
        { etiqueta: 'En riesgo', valor: stats.enRiesgo, pct: pc(stats.enRiesgo), color: TINTA.alerta, argb: tono(TINTA.alerta) },
        { etiqueta: 'Otros estados', valor: otros, pct: pc(otros), color: OTROS, argb: tono(OTROS) },
      ],
      hallazgos: hallazgos.slice(0, 6),
      atencion, ritmo, porPrograma, porEmpresa,
      practicas: [...practicas].sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es')),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PANEL DE INICIO — PDF
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * Reporte estadístico del panel de inicio (estilo común de informes,
   * 2026-10-01). Página 1: cifras, dona de distribución y hallazgos
   * calculados. Después: prácticas que requieren atención (lo accionable),
   * ritmo de inicios y cierres, resultados por programa y por empresa, y el
   * listado completo con barra de avance. Los gráficos son vectoriales.
   */
  async exportarPDF(
    stats: Stats,
    _etapaActiva: DonaStats,
    _etapaCertificada: DonaStats,
    practicas: any[],
    graficos?: GraficosExport,
  ): Promise<void> {
    const r = this.resumenPanel(stats, practicas, graficos);
    const inf = await crearInformePdf({ marca: 'Etapa productiva · SENA', tipo: 'Reporte estadístico' });
    const { mg, ancho } = inf;
    const hoy = new Date();
    const fechaLarga = hoy.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    inf.encabezado('Panel de control', 'Estado de la etapa productiva de los aprendices', `Generado el ${fechaLarga}`);

    const colorTasa: RGB = r.casosResueltos === 0 ? TINTA.texto : r.tasaExito >= 80 ? TINTA.ok : r.tasaExito >= 60 ? TINTA.alerta : TINTA.error;
    inf.cifras([
      { valor: r.total.toLocaleString('es-CO'), etiqueta: 'Aprendices' },
      { valor: stats.activas.toLocaleString('es-CO'), etiqueta: 'En etapa productiva', detalle: `${r.pct.activas}%` },
      { valor: stats.certificadas.toLocaleString('es-CO'), etiqueta: 'Certificadas', detalle: `${r.pct.certificadas}%` },
      { valor: r.casosResueltos ? `${r.tasaExito}%` : '—', etiqueta: 'Tasa de éxito', detalle: r.casosResueltos ? `de ${r.casosResueltos}` : undefined, color: colorTasa },
    ]);

    // ── Distribución (dona) + hallazgos, lado a lado ────────────────────────
    const yBloque = inf.y + 2;
    const radio = 21;
    const cx = mg + radio + 1;
    const cy = yBloque + radio + 6;
    inf.texto('DISTRIBUCIÓN', mg, yBloque, { size: 7, bold: true, color: TINTA.gris });
    inf.dona(cx, cy, radio, 7.5, r.distribucion.map((d) => ({ valor: d.valor, color: d.color })),
      { valor: r.total.toLocaleString('es-CO'), etiqueta: 'aprendices' });
    let ly = cy + radio + 8;
    r.distribucion.forEach((d) => {
      inf.doc.setFillColor(...d.color);
      inf.doc.roundedRect(mg, ly - 2.5, 2.8, 2.8, 0.6, 0.6, 'F');
      inf.texto(d.etiqueta, mg + 4.5, ly, { size: 7.8 });
      inf.texto(`${d.valor}`, mg + 50, ly, { size: 7.8, bold: true, align: 'right' });
      inf.texto(`${d.pct}%`, mg + 60, ly, { size: 7.4, color: TINTA.gris, align: 'right' });
      ly += 4.6;
    });

    const xH = mg + 70;
    const anchoH = ancho - 70;
    inf.doc.setFillColor(...TINTA.suave);
    inf.texto('HALLAZGOS', xH + 5, yBloque, { size: 7, bold: true, color: TINTA.acento });
    inf.y = yBloque + 7;
    const finH = inf.vinetas(r.hallazgos, xH + 5, anchoH - 8);
    inf.doc.setDrawColor(...TINTA.linea).setLineWidth(0.2);
    inf.doc.line(xH, yBloque - 3, xH, Math.max(finH, ly) - 2);
    inf.y = Math.max(finH, ly) + 6;

    // ── 1. Requieren atención ───────────────────────────────────────────────
    inf.seccion('1', `Requieren atención (${r.atencion.length})`);
    if (r.atencion.length) {
      inf.tabla(['Prioridad', 'Aprendiz', 'Programa · ficha', 'Motivo', 'Avance'],
        r.atencion.map((a) => [a.prioridad, `${a.nombre}\nC.C. ${a.identificacion}`, `${a.programa}\nFicha ${a.ficha}`, a.motivo, a.avance === null ? '—' : `${a.avance}%`]),
        {
          styles: { fontSize: 8, cellPadding: { top: 2.3, bottom: 2.3, left: 1.8, right: 1.8 } },
          columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 1: { cellWidth: 38 }, 2: { cellWidth: 42 }, 4: { cellWidth: 16, halign: 'right' } },
          didParseCell: (d: any) => {
            if (d.section === 'head' && d.column.index === 4) d.cell.styles.halign = 'right';
            if (d.section === 'body' && d.column.index === 0) d.cell.styles.textColor = d.cell.raw === 'Alta' ? TINTA.error : TINTA.alerta;
          },
        });
    } else {
      inf.texto('Ninguna práctica requiere atención inmediata.', mg, inf.y + 1, { size: 9, bold: true, color: TINTA.ok });
      inf.y += 8;
    }

    // ── 2. Ritmo ────────────────────────────────────────────────────────────
    inf.seccion('2', 'Ritmo de la etapa productiva', 80);
    inf.columnas(r.ritmo.labels, [
      { nombre: 'Inicios', valores: r.ritmo.inicios, color: TINTA.acento },
      { nombre: 'Cierres previstos (fecha de fin)', valores: r.ritmo.cierres, color: [148, 163, 184] },
    ], 54, r.ritmo.actual);
    inf.texto('Seis meses atrás y cinco adelante; el mes actual va resaltado.', mg, inf.y - 1, { size: 7.4, italic: true, color: TINTA.tenue });
    inf.y += 5;

    // ── 3. Por programa ─────────────────────────────────────────────────────
    inf.seccion('3', 'Resultados por programa');
    if (r.porPrograma.length) {
      inf.tabla(['Programa', 'Aprendices', 'Activas', 'Certificadas', 'Desertadas', 'Tasa de éxito'],
        r.porPrograma.map((p) => [p.programa, p.total, p.activas, p.certificadas, p.desertadas, p.tasa === null ? '—' : `${p.tasa}%`]),
        {
          columnStyles: {
            1: { cellWidth: 21, halign: 'center' }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 25, halign: 'center' },
            4: { cellWidth: 23, halign: 'center' }, 5: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
          },
          didParseCell: (d: any) => {
            if (d.section === 'head' && d.column.index >= 1) d.cell.styles.halign = 'center';
            if (d.section === 'body' && d.column.index === 5) {
              const t = r.porPrograma[d.row.index]?.tasa;
              d.cell.styles.textColor = t === null || t === undefined ? TINTA.tenue : t >= 80 ? TINTA.ok : t >= 60 ? TINTA.alerta : TINTA.error;
            }
            if (d.section === 'body' && d.column.index === 4 && r.porPrograma[d.row.index]?.desertadas > 0) d.cell.styles.textColor = TINTA.error;
          },
        });
    } else {
      inf.vacio('No hay prácticas registradas.');
    }

    // ── 4. Empresas ─────────────────────────────────────────────────────────
    const empresas = r.porEmpresa.slice(0, 10);
    inf.seccion('4', r.porEmpresa.length > 10 ? 'Empresas con más aprendices (10 primeras)' : 'Empresas');
    if (empresas.length) {
      inf.tabla(['Empresa', 'Aprendices', 'Activas', 'Certificadas', 'Desertadas'],
        empresas.map((e) => [e.empresa, e.total, e.activas, e.certificadas, e.desertadas]),
        {
          columnStyles: { 0: { fontStyle: 'bold' }, 1: { cellWidth: 21, halign: 'center' }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 25, halign: 'center' }, 4: { cellWidth: 23, halign: 'center' } },
          didParseCell: (d: any) => { if (d.section === 'head' && d.column.index >= 1) d.cell.styles.halign = 'center'; },
        });
    } else {
      inf.vacio('No hay empresas registradas.');
    }

    // ── 5. Listado con barra de avance ──────────────────────────────────────
    inf.seccion('5', `Listado de prácticas (${r.practicas.length})`);
    if (r.practicas.length) {
      inf.tabla(['Aprendiz', 'Programa · ficha', 'Empresa', 'Estado', 'Fin', 'Avance'],
        r.practicas.map((p: any) => [
          `${p.nombre ?? '—'}\nC.C. ${p.identificacion ?? p.documento ?? '—'}`,
          `${p.programa ?? '—'}\nFicha ${p.ficha ?? '—'}`, p.empresaNombre ?? '—', etiquetaEstado(p.estado),
          fechaInforme(p.fecha_fin), '',
        ]),
        {
          styles: { fontSize: 7.8, cellPadding: { top: 2.2, bottom: 2.2, left: 1.8, right: 1.8 } },
          columnStyles: { 0: { cellWidth: 38 }, 3: { cellWidth: 21, fontStyle: 'bold' }, 4: { cellWidth: 21 }, 5: { cellWidth: 26 } },
          didParseCell: (d: any) => {
            if (d.section === 'body' && d.column.index === 3) d.cell.styles.textColor = colorPractica(r.practicas[d.row.index]?.estado);
          },
          // Barra de avance dibujada en la celda (la celda va vacía).
          didDrawCell: (d: any) => {
            if (d.section !== 'body' || d.column.index !== 5) return;
            const av = r.practicas[d.row.index]?.avance;
            if (typeof av !== 'number') {
              inf.texto('—', d.cell.x + 2, d.cell.y + d.cell.padding('top') + 2.6, { size: 7.8, color: TINTA.tenue });
              return;
            }
            // Barra y porcentaje sobre la misma línea que el texto de la fila (arriba, no al centro).
            const w = 13, h = 1.8;
            const base = d.cell.y + d.cell.padding('top') + 2.6;
            const x = d.cell.x + 2, y = base - h / 2 - 0.9;
            inf.doc.setFillColor(...TINTA.linea);
            inf.doc.roundedRect(x, y, w, h, 0.5, 0.5, 'F');
            const p = Math.max(0, Math.min(100, av));
            if (p > 0) {
              inf.doc.setFillColor(...(p >= 70 ? TINTA.acento : p >= 40 ? TINTA.alerta : TINTA.error));
              inf.doc.roundedRect(x, y, Math.max((w * p) / 100, 0.8), h, 0.5, 0.5, 'F');
            }
            inf.texto(`${p}%`, d.cell.x + d.cell.width - 1.8, base, { size: 7.4, color: TINTA.gris, align: 'right' });
          },
        });
    } else {
      inf.vacio('No hay prácticas registradas.');
    }

    inf.terminar({ izquierda: 'Panel de control · Etapa productiva', derechaEncabezado: 'Panel de control' });
    inf.doc.save(`panel-etapa-productiva-${hoyLocal(hoy)}.pdf`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PANEL DE INICIO — EXCEL
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * Excel del panel de inicio, clásico y organizado (2026-10-06): Resumen,
   * Por programa, Por empresa, Requieren atención y Prácticas (tabla de Excel
   * con filtros). Las estadísticas son fórmulas sobre la hoja Prácticas.
   */
  async exportarExcel(
    stats: Stats,
    _etapaActiva: DonaStats,
    _etapaCertificada: DonaStats,
    practicas: any[],
    graficos?: GraficosExport,
  ): Promise<void> {
    // Excel del panel con el lenguaje del reporte impreso (2026-10-06):
    // franja de encabezado, resumen ejecutivo y hallazgos ESCRITOS CON
    // FÓRMULAS, cifras con barras, secciones numeradas, gráficos NATIVOS de
    // Excel y notas. Todo sale de la hoja «Prácticas» (tabla de Excel): si se
    // corrige o agrega una fila, cifras, textos y gráficos se recalculan.
    // FIXED() en vez de TEXT(): respeta los separadores del Excel de quien abre.
    const r = this.resumenPanel(stats, practicas, graficos);
    const XLS = await import('exceljs');
    const wb = new XLS.Workbook();
    wb.creator = 'EPSAS';
    wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };
    const fechaCorte = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    const centro = (() => { try { const s = localStorage.getItem('tenantSlug') ?? ''; return s ? `Centro ${s.charAt(0).toUpperCase()}${s.slice(1)}` : 'Centro de formación'; } catch { return 'Centro de formación'; } })();
    const autor = (() => { try { return JSON.parse(localStorage.getItem('user') ?? '{}').nombre || 'el sistema'; } catch { return 'el sistema'; } })();

    // ── Paleta y estilos ────────────────────────────────────────────────────
    const C = {
      banda: 'FF1F5F0C', acento: 'FF39A900', claro: 'FFB9E6A6', texto: 'FF111827', gris: 'FF6B7280', tenue: 'FF9CA3AF',
      linea: 'FFE5E7EB', lineaF: 'FF111827', suave: 'FFF7F8F9', zebra: 'FFFAFAFB', blanco: 'FFFFFFFF',
      activa: 'FF2563EB', cert: 'FF16A34A', des: 'FFDC2626', riesgo: 'FFD97706', otros: 'FF9CA3AF',
    };
    const fnt = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: 'Calibri', size: 10.5, color: { argb: C.texto }, ...o });
    const solido = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const linea = (argb = C.linea, style: ExcelJS.BorderStyle = 'thin') => ({ style, color: { argb } });
    const letra = (n: number) => String.fromCharCode(64 + n);

    const nuevaHoja = (nombre: string, anchos: number[], horizontal = false) => {
      const ws = wb.addWorksheet(nombre, {
        views: [{ showGridLines: false }],
        pageSetup: { paperSize: 9, orientation: horizontal ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
          margins: { left: 0.45, right: 0.45, top: 0.55, bottom: 0.6, header: 0.3, footer: 0.3 } },
        headerFooter: { oddFooter: `&L&8&K9CA3AFPanel de control · Etapa productiva · ${centro}&R&8&K9CA3AFPágina &P de &N` },
      });
      ws.columns = anchos.map((width) => ({ width }));
      return ws;
    };
    /** Franja verde de título en las hojas de datos. */
    const bandaHoja = (ws: ExcelJS.Worksheet, titulo: string, descripcion: string, ncols: number) => {
      const fin = letra(ncols);
      ws.mergeCells(`A1:${fin}1`);
      ws.getCell('A1').value = titulo;
      ws.getCell('A1').font = fnt({ size: 15, bold: true, color: { argb: C.blanco } });
      ws.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
      ws.mergeCells(`A2:${fin}2`);
      ws.getCell('A2').value = `${descripcion}   ·   Corte: ${fechaCorte}`;
      ws.getCell('A2').font = fnt({ size: 9.5, color: { argb: C.claro } });
      ws.getCell('A2').alignment = { vertical: 'middle', indent: 1 };
      for (let c = 1; c <= ncols; c++) {
        ws.getRow(1).getCell(c).fill = solido(C.banda);
        ws.getRow(2).getCell(c).fill = solido(C.banda);
        ws.getRow(2).getCell(c).border = { bottom: linea(C.acento, 'thick') };
      }
      ws.getRow(1).height = 28;
      ws.getRow(2).height = 18;
    };
    /** Encabezado de tabla: mayúsculas pequeñas, línea abajo. */
    const encabezado = (ws: ExcelJS.Worksheet, fila: number, textos: string[], derecha: number[] = []) => {
      textos.forEach((t, i) => {
        const c = ws.getRow(fila).getCell(i + 1);
        c.value = t.toUpperCase();
        c.font = fnt({ size: 8.5, bold: true, color: { argb: C.gris } });
        c.fill = solido(C.suave);
        c.border = { bottom: linea('FFD1D5DB', 'medium') };
        c.alignment = { vertical: 'middle', horizontal: derecha.includes(i) ? 'right' : 'left', indent: derecha.includes(i) ? 0 : 1 };
      });
      ws.getRow(fila).height = 22;
    };
    const fila = (ws: ExcelJS.Worksheet, n: number, valores: any[], o: { fmt?: Record<number, string>; derecha?: number[]; negrita?: number[]; zebra?: boolean } = {}) => {
      const rw = ws.getRow(n);
      rw.height = 20;
      valores.forEach((v, i) => {
        const c = rw.getCell(i + 1);
        c.value = v;
        c.font = fnt({ bold: o.negrita?.includes(i) });
        c.border = { bottom: linea() };
        c.alignment = { vertical: 'middle', wrapText: true, horizontal: o.derecha?.includes(i) ? 'right' : 'left', indent: o.derecha?.includes(i) ? 0 : 1 };
        if (o.fmt?.[i]) c.numFmt = o.fmt[i];
        if (o.zebra) c.fill = solido(C.zebra);
      });
      return rw;
    };
    const barraDatos = (ws: ExcelJS.Worksheet, ref: string, argb: string, maximo?: number) => ws.addConditionalFormatting({
      ref,
      rules: [{ type: 'dataBar', priority: 1, gradient: false, minLength: 0, maxLength: 100,
        cfvo: [{ type: 'num', value: 0 }, maximo === undefined ? { type: 'max' } : { type: 'num', value: maximo }], color: { argb } } as any],
    });

    // ── Base: hoja «Prácticas» (se crea después; sus columnas son fijas) ─────
    const SITUACION: Record<string, string> = { activa: 'Activa', certificada: 'Certificada', desertada: 'Desertada', enRiesgo: 'En riesgo' };
    const situacion = (p: any) => SITUACION[categorizarEstado(p.estado)] ?? 'Otro';
    const filasP = r.practicas;
    const P0 = 5;
    const PN = 5000; // rango amplio: las fórmulas siguen contando si se agregan filas
    const col = (L: string) => `'Prácticas'!$${L}$${P0}:$${L}$${PN}`;
    const SIT = col('G'), PROG = col('D'), EMP = col('E'), INI = col('H'), FIN = col('I'), DIAS = col('J'), APR = col('A');

    const cuenta = (cat: string) => filasP.filter((p: any) => situacion(p) === cat).length;
    const n = { total: filasP.length, activa: cuenta('Activa'), cert: cuenta('Certificada'), des: cuenta('Desertada'), riesgo: cuenta('En riesgo') };
    const otros = n.total - n.activa - n.cert - n.des - n.riesgo;
    const resueltos = n.cert + n.des;
    const tasa = resueltos ? n.cert / resueltos : null;
    const proximas = filasP.filter((p: any) => { const d = diasHasta(p.fecha_fin); return situacion(p) === 'Activa' && d !== null && d >= 0 && d <= 30; }).length;
    const vencidas = filasP.filter((p: any) => { const d = diasHasta(p.fecha_fin); return situacion(p) === 'Activa' && d !== null && d < 0; }).length;
    const miles = (v: number) => v.toLocaleString('es-CO');

    // ══ Resumen (primera hoja creada → sheet1.xml, ahí van los gráficos) ════
    const ws = nuevaHoja('Resumen', [42, 17, 17, 46]);

    // Franja de encabezado
    ws.mergeCells('A1:C1'); ws.getCell('A1').value = 'REPORTE ESTADÍSTICO · ETAPA PRODUCTIVA';
    ws.getCell('A1').font = fnt({ size: 8.5, bold: true, color: { argb: C.claro } });
    ws.mergeCells('A2:C2'); ws.getCell('A2').value = 'Panel de control';
    ws.getCell('A2').font = fnt({ size: 24, bold: true, color: { argb: C.blanco } });
    ws.mergeCells('A3:C3'); ws.getCell('A3').value = 'Estado de la etapa productiva de los aprendices';
    ws.getCell('A3').font = fnt({ size: 10.5, color: { argb: 'FFDCEFD3' } });
    ws.getCell('D1').value = { richText: [{ text: 'Centro   ', font: fnt({ size: 9, color: { argb: C.claro } }) }, { text: centro, font: fnt({ size: 10, bold: true, color: { argb: C.blanco } }) }] };
    ws.getCell('D2').value = { richText: [{ text: 'Fecha de corte   ', font: fnt({ size: 9, color: { argb: C.claro } }) }, { text: fechaCorte, font: fnt({ size: 10, bold: true, color: { argb: C.blanco } }) }] };
    ws.getCell('D3').value = { richText: [{ text: 'Generado por   ', font: fnt({ size: 9, color: { argb: C.claro } }) }, { text: autor, font: fnt({ size: 10, bold: true, color: { argb: C.blanco } }) }] };
    for (let rr = 1; rr <= 3; rr++) for (let c = 1; c <= 4; c++) {
      const cel = ws.getRow(rr).getCell(c);
      cel.fill = solido(C.banda);
      cel.alignment = { vertical: 'middle', indent: c === 4 ? 2 : 1, horizontal: 'left' };
    }
    for (let c = 1; c <= 4; c++) ws.getRow(4).getCell(c).fill = solido(C.acento);
    ws.getRow(1).height = 22; ws.getRow(2).height = 36; ws.getRow(3).height = 22; ws.getRow(4).height = 4;

    // Filas de la tabla de indicadores (las referencian las cifras y los textos de arriba)
    const IND = 19;
    const F = { apr: IND, et: IND + 1, act: IND + 2, cert: IND + 3, des: IND + 4, riesgo: IND + 5, tasa: IND + 6, prox: IND + 7, venc: IND + 8 };
    const B = (k: keyof typeof F) => `B${F[k]}`;

    // Resumen ejecutivo (fórmula: se reescribe solo)
    const etiqueta = (celda: string, t: string) => { ws.getCell(celda).value = t.toUpperCase(); ws.getCell(celda).font = fnt({ size: 8.5, bold: true, color: { argb: C.banda } }); };
    etiqueta('A6', 'Resumen ejecutivo');
    ws.mergeCells('A7:D9');
    const leadTxt = `El centro registra ${miles(stats.aprendices)} aprendices, de los cuales ${miles(n.total)} tienen etapa práctica. Hoy hay ${miles(n.activa)} en etapa productiva, ${n.cert} certificadas y ${n.des} desertadas. `
      + (tasa !== null ? `La tasa de éxito es de ${Math.round(tasa * 100)}%. ` : 'Todavía no hay casos resueltos para medir la tasa de éxito. ')
      + (vencidas + n.riesgo > 0 ? `${vencidas + n.riesgo} prácticas necesitan seguimiento.` : 'Ninguna práctica está vencida ni en riesgo.');
    ws.getCell('A7').value = {
      formula: `"El centro registra "&FIXED(${B('apr')},0)&" aprendices, de los cuales "&FIXED(${B('et')},0)&" tienen etapa práctica. Hoy hay "&FIXED(${B('act')},0)&" en etapa productiva, "&FIXED(${B('cert')},0)&" certificadas y "&FIXED(${B('des')},0)&" desertadas. "`
        + `&IF(ISNUMBER(${B('tasa')}),"La tasa de éxito es de "&FIXED(${B('tasa')}*100,0)&"%. ","Todavía no hay casos resueltos para medir la tasa de éxito. ")`
        + `&IF(${B('venc')}+${B('riesgo')}>0,FIXED(${B('venc')}+${B('riesgo')},0)&" prácticas necesitan seguimiento.","Ninguna práctica está vencida ni en riesgo.")`,
      result: leadTxt,
    };
    ws.getCell('A7').font = fnt({ size: 12.5, color: { argb: 'FF1F2937' } });
    ws.getCell('A7').alignment = { wrapText: true, vertical: 'top', indent: 1 };
    [7, 8, 9].forEach((rr) => (ws.getRow(rr).height = 20));

    // Cifras: etiqueta · número · barra · detalle (fórmulas sobre los indicadores)
    type Cifra = { etq: string; color: string; valor: any; fmtValor: string; barra: any; detalle: any };
    const pctEtapas = (k: keyof typeof F, v: number) => ({ formula: `FIXED(C${F[k]}*100,0)&"% de las etapas"`, result: `${n.total ? Math.round((v / n.total) * 100) : 0}% de las etapas` });
    const cifras: Cifra[] = [
      { etq: 'Aprendices', color: C.acento, valor: { formula: B('apr'), result: stats.aprendices }, fmtValor: '#,##0',
        barra: { formula: `IFERROR(${B('et')}/${B('apr')},0)`, result: stats.aprendices ? n.total / stats.aprendices : 0 },
        detalle: { formula: `FIXED(${B('et')},0)&" con etapa práctica"`, result: `${miles(n.total)} con etapa práctica` } },
      { etq: 'En etapa productiva', color: C.activa, valor: { formula: B('act'), result: n.activa }, fmtValor: '#,##0',
        barra: { formula: `C${F.act}`, result: n.total ? n.activa / n.total : 0 }, detalle: pctEtapas('act', n.activa) },
      { etq: 'Certificadas', color: C.cert, valor: { formula: B('cert'), result: n.cert }, fmtValor: '#,##0',
        barra: { formula: `C${F.cert}`, result: n.total ? n.cert / n.total : 0 }, detalle: pctEtapas('cert', n.cert) },
      { etq: 'Tasa de éxito', color: tasa === null ? C.otros : tasa >= 0.8 ? C.cert : tasa >= 0.6 ? C.riesgo : C.des,
        valor: { formula: B('tasa'), result: tasa ?? '—' }, fmtValor: '0%',
        barra: { formula: `IF(ISNUMBER(${B('tasa')}),${B('tasa')},0)`, result: tasa ?? 0 },
        detalle: { formula: `IF(ISNUMBER(${B('tasa')}),FIXED(${B('cert')},0)&" de "&FIXED(${B('cert')}+${B('des')},0)&" casos resueltos","aún no hay casos resueltos")`,
          result: tasa !== null ? `${n.cert} de ${resueltos} casos resueltos` : 'aún no hay casos resueltos' } },
    ];
    cifras.forEach((k, i) => {
      const L = letra(i + 1);
      const sep = i ? { left: linea() } : {};
      const e = ws.getCell(`${L}11`); e.value = k.etq.toUpperCase(); e.font = fnt({ size: 8.5, bold: true, color: { argb: C.gris } });
      e.border = { top: linea(), ...sep };
      const v = ws.getCell(`${L}12`); v.value = k.valor; v.numFmt = k.fmtValor; v.font = fnt({ size: 24, bold: true, color: { argb: i === 3 ? k.color : C.texto } });
      v.border = { ...sep };
      const b = ws.getCell(`${L}13`); b.value = k.barra; b.numFmt = ';;;'; b.border = { ...sep };
      barraDatos(ws, `${L}13`, k.color, 1);
      const d = ws.getCell(`${L}14`); d.value = k.detalle; d.font = fnt({ size: 9, color: { argb: C.gris } });
      d.border = { bottom: linea(), ...sep };
      [e, v, b, d].forEach((c) => (c.alignment = { vertical: 'middle', indent: 1, horizontal: 'left' }));
    });
    ws.getRow(11).height = 20; ws.getRow(12).height = 34; ws.getRow(13).height = 9; ws.getRow(14).height = 20;

    /** Encabezado de sección: número grande verde, título y una línea que explica qué muestra. */
    const seccion = (filaN: number, num: string, titulo: string, descripcion: string) => {
      ws.mergeCells(`A${filaN}:D${filaN}`);
      ws.getCell(`A${filaN}`).value = { richText: [
        { text: `${num}  `, font: fnt({ size: 20, bold: true, color: { argb: C.acento } }) },
        { text: titulo, font: fnt({ size: 14, bold: true }) },
      ] };
      ws.getCell(`A${filaN}`).alignment = { vertical: 'bottom' };
      ws.getRow(filaN).height = 30;
      ws.mergeCells(`A${filaN + 1}:D${filaN + 1}`);
      ws.getCell(`A${filaN + 1}`).value = descripcion;
      ws.getCell(`A${filaN + 1}`).font = fnt({ size: 9.5, color: { argb: C.gris } });
      for (let c = 1; c <= 4; c++) ws.getRow(filaN + 1).getCell(c).border = { bottom: linea(C.lineaF, 'medium') };
      ws.getRow(filaN + 1).height = 18;
    };

    // 01 · Indicadores
    seccion(16, '01', 'Indicadores', 'Todas las cifras son fórmulas sobre la hoja «Prácticas»: se recalculan si cambian los datos.');
    encabezado(ws, 18, ['Indicador', 'Valor', '% de las etapas', 'Cómo se calcula'], [1, 2]);
    const pctDe = (k: keyof typeof F, v: number) => ({ formula: `IFERROR(${B(k)}/$B$${F.et},0)`, result: n.total ? v / n.total : 0 });
    const indicadores: [string, any, any, string][] = [
      ['Aprendices del centro', stats.aprendices, '', 'Dato del sistema al generar el archivo'],
      ['Etapas prácticas registradas', { formula: `COUNTA(${APR})`, result: n.total }, '', 'Filas de la hoja Prácticas'],
      ['En etapa productiva (activas)', { formula: `COUNTIF(${SIT},"Activa")`, result: n.activa }, pctDe('act', n.activa), 'Situación = Activa'],
      ['Certificadas', { formula: `COUNTIF(${SIT},"Certificada")`, result: n.cert }, pctDe('cert', n.cert), 'Situación = Certificada'],
      ['Desertadas', { formula: `COUNTIF(${SIT},"Desertada")`, result: n.des }, pctDe('des', n.des), 'Situación = Desertada'],
      ['En riesgo (suspendidas o condicionadas)', { formula: `COUNTIF(${SIT},"En riesgo")`, result: n.riesgo }, pctDe('riesgo', n.riesgo), 'Situación = En riesgo'],
      ['Tasa de éxito', { formula: `IFERROR(${B('cert')}/(${B('cert')}+${B('des')}),"—")`, result: tasa ?? '—' }, '', 'Certificadas ÷ (certificadas + desertadas)'],
      ['Activas que terminan en los próximos 30 días', { formula: `COUNTIFS(${SIT},"Activa",${DIAS},">=0",${DIAS},"<=30")`, result: proximas }, '', 'Cambia cada día (columna Días para el fin)'],
      ['Activas con la fecha de fin vencida', { formula: `COUNTIFS(${SIT},"Activa",${DIAS},"<0")`, result: vencidas }, '', 'Siguen activas y ya pasó su fecha de fin'],
    ];
    indicadores.forEach(([etq, valor, pct, nota], i) => {
      const rw = fila(ws, IND + i, [etq, valor, pct, nota], { derecha: [1, 2], negrita: [1], zebra: i % 2 === 1,
        fmt: { 1: etq === 'Tasa de éxito' ? '0%' : '#,##0', 2: '0%' } });
      rw.getCell(4).font = fnt({ size: 9, italic: true, color: { argb: C.tenue } });
    });

    // 02 · Distribución (tabla + dona nativa)
    seccion(29, '02', 'Distribución por estado', 'Cómo están hoy las etapas prácticas registradas.');
    encabezado(ws, 31, ['Estado', 'Etapas', '% de las etapas'], [1, 2]);
    const DIST = 32;
    const dist: [string, any, number, string][] = [
      ['En etapa productiva', { formula: B('act'), result: n.activa }, n.activa, C.activa],
      ['Certificadas', { formula: B('cert'), result: n.cert }, n.cert, C.cert],
      ['Desertadas', { formula: B('des'), result: n.des }, n.des, C.des],
      ['En riesgo', { formula: B('riesgo'), result: n.riesgo }, n.riesgo, C.riesgo],
      ['Otros estados', { formula: `MAX(0,${B('et')}-SUM(B${DIST}:B${DIST + 3}))`, result: otros }, otros, C.otros],
    ];
    dist.forEach(([etq, valor, v, color], i) => {
      const f = DIST + i;
      const rw = fila(ws, f, [etq, valor, { formula: `IFERROR(B${f}/$B$${F.et},0)`, result: n.total ? v / n.total : 0 }], { derecha: [1, 2], negrita: [1], fmt: { 1: '#,##0', 2: '0%' } });
      // El color va en el borde, no como "■" en el texto: el gráfico toma estas celdas como nombres de la leyenda.
      rw.getCell(1).border = { left: linea(color, 'thick'), bottom: linea() };
      barraDatos(ws, `C${f}`, color, 1);
    });
    for (let rr = DIST + 5; rr <= DIST + 8; rr++) ws.getRow(rr).height = 20;

    // 03 · Hallazgos (fórmulas)
    seccion(42, '03', 'Hallazgos', 'Frases que se reescriben solas con los datos de la hoja «Prácticas».');
    const hallazgos: { formula: string; result: string }[] = [
      { formula: `IF(ISNUMBER(${B('tasa')}),FIXED(${B('tasa')}*100,0)&"% de los casos resueltos terminó en certificación ("&FIXED(${B('cert')},0)&" de "&FIXED(${B('cert')}+${B('des')},0)&").","Todavía no hay casos resueltos: la tasa de éxito aparecerá cuando haya certificadas o desertadas.")`,
        result: tasa !== null ? `${Math.round(tasa * 100)}% de los casos resueltos terminó en certificación (${n.cert} de ${resueltos}).` : 'Todavía no hay casos resueltos: la tasa de éxito aparecerá cuando haya certificadas o desertadas.' },
      { formula: `IF(${B('venc')}>0,FIXED(${B('venc')},0)&IF(${B('venc')}=1," práctica sigue activa"," prácticas siguen activas")&" con la fecha de fin vencida y sin certificar.","Ninguna práctica activa tiene la fecha de fin vencida.")`,
        result: vencidas ? `${vencidas} ${vencidas === 1 ? 'práctica sigue activa' : 'prácticas siguen activas'} con la fecha de fin vencida y sin certificar.` : 'Ninguna práctica activa tiene la fecha de fin vencida.' },
      { formula: `IF(${B('riesgo')}>0,FIXED(${B('riesgo')},0)&IF(${B('riesgo')}=1," práctica está suspendida o condicionada."," prácticas están suspendidas o condicionadas."),"No hay prácticas suspendidas ni condicionadas.")`,
        result: n.riesgo ? `${n.riesgo} ${n.riesgo === 1 ? 'práctica está suspendida o condicionada.' : 'prácticas están suspendidas o condicionadas.'}` : 'No hay prácticas suspendidas ni condicionadas.' },
      { formula: `IF(${B('prox')}>0,FIXED(${B('prox')},0)&IF(${B('prox')}=1," práctica termina"," prácticas terminan")&" en los próximos 30 días.","Ninguna práctica termina en los próximos 30 días.")`,
        result: proximas ? `${proximas} ${proximas === 1 ? 'práctica termina' : 'prácticas terminan'} en los próximos 30 días.` : 'Ninguna práctica termina en los próximos 30 días.' },
    ];
    hallazgos.forEach((h, i) => {
      const f = 44 + i;
      const num = ws.getCell(`A${f}`);
      ws.mergeCells(`B${f}:D${f}`);
      num.value = `Hallazgo ${i + 1}`;
      num.font = fnt({ size: 9.5, bold: true, color: { argb: C.banda } });
      num.fill = solido('FFE8F5E0');
      num.alignment = { vertical: 'middle', indent: 1 };
      num.border = { left: linea(C.acento, 'thick'), bottom: linea(C.blanco, 'medium') };
      const t = ws.getCell(`B${f}`);
      t.value = h;
      t.font = fnt({ size: 10.5 });
      t.alignment = { wrapText: true, vertical: 'middle', indent: 1 };
      for (let c = 2; c <= 4; c++) { ws.getRow(f).getCell(c).fill = solido(C.suave); ws.getRow(f).getCell(c).border = { bottom: linea(C.blanco, 'medium') }; }
      ws.getRow(f).height = 24;
    });

    // 04 · Ritmo por mes (tabla + columnas nativas)
    seccion(49, '04', 'Ritmo por mes', 'Etapas que inician y que deberían cerrar (según su fecha de fin): seis meses atrás y cinco adelante.');
    encabezado(ws, 51, ['Mes', 'Inicios', 'Cierres previstos'], [1, 2]);
    const RIT = 52;
    const hoy = new Date();
    for (let k = -6; k <= 5; k++) {
      const f = RIT + k + 6;
      const ini = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() + k, 1));
      const i = k + 6;
      const rw = fila(ws, f, [
        ini,
        { formula: `COUNTIFS(${INI},">="&A${f},${INI},"<"&DATE(YEAR(A${f}),MONTH(A${f})+1,1))`, result: r.ritmo.inicios[i] },
        { formula: `COUNTIFS(${FIN},">="&A${f},${FIN},"<"&DATE(YEAR(A${f}),MONTH(A${f})+1,1))`, result: r.ritmo.cierres[i] },
      ], { derecha: [1, 2], fmt: { 0: 'mmmm yyyy', 1: '0', 2: '0' }, zebra: i % 2 === 1 });
      if (k === 0) rw.eachCell((c) => (c.font = fnt({ bold: true, color: { argb: C.banda } })));
    }
    barraDatos(ws, `B${RIT}:B${RIT + 11}`, 'FF8FD07F');
    barraDatos(ws, `C${RIT}:C${RIT + 11}`, 'FFCBD5E1');
    ws.getCell(`A${RIT + 12}`).value = 'El mes actual va en verde.';
    ws.getCell(`A${RIT + 12}`).font = fnt({ size: 9, italic: true, color: { argb: C.tenue } });

    // 05 · Notas metodológicas
    seccion(67, '05', 'Notas metodológicas', 'Cómo se calcula cada cifra de este archivo.');
    const notas: [string, string][] = [
      ['En etapa productiva', 'Etapas con estado activo o en curso.'],
      ['En riesgo', 'Etapas suspendidas o condicionadas.'],
      ['Tasa de éxito', 'Certificadas ÷ (certificadas + desertadas). Las activas aún no cuentan porque no tienen resultado.'],
      ['Requieren atención', 'En riesgo; activas con la fecha de fin vencida; o que terminan en 30 días o menos con menos del 70 % de avance.'],
      ['Ritmo', 'Inicios según la fecha de inicio; cierres previstos según la fecha de fin registrada.'],
      ['Porcentajes', 'Sobre las etapas prácticas registradas, salvo «con etapa práctica», que es sobre todos los aprendices del centro.'],
    ];
    notas.forEach(([t, d], i) => {
      const f = 69 + i;
      ws.getCell(`A${f}`).value = t;
      ws.getCell(`A${f}`).font = fnt({ size: 9.5, bold: true });
      ws.mergeCells(`B${f}:D${f}`);
      ws.getCell(`B${f}`).value = d;
      ws.getCell(`B${f}`).font = fnt({ size: 9.5, color: { argb: 'FF4B5563' } });
      ws.getCell(`B${f}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getCell(`A${f}`).alignment = { vertical: 'top', indent: 1 };
      ws.getRow(f).height = d.length > 70 ? 28 : 16;
    });

    // ══ Por programa / Por empresa ══════════════════════════════════════════
    const porGrupo = (nombre: string, etiquetaCol: string, descripcion: string, nombres: string[], rango: string, campo: (p: any) => string) => {
      const wsG = nuevaHoja(nombre, [46, 12, 12, 13, 12, 12, 16]);
      bandaHoja(wsG, nombre, descripcion, 7);
      encabezado(wsG, 4, [etiquetaCol, 'Etapas', 'Activas', 'Certificadas', 'Desertadas', 'En riesgo', 'Tasa de éxito'], [1, 2, 3, 4, 5, 6]);
      wsG.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
      wsG.pageSetup.printTitlesRow = '4:4';
      if (!nombres.length) {
        wsG.getCell('A5').value = 'No hay prácticas registradas.';
        wsG.getCell('A5').font = fnt({ italic: true, color: { argb: C.tenue } });
        return;
      }
      nombres.forEach((g, i) => {
        const fl = 5 + i;
        const ps = filasP.filter((p: any) => (campo(p) || '—') === g);
        const c = (cat: string) => ps.filter((p: any) => situacion(p) === cat).length;
        const si = (cat?: string) => (cat ? `COUNTIFS(${rango},$A${fl},${SIT},"${cat}")` : `COUNTIF(${rango},$A${fl})`);
        const res = c('Certificada') + c('Desertada');
        fila(wsG, fl, [
          g,
          { formula: si(), result: ps.length },
          { formula: si('Activa'), result: c('Activa') },
          { formula: si('Certificada'), result: c('Certificada') },
          { formula: si('Desertada'), result: c('Desertada') },
          { formula: si('En riesgo'), result: c('En riesgo') },
          { formula: `IFERROR(D${fl}/(D${fl}+E${fl}),"—")`, result: res ? c('Certificada') / res : '—' },
        ], { derecha: [1, 2, 3, 4, 5, 6], negrita: [1, 6], fmt: { 6: '0%' }, zebra: i % 2 === 1 });
      });
      const fin = 4 + nombres.length;
      const tot = fin + 1;
      const rw = fila(wsG, tot, ['Total',
        ...['B', 'C', 'D', 'E', 'F'].map((L) => ({ formula: `SUM(${L}5:${L}${fin})` })),
        { formula: `IFERROR(D${tot}/(D${tot}+E${tot}),"—")` }], { derecha: [1, 2, 3, 4, 5, 6], fmt: { 6: '0%' } });
      rw.eachCell((cc) => { cc.font = fnt({ bold: true }); cc.border = { top: linea(C.lineaF, 'medium') }; });
      barraDatos(wsG, `B5:B${fin}`, 'FF8FD07F');
      // Tasa en color: verde ≥ 80 %, ámbar ≥ 60 %, rojo por debajo (dinámico).
      wsG.addConditionalFormatting({
        ref: `G5:G${tot}`,
        rules: [
          { type: 'expression', formulae: ['AND(ISNUMBER(G5),G5>=0.8)'], priority: 2, style: { font: { color: { argb: 'FF15803D' }, bold: true } } } as any,
          { type: 'expression', formulae: ['AND(ISNUMBER(G5),G5>=0.6,G5<0.8)'], priority: 3, style: { font: { color: { argb: 'FFB45309' }, bold: true } } } as any,
          { type: 'expression', formulae: ['AND(ISNUMBER(G5),G5<0.6)'], priority: 4, style: { font: { color: { argb: 'FFB91C1C' }, bold: true } } } as any,
        ],
      });
      wsG.addConditionalFormatting({
        ref: `E5:E${fin}`,
        rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0'], priority: 5, style: { font: { color: { argb: 'FFDC2626' }, bold: true } } } as any],
      });
    };
    porGrupo('Por programa', 'Programa', 'Cuántos aprendices de cada programa están en etapa productiva y cómo terminan',
      r.porPrograma.map((p) => (p.programa === 'Sin programa' ? '—' : p.programa)), PROG, (p) => p.programa);
    porGrupo('Por empresa', 'Empresa', 'Dónde están haciendo su etapa productiva',
      r.porEmpresa.map((e) => (e.empresa === 'Sin empresa' ? '—' : e.empresa)), EMP, (p) => p.empresaNombre);

    // ══ Requieren atención (foto al generar: depende de reglas) ═════════════
    const wsA = nuevaHoja('Requieren atención', [11, 32, 15, 34, 11, 26, 14, 56, 10], true);
    bandaHoja(wsA, 'Requieren atención', 'En riesgo, vencidas sin certificar o por terminar con poco avance (lista tomada al generar el archivo)', 9);
    encabezado(wsA, 4, ['Prioridad', 'Aprendiz', 'Identificación', 'Programa', 'Ficha', 'Empresa', 'Estado', 'Motivo', 'Avance'], [8]);
    wsA.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
    wsA.pageSetup.printTitlesRow = '4:4';
    if (!r.atencion.length) {
      wsA.mergeCells('A5:I5');
      wsA.getCell('A5').value = '✓  Todo en orden: ninguna práctica está en riesgo, vencida o por terminar con poco avance.';
      wsA.getCell('A5').font = fnt({ bold: true, color: { argb: 'FF166534' } });
      wsA.getCell('A5').fill = solido('FFF0FDF4');
      wsA.getCell('A5').alignment = { vertical: 'middle', indent: 1 };
      wsA.getRow(5).height = 26;
    }
    r.atencion.forEach((a, i) => {
      const rw = fila(wsA, 5 + i, [a.prioridad, a.nombre, a.identificacion, a.programa, a.ficha, a.empresa, a.estado, a.motivo, a.avance === null ? '—' : a.avance / 100],
        { derecha: [8], negrita: [1], fmt: { 8: '0%' }, zebra: i % 2 === 1 });
      rw.getCell(1).font = fnt({ bold: true, color: { argb: a.prioridad === 'Alta' ? 'FFB91C1C' : 'FFB45309' } });
      rw.height = 30;
    });

    // ══ Prácticas: la tabla base ═════════════════════════════════════════════
    const wsL = nuevaHoja('Prácticas', [32, 15, 11, 36, 28, 14, 13, 12, 12, 14, 10, 40], true);
    bandaHoja(wsL, 'Prácticas', 'La tabla base: corrige o agrega filas aquí y todo el archivo se recalcula', 12);
    const hoyUtc = (() => { const h = new Date(); return Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()); })();
    if (filasP.length) {
      wsL.addTable({
        name: 'Practicas',
        ref: `A${P0 - 1}`,
        headerRow: true,
        // Medium4 = acento verde en el tema que escribe ExcelJS (Medium7 sale naranja).
        style: { theme: 'TableStyleMedium4', showRowStripes: true },
        columns: ['Aprendiz', 'Identificación', 'Ficha', 'Programa', 'Empresa', 'Estado', 'Situación', 'Inicio', 'Fin', 'Días para el fin', 'Avance', 'Observación']
          .map((name) => ({ name, filterButton: true })),
        rows: filasP.map((p: any, i: number) => {
          const f = P0 + i;
          const fin = fechaXl(p.fecha_fin);
          const sigue = ['Activa', 'En riesgo'].includes(situacion(p));
          const dias = sigue && fin instanceof Date ? Math.round((fin.getTime() - hoyUtc) / DIA_MS) : '';
          return [
            p.nombre ?? '—', String(p.identificacion ?? p.documento ?? '—'), p.ficha ?? '—', p.programa ?? '—', p.empresaNombre ?? '—',
            etiquetaEstado(p.estado), situacion(p), fechaXl(p.fecha_inicio), fin,
            { formula: `IF(AND(OR(G${f}="Activa",G${f}="En riesgo"),ISNUMBER(I${f})),I${f}-TODAY(),"")`, result: dias },
            typeof p.avance === 'number' ? p.avance / 100 : '', p.observacion || '',
          ];
        }),
      });
      for (let i = 0; i < filasP.length; i++) {
        const rw = wsL.getRow(P0 + i);
        rw.height = 19;
        rw.getCell(8).numFmt = 'dd/mm/yyyy';
        rw.getCell(9).numFmt = 'dd/mm/yyyy';
        rw.getCell(10).numFmt = '0;[Red]-0';
        rw.getCell(11).numFmt = '0%';
        for (let c = 1; c <= 12; c++) {
          rw.getCell(c).alignment = { vertical: 'middle', horizontal: [3, 6, 7, 8, 9, 10, 11].includes(c) ? 'center' : 'left' };
        }
      }
      const fin = P0 + filasP.length - 1;
      barraDatos(wsL, `K${P0}:K${fin}`, 'FF8FD07F', 1);
      const colorSi = (valor: string, argb: string, prioridad: number) =>
        ({ type: 'expression', formulae: [`$G${P0}="${valor}"`], priority: prioridad, style: { font: { color: { argb }, bold: true } } } as any);
      wsL.addConditionalFormatting({
        ref: `G${P0}:G${fin}`,
        rules: [colorSi('Activa', C.activa, 2), colorSi('Certificada', C.cert, 3), colorSi('Desertada', C.des, 4), colorSi('En riesgo', C.riesgo, 5)],
      });
      wsL.addConditionalFormatting({
        ref: `J${P0}:J${fin}`,
        rules: [
          { type: 'cellIs', operator: 'lessThan', formulae: ['0'], priority: 6, style: { font: { color: { argb: 'FFC00000' }, bold: true } } } as any,
          { type: 'expression', formulae: [`AND(ISNUMBER(J${P0}),J${P0}>=0,J${P0}<=30)`], priority: 7, style: { font: { color: { argb: 'FFC65911' }, bold: true } } } as any,
        ],
      });
      // Solo el encabezado inmovilizado: fijar también la columna A dibuja una línea vertical que se ve rara.
      wsL.views = [{ state: 'frozen', ySplit: P0 - 1, showGridLines: false }];
      wsL.pageSetup.printTitlesRow = `${P0 - 1}:${P0 - 1}`;
    } else {
      wsL.getCell('A4').value = 'No hay prácticas registradas.';
      wsL.getCell('A4').font = fnt({ italic: true, color: { argb: C.tenue } });
    }

    // ══ Gráficos nativos en el Resumen (apuntan a los rangos de arriba) ═════
    const buffer = await wb.xlsx.writeBuffer() as ArrayBuffer;
    const conGraficos = await agregarGraficosNativos(buffer, 'sheet1.xml', [
      {
        tipo: 'dona', titulo: 'Distribución por estado',
        categorias: `Resumen!$A$${DIST}:$A$${DIST + 4}`,
        series: [{ nombre: `Resumen!$B$31`, valores: `Resumen!$B$${DIST}:$B$${DIST + 4}`, color: '2563EB' }],
        coloresPuntos: ['2563EB', '16A34A', 'DC2626', 'D97706', '9CA3AF'],
        desde: { col: 3, fila: 30 }, hasta: { col: 4, fila: 40 },
      },
      {
        tipo: 'columnas', titulo: 'Inicios y cierres previstos por mes',
        categorias: `Resumen!$A$${RIT}:$A$${RIT + 11}`, formatoCategorias: 'mmm yy',
        pasoEje: Math.max(1, Math.ceil(Math.max(...r.ritmo.inicios, ...r.ritmo.cierres, 1) / 5)),
        series: [
          { nombre: 'Resumen!$B$51', valores: `Resumen!$B$${RIT}:$B$${RIT + 11}`, color: '39A900' },
          { nombre: 'Resumen!$C$51', valores: `Resumen!$C$${RIT}:$C$${RIT + 11}`, color: '94A3B8' },
        ],
        desde: { col: 3, fila: 50 }, hasta: { col: 4, fila: 65 },
      },
    ]);
    const blob = new Blob([conGraficos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `panel-etapa-productiva-${hoyLocal()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Hoja de datos con el estilo de informe: título (fila 1) con línea de acento,
   * subtítulo (2), encabezado gris con filtros (4, inmovilizado) y datos desde
   * la 5. Estados en texto de color, fechas reales y lista para imprimir.
   */
  hojaExcel(wb: ExcelJS.Workbook, titulo: string, subtitulo: string, pie: string, cols: ColXl[], filas: any[][], vacio = 'Sin registros.'): ExcelJS.Worksheet {
    const { TX, GRIS, TENUE, LINEA, LINEA_F, SUAVE, ACENTO } = XL;
    const ws = wb.addWorksheet(titulo, {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
        margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
      headerFooter: { oddFooter: `&L&8&K9CA3AF${pie.replace(/&/g, '&&')}&R&8&K6B7280Página &P de &N` },
    });
    ws.columns = cols.map((c) => ({ width: c.ancho }));
    const ultima = String.fromCharCode(64 + cols.length);
    const centrada = (c: ColXl) => c.tipo === 'numero' || c.tipo === 'porcentaje';

    ws.mergeCells(`A1:${ultima}1`);
    const t = ws.getCell('A1');
    t.value = titulo;
    t.font = fuenteXl({ size: 15, bold: true });
    t.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 26;
    for (let c = 1; c <= cols.length; c++) ws.getRow(1).getCell(c).border = { bottom: { style: 'medium', color: { argb: ACENTO } } };

    ws.mergeCells(`A2:${ultima}2`);
    const st = ws.getCell('A2');
    st.value = subtitulo;
    st.font = fuenteXl({ size: 9.5, color: { argb: GRIS } });
    ws.getRow(2).height = 18;

    const head = ws.getRow(4);
    cols.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.titulo.toUpperCase();
      cell.font = fuenteXl({ size: 8.5, bold: true, color: { argb: GRIS } });
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUAVE } };
      cell.alignment = { vertical: 'middle', horizontal: centrada(c) ? 'center' : 'left' };
      cell.border = { bottom: { style: 'medium', color: { argb: LINEA_F } } };
    });
    head.height = 22;

    if (!filas.length) {
      const r = ws.getRow(5);
      r.getCell(1).value = vacio;
      r.getCell(1).font = fuenteXl({ italic: true, color: { argb: TENUE } });
      return ws;
    }

    filas.forEach((valores, fi) => {
      const r = ws.getRow(5 + fi);
      valores.forEach((v, ci) => {
        const c = cols[ci];
        const cell = r.getCell(ci + 1);
        cell.value = v ?? '—';
        cell.font = fuenteXl();
        cell.alignment = { vertical: 'top', wrapText: true, horizontal: centrada(c) ? 'center' : 'left' };
        cell.border = { bottom: { style: 'thin', color: { argb: LINEA } } };
        if (c.tipo === 'fecha' && v instanceof Date) cell.numFmt = 'dd/mm/yyyy';
        if (c.tipo === 'porcentaje' && typeof v === 'number') cell.numFmt = '0%';
        if (c.tipo === 'negrita') cell.font = fuenteXl({ bold: true });
        if (c.tipo === 'estado' && typeof v === 'string') {
          cell.font = fuenteXl({ bold: true, color: { argb: COLOR_ESTADO_XL[v.trim().toLowerCase()] ?? TX } });
        }
      });
    });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + filas.length, column: cols.length } };
    return ws;
  }

  async descargarExcel(wb: ExcelJS.Workbook, nombre: string): Promise<void> {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HISTORIAL DEL APRENDIZ
  // ══════════════════════════════════════════════════════════════════════════
  private nombreInstructor(id: string, map: Map<string, string>): string {
    return map.get(id) ?? 'Instructor no encontrado';
  }

  /**
   * PDF del historial con formato de informe (estilo común en
   * shared/utils/informe-pdf.ts, el mismo del reporte del día de horarios).
   * Rediseñado 2026-10-01: el anterior pintaba cada sección con un color
   * distinto y repartía bitácoras y observaciones en tablas sueltas.
   */
  async exportarHistorialPDF(resultado: ResultadoConsulta, personasMap: Map<string, string>): Promise<void> {
    const { estudiante, historial, practicas } = resultado;
    const inf = await crearInformePdf({ marca: 'Plataforma académica · SENA', tipo: 'Historial del aprendiz' });
    const f = fechaInforme;
    const rango = (a?: string, b?: string) => (a || b ? `${f(a)} – ${f(b)}` : '—');

    const nombre = `${estudiante.nombre ?? ''} ${estudiante.apellido ?? ''}`.replace(/\s+/g, ' ').trim() || 'Aprendiz';
    const generado = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    const totalBitacoras = practicas.reduce((n, p) => n + p.seguimientos.reduce((m, s) => m + s.bitacoras.length, 0), 0);
    const totalObservaciones = practicas.reduce((n, p) => n + p.seguimientos.reduce((m, s) => m + s.observaciones.length, 0), 0);

    inf.encabezado(
      nombre,
      [`C.C. ${estudiante.documento || '—'}`, estudiante.programa, estudiante.estado].filter(Boolean).join('   ·   '),
      `Generado el ${generado}`,
    );
    inf.cifras([
      { valor: historial.length, etiqueta: 'Matrículas' },
      { valor: practicas.length, etiqueta: 'Etapas prácticas' },
      { valor: totalBitacoras, etiqueta: 'Bitácoras' },
      { valor: totalObservaciones, etiqueta: 'Observaciones' },
    ]);

    // ── 1. Datos personales ─────────────────────────────────────────────────
    inf.seccion('1', 'Datos personales');
    inf.datos([
      ['Documento', estudiante.documento || '—'],
      ['Estado', estudiante.estado || '—'],
      ['Correo electrónico', estudiante.email || '—'],
      ['Teléfono', estudiante.telefono || '—'],
      ['Programa actual', estudiante.programa || '—'],
    ], 2);

    // ── 2. Matrículas ───────────────────────────────────────────────────────
    inf.seccion('2', 'Matrículas');
    if (historial.length) {
      const colorEstado: Record<string, RGB> = { Aprobado: TINTA.ok, Reprobado: TINTA.error, 'En curso': TINTA.info };
      inf.tabla(['Ficha', 'Programa', 'Periodo', 'Estado'],
        historial.map((h) => [h.idCurso || '—', h.nombreCurso || '—', h.periodo || '—', h.estado || '—']),
        {
          columnStyles: { 0: { cellWidth: 24 }, 2: { cellWidth: 26 }, 3: { cellWidth: 24, fontStyle: 'bold' } },
          didParseCell: (d: any) => {
            if (d.section === 'body' && d.column.index === 3) d.cell.styles.textColor = colorEstado[d.cell.raw] ?? TINTA.texto;
          },
        });
    } else {
      inf.vacio('Sin matrículas registradas.');
    }

    // ── 3. Etapa práctica ───────────────────────────────────────────────────
    inf.seccion('3', 'Etapa práctica');
    if (!practicas.length) inf.vacio('El aprendiz no tiene etapa práctica registrada.');

    practicas.forEach((p, i) => {
      inf.subseccion(`3.${i + 1}`, `${p.programa || 'Programa sin nombre'}${p.fichaCurso ? `  —  Ficha ${p.fichaCurso}` : ''}`);
      inf.datos([
        ['Empresa', p.empresa || '—'], ['Modalidad', p.modalidad || '—'], ['Estado', p.estado || '—'],
        ['Inicio', f(p.fechaInicio)], ['Fin', f(p.fechaFin)], ['Seguimientos', String(p.seguimientos.length)],
      ], 3);
      if (p.observacion) inf.nota('Observación general', p.observacion);

      // Instructores
      inf.rotulo('Instructores asignados');
      if (p.asignaciones.length) {
        inf.tabla(['Instructor', 'Horas', 'Periodo', 'Estado'],
          p.asignaciones.map((a) => [this.nombreInstructor(a.instructor, personasMap), a.horas ?? 0, rango(a.fechaInicio, a.fechaFin), a.estado || '—']),
          { columnStyles: { 1: { cellWidth: 16, halign: 'center' }, 2: { cellWidth: 48 }, 3: { cellWidth: 26 } } });
      } else {
        inf.y += 3;
        inf.vacio('Sin instructores asignados.');
      }

      // Seguimientos: una tabla cronológica por seguimiento con bitácoras y observaciones juntas.
      // El rótulo viaja con el primer seguimiento (título + cabecera + una fila).
      inf.rotulo(`Seguimientos (${p.seguimientos.length})`, p.seguimientos.length ? 46 : 14);
      inf.y += 4.5;
      if (!p.seguimientos.length) inf.vacio('Sin seguimientos registrados.');

      p.seguimientos.forEach((s, j) => {
        // Título + observación + cabecera y primera fila de su tabla, en la misma página.
        const lineasObs = s.observacion ? inf.partir(s.observacion, inf.ancho, 8.6) : [];
        inf.asegurar(10 + lineasObs.length * 4 + 22);
        inf.texto(`Seguimiento ${j + 1}`, inf.mg, inf.y, { size: 9.2, bold: true });
        inf.texto(`${s.estado || 'Sin estado'}   ·   ${rango(s.fechaInicio, s.fechaFin)}`, inf.pw - inf.mg, inf.y, { size: 8, color: TINTA.gris, align: 'right' });
        inf.y += 2;
        inf.regla(inf.y);
        inf.y += 3.5;
        if (lineasObs.length) {
          inf.texto(lineasObs, inf.mg, inf.y + 1, { size: 8.6, italic: true, color: TINTA.gris });
          inf.y += lineasObs.length * 4 + 3;
        }

        const registros = [
          ...s.bitacoras.map((b) => ({ fecha: b.fecha, tipo: 'Bitácora', detalle: b.estado ? `Estado: ${b.estado}` : '—' })),
          ...s.observaciones.map((o) => ({ fecha: o.fecha, tipo: 'Observación', detalle: o.descripcion || '—' })),
        ].sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));

        if (registros.length) {
          inf.tabla(['Fecha', 'Registro', 'Detalle'],
            registros.map((r) => [f(r.fecha), r.tipo, r.detalle]),
            { columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 26, fontStyle: 'bold' } } });
        } else {
          inf.vacio('Sin bitácoras ni observaciones en este seguimiento.');
        }
        inf.y += 1;
      });
      inf.y += 4;
    });

    inf.terminar({ izquierda: `${nombre}  ·  C.C. ${estudiante.documento || '—'}`, derechaEncabezado: nombre });
    const slug = nombre.replace(/\s+/g, '_').toLowerCase() || 'aprendiz';
    inf.doc.save(`historial_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HISTORIAL DEL APRENDIZ — EXCEL (mejorado visualmente)
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * Excel del historial con el mismo lenguaje sobrio de los PDF (2026-10-01):
   * cada hoja con título, encabezado gris con filtros e inmovilizado, fechas
   * como fechas reales (ordenables), estados en texto de color y lista para
   * imprimir. Antes: 6 hojas de 6 colores, fechas ISO como texto, bitácoras y
   * observaciones en hojas separadas.
   */
  async exportarHistorialExcel(resultado: ResultadoConsulta, personasMap: Map<string, string>): Promise<void> {
    const { estudiante, historial, practicas } = resultado;
    const XLS = await import('exceljs');
    const wb = new XLS.Workbook();
    wb.creator = 'EPSAS';
    wb.created = new Date();

    const { GRIS, TENUE, LINEA, ACENTO } = XL;
    const fuente = fuenteXl;

    const nombre = `${estudiante.nombre ?? ''} ${estudiante.apellido ?? ''}`.replace(/\s+/g, ' ').trim() || 'Aprendiz';
    const subtitulo = [`C.C. ${estudiante.documento || '—'}`, estudiante.programa, estudiante.estado].filter(Boolean).join('   ·   ');

    const fecha = fechaXl;

    const pie = `${nombre} · C.C. ${estudiante.documento || '—'}`;
    const hoja = (titulo: string, cols: ColXl[], filas: any[][], vacio = 'Sin registros.') =>
      this.hojaExcel(wb, titulo, `${nombre}   ·   ${subtitulo}`, pie, cols, filas, vacio);

    // ── Resumen ─────────────────────────────────────────────────────────────
    const totalBitacoras = practicas.reduce((n, p) => n + p.seguimientos.reduce((m, s) => m + s.bitacoras.length, 0), 0);
    const totalObservaciones = practicas.reduce((n, p) => n + p.seguimientos.reduce((m, s) => m + s.observaciones.length, 0), 0);

    const ws1 = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws1.columns = [{ width: 24 }, { width: 22 }, { width: 22 }, { width: 22 }];
    ws1.mergeCells('A1:D1');
    ws1.getCell('A1').value = 'Historial del aprendiz';
    ws1.getCell('A1').font = fuente({ size: 9, bold: true, color: { argb: ACENTO } });
    ws1.mergeCells('A2:D2');
    ws1.getCell('A2').value = nombre;
    ws1.getCell('A2').font = fuente({ size: 18, bold: true });
    ws1.getRow(2).height = 30;
    ws1.mergeCells('A3:D3');
    ws1.getCell('A3').value = subtitulo;
    ws1.getCell('A3').font = fuente({ size: 10, color: { argb: GRIS } });
    ws1.mergeCells('A4:D4');
    ws1.getCell('A4').value = `Generado el ${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    ws1.getCell('A4').font = fuente({ size: 8.5, color: { argb: TENUE } });
    for (let c = 1; c <= 4; c++) ws1.getRow(4).getCell(c).border = { bottom: { style: 'medium', color: { argb: ACENTO } } };

    // Cifras: valor grande arriba, etiqueta abajo.
    const cifras: [string, number][] = [
      ['Matrículas', historial.length], ['Etapas prácticas', practicas.length],
      ['Bitácoras', totalBitacoras], ['Observaciones', totalObservaciones],
    ];
    cifras.forEach(([etq, n], i) => {
      const v = ws1.getRow(6).getCell(i + 1);
      v.value = n;
      v.font = fuente({ size: 20, bold: true });
      v.alignment = { horizontal: 'left', vertical: 'bottom' };
      const e = ws1.getRow(7).getCell(i + 1);
      e.value = etq.toUpperCase();
      e.font = fuente({ size: 8, bold: true, color: { argb: GRIS } });
      e.border = { bottom: { style: 'thin', color: { argb: LINEA } } };
    });
    ws1.getRow(6).height = 30;

    ws1.getCell('A9').value = 'DATOS PERSONALES';
    ws1.getCell('A9').font = fuente({ size: 9, bold: true, color: { argb: ACENTO } });
    const datos: [string, string][] = [
      ['Documento', estudiante.documento || '—'],
      ['Estado', estudiante.estado || '—'],
      ['Correo electrónico', estudiante.email || '—'],
      ['Teléfono', estudiante.telefono || '—'],
      ['Programa actual', estudiante.programa || '—'],
    ];
    datos.forEach(([k, v], i) => {
      const fila = 10 + i;
      ws1.mergeCells(`B${fila}:D${fila}`);
      const ck = ws1.getCell(`A${fila}`);
      ck.value = k;
      ck.font = fuente({ size: 9, bold: true, color: { argb: GRIS } });
      const cv = ws1.getCell(`B${fila}`);
      cv.value = v;
      cv.font = fuente();
      [ck, cv].forEach((c) => (c.border = { bottom: { style: 'thin', color: { argb: LINEA } } }));
      ws1.getRow(fila).height = 18;
    });
    ws1.getCell('A16').value = 'Cada hoja de este libro tiene filtros en su encabezado. Las fechas se pueden ordenar.';
    ws1.getCell('A16').font = fuente({ size: 8.5, italic: true, color: { argb: TENUE } });

    // ── Matrículas ──────────────────────────────────────────────────────────
    hoja('Matrículas',
      [{ titulo: 'Ficha', ancho: 14, tipo: 'negrita' }, { titulo: 'Programa', ancho: 44 }, { titulo: 'Periodo', ancho: 12 }, { titulo: 'Estado', ancho: 14, tipo: 'estado' }],
      historial.map((h) => [h.idCurso || '—', h.nombreCurso || '—', h.periodo || '—', h.estado || '—']),
      'Sin matrículas registradas.');

    // ── Etapa práctica (una fila por etapa) ─────────────────────────────────
    hoja('Etapa práctica',
      [
        { titulo: 'Ficha', ancho: 12, tipo: 'negrita' }, { titulo: 'Programa', ancho: 32 }, { titulo: 'Empresa', ancho: 28 },
        { titulo: 'Modalidad', ancho: 20 }, { titulo: 'Estado', ancho: 13, tipo: 'estado' }, { titulo: 'Inicio', ancho: 12, tipo: 'fecha' },
        { titulo: 'Fin', ancho: 12, tipo: 'fecha' }, { titulo: 'Seguimientos', ancho: 13, tipo: 'numero' },
        { titulo: 'Bitácoras', ancho: 11, tipo: 'numero' }, { titulo: 'Observaciones', ancho: 14, tipo: 'numero' },
        { titulo: 'Observación general', ancho: 40 },
      ],
      practicas.map((p) => [
        p.fichaCurso || '—', p.programa || '—', p.empresa || '—', p.modalidad || '—', p.estado || '—',
        fecha(p.fechaInicio), fecha(p.fechaFin), p.seguimientos.length,
        p.seguimientos.reduce((n, s) => n + s.bitacoras.length, 0),
        p.seguimientos.reduce((n, s) => n + s.observaciones.length, 0),
        p.observacion || '—',
      ]),
      'El aprendiz no tiene etapa práctica registrada.');

    // ── Instructores ────────────────────────────────────────────────────────
    hoja('Instructores',
      [
        { titulo: 'Ficha', ancho: 12, tipo: 'negrita' }, { titulo: 'Instructor', ancho: 32 }, { titulo: 'Horas', ancho: 9, tipo: 'numero' },
        { titulo: 'Desde', ancho: 12, tipo: 'fecha' }, { titulo: 'Hasta', ancho: 12, tipo: 'fecha' }, { titulo: 'Estado', ancho: 13, tipo: 'estado' },
      ],
      practicas.flatMap((p) => p.asignaciones.map((a) => [
        p.fichaCurso || '—', this.nombreInstructor(a.instructor, personasMap), a.horas ?? 0, fecha(a.fechaInicio), fecha(a.fechaFin), a.estado || '—',
      ])),
      'Sin instructores asignados.');

    // ── Seguimientos ────────────────────────────────────────────────────────
    hoja('Seguimientos',
      [
        { titulo: 'Ficha', ancho: 12, tipo: 'negrita' }, { titulo: 'N.º', ancho: 6, tipo: 'numero' }, { titulo: 'Estado', ancho: 13, tipo: 'estado' },
        { titulo: 'Inicio', ancho: 12, tipo: 'fecha' }, { titulo: 'Fin', ancho: 12, tipo: 'fecha' }, { titulo: 'Bitácoras', ancho: 11, tipo: 'numero' },
        { titulo: 'Observaciones', ancho: 14, tipo: 'numero' }, { titulo: 'Acta', ancho: 8, tipo: 'numero' }, { titulo: 'Observación', ancho: 44 },
      ],
      practicas.flatMap((p) => p.seguimientos.map((s, j) => [
        p.fichaCurso || '—', j + 1, s.estado || '—', fecha(s.fechaInicio), fecha(s.fechaFin),
        s.bitacoras.length, s.observaciones.length, s.actasPdf ? 'Sí' : 'No', s.observacion || '—',
      ])),
      'Sin seguimientos registrados.');

    // ── Registros: bitácoras y observaciones juntas, en orden cronológico ──
    hoja('Registros',
      [
        { titulo: 'Fecha', ancho: 12, tipo: 'fecha' }, { titulo: 'Ficha', ancho: 12 }, { titulo: 'Seguimiento', ancho: 12, tipo: 'numero' },
        { titulo: 'Registro', ancho: 14, tipo: 'negrita' }, { titulo: 'Estado', ancho: 13, tipo: 'estado' }, { titulo: 'Detalle', ancho: 60 },
      ],
      practicas.flatMap((p) => p.seguimientos.flatMap((s, j) => [
        ...s.bitacoras.map((b) => ({ orden: b.fecha ?? '', fila: [fecha(b.fecha), p.fichaCurso || '—', j + 1, 'Bitácora', b.estado || '—', '—'] })),
        ...s.observaciones.map((o) => ({ orden: o.fecha ?? '', fila: [fecha(o.fecha), p.fichaCurso || '—', j + 1, 'Observación', '—', o.descripcion || '—'] })),
      ]))
        .sort((a, b) => a.orden.localeCompare(b.orden))
        .map((r) => r.fila),
      'Sin bitácoras ni observaciones registradas.');

    // ── Descargar ───────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = nombre.replace(/\s+/g, '_').toLowerCase() || 'aprendiz';
    a.download = `historial_${slug}_${hoyLocal()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }
}