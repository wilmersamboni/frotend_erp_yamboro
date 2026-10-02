import { Component, input, output } from '@angular/core';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { CargasSecundarias } from '../data-access/cargas-secundarias';

/**
 * Aviso en la página cuando alguna carga secundaria falló (ver
 * `CargasSecundarias`): dice qué no se pudo cargar y deja reintentar, en vez
 * de que el usuario vea un selector o una columna vacíos sin explicación.
 */
@Component({
  selector: 'app-aviso-cargas',
  standalone: true,
  imports: [AlertComponent],
  // Sin caja propia: cuando no hay nada que avisar no ocupa lugar ni suma
  // separación en contenedores con `space-y-*`.
  host: { style: 'display: contents' },
  template: `
    @if (cargas().fallidas().length > 0) {
      <app-alert class="mb-4" variante="advertencia" titulo="Parte de la información no se pudo cargar">
        No se pudo cargar: <strong>{{ cargas().fallidas().join(', ') }}</strong>.
        Lo que dependa de eso puede verse vacío o incompleto.
        <button type="button" (click)="reintentar.emit()" class="ml-1 font-semibold underline">Reintentar</button>
      </app-alert>
    }
  `,
})
export class AvisoCargasComponent {
  cargas = input.required<CargasSecundarias>();
  reintentar = output<void>();
}
