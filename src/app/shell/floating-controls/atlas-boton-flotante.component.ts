import { AtlasMascotaComponent } from '../../features/assistant/mascota/atlas-mascota.component';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

const CLAVE_POSICION = 'atlas-boton-posicion';

/** Debajo de la barra superior del layout. */
export const MARGEN_SUPERIOR = 96;
/** Por encima del botón "Escanear" (abajo a la derecha en Materiales) y del borde inferior. */
export const MARGEN_INFERIOR = 160;
/** Posición inicial: a un 75 % de la altura de la ventana. */
const FRACCION_INICIAL = 0.75;
/** Menos que esto es un toque; más, un arrastre. */
const UMBRAL_ARRASTRE = 5;
const PASO_TECLADO = 32;

/** Mantiene la pestaña entre la barra superior y el botón "Escanear". */
export function limitarTop(top: number, altoVentana: number): number {
  const maximo = Math.max(MARGEN_SUPERIOR, altoVentana - MARGEN_INFERIOR);
  return Math.min(maximo, Math.max(MARGEN_SUPERIOR, Math.round(top)));
}

/**
 * Botón flotante para abrir el chat con Atlas, pensado para NO estorbar:
 *
 * - **Descansa dentro del margen vacío de la página.** El contenido está en una tarjeta con 24 px de
 *   margen y 24 px de relleno a cada lado (16 + 16 en pantallas chicas): en reposo solo asoma ~26 px de
 *   la pestaña pegada al borde derecho, así que no hay ningún dato debajo. Se despliega completa solo
 *   mientras el cursor está encima (o con el foco del teclado) y vuelve sola al salir.
 * - **No bloquea clics**: el contenedor tiene `pointer-events: none`; solo el botón (y su zona táctil,
 *   que también cae sobre margen/relleno vacío) recibe el puntero.
 * - **Se arrastra en vertical** para ponerlo donde menos moleste; recuerda su lugar. La cabeza es la mascota 3D de Atlas (con su respaldo CSS). Con el teclado:
 *   flechas arriba/abajo. Se puede **ocultar hasta recargar la página**; el chat sigue disponible desde "Contáctanos".
 * - Va por debajo de los diálogos y menús (z-index 40, como el botón "Escanear") y no sale al imprimir.
 */
@Component({
  selector: 'app-atlas-boton-flotante',
  standalone: true,
  imports: [AtlasMascotaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './atlas-boton-flotante.component.html',
  styleUrls: ['./atlas-boton-flotante.component.css'],
  host: { '(window:resize)': 'alRedimensionar()' },
})
export class AtlasBotonFlotanteComponent {
  /** Lo decide quien lo usa (p. ej. no mostrarlo sin sesión ni con el chat abierto). */
  readonly visible = input(true);
  /** Atlas contestó mientras el chat estaba cerrado. */
  readonly pendiente = input(false);
  readonly abrir = output<void>();
  /** El puntero o el foco se acercan: sirve para precargar el 3D antes del clic. */
  readonly intencion = output<void>();

  protected readonly top = signal(this.posicionInicial());
  protected readonly arrastrando = signal(false);
  /** Solo hasta recargar la página: antes se recordaba toda la sesión y no había cómo recuperarlo. */
  private readonly oculto = signal(false);
  protected readonly mostrar = computed(() => this.visible() && !this.oculto());

  private idPuntero = -1;
  private inicioY = 0;
  private topInicial = 0;
  private huboArrastre = false;

  protected alPresionar(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.idPuntero = e.pointerId;
    this.inicioY = e.clientY;
    this.topInicial = this.top();
    this.huboArrastre = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  protected alMover(e: PointerEvent): void {
    if (e.pointerId !== this.idPuntero) return;
    const dy = e.clientY - this.inicioY;
    if (!this.huboArrastre && Math.abs(dy) < UMBRAL_ARRASTRE) return;
    this.huboArrastre = true;
    this.arrastrando.set(true);
    this.top.set(limitarTop(this.topInicial + dy, window.innerHeight));
  }

  protected alSoltar(e: PointerEvent): void {
    if (e.pointerId !== this.idPuntero) return;
    this.idPuntero = -1;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (this.huboArrastre) {
      this.finalizarArrastre();
      return;
    }
    this.abrir.emit();
  }

  protected alCancelar(): void {
    this.idPuntero = -1;
    if (this.huboArrastre) this.finalizarArrastre();
  }

  /** Teclado (Enter/Espacio llegan como clic sin posición: detail 0). El clic de ratón/tacto ya lo atiende alSoltar. */
  protected alClic(e: MouseEvent): void {
    if (e.detail === 0) this.abrir.emit();
  }

  protected alTeclear(e: KeyboardEvent): void {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    this.top.set(limitarTop(this.top() + (e.key === 'ArrowUp' ? -PASO_TECLADO : PASO_TECLADO), window.innerHeight));
    this.guardarPosicion();
  }

  protected alRedimensionar(): void {
    this.top.update((t) => limitarTop(t, window.innerHeight));
  }

  protected ocultar(): void {
    this.oculto.set(true);
  }

  private finalizarArrastre(): void {
    this.huboArrastre = false;
    this.arrastrando.set(false);
    this.guardarPosicion();
  }

  private guardarPosicion(): void {
    try {
      localStorage.setItem(CLAVE_POSICION, String(this.top() / window.innerHeight));
    } catch {
      /* preferencia opcional */
    }
  }

  private posicionInicial(): number {
    let fraccion = FRACCION_INICIAL;
    try {
      const guardada = parseFloat(localStorage.getItem(CLAVE_POSICION) ?? '');
      if (guardada > 0 && guardada < 1) fraccion = guardada;
    } catch {
      /* sin almacenamiento: posición por defecto */
    }
    return limitarTop(fraccion * window.innerHeight, window.innerHeight);
  }

}
