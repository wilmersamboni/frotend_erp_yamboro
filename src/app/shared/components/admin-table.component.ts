import { Component, Input, Output, EventEmitter } from '@angular/core';

/**
 * Tabla genérica reutilizable para el panel administrativo.
 * Recibe columnas, filas y emite eventos de editar/eliminar.
 * El campo 'id' se excluye de la vista pero se incluye en los eventos.
 *
 * Los clics de Editar/Eliminar cortan la propagación (Ronda 4, Fase 9) para
 * no disparar también `rowSelected` cuando un consumidor usa `selectable`
 * junto con edit/delete a la vez (ej. Sitios de Materiales, "Ver ítems" al
 * hacer clic en la fila) — antes de esto solo `admin-panel.component.ts`
 * usaba `selectable`, y ahí sin botones de fila, así que no había conflicto
 * que notar; sigue sin cambiar nada para ese caso.
 */
@Component({
  selector: 'app-admin-table',
  standalone: true,
  template: `
    @if (loading) {
      <div class="flex justify-center py-12">
        <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
      </div>
    } @else if (rows.length === 0) {
      <p class="text-center text-gray-400 text-sm py-10">No hay registros</p>
    } @else {
      <div class="overflow-x-auto rounded-xl border border-gray-100">
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
            @for (row of rows; track $index) {
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
    }
  `,
})
export class AdminTableComponent {
  @Input() rows:      any[]    = [];
  @Input() columns:   string[] = [];
  @Input() loading  = false;
  @Input() canEdit  = true;
  @Input() canDelete = true;

  /** Columnas a ocultar de la vista (el id sigue disponible en los eventos) */
  @Input() hiddenColumns: string[] = ['idPersona'];

  /** Etiqueta legible opcional por columna — si falta, se muestra el nombre crudo. */
  @Input() columnLabels: Record<string, string> = {};

  /** Si está en true, las filas son clicables (cursor + resaltado) y emiten rowSelected. */
  @Input() selectable = false;
  /** Fila actualmente seleccionada (por idKey) — solo para resaltar visualmente. */
  @Input() selectedRow: any = null;
  /** Campo usado para comparar cuál fila está seleccionada (ej. 'idRol', 'idUsuario'). */
  @Input() idKey = 'id';

  @Output() edit   = new EventEmitter<any>();
  @Output() delete = new EventEmitter<any>();
  @Output() rowSelected = new EventEmitter<any>();

  get visibleColumns(): string[] {
    return this.columns.filter(col => !this.hiddenColumns.includes(col));
  }

  isSelected(row: any): boolean {
    return this.selectedRow != null && this.selectedRow[this.idKey] === row[this.idKey];
  }
}
