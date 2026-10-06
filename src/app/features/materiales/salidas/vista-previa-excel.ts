import type { Cell, Workbook, Worksheet } from 'exceljs';

/**
 * Vista previa de una hoja de ExcelJS como tabla HTML, sin descargar nada: se
 * dibuja el MISMO libro que se descarga (celdas combinadas, fondos, fuentes,
 * bordes, anchos, altos e imágenes), así lo que se ve es lo que sale en el
 * archivo y no hay una segunda plantilla que mantener.
 */
export interface CeldaVista {
  texto: string;
  colspan: number;
  rowspan: number;
  estilo: Record<string, string>;
}
export interface FilaVista {
  alto: number;
  celdas: CeldaVista[];
}
export interface ImagenVista {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface HojaVista {
  anchos: number[];
  filas: FilaVista[];
  imagenes: ImagenVista[];
  ancho: number;
  alto: number;
  /** URLs de las imágenes (blob:), para liberarlas al cerrar la vista. */
  urls: string[];
}

const ANCHO_DEFECTO = 8.43; // caracteres, el de Excel
const ALTO_DEFECTO = 15; // puntos

/** Ancho de columna de Excel (caracteres) → píxeles, con la fórmula de Excel para Calibri 11. */
const anchoPx = (caracteres: number | undefined): number => Math.round((caracteres ?? ANCHO_DEFECTO) * 7 + 5);
/** Alto de fila (puntos) → píxeles. */
const altoPx = (puntos: number | undefined): number => Math.round((puntos ?? ALTO_DEFECTO) * (4 / 3));

const GROSOR: Record<string, number> = { hair: 1, thin: 1, dotted: 1, dashed: 1, medium: 2, mediumDashed: 2, thick: 3, double: 3 };

const color = (argb: string | undefined, porDefecto: string): string => (argb && argb.length === 8 ? `#${argb.slice(2)}` : porDefecto);

/** Texto tal como lo muestra Excel para los formatos que usan nuestras hojas (fecha, pesos, número). */
export function textoCelda(c: Cell): string {
  const v = c.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return `${String(v.getUTCDate()).padStart(2, '0')}/${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`;
  }
  if (typeof v === 'number') {
    const n = v.toLocaleString('es-CO', { maximumFractionDigits: c.numFmt?.includes('$') ? 0 : 2 });
    return c.numFmt?.includes('$') ? `$ ${n}` : n;
  }
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('');
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
  return String(v);
}

function borde(lado: Partial<{ style: string; color: { argb?: string } }> | undefined): string | null {
  if (!lado?.style) return null;
  return `${GROSOR[lado.style] ?? 1}px solid ${color(lado.color?.argb, '#000000')}`;
}

/** Celdas combinadas: maestra → tamaño, y el resto de celdas cubiertas (no se dibujan). */
function combinadas(ws: Worksheet): { maestras: Map<string, { filas: number; cols: number }>; cubiertas: Set<string> } {
  const maestras = new Map<string, { filas: number; cols: number }>();
  const cubiertas = new Set<string>();
  const merges: string[] = (ws.model as { merges?: string[] }).merges ?? [];
  for (const rango of merges) {
    const [a, b] = rango.split(':');
    const ini = ws.getCell(a);
    const fin = ws.getCell(b);
    const r1 = Number(ini.row), c1 = Number(ini.col), r2 = Number(fin.row), c2 = Number(fin.col);
    maestras.set(`${r1}:${c1}`, { filas: r2 - r1 + 1, cols: c2 - c1 + 1 });
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) cubiertas.add(`${r}:${c}`);
  }
  return { maestras, cubiertas };
}

/** Arma la vista de la primera hoja del libro (o de la que se indique). */
export function hojaAVista(wb: Workbook, hoja = 0): HojaVista {
  const ws = wb.worksheets[hoja];
  const nCols = ws.columnCount;
  const nFilas = ws.rowCount;
  const anchos = Array.from({ length: nCols }, (_, i) => anchoPx(ws.getColumn(i + 1).width));
  const altos = Array.from({ length: nFilas }, (_, i) => altoPx(ws.getRow(i + 1).height));
  const { maestras, cubiertas } = combinadas(ws);

  const filas: FilaVista[] = [];
  for (let r = 1; r <= nFilas; r++) {
    const celdas: CeldaVista[] = [];
    for (let c = 1; c <= nCols; c++) {
      if (cubiertas.has(`${r}:${c}`)) continue;
      const span = maestras.get(`${r}:${c}`) ?? { filas: 1, cols: 1 };
      const cel = ws.getCell(r, c);
      // Bordes de un rango combinado: arriba/izquierda de la maestra, abajo/derecha de las celdas del extremo.
      const der = ws.getCell(r, c + span.cols - 1).border?.right;
      const abajo = ws.getCell(r + span.filas - 1, c).border?.bottom;
      const f = cel.font ?? {};
      const a = cel.alignment ?? {};
      const fill = cel.fill as { type?: string; fgColor?: { argb?: string } } | undefined;
      const estilo: Record<string, string> = {
        'font-family': `${f.name ?? 'Calibri'}, Arial, sans-serif`,
        'font-size': `${Math.round((f.size ?? 11) * (4 / 3))}px`,
        'font-weight': f.bold ? '700' : '400',
        color: color(f.color?.argb, '#000000'),
        'text-align': a.horizontal === 'centerContinuous' ? 'center' : (a.horizontal ?? (typeof cel.value === 'number' ? 'right' : 'left')),
        'vertical-align': a.vertical === 'middle' ? 'middle' : a.vertical === 'top' ? 'top' : 'bottom',
        'white-space': a.wrapText ? 'pre-wrap' : 'pre',
        padding: '1px 4px',
        overflow: 'hidden',
        'line-height': '1.2',
      };
      if (fill?.type === 'pattern' && fill.fgColor?.argb) estilo['background'] = color(fill.fgColor.argb, 'transparent');
      const lados: [string, string | null][] = [
        ['border-top', borde(cel.border?.top)],
        ['border-left', borde(cel.border?.left)],
        ['border-right', borde(der)],
        ['border-bottom', borde(abajo)],
      ];
      for (const [prop, val] of lados) if (val) estilo[prop] = val;
      celdas.push({ texto: textoCelda(cel), colspan: span.cols, rowspan: span.filas, estilo });
    }
    filas.push({ alto: altos[r - 1], celdas });
  }

  // Imágenes: el ancla (columna/fila con fracción) se pasa a píxeles con los mismos anchos y altos.
  const posX = (col: number): number => {
    const entera = Math.floor(col);
    return anchos.slice(0, entera).reduce((s, w) => s + w, 0) + (col - entera) * (anchos[entera] ?? anchoPx(undefined));
  };
  const posY = (fila: number): number => {
    const entera = Math.floor(fila);
    return altos.slice(0, entera).reduce((s, h) => s + h, 0) + (fila - entera) * (altos[entera] ?? altoPx(undefined));
  };
  const urls: string[] = [];
  const imagenes: ImagenVista[] = ws.getImages().flatMap((img) => {
    const datos = wb.getImage(Number(img.imageId)) as { buffer?: ArrayBuffer; extension?: string };
    // `ext` existe en tiempo de ejecución (ancla oneCell) aunque los tipos de ExcelJS no lo declaren.
    const ext = (img.range as { ext?: { width: number; height: number } }).ext;
    if (!datos?.buffer || !ext) return [];
    const src = URL.createObjectURL(new Blob([datos.buffer], { type: `image/${datos.extension === 'jpeg' ? 'jpeg' : datos.extension ?? 'png'}` }));
    urls.push(src);
    // Ancla nativa (columna + desplazamiento en EMU) si la hay: es la exacta; si no, la fracción que calcula ExcelJS.
    const tl = img.range.tl as { col: number; row: number; nativeCol?: number; nativeColOff?: number; nativeRow?: number; nativeRowOff?: number };
    const EMU_POR_PX = 9525;
    const left = tl.nativeCol !== undefined ? posX(tl.nativeCol) + (tl.nativeColOff ?? 0) / EMU_POR_PX : posX(tl.col);
    const top = tl.nativeRow !== undefined ? posY(tl.nativeRow) + (tl.nativeRowOff ?? 0) / EMU_POR_PX : posY(tl.row);
    return [{ src, left, top, width: ext.width, height: ext.height }];
  });

  return {
    anchos,
    filas,
    imagenes,
    ancho: anchos.reduce((s, w) => s + w, 0),
    alto: altos.reduce((s, h) => s + h, 0),
    urls,
  };
}
