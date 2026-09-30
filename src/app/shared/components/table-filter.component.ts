import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { openOverlay, releaseOverlay } from './overlay-registry';

export interface TableFilterOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-table-filter',
  standalone: true,
  template: `
    <div class="relative flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
      <button type="button" (click)="toggle()" [attr.aria-label]="label + ': ' + selectedLabel"
        class="absolute inset-0 z-0 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#39A900]/30"></button>
      <span class="pointer-events-none relative z-10 text-xs font-semibold text-gray-500 uppercase tracking-wide">{{ label }}</span>
      <div class="relative z-20 pointer-events-none">
        <span class="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <span>{{ selectedLabel }}</span>
          <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200" [class.rotate-180]="open()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
        @if (open()) {
          <div class="fixed inset-0 z-10" (click)="cerrar()"></div>
          <div class="absolute left-0 top-full mt-2 z-20 min-w-44 max-w-64 pointer-events-auto rounded-xl border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100" style="background-color: var(--surface); border-color: var(--border); opacity: 1;">
            <div class="p-1 space-y-0.5 max-h-64 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              @for (option of options; track option.value) {
                <button type="button" (click)="select(option.value)"
                  class="w-full px-3 py-1.5 text-sm text-left rounded-lg transition-colors font-medium"
                  [class.bg-green-50]="value === option.value"
                  [class.text-green-700]="value === option.value"
                  [class.text-gray-600]="value !== option.value"
                  [class.hover:bg-gray-50]="value !== option.value">
                  {{ option.label }}
                </button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class TableFilterComponent {
  @Input({ required: true }) options: TableFilterOption[] = [];
  @Input() value = '';
  @Input() label = 'Filtro';
  @Output() valueChange = new EventEmitter<string>();

  open = signal(false);
  private readonly closeRef = () => this.cerrar();

  get selectedLabel(): string {
    return this.options.find((option) => option.value === this.value)?.label ?? this.value;
  }

  select(value: string): void {
    this.valueChange.emit(value);
    this.cerrar();
  }

  toggle(): void {
    if (this.open()) this.cerrar();
    else {
      openOverlay(this.closeRef);
      this.open.set(true);
    }
  }

  cerrar(): void {
    this.open.set(false);
    releaseOverlay(this.closeRef);
  }
}
