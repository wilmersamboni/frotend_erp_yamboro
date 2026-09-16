import { Component, EventEmitter, Input, Output, signal } from '@angular/core';

export interface TableFilterOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-table-filter',
  standalone: true,
  template: `
    <div class="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
      <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">{{ label }}</span>
      <div class="relative">
        <button type="button" (click)="open.update((value) => !value)"
          class="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-transparent focus:outline-none cursor-pointer">
          <span>{{ selectedLabel }}</span>
          <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200" [class.rotate-180]="open()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        @if (open()) {
          <div class="fixed inset-0 z-10" (click)="open.set(false)"></div>
          <div class="absolute left-0 top-full mt-2 z-20 min-w-44 max-w-64 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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

  get selectedLabel(): string {
    return this.options.find((option) => option.value === this.value)?.label ?? this.value;
  }

  select(value: string): void {
    this.valueChange.emit(value);
    this.open.set(false);
  }
}
