import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from '../../../core/services/toast.service';
import { MaterialesApiService, ResumenExistencias } from '../../../core/services/materiales/materiales-api.service';
import { StatCardComponent } from '../../../shared/components/stat-card.component';

/**
 * Panel de existencias — SOLO LECTURA (Tier SigMat M6). Reemplaza el CRUD que
 * escribía a mano en la vieja tabla `inventario` (vestigial: ningún flujo la
 * sincronizaba, el stock real vive en `item.estado` + `lote`; el módulo y la
 * tabla se eliminaron del todo). Los datos salen de `GET /api2/existencias`,
 * ya recortado por programa/bodega.
 *
 * Para mover stock se usan los flujos reales (solicitudes, traslados,
 * novedades, devoluciones) — acá no se crea/edita/elimina nada.
 */
@Component({
  selector: 'app-aprendiz-materiales-existencias',
  standalone: true,
  imports: [FormsModule, StatCardComponent],
  template: `
    <div class="p-6">
      <div class="mb-5">
        <h1 class="text-xl font-bold text-gray-800">Existencias</h1>
        <p class="text-sm text-gray-400">Vista de solo lectura. El stock se mueve con solicitudes, traslados, novedades y devoluciones.</p>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else {
        <!-- Tarjetas resumen -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <app-stat-card label="Unidades" [value]="tot().total" tono="neutral">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          </app-stat-card>
          <app-stat-card label="Disponibles" [value]="tot().disponibles" tono="success">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </app-stat-card>
          <app-stat-card label="Prestadas" [value]="tot().prestados" tono="info">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
          </app-stat-card>
          <app-stat-card label="En mantenimiento" [value]="tot().mantenimiento" tono="warning">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a4 4 0 100 8 4 4 0 000-8zM3 20a8 8 0 0116 0"/></svg>
          </app-stat-card>
          <app-stat-card label="Dañadas / perdidas" [value]="tot().danados + tot().perdidos" tono="danger">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </app-stat-card>
          <app-stat-card label="Lotes por vencer" [value]="tot().lotes_por_vencer" [tono]="tot().lotes_por_vencer > 0 ? 'warning' : 'neutral'">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </app-stat-card>
        </div>

        <div class="flex flex-wrap items-center gap-2 mb-3">
          <input type="text" [(ngModel)]="q" (ngModelChange)="filtro.set($event)"
            placeholder="Buscar por producto, SKU o bodega…"
            class="w-full md:w-96 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
          @if (idProductoFiltro()) {
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#39A900]/10 text-[#2d8000] border border-[#39A900]/20">
              Filtrando por producto
              <button (click)="quitarFiltroProducto()" class="hover:text-red-600" title="Quitar filtro">×</button>
            </span>
          }
        </div>

        @if (filtradas().length === 0) {
          <p class="text-center text-gray-400 text-sm py-10">Sin existencias para mostrar</p>
        } @else {
          <div class="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50/80 text-gray-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold">Producto</th>
                  <th class="px-4 py-3 text-left font-semibold">Bodega</th>
                  <th class="px-3 py-3 text-right font-semibold">Disp.</th>
                  <th class="px-3 py-3 text-right font-semibold">Prest.</th>
                  <th class="px-3 py-3 text-right font-semibold">Mant.</th>
                  <th class="px-3 py-3 text-right font-semibold">Dañ./Perd.</th>
                  <th class="px-3 py-3 text-right font-semibold">Total</th>
                  <th class="px-3 py-3 text-right font-semibold">Lote disp.</th>
                  <th class="px-3 py-3 text-right font-semibold">Por vencer</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (r of filtradas(); track r.id_producto) {
                  <tr class="hover:bg-gray-50/80 transition-colors">
                    <td class="px-4 py-3">
                      <div class="text-gray-800 font-medium">{{ r.nombre }}</div>
                      <div class="text-[11px] text-gray-400">
                        {{ r.sku || '—' }}
                        @if (r.marca || r.modelo) { · {{ marcaModelo(r) }} }
                        · {{ r.tipo_material }}
                      </div>
                    </td>
                    <td class="px-4 py-3 text-gray-600">{{ r.sitio_nombre || '— sin bodega —' }}</td>
                    <td class="px-3 py-3 text-right font-semibold" [class.text-green-700]="r.disponibles > 0" [class.text-gray-300]="r.disponibles === 0">{{ r.disponibles }}</td>
                    <td class="px-3 py-3 text-right" [class.text-blue-700]="r.prestados > 0" [class.text-gray-300]="r.prestados === 0">{{ r.prestados }}</td>
                    <td class="px-3 py-3 text-right" [class.text-amber-700]="r.mantenimiento > 0" [class.text-gray-300]="r.mantenimiento === 0">{{ r.mantenimiento }}</td>
                    <td class="px-3 py-3 text-right" [class.text-red-700]="(r.danados + r.perdidos) > 0" [class.text-gray-300]="(r.danados + r.perdidos) === 0">{{ r.danados + r.perdidos }}</td>
                    <td class="px-3 py-3 text-right text-gray-700">{{ r.total }}</td>
                    <td class="px-3 py-3 text-right" [class.text-gray-700]="r.lote_disponible > 0" [class.text-gray-300]="r.lote_disponible === 0">{{ r.lote_disponible || '—' }}</td>
                    <td class="px-3 py-3 text-right">
                      @if (r.lotes_por_vencer > 0) {
                        <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold" style="background-color:#FEF3C7;color:#B45309">{{ r.lotes_por_vencer }}</span>
                      } @else {
                        <span class="text-gray-300">—</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class AprendizMaterialesExistenciasComponent implements OnInit {
  filas = signal<ResumenExistencias[]>([]);
  loading = false;
  q = '';
  filtro = signal('');

  /** `?id_producto=` de la navegación cruzada — filtro exacto, independiente del buscador de texto. */
  idProductoFiltro = signal<string | null>(null);

  filtradas = computed(() => {
    const t = this.filtro().trim().toLowerCase();
    const idProducto = this.idProductoFiltro();
    const rows = idProducto ? this.filas().filter((r) => r.id_producto === idProducto) : this.filas();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.nombre, r.sku, r.sitio_nombre, r.marca, r.modelo]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(t)),
    );
  });

  tot = computed(() =>
    this.filas().reduce(
      (a, r) => ({
        total: a.total + r.total,
        disponibles: a.disponibles + r.disponibles,
        prestados: a.prestados + r.prestados,
        mantenimiento: a.mantenimiento + r.mantenimiento,
        danados: a.danados + r.danados,
        perdidos: a.perdidos + r.perdidos,
        lotes_por_vencer: a.lotes_por_vencer + r.lotes_por_vencer,
      }),
      { total: 0, disponibles: 0, prestados: 0, mantenimiento: 0, danados: 0, perdidos: 0, lotes_por_vencer: 0 },
    ),
  );

  marcaModelo(r: ResumenExistencias): string {
    return [r.marca, r.modelo].filter((v) => !!v).join(' ');
  }

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  quitarFiltroProducto(): void {
    this.idProductoFiltro.set(null);
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  ngOnInit(): void {
    this.idProductoFiltro.set(this.route.snapshot.queryParamMap.get('id_producto'));
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.filas.set(await this.api.obtenerExistencias());
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el panel de existencias.');
    } finally {
      this.loading = false;
    }
  }
}
