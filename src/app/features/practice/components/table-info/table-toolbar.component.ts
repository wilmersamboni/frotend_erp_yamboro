// ─────────────────────────────────────────────────────────────────────────────
// table-toolbar.component.ts  — Búsqueda · Columnas visibles · Filas por página
// ─────────────────────────────────────────────────────────────────────────────
import {
  Component, input, output, signal, HostListener,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { COLUMNS, Column } from './table-info.types';

@Component({
  selector: 'app-table-toolbar',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="px-6 pb-4 flex flex-col gap-4">

      <!-- Fila principal: búsqueda + botón columnas -->
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">

        <!-- Búsqueda -->
        <div class="relative w-full sm:max-w-md">
          <input
            type="text"
            [ngModel]="filter()"
            (ngModelChange)="filterChange.emit($event)"
            placeholder="🔍︎ Buscar por nombre o identificación..."
            class="w-full pl-3 pr-8 py-2 border-2 border-gray-200 rounded-xl text-sm hover:border-[#39A900]/50 focus:outline-none focus:border-[#39A900] transition-colors"/>
          @if (filter()) {
            <button (click)="filterChange.emit('')"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
              ×
            </button>
          }
        </div>

        <!-- Botón Columnas -->
        <div class="relative">
          <button (click)="$event.stopPropagation(); toggleColMenu()"
            class="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-[#39A900]/50 transition-colors bg-white">
            Columnas
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                d="m19.92 8.95-6.52 6.52c-.77.77-2.03.77-2.8 0L4.08 8.95"/>
            </svg>
          </button>

          @if (showColMenu) {
            <div class="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[200px]"
              (click)="$event.stopPropagation()">
              <p class="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-2">
                Columnas visibles
              </p>
              @for (col of allColumns; track col.uid) {
                @if (col.uid !== 'actions') {
                  <label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox"
                      [checked]="visibleCols().has(col.uid)"
                      (change)="toggleCol.emit(col.uid)"
                      class="accent-[#39A900] w-3.5 h-3.5"/>
                    {{ col.name }}
                  </label>
                }
              }
            </div>
          }
        </div>
      </div>

      <!-- Sub-toolbar: total + filas por página -->
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-400">Total {{ total() }} aprendices</span>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">Filas por página:</span>
          <select
            [ngModel]="rowsPerPage()"
            (ngModelChange)="rowsPerPageChange.emit(+$event)"
            class="border border-gray-200 rounded-lg text-xs text-gray-600 py-1.5 px-2 focus:outline-none focus:border-[#39A900] hover:border-[#39A900]/50">
            <option [value]="5">5</option>
            <option [value]="10">10</option>
            <option [value]="15">15</option>
            <option [value]="20">20</option>
          </select>
        </div>
      </div>

    </div>
  `,
})
export class TableToolbarComponent {
  // ── Inputs ─────────────────────────────────────────────────────────────────
  filter       = input.required<string>();
  total        = input.required<number>();
  rowsPerPage  = input.required<number>();
  visibleCols  = input.required<Set<string>>();

  // ── Outputs ────────────────────────────────────────────────────────────────
  filterChange      = output<string>();
  rowsPerPageChange = output<number>();
  toggleCol         = output<string>();

  // ── Internos ───────────────────────────────────────────────────────────────
  allColumns  = COLUMNS;
  showColMenu = false;

  toggleColMenu(): void { this.showColMenu = !this.showColMenu; }

  @HostListener('document:click')
  closeMenu(): void { this.showColMenu = false; }
}
