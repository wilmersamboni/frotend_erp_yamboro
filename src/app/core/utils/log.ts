import { environment } from '../../../environments/environment';

/**
 * Único punto por el que la app escribe en la consola del navegador.
 *
 * - `error`: un fallo real que el código atrapó (una carga que no salió, una
 *   acción que el backend rechazó). Se escribe SIEMPRE, también en producción:
 *   es lo que se le pide a un usuario cuando reporta "no me carga".
 * - `warn` / `debug`: avisos y trazas para quien desarrolla. En el build de
 *   producción no escriben nada.
 *
 * No usar `console.*` directo en la app. La única excepción es `main.ts` (si
 * el arranque falla, todavía no existe nada de esto).
 */
export function crearLog(produccion: boolean) {
  const soloDesarrollo =
    (escribir: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      if (!produccion) escribir(...args);
    };
  return {
    error: (...args: unknown[]): void => console.error(...args),
    warn: soloDesarrollo((...args) => console.warn(...args)),
    debug: soloDesarrollo((...args) => console.log(...args)),
  };
}

export const log = crearLog(environment.production);
