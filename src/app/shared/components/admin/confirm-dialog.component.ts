import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { DialogDirective } from '../../directives/dialog.directive';

/**
 * Confirmación del panel de plataforma. Mismo aspecto que el diálogo global
 * (`ConfirmDialogComponent`): ícono en un cuadro tintado, título y texto
 * centrados y barra inferior con los dos botones a partes iguales. Se mantiene
 * como componente con `@Input`/`@Output` porque las pantallas lo declaran en su
 * plantilla con `[visible]`, no lo abren por servicio.
 */
@Component({
  selector: 'app-admin-confirm-dialog',
  standalone: true,
  imports: [DialogDirective],
  template: `
    @if (visible) {
      <div appDialog [dialogGuard]="false"
           class="fixed inset-0 z-[1090] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]">
        <div class="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-200">
          <div class="flex flex-col items-center px-6 pb-6 pt-6 text-center">
            <span aria-hidden="true" class="flex h-12 w-12 items-center justify-center rounded-xl"
                  [style.background]="variante === 'danger' ? 'var(--err-bg)' : 'var(--accent-soft)'"
                  [style.color]="variante === 'danger' ? 'var(--err-text)' : 'var(--accent-text)'">
              @if (variante === 'danger') {
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />
                </svg>
              } @else {
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                </svg>
              }
            </span>
            <h2 class="mt-4 text-base font-semibold text-gray-900">{{ titulo }}</h2>
            <p class="mt-2 text-sm leading-relaxed text-gray-500 whitespace-pre-line">{{ mensaje }}</p>
            @if (textoAEscribir) {
              <div class="mt-4 w-full text-left">
                <label for="confirm-escribir" class="block text-xs font-semibold text-gray-500 mb-1.5">
                  Para confirmar, escribe <span class="font-bold text-gray-800">{{ textoAEscribir }}</span>
                </label>
                <input id="confirm-escribir" type="text" autocomplete="off" spellcheck="false"
                  [value]="escrito()" (input)="escrito.set($any($event.target).value)"
                  (keydown.enter)="coincide() && onConfirmar()"
                  class="w-full text-sm rounded-xl border border-gray-200 outline-none px-3.5 py-2.5 transition-colors"
                  style="background:var(--surface2);color:var(--text);" />
              </div>
            }
          </div>
          <div class="flex gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-4">
            <button type="button" (click)="onCancelar()"
              class="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50">
              {{ textoCancelar }}
            </button>
            <button type="button" (click)="onConfirmar()" [disabled]="!coincide()"
              class="inline-flex h-10 flex-1 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              [style.background]="variante === 'danger' ? 'var(--err-bg)' : 'var(--accent-soft)'"
              [style.color]="variante === 'danger' ? 'var(--err-text)' : 'var(--accent-text)'">
              {{ textoConfirmar }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminConfirmDialogComponent {
  @Input() visible = false;
  @Input() titulo = 'Confirmar acción';
  @Input() mensaje = '¿Estás seguro de que deseas continuar?';
  @Input() textoConfirmar = 'Confirmar';
  @Input() textoCancelar = 'Cancelar';
  @Input() variante: 'danger' | 'primary' = 'danger';
  /** Si se indica, el botón de confirmar queda bloqueado hasta que la persona escriba exactamente este texto. */
  @Input() textoAEscribir = '';

  @Output() confirmar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();

  readonly escrito = signal('');

  coincide(): boolean {
    return !this.textoAEscribir || this.escrito().trim().toLowerCase() === this.textoAEscribir.trim().toLowerCase();
  }

  onConfirmar(): void {
    if (!this.coincide()) return;
    this.escrito.set('');
    this.confirmar.emit();
  }

  onCancelar(): void {
    this.escrito.set('');
    this.cancelar.emit();
  }
}
