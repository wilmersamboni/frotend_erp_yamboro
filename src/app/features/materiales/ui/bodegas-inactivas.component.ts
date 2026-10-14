import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Sitio } from '../data-access/materiales-api.service';

/**
 * Aviso de bodegas inactivas de las pantallas de Materiales (pedido del dueño,
 * 2026-10-06: el recuadro amarillo no le gustó). Son dos piezas para que cada
 * pantalla las ponga donde le toca:
 *  - `<app-bodegas-inactivas-etiqueta>`: pastilla azul junto al título ("1 bodega
 *    inactiva"); al tocarla se abre/cierra el aviso.
 *  - `<app-bodegas-inactivas-aviso>`: el texto con los nombres, debajo del encabezado.
 * El estado abierto/cerrado lo guarda la pantalla (`signal(false)`), así las dos
 * piezas quedan sincronizadas sin un servicio.
 */
@Component({
  selector: 'app-bodegas-inactivas-etiqueta',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (bodegas().length > 0) {
      <button type="button" (click)="alternar.emit()"
        [attr.aria-expanded]="abierto()" aria-controls="aviso-bodegas-inactivas"
        class="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 hover:border-sky-300 hover:bg-sky-100 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
        </svg>
        {{ bodegas().length === 1 ? '1 bodega inactiva' : bodegas().length + ' bodegas inactivas' }}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          class="transition-transform" [class.rotate-180]="abierto()"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    }
  `,
})
export class BodegasInactivasEtiquetaComponent {
  readonly bodegas = input.required<Sitio[]>();
  readonly abierto = input(false);
  readonly alternar = output<void>();
}

@Component({
  selector: 'app-bodegas-inactivas-aviso',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (bodegas().length > 0 && abierto()) {
      <p id="aviso-bodegas-inactivas" class="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
        <strong class="font-semibold text-sky-900">{{ nombres() }}</strong>
        — no se pueden gestionar sus productos, ítems, lotes, solicitudes ni traslados mientras {{ bodegas().length === 1 ? 'esté así' : 'estén así' }}.
      </p>
    }
  `,
})
export class BodegasInactivasAvisoComponent {
  readonly bodegas = input.required<Sitio[]>();
  readonly abierto = input(false);

  protected nombres(): string {
    return this.bodegas().map((s) => s.nombre).join(', ');
  }
}
