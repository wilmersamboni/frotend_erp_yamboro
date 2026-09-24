import { Component, input } from '@angular/core';

/**
 * Estado vacío compartido para tablas y listas: ícono, título y una línea de
 * ayuda opcional, con espacio (`<ng-content />`) para una acción — p. ej. un
 * botón "Crear la primera solicitud". Reemplaza los `<p>` de texto plano
 * repetidos en cada pantalla para que "no hay datos" se vea igual en todo el
 * sistema.
 *
 * `variante="busqueda"` cambia el ícono y la ayuda por defecto para el caso
 * "hay datos pero los filtros no devuelven nada".
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center text-center py-12 px-4 empty-state-enter" role="status">
      <span class="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mb-4">
        @if (variante() === 'busqueda') {
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
        } @else {
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-4.5a1 1 0 00-.9.55l-.7 1.4a1 1 0 01-.9.55h-3a1 1 0 01-.9-.55l-.7-1.4a1 1 0 00-.9-.55H4" />
          </svg>
        }
      </span>
      <p class="text-sm font-medium text-gray-600">{{ titulo() }}</p>
      @if (ayuda()) {
        <p class="text-xs text-gray-400 mt-1 max-w-xs">{{ ayuda() }}</p>
      } @else if (variante() === 'busqueda') {
        <p class="text-xs text-gray-400 mt-1 max-w-xs">Prueba con otros filtros o limpia la búsqueda.</p>
      }
      <div class="mt-4 empty-state-actions"><ng-content /></div>
    </div>
  `,
  styles: [`.empty-state-actions:empty { display: none; }`],
})
export class EmptyStateComponent {
  titulo = input.required<string>();
  ayuda = input<string>('');
  variante = input<'vacio' | 'busqueda'>('vacio');
}
