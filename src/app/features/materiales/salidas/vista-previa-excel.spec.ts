import { describe, expect, it, vi } from 'vitest';
import type { ConfigSalida, SalidaDetalle } from '../data-access/materiales-api.service';
import { construirPolizaExcel } from './poliza-excel.util';
import { hojaAVista } from './vista-previa-excel';

const config: ConfigSalida = {
  poliza_numero: '1234567890',
  limite_despacho: '2000000000',
  presupuesto_anual: '17000000000',
  regional: 'Huila',
  centro_formacion: 'Centro Yamboró',
  dependencia: 'Tecnoparque',
};

const salida = {
  codigo: 'SAL-000003',
  clase: 'DEVOLUTIVO',
  con_regreso: true,
  tipo_destino: 'PROPIO',
  sitio_nombre: 'Sede Yamboró',
  solicitante_nombre: 'Ana Pérez',
  jefe_nombre: 'Carlos Rojas',
  lugar_destino: 'Pitalito',
  medio_transporte: 'Automóvil',
  fecha: '2026-07-28T10:00:00',
  fecha_aprobacion: '2026-07-28T11:00:00',
  lineas: [{ id_linea: 'l1', id_item: 'i', producto_nombre: 'Workstation', placa_sena: '900000000001', serial: null, cantidad: 1, valor_unitario: 6611712, cuentadante_nombre: 'Otra Persona' }],
} as unknown as SalidaDetalle;

describe('vista previa del Excel', () => {
  it('dibuja el mismo libro: celdas combinadas, colores, pesos y fecha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red'))); // sin logos en la prueba
    const wb = await construirPolizaExcel(salida, config);
    const v = hojaAVista(wb);
    vi.unstubAllGlobals();

    expect(v.anchos).toHaveLength(7);
    const celdas = v.filas.flatMap((f) => f.celdas);
    const titulo = celdas.find((c) => c.texto.includes('REPORTE TRANSPORTE DE MERCANCÍAS'))!;
    expect(titulo.colspan).toBe(5); // B6:F6
    expect(titulo.estilo['background']).toBe('#1F4E79');
    expect(titulo.estilo['color']).toBe('#FFFFFF');
    const fecha = celdas.find((c) => c.texto.includes('FECHA DESPACHO'))!;
    expect(fecha.rowspan).toBe(2); // A13:A14
    expect(celdas.some((c) => c.texto === '28/07/2026')).toBe(true);
    expect(celdas.some((c) => c.texto === '$ 6.611.712')).toBe(true);
    // Ninguna fila dibuja más columnas de las que tiene la hoja.
    for (const [i, f] of v.filas.entries()) {
      const ocupadas = f.celdas.reduce((s, c) => s + c.colspan, 0);
      expect(ocupadas, `fila ${i + 1}`).toBeLessThanOrEqual(7);
    }
  });
});
