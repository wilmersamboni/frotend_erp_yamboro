import { Injectable, inject } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';

export interface SnapshotConsulta<T> {
  data: T;
  fetchedAt: number;
  vencido: boolean;
}

/** 8 horas — cubre un turno de trabajo típico. */
const TTL_DEFECTO_MS = 8 * 60 * 60 * 1000;

/**
 * Guarda "fotos" de datos de referencia para poder operar sin red — qué
 * ítems están pendientes de placa para un producto, o qué ítems puede
 * escanear una solicitud puntual al entregarla. Se descarga explícitamente
 * (botón "Preparar para trabajar offline"), nunca de forma automática o
 * transparente: un snapshot vencido NO se borra ni se oculta solo, se sigue
 * mostrando con un aviso de antigüedad — nunca le escondemos información al
 * usuario por vencimiento, solo se lo hacemos saber.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSnapshotService {
  private readonly db = inject(IndexedDbService);

  private clave(flujo: string, entidad: string): string {
    return `${flujo}:${entidad}`;
  }

  async guardar<T>(flujo: string, entidad: string, data: T, ttlMs = TTL_DEFECTO_MS): Promise<void> {
    const ahora = Date.now();
    await this.db.guardarSnapshot({
      clave: this.clave(flujo, entidad),
      data,
      fetchedAt: ahora,
      expiresAt: ahora + ttlMs,
    });
  }

  async obtener<T>(flujo: string, entidad: string): Promise<SnapshotConsulta<T> | null> {
    const s = await this.db.leerSnapshot<T>(this.clave(flujo, entidad));
    if (!s) return null;
    return { data: s.data, fetchedAt: s.fetchedAt, vencido: Date.now() > s.expiresAt };
  }

  async limpiar(flujo: string, entidad: string): Promise<void> {
    await this.db.borrarSnapshot(this.clave(flujo, entidad));
  }
}
