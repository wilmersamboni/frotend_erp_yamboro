import { describe, expect, it } from 'vitest';
import { contarSeleccion, mensajeResultado, nombreElemento } from './existencias-bodega.util';
import type { ElementoExistencia } from './data-access/materiales-api.service';

const el = (id: string, eliminable: boolean, desactivable = true): ElementoExistencia => ({
  tipo: 'unidad',
  id,
  referencia: id,
  detalle: 'Disponible',
  eliminable,
  motivo_no_eliminar: eliminable ? null : 'ya tiene movimientos',
  desactivable,
  motivo_no_desactivar: desactivable ? null : 'está prestada',
});

describe('modal Desactivar de Mi Bodega: conteos', () => {
  const elementos = [
    el('a', true),
    el('b', true),
    el('c', false),
    el('d', false, false),
    el('e', true),
  ];

  it('cada botón cuenta solo lo que puede hacer con lo seleccionado', () => {
    const c = contarSeleccion(elementos, new Set(['a', 'b', 'c', 'd']));
    expect(c.seleccionados).toBe(4);
    expect(c.eliminables).toEqual(['a', 'b']);
    expect(c.desactivables).toEqual(['a', 'b', 'c']);
    expect(c.conHistoria).toBe(2);
  });

  it('sin selección, los dos botones quedan en cero', () => {
    const c = contarSeleccion(elementos, new Set());
    expect([c.eliminables.length, c.desactivables.length]).toEqual([0, 0]);
  });

  it('ignora ids que ya no están en la lista', () => {
    expect(contarSeleccion(elementos, new Set(['zz', 'a'])).seleccionados).toBe(1);
  });

  it('nombra unidades para devolutivos y lotes para consumo/perecedero', () => {
    expect(nombreElemento('DEVOLUTIVO', 1)).toBe('unidad');
    expect(nombreElemento('DEVOLUTIVO', 3)).toBe('unidades');
    expect(nombreElemento('PERECEDERO', 2)).toBe('lotes');
  });

  it('arma el mensaje de éxito', () => {
    expect(mensajeResultado('eliminar', { unidades: 3, lotes: 0 })).toBe(
      'Se eliminaron 3 unidades.',
    );
    expect(mensajeResultado('desactivar', { unidades: 0, lotes: 1 })).toBe('Se desactivó 1 lote.');
    expect(mensajeResultado('desactivar', { unidades: 1, lotes: 2 })).toBe(
      'Se desactivaron 1 unidad y 2 lotes.',
    );
  });
});
