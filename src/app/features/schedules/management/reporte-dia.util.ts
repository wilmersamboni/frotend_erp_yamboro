import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { to12h as to12hUtil } from '../../../core/utils/horarios.util';

const NAVY  = '#1e3a5f';
const BLUE  = '#2563eb';
const GREEN = '#16a34a';
const RED   = '#dc2626';
const AMBER = '#d97706';
const GRAY  = '#6b7280';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const jornadaLabel: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
const tipoLabel:    Record<string, string> = { formativo: 'Formativo', institucional: 'Institucional', evaluacion: 'Evaluación', festivo: 'Festivo' };

/**
 * Genera y descarga el "Reporte del Día" como PDF (jsPDF + autoTable).
 *
 * Rediseñado a partir de una revisión de contenido: la versión anterior era
 * un listado crudo (conteos absolutos, sin contexto ni segmentación). Ahora
 * agrega tasas (% puntualidad, % ambientes en uso), un KPI de "activos
 * ahora" que antes no existía pese a calcularse por fila, un desglose por
 * jornada, y pie de página con paginación — ver conversación sobre mejoras
 * al reporte del día.
 *
 * Limitación conocida (no resuelta acá): la fecha/hora usada es la del
 * navegador del usuario, no la del servidor — sigue pendiente si algún día
 * se expone un endpoint/hora de servidor para leerla de forma confiable.
 */
export function descargarReporteDia(
  horariosEnriquecidos: any[],
  todosLosEventos: any[],
  totalAmbientes: number,
  institucion: string,
  generadoPor: string,
): void {
  const hoy = new Date();
  const today = hoy.toISOString().split('T')[0];
  const fechaLabel = hoy.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const horaLabel  = hoy.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const diaHoy = days[hoy.getDay()];

  const horariosHoy = horariosEnriquecidos
    .filter((h: any) => h.diaSemana === diaHoy)
    .sort((a: any, b: any) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''));

  const conRetraso   = horariosHoy.filter((h: any) => h.minutosRetraso > 0);
  const activosAhora = horariosHoy.filter((h: any) => h.activo);
  const finalizados  = horariosHoy.filter((h: any) => h.ultimaActivacion);

  const eventosHoy = todosLosEventos
    .filter((ev: any) => {
      if (!ev.fechaInicio) return false;
      const s = ev.fechaInicio.split('T')[0];
      const e = (ev.fechaFin ?? ev.fechaInicio).split('T')[0];
      return today >= s && today <= e;
    })
    .sort((a: any, b: any) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''));

  // ── Métricas derivadas — conteos absolutos solos no dicen si el día va
  // bien o mal; tasas + un punto de comparación (aquí, umbrales fijos de
  // puntualidad) es lo que las vuelve accionables. ──────────────────────
  const totalHorarios = horariosHoy.length;
  const pctPuntualidad = totalHorarios
    ? Math.round(((totalHorarios - conRetraso.length) / totalHorarios) * 100)
    : 100;
  const minutosRetrasoArr = conRetraso.map((h: any) => Number(h.minutosRetraso) || 0);
  const retrasoPromedio = minutosRetrasoArr.length
    ? Math.round(minutosRetrasoArr.reduce((a, b) => a + b, 0) / minutosRetrasoArr.length)
    : 0;
  const retrasoMax = minutosRetrasoArr.length ? Math.max(...minutosRetrasoArr) : 0;

  // Ambientes físicamente ocupados AHORA MISMO (instructores transversales
  // sin ambiente real asignado no cuentan — no ocupan un aula fija).
  const ambientesEnUso = new Set(
    horariosHoy
      .filter((h: any) => h.activo && (h.ambienteId || h.ambiente?.id))
      .map((h: any) => String(h.ambienteId ?? h.ambiente?.id))
  ).size;

  // ── Resumen por jornada ───────────────────────────────────────────────
  const jornadasKeys: Array<'manana' | 'tarde' | 'noche'> = ['manana', 'tarde', 'noche'];
  const resumenJornada = jornadasKeys
    .map(j => {
      const enJornada = horariosHoy.filter((h: any) => h.jornada === j);
      const conRetrasoJ = enJornada.filter((h: any) => h.minutosRetraso > 0);
      return {
        jornada: jornadaLabel[j],
        total: enJornada.length,
        conRetraso: conRetrasoJ.length,
        pct: enJornada.length ? Math.round((conRetrasoJ.length / enJornada.length) * 100) : 0,
      };
    })
    .filter(r => r.total > 0);

  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mg = 14;

  // ── Encabezado ──────────────────────────────────────────────────────────
  doc.setFillColor(...hexToRgb(NAVY));
  doc.rect(0, 0, pw, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(institucion.toUpperCase(), mg, 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Reporte Diario de Horarios', mg, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const fechaCap = fechaLabel.charAt(0).toUpperCase() + fechaLabel.slice(1);
  doc.text(`${fechaCap}  ·  Generado a las ${horaLabel} por ${generadoPor}`, mg, 25.5);

  // ── KPIs (2 filas x 3 columnas) ───────────────────────────────────────
  let y = 40;
  const pctColor = pctPuntualidad >= 90 ? GREEN : pctPuntualidad >= 75 ? AMBER : RED;
  const kpis: [string, string, string][] = [
    ['Programados',        String(totalHorarios), BLUE],
    ['Activos ahora',      String(activosAhora.length), GREEN],
    ['Finalizados',        String(finalizados.length), '#374151'],
    ['% Puntualidad',      `${pctPuntualidad}%`, pctColor],
    ['Ambientes en uso',   `${ambientesEnUso}/${totalAmbientes || 0}`, BLUE],
    ['Eventos hoy',        String(eventosHoy.length), AMBER],
  ];
  const cols = 3;
  const gap = 4;
  const cw = (pw - mg * 2 - gap * (cols - 1)) / cols;
  const rowH = 20;
  kpis.forEach(([label, value, color], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x  = mg + col * (cw + gap);
    const yy = y + row * (rowH + gap);
    doc.setDrawColor(...hexToRgb('#e5e7eb'));
    doc.setLineWidth(0.3);
    doc.roundedRect(x, yy, cw, rowH, 2, 2, 'S');
    doc.setTextColor(...hexToRgb(color));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(value, x + 6, yy + 11);
    doc.setTextColor(...hexToRgb(GRAY));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(label, x + 6, yy + 17);
  });
  const kpiRows = Math.ceil(kpis.length / cols);
  y += kpiRows * (rowH + gap) + 4;

  // Nota de severidad del retraso — un conteo de instancias no distingue
  // "3 clases con 5 min" de "3 clases con 45 min".
  if (conRetraso.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...hexToRgb(RED));
    doc.text(`Retraso promedio: ${retrasoPromedio} min  ·  Retraso máximo: ${retrasoMax} min`, mg, y);
    y += 8;
  } else {
    y += 2;
  }

  // ── Resumen por Jornada ───────────────────────────────────────────────
  if (resumenJornada.length > 0) {
    doc.setTextColor(...hexToRgb(NAVY));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Resumen por Jornada', mg, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      head: [['Jornada', 'Horarios', 'Con retraso', '% con retraso']],
      body: resumenJornada.map(r => [r.jornada, String(r.total), String(r.conRetraso), `${r.pct}%`]),
      headStyles: { fillColor: hexToRgb(NAVY), textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      margin: { left: mg, right: mg },
      tableWidth: pw - mg * 2,
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Horarios del Día (ordenados por hora) ──────────────────────────────
  if (y > ph - 60) { doc.addPage(); y = mg; }
  doc.setTextColor(...hexToRgb(NAVY));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Horarios del Día', mg, y);
  y += 3;

  const filasHor = horariosHoy.length
    ? horariosHoy.map((h: any) => {
        const instr = `${h.instructor?.nombre ?? ''} ${h.instructor?.apellido ?? ''}`.trim() || '—';
        const ficha = h.ficha ? `${h.ficha.codigo}\n${h.ficha.programa ?? ''}` : '—';
        const ambNombre = h.ambiente?.nombre ?? h.ubicacionTransversalNombre;
        const esTransversal = !!h.instructor?.esTransversal;
        const amb = ambNombre
          ? (esTransversal ? `${ambNombre} (transversal)` : ambNombre)
          : (esTransversal ? 'Transversal' : '—');
        const jorn = jornadaLabel[h.jornada] ?? h.jornada ?? '—';
        const hora = `${to12hUtil(h.horaInicio)} — ${to12hUtil(h.horaFin)}`;
        const est  = h.activo ? 'Activo' : (h.ultimaActivacion ? 'Finalizado' : 'Sin iniciar');
        // Antes mostraba "—" en cada fila sin atraso, repetido en toda la
        // columna — ruido visual. Vacío deja que el ojo vaya directo a las
        // filas que sí tienen algo que mirar.
        const ret  = h.minutosRetraso > 0 ? `${h.minutosRetraso} min` : '';
        return [instr, ficha, amb, jorn, hora, est, ret];
      })
    : [['Sin horarios registrados hoy', '', '', '', '', '', '']];

  autoTable(doc, {
    startY: y,
    head: [['Instructor', 'Ficha', 'Ambiente', 'Jornada', 'Horario', 'Estado', 'Retraso']],
    body: filasHor,
    headStyles: { fillColor: hexToRgb(NAVY), textColor: 255, fontSize: 8.5 },
    alternateRowStyles: { fillColor: hexToRgb('#f8fafc') },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    margin: { left: mg, right: mg },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const v = String(data.cell.raw ?? '');
        if (v === 'Activo')      data.cell.styles.textColor = hexToRgb(GREEN);
        else if (v === 'Finalizado') data.cell.styles.textColor = hexToRgb('#374151');
        else if (v === 'Sin iniciar') data.cell.styles.textColor = hexToRgb('#854d0e');
      }
      if (data.section === 'body' && data.column.index === 6 && String(data.cell.raw ?? '').includes('min')) {
        data.cell.styles.textColor = hexToRgb(RED);
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ── Eventos del Día (ordenados por hora) ───────────────────────────────
  if (y > ph - 40) { doc.addPage(); y = mg; }
  doc.setTextColor(...hexToRgb(NAVY));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Eventos del Día', mg, y);
  y += 3;

  // Sin columna de Descripción: texto libre de longitud variable que
  // rompía el ancho de la tabla — nombre/horario/lugar ya identifican el
  // evento para un resumen diario.
  const filasEv = eventosHoy.length
    ? eventosHoy.map((ev: any) => {
        const tipo = tipoLabel[ev.tipo] ?? ev.tipo ?? '—';
        const hora = ev.horaInicio ? `${to12hUtil(ev.horaInicio)} — ${to12hUtil(ev.horaFin)}` : '—';
        const fichas = (ev.fichasParticipantes ?? []).length;
        const lugarTxt = (ev.ubicacionNombre ?? ev.lugar ?? '—') + (ev.ubicacionArea ? ` — ${ev.ubicacionArea}` : '');
        return [ev.nombre ?? '—', tipo, hora, lugarTxt, String(fichas)];
      })
    : [['Sin eventos hoy', '', '', '', '']];

  autoTable(doc, {
    startY: y,
    head: [['Nombre', 'Tipo', 'Horario', 'Lugar', 'Fichas']],
    body: filasEv,
    headStyles: { fillColor: hexToRgb(NAVY), textColor: 255, fontSize: 8.5 },
    alternateRowStyles: { fillColor: hexToRgb('#f8fafc') },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    margin: { left: mg, right: mg },
    columnStyles: { 4: { halign: 'center' } },
  });

  // ── Pie de página en todas las páginas ─────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...hexToRgb('#e5e7eb'));
    doc.setLineWidth(0.2);
    doc.line(mg, ph - 12, pw - mg, ph - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...hexToRgb(GRAY));
    doc.text(`Documento de uso interno · Generado por ${generadoPor}`, mg, ph - 7);
    doc.text(`Página ${p} de ${totalPages}`, pw - mg, ph - 7, { align: 'right' });
  }

  doc.save(`reporte-${today}.pdf`);
}
