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

/** Color de ExcelJS: fijo (`argb`) o del tema del libro (`theme` + `tint`), como los guarda Excel al editar a mano. */
type ColorExcel = { argb?: string; theme?: number; tint?: number } | undefined;

/** Paleta de Office por defecto (orden de índice de tema de Excel: lt1, dk1, lt2, dk2, accent1..6, hlink, folHlink). */
const TEMA_OFFICE = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];

/** Lee los colores del tema del libro (`xl/theme/theme1.xml`) en el orden de índice que usa Excel. */
function paletaTema(wb: Workbook): string[] {
  const xml = (wb.model as unknown as { themes?: Record<string, string> }).themes?.['theme1'];
  if (!xml) return TEMA_OFFICE;
  const valor = (nombre: string): string | null => {
    const m = new RegExp(`<a:${nombre}>\s*<a:(?:srgbClr val|sysClr[^>]*lastClr)="([0-9A-Fa-f]{6})"`).exec(xml);
    return m ? m[1].toUpperCase() : null;
  };
  // En el XML el orden es dk1, lt1, dk2, lt2…; Excel numera lt1=0, dk1=1, lt2=2, dk2=3.
  const nombres = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  return nombres.map((n, i) => valor(n) ?? TEMA_OFFICE[i]);
}

/** Aplica el "tint" de Excel (aclarar u oscurecer) sobre la luminosidad del color. */
function conTinte(hex: string, tint: number): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, sat = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const p = 2 * l - q;
  const canal = (t: number): number => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
  };
  const a = sat === 0 ? [l, l, l] : [canal(h + 1 / 3), canal(h), canal(h - 1 / 3)];
  return a.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

let paleta: string[] = TEMA_OFFICE;
const color = (c: ColorExcel, porDefecto: string): string => {
  if (c?.argb && c.argb.length === 8) return `#${c.argb.slice(2)}`;
  if (c?.theme !== undefined && paleta[c.theme]) return `#${c.tint ? conTinte(paleta[c.theme], c.tint) : paleta[c.theme]}`;
  return porDefecto;
};

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

function borde(lado: Partial<{ style: string; color: ColorExcel }> | undefined): string | null {
  if (!lado?.style) return null;
  return `${GROSOR[lado.style] ?? 1}px solid ${color(lado.color, '#000000')}`;
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
  paleta = paletaTema(wb);
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
      const fill = cel.fill as { type?: string; fgColor?: ColorExcel } | undefined;
      const estilo: Record<string, string> = {
        'font-family': `${f.name ?? 'Calibri'}, Arial, sans-serif`,
        'font-size': `${Math.round((f.size ?? 11) * (4 / 3))}px`,
        'font-weight': f.bold ? '700' : '400',
        color: color(f.color as ColorExcel, '#000000'),
        'text-align': a.horizontal === 'centerContinuous' ? 'center' : (a.horizontal ?? (typeof cel.value === 'number' ? 'right' : 'left')),
        'vertical-align': a.vertical === 'middle' ? 'middle' : a.vertical === 'top' ? 'top' : 'bottom',
        'white-space': a.wrapText ? 'pre-wrap' : 'pre',
        padding: '1px 4px',
        overflow: 'hidden',
        'line-height': '1.2',
      };
      if (fill?.type === 'pattern' && fill.fgColor) estilo['background'] = color(fill.fgColor, 'transparent');
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
    // `ext` existe en tiempo de ejecución (ancla oneCell) aunque los tipos de ExcelJS no lo declaren; un Excel
    // editado a mano suele anclar de esquina a esquina (`br`), y entonces el tamaño sale de las dos esquinas.
    const rango = img.range as { ext?: { width: number; height: number }; br?: { col: number; row: number; nativeCol?: number; nativeColOff?: number; nativeRow?: number; nativeRowOff?: number } };
    if (!datos?.buffer || (!rango.ext && !rango.br)) return [];
    const src = URL.createObjectURL(new Blob([datos.buffer], { type: `image/${datos.extension === 'jpeg' ? 'jpeg' : datos.extension ?? 'png'}` }));
    urls.push(src);
    // Ancla nativa (columna + desplazamiento en EMU) si la hay: es la exacta; si no, la fracción que calcula ExcelJS.
    const tl = img.range.tl as { col: number; row: number; nativeCol?: number; nativeColOff?: number; nativeRow?: number; nativeRowOff?: number };
    const EMU_POR_PX = 9525;
    const left = tl.nativeCol !== undefined ? posX(tl.nativeCol) + (tl.nativeColOff ?? 0) / EMU_POR_PX : posX(tl.col);
    const top = tl.nativeRow !== undefined ? posY(tl.nativeRow) + (tl.nativeRowOff ?? 0) / EMU_POR_PX : posY(tl.row);
    if (rango.ext) return [{ src, left, top, width: rango.ext.width, height: rango.ext.height }];
    const br = rango.br!;
    const right = br.nativeCol !== undefined ? posX(br.nativeCol) + (br.nativeColOff ?? 0) / EMU_POR_PX : posX(br.col);
    const bottom = br.nativeRow !== undefined ? posY(br.nativeRow) + (br.nativeRowOff ?? 0) / EMU_POR_PX : posY(br.row);
    return [{ src, left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }];
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
