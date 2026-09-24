import { Injectable, signal } from '@angular/core';

const PING_INTERVAL_MS = 15_000;
const PING_TIMEOUT_MS = 4_000;

/**
 * `navigator.onLine` solo dice "hay algún enlace de red" — no "el backend
 * del proyecto es alcanzable", que es la distinción real que importa para
 * el escaneo offline (LAN sin bodega, LAN con bodega pero sin acceso al
 * server, WiFi de otro lugar son casos distintos que `navigator.onLine` no
 * distingue). Combina el evento nativo con un ping activo periódico —
 * liviano (`HEAD`, sin cuerpo) a un endpoint que siempre existe, sin
 * importar el status que devuelva: alcanza con que el servidor conteste
 * algo para confirmar que hay camino de red hasta él.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  readonly alcanzable = signal(navigator.onLine);

  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    window.addEventListener('online', () => this.chequear());
    window.addEventListener('offline', () => this.alcanzable.set(false));
    this.chequear();
    this.intervalId = setInterval(() => this.chequear(), PING_INTERVAL_MS);
  }

  async chequear(): Promise<boolean> {
    if (!navigator.onLine) {
      this.alcanzable.set(false);
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      try {
        // Cualquier respuesta (incluido un 404) confirma que el servidor
        // contestó — `fetch` solo rechaza ante un fallo real de red/timeout,
        // no ante un status de error HTTP.
        await fetch('/api2', { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
      } finally {
        clearTimeout(timeoutId);
      }
      this.alcanzable.set(true);
      return true;
    } catch {
      this.alcanzable.set(false);
      return false;
    }
  }
}
