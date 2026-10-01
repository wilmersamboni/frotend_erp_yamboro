import { Component } from '@angular/core';
import { injectBrnDialogContext } from '@spartan-ng/brain/dialog';

export interface ConfirmDialogContext {
  message: string;
  header: string;
  acceptLabel: string;
  rejectLabel: string;
  /** Acción destructiva: ícono y botón de aceptar en rojo. */
  danger: boolean;
}

type IconoConfirm = 'papelera' | 'alerta' | 'info';

/**
 * Contenido del diálogo de confirmación global (`ConfirmService`). Se abre con
 * `BrnDialogService` de Spartan (rol `alertdialog`: no se cierra por clic
 * afuera, sí con Esc) y resuelve `true` al aceptar, `false` al cancelar.
 *
 * Aspecto del alert-dialog de Spartan/shadcn: ícono en un cuadro tintado, título
 * y texto centrados, y una barra inferior con los dos botones a partes iguales
 * (cancelar en blanco, acción en tono suave del color de la acción).
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      class="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-200"
    >
      <div class="flex flex-col items-center px-6 pb-6 pt-6 text-center">
        <span [class]="cajaIcono" aria-hidden="true">
          @switch (icono) {
            @case ('papelera') {
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" />
              </svg>
            }
            @case ('alerta') {
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />
              </svg>
            }
            @default {
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
              </svg>
            }
          }
        </span>
        <h2 id="confirm-dialog-title" class="mt-4 text-base font-semibold text-gray-900">{{ ctx.header }}</h2>
        <p id="confirm-dialog-desc" class="mt-2 text-sm leading-relaxed text-gray-500 whitespace-pre-line">{{ ctx.message }}</p>
      </div>
      <div class="flex gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-4">
        <button
          type="button"
          (click)="ctx.close(false)"
          class="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
        >
          {{ ctx.rejectLabel }}
        </button>
        <button type="button" (click)="ctx.close(true)" [class]="ctx.danger ? botonPeligro : botonPrimario">
          {{ ctx.acceptLabel }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  protected readonly ctx = injectBrnDialogContext<ConfirmDialogContext & { close: (r?: unknown) => void }>();

  /** Papelera si la acción es de borrar; alerta para otras acciones peligrosas; info si no es peligrosa. */
  protected get icono(): IconoConfirm {
    if (!this.ctx.danger) return 'info';
    return /elimin|borr|quitar|revoc/i.test(`${this.ctx.acceptLabel} ${this.ctx.header}`) ? 'papelera' : 'alerta';
  }

  protected get cajaIcono(): string {
    return `flex h-12 w-12 items-center justify-center rounded-xl ${
      this.ctx.danger ? 'bg-red-50 text-red-600' : 'bg-[#39A900]/10 text-[#2f8a00]'
    }`;
  }

  private readonly botonBase =
    'inline-flex h-10 flex-1 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';
  protected readonly botonPeligro = `${this.botonBase} bg-red-100 text-red-600 hover:bg-red-200 focus-visible:ring-red-300`;
  protected readonly botonPrimario = `${this.botonBase} bg-[#39A900]/15 text-[#2f8a00] hover:bg-[#39A900]/25 focus-visible:ring-[#39A900]`;
}
