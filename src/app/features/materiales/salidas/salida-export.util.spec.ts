import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigSalida, SalidaDetalle } from '../data-access/materiales-api.service';
import { CAJA_FOTO, cantidadConsumo, construirExcel, descargarSalidaExcel, firmantes, lineasPorFormato, usaFormatoPoliza } from './salida-export.util';
import { encajar } from './foto-salida';
import { ubicacionSalida } from './poliza-excel.util';

const config: ConfigSalida = {
  poliza_numero: '1234567890',
  limite_despacho: '2000000000',
  presupuesto_anual: '17000000000',
  regional: 'Huila',
  centro_formacion: 'Centro Yamboró',
  dependencia: 'Tecnoparque',
};

const base = {
  id_salida: 's1',
  estado: 'APROBADA',
  sitio_nombre: 'Bodega Redes',
  solicitante_nombre: 'Ana Pérez',
  solicitante_cargo: 'instructor',
  aprueba_nombre: 'Admin ERP',
  jefe_nombre: 'Carlos Rojas',
  motivo: 'Material para la práctica de redes en la sede',
  fecha: '2026-08-12T10:00:00',
  fecha_aprobacion: '2026-08-12T11:00:00',
};

const consumo = {
  ...base,
  codigo: 'SAL-20261006-001',
  clase: 'CONSUMO',
  con_regreso: false,
  tipo_destino: 'TERCERO',
  dest_nombre: 'Instructor Y',
  dest_documento: '1234',
  dest_cargo: 'Instructor',
  dest_sede: 'San Agustín',
  lineas: [
    { id_linea: 'a', id_lote: 'lo-1', producto_nombre: 'Cable 12 AWG Amarillo', marca: null, modelo: null, unidad_medida: 'METRO', codigo_lote: null, cantidad: 9, cuentadante_nombre: null },
    { id_linea: 'b', id_lote: 'lo-2', producto_nombre: 'Terminales de 1/2 EMT', marca: null, modelo: null, unidad_medida: 'UNIDAD', codigo_lote: 'L-77', cantidad: 6, cuentadante_nombre: null },
  ],
} as unknown as SalidaDetalle;

/** Devolutivos con cuentadante: reporte de póliza. */
const conCuentadante = {
  ...base,
  codigo: 'SAL-20261006-003',
  clase: 'DEVOLUTIVO',
  con_regreso: true,
  tipo_destino: 'PROPIO',
  lugar_destino: 'Pitalito',
  medio_transporte: 'Automóvil',
  lineas: [
    { id_linea: 'c', id_item: 'it-1', producto_nombre: 'Workstation HP Z2', marca: 'HP', modelo: 'Z2 G9', descripcion: null, placa_sena: '900000000001', serial: 'SN-PRUEBA-01', cantidad: 1, valor_unitario: 6611712, id_cuentadante: 'u-9', cuentadante_nombre: 'Otra Persona' },
    { id_linea: 'd', id_item: 'it-2', producto_nombre: 'Monitor', marca: null, modelo: null, descripcion: null, placa_sena: null, serial: null, cantidad: 1, valor_unitario: 500000, id_cuentadante: 'u-9', cuentadante_nombre: 'Otra Persona' },
  ],
} as unknown as SalidaDetalle;

/** Lo de San Agustín: cable (consumible) + repetidor y rack sin cuentadante. */
const mixta = {
  ...base,
  codigo: 'SAL-20261006-010',
  clase: 'MIXTA',
  con_regreso: false,
  tipo_destino: 'TERCERO',
  dest_nombre: 'Carlos Pérez',
  dest_documento: '777',
  dest_sede: 'San Agustín',
  lineas: [
    { id_linea: 'a', id_lote: 'lo-1', producto_nombre: 'Cable UTP categoría 6', unidad_medida: 'METRO', cantidad: 2, cuentadante_nombre: null },
    { id_linea: 'b', id_item: 'it-3', producto_nombre: 'Repetidor de interior', marca: 'TP-Link', placa_sena: '9528100001', serial: null, unidad_medida: 'UNIDAD', cantidad: 1, id_cuentadante: null, cuentadante_nombre: null },
    { id_linea: 'c', id_item: 'it-4', producto_nombre: 'Rack', placa_sena: null, serial: null, unidad_medida: 'UNIDAD', cantidad: 1, id_cuentadante: null, cuentadante_nombre: null },
  ],
} as unknown as SalidaDetalle;

/** Intercepta la descarga y devuelve las hojas del .xlsx generado y los textos de sus celdas. */
async function excelGenerado(s: SalidaDetalle): Promise<{ hojas: string[]; texto: (hoja?: number) => string[]; nombre: string }> {
  let blob: Blob | undefined;
  let nombre = '';
  vi.stubGlobal('URL', { createObjectURL: (b: Blob) => ((blob = b), 'blob:x'), revokeObjectURL: vi.fn() });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red'))); // sin logos
  vi.spyOn(document, 'createElement').mockReturnValue({
    click: vi.fn(),
    set href(_: string) {},
    set download(n: string) {
      nombre = n;
    },
  } as unknown as HTMLElement);
  await descargarSalidaExcel(s, config);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob!.arrayBuffer());
  return {
    nombre,
    hojas: wb.worksheets.map((w) => w.name),
    texto: (hoja = 0) =>
      wb.worksheets[hoja]
        .getSheetValues()
        .flat()
        .flatMap((v) => {
          if (v instanceof Date) return [v.toISOString()];
          // Texto enriquecido (nombre + cargo en la firma): cada tramo por separado y el texto completo.
          const rico = (v as { richText?: { text: string }[] })?.richText;
          if (rico) return [rico.map((r) => r.text).join(''), ...rico.map((r) => r.text.trim())];
          return [String(typeof v === 'object' && v ? ((v as { result?: unknown }).result ?? '') : (v ?? ''))];
        }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Descarga de salidas: dos formatos', () => {
  it('dos formatos: devolutivos (con o sin cuentadante) → póliza; consumibles → San Agustín', () => {
    expect(usaFormatoPoliza(conCuentadante)).toBe(true);
    expect(usaFormatoPoliza(consumo)).toBe(false);
    expect(usaFormatoPoliza(mixta)).toBe(true); // lleva repetidor y rack, aunque sin cuentadante
    const { poliza, consumo: resto } = lineasPorFormato(mixta);
    expect(poliza.map((l) => l.id_linea)).toEqual(['b', 'c']);
    expect(resto.map((l) => l.id_linea)).toEqual(['a']);
  });

  it('hoja de San Agustín: mismo encabezado, filas de material y firmas de coordinador, solicitante y tercero', async () => {
    const x = await excelGenerado(consumo);
    expect(x.hojas).toEqual(['Hoja1']);
    expect(x.nombre).toBe('Salida-SAL-20261006-001.xlsx');
    const t = x.texto();
    expect(t).toContain('Material de consumo enviados a San Agustín');
    for (const enc of ['ITEM', 'DESCRIPCION', 'Registro Sena', 'CANT.', 'Registro Fotografico']) expect(t).toContain(enc);
    expect(t).toContain('Cable 12 AWG Amarillo');
    expect(t).toContain('Sin código / Material de consumo');
    expect(t).toContain('9 m');
    expect(t).toContain('FIRMA COORDINADOR');
    expect(t).toContain('Admin ERP');
    expect(t).toContain('FIRMA QUIEN SOLICITA');
    expect(t).toContain('Ana Pérez');
    expect(t).toContain('FIRMA QUIEN RECIBE');
    expect(t).toContain('Instructor Y');
    expect(t.some((v) => v.includes('DATOS DE LA SALIDA'))).toBe(false); // tal cual el formato
  });

  it('para uso propio no hay firma de tercero', async () => {
    const t = (await excelGenerado({ ...consumo, tipo_destino: 'PROPIO', lugar_destino: 'San Agustín' } as SalidaDetalle)).texto();
    expect(t).toContain('FIRMA COORDINADOR');
    expect(t).toContain('FIRMA QUIEN SOLICITA');
    expect(t).not.toContain('FIRMA QUIEN RECIBE');
  });

  it('devolutivos sin cuentadante también salen en la póliza (no en la hoja de consumibles)', async () => {
    const sinCuentadante = {
      ...conCuentadante,
      lineas: conCuentadante.lineas.map((l) => ({ ...l, id_cuentadante: null, cuentadante_nombre: null })),
    } as unknown as SalidaDetalle;
    const x = await excelGenerado(sinCuentadante);
    expect(x.hojas).toEqual(['T.MERCANCÍAS']);
    expect(x.texto()).toContain('PITALITO'); // destino, del sistema
  });

  it('hoja de consumibles sin cuadrícula: tabla y firmas en un solo recuadro', async () => {
    let blob: Blob | undefined;
    vi.stubGlobal('URL', { createObjectURL: (b: Blob) => ((blob = b), 'blob:x'), revokeObjectURL: vi.fn() });
    vi.spyOn(document, 'createElement').mockReturnValue({ click: vi.fn(), set href(_: string) {}, set download(_: string) {} } as unknown as HTMLElement);
    await descargarSalidaExcel(consumo, config);
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob!.arrayBuffer());
    const ws = wb.worksheets[0];
    expect(ws.views[0].showGridLines).toBe(false);
    // Las filas de firmas siguen inmediatamente a la última de la tabla, con los lados del recuadro.
    const ultimaTabla = 2 + consumo.lineas.length;
    expect(ws.getCell(ultimaTabla + 1, 1).border?.left).toBeTruthy();
    expect(ws.getCell(ultimaTabla + 1, 8).border?.right).toBeTruthy();
    expect(ws.getCell(ultimaTabla + 2, 1).value).toBe('FIRMA COORDINADOR');
  });

  it('devolutivos con cuentadante: reporte de póliza calcado del formato, sin la hoja de San Agustín', async () => {
    const x = await excelGenerado(conCuentadante);
    expect(x.hojas).toEqual(['T.MERCANCÍAS']);
    expect(x.nombre).toBe('Poliza-SAL-20261006-003.xlsx');
    const t = x.texto();
    expect(t.some((v) => v.includes('REPORTE TRANSPORTE DE MERCANCÍAS PÓLIZA No  1234567890'))).toBe(true);
    // Placa del equipo + serial del formulario; descripción y valor asegurado van a mano (2026-10-08).
    expect(t).toContain('900000000001 / SN-PRUEBA-01');
    expect(t).not.toContain('SIN PLACA'); // sin placa ni serial la celda queda vacía, para escribirla a mano
    expect(t).toContain('NOMBRE JEFE INMEDIATO');
    expect(t).toContain('Carlos Rojas');
    expect(t).toContain('NOTAS:');
  });

  it('una salida mixta vieja baja con las dos hojas: equipos en la póliza y consumibles en San Agustín', async () => {
    const x = await excelGenerado({ ...mixta, lugar_destino: 'San Agustín', medio_transporte: 'Camioneta' } as SalidaDetalle);
    expect(x.hojas).toEqual(['T.MERCANCÍAS', 'Hoja1']);
    expect(x.nombre).toBe('Salida-Poliza-SAL-20261006-010.xlsx');
    expect(x.texto(0)).toContain('SAN AGUSTÍN'); // destino de la póliza (la placa va a mano)
    expect(x.texto(1)).toContain('Cable UTP categoría 6');
    expect(x.texto(1)).not.toContain('9528100001');
  });

  it('regional, centro y dependencia son fijos: salen de "Datos de la póliza"; la bodega solo si están vacíos', async () => {
    const conSede = { ...conCuentadante, centro_nombre: 'Centro Agroempresarial', sede_nombre: 'Sede La Plata' } as unknown as SalidaDetalle;
    const t = (await excelGenerado(conSede)).texto();
    expect(t).toContain('Centro Yamboró');
    expect(t).not.toContain('Centro Agroempresarial');
    expect(t).toContain('SEDE LA PLATA'); // lugar de origen: del sistema
    expect(ubicacionSalida({ ...conSede, regional_nombre: 'Huila' } as SalidaDetalle, { ...config, regional: 'Otra' }).regional).toBe('Otra');
    expect(ubicacionSalida(conSede, { ...config, centro_formacion: null }).centro).toBe('Centro Agroempresarial');
  });

  it('firmantes de la hoja de consumibles: coordinador, quien solicita y, si aplica, el tercero', () => {
    expect(firmantes(consumo).map((f) => f.rol)).toEqual(['Coordinador', 'Quien solicita', 'Quien recibe']);
    expect(firmantes({ ...consumo, tipo_destino: 'PROPIO' } as SalidaDetalle).map((f) => f.rol)).toEqual(['Coordinador', 'Quien solicita']);
  });

  it('cantidad: abrevia medidas, pluraliza empaques y deja las unidades sueltas sin unidad', () => {
    const l = (cantidad: number, unidad_medida: string | null) => ({ cantidad, unidad_medida }) as never;
    expect(cantidadConsumo(l(9, 'METRO'))).toBe('9 m');
    expect(cantidadConsumo(l(2, 'KILOGRAMO'))).toBe('2 kg');
    expect(cantidadConsumo(l(6, 'UNIDAD'))).toBe('6');
    expect(cantidadConsumo(l(3, null))).toBe('3');
    expect(cantidadConsumo(l(2, 'CAJA'))).toBe('2 cajas');
    expect(cantidadConsumo(l(2, 'PAR'))).toBe('2 pares');
    expect(cantidadConsumo(l(1, 'ROLLO'))).toBe('1 rollo');
  });
});

describe('Registro fotográfico de los consumibles', () => {
  // PNG de 1×1: basta para que ExcelJS lo empaque; el tamaño que cuenta es el declarado.
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0)).buffer;

  it('pone la foto de cada material en la columna H de su fila, centrada y sin deformar', async () => {
    const { wb } = await construirExcel(consumo, config, { b: { buffer: png, extension: 'png', ancho: 1280, alto: 960 } });
    const imgs = wb.worksheets[0].getImages();
    expect(imgs).toHaveLength(1); // la línea "a" no tiene foto: su celda queda vacía
    const tl = imgs[0].range.tl as unknown as { nativeCol: number; nativeRow: number; nativeColOff: number; nativeRowOff: number };
    expect(tl.nativeCol).toBe(7); // H
    expect(tl.nativeRow).toBe(3); // fila 4 = segundo material
    const ext = (imgs[0].range as unknown as { ext: { width: number; height: number } }).ext;
    expect(ext).toEqual(encajar(1280, 960, CAJA_FOTO.ancho - 12, CAJA_FOTO.alto - 12));
    expect(ext.width / ext.height).toBeCloseTo(4 / 3, 1);
    expect(tl.nativeColOff).toBe(Math.round(((CAJA_FOTO.ancho - ext.width) / 2) * 9525));
  });

  it('encajar no agranda ni deforma', () => {
    expect(encajar(100, 50, 159, 121)).toEqual({ width: 100, height: 50 });
    expect(encajar(3000, 4000, 159, 121)).toEqual({ width: 91, height: 121 });
  });
});
