import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

export type EstadoAccionPendiente = 'pendiente' | 'enviando' | 'conflicto';

export interface AccionPendiente<T = unknown> {
  id?: number;
  /** Nombre registrado en `SyncQueueService.registerHandler` — identifica
   *  qué handler sabe procesar esta acción (ej. 'materiales.asignarPlacas'). */
  tipo: string;
  payload: T;
  creadoEn: number;
  intentos: number;
  ultimoError: string | null;
  estado: EstadoAccionPendiente;
}

export interface EntradaConflictLog extends AccionPendiente {
  resueltoEn: number;
  resolucion: 'descartada' | 'reintentada';
}

export interface SnapshotGuardado<T = unknown> {
  /** `"<flujo>:<entidad>"`, ej. `"materiales.placas:<id_producto>"`. */
  clave: string;
  data: T;
  fetchedAt: number;
  expiresAt: number;
}

interface OfflineDBSchema extends DBSchema {
  snapshots: {
    key: string;
    value: SnapshotGuardado;
  };
  pendingActions: {
    key: number;
    value: AccionPendiente;
    indexes: { estado: string };
  };
  conflictLog: {
    key: number;
    value: EntradaConflictLog;
  };
}

const DB_NAME = 'epsas-offline';
const DB_VERSION = 1;

/**
 * Acceso crudo a IndexedDB (vía `idb`) para el escaneo offline — ver plan
 * "Escaneo offline de placas SENA". Tres stores: `snapshots` (datos de
 * referencia descargados con antelación), `pendingActions` (cola de
 * acciones a sincronizar) y `conflictLog` (histórico de conflictos
 * resueltos, nunca se autoborra — auditoría). No conoce nada de negocio
 * (placas, ítems, solicitudes) — eso vive en `SyncQueueService`/
 * `OfflineSnapshotService` y en los flujos que los usan.
 */
@Injectable({ providedIn: 'root' })
export class IndexedDbService {
  private dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

  private db(): Promise<IDBPDatabase<OfflineDBSchema>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('snapshots')) {
            db.createObjectStore('snapshots', { keyPath: 'clave' });
          }
          if (!db.objectStoreNames.contains('pendingActions')) {
            const store = db.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
            store.createIndex('estado', 'estado');
          }
          if (!db.objectStoreNames.contains('conflictLog')) {
            db.createObjectStore('conflictLog', { keyPath: 'id', autoIncrement: true });
          }
        },
      });
    }
    return this.dbPromise;
  }

  // -- snapshots --

  async guardarSnapshot(s: SnapshotGuardado): Promise<void> {
    const db = await this.db();
    await db.put('snapshots', s);
  }

  async leerSnapshot<T>(clave: string): Promise<SnapshotGuardado<T> | undefined> {
    const db = await this.db();
    return (await db.get('snapshots', clave)) as SnapshotGuardado<T> | undefined;
  }

  async borrarSnapshot(clave: string): Promise<void> {
    const db = await this.db();
    await db.delete('snapshots', clave);
  }

  // -- pendingActions --

  async agregarAccion(a: Omit<AccionPendiente, 'id'>): Promise<number> {
    const db = await this.db();
    return db.add('pendingActions', a as AccionPendiente);
  }

  async actualizarAccion(a: AccionPendiente): Promise<void> {
    const db = await this.db();
    await db.put('pendingActions', a);
  }

  async eliminarAccion(id: number): Promise<void> {
    const db = await this.db();
    await db.delete('pendingActions', id);
  }

  async obtenerAccion(id: number): Promise<AccionPendiente | undefined> {
    const db = await this.db();
    return db.get('pendingActions', id);
  }

  async listarAcciones(): Promise<AccionPendiente[]> {
    const db = await this.db();
    return db.getAll('pendingActions');
  }

  async listarAccionesPorEstado(estado: EstadoAccionPendiente): Promise<AccionPendiente[]> {
    const db = await this.db();
    return db.getAllFromIndex('pendingActions', 'estado', estado);
  }

  // -- conflictLog --

  async agregarAlHistorialConflictos(entry: EntradaConflictLog): Promise<void> {
    const db = await this.db();
    const { id, ...sinId } = entry;
    await db.add('conflictLog', sinId as EntradaConflictLog);
  }

  async listarHistorialConflictos(): Promise<EntradaConflictLog[]> {
    const db = await this.db();
    return db.getAll('conflictLog');
  }
}
