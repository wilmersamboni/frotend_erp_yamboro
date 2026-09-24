import { signal } from '@angular/core';
import { EntregarSolicitudModalComponent } from './entregar-solicitud-modal.component';
import { OfflineSnapshotService } from '../../../core/offline/offline-snapshot.service';
import {
  guardarListaSolicitudes,
  leerListaSolicitudes,
  prepararSnapshotEntregaOffline,
  prepararTodasEntregaOffline,
} from './solicitud-entrega-offline.util';

/** Snapshots en memoria (mismo contrato que OfflineSnapshotService). */
class FakeSnapshots {
  private m = new Map<string, unknown>();
  async guardar(flujo: string, entidad: string, data: unknown) { this.m.set(`${flujo}:${entidad}`, data); }
  async obtener(flujo: string, entidad: string) {
    const d = this.m.get(`${flujo}:${entidad}`);
    return d ? { data: d, fetchedAt: 0, vencido: false } : null;
  }
}

const item = (id: string, placa: string | null, producto = 'p1') => ({
  id_item: id, id_producto: producto, placa_sena: placa, codigo_sku: null, estado: 'DISPONIBLE',
});

const solicitud: any = {
  id_solicitud: 's1',
  estado: 'APROBADA',
  lineas: [
    { id_detalle: 'd1', id_producto: 'p1', producto_nombre: 'Portátil', cantidad: 2, id_lote: null },
    { id_detalle: 'd2', id_producto: 'p2', producto_nombre: 'Taladro', cantidad: 1, id_lote: null },
    { id_detalle: 'd3', id_producto: null, producto_nombre: 'Resma', cantidad: 5, id_lote: 'l1' },
  ],
};

describe('Entrega de solicitud: escaneo y modo offline', () => {
  const api: any = {
    listarItems: vi.fn(async (id: string) =>
      id === 'p1'
        ? [item('i1', 'SENA-001'), item('i2', 'SENA-002'), item('i3', 'SENA-003')]
        : [item('i9', 'SENA-900', 'p2'), { ...item('i8', 'SENA-800', 'p2'), estado: 'PRESTADO' }],
    ),
  };
  let snaps: FakeSnapshots;
  let online: ReturnType<typeof signal<boolean>>;

  const modal = () => {
    const m = new EntregarSolicitudModalComponent(api, { alcanzable: online } as any, snaps as unknown as OfflineSnapshotService);
    m.solicitud = solicitud;
    m.abierto = true;
    return m;
  };

  beforeEach(() => {
    snaps = new FakeSnapshots();
    online = signal(true);
  });

  it('con red: carga solo los ítems DISPONIBLES y solo de líneas devolutivas', async () => {
    const m = modal();
    await (m as any).prepararLineas();
    expect(m.lineas.map((l) => l.nombre)).toEqual(['Portátil', 'Taladro']);
    expect(m.lineas[1].opciones.map((i) => i.id_item)).toEqual(['i9']);
  });

  it('sin red y sin "Preparar offline": avisa que no está preparada', async () => {
    online.set(false);
    const m = modal();
    await (m as any).prepararLineas();
    expect(m.sinPreparar).toBe(true);
    expect(m.lineas).toEqual([]);
  });

  it('prepara con red, entrega sin red: usa el snapshot y el escaneo elige placas', async () => {
    await prepararSnapshotEntregaOffline(solicitud, api, snaps as unknown as OfflineSnapshotService);
    api.listarItems.mockClear();
    online.set(false);
    const m = modal();
    await (m as any).prepararLineas();
    expect(api.listarItems).not.toHaveBeenCalled(); // no toca la red
    expect(m.sinPreparar).toBe(false);

    m.modo = 'manual';
    m.onCodigoEscaneado('SENA-001');
    m.onCodigoEscaneado('SENA-003');
    m.onCodigoEscaneado('SENA-900'); // línea de otro producto: se encuentra igual
    expect(m.manualCompleto).toBe(true);

    let emitido: any;
    m.confirmado.subscribe((v) => (emitido = v));
    m.confirmar();
    expect(emitido).toEqual([
      { id_detalle: 'd1', id_items: ['i1', 'i3'] },
      { id_detalle: 'd2', id_items: ['i9'] },
    ]);
  });

  it('placa que no pertenece a la solicitud: se avisa, no se elige nada', async () => {
    const m = modal();
    await (m as any).prepararLineas();
    m.onCodigoEscaneado('NO-EXISTE');
    expect(m.codigoNoEncontrado).toBe('NO-EXISTE');
    expect(m.lineas.every((l) => l.elegidos.length === 0)).toBe(true);
  });

  it('escanear dos veces la misma placa no la duplica ni la des-elige', async () => {
    const m = modal();
    await (m as any).prepararLineas();
    m.onCodigoEscaneado('SENA-001');
    m.onCodigoEscaneado('SENA-001');
    expect(m.lineas[0].elegidos).toEqual(['i1']);
  });

  it('línea completa: una placa más de esa línea no se agrega', async () => {
    const m = modal();
    await (m as any).prepararLineas();
    m.onCodigoEscaneado('SENA-001');
    m.onCodigoEscaneado('SENA-002');
    m.onCodigoEscaneado('SENA-003'); // cantidad pedida = 2
    expect(m.lineas[0].elegidos).toEqual(['i1', 'i2']);
    expect(m.codigoNoEncontrado).toBe('SENA-003');
  });

  it('el lector puede devolver la placa con espacios o en minúsculas', async () => {
    const m = modal();
    await (m as any).prepararLineas();
    m.onCodigoEscaneado('  sena-002 ');
    expect(m.lineas[0].elegidos).toEqual(['i2']);
  });

  it('modo automático emite undefined (el servidor elige)', async () => {
    const m = modal();
    await (m as any).prepararLineas();
    let emitido: any = 'x';
    m.confirmado.subscribe((v) => (emitido = v));
    m.confirmar();
    expect(emitido).toBeUndefined();
  });
});

describe("Lista de solicitudes guardada y preparación masiva", () => {
  const snaps = () => new FakeSnapshots() as unknown as OfflineSnapshotService;
  const iniciarSesion = (id: string, tenant = "sena") => {
    localStorage.setItem("user", JSON.stringify({ id }));
    localStorage.setItem("tenantSlug", tenant);
  };
  afterEach(() => { localStorage.removeItem("user"); localStorage.removeItem("tenantSlug"); });

  it("guarda la lista y la lee de vuelta (sin señal)", async () => {
    iniciarSesion("u1");
    const s = snaps();
    await guardarListaSolicitudes([solicitud], s);
    const leida = await leerListaSolicitudes(s);
    expect(leida?.data.map((x: any) => x.id_solicitud)).toEqual(["s1"]);
  });

  it("la copia de un usuario no la ve otro usuario ni otro tenant", async () => {
    const s = snaps();
    iniciarSesion("u1");
    await guardarListaSolicitudes([solicitud], s);
    iniciarSesion("u2");
    expect(await leerListaSolicitudes(s)).toBeNull();
    iniciarSesion("u1", "otra-inst");
    expect(await leerListaSolicitudes(s)).toBeNull();
  });

  it("sin sesión no guarda ni lee nada", async () => {
    const s = snaps();
    await guardarListaSolicitudes([solicitud], s);
    expect(await leerListaSolicitudes(s)).toBeNull();
  });

  it("prepararTodas cuenta las que quedaron listas y una que falla no frena a las demás", async () => {
    const s = snaps();
    const apiMixta: any = {
      listarItems: vi.fn(async (id: string) => {
        if (id === "p2") throw new Error("sin red");
        return [item("i1", "SENA-001")];
      }),
    };
    const solo = (id: string, prod: string) => ({ id_solicitud: id, estado: "APROBADA", lineas: [{ id_detalle: "d", id_producto: prod, producto_nombre: "X", cantidad: 1, id_lote: null }] });
    const listas = await prepararTodasEntregaOffline([solo("a", "p1"), solo("b", "p2"), solo("c", "p1")] as any, apiMixta, s);
    expect(listas).toBe(2);
  });
});
