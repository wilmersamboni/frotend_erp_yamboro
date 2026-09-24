import { Item, MaterialesApiService, Solicitud } from '../data-access/materiales-api.service';
import { OfflineSnapshotService } from '../../../core/offline/offline-snapshot.service';

const FLUJO = 'materiales.entrega';

export interface LineaDevolutivaBase {
  id_detalle: string | null;
  id_producto: string;
  nombre: string;
  cantidad: number;
}

export interface LineaDevolutivaConOpciones extends LineaDevolutivaBase {
  opciones: Item[];
}

/**
 * Líneas devolutivas de una solicitud (las únicas con ítems puntuales para
 * elegir — un lote consumible se descuenta automático, sin selección).
 * Compartida entre `EntregarSolicitudModalComponent` (que arma esto mismo
 * contra la API cuando hay red) y `prepararSnapshotEntregaOffline` de acá
 * abajo (mismo criterio, para no divergir entre los dos caminos).
 */
export function lineasDevolutivasDeSolicitud(s: Solicitud): LineaDevolutivaBase[] {
  if (s.lineas?.length) {
    return s.lineas
      .filter((l) => !l.id_lote && l.id_producto)
      .map((l) => ({
        id_detalle: l.id_detalle ?? null,
        id_producto: l.id_producto as string,
        nombre: l.producto_nombre ?? 'Producto',
        cantidad: l.cantidad,
      }));
  }
  if (s.id_producto && s.producto?.tipo_material === 'DEVOLUTIVO') {
    return [{ id_detalle: null, id_producto: s.id_producto, nombre: s.producto?.nombre ?? 'Producto', cantidad: s.cantidad }];
  }
  return [];
}

/**
 * Descarga (con red) el snapshot de ítems `DISPONIBLE` de cada línea
 * devolutiva de esta solicitud puntual, para poder abrir el modal de
 * entrega y escanear placas sin conexión más adelante. Se llama desde un
 * botón "Preparar entrega offline" en las 3 pantallas de rol. No hace nada
 * si la solicitud no tiene ninguna línea devolutiva (nada que preparar).
 */
export async function prepararSnapshotEntregaOffline(
  s: Solicitud,
  api: MaterialesApiService,
  offlineSnapshot: OfflineSnapshotService,
): Promise<boolean> {
  const base = lineasDevolutivasDeSolicitud(s);
  if (base.length === 0) return false;
  const lineas: LineaDevolutivaConOpciones[] = await Promise.all(
    base.map(async (l) => {
      const items = await api.listarItems(l.id_producto);
      return { ...l, opciones: items.filter((i) => i.estado === 'DISPONIBLE') };
    }),
  );
  await offlineSnapshot.guardar(FLUJO, s.id_solicitud, lineas);
  return true;
}

/** Lee lo que `prepararSnapshotEntregaOffline` guardó — `null` si esta
 *  solicitud puntual nunca se preparó (o el snapshot se limpió). */
export async function leerSnapshotEntregaOffline(
  s: Solicitud,
  offlineSnapshot: OfflineSnapshotService,
): Promise<LineaDevolutivaConOpciones[] | null> {
  const snap = await offlineSnapshot.obtener<LineaDevolutivaConOpciones[]>(FLUJO, s.id_solicitud);
  return snap?.data ?? null;
}
