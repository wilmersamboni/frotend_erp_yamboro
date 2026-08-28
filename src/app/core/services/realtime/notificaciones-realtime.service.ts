import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';

/**
 * Conexión WS a backend-erp para recibir notificaciones al instante en vez
 * de esperar el polling de 30s. El token va en la cookie HttpOnly (el
 * navegador la manda sola con withCredentials) — el JS nunca la lee.
 */
@Injectable({ providedIn: 'root' })
export class NotificacionesRealtimeService {
  private socket: Socket | null = null;

  conectar(): Socket {
    if (this.socket?.connected) return this.socket;
    this.socket = io({
      path: '/api/socket.io',
      withCredentials: true,
      // polling primero (orden por defecto de socket.io): el proxy del
      // dev-server de Angular acepta el handshake HTTP normal pero no
      // siempre completa el upgrade a WebSocket puro — empezar directo por
      // 'websocket' se queda colgado en silencio, sin error ni fallback.
      transports: ['polling', 'websocket'],
    });
    return this.socket;
  }

  onNotificacionNueva(cb: (n: any) => void): void {
    this.conectar().on('notificacion:nueva', cb);
  }

  onNotificacionEliminada(cb: (payload: { id: string }) => void): void {
    this.conectar().on('notificacion:eliminada', cb);
  }

  /**
   * Quita SOLO este listener — no cierra la conexión. El socket es un
   * singleton compartido por toda la app (ej. la campana del navbar);
   * cerrarlo desde el ngOnDestroy de una página de ruta cortaría la
   * conexión de todos los demás. Llamar esto en ngOnDestroy.
   */
  off(evento: string, cb: (...args: any[]) => void): void {
    this.socket?.off(evento, cb);
  }

  /** Solo para cerrar sesión de verdad — no usar desde el ciclo de vida de una página. */
  desconectar(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
