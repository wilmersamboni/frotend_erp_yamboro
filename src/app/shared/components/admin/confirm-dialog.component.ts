import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-admin-confirm-dialog',
  standalone: true,
  template: `
    @if (visible) {
      <div class="fixed inset-0 z-[1090] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.5);">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          <div class="px-5 pt-5 pb-2 flex items-start justify-between">
            <h5 class="text-base font-bold text-gray-900">{{ titulo }}</h5>
            <button type="button" (click)="onCancelar()" class="text-gray-400 hover:text-gray-600">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="px-5 py-3">
            <p class="text-sm text-gray-600 leading-relaxed">{{ mensaje }}</p>
          </div>
          <div class="px-5 pb-5 pt-2 flex justify-end gap-2">
            <button type="button" (click)="onCancelar()"
              class="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              {{ textoCancelar }}
            </button>
            <button type="button" (click)="onConfirmar()"
              class="text-sm font-semibold px-4 py-2 rounded-xl text-white transition-opacity hover:opacity-90"
              [style.background]="variante === 'danger' ? '#dc2626' : '#39A900'">
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

  @Output() confirmar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();

  onConfirmar(): void { this.confirmar.emit(); }
  onCancelar(): void  { this.cancelar.emit(); }
}
