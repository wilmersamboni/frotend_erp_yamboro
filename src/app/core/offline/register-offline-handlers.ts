import { inject } from '@angular/core';
import { SyncQueueService } from './sync-queue.service';
import { MaterialesApiService } from '../../features/materiales/data-access/materiales-api.service';
import type { SeleccionLineaEntregaInput } from '../../features/materiales/data-access/materiales-api.service';

/**
 * Registra los handlers de sync ANTES de que el usuario visite ninguna
 * pantalla de Materiales — si se registraran recién en el `ngOnInit` de
 * cada componente (Ítems, Solicitudes), una acción encolada en una sesión
 * previa quedaría sin procesar hasta que alguien abra esa pantalla puntual
 * en la sesión donde vuelve la señal. Se invoca una sola vez al arrancar la
 * app vía `provideAppInitializer` (ver `app.config.ts`).
 *
 * Cada handler solo llama al mismo endpoint que ya usa el camino online —
 * no hay lógica de negocio duplicada acá, ver plan de escaneo offline.
 */
export function registerOfflineHandlers(): void {
  const syncQueue = inject(SyncQueueService);
  const api = inject(MaterialesApiService);

  syncQueue.registerHandler(
    'materiales.asignarPlacas',
    async (payload: { asignaciones: { id_item: string; placa_sena: string }[] }) => {
      await api.asignarPlacasItems(payload.asignaciones);
    },
  );

  syncQueue.registerHandler(
    'materiales.entregarSolicitud',
    async (payload: { id_solicitud: string; seleccion?: SeleccionLineaEntregaInput[] }) => {
      await api.entregarSolicitud(payload.id_solicitud, payload.seleccion);
    },
  );
}
