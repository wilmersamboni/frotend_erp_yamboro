import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';
import { MaterialesApiService, ResumenExistencias } from '../../core/services/materiales/materiales-api.service';
import { StatCardComponent } from '../../shared/components/stat-card.component';

/**
 * Panel de existencias — SOLO LECTURA (Tier SigMat M6). Reemplaza el CRUD que
 * escribía a mano en la vieja tabla `inventario` (vestigial: ningún flujo la
 * sincronizaba, el stock real vive en `item.estado` + `lote`; el módulo y la
 * tabla se eliminaron del todo). Los datos salen de `GET /api2/existencias`,
 * ya recortado por programa/bodega.
 *
 * Para mover stock se usan los flujos reales (solicitudes, traslados,
 * novedades, devoluciones) — acá no se crea/edita/elimina nada.
 *
 * "Disponible" y "Total" son EFECTIVOS: para un producto DEVOLUTIVO cuentan
 * unidades (`item.estado`); para un CONSUMO/PERECEDERO cuentan el saldo de sus
 * lotes ACTIVO (`lote.cantidad_disponible` / `cantidad_inicial`). Antes la
 * columna "Disp." solo miraba ítems y mostraba 0 para todo consumible, con el
 * saldo real escondido aparte en "Lote disp." (reporte QA #6/#12).
 *
 * Componente único para admin/instructor/aprendiz (ítem 5 del plan de
 * unificación). La ruta se gatea por `materiales.existencias.ver`.
 *
 * Navegación cruzada (ítem 4): llega con `?id_producto=` desde la fila de un
 * producto en Productos — filtra exacto por ese producto y muestra un chip
 * para quitar el filtro, sin tocar el buscador de texto libre.
 */
@Component({
  selector: 'app-materiales-existencias',
  standalone: true,
  imports: [FormsModule, StatCardComponent],
  template: `
    <div class="p-6">
      <div class="mb-5">
        <h1 class="text-xl font-bold text-gray-800 mb-3">Existencias</h1>
        <p class="text-sm text-gray-400">Vista de solo lectura. El stock se mueve con solicitudes, traslados, novedades y devoluciones.</p>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else {
        <!-- Tarjetas resumen -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <app-stat-card label="Unidades / saldo" [value]="tot().total" tono="neutral">
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
          <input type="text" [(ngModel)]="q" (ngModelChange)="onBuscar($event)"
            placeholder="Buscar por producto, SKU o bodega…"
            class="w-full md:w-96 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900] bg-white" />
          <div class="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
            <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filas</span>
            <div class="relative">
              <button
                type="button"
                (click)="pageSizeDropdownOpen.update(v => !v)"
                class="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-transparent focus:outline-none cursor-pointer">
                <span>{{ pageSize() }}</span>
                <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200" [class.rotate-180]="pageSizeDropdownOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              @if (pageSizeDropdownOpen()) {
                <div class="fixed inset-0 z-10" (click)="pageSizeDropdownOpen.set(false)"></div>

                <div class="absolute left-0 top-full mt-2 z-20 w-20 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <div class="p-1 space-y-0.5">
                    @for (size of [10, 20, 50, 100]; track size) {
                      <button
                        type="button"
                        (click)="seleccionarPageSize(size)"
                        class="w-full px-3 py-1.5 text-sm text-center rounded-lg transition-colors font-medium"
                        [class.bg-green-50]="pageSize() === size"
                        [class.text-green-700]="pageSize() === size"
                        [class.text-gray-600]="pageSize() !== size"
                        [class.hover:bg-gray-50]="pageSize() !== size">
                        {{ size }}
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
          @if (idProductoFiltro()) {
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#39A900]/10 text-[#2d8000] border border-[#39A900]/20">
              Filtrando por producto
              <button (click)="quitarFiltroProducto()" class="hover:text-red-600" title="Quitar filtro">×</button>
            </span>
          }
        </div>

        <p class="text-[11px] text-gray-400 mb-2">
          <span class="font-semibold">Disponible</span> y <span class="font-semibold">Total</span> son efectivos:
          los <span class="font-semibold">devolutivos</span> se cuentan por unidad; los <span class="font-semibold">consumibles / perecederos</span>, por el saldo de sus lotes.
        </p>

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
                  <th class="px-3 py-3 text-right font-semibold">Por vencer</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (r of paginadas(); track r.id_producto + '·' + r.id_sitio) {
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
                    <td class="px-3 py-3 text-right font-semibold" [class.text-green-700]="dispEfectiva(r) > 0" [class.text-gray-300]="dispEfectiva(r) === 0">{{ dispEfectiva(r) }}</td>
                    @if (esDevolutivo(r)) {
                      <td class="px-3 py-3 text-right" [class.text-blue-700]="r.prestados > 0" [class.text-gray-300]="r.prestados === 0">{{ r.prestados }}</td>
                      <td class="px-3 py-3 text-right" [class.text-amber-700]="r.mantenimiento > 0" [class.text-gray-300]="r.mantenimiento === 0">{{ r.mantenimiento }}</td>
                      <td class="px-3 py-3 text-right" [class.text-red-700]="(r.danados + r.perdidos) > 0" [class.text-gray-300]="(r.danados + r.perdidos) === 0">{{ r.danados + r.perdidos }}</td>
                    } @else {
                      <td class="px-3 py-3 text-right text-gray-300">—</td>
                      <td class="px-3 py-3 text-right text-gray-300">—</td>
                      <td class="px-3 py-3 text-right text-gray-300">—</td>
                    }
                    <td class="px-3 py-3 text-right text-gray-700">{{ totalEfectivo(r) }}</td>
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

            @if (totalPaginas() > 1) {
              <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
                <span>{{ filtradas().length }} producto(s) · página {{ paginaActual() }} de {{ totalPaginas() }}</span>
                <div class="flex gap-1.5">
                  <button (click)="irPagina(paginaActual() - 1)" [disabled]="paginaActual() <= 1"
                    class="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">Anterior</button>
                  <button (click)="irPagina(paginaActual() + 1)" [disabled]="paginaActual() >= totalPaginas()"
                    class="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">Siguiente</button>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class MaterialesExistenciasComponent implements OnInit {
  filas = signal<ResumenExistencias[]>([]);
  loading = false;
  q = '';
  filtro = signal('');

  /** `?id_producto=` de la navegación cruzada — filtro exacto, independiente del buscador de texto. */
  idProductoFiltro = signal<string | null>(null);

  /** Paginación client-side (los datos ya llegan completos del backend). */
  readonly porPagina = 25;
  pagina = signal(1);

  esDevolutivo = (r: ResumenExistencias): boolean => r.tipo_material === 'DEVOLUTIVO';
  dispEfectiva = (r: ResumenExistencias): number => (this.esDevolutivo(r) ? r.disponibles : r.lote_disponible);
  totalEfectivo = (r: ResumenExistencias): number => (this.esDevolutivo(r) ? r.total : r.lote_total);

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

  totalPaginas = computed(() => Math.max(1, Math.ceil(this.filtradas().length / this.porPagina)));

  /** `pagina()` acotada a [1, totalPaginas] — evita quedar en una página que ya
   *  no existe tras achicar el resultado con el buscador. */
  paginaActual = computed(() => Math.min(Math.max(1, this.pagina()), this.totalPaginas()));

  paginadas = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.porPagina;
    return this.filtradas().slice(inicio, inicio + this.porPagina);
  });

  tot = computed(() =>
    this.filas().reduce(
      (a, r) => ({
        total: a.total + this.totalEfectivo(r),
        disponibles: a.disponibles + this.dispEfectiva(r),
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

  /** Al buscar, volver a la primera página. */
  onBuscar(v: string): void {
    this.filtro.set(v);
    this.pagina.set(1);
  }

  irPagina(n: number): void {
    this.pagina.set(Math.min(Math.max(1, n), this.totalPaginas()));
  }

  ngOnInit(): void {
    this.idProductoFiltro.set(this.route.snapshot.queryParamMap.get('id_producto'));
    this.cargar();
  }

  quitarFiltroProducto(): void {
    this.idProductoFiltro.set(null);
    this.pagina.set(1);
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
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
