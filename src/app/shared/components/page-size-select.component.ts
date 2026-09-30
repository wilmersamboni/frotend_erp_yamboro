import { Component, input, output, signal } from '@angular/core';
import { openOverlay, releaseOverlay } from './overlay-registry';

/**
 * Selector de "filas por página" con menú propio — mismo diseño que el de
 * Materiales (asignaciones/solicitudes/devoluciones). Reemplaza al <select>
 * nativo, cuya lista desplegable la pinta el navegador y en modo oscuro
 * quedaba con fondo blanco y números casi invisibles.
 */
@Component({
  selector: 'app-page-size-select',
  standalone: true,
  template: `
    <div class="relative flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
      <button type="button" (click)="toggle()" [attr.aria-label]="label() + ': ' + value()"
        class="absolute inset-0 z-0 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#39A900]/30"></button>
      <span class="pointer-events-none relative z-10 text-xs font-semibold text-gray-500 uppercase tracking-wide">{{ label() }}</span>
      <div class="relative z-20 pointer-events-none">
        <span class="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <span>{{ value() }}</span>
          <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200" [class.rotate-180]="abierto()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </span>

        @if (abierto()) {
          <div class="fixed inset-0 z-10" (click)="cerrar()"></div>

          <div class="absolute right-0 top-full mt-2 z-20 w-20 pointer-events-auto rounded-xl border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100" style="background-color: var(--surface); border-color: var(--border); opacity: 1;">
            <div class="p-1 space-y-0.5">
              @for (size of sizes(); track size) {
                <button
                  type="button"
                  (click)="seleccionar(size)"
                  class="w-full px-3 py-1.5 text-sm text-center rounded-lg transition-colors font-medium"
                  [class.bg-green-50]="value() === size"
                  [class.text-green-700]="value() === size"
                  [class.text-gray-600]="value() !== size"
                  [class.hover:bg-gray-50]="value() !== size">
                  {{ size }}
                </button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class PageSizeSelectComponent {
  value = input.required<number>();
  sizes = input<number[]>([10, 20, 50, 100]);
  label = input('Filas');
  valueChange = output<number>();

  abierto = signal(false);
  private readonly closeRef = () => this.cerrar();

  seleccionar(size: number) {
    this.cerrar();
    if (size !== this.value()) this.valueChange.emit(size);
  }

  toggle(): void {
    if (this.abierto()) this.cerrar();
    else {
      openOverlay(this.closeRef);
      this.abierto.set(true);
    }
  }

  cerrar(): void {
    this.abierto.set(false);
    releaseOverlay(this.closeRef);
  }
}
