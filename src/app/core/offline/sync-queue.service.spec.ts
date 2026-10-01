import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccionPendiente, IndexedDbService } from './indexed-db.service';
import { NetworkStatusService } from './network-status.service';
import { ConflictoSyncError, SyncQueueService } from './sync-queue.service';

/** IndexedDB en memoria: mismo contrato que IndexedDbService, sin navegador. */
class FakeDb {
  acciones = new Map<number, AccionPendiente>();
  historial: unknown[] = [];
  private seq = 0;
  async agregarAccion(a: Omit<AccionPendiente, 'id'>) {
    const id = ++this.seq;
    this.acciones.set(id, { ...a, id } as AccionPendiente);
    return id;
  }
  async actualizarAccion(a: AccionPendiente) { this.acciones.set(a.id!, { ...a }); }
  async eliminarAccion(id: number) { this.acciones.delete(id); }
  async obtenerAccion(id: number) { return this.acciones.get(id); }
  async listarAcciones() { return [...this.acciones.values()]; }
  async listarAccionesPorEstado(e: string) { return [...this.acciones.values()].filter((a) => a.estado === e); }
  async agregarAlHistorialConflictos(e: unknown) { this.historial.push(e); }
}

describe('SyncQueueService (entrega/placas offline)', () => {
  let db: FakeDb;
  let alcanzable: ReturnType<typeof signal<boolean>>;

  const crear = () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: IndexedDbService, useValue: db },
        { provide: NetworkStatusService, useValue: { alcanzable } },
      ],
    });
    return TestBed.inject(SyncQueueService);
  };

  beforeEach(() => {
    db = new FakeDb();
    alcanzable = signal(false);
  });

  it('sin red: encola y NO llama al handler', async () => {
    const q = crear();
    const handler = vi.fn().mockResolvedValue(undefined);
    q.registerHandler('materiales.entregarSolicitud', handler);
    await q.enqueue('materiales.entregarSolicitud', { id_solicitud: 's1' });
    expect(handler).not.toHaveBeenCalled();
    expect(q.pendientes()).toBe(1);
  });

  it('al volver la red: envía la acción y la borra de la cola', async () => {
    const q = crear();
    const handler = vi.fn().mockResolvedValue(undefined);
    q.registerHandler('materiales.entregarSolicitud', handler);
    await q.enqueue('materiales.entregarSolicitud', { id_solicitud: 's1', seleccion: [{ id_detalle: 'd1', id_items: ['i1'] }] });
    alcanzable.set(true);
    await q.procesarCola();
    expect(handler).toHaveBeenCalledWith({ id_solicitud: 's1', seleccion: [{ id_detalle: 'd1', id_items: ['i1'] }] });
    expect(q.pendientes()).toBe(0);
    expect(db.acciones.size).toBe(0);
  });

  it('respeta el orden FIFO', async () => {
    const q = crear();
    const orden: string[] = [];
    q.registerHandler('t', async (p: { n: string }) => { orden.push(p.n); });
    await q.enqueue('t', { n: 'a' });
    await q.enqueue('t', { n: 'b' });
    await q.enqueue('t', { n: 'c' });
    alcanzable.set(true);
    await q.procesarCola();
    expect(orden).toEqual(['a', 'b', 'c']);
  });

  it('rechazo del backend (409/400) pasa a conflicto y no se reintenta solo', async () => {
    const q = crear();
    const handler = vi.fn().mockRejectedValue({ status: 409, message: 'La placa ya está en uso' });
    q.registerHandler('t', handler);
    await q.enqueue('t', {});
    alcanzable.set(true);
    await q.procesarCola();
    await q.procesarCola();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(q.conflictos()).toBe(1);
    expect(q.pendientes()).toBe(0);
  });

  it('ConflictoSyncError también es conflicto', async () => {
    const q = crear();
    q.registerHandler('t', async () => { throw new ConflictoSyncError('x'); });
    await q.enqueue('t', {});
    alcanzable.set(true);
    await q.procesarCola();
    expect(q.conflictos()).toBe(1);
  });

  it('fallo de red (status 0) queda pendiente y se reintenta', async () => {
    const q = crear();
    const handler = vi.fn().mockRejectedValueOnce({ status: 0 }).mockResolvedValue(undefined);
    q.registerHandler('t', handler);
    await q.enqueue('t', {});
    alcanzable.set(true);
    await q.procesarCola();
    expect(q.pendientes()).toBe(1);
    await q.procesarCola();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(q.pendientes()).toBe(0);
  });

  it('un conflicto no bloquea las acciones siguientes', async () => {
    const q = crear();
    const ok = vi.fn().mockResolvedValue(undefined);
    q.registerHandler('malo', async () => { throw { status: 400 }; });
    q.registerHandler('bueno', ok);
    await q.enqueue('malo', {});
    await q.enqueue('bueno', {});
    alcanzable.set(true);
    await q.procesarCola();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(q.conflictos()).toBe(1);
  });

  it('descartar mueve el conflicto al historial', async () => {
    const q = crear();
    q.registerHandler('t', async () => { throw { status: 409 }; });
    const id = await q.enqueue('t', {});
    alcanzable.set(true);
    await q.procesarCola();
    await q.descartar(id);
    expect(db.historial.length).toBe(1);
    expect(q.conflictos()).toBe(0);
  });

  describe('sesión (usuario y tenant)', () => {
    const entrar = (id: string | null, tenant = 'sena') => {
      localStorage.setItem('user', JSON.stringify(id ? { id } : null));
      localStorage.setItem('tenantSlug', tenant);
    };
    afterEach(() => { localStorage.removeItem('user'); localStorage.removeItem('tenantSlug'); });

    it('una acción encolada por otro usuario no se envía ni se cuenta con la sesión nueva', async () => {
      entrar('u1');
      const q = crear();
      const handler = vi.fn().mockResolvedValue(undefined);
      q.registerHandler('t', handler);
      await q.enqueue('t', { n: 1 });

      entrar('u2'); // otra persona entra al mismo celular
      alcanzable.set(true);
      await q.procesarCola();
      expect(handler).not.toHaveBeenCalled();
      expect(q.pendientes()).toBe(0);
      expect((await q.listarPendientesYConflictos()).length).toBe(0);
      expect(db.acciones.size).toBe(1); // no se pierde: sigue guardada

      entrar('u1'); // vuelve el dueño
      await q.procesarCola();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(db.acciones.size).toBe(0);
    });

    it('otro tenant tampoco la envía', async () => {
      entrar('u1', 'sena');
      const q = crear();
      const handler = vi.fn().mockResolvedValue(undefined);
      q.registerHandler('t', handler);
      await q.enqueue('t', {});
      entrar('u1', 'otra-inst');
      alcanzable.set(true);
      await q.procesarCola();
      expect(handler).not.toHaveBeenCalled();
    });

    it('acciones antiguas sin sello se siguen tratando como propias', async () => {
      entrar('u1');
      await db.agregarAccion({ tipo: 't', payload: {}, creadoEn: 1, intentos: 0, ultimoError: null, estado: 'pendiente' });
      alcanzable.set(true);
      const q = crear();
      const handler = vi.fn().mockResolvedValue(undefined);
      q.registerHandler('t', handler);
      await q.procesarCola();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  it('entregasPendientes marca la solicitud mientras espera y la quita al enviarse', async () => {
    const q = crear();
    q.registerHandler('materiales.entregarSolicitud', async () => {});
    await q.enqueue('materiales.entregarSolicitud', { id_solicitud: 's7' });
    await q.enqueue('otro.tipo', { id_solicitud: 's8' });
    expect([...q.entregasPendientes()]).toEqual(['s7']);
    alcanzable.set(true);
    await q.procesarCola();
    expect(q.entregasPendientes().size).toBe(0);
  });

  it('una acción que quedó "enviando" al cerrarse la app se recupera al arrancar', async () => {
    await db.agregarAccion({ tipo: 't', payload: {}, creadoEn: 1, intentos: 0, ultimoError: null, estado: 'enviando' });
    alcanzable.set(true);
    const q = crear();
    const handler = vi.fn().mockResolvedValue(undefined);
    q.registerHandler('t', handler);
    await q.recuperarInterrumpidas();
    await q.procesarCola();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(q.pendientes()).toBe(0);
  });
});
