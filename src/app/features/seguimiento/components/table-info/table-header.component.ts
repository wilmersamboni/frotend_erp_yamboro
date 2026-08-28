// ─────────────────────────────────────────────────────────────────────────────
// table-header.component.ts  — <thead> con filtros de Área y Estado
// ─────────────────────────────────────────────────────────────────────────────
import {
  Component, input, output, HostListener,
} from '@angular/core';
import { Column, StatusOption, STATUS_OPTIONS, statusDotColor } from './table-info.types';

@Component({
  selector: 'app-table-header',
  standalone: true,
  host: {
    style: 'display: contents'
  },
  template: `
    <thead>
      <tr>
        @for (col of columns(); track col.uid) {
          <th class="bg-[#F8F9FA] text-gray-500 text-xs font-semibold uppercase tracking-wider border-b border-gray-100 py-3 px-4 text-left whitespace-nowrap"
            [class.cursor-pointer]="col.sortable"
            (click)="col.sortable && sortChange.emit(col.uid)">

            <!-- ── Filtro Área ── -->
            @if (col.uid === 'area') {
              <div class="relative">
                <button (click)="$event.stopPropagation(); toggleAreaMenu()"
                  class="flex items-center gap-1.5 p-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all"
                  [class.bg-green-50]="selectedAreas().length > 0"
                  [class.text-green-700]="selectedAreas().length > 0"
                  [class.text-gray-500]="selectedAreas().length === 0">
                  <svg width="12" height="12" viewBox="0 0 24 24"
                    [attr.fill]="selectedAreas().length > 0 ? '#39A900' : 'none'"
                    [attr.stroke]="selectedAreas().length > 0 ? '#39A900' : 'currentColor'" stroke-width="2">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                  </svg>
                  Área
                  @if (selectedAreas().length > 0) {
                    <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1
                                  bg-[#39A900] text-white text-[10px] font-bold rounded-full">
                      {{ selectedAreas().length }}
                    </span>
                  }
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                    [class.rotate-180]="showAreaMenu">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                @if (showAreaMenu) {
                  <div class="absolute left-0 top-8 z-[9999] min-w-[180px] bg-white border border-gray-200 rounded-xl shadow-lg p-3"
                    (click)="$event.stopPropagation()">
                    <p class="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-2">
                      Filtrar por área
                    </p>
                    <div class="flex flex-col gap-1">
                      @for (area of areas(); track area) {
                        <label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                          <input type="checkbox"
                            [checked]="selectedAreas().includes(area)"
                            (change)="toggleArea.emit(area)"
                            class="accent-[#39A900] w-3.5 h-3.5"/>
                          {{ area }}
                        </label>
                      }
                    </div>
                    @if (selectedAreas().length > 0) {
                      <div class="border-t border-gray-100 mt-2 pt-2">
                        <button (click)="clearAreas.emit()"
                          class="w-full text-xs text-red-500 hover:text-red-600 py-1">
                          Limpiar filtro
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>

            <!-- ── Filtro Estado ── -->
            } @else if (col.uid === 'estado') {
              <div class="relative">
                <button (click)="$event.stopPropagation(); toggleStatusMenu()"
                  class="flex items-center gap-1.5 p-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all"
                  [class.bg-green-50]="selectedStatuses().length > 0"
                  [class.text-green-700]="selectedStatuses().length > 0"
                  [class.text-gray-500]="selectedStatuses().length === 0">
                  <svg width="12" height="12" viewBox="0 0 24 24"
                    [attr.fill]="selectedStatuses().length > 0 ? '#39A900' : 'none'"
                    [attr.stroke]="selectedStatuses().length > 0 ? '#39A900' : 'currentColor'" stroke-width="2">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                  </svg>
                  Estado
                  @if (selectedStatuses().length > 0) {
                    <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1
                                  bg-[#39A900] text-white text-[10px] font-bold rounded-full">
                      {{ selectedStatuses().length }}
                    </span>
                  }
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                    [class.rotate-180]="showStatusMenu">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                @if (showStatusMenu) {
                  <div class="absolute left-0 top-8 z-[9999] min-w-[180px] bg-white border border-gray-200 rounded-xl shadow-lg p-3"
                    (click)="$event.stopPropagation()">
                    <p class="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-2">
                      Filtrar por estado
                    </p>
                    <div class="flex flex-col gap-1">
                      @for (s of statusOptions; track s.uid) {
                        <label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                          <input type="checkbox"
                            [checked]="selectedStatuses().includes(s.uid)"
                            (change)="toggleStatus.emit(s.uid)"
                            class="accent-[#39A900] w-3.5 h-3.5"/>
                          <span class="w-2 h-2 rounded-full flex-shrink-0"
                            [style.background-color]="dotColor(s.uid)"></span>
                          {{ s.name }}
                        </label>
                      }
                    </div>
                    @if (selectedStatuses().length > 0) {
                      <div class="border-t border-gray-100 mt-2 pt-2">
                        <button (click)="clearStatuses.emit()"
                          class="w-full text-xs text-red-500 hover:text-red-600 py-1">
                          Limpiar filtro
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>

            <!-- ── Columna normal (con indicador de ordenamiento) ── -->
            } @else {
              <span class="flex items-center gap-1">
                {{ col.name }}
                @if (col.sortable && sortCol() === col.uid) {
                  <span class="text-[#39A900]">{{ sortDir() === 'asc' ? '↑' : '↓' }}</span>
                }
              </span>
            }

          </th>
        }
      </tr>
    </thead>
  `,
})
export class TableHeaderComponent {
  // ── Inputs ─────────────────────────────────────────────────────────────────
  columns         = input.required<Column[]>();
  areas           = input.required<string[]>();
  selectedAreas   = input.required<string[]>();
  selectedStatuses = input.required<string[]>();
  sortCol         = input.required<string>();
  sortDir         = input<'asc' | 'desc'>('asc');

  // ── Outputs ────────────────────────────────────────────────────────────────
  sortChange    = output<string>();
  toggleArea    = output<string>();
  clearAreas    = output<void>();
  toggleStatus  = output<string>();
  clearStatuses = output<void>();

  // ── Internos ───────────────────────────────────────────────────────────────
  statusOptions = STATUS_OPTIONS;
  showAreaMenu   = false;
  showStatusMenu = false;

  dotColor = statusDotColor;

  toggleAreaMenu():   void { this.showAreaMenu   = !this.showAreaMenu;   this.showStatusMenu = false; }
  toggleStatusMenu(): void { this.showStatusMenu = !this.showStatusMenu; this.showAreaMenu   = false; }

  @HostListener('document:click')
  closeMenus(): void {
    this.showAreaMenu   = false;
    this.showStatusMenu = false;
  }
}
