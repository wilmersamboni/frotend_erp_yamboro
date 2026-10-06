import { describe, expect, it, vi } from 'vitest';
import type { ConfigSalida, SalidaDetalle } from '../data-access/materiales-api.service';
import { construirPolizaExcel } from './poliza-excel.util';

const config: ConfigSalida = {
  poliza_numero: '1234567890',
  limite_despacho: '2000000000',
  presupuesto_anual: '17000000000',
  regional: 'Huila',
  centro_formacion: 'Centro de Gestión y Desarrollo Sostenible Surcolombiano Yamboró',
  dependencia: 'Tecnoparque',
};

const salida = {
  id_salida: 's1',
  codigo: 'SAL-000003',
  clase: 'DEVOLUTIVO',
  estado: 'APROBADA',
  sitio_nombre: 'Bodega Tecnoparque',
  sede_nombre: 'Sede Yamboró',
  solicitante_nombre: 'Ana María Pérez Gómez',
  jefe_nombre: 'Carlos Andrés Rojas Díaz',
  solicitante_cargo: 'instructor',
  jefe_cargo: 'coordinador',
  tipo_destino: 'PROPIO',
  aprueba_nombre: 'Carlos Andrés Rojas Díaz',
  lugar_destino: 'Pitalito',
  medio_transporte: 'Automóvil',
  fecha: '2026-07-28T10:00:00',
  fecha_aprobacion: '2026-07-28T11:00:00',
  lineas: [
    {
      id_linea: 'l1',
      id_item: 'i1',
      producto_nombre: 'Workstation HP Z2 G9',
      marca: 'HP',
      modelo: 'Z2 G9',
      descripcion: 'COREI7-14700 / 1TB SSD',
      placa_sena: '900000000001',
      serial: 'SN-PRUEBA-01',
      cantidad: 1,
      valor_unitario: 6611712,
      id_cuentadante: 'u1',
      cuentadante_nombre: 'Ana María Pérez Gómez',
    },
  ],
} as unknown as SalidaDetalle;

describe('reporte de póliza (Formato Transporte de Mercancías)', () => {
  it('calca el formato: textos, celdas, colores, anchos, firmas y notas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red'))); // sin logos en la prueba
    const wb = await construirPolizaExcel(salida, config);
    vi.unstubAllGlobals();
    const ws = wb.getWorksheet('T.MERCANCÍAS')!;

    // Anchos y altos del original.
    expect(ws.getColumn(1).width).toBeCloseTo(44.71);
    expect(ws.getColumn(5).width).toBeCloseTo(35.43);
    expect(ws.getRow(6).height).toBe(58.5);
    // Banda del título y encabezado de la póliza.
    expect(ws.getCell('B6').value).toBe('SERVICIO NACIONAL DE APRENDIZAJE SENA\n\nREPORTE TRANSPORTE DE MERCANCÍAS PÓLIZA No  1234567890');
    expect(ws.getCell('A8').value).toBe(' REGIONAL ');
    expect(ws.getCell('A8').fill).toMatchObject({ fgColor: { argb: 'FF002060' } });
    expect(ws.getCell('B8').value).toBe('Huila');
    expect(ws.getCell('B10').value).toBe('Centro de Gestión y Desarrollo Sostenible Surcolombiano Yamboró');
    expect(ws.getCell('B11').value).toBe('Tecnoparque');
    expect(String(ws.getCell('E10').value)).toContain('$2.000.000.000');
    // Tabla del bien.
    expect(ws.getCell('A13').value).toBe('FECHA DESPACHO\ndd/mm/aaaa');
    expect(ws.getCell('A13').fill).toMatchObject({ fgColor: { argb: 'FFE2EFDA' } });
    expect(ws.getCell('A15').value).toEqual(new Date(Date.UTC(2026, 6, 28))); // fecha real de Excel, sin correrse un día
    expect(ws.getCell('B15').value).toBe('SEDE YAMBORÓ'); // origen = sede de la bodega
    expect(ws.getCell('C15').value).toBe('PITALITO');
    expect(ws.getCell('D15').value).toBe('AUTOMÓVIL');
    expect(String(ws.getCell('E15').value)).toContain('WORKSTATION HP Z2 G9');
    expect(ws.getCell('F15').value).toBe('900000000001 / SN-PRUEBA-01');
    expect(ws.getCell('G15').value).toBe(6611712);
    // Firmas: quien despacha (B/C) y jefe inmediato (E/F), como el formato; nada más.
    expect(ws.getCell('B17').value).toBe('FIRMA ');
    expect(ws.getCell('B18').value).toBe('NOMBRE');
    expect(ws.getCell('C18').value).toBe('Ana María Pérez Gómez');
    expect(ws.getCell('C19').value).toBe('Instructor');
    expect(ws.getCell('E18').value).toBe('NOMBRE JEFE INMEDIATO');
    expect(ws.getCell('F18').value).toBe('Carlos Andrés Rojas Díaz');
    expect(ws.getCell('F19').value).toBe('Coordinador');
    // Notas.
    expect(ws.getCell('A22').value).toBe('NOTAS:');
    expect(String(ws.getCell('A26').value)).toContain('$17,000,000,000');
    expect(ws.getCell('A27').value).toBe('*Sin aplicación de Deducible');
  });
});
