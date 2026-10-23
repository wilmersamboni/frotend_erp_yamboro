import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reconectarSiElServidorCorta } from './reconexion-socket';

/** Socket mínimo: guarda los listeners y deja dispararlos a mano. */
function socketFalso() {
  const oyentes = new Map<string, Array<(...a: any[]) => void>>();
  const s: any = {
    active: false,
    connect: vi.fn(() => { s.active = true; }),
    on: (e: string, cb: any) => oyentes.set(e, [...(oyentes.get(e) ?? []), cb]),
    off: (e: string, cb: any) => oyentes.set(e, (oyentes.get(e) ?? []).filter((x) => x !== cb)),
    emitir: (e: string, ...a: any[]) => (oyentes.get(e) ?? []).forEach((cb) => cb(...a)),
  };
  return s;
}

describe('reconectarSiElServidorCorta (S33)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('si el servidor corta (token vencido), reintenta a los 2 s', () => {
    const s = socketFalso();
    reconectarSiElServidorCorta(s);
    s.emitir('disconnect', 'io server disconnect');
    expect(s.connect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(s.connect).toHaveBeenCalledTimes(1);
  });

  it('no interviene cuando el corte es de red o del propio cliente', () => {
    const s = socketFalso();
    reconectarSiElServidorCorta(s);
    s.emitir('disconnect', 'transport close');
    s.emitir('disconnect', 'io client disconnect');
    vi.advanceTimersByTime(60_000);
    expect(s.connect).not.toHaveBeenCalled();
  });

  it('un rechazo inmediato no produce bucle: se detiene tras 3 intentos', () => {
    const s = socketFalso();
    reconectarSiElServidorCorta(s);
    for (let i = 0; i < 6; i++) {
      s.emitir('connect');
      s.active = false;
      s.emitir('disconnect', 'io server disconnect'); // lo cortan al instante
      vi.advanceTimersByTime(30_000);
    }
    expect(s.connect).toHaveBeenCalledTimes(3);
  });

  it('una conexión que aguanta 30 s reinicia el conteo', () => {
    const s = socketFalso();
    reconectarSiElServidorCorta(s);
    for (let i = 0; i < 5; i++) {
      s.emitir('connect');
      vi.advanceTimersByTime(30_000); // conexión sana
      s.active = false;
      s.emitir('disconnect', 'io server disconnect');
      vi.advanceTimersByTime(2_000);
    }
    expect(s.connect).toHaveBeenCalledTimes(5);
  });

  it('al cerrar sesión (detener) ya no reconecta', () => {
    const s = socketFalso();
    const detener = reconectarSiElServidorCorta(s);
    s.emitir('disconnect', 'io server disconnect');
    detener();
    vi.advanceTimersByTime(60_000);
    expect(s.connect).not.toHaveBeenCalled();
  });
});
