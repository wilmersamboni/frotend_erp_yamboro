import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { ToastService } from '../../../core/services/toast.service';
import { Chequeo, ItemChequeo, MaterialesApiService } from '../../../core/services/materiales/materiales-api.service';

/**
 * Chequeos de devolución — solo lectura. El backend crea uno por solicitud
 * al cerrar su préstamo (todas las unidades devueltas), con un ItemChequeo
 * por cada unidad — pasa/no pasa según volvió BUENO/REGULAR o DAÑADO/
 * PERDIDO (ver DevolucionesRepositoryAdapter.registrarLote en backend-
 * practica-hexagonal). Sin alta manual: es un registro de auditoría, no un
 * formulario.
 */
@Component({
  selector: 'app-materiales-chequeos',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, StatusBadgeComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Chequeos</h1>
          <p class="text-sm text-gray-500 mt-0.5">Inspección de unidades al cerrar cada préstamo devuelto.</p>
        </div>
        <input [(ngModel)]="filtroTexto" placeholder="Buscar por solicitud…"
          class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
      </div>

      <div class="grid grid-cols-3 gap-3 mb-5 max-w-lg">
        <div class="rounded-xl border border-gray-100 px-4 py-3">
          <p class="text-xs text-gray-500">Chequeos</p>
          <p class="text-xl font-bold text-gray-800">{{ chequeos.length }}</p>
        </div>
        <div class="rounded-xl border border-gray-100 px-4 py-3">
          <p class="text-xs text-gray-500">Unidades OK</p>
          <p class="text-xl font-bold text-green-600">{{ totalPasa() }}</p>
        </div>
        <div class="rounded-xl border border-gray-100 px-4 py-3">
          <p class="text-xs text-gray-500">Con novedad</p>
          <p class="text-xl font-bold text-red-600">{{ totalNoPasa() }}</p>
        </div>
      </div>

      <app-admin-table
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por solicitud…'"
        [columns]="['fecha', 'referencia', 'resumen']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="false"
        [canDelete]="false"
        [selectable]="true"
        (rowSelected)="verDetalle($event)" />

      @if (seleccionado) {
        <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
             (click)="seleccionado = null">
          <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
               (click)="$event.stopPropagation()">
            <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 class="font-bold text-gray-800">Chequeo #{{ seleccionado.id_chequeo.slice(0, 8) }}</h2>
                <p class="text-xs text-gray-500">Solicitud #{{ seleccionado.id_solicitud.slice(0, 8) }} · {{ formatearFecha(seleccionado.fecha) }}</p>
              </div>
              <button (click)="seleccionado = null" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div class="overflow-y-auto p-4 space-y-2">
              @if (itemsDelSeleccionado().length === 0) {
                <p class="text-sm text-gray-400 text-center py-6">Sin unidades registradas para este chequeo.</p>
              }
              @for (it of itemsDelSeleccionado(); track it.id_item_chequeo) {
                <div class="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-gray-100">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-800 truncate">
                      {{ it.item?.producto?.nombre ?? it.item?.codigo_sku ?? ('Ítem ' + it.id_item.slice(0, 8)) }}
                    </p>
                    @if (it.item?.placa_sena) {
                      <p class="text-xs text-gray-400">Placa {{ it.item?.placa_sena }}</p>
                    }
                    @if (it.observacion) {
                      <p class="text-xs text-gray-500 mt-0.5">{{ it.observacion }}</p>
                    }
                  </div>
                  <app-status-badge [value]="it.estado ? 'BUENO' : 'DAÑADO'" [labelOverride]="it.estado ? 'Pasa' : 'No pasa'" />
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class MaterialesChequeosComponent implements OnInit {
  chequeos: Chequeo[] = [];
  itemsChequeo: ItemChequeo[] = [];
  loading = false;
  filtroTexto = '';
  seleccionado: Chequeo | null = null;

  columnLabels: Record<string, string> = {
    referencia: 'Solicitud',
    resumen: 'Resultado',
  };

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargar();
  }

  get filas(): any[] {
    const texto = this.filtroTexto.trim().toLowerCase();
    return this.chequeos
      .filter((c) => !texto || c.id_solicitud.toLowerCase().includes(texto))
      .map((c) => {
        const items = this.itemsChequeo.filter((it) => it.id_chequeo === c.id_chequeo);
        const noPasa = items.filter((it) => !it.estado).length;
        return {
          ...c,
          fecha: this.formatearFecha(c.fecha),
          referencia: `#${c.id_solicitud.slice(0, 8)}`,
          resumen: items.length === 0
            ? 'Sin unidades'
            : noPasa > 0
              ? `${items.length - noPasa}/${items.length} OK, ${noPasa} con novedad`
              : `${items.length}/${items.length} OK`,
        };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  itemsDelSeleccionado(): ItemChequeo[] {
    if (!this.seleccionado) return [];
    return this.itemsChequeo.filter((it) => it.id_chequeo === this.seleccionado!.id_chequeo);
  }

  totalPasa(): number {
    return this.itemsChequeo.filter((it) => it.estado).length;
  }

  totalNoPasa(): number {
    return this.itemsChequeo.filter((it) => !it.estado).length;
  }

  formatearFecha(f: string): string {
    return new Date(f).toLocaleString('es-CO');
  }

  verDetalle(chequeo: Chequeo): void {
    this.seleccionado = chequeo;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [chequeos, items] = await Promise.all([
        this.api.listarChequeos(),
        this.api.listarItemsChequeo(),
      ]);
      this.chequeos = chequeos;
      this.itemsChequeo = items;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los chequeos.');
    } finally {
      this.loading = false;
    }
  }
}
