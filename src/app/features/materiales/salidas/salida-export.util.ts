import type { Cell, Workbook, Worksheet } from 'exceljs';
import type { ConfigSalida, LineaSalida, SalidaDetalle } from '../data-access/materiales-api.service';
import { agregarHojaPoliza, cargoLegible } from './poliza-excel.util';

/*
 * Solo hay DOS formatos (decisión del dueño, 2026-10-06):
 *  - Devolutivos (unidades) → "Formato Transporte de Mercancías" (póliza, `poliza-excel.util.ts`).
 *  - Consumibles (lotes) → hoja de San Agustín ("San agustin 12-08-2026.xlsx").
 * Hoy una salida es de una sola clase; las MIXTA viejas bajan en un archivo con las dos hojas.
 */

const borde = { style: 'thin' as const, color: { argb: 'FF000000' } };
const BORDES = { top: borde, left: borde, bottom: borde, right: borde };
const GRIS_CANT = 'FFDBDBDB'; // columna CANT. de la hoja de San Agustín (tema 6, +60 %)

/** Línea que va en el reporte de póliza: toda unidad devolutiva, tenga o no cuentadante. */
export const esLineaPoliza = (l: LineaSalida): boolean => !!l.id_item;

/** Líneas de cada formato. */
export function lineasPorFormato(s: SalidaDetalle): { poliza: LineaSalida[]; consumo: LineaSalida[] } {
  return { poliza: s.lineas.filter(esLineaPoliza), consumo: s.lineas.filter((l) => !esLineaPoliza(l)) };
}

/** ¿Lleva reporte de póliza? (al menos un devolutivo). */
export function usaFormatoPoliza(s: SalidaDetalle): boolean {
  return s.lineas.some(esLineaPoliza);
}

/** Columna "Registro Sena": la placa / serial de un devolutivo; un consumible no tiene código. */
export function registroConsumo(l: LineaSalida): string {
  if (l.id_item) return [l.placa_sena, l.serial].filter(Boolean).join(' / ') || 'Sin código';
  return 'Sin código / Material de consumo';
}

const ABREVIATURAS: Record<string, string> = {
  METRO: 'm', CENTIMETRO: 'cm', METRO_CUADRADO: 'm²', METRO_CUBICO: 'm³', KILOGRAMO: 'kg', GRAMO: 'g',
  LIBRA: 'lb', TONELADA: 't', LITRO: 'L', MILILITRO: 'mL', GALON: 'gal',
};
/** "9 m", "2 cajas", "6" (unidades sueltas van sin unidad, como en la hoja de San Agustín). */
export function cantidadConsumo(l: LineaSalida): string {
  const n = Number(l.cantidad).toLocaleString('es-CO');
  const u = (l.unidad_medida ?? '').toUpperCase();
  if (!u || u === 'UNIDAD') return n;
  if (ABREVIATURAS[u]) return `${n} ${ABREVIATURAS[u]}`;
  const nombre = u.toLowerCase().replace(/_/g, ' ');
  const plural = Number(l.cantidad) === 1 ? nombre : /[aeiou]$/.test(nombre) || /(kit|set)$/.test(nombre) ? `${nombre}s` : `${nombre}es`;
  return `${n} ${plural}`;
}

/** Título de la hoja de San Agustín: "Material de consumo enviados a San Agustín". */
export function tituloHojaSalida(s: SalidaDetalle, lineas: LineaSalida[] = s.lineas): string {
  // Como el original: "Material de consumo enviados a San Agustin"; si lleva equipos, "Material enviado a …".
  const que = lineas.every((l) => !!l.id_lote) ? 'Material de consumo enviados' : 'Material enviado';
  const lugar = s.tipo_destino === 'TERCERO' ? s.dest_sede || s.lugar_destino : s.lugar_destino;
  return lugar ? `${que} a ${lugar}` : `${que.replace(/ enviados?$/, '')} para ${s.solicitante_nombre ?? 'quien lo solicitó'}`;
}

interface Firmante {
  rol: string;
  nombre: string | null;
  detalle?: string;
}

/**
 * Firmas de la hoja de San Agustín: el coordinador (quien aprueba), la persona
 * que solicita y, solo si el material es para un tercero, esa persona.
 */
export function firmantes(s: SalidaDetalle): Firmante[] {
  const lista: Firmante[] = [
    { rol: 'Coordinador', nombre: s.aprueba_nombre ?? s.jefe_nombre },
    { rol: 'Quien solicita', nombre: s.solicitante_nombre, detalle: cargoLegible(s.solicitante_cargo) || undefined },
  ];
  if (s.tipo_destino === 'TERCERO') {
    lista.push({
      rol: 'Quien recibe',
      nombre: s.dest_nombre,
      detalle: [s.dest_documento ? `C.C. ${s.dest_documento}` : '', s.dest_cargo, s.dest_sede].filter(Boolean).join(' · ') || undefined,
    });
  }
  return lista;
}

function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

// ───────────────────────────── Hoja de San Agustín ─────────────────────────────

/**
 * Hoja calcada de "San agustin 12-08-2026.xlsx": título, ITEM / DESCRIPCION /
 * Registro Sena / CANT. / Registro Fotografico (filas altas para pegar la foto)
 * y, al final, el espacio para las firmas.
 */
export function agregarHojaConsumo(wb: Workbook, s: SalidaDetalle, lineas: LineaSalida[]): Worksheet {
  const ws = wb.addWorksheet('Hoja1', {
    // Sin cuadrícula: lo que no tiene borde se ve blanco, y la tabla y las firmas quedan como un solo recuadro.
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.75, right: 0.75, top: 1, bottom: 1, header: 0.5, footer: 0.5 } },
  });
  // A..G = 9,43 y H = 23,71, como el original.
  ws.columns = [...Array.from({ length: 7 }, () => ({ width: 9.43 })), { width: 23.71 }];

  const celda = (f1: number, c1: number, f2: number, c2: number, valor: Cell['value'], o: { negrita?: boolean; tam?: number; h?: 'left' | 'center'; fondo?: string; color?: string; borde?: boolean } = {}): Cell => {
    if (f2 > f1 || c2 > c1) ws.mergeCells(f1, c1, f2, c2);
    const c = ws.getCell(f1, c1);
    c.value = valor;
    c.font = { name: 'Calibri', size: o.tam ?? 11, bold: o.negrita ?? false, color: { argb: o.color ?? 'FF000000' } };
    c.alignment = { horizontal: o.h ?? 'center', vertical: 'middle', wrapText: true };
    if (o.fondo) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fondo } };
    if (o.borde !== false) for (let f = f1; f <= f2; f++) for (let k = c1; k <= c2; k++) ws.getCell(f, k).border = BORDES;
    return c;
  };

  // Fila 1: título; fila 2: encabezado (mismos textos y rellenos del original).
  celda(1, 1, 1, 8, tituloHojaSalida(s, lineas), { negrita: true, tam: 12 });
  ws.getRow(1).height = 15.75;
  celda(2, 1, 2, 1, 'ITEM', { negrita: true, fondo: 'FFFFFFFF' });
  celda(2, 2, 2, 4, 'DESCRIPCION', { negrita: true });
  celda(2, 5, 2, 6, 'Registro Sena', { negrita: true, fondo: 'FFFFFFFF' });
  celda(2, 7, 2, 7, 'CANT.', { negrita: true, fondo: GRIS_CANT });
  celda(2, 8, 2, 8, 'Registro Fotografico');

  // Una fila por material; la columna H queda para pegar la foto.
  let fila = 3;
  lineas.forEach((l, i) => {
    const desc = [l.producto_nombre, l.marca, l.modelo].filter(Boolean).join(' ');
    const cant = cantidadConsumo(l);
    celda(fila, 1, fila, 1, i + 1);
    celda(fila, 2, fila, 4, desc);
    celda(fila, 5, fila, 6, registroConsumo(l));
    celda(fila, 7, fila, 7, /^\d+$/.test(cant) ? Number(l.cantidad) : cant);
    celda(fila, 8, fila, 8, '');
    ws.getRow(fila).height = 99.95;
    fila += 1;
  });

  // Firmas pegadas a la tabla, dentro del mismo recuadro (lados A y H, cierre abajo): espacio para firmar
  // sobre una línea, el rol y el nombre (+ cargo / C.C. en letra pequeña). Si no caben en lo que queda de la
  // página (carta, márgenes de 1"), salto de página antes para que no se partan.
  const ALTO_PAGINA = 9 * 72; // puntos útiles: 11" − 1" arriba − 1" abajo
  // Espacio para firmar (alto), rol, nombre y un margen abajo.
  const ALTOS_FIRMAS = [70, 28, 42, 10];
  let enPagina = 0;
  for (let r = 1; r < fila; r++) {
    const h = ws.getRow(r).height ?? 15;
    enPagina = enPagina + h > ALTO_PAGINA ? h : enPagina + h;
  }
  if (enPagina + ALTOS_FIRMAS.reduce((a, h) => a + h, 0) > ALTO_PAGINA) ws.getRow(fila - 1).addPageBreak();

  const f = firmantes(s);
  // Bloques separados por una columna en blanco; el del coordinador es el más ancho (A:C con tercero, A:D si
  // no) para que tenga espacio de firma y sello.
  const columnas: [number, number][] = f.length > 2 ? [[1, 3], [5, 6], [8, 8]] : [[1, 4], [6, 8]];
  const lado = (r: number, c: number, l: 'top' | 'left' | 'bottom' | 'right') => {
    const cel = ws.getCell(r, c);
    cel.border = { ...(cel.border ?? {}), [l]: borde };
  };
  f.forEach((p, j) => {
    const [c1, c2] = columnas[j];
    if (c2 > c1) ws.mergeCells(fila, c1, fila, c2);
    for (let k = c1; k <= c2; k++) lado(fila, k, 'bottom'); // línea para firmar
    celda(fila + 1, c1, fila + 1, c2, `FIRMA ${p.rol.toUpperCase()}`, { negrita: true, h: 'center', borde: false });
    const nombre = celda(fila + 2, c1, fila + 2, c2, p.nombre ?? '', { h: 'center', borde: false });
    if (p.detalle) {
      nombre.value = {
        richText: [
          { text: p.nombre ?? '', font: { name: 'Calibri', size: 11 } },
          { text: `\n${p.detalle}`, font: { name: 'Calibri', size: 9, color: { argb: 'FF595959' } } },
        ],
      };
    }
    nombre.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
  });
  ALTOS_FIRMAS.forEach((h, k) => (ws.getRow(fila + k).height = h));
  const ultima = fila + ALTOS_FIRMAS.length - 1;
  for (let r = fila; r <= ultima; r++) {
    lado(r, 1, 'left');
    lado(r, 8, 'right');
  }
  for (let c = 1; c <= 8; c++) lado(ultima, c, 'bottom');
  fila = ultima + 1;
  ws.pageSetup.printArea = `A1:H${fila - 1}`;
  return ws;
}

/** Libro con solo la hoja de San Agustín (todas las líneas de la salida). */
export async function construirSalidaExcel(s: SalidaDetalle, _config?: ConfigSalida): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EPSAS · Materiales';
  agregarHojaConsumo(wb, s, s.lineas);
  return wb;
}

/**
 * El libro de la salida y su nombre de archivo, sin descargarlo: la hoja de
 * póliza con los devolutivos con cuentadante y la de San Agustín con el resto
 * (una o las dos). ExcelJS (≈920 kB) se carga acá, solo al usarlo.
 */
export async function construirExcel(s: SalidaDetalle, config: ConfigSalida): Promise<{ wb: Workbook; nombre: string }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EPSAS · Materiales';
  const { poliza, consumo } = lineasPorFormato(s);
  if (poliza.length) await agregarHojaPoliza(wb, s, poliza, config);
  if (consumo.length) agregarHojaConsumo(wb, s, consumo);
  const prefijo = poliza.length && consumo.length ? 'Salida-Poliza' : poliza.length ? 'Poliza' : 'Salida';
  return { wb, nombre: `${prefijo}-${s.codigo}.xlsx` };
}

/** Descarga un libro ya armado (p. ej. el que se mostró en la vista previa). */
export async function descargarLibro(wb: Workbook, nombre: string): Promise<void> {
  descargarBlob(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre);
}

/** Descarga la salida en Excel (el PDF lo saca el usuario después de pegar las fotos y firmar). */
export async function descargarSalidaExcel(s: SalidaDetalle, config: ConfigSalida): Promise<void> {
  const { wb, nombre } = await construirExcel(s, config);
  await descargarLibro(wb, nombre);
}
