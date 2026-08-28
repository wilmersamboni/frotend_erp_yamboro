import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as ExcelJS from 'exceljs';
import { Stats, DonaStats, categorizarEstado } from './stats.service';
import { ResultadoConsulta } from '../../shared/models/estudiante.model';

/** Charts ya renderizados + datos para gráficos nativos de Excel. */
export interface GraficosExport {
  imgEstados?: string;
  imgEvolucion?: string;
  estadosResumen?: Array<{
    key: string; label: string; total: number; porcentaje: number;
    icon: string; color: string; bg: string;
  }>;
  /** Datos mensuales para gráficos nativos de Excel (acumulados). */
  evolucionMensual?: {
    labels: string[];
    activas: number[];
    certificadas: number[];
  };
}

@Injectable({ providedIn: 'root' })
export class ExportService {

  // ── Paleta corporativa unificada ──────────────────────────────────────────
  private readonly C = {
    verde:      '#39A900', verdeOsc:   '#1F6300', verdeClaro:  '#DCF5CE',
    azul:       '#1D4ED8', azulClaro:  '#DBEAFE', azulSuave:   '#EFF6FF',
    naranja:    '#EA580C', naranjaClaro:'#FFEDD5', morado:      '#7E22CE',
    moradoClaro:'#F3E8FF', gris:       '#F1F5F9', grisMedio:   '#E2E8F0',
    grisOsc:    '#64748B', blanco:     '#FFFFFF', texto:       '#1E293B',
    textoClaro: '#94A3B8', rojo:       '#DC2626', rojoClaro:   '#FEE2E2',
    amarillo:   '#D97706', amarilloClaro:'#FEF9C3', teal:       '#0D9488',
    tealClaro:  '#CCFBF1',
  } as const;

  // ── Utilidades de color ───────────────────────────────────────────────────
  private hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  }

  private rgbStr(hex: string): string {
    const [r, g, b] = this.hexToRgb(hex);
    return `${r},${g},${b}`;
  }

  /** Formato con separadores de miles (es-CO). */
  private fmt(n: number): string {
    return n.toLocaleString('es-CO');
  }

  /** Devuelve color de fondo claro para una celda de estado en PDF/Excel. */
  private estadoBg(estado: string): string {
    const e = (estado ?? '').toLowerCase().trim();
    if (['activo','activa','en_curso','en curso','inactivo'].includes(e))    return this.C.azulClaro;
    if (['certificado','certificada','por certificar'].includes(e))          return this.C.verdeClaro;
    if (['desercion','desertado','desertada','deserción','cancelado'].includes(e)) return this.C.rojoClaro;
    if (['suspendido','suspendida','condicionado'].includes(e))              return this.C.amarilloClaro;
    if (['retiro voluntario','retiro_voluntario'].includes(e))               return this.C.naranjaClaro;
    return this.C.gris;
  }

  /** Devuelve color de texto oscuro para un estado. */
  private estadoFg(estado: string): string {
    const e = (estado ?? '').toLowerCase().trim();
    if (['activo','activa','en_curso','en curso','inactivo'].includes(e))    return '#1E40AF';
    if (['certificado','certificada','por certificar'].includes(e))          return '#166534';
    if (['desercion','desertado','desertada','deserción','cancelado'].includes(e)) return '#991B1B';
    if (['suspendido','suspendida','condicionado'].includes(e))              return '#92400E';
    if (['retiro voluntario','retiro_voluntario'].includes(e))               return '#9A3412';
    return this.C.texto;
  }

  /** Dimensiones naturales de una imagen base64. */
  private getImageDims(dataUrl?: string): Promise<{ width: number; height: number }> {
    return new Promise(resolve => {
      if (!dataUrl) { resolve({ width: 4, height: 3 }); return; }
      const img = new Image();
      img.onload  = () => resolve({ width: img.naturalWidth || 4, height: img.naturalHeight || 3 });
      img.onerror = () => resolve({ width: 4, height: 3 });
      img.src = dataUrl;
    });
  }

  /** Encaja dentro de maxW × maxH preservando proporción. */
  private fitBox(nat: { width: number; height: number }, maxW: number, maxH: number) {
    const ratio = (nat.width || 1) / (nat.height || 1);
    let w = maxW, h = maxW / ratio;
    if (h > maxH) { h = maxH; w = maxH * ratio; }
    return { w, h };
  }

  /** Calcula evolución mensual acumulada desde las prácticas. */
  private computeEvolucion(practicas: any[]): { labels: string[]; activas: number[]; certificadas: number[] } {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const act = new Array(12).fill(0);
    const cert = new Array(12).fill(0);
    practicas.forEach(p => {
      if (!p.fecha_inicio) return;
      const m = new Date(p.fecha_inicio).getMonth();
      if (isNaN(m)) return;
      const cat = categorizarEstado(p.estado);
      if (cat === 'activa') act[m]++;
      else if (cat === 'certificada') cert[m]++;
    });
    let aA = 0, aC = 0;
    return { labels: meses, activas: act.map(v => aA += v), certificadas: cert.map(v => aC += v) };
  }

  // ── Helpers de dibujo PDF ─────────────────────────────────────────────────

  /** Barra de sección tipo ribbon con viñeta. */
  private ribbon(doc: jsPDF, texto: string, color: string, y: number, margin: number): number {
    const [cr, cg, cb] = this.hexToRgb(color);
    doc.setFillColor(cr, cg, cb);
    doc.rect(margin, y, doc.internal.pageSize.getWidth() - margin * 2, 8.5, 'F');
    doc.setFillColor(255, 255, 255);
    doc.circle(margin + 5, y + 4.25, 3, 'F');
    doc.setFillColor(cr, cg, cb);
    doc.circle(margin + 5, y + 4.25, 1.6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(texto.toUpperCase(), margin + 11, y + 5.8);
    return y + 8.5;
  }

  /** Barra horizontal de progreso (fondo gris + relleno de color). */
  private drawHBar(
    doc: jsPDF, x: number, y: number, w: number, h: number,
    pct: number, color: string, radius = 1
  ): void {
    // Fondo
    doc.setFillColor(...this.hexToRgb(this.C.grisMedio));
    doc.roundedRect(x, y, w, h, radius, radius, 'F');
    // Relleno
    if (pct > 0) {
      const fillW = Math.max(h, (pct / 100) * w); // mínimo = alto para que no se deforme el redondeo
      doc.setFillColor(...this.hexToRgb(color));
      doc.roundedRect(x, y, Math.min(fillW, w), h, radius, radius, 'F');
    }
  }

  /** Arco circular de progreso tipo "gauge" (fondo + arco de color + texto central). */
  private drawArc(
    doc: jsPDF, cx: number, cy: number, r: number,
    pct: number, color: string, lineWidth = 3.5
  ): void {
    // Fondo completo
    doc.setDrawColor(...this.hexToRgb(this.C.grisMedio));
    doc.setLineWidth(lineWidth);
    doc.circle(cx, cy, r, 'S');
    // Arco de progreso
    if (pct > 0) {
      const start = -Math.PI / 2;
      const end   = start + (Math.min(pct, 100) / 100) * 2 * Math.PI;
      doc.setDrawColor(...this.hexToRgb(color));
      doc.setLineWidth(lineWidth);
      (doc as any).arc(cx, cy, r, start, end, 'S');
    }
  }

  /** Verifica si hay espacio, si no salta de página. */
  private ensureSpace(doc: jsPDF, y: number, needed: number, margin: number): number {
    if (y + needed > doc.internal.pageSize.getHeight() - 18) {
      doc.addPage();
      return margin + 4;
    }
    return y;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PDF
  // ══════════════════════════════════════════════════════════════════════════
  async exportarPDF(
    stats: Stats,
    etapaActiva: DonaStats,
    etapaCertificada: DonaStats,
    practicas: any[],
    graficos?: GraficosExport
  ): Promise<void> {
    const doc = new jsPDF();
    const pw  = doc.internal.pageSize.getWidth();
    const ph  = doc.internal.pageSize.getHeight();
    const m   = 12;
    const fecha = new Date().toLocaleDateString('es-CO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const [dimsEst, dimsEvol] = await Promise.all([
      this.getImageDims(graficos?.imgEstados),
      this.getImageDims(graficos?.imgEvolucion),
    ]);

    // ── Porcentajes para resumen ejecutivo ──────────────────────────────────
    const total         = Math.max(stats.aprendices, 1);
    const pctActivas    = Math.round((stats.activas / total) * 100);
    const pctCertific   = Math.round((stats.certificadas / total) * 100);
    const pctDesert     = Math.round((stats.desertadas / total) * 100);
    const pctEnRiesgo   = Math.round((stats.enRiesgo / total) * 100);
    // Tasa de éxito solo sobre casos ya RESUELTOS (certificadas vs.
    // desertadas) — antes incluía "activas" (etapas aún en curso, sin
    // resultado definitivo) en el denominador, lo que diluía la tasa con
    // casos que ni siquiera han terminado.
    const casosResueltos = stats.certificadas + stats.desertadas;
    const tasaExito      = casosResueltos > 0 ? Math.round((stats.certificadas / casosResueltos) * 100) : 0;

    const es = (y: number, n: number) => this.ensureSpace(doc, y, n, m);

    // ── Encabezado: doble banda + triángulo + emblema SENA ─────────────────
    doc.setFillColor(...this.hexToRgb(this.C.verdeOsc));
    doc.rect(0, 0, pw, 36, 'F');
    doc.setFillColor(...this.hexToRgb(this.C.verde));
    doc.rect(0, 0, pw, 30, 'F');
    doc.setFillColor(...this.hexToRgb(this.C.verdeOsc));
    doc.triangle(pw - 46, 0, pw, 0, pw, 36, 'F');
    // Emblema
    doc.setFillColor(255, 255, 255);
    doc.circle(pw - 24, 18, 13, 'F');
    doc.setTextColor(...this.hexToRgb(this.C.verdeOsc));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('SENA', pw - 24, 20, { align: 'center' });
    // Textos
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(19);
    doc.text('PANEL DE CONTROL', m, 14);
    doc.setFontSize(11.5);
    doc.text('Etapa Productiva — Reporte Estadístico', m, 21.5);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado el ${fecha}  ·  Sistema de Gestión de Etapa Productiva`, m, 27.5);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.6);
    doc.line(m, 32, pw - m - 40, 32);

    let y = 46;

    // ── KPI Cards con mini barras de progreso ──────────────────────────────
    y = this.ribbon(doc, 'Resumen General', this.C.verdeOsc, y, m);
    y += 6;

    const kpis = [
      { label: 'Total Aprendices',    value: stats.aprendices,   color: this.C.verde,   pct: 100, sub: 'matriculados' },
      { label: 'Etapas Activas',      value: stats.activas,      color: this.C.azul,    pct: pctActivas, sub: `${pctActivas}% del total` },
      { label: 'Etapas Desertadas',   value: stats.desertadas,   color: this.C.naranja, pct: pctDesert, sub: `${pctDesert}% del total` },
      { label: 'Etapas Certificadas', value: stats.certificadas, color: this.C.morado,  pct: pctCertific, sub: `${pctCertific}% del total` },
    ];

    const gap = 4;
    const cw  = (pw - m * 2 - gap * 3) / 4;
    const ch  = 34;

    kpis.forEach((k, i) => {
      const x = m + i * (cw + gap);
      // Sombra
      doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
      doc.setFillColor(0, 0, 0);
      doc.roundedRect(x + 1.2, y + 1.6, cw, ch, 3, 3, 'F');
      doc.setGState(new (doc as any).GState({ opacity: 1 }));
      // Card
      doc.setFillColor(...this.hexToRgb(k.color));
      doc.roundedRect(x, y, cw, ch, 3, 3, 'F');
      // Número
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text(this.fmt(k.value), x + 7, y + 15);
      // Label
      doc.setFontSize(8.5);
      doc.text(k.label, x + 7, y + 22);
      // Sub
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(k.sub, x + 7, y + 27);
      // Mini barra de progreso
      this.drawHBar(doc, x + 7, y + 30, cw - 14, 2.2, k.pct, '#FFFFFF');
    });

    y += ch + 10;

    // ── Resumen Ejecutivo ──────────────────────────────────────────────────
    const resumenH = 30;
    y = es(y, resumenH + 10);
    doc.setFillColor(...this.hexToRgb(this.C.azulSuave));
    doc.setDrawColor(...this.hexToRgb(this.C.azul));
    doc.setLineWidth(0.5);
    doc.roundedRect(m, y, pw - m * 2, resumenH, 2, 2, 'FD');
    // Icono
    doc.setFillColor(...this.hexToRgb(this.C.azul));
    doc.roundedRect(m + 4, y + 4, 3, resumenH - 8, 1, 1, 'F');
    // Texto
    doc.setTextColor(...this.hexToRgb(this.C.texto));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Resumen Ejecutivo', m + 10, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    const enRiesgoTxt = stats.enRiesgo > 0
      ? ` ${this.fmt(stats.enRiesgo)} (${pctEnRiesgo}%) están suspendidas o condicionadas y requieren seguimiento.`
      : '';
    const resumenTxt = `De un total de ${this.fmt(stats.aprendices)} aprendices, ${this.fmt(stats.activas)} (${pctActivas}%) se encuentran con etapa activa, ${this.fmt(stats.certificadas)} (${pctCertific}%) han culminado exitosamente y ${this.fmt(stats.desertadas)} (${pctDesert}%) han desertado.${enRiesgoTxt} La tasa de éxito entre casos ya resueltos (certificadas vs. desertadas) es del ${tasaExito}%.`;
    const lines = doc.splitTextToSize(resumenTxt, pw - m * 2 - 20);
    doc.text(lines, m + 10, y + 13);
    y += resumenH + 10;

    // ── Distribución por Estado (dona + barras horizontales) ────────────────
    const resumenEst = graficos?.estadosResumen ?? [];
    // La leyenda dibuja una fila de 12mm por estado (ver "ly += 12" abajo).
    // panelH1 estaba fijo en 64 (calculado para los 4 estados originales) —
    // al agregar "En riesgo" la quinta fila (Otros) quedaba dibujada por
    // debajo del borde inferior del recuadro. Ahora crece según la cantidad
    // real de estados que traiga estadosResumen, con 60 como piso (alto
    // mínimo para que la dona de 42mm siga cabiendo con margen).
    const panelH1 = Math.max(60, 16 + resumenEst.length * 12);
    y = es(y, panelH1 + 10);
    doc.setFillColor(...this.hexToRgb('#F8FAFC'));
    doc.setDrawColor(...this.hexToRgb(this.C.grisMedio));
    doc.setLineWidth(0.4);
    doc.roundedRect(m, y, pw - m * 2, panelH1, 3, 3, 'FD');
    const p1Top = y;
    y = this.ribbon(doc, 'Distribución por Estado', this.C.azul, y, m);

    if (graficos?.imgEstados && resumenEst.length) {
      // Dona real
      const box = this.fitBox(dimsEst, 68, 42);
      try { doc.addImage(graficos.imgEstados, 'PNG', m + 6, y + 8, box.w, box.h); } catch { /* */ }

      // Leyenda con barras horizontales
      const lx = m + 80;
      const barW = 50;
      let ly = y + 10;

      resumenEst.forEach(item => {
        // Color dot
        doc.setFillColor(...this.hexToRgb(item.color));
        doc.roundedRect(lx, ly - 3, 4, 4, 1, 1, 'F');
        // Label
        doc.setTextColor(...this.hexToRgb(this.C.texto));
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(item.label, lx + 7, ly);
        // Barra horizontal
        const barY = ly + 2;
        this.drawHBar(doc, lx + 7, barY, barW, 3, item.porcentaje, item.color);
        // Valor
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...this.hexToRgb(this.C.grisOsc));
        doc.text(`${this.fmt(item.total)}  ·  ${item.porcentaje}%`, lx + 7 + barW + 4, barY + 2.8);
        ly += 12;
      });
    } else {
      autoTable(doc, {
        startY: y + 4,
        head: [['Estado', 'Total', 'Porcentaje']],
        body: resumenEst.length
          ? resumenEst.map(i => [i.label, i.total, `${i.porcentaje}%`])
          : [
              ['En etapa productiva (activas)', etapaActiva.total, `${etapaActiva.porcentaje}%`],
              ['Etapas certificadas', etapaCertificada.total, `${etapaCertificada.porcentaje}%`],
            ],
        headStyles: { fillColor: this.hexToRgb(this.C.azul), textColor: 255 },
        alternateRowStyles: { fillColor: this.hexToRgb(this.C.azulClaro) },
        styles: { fontSize: 9 },
        margin: { left: m + 6, right: m + 6 },
      });
    }
    y = p1Top + panelH1 + 10;

    // ── Indicadores de Gestión: dos arcos circulares ───────────────────────
    const panelH2 = 56;
    y = es(y, panelH2 + 10);
    doc.setFillColor(...this.hexToRgb('#F8FAFC'));
    doc.setDrawColor(...this.hexToRgb(this.C.grisMedio));
    doc.setLineWidth(0.4);
    doc.roundedRect(m, y, pw - m * 2, panelH2, 3, 3, 'FD');
    const p2Top = y;
    y = this.ribbon(doc, 'Indicadores de Gestión', this.C.verdeOsc, y, m);
    y += 4;

    const arcR = 15;
    const arcY = y + arcR + 2;
    const arcSpacing = (pw - m * 2) / 2;

    // Arco 1 — Etapa Activa
    const cx1 = m + arcSpacing / 2;
    this.drawArc(doc, cx1, arcY, arcR, etapaActiva.porcentaje, this.C.azul, 3.5);
    doc.setTextColor(...this.hexToRgb(this.C.texto));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${etapaActiva.porcentaje}%`, cx1, arcY + 3, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...this.hexToRgb(this.C.grisOsc));
    doc.text('Etapa Activa', cx1, arcY + arcR + 7, { align: 'center' });
    doc.setFontSize(7.5);
    doc.text(`de ${this.fmt(etapaActiva.total)} aprendices`, cx1, arcY + arcR + 12, { align: 'center' });

    // Arco 2 — Etapa Certificada
    const cx2 = m + arcSpacing + arcSpacing / 2;
    this.drawArc(doc, cx2, arcY, arcR, etapaCertificada.porcentaje, this.C.verde, 3.5);
    doc.setTextColor(...this.hexToRgb(this.C.texto));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${etapaCertificada.porcentaje}%`, cx2, arcY + 3, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...this.hexToRgb(this.C.grisOsc));
    doc.text('Etapa Certificada', cx2, arcY + arcR + 7, { align: 'center' });
    doc.setFontSize(7.5);
    doc.text(`de ${this.fmt(etapaCertificada.total)} aprendices`, cx2, arcY + arcR + 12, { align: 'center' });

    // Tasa de éxito — badge central
    const badgeX = pw / 2;
    const badgeY = arcY;
    doc.setFillColor(...this.hexToRgb(this.C.verde));
    doc.roundedRect(badgeX - 22, badgeY - 8, 44, 20, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`${tasaExito}%`, badgeX, badgeY + 2, { align: 'center' });
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text('TASA DE ÉXITO', badgeX, badgeY + 8, { align: 'center' });

    y = p2Top + panelH2 + 10;

    // ── Evolución Mensual ──────────────────────────────────────────────────
    const panelH3 = 68;
    y = es(y, panelH3 + 10);
    doc.setFillColor(...this.hexToRgb('#F8FAFC'));
    doc.setDrawColor(...this.hexToRgb(this.C.grisMedio));
    doc.setLineWidth(0.4);
    doc.roundedRect(m, y, pw - m * 2, panelH3, 3, 3, 'FD');
    const p3Top = y;
    y = this.ribbon(doc, 'Evolución Mensual Acumulada', this.C.verdeOsc, y, m);

    if (graficos?.imgEvolucion) {
      const box = this.fitBox(dimsEvol, pw - m * 2 - 12, panelH3 - 14);
      try { doc.addImage(graficos.imgEvolucion, 'PNG', m + 6, y + 6, box.w, box.h); } catch { /* */ }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(130, 130, 130);
      doc.text('Gráfico no disponible en este reporte.', m + 6, y + 12);
    }
    y = p3Top + panelH3 + 10;

    // ── Listado Detallado de Prácticas ─────────────────────────────────────
    doc.addPage();
    y = 16;
    y = this.ribbon(doc, 'Listado Detallado de Prácticas', this.C.verdeOsc, y, m);
    y += 4;

    const filas = practicas.map((p: any) => [
      p.nombre         ?? '—',
      p.identificacion ?? p.documento ?? '—',
      p.ficha          ?? '—',
      p.programa       ?? '—',
      p.estado         ?? '—',
      p.fecha_inicio   ?? '—',
      p.fecha_fin      ?? '—',
      p.empresaNombre  ?? '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Nombre', 'Identificación', 'Ficha', 'Programa', 'Estado', 'Inicio', 'Fin', 'Empresa']],
      body: filas,
      theme: 'grid',
      headStyles: {
        fillColor: this.hexToRgb(this.C.verdeOsc), textColor: 255, fontSize: 8,
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: this.hexToRgb(this.C.verdeClaro) },
      styles: {
        fontSize: 7.5, cellPadding: 2.4,
        lineColor: [203, 213, 225], lineWidth: 0.15,
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 20 },
        2: { cellWidth: 15 },
        3: { cellWidth: 35 },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 20, halign: 'center' },
        6: { cellWidth: 20, halign: 'center' },
        7: { cellWidth: 25 },
      },
      /** Colorea la celda de Estado según su valor. */
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const estado = String(data.cell.raw);
          const bg = this.estadoBg(estado);
          const fg = this.estadoFg(estado);
          doc.setFillColor(...this.hexToRgb(bg));
          doc.rect(data.cell.x + 0.1, data.cell.y + 0.1, data.cell.width - 0.2, data.cell.height - 0.2, 'F');
          doc.setTextColor(...this.hexToRgb(fg));
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.text(estado, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
        }
      },
    });

    // ── Fila resumen al final de la tabla ──────────────────────────────────
    const finalY = (doc as any).lastAutoTable?.finalY ?? y;
    const sumY = es(finalY + 2, 10);
    doc.setFillColor(...this.hexToRgb(this.C.verdeOsc));
    doc.roundedRect(m, sumY, pw - m * 2, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`Total: ${this.fmt(practicas.length)} prácticas registradas`, m + 6, sumY + 5.5);
    doc.text(`Tasa de éxito: ${tasaExito}%`, pw - m - 50, sumY + 5.5);

    // ── Pie de página en todas las páginas ─────────────────────────────────
    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFillColor(...this.hexToRgb(this.C.verdeOsc));
      doc.rect(0, ph - 10, pw, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('Panel de Control · Etapa Productiva · SENA', m, ph - 4);
      doc.text(`Página ${i} de ${pages}`, pw - m - 28, ph - 4);
    }

    doc.save(`estadisticas_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  EXCEL
  // ══════════════════════════════════════════════════════════════════════════
  async exportarExcel(
    stats: Stats,
    etapaActiva: DonaStats,
    etapaCertificada: DonaStats,
    practicas: any[],
    graficos?: GraficosExport
  ): Promise<void> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Panel de Control SENA';
    wb.created = new Date();

    const V      = '39A900';
    const V_OSC  = '1F6300';
    const V_CL   = 'DCF5CE';
    const A      = '1D4ED8';
    const A_CL   = 'DBEAFE';
    const N      = 'EA580C';
    const N_CL   = 'FFEDD5';
    const M      = '7E22CE';
    const M_CL   = 'F3E8FF';
    const G      = 'F5F5F5';
    const W      = 'FFFFFF';
    const T      = '212121';

    const evolucion = graficos?.evolucionMensual ?? this.computeEvolucion(practicas);
    const resumenEst = graficos?.estadosResumen ?? [];

    // ── Helpers de formato reutilizables ────────────────────────────────────
    const seccion = (ws: ExcelJS.Worksheet, texto: string, color: string, f: number, maxCol: string) => {
      ws.mergeCells(`A${f}:${maxCol}${f}`);
      const c = ws.getCell(`A${f}`);
      c.value = texto;
      c.font  = { name: 'Calibri', size: 11, bold: true, color: { argb: W } };
      c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      c.alignment = { horizontal: 'left', indent: 1 };
      ws.getRow(f).height = 24;
    };

    const enc = (ws: ExcelJS.Worksheet, cols: string[], f: number, color: string) => {
      const row = ws.getRow(f);
      cols.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.font  = { name: 'Calibri', size: 10, bold: true, color: { argb: W } };
        c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = thinBorder('BDBDBD');
      });
      row.height = 22;
    };

    const fila = (ws: ExcelJS.Worksheet, vals: any[], f: number, alt: boolean, altColor: string) => {
      const row = ws.getRow(f);
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.font  = { name: 'Calibri', size: 10, color: { argb: T } };
        c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: alt ? altColor : W } };
        c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', indent: i === 0 ? 1 : 0 };
        c.border = thinBorder('E0E0E0');
      });
      row.height = 20;
    };

    const thinBorder = (color: string): Partial<ExcelJS.Borders> => ({
      top:    { style: 'thin', color: { argb: color } },
      bottom: { style: 'thin', color: { argb: color } },
      left:   { style: 'thin', color: { argb: color } },
      right:  { style: 'thin', color: { argb: color } },
    });

    const total = Math.max(stats.aprendices, 1);
    const pctA  = Math.round((stats.activas / total) * 100);
    const pctC  = Math.round((stats.certificadas / total) * 100);
    const pctD  = Math.round((stats.desertadas / total) * 100);
    // Tasa de éxito solo sobre casos ya resueltos (certificadas vs.
    // desertadas) — ver misma corrección en exportarPDF().
    const casosResueltos = stats.certificadas + stats.desertadas;
    const tasaExito = casosResueltos > 0 ? Math.round((stats.certificadas / casosResueltos) * 100) : 0;

    // ══════════════════════════════════════════════════════════════════════
    // HOJA 1 — DASHBOARD
    // ══════════════════════════════════════════════════════════════════════
    const ws1 = wb.addWorksheet('Dashboard', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
    });
    ws1.columns = [
      { key: 'A', width: 22 }, { key: 'B', width: 16 }, { key: 'C', width: 16 },
      { key: 'D', width: 22 }, { key: 'E', width: 16 }, { key: 'F', width: 16 },
    ];

    // Título
    ws1.mergeCells('A1:F1');
    const tit = ws1.getCell('A1');
    tit.value = 'PANEL DE CONTROL — ETAPA PRODUCTIVA';
    tit.font  = { name: 'Calibri', size: 16, bold: true, color: { argb: W } };
    tit.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: V } };
    tit.alignment = { vertical: 'middle', horizontal: 'center' };
    ws1.getRow(1).height = 38;

    // Fecha
    ws1.mergeCells('A2:F2');
    const fc = ws1.getCell('A2');
    fc.value = `Generado el ${new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    fc.font  = { name: 'Calibri', size: 10, italic: true, color: { argb: W } };
    fc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: V_OSC } };
    fc.alignment = { horizontal: 'center' };
    ws1.getRow(2).height = 22;

    // ── KPI Cards (grande, a todo el ancho) ──────────────────────────────────
    let f = 4;
    seccion(ws1, '  RESUMEN GENERAL', V_OSC, f++, 'F');
    enc(ws1, ['Indicador', 'Valor', '%', '', 'Indicador', 'Valor'], f++, V_OSC);

    const kpiPairs: Array<[string, number, number, string, number]> = [
      ['Total Aprendices',      stats.aprendices,   100,  'Etapas Activas',      stats.activas],
      ['Etapas Desertadas',     stats.desertadas,   pctD,  'Etapas Certificadas', stats.certificadas],
    ];
    kpiPairs.forEach(([l1, v1, p1, l2, v2], i) => {
      const fn = f++;
      // Izquierda
      ws1.getCell(`A${fn}`).value = l1;
      ws1.getCell(`B${fn}`).value = v1;
      ws1.getCell(`B${fn}`).numFmt = '#,##0';
      ws1.getCell(`B${fn}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: T } };
      ws1.getCell(`C${fn}`).value = p1 / 100;
      ws1.getCell(`C${fn}`).numFmt = '0%';
      // Derecha
      ws1.getCell(`D${fn}`).value = l2;
      ws1.getCell(`E${fn}`).value = v2;
      ws1.getCell(`E${fn}`).numFmt = '#,##0';
      ws1.getCell(`E${fn}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: T } };
      ws1.getCell(`F${fn}`).value = l2.includes('Activas') ? pctA / 100 : pctC / 100;
      ws1.getCell(`F${fn}`).numFmt = '0%';
      // Formato fila
      [1,2,3,4,5,6].forEach(col => {
        const c = ws1.getCell(`${String.fromCharCode(64 + col)}${fn}`);
        c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? V_CL : W } };
        c.border = thinBorder('E0E0E0');
        c.alignment = { vertical: 'middle', indent: col === 1 || col === 4 ? 1 : 0, horizontal: col === 1 || col === 4 ? 'left' : 'center' };
      });
      ws1.getRow(fn).height = 24;
    });

    // Tasa de éxito — fila destacada
    f++;
    ws1.mergeCells(`A${f}:F${f}`);
    const tCell = ws1.getCell(`A${f}`);
    tCell.value = `Tasa de éxito (certificadas / casos resueltos): ${tasaExito}%  —  ${this.fmt(stats.certificadas)} de ${this.fmt(casosResueltos)}`;
    tCell.font  = { name: 'Calibri', size: 11, bold: true, color: { argb: W } };
    tCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: V } };
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(f).height = 28;
    f += 2;

    // ── Distribución por Estado ─────────────────────────────────────────────
    seccion(ws1, '  DISTRIBUCIÓN POR ESTADO', A, f++, 'F');
    enc(ws1, ['Estado', 'Total', 'Porcentaje', '', '', ''], f++, A);

    const distRows: Array<[string, number, number, string]> = resumenEst.length
      ? resumenEst.map(it => [it.label, it.total, it.porcentaje / 100, it.color.replace('#', '')])
      : [
          ['En etapa productiva (activas)', etapaActiva.total,      etapaActiva.porcentaje / 100,      A],
          ['Etapas certificadas',           etapaCertificada.total, etapaCertificada.porcentaje / 100, V],
        ];

    distRows.forEach(([label, tot, pct, colHex], i) => {
      const fn = f++;
      ws1.getCell(`A${fn}`).value = label;
      ws1.getCell(`B${fn}`).value = tot;
      ws1.getCell(`B${fn}`).numFmt = '#,##0';
      ws1.getCell(`C${fn}`).value = pct;
      ws1.getCell(`C${fn}`).numFmt = '0%';
      ws1.getCell(`C${fn}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: T } };
      [1, 2, 3].forEach(col => {
        const c = ws1.getCell(`${String.fromCharCode(64 + col)}${fn}`);
        c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? A_CL : W } };
        c.border = thinBorder('E0E0E0');
        c.alignment = { vertical: 'middle', indent: col === 1 ? 1 : 0, horizontal: col === 1 ? 'left' : 'center' };
      });
      ws1.getRow(fn).height = 20;
    });

    // Data bars para la columna de porcentaje
    if (distRows.length) {
      ws1.addConditionalFormatting({
        ref: `C${f - distRows.length}:C${f - 1}`,
        rules: [{
          type: 'dataBar', priority: 1, gradient: false,
          minLength: 0, maxLength: 100,
          cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }],
          color: { argb: 'FF1D4ED8' },
        } as any],
      });
    }

    // Imagen de la dona (a la derecha de la tabla)
    if (graficos?.imgEstados) {
      const box = this.fitBox(await this.getImageDims(graficos.imgEstados), 280, 160);
      const imgId = wb.addImage({ base64: graficos.imgEstados, extension: 'png' });
      ws1.addImage(imgId, { tl: { col: 3.3, row: f - distRows.length - 1 + 0.2 }, ext: { width: box.w, height: box.h } });
    }

    f += 2;

    // ── Evolución Mensual (datos + imagen) ──────────────────────────────────
    seccion(ws1, '  EVOLUCIÓN MENSUAL ACUMULADA', V_OSC, f++, 'F');
    enc(ws1, ['Mes', 'Activas (acum.)', 'Certificadas (acum.)', '', '', ''], f++, V_OSC);

    const evolStartRow = f;
    evolucion.labels.forEach((mes, i) => {
      const fn = f++;
      ws1.getCell(`A${fn}`).value = mes;
      ws1.getCell(`B${fn}`).value = evolucion.activas[i];
      ws1.getCell(`C${fn}`).value = evolucion.certificadas[i];
      [1, 2, 3].forEach(col => {
        const c = ws1.getCell(`${String.fromCharCode(64 + col)}${fn}`);
        c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? V_CL : W } };
        c.border = thinBorder('E0E0E0');
        c.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'center' };
      });
      ws1.getRow(fn).height = 18;
    });

    // Imagen del chart de línea
    if (graficos?.imgEvolucion) {
      const boxL = this.fitBox(await this.getImageDims(graficos.imgEvolucion), 520, 200);
      const imgL = wb.addImage({ base64: graficos.imgEvolucion, extension: 'png' });
      ws1.addImage(imgL, { tl: { col: 3.3, row: evolStartRow - 1 + 0.2 }, ext: { width: boxL.w, height: boxL.h } });
    }

    // ══════════════════════════════════════════════════════════════════════
    // HOJA 2 — GRÁFICOS NATIVOS DE EXCEL
    // ══════════════════════════════════════════════════════════════════════
    const wsG = wb.addWorksheet('Gráficos', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    });
    wsG.columns = [
      { width: 20 }, { width: 14 }, { width: 14 }, { width: 3 },
      { width: 20 }, { width: 14 }, { width: 14 },
    ];

    // Título
    wsG.mergeCells('A1:G1');
    const tG = wsG.getCell('A1');
    tG.value = 'GRÁFICOS ESTADÍSTICOS';
    tG.font  = { name: 'Calibri', size: 14, bold: true, color: { argb: W } };
    tG.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: V } };
    tG.alignment = { horizontal: 'center', vertical: 'middle' };
    wsG.getRow(1).height = 32;

    // ── Datos para gráfico de barras: Distribución ──────────────────────────
    wsG.getCell('A3').value = 'Estado';
    wsG.getCell('B3').value = 'Total';
    wsG.getCell('A3').font = { bold: true };
    wsG.getCell('B3').font = { bold: true };

    resumenEst.forEach((item, i) => {
      wsG.getCell(`A${4 + i}`).value = item.label;
      wsG.getCell(`B${4 + i}`).value = item.total;
    });
    const distEndRow = 3 + resumenEst.length;

    // ── Datos para gráfico de líneas: Evolución ─────────────────────────────
    wsG.getCell('E3').value = 'Mes';
    wsG.getCell('F3').value = 'Activas';
    wsG.getCell('G3').value = 'Certificadas';
    ['E3','F3','G3'].forEach(r => { wsG.getCell(r).font = { bold: true }; });

    evolucion.labels.forEach((mes, i) => {
      wsG.getCell(`E${4 + i}`).value = mes;
      wsG.getCell(`F${4 + i}`).value = evolucion.activas[i];
      wsG.getCell(`G${4 + i}`).value = evolucion.certificadas[i];
    });
    const evolEndRow = 3 + evolucion.labels.length;

    // ── Insertar gráficos nativos ───────────────────────────────────────────
    try {
      // Gráfico de barras — Distribución por Estado
      (wsG as any).addChart({
        type: 'col',
        data: {
          labels: `A4:A${distEndRow}`,
          datasets: [{
            label: 'Total por Estado',
            values: `B4:B${distEndRow}`,
          }],
        },
        options: {
          title: {
            text: 'Distribución por Estado de Etapas Productivas',
            font: { size: 13, bold: true, color: '1E293B' },
          },
          legend: { position: 'bottom' },
          seriesColors: resumenEst.map(e => e.color.replace('#', '')),
          xAxis: {
            title: { text: 'Estado', font: { size: 10 } },
            labelFont: { size: 9 },
          },
          yAxis: {
            title: { text: 'Cantidad', font: { size: 10 } },
            labelFont: { size: 9 },
            majorGridlines: { color: 'E2E8F0' },
          },
          dataLabels: { showValue: true, font: { size: 9, bold: true } },
        },
      } as any);

      // Gráfico de líneas — Evolución Mensual
      (wsG as any).addChart({
        type: 'line',
        data: {
          labels: `E4:E${evolEndRow}`,
          datasets: [
            {
              label: 'Etapas Activas (acum.)',
              values: `F4:F${evolEndRow}`,
            },
            {
              label: 'Etapas Certificadas (acum.)',
              values: `G4:G${evolEndRow}`,
            },
          ],
        },
        options: {
          title: {
            text: 'Evolución Mensual Acumulada',
            font: { size: 13, bold: true, color: '1E293B' },
          },
          legend: { position: 'bottom' },
          seriesColors: ['39A900', '1D4ED8'],
          xAxis: {
            title: { text: 'Mes', font: { size: 10 } },
            labelFont: { size: 9 },
          },
          yAxis: {
            title: { text: 'Cantidad acumulada', font: { size: 10 } },
            labelFont: { size: 9 },
            majorGridlines: { color: 'E2E8F0' },
            beginAtZero: true,
          },
          lineMarkers: true,
        },
      } as any);
    } catch (err) {
      console.warn('No se pudieron insertar gráficos nativos de Excel, se usan imágenes:', err);
      // Fallback: insertar imágenes
      if (graficos?.imgEstados) {
        const boxE = this.fitBox(await this.getImageDims(graficos.imgEstados), 480, 280);
        wsG.addImage(wb.addImage({ base64: graficos.imgEstados, extension: 'png' }), {
          tl: { col: 0.2, row: 2.5 }, ext: { width: boxE.w, height: boxE.h },
        });
      }
      if (graficos?.imgEvolucion) {
        const boxL = this.fitBox(await this.getImageDims(graficos.imgEvolucion), 480, 280);
        wsG.addImage(wb.addImage({ base64: graficos.imgEvolucion, extension: 'png' }), {
          tl: { col: 0.2, row: 17 }, ext: { width: boxL.w, height: boxL.h },
        });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // HOJA 3 — PRÁCTICAS
    // ══════════════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet('Prácticas', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    });
    ws2.columns = [
      { key: 'nombre', width: 28 }, { key: 'identificacion', width: 16 },
      { key: 'ficha', width: 14 },  { key: 'programa', width: 36 },
      { key: 'estado', width: 16 },  { key: 'fecha_inicio', width: 15 },
      { key: 'fecha_fin', width: 15 }, { key: 'empresaNombre', width: 28 },
      { key: 'avance', width: 14 },  { key: 'observacion', width: 32 },
    ];

    // Título
    ws2.mergeCells('A1:J1');
    const t2 = ws2.getCell('A1');
    t2.value = 'LISTADO DETALLADO DE PRÁCTICAS';
    t2.font  = { name: 'Calibri', size: 14, bold: true, color: { argb: W } };
    t2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: V } };
    t2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(1).height = 32;

    // Encabezados
    const cols2 = ['Nombre','Identificación','Ficha','Programa','Estado','Inicio','Fin','Empresa','Avance','Observación'];
    const hR = ws2.getRow(2);
    cols2.forEach((v, i) => {
      const c = hR.getCell(i + 1);
      c.value = v;
      c.font  = { name: 'Calibri', size: 10, bold: true, color: { argb: W } };
      c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: V_OSC } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = {
        top: { style: 'medium', color: { argb: V } },
        bottom: { style: 'medium', color: { argb: V } },
        left: { style: 'thin', color: { argb: W } },
        right: { style: 'thin', color: { argb: W } },
      };
    });
    hR.height = 24;

    // Datos
    practicas.forEach((p: any, i: number) => {
      const bgHex = this.estadoBg(p.estado).replace('#', '');
      const avance = typeof p.avance === 'number' ? p.avance / 100 : null;
      const row = ws2.addRow([
        p.nombre ?? '—', p.identificacion ?? '—', p.ficha ?? '—',
        p.programa ?? '—', p.estado ?? '—', p.fecha_inicio ?? '—',
        p.fecha_fin ?? '—', p.empresaNombre ?? '—', avance, p.observacion ?? '—',
      ]);
      row.height = 20;
      row.eachCell((cell, colNum) => {
        cell.font  = { name: 'Calibri', size: 9, color: { argb: T } };
        // La columna Estado (5) se colorea con el color del estado
        if (colNum === 5) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: this.estadoFg(p.estado).replace('#', '') } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? G : W } };
        }
        cell.alignment = {
          vertical: 'middle',
          horizontal: [1, 4, 10].includes(colNum) ? 'left' : 'center',
          wrapText: [4, 10].includes(colNum),
        };
        cell.border = thinBorder('E0E0E0');
      });
      if (avance !== null) row.getCell(9).numFmt = '0%';
    });

    // Fila de totales
    const totRow = ws2.addRow([`Total: ${this.fmt(practicas.length)} prácticas  ·  Tasa de éxito: ${tasaExito}%`, '', '', '', '', '', '', '', '', '']);
    ws2.mergeCells(`A${totRow.number}:J${totRow.number}`);
    const totCell = ws2.getCell(`A${totRow.number}`);
    totCell.font  = { name: 'Calibri', size: 10, bold: true, color: { argb: W } };
    totCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: V } };
    totCell.alignment = { horizontal: 'center' };
    totRow.height = 24;

    // Data bars para avance
    if (practicas.length) {
      ws2.addConditionalFormatting({
        ref: `I3:I${2 + practicas.length}`,
        rules: [{
          type: 'dataBar', priority: 1, gradient: false,
          minLength: 0, maxLength: 100,
          cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }],
          color: { argb: 'FF39A900' },
        } as any],
      });
    }

    ws2.autoFilter = { from: 'A2', to: 'J2' };
    ws2.views = [{ state: 'frozen', ySplit: 2 }];

    // ── Descargar ───────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href     = url;
    a.download = `estadisticas_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HISTORIAL DEL APRENDIZ — PDF (mejorado visualmente)
  // ══════════════════════════════════════════════════════════════════════════
  private nombreInstructor(id: string, map: Map<string, string>): string {
    return map.get(id) ?? 'Instructor no encontrado';
  }

  exportarHistorialPDF(resultado: ResultadoConsulta, personasMap: Map<string, string>): void {
    const { estudiante, historial, practicas } = resultado;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const mg = 14;
    const fecha = new Date().toLocaleDateString('es-CO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const es = (y: number, n: number) => {
      if (y + n > ph - mg) { doc.addPage(); return mg; }
      return y;
    };

    // ── Encabezado ──────────────────────────────────────────────────────────
    doc.setFillColor(...this.hexToRgb(this.C.verdeOsc));
    doc.rect(0, 0, pw, 30, 'F');
    doc.setFillColor(...this.hexToRgb(this.C.verde));
    doc.rect(0, 0, pw, 24, 'F');
    doc.setFillColor(...this.hexToRgb(this.C.verdeOsc));
    doc.triangle(pw - 36, 0, pw, 0, pw, 30, 'F');
    doc.setFillColor(255, 255, 255);
    doc.circle(pw - 18, 15, 9, 'F');
    doc.setTextColor(...this.hexToRgb(this.C.verdeOsc));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('SENA', pw - 18, 17, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(`Historial — ${estudiante.nombre} ${estudiante.apellido}`, mg, 12);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado el ${fecha}`, mg, 20);

    let y = 38;

    // ── Datos Personales ────────────────────────────────────────────────────
    y = this.ribbon(doc, 'Datos Personales', this.C.verdeOsc, y, mg);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [['Campo', 'Valor']],
      body: [
        ['Documento', estudiante.documento || '—'],
        ['Programa', estudiante.programa || '—'],
        ['Correo', estudiante.email || '—'],
        ['Teléfono', estudiante.telefono || '—'],
        ['Estado', estudiante.estado],
        ['Total Matrículas', String(historial.length)],
        ['Total Etapas Prácticas', String(practicas.length)],
      ],
      headStyles: { fillColor: this.hexToRgb(this.C.verdeOsc), textColor: 255 },
      alternateRowStyles: { fillColor: this.hexToRgb(this.C.verdeClaro) },
      styles: { fontSize: 9 },
      margin: { left: mg, right: mg },
      columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } },
    });
    y = (doc as any).lastAutoTable.finalY + 12;

    // ── Historial Académico ─────────────────────────────────────────────────
    y = es(y, 20);
    y = this.ribbon(doc, 'Historial Académico (Matrículas)', this.C.azul, y, mg);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [['Ficha', 'Programa', 'Periodo', 'Estado']],
      body: historial.length
        ? historial.map(h => [h.idCurso || '—', h.nombreCurso || '—', h.periodo || '—', h.estado])
        : [['—', 'Sin matrículas registradas', '—', '—']],
      headStyles: { fillColor: this.hexToRgb(this.C.azul), textColor: 255 },
      alternateRowStyles: { fillColor: this.hexToRgb(this.C.azulClaro) },
      styles: { fontSize: 9 },
      margin: { left: mg, right: mg },
    });
    y = (doc as any).lastAutoTable.finalY + 12;

    // ── Etapas Prácticas ────────────────────────────────────────────────────
    if (!practicas.length) {
      y = es(y, 10);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120, 120, 120);
      doc.text('El aprendiz no tiene etapa práctica registrada.', mg, y);
    }

    practicas.forEach((p, idx) => {
      y = es(y, 16);
      y = this.ribbon(doc, `Etapa Práctica ${idx + 1} — ${p.programa || 'Sin programa'} (${p.fichaCurso || '—'})`, this.C.verdeOsc, y, mg);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [['Empresa', 'Modalidad', 'Estado', 'Inicio', 'Fin']],
        body: [[
          p.empresa || '—', p.modalidad || '—', p.estado || '—',
          p.fechaInicio ? new Date(p.fechaInicio).toLocaleDateString('es-CO') : '—',
          p.fechaFin    ? new Date(p.fechaFin).toLocaleDateString('es-CO')    : '—',
        ]],
        headStyles: { fillColor: this.hexToRgb(this.C.verdeOsc), textColor: 255 },
        styles: { fontSize: 8.5 },
        margin: { left: mg, right: mg },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 2) {
            const estado = String(data.cell.raw);
            doc.setFillColor(...this.hexToRgb(this.estadoBg(estado)));
            doc.rect(data.cell.x + 0.1, data.cell.y + 0.1, data.cell.width - 0.2, data.cell.height - 0.2, 'F');
            doc.setTextColor(...this.hexToRgb(this.estadoFg(estado)));
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text(estado, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 6;

      // Instructores
      y = es(y, 14);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text('Instructores Asignados', mg + 2, y);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [['Instructor', 'Estado', 'Horas', 'Inicio', 'Fin']],
        body: p.asignaciones.length
          ? p.asignaciones.map(a => [
              this.nombreInstructor(a.instructor, personasMap), a.estado || '—',
              String(a.horas ?? 0),
              a.fechaInicio ? new Date(a.fechaInicio).toLocaleDateString('es-CO') : '—',
              a.fechaFin    ? new Date(a.fechaFin).toLocaleDateString('es-CO')    : '—',
            ])
          : [['—', 'Sin instructores asignados', '—', '—', '—']],
        headStyles: { fillColor: this.hexToRgb(this.C.morado), textColor: 255 },
        alternateRowStyles: { fillColor: this.hexToRgb(this.C.moradoClaro) },
        styles: { fontSize: 8 },
        margin: { left: mg, right: mg },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // Seguimientos
      p.seguimientos.forEach((s, idxS) => {
        y = es(y, 14);
        y = this.ribbon(doc, `Seguimiento ${idxS + 1} (${s.estado || '—'})`, this.C.azul, y, mg);
        y += 2;

        if (s.observacion) {
          y = es(y, 8);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 100, 100);
          const ln = doc.splitTextToSize(s.observacion, pw - mg * 2 - 4);
          doc.text(ln, mg + 4, y + 4);
          y += 4 + ln.length * 4;
        }

        autoTable(doc, {
          startY: y + 2,
          head: [['Bitácora — Fecha', 'Estado']],
          body: s.bitacoras.length
            ? s.bitacoras.map(b => [b.fecha ? new Date(b.fecha).toLocaleDateString('es-CO') : '—', b.estado || '—'])
            : [['—', 'Sin bitácoras']],
          headStyles: { fillColor: this.hexToRgb(this.C.azul), textColor: 255 },
          styles: { fontSize: 8 },
          margin: { left: mg + 4, right: mg },
          tableWidth: pw - mg * 2 - 4,
        });
        y = (doc as any).lastAutoTable.finalY + 3;

        autoTable(doc, {
          startY: y,
          head: [['Observación — Fecha', 'Descripción']],
          body: s.observaciones.length
            ? s.observaciones.map(o => [o.fecha ? new Date(o.fecha).toLocaleDateString('es-CO') : '—', o.descripcion || '—'])
            : [['—', 'Sin observaciones']],
          headStyles: { fillColor: this.hexToRgb(this.C.amarillo), textColor: 255 },
          styles: { fontSize: 8 },
          columnStyles: { 1: { cellWidth: pw - mg * 2 - 4 - 35 } },
          margin: { left: mg + 4, right: mg },
          tableWidth: pw - mg * 2 - 4,
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      });

      y += 4;
    });

    // ── Pie de página ───────────────────────────────────────────────────────
    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFillColor(...this.hexToRgb(this.C.verdeOsc));
      doc.rect(0, ph - 10, pw, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`Historial Aprendiz · SENA`, mg, ph - 4);
      doc.text(`Página ${i} de ${pages}`, pw - mg - 28, ph - 4);
    }

    const slug = `${estudiante.nombre}_${estudiante.apellido}`.trim().replace(/\s+/g, '_').toLowerCase() || 'aprendiz';
    doc.save(`historial_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HISTORIAL DEL APRENDIZ — EXCEL (mejorado visualmente)
  // ══════════════════════════════════════════════════════════════════════════
  async exportarHistorialExcel(resultado: ResultadoConsulta, personasMap: Map<string, string>): Promise<void> {
    const { estudiante, historial, practicas } = resultado;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EPSAS';
    wb.created = new Date();

    const V = '39A900', V_CL = 'DCF5CE', A = '1565C0', A_CL = 'DBEAFE';
    const M = '7E22CE', M_CL = 'F3E8FF', AM = 'D97706', AM_CL = 'FEF9C3';
    const W = 'FFFFFF', G = 'F5F5F5', T = '212121';

    const enc = (ws: ExcelJS.Worksheet, cols: string[], f: number, color: string) => {
      const row = ws.getRow(f);
      cols.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.font  = { name: 'Calibri', size: 10, bold: true, color: { argb: W } };
        c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.border = {
          top: { style: 'medium', color: { argb: color } },
          bottom: { style: 'medium', color: { argb: color } },
          left: { style: 'thin', color: { argb: W } },
          right: { style: 'thin', color: { argb: W } },
        };
      });
      row.height = 22;
    };

    const fil = (ws: ExcelJS.Worksheet, vals: any[], f: number, alt: boolean, altC: string) => {
      const row = ws.getRow(f);
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.font  = { name: 'Calibri', size: 9, color: { argb: T } };
        c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: alt ? altC : W } };
        c.alignment = { vertical: 'middle', wrapText: true };
        c.border = {
          top: { style: 'hair', color: { argb: 'E0E0E0' } },
          bottom: { style: 'hair', color: { argb: 'E0E0E0' } },
          left: { style: 'thin', color: { argb: 'E0E0E0' } },
          right: { style: 'thin', color: { argb: 'E0E0E0' } },
        };
      });
    };

    // ── Hoja 1: Resumen ─────────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Resumen');
    ws1.columns = [{ width: 26 }, { width: 42 }];
    ws1.mergeCells('A1:B1');
    const t1 = ws1.getCell('A1');
    t1.value = `Historial — ${estudiante.nombre} ${estudiante.apellido}`;
    t1.font  = { name: 'Calibri', size: 14, bold: true, color: { argb: W } };
    t1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: V } };
    t1.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(1).height = 34;

    const datos: [string, any][] = [
      ['Documento', estudiante.documento || '—'],
      ['Programa', estudiante.programa || '—'],
      ['Correo', estudiante.email || '—'],
      ['Teléfono', estudiante.telefono || '—'],
      ['Estado', estudiante.estado],
      ['Total Matrículas', historial.length],
      ['Total Etapas Prácticas', practicas.length],
    ];
    datos.forEach(([k, v], i) => {
      const fn = i + 3;
      ws1.getCell(`A${fn}`).value = k;
      ws1.getCell(`A${fn}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: T } };
      ws1.getCell(`B${fn}`).value = v;
      fil(ws1, [k, v], fn, i % 2 === 1, V_CL);
    });

    // ── Hoja 2: Matrículas ──────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Matrículas');
    ws2.columns = [{ width: 16 }, { width: 34 }, { width: 14 }, { width: 14 }];
    enc(ws2, ['Ficha', 'Programa', 'Periodo', 'Estado'], 1, A);
    historial.forEach((h, i) => fil(ws2, [h.idCurso, h.nombreCurso, h.periodo, h.estado], i + 2, i % 2 === 1, A_CL));

    // ── Hoja 3: Etapas y Asignaciones ───────────────────────────────────────
    const ws3 = wb.addWorksheet('Etapas y Asignaciones');
    ws3.columns = [
      { width: 14 }, { width: 26 }, { width: 22 }, { width: 16 }, { width: 14 },
      { width: 14 }, { width: 14 }, { width: 24 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 14 },
    ];
    enc(ws3, [
      'Ficha', 'Programa', 'Empresa', 'Modalidad', 'Estado Etapa', 'Inicio Etapa', 'Fin Etapa',
      'Instructor', 'Estado Asig.', 'Horas', 'Inicio Asig.', 'Fin Asig.',
    ], 1, M);
    let f3 = 2;
    practicas.forEach(p => {
      const base = [p.fichaCurso, p.programa, p.empresa, p.modalidad, p.estado, p.fechaInicio, p.fechaFin];
      if (!p.asignaciones.length) {
        fil(ws3, [...base, 'Sin instructor', '—', '—', '—', '—'], f3++, f3 % 2 === 0, M_CL);
      } else {
        p.asignaciones.forEach(a => {
          fil(ws3, [...base, this.nombreInstructor(a.instructor, personasMap), a.estado, a.horas, a.fechaInicio, a.fechaFin], f3++, f3 % 2 === 0, M_CL);
        });
      }
    });

    // ── Hoja 4: Seguimientos ────────────────────────────────────────────────
    const ws4 = wb.addWorksheet('Seguimientos');
    ws4.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 42 }, { width: 10 }];
    enc(ws4, ['Ficha', 'Estado', 'Inicio', 'Fin', 'Observación', 'Acta'], 1, A);
    let f4 = 2;
    practicas.forEach(p => {
      p.seguimientos.forEach(s => {
        fil(ws4, [p.fichaCurso, s.estado, s.fechaInicio, s.fechaFin, s.observacion || '—', s.actasPdf ? 'Sí' : 'No'], f4++, f4 % 2 === 0, A_CL);
      });
    });

    // ── Hoja 5: Bitácoras ──────────────────────────────────────────────────
    const ws5 = wb.addWorksheet('Bitácoras');
    ws5.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
    enc(ws5, ['Ficha', 'Seguimiento (inicio)', 'Fecha Bitácora', 'Estado'], 1, V);
    let f5 = 2;
    practicas.forEach(p => {
      p.seguimientos.forEach(s => {
        s.bitacoras.forEach(b => {
          fil(ws5, [p.fichaCurso, s.fechaInicio, b.fecha, b.estado], f5++, f5 % 2 === 0, V_CL);
        });
      });
    });

    // ── Hoja 6: Observaciones ──────────────────────────────────────────────
    const ws6 = wb.addWorksheet('Observaciones');
    ws6.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 52 }];
    enc(ws6, ['Ficha', 'Seguimiento (inicio)', 'Fecha', 'Descripción'], 1, AM);
    let f6 = 2;
    practicas.forEach(p => {
      p.seguimientos.forEach(s => {
        s.observaciones.forEach(o => {
          fil(ws6, [p.fichaCurso, s.fechaInicio, o.fecha, o.descripcion], f6++, f6 % 2 === 0, AM_CL);
        });
      });
    });

    // ── Descargar ───────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = `${estudiante.nombre}_${estudiante.apellido}`.trim().replace(/\s+/g, '_').toLowerCase() || 'aprendiz';
    a.download = `historial_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }
}