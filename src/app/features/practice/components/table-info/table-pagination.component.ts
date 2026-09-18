// ─────────────────────────────────────────────────────────────────────────────
// table-pagination.component.ts  — Controles de paginación
// ─────────────────────────────────────────────────────────────────────────────
import { Component, input, output, computed } from '@angular/core';

@Component({
  selector: 'app-table-pagination',
  standalone: true,
  template: `
    @if (pages() > 0) {
      <div class="py-3 px-6 flex justify-center gap-1 border-t border-gray-50">

        <button (click)="page() > 1 && pageChange.emit(page() - 1)"
          [disabled]="page() === 1"
          class="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-[#39A900] disabled:opacity-40 transition-colors">
          ‹
        </button>

        @for (p of pageRange(); track p) {
          <button (click)="pageChange.emit(p)"
            class="px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium"
            [class.bg-\[#39A900\]]="p === page()"
            [class.text-white]="p === page()"
            [class.border-\[#39A900\]]="p === page()"
            [class.border-gray-200]="p !== page()"
            [class.text-gray-500]="p !== page()">
            {{ p }}
          </button>
        }

        <button (click)="page() < pages() && pageChange.emit(page() + 1)"
          [disabled]="page() === pages()"
          class="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-[#39A900] disabled:opacity-40 transition-colors">
          ›
        </button>

      </div>
    }
  `,
})
export class TablePaginationComponent {
  // ── Inputs ─────────────────────────────────────────────────────────────────
  page  = input.required<number>();
  pages = input.required<number>();

  // ── Outputs ────────────────────────────────────────────────────────────────
  pageChange = output<number>();

  // ── Computed ───────────────────────────────────────────────────────────────
  pageRange = computed(() => {
    const total = this.pages();
    const page  = this.page();
    const range: number[] = [];
    const start = Math.max(1, page - 2);
    const end   = Math.min(total, page + 2);
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  });
}
