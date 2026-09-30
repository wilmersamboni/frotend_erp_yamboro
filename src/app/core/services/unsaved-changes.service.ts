import { DestroyRef, Injectable, inject } from '@angular/core';
import type { CanDeactivateFn, Routes } from '@angular/router';
import { ConfirmService } from './confirm.service';

/**
 * Aviso de cambios sin guardar.
 *
 * Los componentes con formularios largos (modal de solicitud, asistente de
 * horarios, importar productos) registran una función "¿hay cambios?" con
 * `avisarCambiosSinGuardar()`. Con eso queda cubierto, sin más código en cada
 * pantalla:
 *  - cambiar de ruta (menú lateral, atrás del navegador, cerrar sesión),
 *    vía `sinCambiosPendientesGuard`, que se aplica a todas las rutas en
 *    app.routes.ts;
 *  - cerrar o recargar la pestaña (evento `beforeunload`).
 * Cerrar un modal a mano (fondo, ×, Cancelar) lo maneja cada componente con
 * `confirmarDescartar()`.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedChangesService {
  private readonly confirm = inject(ConfirmService);
  private readonly fuentes = new Set<() => boolean>();

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeunload', (e) => {
      if (!this.hayCambios()) return;
      // El texto no se puede personalizar: el navegador muestra el suyo.
      e.preventDefault();
      e.returnValue = '';
    });
  }

  /** Registra una fuente de "hay cambios"; devuelve la función para quitarla. */
  registrar(hayCambios: () => boolean): () => void {
    this.fuentes.add(hayCambios);
    return () => this.fuentes.delete(hayCambios);
  }

  hayCambios(): boolean {
    for (const f of this.fuentes) if (f()) return true;
    return false;
  }

  /** Pregunta antes de perder lo escrito. `true` = se puede continuar. */
  confirmarDescartar(): Promise<boolean> {
    return this.confirm.ask('Tienes cambios sin guardar. Si continúas, se perderán.', {
      header: '¿Descartar los cambios?',
      acceptLabel: 'Descartar',
      rejectLabel: 'Seguir editando',
    });
  }

  /** Para el guard de rutas: deja pasar si no hay nada pendiente o si el usuario acepta perderlo. */
  confirmarSalida(): Promise<boolean> | boolean {
    return this.hayCambios() ? this.confirmarDescartar() : true;
  }
}

/**
 * Registra, mientras el componente viva, cuándo tiene cambios sin guardar.
 * Llamar en un contexto de inyección (inicializador de campo o constructor):
 *
 *   private readonly _aviso = avisarCambiosSinGuardar(() => this.cambios.sucio);
 */
export function avisarCambiosSinGuardar(hayCambios: () => boolean): void {
  const quitar = inject(UnsavedChangesService).registrar(hayCambios);
  inject(DestroyRef).onDestroy(quitar);
}

/**
 * Formulario que se abre y se cierra (modal, asistente): compara su estado
 * actual con el del momento de abrirlo, así un formulario que se abre con
 * valores precargados no cuenta como "modificado" hasta que el usuario toca algo.
 *
 *   cambios = new FormularioVigilado(() => JSON.stringify([this.a, this.b]));
 *   abrir():  ...inicializa los campos...; this.cambios.iniciar();
 *   guardar(): ...éxito...; this.cambios.terminar();
 */
export class FormularioVigilado {
  private inicial: string | null = null;

  constructor(private readonly firma: () => string) {}

  /** Llamar al abrir, cuando el formulario ya tiene sus valores iniciales. */
  iniciar(): void {
    this.inicial = this.firma();
  }

  /** Llamar al cerrar o al guardar con éxito. */
  terminar(): void {
    this.inicial = null;
  }

  get sucio(): boolean {
    return this.inicial !== null && this.firma() !== this.inicial;
  }
}

export const sinCambiosPendientesGuard: CanDeactivateFn<unknown> = () =>
  inject(UnsavedChangesService).confirmarSalida();

/**
 * Agrega a cada ruta con componente el guard de "cambios sin guardar". Es
 * global a propósito: una pantalla nueva solo llama a `avisarCambiosSinGuardar()`,
 * sin tocar las rutas. Se aplica en app.routes.ts y en los archivos de rutas que
 * se cargan aparte (`loadChildren`), porque este recorrido no entra a esos.
 */
export function conAvisoDeCambios(rutas: Routes): Routes {
  return rutas.map((r) => ({
    ...r,
    ...(r.redirectTo === undefined && (r.component || r.loadComponent)
      ? { canDeactivate: [...(r.canDeactivate ?? []), sinCambiosPendientesGuard] }
      : {}),
    ...(r.children ? { children: conAvisoDeCambios(r.children) } : {}),
  }));
}
