import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { StatCardComponent } from '../../../shared/components/stat-card.component';
import { ToastService } from '../../../core/services/toast.service';
import { Kardex, MaterialesApiService } from '../../../core/services/materiales/materiales-api.service';

/**
 * Log de movimientos de stock — solo lectura. Se llena solo como efecto
 * secundario de otras operaciones (crear/editar/eliminar ítems y lotes,
 * resolver novedades, aprobar traslados/solicitudes/asignaciones — todo a
 * través de `KardexService`, único punto de escritura real) — no hay alta
 * manual. Existencias es puramente de lectura, no escribe acá.
 *
 * Pulido (Ronda 4, Fase 9): la columna "Ítem" muestra el nombre del
 * producto — `GET /kardex` ya carga `item.producto` (`kardex.repository.ts`,
 * `relations: ['item', 'item.producto']`, y a diferencia del gotcha de
 * `Item.sitio` de la Fase 6, acá `ItemMapper.toDomain` sí mapea `producto`
 * al dominio), así que no hace falta cruzar contra `listarItems()`/
 * `listarProductos()` como asumía el plan original. Tarjetas resumen
 * (Total/Entradas/Salidas) sobre el conjunto ya filtrado.
 *
 * Navegación cruzada (ítem 4): `?id_producto=` (desde Productos) o
 * `?id_item=` (desde Ítems) filtran exacto, independiente de
 * `filtroTexto`/`filtroTipo` — se combinan con un AND.
 */
@Component({
  selector: 'app-materiales-kardex',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, StatCardComponent],
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
          @if (idProductoFiltro || idItemFiltro) {
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#39A900]/10 text-[#2d8000] border border-[#39A900]/20">
              {{ idProductoFiltro ? 'Filtrando por producto' : 'Filtrando por ítem' }}
              <button (click)="quitarFiltroCruzado()" class="hover:text-red-600" title="Quitar filtro">×</button>
            </span>
          }
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 mb-5 max-w-xl">
        <app-stat-card label="Total" [value]="filas.length" tono="neutral">
          <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        </app-stat-card>
        <app-stat-card label="Entradas" [value]="contarTipo('ENTRADA')" tono="success">
          <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>
        </app-stat-card>
        <app-stat-card label="Salidas" [value]="contarTipo('SALIDA')" tono="danger">
          <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 20V8m0 0l-4 4m4-4l4 4M4 4h16"/></svg>
        </app-stat-card>
      </div>

      <app-admin-table
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por ítem, tipo, observación…'"
        [columns]="['fecha', 'tipo', 'item_sku', 'cantidad', 'saldo_anterior', 'saldo_actual', 'observacion']"
        [columnLabels]="columnLabels"
        [statusColumn]="'tipo'"
        [loading]="loading"
        [canEdit]="false"
        [canDelete]="false" />
    </div>
  `,
})
export class MaterialesKardexComponent implements OnInit {
  kardex: Kardex[] = [];
  loading = false;

  filtroTipo = '';
  filtroTexto = '';

  /** `?id_producto=`/`?id_item=` de la navegación cruzada — se leen una sola vez al entrar. */
  idProductoFiltro: string | null = null;
  idItemFiltro: string | null = null;

  columnLabels: Record<string, string> = {
    item_sku: 'Ítem',
    cantidad: 'Cantidad',
    saldo_anterior: 'Saldo anterior',
    saldo_actual: 'Saldo actual',
    observacion: 'Observación',
  };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.idProductoFiltro = this.route.snapshot.queryParamMap.get('id_producto');
    this.idItemFiltro = this.route.snapshot.queryParamMap.get('id_item');
    this.cargar();
  }

  quitarFiltroCruzado(): void {
    this.idProductoFiltro = null;
    this.idItemFiltro = null;
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  get filas(): any[] {
    const texto = this.filtroTexto.trim().toLowerCase();
    return this.kardex
      .filter((k) => !this.idProductoFiltro || k.item?.producto?.id_producto === this.idProductoFiltro)
      .filter((k) => !this.idItemFiltro || k.id_item === this.idItemFiltro)
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
