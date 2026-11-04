import { Component, input, output } from '@angular/core';
import { CargasSecundarias } from './cargas-secundarias';

/**
 * Aviso junto a un campo de formulario cuya lista no se pudo cargar (ver
 * `CargasSecundarias`): dice qué pasó y deja reintentar, para que un selector
 * vacío no se lea como «no hay opciones». Sin fallo no dibuja nada.
 */
@Component({
  selector: 'app-carga-fallida',
  standalone: true,
  host: { style: 'display: contents' },
  template: `
    @if (cargas().falloAlguna(nombres())) {
      <p class="mt-1 text-xs text-red-600" role="alert">
        No se pudo cargar: {{ etiqueta() }}.
        <button type="button" data-dirty (click)="reintentar.emit()" class="font-semibold underline">Reintentar</button>
      </p>
    }
  `,
})
export class CargaFallidaComponent {
  cargas = input.required<CargasSecundarias>();
  /** Nombres con los que se registró la carga en `CargasSecundarias`. */
  nombres = input.required<string[]>();
  /** Lo que se le dice al usuario («las opciones», «la lista de personas»…). */
  etiqueta = input('las opciones');
  reintentar = output<void>();
}
