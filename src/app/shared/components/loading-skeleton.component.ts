import { Component, Input } from '@angular/core';

export type LoadingSkeletonVariant = 'table' | 'cards' | 'form' | 'detail';

/**
 * Placeholder reutilizable que conserva la estructura de la vista mientras
 * llega la información. Usar un skeleton de la misma forma que el contenido
 * evita los saltos de layout y se percibe mejor que un spinner aislado.
 */
@Component({
  selector: 'app-loading-skeleton',
  standalone: true,
  template: `
    <section class="animate-pulse" role="status" [attr.aria-label]="label">
      @switch (variant) {
        @case ('table') {
          <div class="border border-gray-100 rounded-xl overflow-hidden bg-white">
            @if (showToolbar) {
              <div class="h-14 px-4 flex items-center gap-3 border-b border-gray-100 bg-gray-50/70">
                <span class="h-9 w-56 max-w-[48%] rounded-xl bg-gray-200"></span>
                <span class="ml-auto h-9 w-24 rounded-xl bg-gray-200"></span>
              </div>
            }
            <div class="overflow-hidden">
              <div class="grid gap-4 px-4 py-3 bg-gray-50/80 border-b border-gray-100" [style.grid-template-columns]="gridColumns">
                @for (column of columnIndexes; track $index) { <span class="h-3 rounded bg-gray-200"></span> }
              </div>
              @for (row of rowIndexes; track $index) {
                <div class="grid gap-4 px-4 py-4 border-b border-gray-50 last:border-0" [style.grid-template-columns]="gridColumns">
                  @for (column of columnIndexes; track $index) {
                    <span class="h-4 rounded bg-gray-100" [class.w-4/5]="$index % 3 !== 2" [class.w-3/5]="$index % 3 === 2"></span>
                  }
                </div>
              }
            </div>
          </div>
        }
        @case ('cards') {
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            @for (card of cardIndexes; track $index) {
              <div class="h-36 p-5 rounded-2xl border border-gray-100 bg-white">
                <span class="block w-10 h-10 rounded-xl bg-gray-100 mb-5"></span>
                <span class="block w-3/5 h-4 rounded bg-gray-100 mb-3"></span>
                <span class="block w-2/5 h-6 rounded bg-gray-200"></span>
              </div>
            }
          </div>
        }
        @case ('form') {
          <div class="space-y-5 p-6 rounded-2xl border border-gray-100 bg-white">
            @for (field of rowIndexes; track $index) {
              <div><span class="block h-3 w-24 rounded bg-gray-200 mb-2"></span><span class="block h-11 w-full rounded-xl bg-gray-100"></span></div>
            }
            <span class="block h-11 w-36 rounded-xl bg-gray-200"></span>
          </div>
        }
        @default {
          <div class="space-y-5 p-6 rounded-2xl border border-gray-100 bg-white">
            <div class="flex items-center gap-4"><span class="w-14 h-14 rounded-2xl bg-gray-100"></span><div class="flex-1 space-y-2"><span class="block h-5 w-2/5 rounded bg-gray-200"></span><span class="block h-3 w-3/5 rounded bg-gray-100"></span></div></div>
            @for (line of rowIndexes; track $index) { <span class="block h-4 rounded bg-gray-100" [class.w-full]="$index % 2 === 0" [class.w-4/5]="$index % 2 !== 0"></span> }
          </div>
        }
      }
      <span class="sr-only">{{ label }}</span>
    </section>
  `,
})
export class LoadingSkeletonComponent {
  @Input() variant: LoadingSkeletonVariant = 'detail';
  @Input() rows = 5;
  @Input() columns = 5;
  @Input() showToolbar = true;
  @Input() label = 'Cargando contenido';

  get rowIndexes(): number[] { return Array.from({ length: Math.max(1, this.rows) }); }
  get columnIndexes(): number[] { return Array.from({ length: Math.max(1, this.columns) }); }
  get cardIndexes(): number[] { return Array.from({ length: 4 }); }
  get gridColumns(): string { return `repeat(${Math.max(1, this.columns)}, minmax(0, 1fr))`; }
}
