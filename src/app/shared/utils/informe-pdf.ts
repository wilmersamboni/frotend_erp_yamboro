// Solo tipos: jsPDF (~430 kB) y autotable se cargan recién al generar el
// informe (`crearInformePdf`), no con la pantalla que lo ofrece (Inicio,
// Historial, Horarios…). Recupera la carga diferida que tenía JheisonDev.
import type { jsPDF } from 'jspdf';
import type autoTableFn from 'jspdf-autotable';

/**
 * Estilo común de los informes PDF (historial del aprendiz, reporte del día de
 * horarios…): A4, una sola tinta de acento, todo lo demás en negro y grises,
 * secciones numeradas, tablas con líneas solo horizontales, encabezado corto en
 * las páginas 2+ y pie con paginación. Nada queda suelto al pie de una página:
 * títulos y cabeceras de tabla viajan con su contenido.
 *
 * Uso: `const inf = await crearInformePdf({ marca, tipo })`, ir llamando a
 * encabezado/cifras/seccion/tabla…, y al final `inf.terminar(pie)` + `inf.doc.save()`.
 */

export type RGB = [number, number, number];

export const TINTA = {
  texto:  [31, 41, 55] as RGB,
  gris:   [107, 114, 128] as RGB,
  tenue:  [156, 163, 175] as RGB,
  linea:  [229, 231, 235] as RGB,
  linea_fuerte: [209, 213, 219] as RGB,
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

/** Carga jsPDF + autotable bajo demanda y arma el informe. */
export async function crearInformePdf(o: { marca: string; tipo: string }): Promise<InformePdf> {
  const [{ jsPDF: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return new InformePdf(o, { jsPDF: JsPDF, autoTable });
}

export class InformePdf {
  readonly doc: jsPDF;
  readonly pw: number;
  readonly ph: number;
  readonly mg = 18;
  readonly ancho: number;
  private readonly autoTable: typeof autoTableFn;
  /** Margen superior de las páginas 2+ (debajo del encabezado corto). */
  private readonly ARRIBA = 24;
  /** Espacio reservado para el pie. */
  private readonly ABAJO = 20;
  y = 0;

  /** Usar `crearInformePdf()`: es quien carga las librerías. */
  constructor(
    private readonly o: { marca: string; tipo: string },
    libs: { jsPDF: new (opts: { unit: 'mm'; format: 'a4' }) => jsPDF; autoTable: typeof autoTableFn },
  ) {
    this.doc = new libs.jsPDF({ unit: 'mm', format: 'a4' });
    this.autoTable = libs.autoTable;
    this.pw = this.doc.internal.pageSize.getWidth();
    this.ph = this.doc.internal.pageSize.getHeight();
    this.ancho = this.pw - this.mg * 2;
  }

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

  /**
   * Título de sección: número en acento + título + línea. `aparte` reserva sitio
   * para el título Y el comienzo de lo que sigue (cabecera + una fila de tabla):
   * así el título nunca queda solo al pie de una página.
   */
  seccion(num: string, titulo: string, aparte = 40): void {
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
    this.autoTable(this.doc, {
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

  /**
   * Barras horizontales (distribuciones): etiqueta · barra proporcional · valor y %.
   * Todas en la tinta de acento salvo que el ítem traiga su color (para resaltar uno).
   */
  barras(items: { etiqueta: string; valor: number; pct: number; color?: RGB }[]): void {
    const { doc, mg, ancho } = this;
    const anchoEtq = 42;
    const anchoNum = 30;
    const anchoBarra = ancho - anchoEtq - anchoNum - 6;
    const max = Math.max(1, ...items.map((i) => i.pct));
    this.asegurar(items.length * 9 + 4);
    items.forEach((it) => {
      const y = this.y;
      this.texto(it.etiqueta, mg, y + 3.6, { size: 9 });
      doc.setFillColor(...TINTA.suave).setDrawColor(...TINTA.linea).setLineWidth(0.2);
      doc.roundedRect(mg + anchoEtq, y, anchoBarra, 5, 1.2, 1.2, 'FD');
      const w = (anchoBarra * it.pct) / max;
      if (w > 0.5) {
        doc.setFillColor(...(it.color ?? TINTA.acento));
        doc.roundedRect(mg + anchoEtq, y, Math.max(w, 2.4), 5, 1.2, 1.2, 'F');
      }
      this.texto(String(it.valor), mg + ancho - 12, y + 3.7, { size: 9, bold: true, align: 'right' });
      this.texto(`${it.pct}%`, mg + ancho, y + 3.7, { size: 8.2, color: TINTA.gris, align: 'right' });
      this.y += 9;
    });
    this.y += 2;
  }

  /**
   * Gráfico de líneas vectorial (nítido a cualquier zoom, a diferencia de una
   * captura del canvas): ejes, cuadrícula suave, una serie en acento y otra
   * en gris oscuro, y leyenda.
   */
  lineas(etiquetas: string[], series: { nombre: string; valores: number[]; color: RGB }[], alto = 58): void {
    const { doc, mg, ancho } = this;
    this.asegurar(alto + 14);
    const x0 = mg + 9;
    const y0 = this.y;
    const w = ancho - 9;
    const h = alto - 12;
    const max = Math.max(1, ...series.flatMap((s) => s.valores));
    // Tope "redondo" para la escala (1, 2, 5 × 10^n).
    const paso = (() => {
      const bruto = max / 4;
      const p10 = Math.pow(10, Math.floor(Math.log10(bruto)));
      return ([1, 2, 5, 10].find((m) => m * p10 >= bruto) ?? 10) * p10;
    })();
    const tope = Math.max(paso * 4, paso * Math.ceil(max / paso));
    const yDe = (v: number) => y0 + h - (v / tope) * h;
    const xDe = (i: number) => x0 + (etiquetas.length > 1 ? (i / (etiquetas.length - 1)) * w : w / 2);

    // Cuadrícula + valores del eje Y.
    for (let v = 0; v <= tope + 1e-9; v += paso) {
      const yy = yDe(v);
      this.regla(yy, TINTA.linea, 0.15, x0, x0 + w);
      this.texto(String(Math.round(v)), x0 - 2, yy + 1, { size: 6.5, color: TINTA.tenue, align: 'right' });
    }
    // Eje X.
    etiquetas.forEach((e, i) => this.texto(e, xDe(i), y0 + h + 4.5, { size: 6.8, color: TINTA.gris, align: 'center' }));

    // Series.
    series.forEach((s) => {
      doc.setDrawColor(...s.color).setLineWidth(0.7);
      for (let i = 1; i < s.valores.length; i++) {
        doc.line(xDe(i - 1), yDe(s.valores[i - 1]), xDe(i), yDe(s.valores[i]));
      }
      doc.setFillColor(255, 255, 255);
      s.valores.forEach((v, i) => {
        doc.setDrawColor(...s.color).setLineWidth(0.5);
        doc.circle(xDe(i), yDe(v), 0.9, 'FD');
      });
    });

    // Leyenda.
    let lx = x0;
    const ly = y0 + h + 10;
    series.forEach((s) => {
      doc.setDrawColor(...s.color).setLineWidth(0.9);
      doc.line(lx, ly - 1, lx + 6, ly - 1);
      this.texto(s.nombre, lx + 8, ly, { size: 7.8, color: TINTA.gris });
      doc.setFont('helvetica', 'normal').setFontSize(7.8);
      lx += 8 + doc.getTextWidth(s.nombre) + 8;
    });
    this.y = ly + 6;
  }

  /**
   * Dona vectorial centrada en (cx, cy) con un número grande al centro.
   * jsPDF no rellena arcos: cada segmento se arma con triángulos finos.
   */
  dona(cx: number, cy: number, radio: number, grosor: number, items: { valor: number; color: RGB }[], centro: { valor: string; etiqueta: string }): void {
    const { doc } = this;
    const total = items.reduce((n, i) => n + i.valor, 0);
    const ri = radio - grosor;
    const paso = (Math.PI / 180) * 1.5;
    let ang = -Math.PI / 2;
    const punto = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    if (total <= 0) {
      doc.setDrawColor(...TINTA.linea).setLineWidth(grosor);
      doc.circle(cx, cy, radio - grosor / 2, 'S');
    } else {
      items.forEach((it) => {
        if (it.valor <= 0) return;
        const fin = ang + (it.valor / total) * Math.PI * 2;
        doc.setFillColor(...it.color).setDrawColor(...it.color).setLineWidth(0.05);
        for (let a = ang; a < fin - 1e-6; a += paso) {
          const b = Math.min(a + paso + 0.004, fin);
          const [x1, y1] = punto(radio, a), [x2, y2] = punto(radio, b);
          const [x3, y3] = punto(ri, b), [x4, y4] = punto(ri, a);
          doc.triangle(x1, y1, x2, y2, x3, y3, 'FD');
          doc.triangle(x1, y1, x3, y3, x4, y4, 'FD');
        }
        ang = fin;
      });
    }
    this.texto(centro.valor, cx, cy + 2, { size: 17, bold: true, align: 'center' });
    this.texto(centro.etiqueta.toUpperCase(), cx, cy + 6.6, { size: 6.2, bold: true, color: TINTA.gris, align: 'center' });
  }

  /** Columnas agrupadas (una o dos series) con valores encima, eje y leyenda. */
  columnas(etiquetas: string[], series: { nombre: string; valores: number[]; color: RGB }[], alto = 52, resaltar?: number): void {
    const { doc, mg, ancho } = this;
    this.asegurar(alto + 14);
    const y0 = this.y;
    const h = alto - 14;
    const max = Math.max(1, ...series.flatMap((s) => s.valores));
    const grupo = ancho / etiquetas.length;
    const sep = 0.8;
    const anchoCol = Math.min(7, (grupo * 0.62) / series.length);
    this.regla(y0 + h, TINTA.linea_fuerte, 0.3);
    etiquetas.forEach((e, i) => {
      const gx = mg + i * grupo + (grupo - (anchoCol * series.length + sep * (series.length - 1))) / 2;
      if (resaltar === i) {
        doc.setFillColor(...TINTA.suave);
        doc.rect(mg + i * grupo + 0.6, y0 - 2, grupo - 1.2, h + 2, 'F');
      }
      series.forEach((s, si) => {
        const v = s.valores[i] ?? 0;
        const hh = (v / max) * (h - 6);
        const x = gx + si * (anchoCol + sep);
        if (hh > 0) {
          doc.setFillColor(...s.color);
          doc.rect(x, y0 + h - hh, anchoCol, hh, 'F');
        }
        if (v > 0) this.texto(String(v), x + anchoCol / 2, y0 + h - hh - 1.2, { size: 6.4, color: TINTA.gris, align: 'center' });
      });
      this.texto(e, mg + i * grupo + grupo / 2, y0 + h + 4.2, { size: 6.8, color: resaltar === i ? TINTA.texto : TINTA.gris, bold: resaltar === i, align: 'center' });
    });
    let lx = mg;
    const ly = y0 + h + 10;
    series.forEach((s) => {
      doc.setFillColor(...s.color);
      doc.rect(lx, ly - 2.4, 3, 3, 'F');
      this.texto(s.nombre, lx + 4.5, ly, { size: 7.8, color: TINTA.gris });
      doc.setFont('helvetica', 'normal').setFontSize(7.8);
      lx += 4.5 + doc.getTextWidth(s.nombre) + 8;
    });
    this.y = ly + 6;
  }

  /** Lista con viñetas cuadradas de acento; cada ítem puede tener una parte en negrita al inicio. */
  vinetas(items: { fuerte?: string; texto: string }[], x = this.mg, ancho = this.ancho): number {
    let y = this.y;
    items.forEach((it) => {
      const cuerpo = it.fuerte ? `${it.fuerte} ${it.texto}` : it.texto;
      const lineas = this.partir(cuerpo, ancho - 5, 8.6);
      this.doc.setFillColor(...TINTA.acento);
      this.doc.rect(x, y - 2.2, 1.6, 1.6, 'F');
      if (it.fuerte) {
        // Primera línea: la parte fuerte en negrita y el resto normal.
        this.doc.setFont('helvetica', 'bold').setFontSize(8.6);
        const anchoFuerte = this.doc.getTextWidth(it.fuerte + ' ');
        const primera = this.partir(cuerpo, ancho - 5, 8.6)[0];
        this.texto(it.fuerte, x + 4, y, { size: 8.6, bold: true });
        this.texto(primera.slice(it.fuerte.length + 1), x + 4 + anchoFuerte, y, { size: 8.6 });
        if (lineas.length > 1) this.texto(lineas.slice(1), x + 4, y + 4, { size: 8.6 });
      } else {
        this.texto(lineas, x + 4, y, { size: 8.6 });
      }
      y += lineas.length * 4 + 2.4;
    });
    return y;
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
