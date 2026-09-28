import { Component, input, output, signal } from '@angular/core';

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
    <div class="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
      <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">{{ label() }}</span>
      <div class="relative">
        <button
          type="button"
          (click)="abierto.update(v => !v)"
          class="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-transparent focus:outline-none cursor-pointer">
          <span>{{ value() }}</span>
          <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200" [class.rotate-180]="abierto()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        @if (abierto()) {
          <div class="fixed inset-0 z-10" (click)="abierto.set(false)"></div>

          <div class="absolute right-0 top-full mt-2 z-20 w-20 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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

  seleccionar(size: number) {
    this.abierto.set(false);
    if (size !== this.value()) this.valueChange.emit(size);
  }
}
