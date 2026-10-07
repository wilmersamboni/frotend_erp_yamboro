import { describe, expect, it } from 'vitest';
import type { BienACargo, InventarioCuentadante } from './data-access/materiales-api.service';
import { construirInventarioCuentadante, filaInventario, nombreArchivoInventario } from './inventario-cuentadante-excel';

const bien = (x: Partial<BienACargo>): BienACargo => ({
  id_item: 'i', placa_sena: null, codigo_sku: null, estado: 'DISPONIBLE', id_producto: 'p', producto_nombre: 'Equipo',
  marca: null, modelo: null, descripcion: null, serial: null, id_sitio: 's', sitio_nombre: 'Bodega',
  fecha_ingreso: null, ubicacion: 'Bodega', en_poder_de: null, novedad: null, ...x,
});

// Datos inventados.
const inv: InventarioCuentadante = {
  cuentadante: { id_usuario: 'u', nombre: 'Ana María Pérez Gómez', cedula: '1000000001', cargo: 'instructor' },
  bienes: [
    bien({ id_item: 'a', producto_nombre: 'Router inalámbrico', marca: 'TP-Link', modelo: 'AX55', placa_sena: '900000000001',
      serial: 'SN-PRUEBA-01', estado: 'FUERA_DE_SEDE', ubicacion: 'Fuera de la sede (SAL-20261006-008)', en_poder_de: 'Pitalito' }),
    bien({ id_item: 'b', producto_nombre: 'Repetidor', estado: 'DAÑADO', novedad: 'Daño reportado' }),
  ],
};

describe('inventario de fin de año del cuentadante', () => {
  it('una fila dice qué es, dónde está, quién lo tiene y su estado; sin placa queda marcado', () => {
    expect(filaInventario(inv.bienes[0], 1)).toEqual([
      1, '900000000001', 'Router inalámbrico', 'TP-Link / AX55', 'SN-PRUEBA-01', 'Fuera de la sede (SAL-20261006-008)', 'Pitalito', 'Fuera de la sede',
    ]);
    const sinPlaca = filaInventario(inv.bienes[1], 2);
    expect(sinPlaca[1]).toBe('SIN PLACA');
    expect(sinPlaca[7]).toBe('Dañado · Daño reportado');
  });

  it('arma la hoja con encabezado del cuentadante, tabla, columnas para verificar y firmas', async () => {
    const wb = await construirInventarioCuentadante(inv, new Date(2026, 11, 1));
    const ws = wb.getWorksheet('Inventario')!;
    expect(ws.getCell('A2').value).toBe('INVENTARIO DE BIENES A CARGO DEL CUENTADANTE — VIGENCIA 2026');
    const texto = (ref: string) => {
      const v = ws.getCell(ref).value as { richText?: { text: string }[] } | string;
      return typeof v === 'object' && v?.richText ? v.richText.map((r) => r.text).join('') : String(v);
    };
    expect(texto('A4')).toBe('Cuentadante: Ana María Pérez Gómez');
    expect(texto('E4')).toBe('Documento: C.C. 1000000001');
    expect(texto('H4')).toBe('Cargo: Instructor');
    expect(texto('H5')).toBe('Sin placa SENA: 1');
    expect(ws.getCell('I7').value).toBe('¿Lo verificó?\n(Sí / No)');
    expect(ws.getCell('B8').value).toBe('900000000001');
    expect(ws.getCell('B9').value).toBe('SIN PLACA');
    expect(ws.getCell('I8').dataValidation).toMatchObject({ type: 'list', formulae: ['"Sí,No"'] });
    expect(ws.getCell('J9').dataValidation).toMatchObject({ formulae: ['"B,R,M"'] });
    const valores: string[] = [];
    ws.eachRow((r) => r.eachCell((c) => valores.push(String(c.value))));
    expect(valores).toContain('FIRMA DEL CUENTADANTE');
    expect(valores).toContain('REVISÓ (COORDINADOR / ALMACÉN)');
  });

  it('nombre del archivo sin tildes ni espacios', () => {
    expect(nombreArchivoInventario(inv, new Date(2026, 11, 1))).toBe('Inventario-Ana-Maria-Perez-Gomez-2026.xlsx');
  });
});
