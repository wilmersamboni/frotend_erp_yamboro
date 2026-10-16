import type { Socket } from 'socket.io-client';

/** Esperas entre reintentos tras un corte hecho por el servidor. */
const ESPERAS_MS = [2_000, 10_000, 30_000];
/** Una conexión que aguanta esto se considera sana y reinicia el conteo de reintentos. */
const ESTABLE_MS = 30_000;

/**
 * El servidor corta el socket cuando vence el token de sesión (evento
 * `sesion:expirada`). socket.io-client NO reconecta solo en ese caso
 * (`io server disconnect`), así que sin esto una persona que volvió a iniciar
 * sesión (cookie nueva) se quedaba sin notificaciones en vivo hasta recargar.
 *
 * - Reintenta hasta 3 veces (2 s, 10 s, 30 s). El reintento usa la cookie
 *   vigente: si la sesión sigue o se renovó, entra; si ya no hay sesión, el
 *   servidor lo rechaza y, al agotar los intentos, se deja de insistir (la app
 *   ya manda a iniciar sesión cuando una petición HTTP devuelve 401).
 * - El conteo se reinicia solo cuando una conexión dura ESTABLE_MS: un
 *   rechazo inmediato (conecta y lo cortan al instante) no genera un bucle.
 * - Al volver a la pestaña, si el socket está caído se intenta una vez más.
 *
 * Devuelve la función que lo desactiva; hay que llamarla al cerrar sesión.
 */
export function reconectarSiElServidorCorta(socket: Socket): () => void {
  let intentos = 0;
  let timerReintento: ReturnType<typeof setTimeout> | undefined;
  let timerEstable: ReturnType<typeof setTimeout> | undefined;

  const alConectar = () => {
    clearTimeout(timerEstable);
    timerEstable = setTimeout(() => (intentos = 0), ESTABLE_MS);
  };
  const alDesconectar = (motivo: string) => {
    clearTimeout(timerEstable);
    // En los demás motivos (red caída, timeout…) socket.io reintenta por su cuenta.
    if (motivo !== 'io server disconnect' || intentos >= ESPERAS_MS.length) return;
    clearTimeout(timerReintento);
    timerReintento = setTimeout(() => {
      if (!socket.active) socket.connect();
    }, ESPERAS_MS[intentos++]);
  };
  const alVolverALaPestana = () => {
    if (document.visibilityState === 'visible' && !socket.active) {
      intentos = 0;
      socket.connect();
    }
  };

  socket.on('connect', alConectar);
  socket.on('disconnect', alDesconectar);
  document.addEventListener('visibilitychange', alVolverALaPestana);

  return () => {
    clearTimeout(timerReintento);
    clearTimeout(timerEstable);
    socket.off('connect', alConectar);
    socket.off('disconnect', alDesconectar);
    document.removeEventListener('visibilitychange', alVolverALaPestana);
  };
}
