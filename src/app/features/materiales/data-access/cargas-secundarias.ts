import { signal } from '@angular/core';

/** 401/403: no es un fallo, es que este usuario no puede leer ese recurso. */
function esSinAcceso(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
}

/**
 * Cargas "secundarias" de una pantalla: catálogos auxiliares (ítems, lotes,
 * bodegas...) que acompañan a la lista principal. Si una falla, la pantalla
 * igual debe abrir — pero NO haciendo pasar el fallo por "no hay datos".
 *
 * Reemplaza al `api.listarX().catch(() => [])` que había en cada componente,
 * que trataba igual tres casos distintos:
 *
 * - **No le corresponde** (`permitido = false`): ni se pide. Así no sale el
 *   403 ni el aviso global "Sin permiso" por algo que el usuario no hizo.
 * - **403 que no se esperaba**: se oculta solo ese recurso (el interceptor ya
 *   avisó "Sin permiso").
 * - **Red caída / 500 / cualquier otro fallo**: se devuelve `[]` para no
 *   tumbar la pantalla, y queda anotado en `fallidas()` para que
 *   `<app-aviso-cargas>` diga qué faltó y ofrezca reintentar.
 */
export class CargasSecundarias {
  private readonly _fallidas = signal<string[]>([]);
  /** Nombres (para mostrar) de lo que no se pudo cargar en el último intento. */
  readonly fallidas = this._fallidas.asReadonly();

  /** Llamar al empezar cada recarga de la pantalla. */
  reiniciar(): void {
    this._fallidas.set([]);
  }

  async cargar<T>(nombre: string, pedir: () => Promise<T[]>, permitido = true): Promise<T[]> {
    if (!permitido) return [];
    try {
      return await pedir();
    } catch (e) {
      if (!esSinAcceso(e)) {
        this._fallidas.update((actuales) => (actuales.includes(nombre) ? actuales : [...actuales, nombre]));
      }
      return [];
    }
  }
}
