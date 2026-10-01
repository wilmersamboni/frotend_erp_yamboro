import { Injectable } from '@angular/core';
import * as ExcelJS from 'exceljs';
import { Stats, DonaStats, categorizarEstado } from './stats.service';
import { ResultadoConsulta } from '../../shared/models/estudiante.model';
import { InformePdf, TINTA, RGB, fechaInforme, hoyLocal } from '../../shared/utils/informe-pdf';

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
function fechaXl(v?: string | null): Date | string {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

type ColXl = { titulo: string; ancho: number; tipo?: 'fecha' | 'numero' | 'estado' | 'negrita' | 'porcentaje' };

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
interface Atencion {
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
interface ResumenPanel {
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

  private resumenPanel(stats: Stats, practicas: any[], _graficos?: GraficosExport): ResumenPanel {
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
    const inf = new InformePdf({ marca: 'Etapa productiva · SENA', tipo: 'Reporte estadístico' });
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
   * Excel del panel de inicio con el estilo de los informes: Resumen (cifras,
   * hallazgos, distribución y ritmo con barras de datos), Requieren atención,
   * Por programa, Por empresa y Prácticas (filtros, fechas reales, días para
   * el fin, estado en color). ExcelJS no tiene gráficos nativos: se usan
   * barras de datos (formato condicional).
   */
  async exportarExcel(
    stats: Stats,
    _etapaActiva: DonaStats,
    _etapaCertificada: DonaStats,
    practicas: any[],
    graficos?: GraficosExport,
  ): Promise<void> {
    const r = this.resumenPanel(stats, practicas, graficos);
    const { GRIS, TENUE, LINEA, LINEA_F, SUAVE, ACENTO } = XL;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EPSAS';
    wb.created = new Date();
    const subtitulo = 'Panel de control · Etapa productiva';
    const generado = `Generado el ${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    const colorTasa = (t: number | null) => (t === null ? XL.TENUE : t >= 80 ? 'FF15803D' : t >= 60 ? 'FFB45309' : 'FFB91C1C');

    // ── Resumen ─────────────────────────────────────────────────────────────
    const ws = wb.addWorksheet('Resumen', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }];
    const fila = (n: number, alto?: number) => { const rw = ws.getRow(n); if (alto) rw.height = alto; return rw; };
    const bajo = (c: ExcelJS.Cell, color = LINEA, estilo: ExcelJS.BorderStyle = 'thin') => (c.border = { bottom: { style: estilo, color: { argb: color } } });
    const rotulo = (celda: string, texto: string) => { ws.getCell(celda).value = texto.toUpperCase(); ws.getCell(celda).font = fuenteXl({ size: 9, bold: true, color: { argb: ACENTO } }); };

    ws.mergeCells('A1:D1'); ws.getCell('A1').value = 'Reporte estadístico'; ws.getCell('A1').font = fuenteXl({ size: 9, bold: true, color: { argb: ACENTO } });
    ws.mergeCells('A2:D2'); ws.getCell('A2').value = 'Panel de control'; ws.getCell('A2').font = fuenteXl({ size: 18, bold: true }); fila(2, 30);
    ws.mergeCells('A3:D3'); ws.getCell('A3').value = 'Estado de la etapa productiva de los aprendices'; ws.getCell('A3').font = fuenteXl({ color: { argb: GRIS } });
    ws.mergeCells('A4:D4'); ws.getCell('A4').value = generado; ws.getCell('A4').font = fuenteXl({ size: 8.5, color: { argb: TENUE } });
    for (let c = 1; c <= 4; c++) bajo(fila(4).getCell(c), ACENTO, 'medium');

    const cifras: [string, number | string, string?, string?][][] = [
      [['Aprendices', r.total], ['En etapa productiva', stats.activas, `${r.pct.activas}%`], ['Certificadas', stats.certificadas, `${r.pct.certificadas}%`], ['Desertadas', stats.desertadas, `${r.pct.desertadas}%`]],
      [['Tasa de éxito', r.casosResueltos ? r.tasaExito / 100 : '—', r.casosResueltos ? `de ${r.casosResueltos} resueltos` : '', r.casosResueltos ? colorTasa(r.tasaExito) : undefined],
       ['En riesgo', stats.enRiesgo, `${r.pct.enRiesgo}%`, stats.enRiesgo ? 'FFB45309' : undefined],
       ['Requieren atención', r.atencion.length, '', r.atencion.length ? 'FFB91C1C' : 'FF15803D'],
       ['Otros estados', r.otros, `${r.pct.otros}%`]],
    ];
    let f = 6;
    cifras.forEach((grupo) => {
      grupo.forEach(([etq, valor, det, color], i) => {
        const v = fila(f).getCell(i + 1);
        v.value = valor as any;
        v.font = fuenteXl({ size: 20, bold: true, color: { argb: color ?? XL.TX } });
        v.alignment = { horizontal: 'left', vertical: 'bottom' };
        if (etq === 'Tasa de éxito' && typeof valor === 'number') v.numFmt = '0%';
        const e = fila(f + 1).getCell(i + 1);
        e.value = det ? `${etq.toUpperCase()} · ${det}` : etq.toUpperCase();
        e.font = fuenteXl({ size: 8, bold: true, color: { argb: GRIS } });
        bajo(e);
      });
      fila(f, 30);
      f += 3;
    });

    rotulo(`A${f}`, 'Hallazgos');
    f++;
    r.hallazgos.forEach((h) => {
      ws.mergeCells(`A${f}:D${f}`);
      const c = ws.getCell(`A${f}`);
      c.value = { richText: [
        { text: '■  ', font: { name: 'Calibri', size: 8, color: { argb: ACENTO } } },
        ...(h.fuerte ? [{ text: `${h.fuerte} `, font: { name: 'Calibri', size: 10, bold: true, color: { argb: XL.TX } } }] : []),
        { text: h.texto, font: { name: 'Calibri', size: 10, color: { argb: XL.TX } } },
      ] };
      c.alignment = { wrapText: true, vertical: 'top' };
      fila(f, 18);
      f++;
    });
    f++;

    /** Tabla chica dentro del Resumen (encabezado gris + filas con línea abajo). */
    const tablita = (titulo: string, cab: string[], filas: (string | number)[][], formato: (fila: ExcelJS.Row, i: number) => void) => {
      rotulo(`A${f}`, titulo);
      f++;
      cab.forEach((t, i) => {
        const c = fila(f).getCell(i + 1);
        c.value = t.toUpperCase();
        c.font = fuenteXl({ size: 8.5, bold: true, color: { argb: GRIS } });
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUAVE } };
        c.alignment = { horizontal: i ? 'center' : 'left', vertical: 'middle' };
        bajo(c, LINEA_F, 'medium');
      });
      fila(f, 20);
      f++;
      const desde = f;
      filas.forEach((vals, i) => {
        const rw = fila(f, 18);
        vals.forEach((v, ci) => {
          const c = rw.getCell(ci + 1);
          c.value = v;
          c.font = fuenteXl();
          c.alignment = { horizontal: ci ? 'center' : 'left', vertical: 'middle' };
          bajo(c);
        });
        formato(rw, i);
        f++;
      });
      f++;
      return { desde, hasta: f - 2 };
    };
    const barra = (ref: string, argb = 'FF2D6A0F') => ws.addConditionalFormatting({
      ref,
      rules: [{ type: 'dataBar', priority: 1, gradient: false, minLength: 0, maxLength: 100,
        cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb } } as any],
    });

    const dist = tablita('Distribución por estado', ['Estado', 'Total', 'Porcentaje'],
      r.distribucion.map((d) => [d.etiqueta, d.valor, d.pct / 100]),
      (rw, i) => {
        rw.getCell(3).numFmt = '0%';
        rw.getCell(1).value = { richText: [
          { text: '●  ', font: { name: 'Calibri', size: 10, color: { argb: r.distribucion[i].argb } } },
          { text: r.distribucion[i].etiqueta, font: { name: 'Calibri', size: 10, color: { argb: XL.TX } } },
        ] };
      });
    barra(`C${dist.desde}:C${dist.hasta}`);

    const rit = tablita('Ritmo: inicios y cierres previstos', ['Mes', 'Inicios', 'Cierres previstos'],
      r.ritmo.labels.map((m, i) => [m, r.ritmo.inicios[i], r.ritmo.cierres[i]]),
      (rw, i) => { if (i === r.ritmo.actual) rw.eachCell((c) => (c.font = fuenteXl({ bold: true }))); });
    barra(`B${rit.desde}:B${rit.hasta}`);
    barra(`C${rit.desde}:C${rit.hasta}`, 'FF94A3B8');
    ws.getCell(`A${f - 1}`).value = 'Seis meses atrás y cinco adelante; el mes actual va en negrita.';
    ws.getCell(`A${f - 1}`).font = fuenteXl({ size: 8, italic: true, color: { argb: TENUE } });

    // ── Requieren atención ──────────────────────────────────────────────────
    const wsA = this.hojaExcel(wb, 'Requieren atención', `${subtitulo} · ${r.atencion.length} prácticas`, `${subtitulo} · ${generado}`,
      [
        { titulo: 'Prioridad', ancho: 11, tipo: 'negrita' }, { titulo: 'Aprendiz', ancho: 30, tipo: 'negrita' }, { titulo: 'Identificación', ancho: 15 },
        { titulo: 'Programa', ancho: 30 }, { titulo: 'Ficha', ancho: 11 }, { titulo: 'Empresa', ancho: 24 }, { titulo: 'Estado', ancho: 13, tipo: 'estado' },
        { titulo: 'Motivo', ancho: 52 }, { titulo: 'Avance', ancho: 10, tipo: 'porcentaje' },
      ],
      r.atencion.map((a) => [a.prioridad, a.nombre, a.identificacion, a.programa, a.ficha, a.empresa, a.estado, a.motivo, a.avance === null ? '—' : a.avance / 100]),
      'Ninguna práctica requiere atención inmediata.');
    r.atencion.forEach((a, i) => (wsA.getRow(5 + i).getCell(1).font = fuenteXl({ bold: true, color: { argb: a.prioridad === 'Alta' ? 'FFB91C1C' : 'FFB45309' } })));

    // ── Por programa ────────────────────────────────────────────────────────
    const wsP = this.hojaExcel(wb, 'Por programa', subtitulo, `${subtitulo} · ${generado}`,
      [
        { titulo: 'Programa', ancho: 44, tipo: 'negrita' }, { titulo: 'Aprendices', ancho: 12, tipo: 'numero' },
        { titulo: 'Activas', ancho: 10, tipo: 'numero' }, { titulo: 'Certificadas', ancho: 13, tipo: 'numero' },
        { titulo: 'Desertadas', ancho: 12, tipo: 'numero' }, { titulo: 'En riesgo', ancho: 11, tipo: 'numero' },
        { titulo: 'Tasa de éxito', ancho: 14, tipo: 'porcentaje' },
      ],
      r.porPrograma.map((p) => [p.programa, p.total, p.activas, p.certificadas, p.desertadas, p.enRiesgo, p.tasa === null ? '—' : p.tasa / 100]),
      'No hay prácticas registradas.');
    r.porPrograma.forEach((p, i) => {
      if (p.tasa !== null) wsP.getRow(5 + i).getCell(7).font = fuenteXl({ bold: true, color: { argb: colorTasa(p.tasa) } });
      if (p.desertadas > 0) wsP.getRow(5 + i).getCell(5).font = fuenteXl({ color: { argb: 'FFB91C1C' } });
    });

    // ── Por empresa ─────────────────────────────────────────────────────────
    this.hojaExcel(wb, 'Por empresa', subtitulo, `${subtitulo} · ${generado}`,
      [
        { titulo: 'Empresa', ancho: 40, tipo: 'negrita' }, { titulo: 'Aprendices', ancho: 12, tipo: 'numero' },
        { titulo: 'Activas', ancho: 10, tipo: 'numero' }, { titulo: 'Certificadas', ancho: 13, tipo: 'numero' },
        { titulo: 'Desertadas', ancho: 12, tipo: 'numero' },
      ],
      r.porEmpresa.map((e) => [e.empresa, e.total, e.activas, e.certificadas, e.desertadas]),
      'No hay empresas registradas.');

    // ── Prácticas ───────────────────────────────────────────────────────────
    const wsL = this.hojaExcel(wb, 'Prácticas', subtitulo, `${subtitulo} · ${generado}`,
      [
        { titulo: 'Aprendiz', ancho: 30, tipo: 'negrita' }, { titulo: 'Identificación', ancho: 15 }, { titulo: 'Ficha', ancho: 11 },
        { titulo: 'Programa', ancho: 34 }, { titulo: 'Empresa', ancho: 28 }, { titulo: 'Estado', ancho: 14, tipo: 'estado' },
        { titulo: 'Inicio', ancho: 12, tipo: 'fecha' }, { titulo: 'Fin', ancho: 12, tipo: 'fecha' },
        { titulo: 'Días para el fin', ancho: 14, tipo: 'numero' }, { titulo: 'Avance', ancho: 10, tipo: 'porcentaje' }, { titulo: 'Observación', ancho: 36 },
      ],
      r.practicas.map((p: any) => {
        const sigue = ['activa', 'enRiesgo'].includes(categorizarEstado(p.estado));
        const dias = sigue ? diasHasta(p.fecha_fin) : null;
        return [
          p.nombre ?? '—', String(p.identificacion ?? p.documento ?? '—'), p.ficha ?? '—', p.programa ?? '—', p.empresaNombre ?? '—',
          etiquetaEstado(p.estado), fechaXl(p.fecha_inicio), fechaXl(p.fecha_fin), dias ?? '—',
          typeof p.avance === 'number' ? p.avance / 100 : '—', p.observacion || '—',
        ];
      }),
      'No hay prácticas registradas.');
    if (r.practicas.length) {
      const ultima = 4 + r.practicas.length;
      // Días para el fin: rojo si ya venció (y sigue activa), ámbar si quedan 30 o menos.
      wsL.addConditionalFormatting({
        ref: `I5:I${ultima}`,
        rules: [
          { type: 'cellIs', operator: 'lessThan', formulae: ['0'], priority: 1, style: { font: { color: { argb: 'FFB91C1C' }, bold: true } } } as any,
          { type: 'cellIs', operator: 'between', formulae: ['0', '30'], priority: 2, style: { font: { color: { argb: 'FFB45309' }, bold: true } } } as any,
        ],
      });
      wsL.addConditionalFormatting({
        ref: `J5:J${ultima}`,
        rules: [{ type: 'dataBar', priority: 3, gradient: false, minLength: 0, maxLength: 100,
          cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF2D6A0F' } } as any],
      });
      wsL.views = [{ state: 'frozen', ySplit: 4, xSplit: 1, showGridLines: false }];
    }

    await this.descargarExcel(wb, `panel-etapa-productiva-${hoyLocal()}.xlsx`);
  }

  /**
   * Hoja de datos con el estilo de informe: título (fila 1) con línea de acento,
   * subtítulo (2), encabezado gris con filtros (4, inmovilizado) y datos desde
   * la 5. Estados en texto de color, fechas reales y lista para imprimir.
   */
  private hojaExcel(wb: ExcelJS.Workbook, titulo: string, subtitulo: string, pie: string, cols: ColXl[], filas: any[][], vacio = 'Sin registros.'): ExcelJS.Worksheet {
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

  private async descargarExcel(wb: ExcelJS.Workbook, nombre: string): Promise<void> {
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
  exportarHistorialPDF(resultado: ResultadoConsulta, personasMap: Map<string, string>): void {
    const { estudiante, historial, practicas } = resultado;
    const inf = new InformePdf({ marca: 'Plataforma académica · SENA', tipo: 'Historial del aprendiz' });
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
    const wb = new ExcelJS.Workbook();
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