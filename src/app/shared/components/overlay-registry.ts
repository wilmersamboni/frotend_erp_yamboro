/**
 * Registro compartido de "solo 1 dropdown/calendario abierto a la vez" —
 * usado por app-ss (SearchableSelectComponent) y app-date-input
 * (DateInputComponent). Sin esto, cada componente solo sabía cerrarse a sí
 * mismo con clic-afuera, así que abrir un segundo select/calendario no
 * cerraba el primero (ni entre selects ni entre select↔calendario).
 */
type CloseFn = () => void;

let current: CloseFn | null = null;

/** Llamar al abrir un panel: cierra cualquier otro panel abierto (de cualquiera de los dos componentes). */
export function openOverlay(close: CloseFn): void {
  if (current && current !== close) current();
  current = close;
}

/** Llamar al cerrar un panel (por clic-afuera, Escape, selección, etc.) para liberar el registro. */
export function releaseOverlay(close: CloseFn): void {
  if (current === close) current = null;
}
