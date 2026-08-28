import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../../environments/environment';

export interface EncuestaActualizadaEvent {
  id: string;
  respuestasActuales: number;
  maxRespuestas: number;
  estado: string;
  fechaFin: string | null;
}

// Direcciones IPv4 (ej: 192.168.50.108) — no son subdominios de tenant. Sin
// este chequeo, el primer octeto ("192") se interpretaba como slug de
// tenant y EncuestasRealtimeGateway rechazaba la conexión con "Tenant no
// encontrado: 192" — mismo bug que ya se había corregido en
// auth.interceptor.ts, pero nunca se replicó acá.
const IPV4_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Conexión WS a backend-encuestas — actualiza en vivo el conteo de
 * respuestas y el cierre de una encuesta en la lista del admin, sin
 * necesidad de refrescar la página. Mismo criterio de auth que
 * NotificacionesRealtimeService: token por cookie HttpOnly, tenant por
 * `auth` (no es sensible, ya viaja como header x-tenant en cada request).
 */
@Injectable({ providedIn: 'root' })
export class EncuestasRealtimeService {
  private socket: Socket | null = null;

  // Mismo orden que auth.interceptor.ts: subdominio > tenant guardado de un
  // login previo > tenant fijo del despliegue (environment.defaultTenant =
  // 'yamboro' en producción — este despliegue por IP sirve un solo tenant).
  private resolveTenant(): string | null {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || IPV4_REGEX.test(hostname)) {
      return localStorage.getItem('tenantSlug') || environment.defaultTenant || null;
    }
    if (hostname.endsWith('.localhost')) {
      return hostname.slice(0, hostname.lastIndexOf('.localhost')).toLowerCase();
    }
    const parts = hostname.split('.');
    if (parts.length >= 3) return parts[0].toLowerCase();
    return localStorage.getItem('tenantSlug') || environment.defaultTenant || null;
  }

  conectar(): Socket {
    if (this.socket?.connected) return this.socket;
    this.socket = io({
      path: '/api2/socket.io',
      withCredentials: true,
      // polling primero — ver comentario en NotificacionesRealtimeService.conectar().
      transports: ['polling', 'websocket'],
      auth: { tenant: this.resolveTenant() },
    });
    return this.socket;
  }

  onEncuestaActualizada(cb: (e: EncuestaActualizadaEvent) => void): void {
    this.conectar().on('encuesta:actualizada', cb);
  }

  /**
   * Quita SOLO este listener — no cierra la conexión. El socket es un
   * singleton compartido por toda la app (otras páginas/componentes pueden
   * seguir usándolo); cerrarlo desde el ngOnDestroy de una página de ruta
   * cortaría la conexión de todos los demás. Llamar esto en ngOnDestroy.
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
