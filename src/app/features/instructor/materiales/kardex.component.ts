import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { ToastService } from '../../../core/services/toast.service';
import { Kardex, MaterialesApiService } from '../../../core/services/materiales/materiales-api.service';

/**
 * Log de movimientos de inventario para instructor — solo lectura, mismo
 * comportamiento que la versión admin. Pulido (Ronda 4, Fase 9): ver
 * docblock de la versión admin (nombre de producto en la columna Ítem +
 * tarjetas resumen).
 */
@Component({
  selector: 'app-instructor-materiales-kardex',
  standalone: true,
  imports: [FormsModule, AdminTableComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Kardex</h1>
        <div class="flex gap-2">
          <select [(ngModel)]="filtroTipo"
            class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
            <option value="">Todos los tipos</option>
            <option value="ENTRADA">Entrada</option>
            <option value="SALIDA">Salida</option>
          </select>
          <input [(ngModel)]="filtroTexto" placeholder="Buscar por producto, SKU o placa..."
            class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 mb-5">
        <div class="rounded-xl border border-gray-100 px-4 py-3">
          <p class="text-xs text-gray-500">Total</p>
          <p class="text-xl font-bold text-gray-800">{{ filas.length }}</p>
        </div>
        <div class="rounded-xl border border-gray-100 px-4 py-3">
          <p class="text-xs text-gray-500">Entradas</p>
          <p class="text-xl font-bold text-green-600">{{ contarTipo('ENTRADA') }}</p>
        </div>
        <div class="rounded-xl border border-gray-100 px-4 py-3">
          <p class="text-xs text-gray-500">Salidas</p>
          <p class="text-xl font-bold text-red-600">{{ contarTipo('SALIDA') }}</p>
        </div>
      </div>

      <app-admin-table
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por ítem, tipo, observación…'"
        [columns]="['fecha', 'tipo', 'item_sku', 'cantidad', 'saldo_anterior', 'saldo_actual', 'observacion']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="false"
        [canDelete]="false" />
    </div>
  `,
})
export class InstructorMaterialesKardexComponent implements OnInit {
  kardex: Kardex[] = [];
  loading = false;

  filtroTipo = '';
  filtroTexto = '';

  columnLabels: Record<string, string> = {
    item_sku: 'Ítem',
    cantidad: 'Cantidad',
    saldo_anterior: 'Saldo anterior',
    saldo_actual: 'Saldo actual',
    observacion: 'Observación',
  };

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargar();
  }

  get filas(): any[] {
    const texto = this.filtroTexto.trim().toLowerCase();
    return this.kardex
      .filter((k) => !this.filtroTipo || k.tipo === this.filtroTipo)
      .filter((k) => !texto
        || k.item?.producto?.nombre?.toLowerCase().includes(texto)
        || k.item?.codigo_sku?.toLowerCase().includes(texto)
        || k.item?.placa_sena?.toLowerCase().includes(texto))
      .map((k) => ({
        ...k,
        fecha: new Date(k.fecha).toLocaleString('es-CO'),
        item_sku: k.item?.producto?.nombre ?? k.item?.codigo_sku ?? k.id_item,
        observacion: k.observacion ?? '—',
      }));
  }

  contarTipo(tipo: 'ENTRADA' | 'SALIDA'): number {
    return this.filas.filter((f) => f.tipo === tipo).length;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.kardex = await this.api.listarKardex();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el kardex.');
    } finally {
      this.loading = false;
    }
  }
}
