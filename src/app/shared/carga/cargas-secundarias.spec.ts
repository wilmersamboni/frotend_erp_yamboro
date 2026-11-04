import { HttpErrorResponse } from '@angular/common/http';
import { CargasSecundarias } from './cargas-secundarias';

describe('CargasSecundarias', () => {
  const falla = (status: number) => () => Promise.reject(new HttpErrorResponse({ status }));

  it('devuelve los datos y no anota nada cuando la carga sale bien', async () => {
    const cargas = new CargasSecundarias();

    expect(await cargas.cargar('ítems', () => Promise.resolve([1, 2]))).toEqual([1, 2]);
    expect(cargas.fallidas()).toEqual([]);
  });

  it('sin permiso para esa lista, ni siquiera hace la petición', async () => {
    const cargas = new CargasSecundarias();
    const pedir = vi.fn(() => Promise.resolve([1]));

    expect(await cargas.cargar('lotes', pedir, false)).toEqual([]);
    expect(pedir).not.toHaveBeenCalled();
    expect(cargas.fallidas()).toEqual([]);
  });

  it.each([401, 403])('un %i oculta solo ese recurso, sin marcarlo como fallo', async (status) => {
    const cargas = new CargasSecundarias();

    expect(await cargas.cargar('bodegas', falla(status))).toEqual([]);
    expect(cargas.fallidas()).toEqual([]);
  });

  it.each([0, 500, 502, 504, 404])('un %i se anota como fallo para avisar y reintentar', async (status) => {
    const cargas = new CargasSecundarias();

    expect(await cargas.cargar('bodegas', falla(status))).toEqual([]);
    expect(cargas.fallidas()).toEqual(['bodegas']);
  });

  it('un error que no es HTTP también cuenta como fallo', async () => {
    const cargas = new CargasSecundarias();

    await cargas.cargar('lotes', () => Promise.reject(new Error('boom')));

    expect(cargas.fallidas()).toEqual(['lotes']);
  });

  it('junta los fallos de varias cargas sin repetir el mismo nombre', async () => {
    const cargas = new CargasSecundarias();

    await Promise.all([
      cargas.cargar('ítems', falla(500)),
      cargas.cargar('bodegas', falla(0)),
      cargas.cargar('bodegas', falla(0)),
      cargas.cargar('lotes', () => Promise.resolve([])),
    ]);

    expect(cargas.fallidas()).toEqual(['ítems', 'bodegas']);
  });

  it('reiniciar() limpia los fallos del intento anterior', async () => {
    const cargas = new CargasSecundarias();
    await cargas.cargar('ítems', falla(500));

    cargas.reiniciar();

    expect(cargas.fallidas()).toEqual([]);
  });
  it('cargarUno devuelve el respaldo y anota el fallo cuando el valor no llega', async () => {
    const cargas = new CargasSecundarias();

    const stats = await cargas.cargarUno('estadísticas', falla(500), { total: 0, activos: 0 });

    expect(stats).toEqual({ total: 0, activos: 0 });
    expect(cargas.fallo('estadísticas')).toBe(true);
    expect(cargas.fallo('eventos')).toBe(false);
  });

  it('cargarUno no cuenta como fallo un 403', async () => {
    const cargas = new CargasSecundarias();

    await cargas.cargarUno('estadísticas', falla(403), null);

    expect(cargas.fallo('estadísticas')).toBe(false);
  });
  it('olvidar quita solo el fallo indicado y falloAlguna mira varios nombres', async () => {
    const cargas = new CargasSecundarias();
    await cargas.cargar('material', falla(500));
    await cargas.cargar('bodegas', falla(500));

    expect(cargas.falloAlguna(['personas', 'bodegas'])).toBe(true);
    expect(cargas.falloAlguna(['personas'])).toBe(false);

    cargas.olvidar('material');

    expect(cargas.fallidas()).toEqual(['bodegas']);
  });
});
