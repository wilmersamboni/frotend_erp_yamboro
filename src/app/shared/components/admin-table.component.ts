import { Component, DoCheck, Input, Output, EventEmitter, Signal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StatusBadgeComponent } from './status-badge.component';
import { TableFilterComponent } from './table-filter.component';
import { LoadingSkeletonComponent } from './loading-skeleton.component';
import { EmptyStateComponent } from './empty-state.component';
import { EsperaDirective } from '../directives/espera.directive';
import { PageSizeSelectComponent } from './page-size-select.component';


/** Enlace de navegación cruzada por fila (ej. Producto → Existencias filtradas por ese producto). */
export interface TableRowLink {
  label: string;
  /** Navegación (pill-link). Si se pasa `onClick` en su lugar, la pill es un botón de acción. */
  routerLink?: (row: any) => any[];
  /** Acción sobre la fila (ej. abrir un modal) en vez de navegar. */
  onClick?: (row: any) => void;
  queryParams?: (row: any) => Record<string, any>;
  /** Si se pasa, el link solo se muestra en filas donde devuelva true (ej. "Lotes" solo para productos consumibles). */
  visible?: (row: any) => boolean;
}

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
 *
 * Navegación cruzada: `rowLinks` agrega pills de navegación junto a
 * Editar/Eliminar (ej. desde Productos, "Ver existencias" con
 * `?id_producto=` ya cargado) — cada pantalla destino decide qué hacer con
 * el query param, esta tabla solo arma el link.
 */
@Component({
  selector: 'app-admin-table',
  standalone: true,
  imports: [EsperaDirective, FormsModule, RouterLink, StatusBadgeComponent, TableFilterComponent, LoadingSkeletonComponent, EmptyStateComponent, PageSizeSelectComponent],
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
            <input appEspera type="text" [(ngModel)]="busqueda" (ngModelChange)="page = 0"
              [placeholder]="searchPlaceholder"
              class="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900] focus:bg-white transition-all text-gray-900 placeholder:text-gray-400" />
            @if (busqueda) {
              <button aria-label="Limpiar búsqueda" (click)="busqueda = ''; page = 0"
                class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            }
          </div>

          <app-page-size-select [value]="pageSize()" (valueChange)="seleccionarPageSize($event)" />

          <!-- Filtro opcional (ej. estado activo/desactivado) — lo controla el padre -->
          @if (filterOptions && filterOptions.length) {
            <app-table-filter [options]="filterOptions" [value]="filterValue" [label]="filterLabel" (valueChange)="seleccionarFiltro($event)" />
          }
          @if (secondaryFilterOptions && secondaryFilterOptions.length) {
            <app-table-filter [options]="secondaryFilterOptions" [value]="secondaryFilterValue" [label]="secondaryFilterLabel" (valueChange)="seleccionarFiltroSecundario($event)" />
          }

          @if (addLabel) {
            <button (click)="add.emit()"
              class="sm:ml-auto shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 text-white text-sm font-semibold rounded-xl transition-colors"
              style="background-color: var(--accent-brand)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
              </svg>
              {{ addLabel }}
            </button>
          }
        </div>
      }

      @if (loading) {
        <app-loading-skeleton variant="table" [rows]="6" [columns]="skeletonColumnCount"
          [showToolbar]="searchable" label="Cargando registros" />
      } @else if (rows.length === 0) {
        <app-empty-state titulo="No hay registros" ayuda="Cuando se agregue información aparecerá aquí." />
      } @else if (filasVisibles.length === 0) {
        <app-empty-state titulo="Sin resultados para «{{ busqueda }}»" variante="busqueda" />
      } @else {
        <div [class]="searchable ? 'overflow-x-auto' : 'overflow-x-auto rounded-xl border border-gray-100'">
          <table class="w-full text-sm">
            <thead class="bg-gray-50/80 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                @if (checkable) {
                  <th class="w-10 px-4 py-3">
                    <input type="checkbox" [checked]="allSelected" (change)="toggleAll($event)"
                      class="w-4 h-4 rounded border-gray-300 text-[#39A900] focus:ring-[#39A900]/30 cursor-pointer" />
                  </th>
                }
                @for (col of visibleColumns; track col) {
                  <th class="px-4 py-3 text-left font-semibold whitespace-nowrap">{{ columnLabels[col] || col }}</th>
                }
                @if (canEdit || canDelete || rowLinks.length > 0) {
                  <th class="px-4 py-3 text-right font-semibold">Acciones</th>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (row of pageRows; track $index) {
                <tr class="hover:bg-gray-50/80 transition-colors"
                    [class.cursor-pointer]="selectable"
                    [class.bg-[#39A900]/5]="selectable && isSelected(row)"
                    (click)="selectable && rowSelected.emit(row)">
                  @if (checkable) {
                    <td class="px-4 py-3" (click)="$event.stopPropagation()">
                      <input type="checkbox" [checked]="isChecked(row)" (change)="toggleRow(row)"
                        class="w-4 h-4 rounded border-gray-300 text-[#39A900] focus:ring-[#39A900]/30 cursor-pointer" />
                    </td>
                  }
                  @for (col of visibleColumns; track col) {
                    <td class="px-4 py-3 text-gray-700 max-w-[220px] truncate">
                      @if (col === statusColumn) {
                        <app-status-badge [value]="row[col]" />
                      } @else {
                        {{ row[col] ?? '—' }}
                      }
                    </td>
                  }
                  @if (canEdit || canDelete || rowLinks.length > 0) {
                    <td class="px-4 py-3">
                      <div class="flex justify-end gap-2">
                        @for (link of rowLinks; track link.label) {
                          @if (!link.visible || link.visible(row)) {
                            @if (link.onClick) {
                              <button type="button" (click)="link.onClick(row); $event.stopPropagation()"
                                class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-[#39A900] hover:text-[#39A900] transition-colors">
                                {{ link.label }}
                              </button>
                            } @else if (link.routerLink) {
                              <a [routerLink]="link.routerLink(row)" [queryParams]="link.queryParams ? link.queryParams(row) : undefined"
                                (click)="$event.stopPropagation()"
                                class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-[#39A900] hover:text-[#39A900] transition-colors">
                                {{ link.label }}
                              </a>
                            }
                          }
                        }
                        @if (canEdit) {
                          <button (click)="edit.emit(row); $event.stopPropagation()"
                            class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-[#39A900] hover:text-[#39A900] transition-colors">
                            Editar
                          </button>
                        }
                        @if (rowCanDelete(row)) {
                          <button (click)="delete.emit(row); $event.stopPropagation()"
                            class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-red-400 hover:text-red-600 transition-colors">
                            {{ rowDeleteLabel(row) }}
                          </button>
                        }
                      </div>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (searchable && filasVisibles.length > pageSize()) {
          <div class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
            <span class="text-sm text-gray-500">
              Mostrando <strong class="text-gray-800">{{ pageRows.length }}</strong>
              de <strong class="text-gray-800">{{ filasVisibles.length }}</strong> registros
            </span>
            <div class="flex items-center gap-2">
              <button aria-label="Página anterior" (click)="page = page - 1" [disabled]="page === 0"
                class="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-[#39A900] hover:text-white hover:border-[#39A900] disabled:opacity-30 disabled:pointer-events-none transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <span class="px-4 py-1.5 text-sm font-semibold text-[#39A900] bg-[#39A900]/10 rounded-lg border border-[#39A900]/20">
                {{ page + 1 }} / {{ totalPaginas }}
              </span>
              <button aria-label="Página siguiente" (click)="page = page + 1" [disabled]="page + 1 >= totalPaginas"
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
  /** Puede ser un booleano fijo para toda la tabla, o una función `(row) =>
   *  boolean` cuando la tabla mezcla filas en distinto estado (ej. Ítems
   *  activos e inactivos a la vez) y el botón debe decidirse por fila. */
  @Input() canDelete: boolean | ((row: any) => boolean) = true;
  /** Texto del botón de la derecha (por defecto "Eliminar"). Ej.: "Desactivar" / "Reactivar".
   *  También acepta una función `(row) => string` para variar el texto por fila
   *  (ver `canDelete`). */
  @Input() deleteLabel: string | ((row: any) => string) = 'Eliminar';

  rowCanDelete(row: any): boolean {
    return typeof this.canDelete === 'function' ? this.canDelete(row) : this.canDelete;
  }

  rowDeleteLabel(row: any): string {
    return typeof this.deleteLabel === 'function' ? this.deleteLabel(row) : this.deleteLabel;
  }

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

  /** Filtro opcional en el toolbar (select), entre "Filas" y el botón de alta.
   *  El padre es el dueño del valor: se pasa `[filterValue]` y se reacciona a
   *  `(filterValueChange)`. Pasar `null`/`[]` en `filterOptions` lo oculta. */
  @Input() filterOptions: { value: string; label: string }[] | null = null;
  @Input() filterValue = '';
  @Input() filterLabel = 'Estado';
  @Output() filterValueChange = new EventEmitter<string>();

  /** Segundo filtro opcional, útil para combinar criterios como estado y sitio. */
  @Input() secondaryFilterOptions: { value: string; label: string }[] | null = null;
  @Input() secondaryFilterValue = '';
  @Input() secondaryFilterLabel = 'Filtro';
  @Output() secondaryFilterValueChange = new EventEmitter<string>();

  seleccionarFiltro(valor: string): void {
    this.filterValueChange.emit(valor);
    this.page = 0;
  }

  seleccionarFiltroSecundario(valor: string): void {
    this.secondaryFilterValueChange.emit(valor);
    this.page = 0;
  }

  /** Estado interno del buscador/paginador (solo activo con `searchable`). */
  busqueda = '';
  page = 0;
  pageSize = signal(20);

  seleccionarPageSize(size: number): void {
    this.pageSize.set(size);
    this.page = 0;
  }

  /** Si está en true, las filas son clicables (cursor + resaltado) y emiten rowSelected. */
  @Input() selectable = false;
  /** Fila actualmente seleccionada (por idKey) — solo para resaltar visualmente. */
  @Input() selectedRow: any = null;
  /** Campo usado para comparar cuál fila está seleccionada (ej. 'idRol', 'idUsuario'). */
  @Input() idKey = 'id';

  @Output() edit   = new EventEmitter<any>();
  @Output() delete = new EventEmitter<any>();
  @Output() rowSelected = new EventEmitter<any>();

  /** Enlaces de navegación cruzada por fila (ej. "Ver existencias" desde Productos) — se renderizan como pills junto a Editar/Eliminar. */
  @Input() rowLinks: TableRowLink[] = [];

  /** Columna a renderizar como píldora de estado (app-status-badge) en vez de texto plano. */
  @Input() statusColumn: string | null = null;

  /** Muestra una columna de checkboxes (selección múltiple) a la izquierda. */
  @Input() checkable = false;
  /** Filas seleccionadas (por `idKey`) — controlado por el padre, dos vías vía `checkedChange`. */
  @Input() checkedRows: any[] = [];
  @Output() checkedChange = new EventEmitter<any[]>();

  isChecked(row: any): boolean {
    return this.checkedRows.some((r) => r[this.idKey] === row[this.idKey]);
  }

  get allSelected(): boolean {
    return this.pageRows.length > 0 && this.pageRows.every((r) => this.isChecked(r));
  }

  toggleRow(row: any): void {
    const yaEsta = this.isChecked(row);
    const siguiente = yaEsta
      ? this.checkedRows.filter((r) => r[this.idKey] !== row[this.idKey])
      : [...this.checkedRows, row];
    this.checkedChange.emit(siguiente);
  }

  toggleAll(ev: Event): void {
    const marcar = (ev.target as HTMLInputElement).checked;
    const idsPagina = new Set(this.pageRows.map((r) => r[this.idKey]));
    const sinLaPagina = this.checkedRows.filter((r) => !idsPagina.has(r[this.idKey]));
    this.checkedChange.emit(marcar ? [...sinLaPagina, ...this.pageRows] : sinLaPagina);
  }

  /** Clampa `page` si la lista filtrada se achicó (antes de la vista → sin ExpressionChanged). */
  ngDoCheck(): void {
    const max = this.totalPaginas - 1;
    if (this.page > max) this.page = Math.max(0, max);
  }

  get visibleColumns(): string[] {
    return this.columns.filter(col => !this.hiddenColumns.includes(col));
  }

  get skeletonColumnCount(): number {
    return Math.max(3, this.visibleColumns.length + (this.canEdit || this.canDelete || this.rowLinks.length ? 1 : 0));
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
    return Math.max(1, Math.ceil(this.filasVisibles.length / this.pageSize()));
  }

  /** Filas de la página actual (o todas, sin `searchable`). */
  get pageRows(): any[] {
    const all = this.filasVisibles;
    if (!this.searchable) return all;
    const p = Math.min(this.page, this.totalPaginas - 1);
    const start = p * this.pageSize();
    return all.slice(start, start + this.pageSize());
  }

  isSelected(row: any): boolean {
    return this.selectedRow != null && this.selectedRow[this.idKey] === row[this.idKey];
  }
}
