import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Estilo común de los informes PDF (historial del aprendiz, reporte del día de
 * horarios…): A4, una sola tinta de acento, todo lo demás en negro y grises,
 * secciones numeradas, tablas con líneas solo horizontales, encabezado corto en
 * las páginas 2+ y pie con paginación. Nada queda suelto al pie de una página:
 * títulos y cabeceras de tabla viajan con su contenido.
 *
 * Uso: `const inf = new InformePdf({ marca, tipo })`, ir llamando a
 * encabezado/cifras/seccion/tabla…, y al final `inf.terminar(pie)` + `inf.doc.save()`.
 */

export type RGB = [number, number, number];

export const TINTA = {
  texto:  [31, 41, 55] as RGB,
  gris:   [107, 114, 128] as RGB,
  tenue:  [156, 163, 175] as RGB,
  linea:  [229, 231, 235] as RGB,
  suave:  [249, 250, 251] as RGB,
  acento: [45, 106, 15] as RGB,
  // Para estados en texto (nunca como fondo).
  ok:     [21, 128, 61] as RGB,
  info:   [29, 78, 216] as RGB,
  alerta: [180, 83, 9] as RGB,
  error:  [185, 28, 28] as RGB,
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * "16 feb 2026". Una fecha pura (AAAA-MM-DD…) se toma tal cual: con new Date()
 * se lee como medianoche UTC y en Colombia (UTC-5) caía el día anterior.
 */
export function fechaInforme(valor?: string | null): string {
  if (!valor) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (m) return `${m[3]} ${MESES[+m[2] - 1] ?? m[2]} ${m[1]}`;
  const d = new Date(valor);
  return isNaN(d.getTime()) ? '—' : `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Fecha local AAAA-MM-DD (no la de UTC, que después de las 7 p. m. ya es mañana). */
export function hoyLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface OpcTexto { size?: number; bold?: boolean; italic?: boolean; color?: RGB; align?: 'left' | 'right' | 'center'; }

export class InformePdf {
  readonly doc = new jsPDF({ unit: 'mm', format: 'a4' });
  readonly pw = this.doc.internal.pageSize.getWidth();
  readonly ph = this.doc.internal.pageSize.getHeight();
  readonly mg = 18;
  readonly ancho = this.pw - this.mg * 2;
  /** Margen superior de las páginas 2+ (debajo del encabezado corto). */
  private readonly ARRIBA = 24;
  /** Espacio reservado para el pie. */
  private readonly ABAJO = 20;
  y = 0;

  constructor(private readonly o: { marca: string; tipo: string }) {}

  // ── Primitivas ──────────────────────────────────────────────────────────
  texto(t: string | string[], x: number, y: number, o: OpcTexto = {}): void {
    const d = this.doc;
    d.setFont('helvetica', o.bold ? 'bold' : o.italic ? 'italic' : 'normal');
    d.setFontSize(o.size ?? 9);
    d.setTextColor(...(o.color ?? TINTA.texto));
    d.text(t, x, y, { align: o.align ?? 'left' });
  }

  regla(y: number, color: RGB = TINTA.linea, grosor = 0.2, x1 = this.mg, x2 = this.pw - this.mg): void {
    this.doc.setDrawColor(...color);
    this.doc.setLineWidth(grosor);
    this.doc.line(x1, y, x2, y);
  }

  /** Líneas de un texto partido al ancho dado. */
  partir(t: string, ancho: number, size: number): string[] {
    return this.doc.setFontSize(size).splitTextToSize(t, ancho) as string[];
  }

  /** Salta de página si lo que sigue (n mm) no cabe. */
  asegurar(n: number): void {
    if (this.y + n > this.ph - this.ABAJO) { this.doc.addPage(); this.y = this.ARRIBA + 4; }
  }

  // ── Bloques ─────────────────────────────────────────────────────────────
  /** Cabecera de la primera página: marca, tipo de informe, título grande y subtítulos. */
  encabezado(titulo: string, subtitulo?: string, nota?: string): void {
    const { mg, pw } = this;
    this.texto('EPSAS', mg, 15, { size: 9, bold: true, color: TINTA.acento });
    this.texto(this.o.marca, mg + 12.5, 15, { size: 8, color: TINTA.gris });
    this.texto(this.o.tipo.toUpperCase(), pw - mg, 15, { size: 7.5, bold: true, color: TINTA.gris, align: 'right' });
    this.regla(18.5, TINTA.acento, 0.6);
    this.texto(titulo, mg, 30, { size: 19, bold: true });
    let y = 30;
    if (subtitulo) { y += 7; this.texto(subtitulo, mg, y, { size: 9.5, color: TINTA.gris }); }
    if (nota) { y += 5.5; this.texto(nota, mg, y, { size: 7.8, color: TINTA.tenue }); }
    this.y = y + 8;
  }

  /** Fila de cifras en recuadros (valor grande + etiqueta; detalle opcional a la derecha del valor). */
  cifras(items: { valor: string | number; etiqueta: string; detalle?: string; color?: RGB }[]): void {
    const sep = 4;
    const w = (this.ancho - sep * (items.length - 1)) / items.length;
    this.asegurar(20);
    items.forEach((c, i) => {
      const x = this.mg + i * (w + sep);
      this.doc.setDrawColor(...TINTA.linea).setLineWidth(0.3).setFillColor(255, 255, 255);
      this.doc.roundedRect(x, this.y, w, 17, 1.6, 1.6, 'FD');
      const valor = String(c.valor);
      this.texto(valor, x + 4, this.y + 8.6, { size: 15, bold: true, color: c.color });
      if (c.detalle) {
        this.doc.setFont('helvetica', 'bold').setFontSize(15);
        const anchoValor = this.doc.getTextWidth(valor);
        this.texto(c.detalle, x + 4 + anchoValor + 1.5, this.y + 8.6, { size: 7.5, color: TINTA.gris });
      }
      this.texto(c.etiqueta.toUpperCase(), x + 4, this.y + 13.6, { size: 6.6, bold: true, color: TINTA.gris });
    });
    this.y += 23;
  }

  /** Título de sección: número en acento + título + línea. */
  seccion(num: string, titulo: string, aparte = 18): void {
    this.asegurar(aparte);
    this.y += 4;
    this.texto(num, this.mg, this.y, { size: 10, bold: true, color: TINTA.acento });
    this.texto(titulo, this.mg + (num ? 7 : 0), this.y, { size: 11.5, bold: true });
    this.regla(this.y + 2.5);
    this.y += 9;
  }

  /** Subtítulo "3.1  Texto" con un dato opcional a la derecha. */
  subseccion(num: string, titulo: string, derecha?: string, aparte = 26): void {
    this.asegurar(aparte);
    this.y += 1;
    if (num) this.texto(num, this.mg, this.y, { size: 9.5, bold: true, color: TINTA.acento });
    this.texto(titulo, this.mg + (num ? 8 : 0), this.y, { size: 10, bold: true });
    if (derecha) this.texto(derecha, this.pw - this.mg, this.y, { size: 8, color: TINTA.gris, align: 'right' });
    this.y += 6;
  }

  /** Cuadrícula de dato/valor (etiqueta pequeña en gris, valor debajo). */
  datos(pares: [string, string][], columnas: number): void {
    const anchoCol = this.ancho / columnas;
    for (let i = 0; i < pares.length; i += columnas) {
      const fila = pares.slice(i, i + columnas);
      const lineas = fila.map(([, v]) => this.partir(v || '—', anchoCol - 4, 9.5));
      const alto = 5 + Math.max(...lineas.map((l) => l.length)) * 4.4;
      this.asegurar(alto + 2);
      fila.forEach(([etq], j) => {
        const x = this.mg + j * anchoCol;
        this.texto(etq.toUpperCase(), x, this.y, { size: 6.8, bold: true, color: TINTA.gris });
        this.texto(lineas[j], x, this.y + 4.6, { size: 9.5 });
      });
      this.y += alto + 2;
    }
  }

  /** Recuadro gris claro con borde de acento a la izquierda (observaciones, notas). */
  nota(etiqueta: string, cuerpo: string): void {
    const lineas = this.partir(cuerpo, this.ancho - 6, 8.8);
    this.asegurar(8 + lineas.length * 4);
    const { doc, mg, ancho } = this;
    doc.setFillColor(...TINTA.suave);
    doc.rect(mg, this.y - 3, ancho, lineas.length * 4 + 7, 'F');
    doc.setDrawColor(...TINTA.acento).setLineWidth(0.6).line(mg, this.y - 3, mg, this.y + lineas.length * 4 + 4);
    this.texto(etiqueta.toUpperCase(), mg + 3.5, this.y + 0.6, { size: 6.6, bold: true, color: TINTA.gris });
    this.texto(lineas, mg + 3.5, this.y + 5, { size: 8.8 });
    this.y += lineas.length * 4 + 9;
  }

  /** Etiqueta pequeña en gris (p. ej. "Instructores asignados") antes de una tabla. */
  rotulo(t: string, aparte = 14): void {
    this.asegurar(aparte);
    this.texto(t, this.mg, this.y, { size: 8.6, bold: true, color: TINTA.gris });
    this.y += 2.5;
  }

  /** Tabla con el estilo del informe: cabecera gris claro, líneas solo horizontales. */
  tabla(head: string[], body: (string | number)[][], extra: Record<string, any> = {}): void {
    // Cabecera + al menos una fila juntas: si no, la cabecera quedaba sola al pie de la página.
    this.asegurar(20);
    autoTable(this.doc, {
      startY: this.y,
      head: [head.map((h) => h.toUpperCase())],
      body: body.map((r) => r.map(String)),
      theme: 'plain',
      rowPageBreak: 'avoid',
      margin: { left: this.mg, right: this.mg, top: this.ARRIBA, bottom: this.ABAJO },
      styles: {
        font: 'helvetica', fontSize: 8.6, textColor: TINTA.texto, cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 },
        lineColor: TINTA.linea, lineWidth: { bottom: 0.2 }, valign: 'middle', overflow: 'linebreak',
      },
      headStyles: {
        fillColor: TINTA.suave, textColor: TINTA.gris, fontStyle: 'bold', fontSize: 7, lineColor: [209, 213, 219], lineWidth: { bottom: 0.4 },
      },
      ...extra,
    });
    this.y = (this.doc as any).lastAutoTable.finalY + 6;
  }

  /** Texto en cursiva gris para "sin datos". */
  vacio(t: string): void {
    this.asegurar(8);
    this.texto(t, this.mg, this.y + 1, { size: 8.8, italic: true, color: TINTA.tenue });
    this.y += 7;
  }

  /** Encabezado corto en las páginas 2+ y pie con paginación en todas. */
  terminar(pie: { izquierda: string; derechaEncabezado: string }): void {
    const { doc, mg, pw, ph } = this;
    const paginas = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
      doc.setPage(i);
      if (i > 1) {
        this.texto(`EPSAS · ${this.o.tipo}`, mg, 13, { size: 7.5, color: TINTA.tenue });
        this.texto(pie.derechaEncabezado, pw - mg, 13, { size: 7.5, bold: true, color: TINTA.gris, align: 'right' });
        this.regla(16);
      }
      this.regla(ph - 13);
      this.texto(pie.izquierda, mg, ph - 8.5, { size: 7.2, color: TINTA.tenue });
      this.texto(`Página ${i} de ${paginas}`, pw - mg, ph - 8.5, { size: 7.2, color: TINTA.gris, align: 'right' });
    }
  }
}
