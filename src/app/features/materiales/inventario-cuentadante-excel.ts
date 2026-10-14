import type { Workbook } from 'exceljs';
import type { BienACargo, InventarioCuentadante } from './data-access/materiales-api.service';
import { descargarLibro } from './salidas/salida-export.util';
import { ESTADO_LEGIBLE, marcaModelo } from './cuentadante-formato';
import { resumenCaracteristicas } from './caracteristicas-equipo.util';

/*
 * Inventario de fin de año del cuentadante (2026-10-06). El SENA no tiene un
 * formato fijo conocido para este documento, así que es propio: qué bienes
 * tiene a cargo, dónde está cada uno según el sistema, y columnas en blanco
 * para que el cuentadante marque si lo vio, en qué estado lo encontró y sus
 * observaciones, más las firmas. Solo trae equipos con placa SENA: el
 * cuentadante solo responde por esos (decisión del dueño, 2026-10-07).
 */

const borde = { style: 'thin' as const, color: { argb: 'FF808080' } };
const BORDES = { top: borde, left: borde, bottom: borde, right: borde };
const GRIS = 'FFD9D9D9';
const AMARILLO = 'FFFFF2CC';

/** Columnas de la tabla: [título, ancho]. Las tres últimas las llena el cuentadante. */
const COLUMNAS: [string, number][] = [
  ['N°', 5],
  ['Placa SENA', 18],
  ['Descripción del bien', 38],
  ['Marca / Modelo', 22],
  ['Serial', 16],
  ['Dónde está (según el sistema)', 32],
  ['Quién lo tiene', 26],
  ['Estado en el sistema', 18],
  ['¿Lo verificó?\n(Sí / No)', 13],
  ['Estado físico\n(B / R / M)', 13],
  ['Observaciones', 34],
];
const N_COL = COLUMNAS.length;

export const estadoLegible = (b: BienACargo): string =>
  [ESTADO_LEGIBLE[b.estado] ?? b.estado, b.novedad].filter(Boolean).join(' · ');

/** Fila de la tabla, en el orden de `COLUMNAS` (sin las tres de verificación). */
export function filaInventario(b: BienACargo, n: number): (string | number)[] {
  // Las características técnicas (procesador, RAM…) van en la descripción para no cambiar las columnas del formato.
  const descripcion = [b.producto_nombre, b.descripcion, resumenCaracteristicas(b.caracteristicas)].filter((v) => v && v.trim()).join(' — ');
  return [n, b.placa_sena?.trim() ?? '', descripcion, marcaModelo(b), b.serial ?? '', b.ubicacion, b.en_poder_de ?? '', estadoLegible(b)];
}

const cargoLegible = (c: string | null): string =>
  c ? c.replace(/_/g, ' ').replace(/^\w/, (l) => l.toUpperCase()) : '';

export async function construirInventarioCuentadante(inv: InventarioCuentadante, hoy = new Date()): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EPSAS · Materiales';
  const ws = wb.addWorksheet('Inventario', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 7 }],
    pageSetup: {
      orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: '&LInventario del cuentadante&RPágina &P de &N' },
  });
  ws.pageSetup.printTitlesRow = '7:7';
  COLUMNAS.forEach(([, ancho], i) => (ws.getColumn(i + 1).width = ancho));

  const { cuentadante: c, bienes } = inv;
  const titulo = (fila: number, texto: string, tam: number) => {
    ws.mergeCells(fila, 1, fila, N_COL);
    const celda = ws.getCell(fila, 1);
    celda.value = texto;
    celda.font = { name: 'Arial', size: tam, bold: true };
    celda.alignment = { horizontal: 'center', vertical: 'middle' };
  };
  titulo(1, 'SERVICIO NACIONAL DE APRENDIZAJE SENA', 12);
  titulo(2, `INVENTARIO DE BIENES A CARGO DEL CUENTADANTE — VIGENCIA ${hoy.getFullYear()}`, 12);
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;

  // Datos del cuentadante: etiqueta en negrita y valor al lado, en dos renglones.
  const dato = (fila: number, col: number, hasta: number, etiqueta: string, valor: string) => {
    ws.mergeCells(fila, col, fila, hasta);
    ws.getCell(fila, col).value = {
      richText: [
        { text: `${etiqueta}: `, font: { name: 'Arial', size: 10, bold: true } },
        { text: valor || '—', font: { name: 'Arial', size: 10 } },
      ],
    };
    ws.getCell(fila, col).alignment = { vertical: 'middle' };
  };
  const fuera = bienes.filter((b) => ['PRESTADO', 'FUERA_DE_SEDE', 'SALIDO'].includes(b.estado)).length;
  dato(4, 1, 4, 'Cuentadante', c.nombre ?? '');
  dato(4, 5, 7, 'Documento', c.cedula ? `C.C. ${c.cedula}` : '');
  dato(4, 8, N_COL, 'Cargo', cargoLegible(c.cargo));
  dato(5, 1, 4, 'Fecha de corte', hoy.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }));
  dato(5, 5, 7, 'Total de bienes', String(bienes.length));
  dato(5, 8, N_COL, 'Fuera de la bodega', String(fuera));

  // Encabezado de la tabla.
  const encabezado = ws.getRow(7);
  encabezado.height = 32;
  COLUMNAS.forEach(([texto], i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = texto;
    celda.font = { name: 'Arial', size: 9, bold: true };
    celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i >= 8 ? AMARILLO : GRIS } };
    celda.border = BORDES;
  });

  bienes.forEach((b, i) => {
    const fila = ws.getRow(8 + i);
    filaInventario(b, i + 1).forEach((v, j) => (fila.getCell(j + 1).value = v));
    for (let j = 1; j <= N_COL; j++) {
      const celda = fila.getCell(j);
      celda.font = { name: 'Arial', size: 9 };
      celda.alignment = { vertical: 'middle', wrapText: true, horizontal: j === 1 || j === 9 || j === 10 ? 'center' : 'left' };
      celda.border = BORDES;
    }
    // Listas desplegables para lo que marca el cuentadante.
    fila.getCell(9).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Sí,No"'] };
    fila.getCell(10).dataValidation = { type: 'list', allowBlank: true, formulae: ['"B,R,M"'] };
    fila.height = 30;
  });
  if (bienes.length) ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7 + bienes.length, column: N_COL } };

  // Nota y firmas.
  let f = 8 + bienes.length + 1;
  ws.mergeCells(f, 1, f, N_COL);
  ws.getCell(f, 1).value =
    'Diligencie las columnas amarillas: "¿Lo verificó?" = Sí si vio el bien físicamente; "Estado físico": B = bueno, R = regular, M = malo. ' +
    'Si un bien no está donde dice el sistema, escriba en Observaciones dónde lo encontró.';
  ws.getCell(f, 1).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF595959' } };
  ws.getCell(f, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(f).height = 28;

  f += 3;
  const firmas: [number, number, string, string][] = [
    [2, 4, 'FIRMA DEL CUENTADANTE', [c.nombre, c.cedula ? `C.C. ${c.cedula}` : ''].filter(Boolean).join(' · ')],
    [6, 8, 'REVISÓ (COORDINADOR / ALMACÉN)', 'Nombre:'],
  ];
  ws.getRow(f).height = 45;
  for (const [desde, hasta, rol, nombre] of firmas) {
    for (let col = desde; col <= hasta; col++) ws.getCell(f, col).border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
    ws.mergeCells(f + 1, desde, f + 1, hasta);
    ws.getCell(f + 1, desde).value = rol;
    ws.getCell(f + 1, desde).font = { name: 'Arial', size: 9, bold: true };
    ws.getCell(f + 1, desde).alignment = { horizontal: 'center' };
    ws.mergeCells(f + 2, desde, f + 2, hasta);
    ws.getCell(f + 2, desde).value = nombre;
    ws.getCell(f + 2, desde).font = { name: 'Arial', size: 9 };
    ws.getCell(f + 2, desde).alignment = { horizontal: 'center' };
  }
  return wb;
}

export function nombreArchivoInventario(inv: InventarioCuentadante, hoy = new Date()): string {
  const quien = (inv.cuentadante.nombre ?? 'cuentadante')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Inventario-${quien}-${hoy.getFullYear()}.xlsx`;
}

export async function descargarInventarioCuentadante(inv: InventarioCuentadante): Promise<void> {
  await descargarLibro(await construirInventarioCuentadante(inv), nombreArchivoInventario(inv));
}
