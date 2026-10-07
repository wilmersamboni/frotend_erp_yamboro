import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { StatCardComponent } from '../../../shared/components/stat-card.component';
import { ToastService } from '../../../core/services/toast.service';
import { Kardex, Lote, MaterialesApiService } from '../data-access/materiales-api.service';
import { TableFilterComponent, TableFilterOption } from '../../../shared/components/table-filter.component';
import { ExportColumn, TableExportService } from '../../../shared/services/table-export.service';
import { EsperaDirective } from '../../../shared/directives/espera.directive';

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
  imports: [EsperaDirective, FormsModule, AdminTableComponent, StatCardComponent, TableFilterComponent],
  template: `
    <div class="p-4 sm:p-6">
      <nav aria-label="Migas de pan" class="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <span>Materiales</span><span aria-hidden="true">/</span><span>Inventario</span><span aria-hidden="true">/</span><span aria-current="page" class="font-semibold text-gray-800">Kardex</span>
      </nav>
      <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Historial de Movimientos<span class="block text-xs font-normal text-gray-400">antes «Kardex»</span></h1>
        <div class="flex flex-wrap gap-2 border-gray-200">
          <app-table-filter label="Tipo" [options]="opcionesTipoFiltro" [value]="filtroTipo"
          (valueChange)="filtroTipo = $event" />
          <input appEspera [(ngModel)]="filtroTexto" placeholder="Buscar por producto, SKU o placa..."
            class="min-w-0 flex-1 basis-48 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900] bg-white sm:w-xs sm:flex-none" />
          <button type="button" (click)="exportarExcel()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-[#39A900] hover:text-[#267700]" aria-label="Exportar kardex a Excel">Excel</button>
          <button type="button" (click)="exportarPdf()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-[#39A900] hover:text-[#267700]" aria-label="Exportar kardex a PDF">PDF</button>
          @if (idProductoFiltro || idItemFiltro) {
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#39A900]/10 text-[#2d8000] border border-[#39A900]/20">
              {{ idProductoFiltro ? 'Filtrando por producto' : 'Filtrando por ítem' }}
              <button aria-label="Quitar filtro" (click)="quitarFiltroCruzado()" class="hover:text-red-600" title="Quitar filtro">×</button>
            </span>
          }
        </div>
      </div>

      <div class="grid grid-cols-1 min-[380px]:grid-cols-3 gap-3 mb-5 max-w-xl">
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
  private lotesPorId = new Map<string, Lote>();
  loading = false;

  filtroTipo = '';
  filtroTexto = '';

  /** `?id_producto=`/`?id_item=` de la navegación cruzada — se leen una sola vez al entrar. */
  idProductoFiltro: string | null = null;
  idItemFiltro: string | null = null;

  columnLabels: Record<string, string> = {
    item_sku: 'Producto',
    cantidad: 'Cantidad',
    saldo_anterior: 'Saldo anterior',
    saldo_actual: 'Saldo actual',
    observacion: 'Observación',
  };

  opcionesTipoFiltro: TableFilterOption[] = [
    { value: '', label: 'Todos los tipos' },
    { value: 'ENTRADA', label: 'Entrada' },
    { value: 'SALIDA', label: 'Salida' },
  ];

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
    private exporter: TableExportService,
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

  /** Producto y referencia del movimiento: de la unidad (devolutivo) o del lote (consumo/perecedero). */
  private origen(k: Kardex): { idProducto: string | null; nombre: string | null; ref: string | null } {
    if (k.item) {
      return {
        idProducto: k.item.producto?.id_producto ?? null,
        nombre: k.item.producto?.nombre ?? null,
        ref: k.item.placa_sena ? `Placa ${k.item.placa_sena}` : (k.item.codigo_sku ?? null),
      };
    }
    const lote = k.id_lote ? this.lotesPorId.get(k.id_lote) : undefined;
    return {
      idProducto: lote?.id_producto ?? null,
      nombre: lote?.producto?.nombre ?? null,
      ref: lote?.codigo_lote ? `Lote ${lote.codigo_lote}` : k.id_lote ? 'Lote' : null,
    };
  }

  get filas(): any[] {
    const texto = this.filtroTexto.trim().toLowerCase();
    return this.kardex
      .map((k) => ({ k, o: this.origen(k) }))
      .filter(({ o }) => !this.idProductoFiltro || o.idProducto === this.idProductoFiltro)
      .filter(({ k }) => !this.idItemFiltro || k.id_item === this.idItemFiltro)
      .filter(({ k }) => !this.filtroTipo || k.tipo === this.filtroTipo)
      .filter(({ o }) => !texto
        || o.nombre?.toLowerCase().includes(texto)
        || o.ref?.toLowerCase().includes(texto))
      .map(({ k, o }) => ({
        ...k,
        fecha: new Date(k.fecha).toLocaleString('es-CO'),
        item_sku: [o.nombre, o.ref].filter(Boolean).join(' · ') || '—',
        observacion: k.observacion ?? '—',
      }));
  }

  contarTipo(tipo: 'ENTRADA' | 'SALIDA'): number {
    return this.filas.filter((f) => f.tipo === tipo).length;
  }

  private readonly exportColumns: ExportColumn<any>[] = [
    { label: 'Fecha', value: (f) => f.fecha }, { label: 'Tipo', value: (f) => f.tipo },
    { label: 'Producto', value: (f) => f.item_sku }, { label: 'Cantidad', value: (f) => f.cantidad },
    { label: 'Saldo anterior', value: (f) => f.saldo_anterior }, { label: 'Saldo actual', value: (f) => f.saldo_actual },
    { label: 'Observación', value: (f) => f.observacion },
  ];

  exportarExcel(): void { void this.exporter.excel('kardex', 'Kardex', this.exportColumns, this.filas); }
  exportarPdf(): void { void this.exporter.pdf('kardex', 'Kardex', this.exportColumns, this.filas); }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // Los lotes solo ponen nombre a los movimientos de consumo; si fallan, el kardex igual se muestra.
      const [kardex, lotes] = await Promise.all([
        this.api.listarKardex(),
        this.api.listarLotes().catch(() => [] as Lote[]),
      ]);
      this.lotesPorId = new Map(lotes.map((l) => [l.id_lote, l]));
      this.kardex = kardex;
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el kardex.');
    } finally {
      this.loading = false;
    }
  }
}
