import { Injectable, inject } from '@angular/core';
import { Observable, Subject, debounceTime } from 'rxjs';
import { NotificacionesRealtimeService } from './notificaciones-realtime.service';

/**
 * "Capa 2" de tiempo real para Materiales — sin gateway propio.
 *
 * Los flujos con máquina de estados (solicitudes, traslados, novedades,
 * devoluciones) YA emiten notificaciones a las personas puntuales del flujo
 * (el solicitante y el responsable de la bodega) vía la tabla `notificaciones`
 * del ERP. Esas notificaciones llegan al navegador al instante por el mismo
 * socket que alimenta la campana (`notificacion:nueva`, `/api/socket.io`).
 *
 * Este servicio se engancha a ese socket, filtra las notificaciones cuyo
 * `tipo` empieza con `materiales_`, y expone un stream para que las pantallas
 * de lista hagan un refetch — así una persona ve el estado cambiar sin
 * recargar cuando OTRA aprueba/entrega/rechaza/etc.
 *
 * Límite conocido (asumido): las notificaciones van dirigidas a usuarios
 * concretos. Un tercero que mira la misma lista sin ser parte del flujo NO
 * recibe el evento — para eso haría falta un gateway dedicado con rooms.
 */
@Injectable({ providedIn: 'root' })
export class MaterialesLiveService {
  private readonly rt = inject(NotificacionesRealtimeService);
  private readonly cambios$ = new Subject<string>();
  private enganchado = false;

  /**
   * Emite el `tipo` de cada notificación `materiales_*` recibida. Cada
   * suscriptor recibe su propio `debounceTime` (colapsa ráfagas) — los
   * componentes se suscriben y llaman su `cargar()`.
   */
  eventos(): Observable<string> {
    this.engancharSocket();
    return this.cambios$.pipe(debounceTime(500));
  }

  private engancharSocket(): void {
    if (this.enganchado) return;
    this.enganchado = true;
    // El socket es un singleton de toda la app; agregar otro listener a
    // `notificacion:nueva` no molesta a la campana (socket.io multiplexa).
    this.rt.onNotificacionNueva((n: unknown) => {
      const tipo = String((n as { tipo?: unknown } | null)?.tipo ?? '');
      if (tipo.startsWith('materiales_')) this.cambios$.next(tipo);
    });
  }
}
