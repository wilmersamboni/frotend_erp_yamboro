import { Component, DoCheck, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Tabla genérica reutilizable para el panel administrativo.
 * Recibe columnas, filas y emite eventos de editar/eliminar.
 * El campo 'id' se excluye de la vista pero se incluye en los eventos.
 *
 * Búsqueda + paginación (Ronda 6): con `[searchable]="true"` la tabla se
 * envuelve en una tarjeta con el mismo estilo que el Panel Administrativo
 * (toolbar con buscador compacto + selector "Filas", y pie de paginación
 * client-side). El buscador filtra `rows` por substring (case-insensitive)
 * contra TODOS los valores de la fila — no solo las columnas visibles — así
 * una pantalla puede sumar un campo "invisible" (ej. `_placas`) para que el
 * buscador lo alcance sin mostrarlo como columna.
 *
 * Sin `searchable` (ej. el propio Panel Administrativo, que monta su chrome
 * por fuera) el render es exactamente el de antes: tabla pelada con borde.
 *
 * Los clics de Editar/Eliminar cortan la propagación (Ronda 4, Fase 9) para
 * no disparar también `rowSelected` cuando un consumidor usa `selectable`.
 */
@Component({
  selector: 'app-admin-table',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div [class]="searchable
        ? 'bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden'
        : ''">

      @if (searchable && !loading) {
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
          <!-- Buscador -->
          <div class="relative flex-1 max-w-sm">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
            <input type="text" [(ngModel)]="busqueda" (ngModelChange)="page = 0"
              [placeholder]="searchPlaceholder"
              class="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900] focus:bg-white transition-all text-gray-900 placeholder:text-gray-400" />
            @if (busqueda) {
              <button (click)="busqueda = ''; page = 0"
                class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            }
          </div>

          <!-- Filas por página -->
          <div class="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
            <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filas</span>
            <select [(ngModel)]="pageSize" (ngModelChange)="page = 0"
              class="text-sm font-semibold bg-transparent border-none focus:ring-0 text-gray-700 cursor-pointer">
              <option [ngValue]="10">10</option>
              <option [ngValue]="20">20</option>
              <option [ngValue]="50">50</option>
              <option [ngValue]="100">100</option>
            </select>
          </div>

          <!-- Botón de alta (opcional) — a la derecha, misma fila que buscador/filas -->
          @if (addLabel) {
            <button (click)="add.emit()"
              class="sm:ml-auto shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 text-white text-sm font-semibold rounded-xl transition-colors"
              style="background-color: #39A900">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
              </svg>
              {{ addLabel }}
            </button>
          }
        </div>
      }

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (rows.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay registros</p>
      } @else if (filasVisibles.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">Sin resultados para "{{ busqueda }}"</p>
      } @else {
        <div [class]="searchable ? 'overflow-x-auto' : 'overflow-x-auto rounded-xl border border-gray-100'">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                @for (col of visibleColumns; track col) {
                  <th class="px-4 py-3 text-left font-medium whitespace-nowrap">{{ columnLabels[col] ?? col }}</th>
                }
                <th class="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (row of pageRows; track $index) {
                <tr class="hover:bg-gray-50 transition-colors"
                    [class.cursor-pointer]="selectable"
                    [class.bg-[#39A900]/5]="selectable && isSelected(row)"
                    (click)="selectable && rowSelected.emit(row)">
                  @for (col of visibleColumns; track col) {
                    <td class="px-4 py-3 text-gray-700 max-w-[200px] truncate">
                      {{ row[col] ?? '—' }}
                    </td>
                  }
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-1">
                      @if (canEdit) {
                        <button (click)="edit.emit(row); $event.stopPropagation()"
                          class="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"
                          title="Editar">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                                 m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                      }
                      @if (canDelete) {
                        <button (click)="delete.emit(row); $event.stopPropagation()"
                          class="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                          title="Eliminar">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7
                                 m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (searchable && filasVisibles.length > pageSize) {
          <div class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
            <span class="text-sm text-gray-500">
              Mostrando <strong class="text-gray-800">{{ pageRows.length }}</strong>
              de <strong class="text-gray-800">{{ filasVisibles.length }}</strong> registros
            </span>
            <div class="flex items-center gap-2">
              <button (click)="page = page - 1" [disabled]="page === 0"
                class="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-[#39A900] hover:text-white hover:border-[#39A900] disabled:opacity-30 disabled:pointer-events-none transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <span class="px-4 py-1.5 text-sm font-semibold text-[#39A900] bg-[#39A900]/10 rounded-lg border border-[#39A900]/20">
                {{ page + 1 }} / {{ totalPaginas }}
              </span>
              <button (click)="page = page + 1" [disabled]="page + 1 >= totalPaginas"
                class="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-[#39A900] hover:text-white hover:border-[#39A900] disabled:opacity-30 disabled:pointer-events-none transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class AdminTableComponent implements DoCheck {
  @Input() rows:      any[]    = [];
  @Input() columns:   string[] = [];
  @Input() loading  = false;
  @Input() canEdit  = true;
  @Input() canDelete = true;

  /** Columnas a ocultar de la vista (el id sigue disponible en los eventos) */
  @Input() hiddenColumns: string[] = ['idPersona'];

  /** Etiqueta legible opcional por columna — si falta, se muestra el nombre crudo. */
  @Input() columnLabels: Record<string, string> = {};

  /** Envuelve la tabla en la tarjeta con toolbar (buscador + "Filas") y pie de
   *  paginación, con el mismo estilo que el Panel Administrativo. */
  @Input() searchable = false;
  @Input() searchPlaceholder = 'Buscar...';

  /** Si se pasa (y `searchable`), muestra un botón "+ {{addLabel}}" en el toolbar,
   *  a la derecha del buscador/filas. Emite `add` al hacer clic. Pasar `null`/''
   *  para ocultarlo (ej. el usuario no tiene permiso de alta). */
  @Input() addLabel: string | null = null;
  @Output() add = new EventEmitter<void>();

  /** Estado interno del buscador/paginador (solo activo con `searchable`). */
  busqueda = '';
  page = 0;
  pageSize = 20;

  /** Si está en true, las filas son clicables (cursor + resaltado) y emiten rowSelected. */
  @Input() selectable = false;
  /** Fila actualmente seleccionada (por idKey) — solo para resaltar visualmente. */
  @Input() selectedRow: any = null;
  /** Campo usado para comparar cuál fila está seleccionada (ej. 'idRol', 'idUsuario'). */
  @Input() idKey = 'id';

  @Output() edit   = new EventEmitter<any>();
  @Output() delete = new EventEmitter<any>();
  @Output() rowSelected = new EventEmitter<any>();

  /** Clampa `page` si la lista filtrada se achicó (antes de la vista → sin ExpressionChanged). */
  ngDoCheck(): void {
    const max = this.totalPaginas - 1;
    if (this.page > max) this.page = Math.max(0, max);
  }

  get visibleColumns(): string[] {
    return this.columns.filter(col => !this.hiddenColumns.includes(col));
  }

  /** `rows` filtradas por el texto de búsqueda (todos los valores de la fila,
   *  no solo las columnas visibles). Sin `searchable` o sin texto, devuelve todo. */
  get filasVisibles(): any[] {
    const q = this.busqueda.trim().toLowerCase();
    if (!this.searchable || !q) return this.rows;
    return this.rows.filter(row =>
      Object.values(row)
        .map(v => (v == null ? '' : String(v)))
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.filasVisibles.length / this.pageSize));
  }

  /** Filas de la página actual (o todas, sin `searchable`). */
  get pageRows(): any[] {
    const all = this.filasVisibles;
    if (!this.searchable) return all;
    const p = Math.min(this.page, this.totalPaginas - 1);
    const start = p * this.pageSize;
    return all.slice(start, start + this.pageSize);
  }

  isSelected(row: any): boolean {
    return this.selectedRow != null && this.selectedRow[this.idKey] === row[this.idKey];
  }
}
