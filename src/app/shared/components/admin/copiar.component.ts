import { Component, input, signal } from '@angular/core';
import { copiarTexto } from '../../utils/copiar-texto';

/** Botón chico para copiar un texto (slug, dominio…). Muestra un visto durante 2 segundos. */
@Component({
  selector: 'app-admin-copiar',
  standalone: true,
  template: `
    <button type="button" (click)="copiar($event)" [attr.aria-label]="'Copiar ' + (etiqueta() || valor())" [title]="copiado() ? 'Copiado' : 'Copiar'"
      class="inline-flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors align-middle">
      @if (copiado()) {
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ok-text)" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      } @else {
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="11" height="11" rx="2"/><path stroke-linecap="round" d="M5 15V6a2 2 0 012-2h9"/>
        </svg>
      }
    </button>
  `,
})
export class AdminCopiarComponent {
  valor = input.required<string>();
  etiqueta = input('');
  readonly copiado = signal(false);

  async copiar(e: Event): Promise<void> {
    e.stopPropagation();
    if (await copiarTexto(this.valor())) {
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    }
  }
}
