import { AfterViewInit, Directive, ElementRef, Input, OnDestroy, inject } from '@angular/core';
import { hayOverlayAbierto } from '../components/overlay-registry';
import { UnsavedChangesService } from '../../core/services/unsaved-changes.service';

const FOCUSABLES = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

let contador = 0;
/** Diálogos abiertos, el último es el de arriba: solo ese reacciona a Escape y atrapa el Tab. */
const pila: object[] = [];

/**
 * Accesibilidad y aviso de "cambios sin guardar" de un modal hecho a mano.
 * Va en el elemento que hace de fondo (el `fixed inset-0 bg-black/…`); su
 * primer hijo es el panel.
 *
 *  - marca el panel como `role="dialog"` `aria-modal` y lo nombra con su primer título;
 *  - al abrir mueve el foco al panel (o a un `[autofocus]` si lo hay);
 *  - atrapa Tab / Shift+Tab dentro del modal;
 *  - Escape cierra: pulsa el botón "Cerrar"/"Cancelar" del panel, o el fondo si
 *    el modal se cierra haciendo clic afuera. Si hay un select o calendario
 *    abierto, Escape cierra ese primero;
 *  - al cerrar devuelve el foco al botón que lo abrió;
 *  - cambios sin guardar: si el usuario escribió o eligió algo, cerrar por el
 *    fondo, la ×, "Cancelar"/"Cerrar" o Escape pregunta antes de descartar, y
 *    salir de la pantalla o cerrar la pestaña también avisa.
 *
 * "Escribió o eligió algo" se detecta por los eventos `input` y `change` que
 * suben desde los campos (los selectores, fechas y horas propios disparan un
 * `change`). Un campo de solo búsqueda no cuenta: `type="search"` o
 * `data-no-dirty`. Los controles que cambian datos sin ser un campo (celdas de
 * calendario, chips, "quitar fila") llevan el atributo `data-dirty`. Si el modal ya maneja su propio aviso (FormularioVigilado),
 * se apaga esto con `[dialogGuard]="false"` para no preguntar dos veces.
 *
 * Los modales que pasan por el servicio de diálogos de Spartan ya hacen lo del
 * foco solos: esta directiva es para los que dibujan su propio fondo.
 */
@Directive({
  selector: '[appDialog]',
  standalone: true,
  host: { '(keydown)': 'alTeclear($event)' },
})
export class DialogDirective implements AfterViewInit, OnDestroy {
  /** `false` = no avisar de cambios sin guardar (el componente ya lo hace por su cuenta). */
  @Input() dialogGuard = true;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly avisos = inject(UnsavedChangesService);
  /** Quien tenía el foco al abrirse (normalmente el botón que lo abrió). */
  private readonly previo = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  private readonly yo = {};
  private sucio = false;
  private preguntando = false;
  private dejarPasar = false;
  private quitarAviso: (() => void) | null = null;
  private escapeDoc = (e: KeyboardEvent) => this.alEscape(e);
  private alTocarCampo = (e: Event) => this.marcarSiEsCampo(e);
  private alCerrarCaptura = (e: MouseEvent) => this.interceptarCierre(e);
  /** Controles que no son <input> (celdas de un calendario, chips, "quitar fila"…) se marcan con `data-dirty`. */
  private alTocarControl = (e: Event) => {
    if ((e.target as HTMLElement | null)?.closest('[data-dirty]')) this.sucio = true;
  };

  ngAfterViewInit(): void {
    pila.push(this.yo);
    document.addEventListener('keydown', this.escapeDoc);
    // Captura: se ve el clic antes de que llegue al botón o al fondo, para poder frenarlo.
    this.host.addEventListener('click', this.alCerrarCaptura, true);
    this.host.addEventListener('input', this.alTocarCampo);
    this.host.addEventListener('change', this.alTocarCampo);
    // Captura: el panel de casi todos los modales frena los clics (`stopPropagation`) y no llegarían al fondo.
    this.host.addEventListener('click', this.alTocarControl, true);
    this.quitarAviso = this.avisos.registrar(() => this.dialogGuard && this.sucio);

    const panel = this.panel();
    if (!panel.getAttribute('role')) panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (!panel.hasAttribute('aria-label') && !panel.hasAttribute('aria-labelledby')) {
      const titulo = panel.querySelector<HTMLElement>('h1, h2, h3');
      if (titulo) {
        if (!titulo.id) titulo.id = `dialogo-titulo-${++contador}`;
        panel.setAttribute('aria-labelledby', titulo.id);
      }
    }
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');

    // Foco: un campo marcado a propósito, o el panel (así no se abre un teclado
    // en el móvil ni se despliega un calendario sin que el usuario lo pida).
    const destino = panel.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? panel;
    destino.focus({ preventScroll: true });
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.escapeDoc);
    this.host.removeEventListener('click', this.alCerrarCaptura, true);
    this.host.removeEventListener('input', this.alTocarCampo);
    this.host.removeEventListener('change', this.alTocarCampo);
    this.host.removeEventListener('click', this.alTocarControl, true);
    this.quitarAviso?.();
    const i = pila.indexOf(this.yo);
    if (i >= 0) pila.splice(i, 1);
    // Si el botón que lo abrió ya no existe (ej. la lista se recargó), no hay a dónde volver.
    if (this.previo?.isConnected) this.previo.focus({ preventScroll: true });
  }

  private panel(): HTMLElement {
    return (this.host.firstElementChild as HTMLElement | null) ?? this.host;
  }

  private esElDeArriba(): boolean {
    return pila[pila.length - 1] === this.yo;
  }

  // ── Cambios sin guardar ────────────────────────────────────────────

  private marcarSiEsCampo(e: Event): void {
    const t = e.target as HTMLElement | null;
    if (!t || t.closest('.ss-panel, [data-no-dirty]')) return;   // la búsqueda dentro de un selector no es un dato
    if (t instanceof HTMLInputElement && t.type === 'search') return;
    this.sucio = true;
  }

  private esBotonDeCierre(b: HTMLElement): boolean {
    return b.getAttribute('aria-label') === 'Cerrar' || /^(cancelar|cerrar)$/i.test((b.textContent ?? '').trim());
  }

  /** Frena el clic que cierra el modal (fondo, ×, Cancelar) si hay cambios, y pregunta primero. */
  private interceptarCierre(e: MouseEvent): void {
    if (this.dejarPasar || !this.dialogGuard || !this.sucio) return;
    const t = e.target as HTMLElement;
    const boton = t.closest('button');
    const esFondo = t === this.host;
    const esCierre = !!boton && this.host.contains(boton) && this.esBotonDeCierre(boton);
    if (!esFondo && !esCierre) return;

    e.stopImmediatePropagation();
    e.preventDefault();
    if (this.preguntando) return;
    this.preguntando = true;
    void this.avisos.confirmarDescartar().then((ok) => {
      this.preguntando = false;
      if (!ok) return;
      this.dejarPasar = true;
      try { (esFondo ? this.host : boton!).click(); } finally { this.dejarPasar = false; }
    });
  }

  // ── Teclado ────────────────────────────────────────────────────────

  alTeclear(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || !this.esElDeArriba()) return;
    const panel = this.panel();
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLES)).filter((el) => el.getClientRects().length > 0); // visibles (offsetParent es null en position:fixed)
    if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
    const primero = items[0], ultimo = items[items.length - 1];
    const activo = document.activeElement;
    if (e.shiftKey && (activo === primero || activo === panel)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && activo === ultimo) { e.preventDefault(); primero.focus(); }
  }

  private alEscape(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || e.defaultPrevented || !this.esElDeArriba()) return;
    // Un select/calendario abierto dentro del modal se cierra primero.
    if (hayOverlayAbierto()) return;
    // Un diálogo de confirmación (servicio de Spartan) encima maneja su propio Escape.
    if (document.querySelector('[role="alertdialog"]')) return;
    const panel = this.panel();
    const botones = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const cierre = botones.find((b) => this.esBotonDeCierre(b));
    // Estos clics pasan por interceptarCierre(): si hay cambios, preguntan antes de cerrar.
    if (cierre) { e.preventDefault(); cierre.click(); return; }
    // Sin botón de cierre: si el modal se cierra con clic en el fondo, se simula ese clic.
    e.preventDefault();
    this.host.click();
  }
}
