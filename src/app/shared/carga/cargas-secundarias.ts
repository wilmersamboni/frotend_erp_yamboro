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
    return this.cargarUno(nombre, pedir, []);
  }

  /**
   * Igual que `cargar`, para un valor que no es una lista (un objeto de
   * estadísticas, una persona…): si falla devuelve `respaldo` y anota el fallo.
   */
  async cargarUno<T>(nombre: string, pedir: () => Promise<T>, respaldo: T): Promise<T> {
    try {
      return await pedir();
    } catch (e) {
      if (!esSinAcceso(e)) {
        this._fallidas.update((actuales) => (actuales.includes(nombre) ? actuales : [...actuales, nombre]));
      }
      return respaldo;
    }
  }

  /** Anota que falló una carga que no pasó por `cargar`/`cargarUno` (p. ej. la lista principal de una pantalla). */
  marcarFallo(nombre: string): void {
    this._fallidas.update((actuales) => (actuales.includes(nombre) ? actuales : [...actuales, nombre]));
  }

  /** Quita un fallo anotado, antes de reintentar esa carga (sin tocar los demás). */
  olvidar(nombre: string): void {
    this._fallidas.update((actuales) => actuales.filter((n) => n !== nombre));
  }

  /** ¿Falló alguna de estas cargas? Para el aviso junto a un campo que depende de varias. */
  falloAlguna(nombres: string[]): boolean {
    const fallidas = this._fallidas();
    return nombres.some((n) => fallidas.includes(n));
  }

  /** ¿Falló esta carga en el último intento? Para mostrar «—» en vez de un 0 inventado. */
  fallo(nombre: string): boolean {
    return this._fallidas().includes(nombre);
  }
}
