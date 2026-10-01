import { Component, input } from '@angular/core';

export type AlertVariante = 'default' | 'destructivo' | 'advertencia' | 'exito' | 'info';

/**
 * Alerta en línea (dentro de la página), al estilo del componente Alert de
 * Spartan/shadcn: cuadro con borde, ícono, título y descripción.
 *
 *   <app-alert variante="advertencia" titulo="Bodega inactiva">
 *     No se pueden gestionar sus productos mientras esté así.
 *   </app-alert>
 *
 * El contenido proyectado es la descripción. No es un aviso flotante: para eso
 * está `ToastService`.
 */
@Component({
  selector: 'app-alert',
  standalone: true,
  host: { class: 'block', role: 'alert' },
  template: `
    <div [class]="clasesCaja()">
      <span class="mt-0.5 shrink-0" aria-hidden="true">
        @switch (variante()) {
          @case ('destructivo') {
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
            </svg>
          }
          @case ('advertencia') {
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />
            </svg>
          }
          @case ('exito') {
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
            </svg>
          }
          @default {
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
          }
        }
      </span>
      <div class="min-w-0 flex-1">
        @if (titulo()) {
          <p class="font-medium leading-snug">{{ titulo() }}</p>
        }
        <div [class]="titulo() ? 'mt-0.5 text-sm opacity-80' : 'text-sm'"><ng-content /></div>
      </div>
    </div>
  `,
})
export class AlertComponent {
  variante = input<AlertVariante>('default');
  titulo = input<string>('');

  protected clasesCaja(): string {
    const base = 'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm';
    switch (this.variante()) {
      case 'destructivo':
        return `${base} border-gray-200 bg-white text-red-600`;
      case 'advertencia':
        return `${base} border-amber-200 bg-amber-50 text-amber-900`;
      case 'exito':
        return `${base} border-emerald-200 bg-emerald-50 text-emerald-800`;
      case 'info':
        return `${base} border-sky-200 bg-sky-50 text-sky-800`;
      default:
        return `${base} border-gray-200 bg-white text-gray-900`;
    }
  }
}
