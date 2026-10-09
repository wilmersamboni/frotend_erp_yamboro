import { describe, expect, it } from 'vitest';
import {
  LoteVencimiento, compararVencimiento, estaVencido, fechaCortaVencimiento, hoyBogota, idsVencenPrimero, loteQueVenceAntes, sufijoVencimiento,
} from './lotes-vencimiento.util';

const HOY = '2026-10-09';
const lote = (id: string, fecha: string | null, extra: Partial<LoteVencimiento> = {}): LoteVencimiento => ({
  id, id_producto: 'pollo', id_sitio: 'cocina', fecha_vencimiento: fecha, libres: 10, ...extra,
});

describe('loteQueVenceAntes', () => {
  it('sugiere el lote del mismo producto y bodega que vence antes', () => {
    const lotes = [lote('a', '2026-10-30'), lote('b', '2026-10-12'), lote('c', '2026-10-20')];
    expect(loteQueVenceAntes('a', lotes, [], HOY)?.id).toBe('b');
  });

  it('no sugiere nada si el elegido ya es el que vence primero', () => {
    const lotes = [lote('a', '2026-10-12'), lote('b', '2026-10-30')];
    expect(loteQueVenceAntes('a', lotes, [], HOY)).toBeNull();
  });

  it('ignora otros productos, otras bodegas, lotes sin saldo y lotes vencidos', () => {
    const lotes = [
      lote('a', '2026-10-30'),
      lote('otro-prod', '2026-10-10', { id_producto: 'arroz' }),
      lote('otra-bodega', '2026-10-10', { id_sitio: 'cuarto-frio' }),
      lote('vacio', '2026-10-10', { libres: 0 }),
      lote('vencido', '2026-10-01'),
    ];
    expect(loteQueVenceAntes('a', lotes, [], HOY)).toBeNull();
  });

  it('no sugiere un lote que ya está en otra línea', () => {
    const lotes = [lote('a', '2026-10-30'), lote('b', '2026-10-12'), lote('c', '2026-10-20')];
    expect(loteQueVenceAntes('a', lotes, ['b'], HOY)?.id).toBe('c');
  });

  it('si el elegido no tiene fecha, cualquiera con fecha vence antes', () => {
    const lotes = [lote('a', null), lote('b', '2026-12-01')];
    expect(loteQueVenceAntes('a', lotes, [], HOY)?.id).toBe('b');
  });

  it('si el elegido está vencido, sugiere uno vigente aunque venza más tarde', () => {
    const lotes = [lote('a', '2026-10-01'), lote('b', '2026-11-01')];
    expect(loteQueVenceAntes('a', lotes, [], HOY)?.id).toBe('b');
  });

  it('el lote que vence hoy todavía se puede usar', () => {
    const lotes = [lote('a', '2026-10-30'), lote('b', HOY)];
    expect(loteQueVenceAntes('a', lotes, [], HOY)?.id).toBe('b');
  });

  it('acepta fechas con hora (ISO)', () => {
    const lotes = [lote('a', '2026-10-30T00:00:00.000Z'), lote('b', '2026-10-12T00:00:00.000Z')];
    expect(loteQueVenceAntes('a', lotes, [], HOY)?.id).toBe('b');
  });
});

describe('idsVencenPrimero', () => {
  it('marca el primero de cada producto y bodega solo si hay más de un lote con saldo', () => {
    const lotes = [
      lote('a', '2026-10-30'), lote('b', '2026-10-12'),
      lote('solo', '2026-10-15', { id_producto: 'arroz' }),
      lote('x', '2026-11-01', { id_producto: 'leche' }), lote('y', '2026-10-20', { id_producto: 'leche', libres: 0 }),
    ];
    expect([...idsVencenPrimero(lotes, HOY)]).toEqual(['b']);
  });

  it('salta un lote vencido al elegir el primero', () => {
    const lotes = [lote('vencido', '2026-10-01'), lote('a', '2026-10-30'), lote('b', '2026-10-20')];
    expect([...idsVencenPrimero(lotes, HOY)]).toEqual(['b']);
  });
});

describe('textos y orden', () => {
  it('ordena por vencimiento con los sin fecha al final', () => {
    expect(['2026-12-01', null, '2026-10-12'].sort(compararVencimiento)).toEqual(['2026-10-12', '2026-12-01', null]);
  });

  it('arma el sufijo del label', () => {
    expect(sufijoVencimiento('2026-10-12', true, HOY)).toBe(' · vence 12 oct 2026 · vence primero');
    expect(sufijoVencimiento('2026-10-12', false, HOY)).toBe(' · vence 12 oct 2026');
    expect(sufijoVencimiento('2026-10-01', false, HOY)).toBe(' · VENCIDO 1 oct 2026');
    expect(sufijoVencimiento(null, true, HOY)).toBe('');
  });

  it('fecha corta y vencido', () => {
    expect(fechaCortaVencimiento('2026-01-05')).toBe('5 ene 2026');
    expect(estaVencido('2026-10-08', HOY)).toBe(true);
    expect(estaVencido(HOY, HOY)).toBe(false);
  });

  it('hoy en Bogotá: a las 9 p. m. de Bogotá (UTC del día siguiente) sigue siendo el mismo día', () => {
    expect(hoyBogota(new Date('2026-10-10T02:00:00Z'))).toBe('2026-10-09');
  });
});
