import { TestBed } from '@angular/core/testing';
import { MaterialesTrasladosComponent } from './traslados.component';
import { MaterialesScreenPolicy } from '../ui/materiales-screen-policy';
import { Lote } from '../data-access/materiales-api.service';

function lote(datos: Partial<Lote> & { id_lote: string }): Lote {
  return {
    id_producto: 'p1',
    cantidad_inicial: 100,
    cantidad_disponible: 10,
    estado: 'ACTIVO',
    id_sitio: 'bodega-a',
    producto: { id_producto: 'p1', nombre: 'Abono', SKU: null, tipo_material: 'CONSUMO' },
    ...datos,
  };
}

function crear(lotes: Lote[]): MaterialesTrasladosComponent {
  TestBed.configureTestingModule({
    providers: [{ provide: MaterialesScreenPolicy, useValue: { puedeListar: () => true } }],
  });
  const componente = TestBed.runInInjectionContext(
    () => new MaterialesTrasladosComponent({} as any, {} as any, {} as any, {} as any, {} as any),
  );
  componente.lotes = lotes;
  return componente;
}

describe('Traslados: cantidad máxima y reserva de lote', () => {
  it('el máximo es lo disponible menos lo reservado en otros traslados pendientes', () => {
    const c = crear([lote({ id_lote: 'l1', cantidad_disponible: 10, cantidad_reservada: 4 })]);
    c.loteSeleccionadoId = 'l1';

    expect(c.cantidadMaximaLote()).toBe(6);
  });

  it('sin reserva, el máximo es todo lo disponible; sin lote elegido, cero', () => {
    const c = crear([lote({ id_lote: 'l1', cantidad_disponible: 10 })]);

    expect(c.cantidadMaximaLote()).toBe(0);
    c.loteSeleccionadoId = 'l1';
    expect(c.cantidadMaximaLote()).toBe(10);
  });

  it('una reserva mayor que el saldo no da un máximo negativo', () => {
    const c = crear([lote({ id_lote: 'l1', cantidad_disponible: 3, cantidad_reservada: 5 })]);
    c.loteSeleccionadoId = 'l1';

    expect(c.cantidadMaximaLote()).toBe(0);
  });

  it('el selector solo ofrece lotes activos, con bodega y con saldo libre', () => {
    const c = crear([
      lote({ id_lote: 'libre', cantidad_disponible: 10, cantidad_reservada: 4 }),
      lote({ id_lote: 'todo-reservado', cantidad_disponible: 5, cantidad_reservada: 5 }),
      lote({ id_lote: 'agotado', estado: 'AGOTADO' }),
      lote({ id_lote: 'sin-bodega', id_sitio: null }),
    ]);

    expect(c.opcionesLotes().map((o) => o.value)).toEqual(['libre']);
    expect(c.opcionesLotes()[0].label).toContain('(6 disponibles)');
  });

  it('no deja agregar más que el saldo libre, ni cantidades no enteras o menores a 1', () => {
    const c = crear([lote({ id_lote: 'l1', cantidad_disponible: 10, cantidad_reservada: 4 })]);
    c.loteSeleccionadoId = 'l1';

    for (const cantidad of [7, 0, -1, 2.5]) {
      c.cantidadLote = cantidad;
      c.agregarLote();
      expect(c.lotesSeleccionados).toEqual([]);
      expect(c.errorBusqueda).toContain('cantidad válida');
    }
  });

  it('agregar el máximo exacto funciona, limpia el formulario y saca el lote del selector', () => {
    const c = crear([lote({ id_lote: 'l1', cantidad_disponible: 10, cantidad_reservada: 4 })]);
    c.loteSeleccionadoId = 'l1';
    c.cantidadLote = 6;

    c.agregarLote();

    expect(c.lotesSeleccionados.map((s) => [s.lote.id_lote, s.cantidad])).toEqual([['l1', 6]]);
    expect(c.loteSeleccionadoId).toBeNull();
    expect(c.cantidadLote).toBe(1);
    expect(c.errorBusqueda).toBeNull();
    expect(c.opcionesLotes()).toEqual([]);
  });

  it('con un lote ya elegido, solo se ofrecen lotes de esa misma bodega de origen', () => {
    const c = crear([
      lote({ id_lote: 'a1', id_sitio: 'bodega-a' }),
      lote({ id_lote: 'a2', id_sitio: 'bodega-a' }),
      lote({ id_lote: 'b1', id_sitio: 'bodega-b' }),
    ]);
    c.loteSeleccionadoId = 'a1';
    c.cantidadLote = 1;
    c.agregarLote();

    expect(c.opcionesLotes().map((o) => o.value)).toEqual(['a2']);
  });

  it('cambiar de lote vuelve la cantidad a 1 (no arrastra la del lote anterior)', () => {
    const c = crear([lote({ id_lote: 'l1' })]);
    c.cantidadLote = 8;

    c.onLoteSeleccionado();

    expect(c.cantidadLote).toBe(1);
  });
});
