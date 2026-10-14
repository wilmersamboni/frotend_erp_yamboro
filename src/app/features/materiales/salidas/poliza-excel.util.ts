import type { Cell, Workbook, Worksheet } from 'exceljs';
import type { ConfigSalida, SalidaDetalle } from '../data-access/materiales-api.service';

/*
 * Reporte "Transporte de mercancías — póliza", calcado de
 * "Formato Transporte de Mercancías" (SENA / Howden): mismos anchos, altos,
 * textos, colores, bordes y logos. Es el formato de los devolutivos; los
 * consumibles van en la hoja de San Agustín.
 *
 * Qué llena el sistema y qué se llena a mano (decisión del dueño, 2026-10-08):
 *  - Fijos, de "Datos de la póliza": regional, centro de formación, dependencia y límite por despacho.
 *  - Del sistema: fecha, lugar de origen, lugar de destino y medio de transporte.
 *  - PLACA / SERIAL: la placa sale del equipo y el serial, si se escribió en el formulario (opcional);
 *    si no, se escribe a mano en el Excel.
 *  - A MANO (salen de una página del SENA a la que el sistema no tiene acceso): descripción del bien
 *    asegurado y valor asegurado. Esas celdas salen vacías, una fila por equipo.
 *  - Jefe inmediato = el cuentadante de los equipos.
 * El documento ya diligenciado y firmado se adjunta a la salida (registro del documento terminado).
 */

// Colores del formato oficial.
const AZUL_ETIQUETA = 'FF002060'; // REGIONAL, CENTRO, DEPENDENCIA, LÍMITE
const AZUL_BANDA = 'FF1F4E79'; // banda del título y etiquetas de firma (tema 8, −50 %)
const VERDE = 'FFE2EFDA'; // valores del encabezado, títulos de la tabla y notas (tema 9, +80 %)
const GRIS = 'FFF2F2F2'; // nombres y cargos de quienes firman (tema 0, −5 %)
const BLANCO = 'FFFFFFFF';
const NEGRO = 'FF000000';
const TINTA_FIRMA = 'FF44546A';

const MONEDA = '_-"$"* #,##0_-;\\-"$"* #,##0_-;_-"$"* "-"??_-;_-@_-';
const ULTIMA_COL = 7; // A..G

type Linea = SalidaDetalle['lineas'][number];
type Lado = { style: 'thin' | 'medium' | 'thick'; color: { argb: string } };
const lado = (style: Lado['style'], argb = NEGRO): Lado => ({ style, color: { argb } });

/**
 * Regional, centro de formación, sede y dependencia de la salida. Regional, centro y dependencia son
 * fijos del formato: salen de "Datos de la póliza" (decisión del dueño, 2026-10-08) y solo si están
 * vacíos se usa lo de la bodega (sede → centro → departamento, que resuelve el backend).
 */
export function ubicacionSalida(s: SalidaDetalle, config: ConfigSalida): { regional: string; centro: string; sede: string; dependencia: string } {
  const t = (...v: (string | null | undefined)[]): string => v.map((x) => x?.trim()).find((x) => !!x) ?? '';
  return {
    regional: t(config.regional, s.regional_nombre),
    centro: t(config.centro_formacion, s.centro_nombre),
    sede: t(s.sede_nombre),
    dependencia: t(config.dependencia, s.area_nombre),
  };
}

/** "instructor" → "Instructor", "administrador_erp" → "Administrador". */
export function cargoLegible(cargo: string | null | undefined): string {
  if (!cargo) return '';
  const c = cargo.replace(/_erp$/i, '').replace(/_/g, ' ').trim().toLowerCase();
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Fecha del ISO local "YYYY-MM-DDTHH:mm:ss" como fecha de Excel (sin correrse un día por la zona horaria). */
function fechaExcel(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Alto de la fila de un bien: espacio para escribir a mano la descripción, la placa/serial y el valor. */
const ALTO_FILA_BIEN = 45;

interface Estilo {
  fondo?: string;
  color?: string;
  negrita?: boolean;
  tam?: number;
  fuente?: string;
  h?: 'left' | 'center' | 'right' | 'justify';
  v?: 'top' | 'middle';
  envolver?: boolean;
  numFmt?: string;
}

function pintar(c: Cell, e: Estilo): void {
  c.font = { name: e.fuente ?? 'Arial', size: e.tam ?? 10, bold: e.negrita ?? false, color: { argb: e.color ?? NEGRO } };
  c.alignment = { horizontal: e.h, vertical: e.v ?? 'middle', wrapText: e.envolver ?? true };
  if (e.fondo) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: e.fondo } };
  if (e.numFmt) c.numFmt = e.numFmt;
}

/** Combina un rango (si hace falta), pone el valor y el estilo en la celda de arriba a la izquierda. */
function bloque(ws: Worksheet, f1: number, c1: number, f2: number, c2: number, valor: Cell['value'], e: Estilo): Cell {
  if (f2 > f1 || c2 > c1) ws.mergeCells(f1, c1, f2, c2);
  const c = ws.getCell(f1, c1);
  c.value = valor;
  pintar(c, e);
  if (e.fondo) for (let f = f1; f <= f2; f++) for (let k = c1; k <= c2; k++) ws.getCell(f, k).fill = c.fill;
  return c;
}

/** Agrega lados de borde a cada celda del rango sin borrar los que ya tenga. */
function bordes(ws: Worksheet, f1: number, c1: number, f2: number, c2: number, lados: Partial<Record<'top' | 'left' | 'bottom' | 'right', Lado>>, soloContorno = false): void {
  for (let f = f1; f <= f2; f++) {
    for (let c = c1; c <= c2; c++) {
      const cel = ws.getCell(f, c);
      const b = { ...(cel.border ?? {}) };
      if (lados.top && (!soloContorno || f === f1)) b.top = lados.top;
      if (lados.bottom && (!soloContorno || f === f2)) b.bottom = lados.bottom;
      if (lados.left && (!soloContorno || c === c1)) b.left = lados.left;
      if (lados.right && (!soloContorno || c === c2)) b.right = lados.right;
      cel.border = b;
    }
  }
}

/** Logos del encabezado (public/img/poliza), en la posición del formato. Si no se pueden traer, el reporte sale igual. */
async function ponerLogos(wb: Workbook, ws: Worksheet): Promise<void> {
  // Anclas en EMU copiadas del formato original (ExcelJS calcula mal la fracción de columna con anchos propios).
  const logos: { archivo: string; col: number; colOff: number; rowOff: number; ancho: number; alto: number }[] = [
    { archivo: 'howden.png', col: 0, colOff: 54430, rowOff: 0, ancho: 191, alto: 70 },
    { archivo: 'wtw.png', col: 0, colOff: 2354037, rowOff: 0, ancho: 200, alto: 70 },
    { archivo: 'axa.png', col: 6, colOff: 544287, rowOff: 54430, ancho: 150, alto: 84 },
  ];
  await Promise.all(
    logos.map(async (l) => {
      try {
        const r = await fetch(`/img/poliza/${l.archivo}`);
        if (!r.ok) return;
        const id = wb.addImage({ buffer: await r.arrayBuffer(), extension: 'png' } as never);
        const tl = { nativeCol: l.col, nativeColOff: l.colOff, nativeRow: 0, nativeRowOff: l.rowOff };
        ws.addImage(id, { tl: tl as never, ext: { width: l.ancho, height: l.alto }, editAs: 'oneCell' });
      } catch {
        /* sin logos: el formato sigue siendo válido */
      }
    }),
  );
}

/**
 * Agrega la hoja "T.MERCANCÍAS" al libro con las líneas que se le pasen (las de
 * devolutivos con cuentadante). ExcelJS lo carga quien crea el libro.
 */
export async function agregarHojaPoliza(wb: Workbook, salida: SalidaDetalle, lineas: Linea[], config: ConfigSalida): Promise<Worksheet> {
  const ws = wb.addWorksheet('T.MERCANCÍAS', {
    views: [{ showGridLines: false, zoomScale: 80 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } },
  });
  ws.columns = [{ width: 44.71 }, { width: 31.29 }, { width: 36.71 }, { width: 35.43 }, { width: 35.43 }, { width: 35.43 }, { width: 35.43 }];
  const alto = (f: number, h: number) => (ws.getRow(f).height = h);
  for (let f = 1; f <= 5; f++) alto(f, 14.1);
  await ponerLogos(wb, ws);

  // ── Fila 6: banda del título ──
  const poliza = config.poliza_numero ?? '';
  bloque(ws, 6, 1, 6, 1, null, { fondo: AZUL_BANDA });
  bloque(ws, 6, 2, 6, 6, `SERVICIO NACIONAL DE APRENDIZAJE SENA\n\nREPORTE TRANSPORTE DE MERCANCÍAS PÓLIZA No  ${poliza}`, {
    fondo: AZUL_BANDA, color: BLANCO, negrita: true, tam: 14, h: 'center',
  });
  bloque(ws, 6, 7, 6, 7, null, { fondo: AZUL_BANDA });
  alto(6, 58.5);
  alto(7, 50.25);

  // ── Filas 8-11: encabezado de la póliza ──
  const etiqueta: Estilo = { fondo: AZUL_ETIQUETA, color: BLANCO, negrita: true, h: 'left' };
  const valor: Estilo = { fondo: VERDE, negrita: true, h: 'center' };
  const ubic = ubicacionSalida(salida, config);
  bloque(ws, 8, 1, 9, 1, ' REGIONAL ', etiqueta);
  bloque(ws, 8, 2, 9, 4, ubic.regional, valor);
  bloque(ws, 8, 5, 9, 6, 'LÍMITE MÁXIMO POR DESPACHO - PÓLIZA DE MERCANCÍAS', { ...etiqueta, h: 'center' });
  bloque(ws, 10, 1, 10, 1, ' DESPACHO Y/O\n CENTRO DE FORMACIÓN', etiqueta);
  bloque(ws, 10, 2, 10, 4, ubic.centro, valor);
  const limite = config.limite_despacho ? `$${Number(config.limite_despacho).toLocaleString('es-CO')}` : '';
  bloque(ws, 10, 5, 11, 6, ` VALOR LIMITE  POR DESPACHO ES:\n${limite}\n\n`, { negrita: true, h: 'center' });
  bloque(ws, 11, 1, 11, 1, ' DEPENDENCIA ', etiqueta);
  bloque(ws, 11, 2, 11, 4, ubic.dependencia, valor);
  // Franjas separadas por líneas gruesas blancas, como en el formato; recuadro fino del límite.
  bordes(ws, 9, 1, 9, 4, { bottom: lado('thick', BLANCO) });
  bordes(ws, 10, 1, 10, 4, { bottom: lado('thick', BLANCO) });
  bordes(ws, 10, 5, 11, 6, { top: lado('thin'), left: lado('thin'), bottom: lado('thin'), right: lado('thin') }, true);
  alto(8, 12.75);
  alto(9, 13.5);
  alto(10, 44.45);
  alto(11, 26.45);

  // ── Filas 13-14: títulos de la tabla (el trayecto agrupa origen y destino) ──
  const enc: Estilo = { fondo: VERDE, negrita: true, h: 'center' };
  bloque(ws, 13, 1, 14, 1, 'FECHA DESPACHO\ndd/mm/aaaa', enc);
  bloque(ws, 13, 2, 13, 3, 'TRAYECTO ASEGURADO ', enc);
  bloque(ws, 14, 2, 14, 2, 'LUGAR ORIGEN ', enc);
  bloque(ws, 14, 3, 14, 3, 'LUGAR DESTINO ', enc);
  bloque(ws, 13, 4, 14, 4, 'MEDIO DE TRANSPORTE ', enc);
  bloque(ws, 13, 5, 14, 5, 'DESCRIPCION DEL BIEN ASEGURADO', enc);
  bloque(ws, 13, 6, 14, 6, 'PLACA / SERIAL', enc);
  bloque(ws, 13, 7, 14, 7, 'VALOR ASEGURADO (NOTA DE ENTRADA)', enc);
  alto(13, 19.5);
  alto(14, 19.5);

  // ── Desde la fila 15: un bien por fila ──
  const fecha = fechaExcel(salida.fecha_aprobacion ?? salida.fecha);
  const origen = (salida.sede_nombre || salida.sitio_nombre || '').toUpperCase();
  const destino = (salida.lugar_destino || salida.dest_sede || '').toUpperCase();
  const medio = (salida.medio_transporte ?? '').toUpperCase();
  let fila = 15;
  // Una fila por equipo; descripción y valor (de la página del SENA) se escriben a mano.
  for (const l of lineas) {
    bloque(ws, fila, 1, fila, 1, fecha, { h: 'left', numFmt: 'dd/mm/yyyy' });
    bloque(ws, fila, 2, fila, 2, origen, {});
    bloque(ws, fila, 3, fila, 3, destino, {});
    bloque(ws, fila, 4, fila, 4, medio, {});
    // Placa del equipo + serial si se escribió en el formulario; si falta algo, se completa a mano en el Excel.
    const placaSerial = [l.placa_sena?.trim(), l.serial?.trim()].filter(Boolean).join(' / ');
    bloque(ws, fila, 5, fila, 5, null, { fuente: 'Microsoft Sans Serif', negrita: true, tam: 9 });
    bloque(ws, fila, 6, fila, 6, placaSerial || null, { h: 'center' });
    bloque(ws, fila, 7, fila, 7, null, { h: 'center', numFmt: MONEDA, envolver: false });
    alto(fila, ALTO_FILA_BIEN);
    fila += 1;
  }
  bordes(ws, 13, 1, fila - 1, ULTIMA_COL, { top: lado('thin'), left: lado('thin'), bottom: lado('thin'), right: lado('thin') });
  alto(fila, 30.75);
  fila += 1;

  // ── Firmas: quien despacha (B/C) y jefe inmediato (E/F:G), FIRMA · NOMBRE · CARGO.
  //    El jefe inmediato es el CUENTADANTE de los equipos (2026-10-08), no el coordinador. ──
  const etqFirma: Estilo = { fondo: AZUL_BANDA, color: BLANCO, negrita: true, h: 'left' };
  const valFirma: Estilo = { fondo: GRIS, color: TINTA_FIRMA, negrita: true, h: 'left' };
  const firmas: [string, string, string][][] = [
    [
      ['FIRMA ', '', ''],
      ['NOMBRE', salida.solicitante_nombre ?? '', ''],
      ['CARGO', cargoLegible(salida.solicitante_cargo), ''],
    ],
    [
      ['FIRMA ', '', ''],
      ['NOMBRE JEFE INMEDIATO', salida.jefe_nombre ?? '', ''],
      ['CARGO', cargoLegible(salida.jefe_cargo), ''],
    ],
  ];
  const inicioFirmas = fila;
  firmas[0].forEach(([etq, val], k) => {
    bloque(ws, fila + k, 2, fila + k, 2, etq, etqFirma);
    bloque(ws, fila + k, 3, fila + k, 3, val, valFirma);
  });
  firmas[1].forEach(([etq, val], k) => {
    bloque(ws, fila + k, 5, fila + k, 5, etq, etqFirma);
    bloque(ws, fila + k, 6, fila + k, 6, val, valFirma);
    bloque(ws, fila + k, 7, fila + k, 7, null, valFirma);
  });
  bordes(ws, inicioFirmas, 2, inicioFirmas + 2, 3, { bottom: lado('thick', BLANCO) });
  bordes(ws, inicioFirmas, 5, inicioFirmas + 2, 7, { bottom: lado('thick', BLANCO) });
  alto(inicioFirmas, 13.5);
  alto(inicioFirmas + 1, 14.25);
  alto(inicioFirmas + 2, 14.25);
  fila = inicioFirmas + 3;
  alto(fila, 14.25); // fila de cierre del marco

  // Marco del reporte: desde la fila de los logos (fila 1), banda del título y cierre abajo.
  bordes(ws, 1, 1, 1, ULTIMA_COL, { top: lado('medium') });
  bordes(ws, 1, 1, fila, 1, { left: lado('medium') });
  bordes(ws, 1, ULTIMA_COL, fila, ULTIMA_COL, { right: lado('medium') });
  bordes(ws, 6, 1, 6, ULTIMA_COL, { top: lado('medium'), bottom: lado('medium') });
  bordes(ws, fila, 1, fila, ULTIMA_COL, { bottom: lado('medium') });
  fila += 1;
  alto(fila, 13.5);
  fila += 1;

  // ── Notas de la póliza (A:D, fondo verde, recuadro grueso) ──
  const presupuesto = config.presupuesto_anual ? `$${Number(config.presupuesto_anual).toLocaleString('en-US')}` : '';
  const ini = fila;
  bloque(ws, fila, 1, fila, 4, null, { fondo: VERDE });
  pintar(Object.assign(ws.getCell(fila, 1), { value: 'NOTAS:' }), { fondo: VERDE, negrita: true, tam: 11, envolver: false });
  alto(fila++, 25.5);
  bloque(ws, fila, 1, fila, 4, null, { fondo: VERDE });
  pintar(Object.assign(ws.getCell(fila, 1), { value: '* Trayectos Asegurados: ' }), { fondo: VERDE, negrita: true, tam: 12, envolver: false });
  alto(fila++, 22.5);
  // Etiqueta en negrita y el resto normal, como en el formato.
  const notaRica = (etiqueta: string, texto: string): Cell['value'] => ({
    richText: [
      { text: etiqueta, font: { name: 'Arial Nova', size: 11, bold: true } },
      { text: texto, font: { name: 'Arial Nova', size: 11, bold: false } },
    ],
  });
  bloque(ws, fila, 1, fila, 4, notaRica('Despachos Nacionales:', ' Desde y hasta cualquier ciudad en el territorio nacional.'), { fondo: VERDE, negrita: true, tam: 11, fuente: 'Arial Nova', h: 'justify' });
  alto(fila++, 22.5);
  bloque(ws, fila, 1, fila, 4, notaRica('Despachos Urbanos:   ', 'Desde cualquier parte de la ciudad hasta su destino final en la misma.'), { fondo: VERDE, negrita: true, tam: 11, fuente: 'Arial Nova', h: 'justify' });
  alto(fila++, 22.5);
  bloque(ws, fila, 1, fila, 3, `Presupuesto anual de movilización: La suma de ${presupuesto}`, { fondo: VERDE, negrita: true, tam: 11, fuente: 'Arial Nova', h: 'justify', v: 'top' });
  bloque(ws, fila, 4, fila, 4, null, { fondo: VERDE });
  alto(fila++, 22.5);
  bloque(ws, fila, 1, fila, 4, null, { fondo: VERDE });
  pintar(Object.assign(ws.getCell(fila, 1), { value: '*Sin aplicación de Deducible' }), { fondo: VERDE, negrita: true, tam: 11, envolver: false });
  alto(fila, 22.5);
  bordes(ws, ini, 1, fila, 4, { top: lado('medium'), left: lado('medium'), bottom: lado('medium'), right: lado('medium') }, true);

  ws.pageSetup.printArea = `A1:G${fila}`;
  return ws;
}

/** Libro con solo la hoja de la póliza (todas las líneas de la salida). */
export async function construirPolizaExcel(salida: SalidaDetalle, config: ConfigSalida): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EPSAS · Materiales';
  await agregarHojaPoliza(wb, salida, salida.lineas, config);
  return wb;
}
