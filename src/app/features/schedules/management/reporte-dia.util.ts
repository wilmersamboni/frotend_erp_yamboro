import { to12h as to12hUtil } from '../../../core/utils/horarios.util';
import { InformePdf, TINTA, RGB, hoyLocal } from '../../../shared/utils/informe-pdf';

const jornadaLabel: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
const tipoLabel:    Record<string, string> = { formativo: 'Formativo', institucional: 'Institucional', evaluacion: 'Evaluación', festivo: 'Festivo' };

/**
 * Genera y descarga el "Reporte del Día" como PDF.
 *
 * Contenido (revisión anterior): tasas además de conteos (% puntualidad, %
 * ambientes en uso), "activos ahora", desglose por jornada y paginación.
 * Formato (2026-10-01): mismo estilo de informe que el historial del aprendiz
 * (shared/utils/informe-pdf.ts) — sin franjas ni cifras de colores, y los
 * horarios agrupados por jornada en vez de una sola tabla con columna "Jornada".
 *
 * Limitación conocida (no resuelta acá): la fecha/hora usada es la del
 * navegador del usuario, no la del servidor.
 */
export function descargarReporteDia(
  horariosEnriquecidos: any[],
  todosLosEventos: any[],
  totalAmbientes: number,
  institucion: string,
  generadoPor: string,
): void {
  const hoy = new Date();
  // Fecha LOCAL: con toISOString() (UTC), después de las 7 p. m. en Colombia ya era "mañana"
  // y los eventos del día se filtraban con la fecha equivocada.
  const today = hoyLocal(hoy);
  const fechaLabel = hoy.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const horaLabel  = to12hUtil(`${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}`);
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

  // ── Métricas derivadas ─────────────────────────────────────────────────
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
  const jornadasKeys = ['manana', 'tarde', 'noche'] as const;
  const resumenJornada = jornadasKeys
    .map(j => {
      const enJornada = horariosHoy.filter((h: any) => h.jornada === j);
      const conRetrasoJ = enJornada.filter((h: any) => h.minutosRetraso > 0);
      return {
        clave: j as string,
        jornada: jornadaLabel[j],
        total: enJornada.length,
        activos: enJornada.filter((h: any) => h.activo).length,
        conRetraso: conRetrasoJ.length,
        pct: enJornada.length ? Math.round((conRetrasoJ.length / enJornada.length) * 100) : 0,
      };
    })
    .filter(r => r.total > 0);

  // ── Documento ──────────────────────────────────────────────────────────
  const inf = new InformePdf({ marca: `Horarios · ${institucion}`, tipo: 'Reporte diario de horarios' });
  const fechaCap = fechaLabel.charAt(0).toUpperCase() + fechaLabel.slice(1);
  inf.encabezado('Reporte del día', fechaCap, `Generado a las ${horaLabel} por ${generadoPor}`);

  // Puntualidad: el único número con color (texto, no fondo), porque es el que dice si el día va bien.
  const colorPuntualidad: RGB = pctPuntualidad >= 90 ? TINTA.ok : pctPuntualidad >= 75 ? TINTA.alerta : TINTA.error;
  inf.cifras([
    { valor: totalHorarios, etiqueta: 'Programados' },
    { valor: activosAhora.length, etiqueta: 'Activos ahora' },
    { valor: finalizados.length, etiqueta: 'Finalizados' },
  ]);
  inf.cifras([
    { valor: `${pctPuntualidad}%`, etiqueta: 'Puntualidad', color: colorPuntualidad },
    { valor: ambientesEnUso, etiqueta: 'Ambientes en uso', detalle: `de ${totalAmbientes || 0}` },
    { valor: eventosHoy.length, etiqueta: 'Eventos hoy' },
  ]);

  // Severidad del retraso: un conteo no distingue "3 clases con 5 min" de "3 con 45 min".
  if (conRetraso.length > 0) {
    inf.texto(
      `${conRetraso.length} ${conRetraso.length === 1 ? 'clase inició' : 'clases iniciaron'} con retraso  ·  promedio ${retrasoPromedio} min  ·  máximo ${retrasoMax} min`,
      inf.mg, inf.y - 1, { size: 8.6, color: TINTA.error },
    );
    inf.y += 5;
  } else if (totalHorarios > 0) {
    inf.texto('Todas las clases iniciaron a tiempo.', inf.mg, inf.y - 1, { size: 8.6, color: TINTA.ok });
    inf.y += 5;
  }

  // ── 1. Resumen por jornada ─────────────────────────────────────────────
  if (resumenJornada.length > 0) {
    inf.seccion('1', 'Resumen por jornada');
    inf.tabla(['Jornada', 'Horarios', 'Activos ahora', 'Con retraso', '% con retraso'],
      resumenJornada.map(r => [r.jornada, r.total, r.activos, r.conRetraso, `${r.pct}%`]),
      {
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' } },
        didParseCell: (d: any) => {
          if (d.section === 'head' && d.column.index >= 1) d.cell.styles.halign = 'center';
          if (d.section === 'body' && d.column.index >= 3 && resumenJornada[d.row.index]?.conRetraso > 0) d.cell.styles.textColor = TINTA.error;
        },
      });
  }

  // ── 2. Horarios del día, por jornada ───────────────────────────────────
  const n = resumenJornada.length > 0 ? 2 : 1;
  inf.seccion(String(n), 'Horarios del día');
  if (!horariosHoy.length) inf.vacio('No hay horarios programados para hoy.');

  const grupos = [
    ...resumenJornada.map(r => ({ titulo: r.jornada, filas: horariosHoy.filter((h: any) => h.jornada === r.clave) })),
    { titulo: 'Sin jornada', filas: horariosHoy.filter((h: any) => !jornadaLabel[h.jornada]) },
  ].filter(g => g.filas.length > 0);

  grupos.forEach((g, i) => {
    const retrasos = g.filas.filter((h: any) => h.minutosRetraso > 0).length;
    inf.subseccion(`${n}.${i + 1}`, g.titulo,
      `${g.filas.length} horario${g.filas.length !== 1 ? 's' : ''}${retrasos ? `  ·  ${retrasos} con retraso` : ''}`, 34);
    inf.tabla(['Horario', 'Instructor', 'Ficha / programa', 'Ambiente', 'Estado', 'Retraso'],
      g.filas.map((h: any) => {
        const instr = `${h.instructor?.nombre ?? ''} ${h.instructor?.apellido ?? ''}`.trim() || '—';
        const ficha = h.ficha ? `${h.ficha.codigo}${h.ficha.programa ? `\n${h.ficha.programa}` : ''}` : '—';
        const ambNombre = h.ambiente?.nombre ?? h.ubicacionTransversalNombre;
        const esTransversal = !!h.instructor?.esTransversal;
        const amb = ambNombre
          ? (esTransversal ? `${ambNombre} (transversal)` : ambNombre)
          : (esTransversal ? 'Transversal' : '—');
        const est = h.activo ? 'Activo' : (h.ultimaActivacion ? 'Finalizado' : 'Sin iniciar');
        // Vacío sin retraso: el ojo va directo a las filas que sí tienen algo que mirar.
        const ret = h.minutosRetraso > 0 ? `${h.minutosRetraso} min` : '';
        return [`${to12hUtil(h.horaInicio)} – ${to12hUtil(h.horaFin)}`, instr, ficha, amb, est, ret];
      }),
      {
        // Anchos fijos: así las columnas quedan alineadas entre las tablas de cada jornada.
        columnStyles: {
          0: { cellWidth: 35, fontStyle: 'bold' }, 1: { cellWidth: 28 }, 3: { cellWidth: 28 },
          4: { cellWidth: 21 }, 5: { cellWidth: 17, halign: 'right' },
        },
        didParseCell: (d: any) => {
          if (d.section === 'head' && d.column.index === 5) d.cell.styles.halign = 'right';
          if (d.section !== 'body') return;
          const v = String(d.cell.raw ?? '');
          if (d.column.index === 4) {
            d.cell.styles.textColor = v === 'Activo' ? TINTA.ok : v === 'Sin iniciar' ? TINTA.alerta : TINTA.gris;
            if (v === 'Activo') d.cell.styles.fontStyle = 'bold';
          }
          if (d.column.index === 5 && v) {
            d.cell.styles.textColor = TINTA.error;
            d.cell.styles.fontStyle = 'bold';
          }
        },
      });
  });

  // ── 3. Eventos del día ─────────────────────────────────────────────────
  inf.seccion(String(n + 1), 'Eventos del día');
  if (eventosHoy.length) {
    // Sin columna de descripción: texto libre de largo variable que rompía el ancho de la tabla.
    inf.tabla(['Horario', 'Evento', 'Tipo', 'Lugar', 'Fichas'],
      eventosHoy.map((ev: any) => [
        ev.horaInicio ? `${to12hUtil(ev.horaInicio)} – ${to12hUtil(ev.horaFin)}` : 'Todo el día',
        ev.nombre ?? '—',
        tipoLabel[ev.tipo] ?? ev.tipo ?? '—',
        (ev.ubicacionNombre ?? ev.lugar ?? '—') + (ev.ubicacionArea ? ` — ${ev.ubicacionArea}` : ''),
        (ev.fichasParticipantes ?? []).length,
      ]),
      {
        columnStyles: { 0: { cellWidth: 36, fontStyle: 'bold' }, 1: { fontStyle: 'bold' }, 2: { cellWidth: 24 }, 3: { cellWidth: 32 }, 4: { cellWidth: 15, halign: 'center' } },
        didParseCell: (d: any) => { if (d.section === 'head' && d.column.index === 4) d.cell.styles.halign = 'center'; },
      });
  } else {
    inf.vacio('No hay eventos programados para hoy.');
  }

  inf.terminar({ izquierda: `Documento de uso interno  ·  Generado por ${generadoPor}`, derechaEncabezado: fechaCap });
  inf.doc.save(`reporte-horarios-${today}.pdf`);
}
