import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { DateInputComponent } from '../../../shared/components/date-input.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { TuiDayCache } from '../../../shared/utils/tui-day.util';
import type { TuiDay } from '@taiga-ui/cdk';
import { Asignacion, CreateAsignacionDto, EstadoAsignacion, MaterialesApiService, Producto } from '../../../core/services/materiales/materiales-api.service';

interface Ficha {
  idCurso: string;
  codigo: string;
  programa: string;
}

/**
 * Asignación de material devolutivo a una ficha (préstamo de mediano plazo,
 * distinto de Solicitudes que es un préstamo puntual a una persona). Sin
 * doble confirmación ni aprobación — el admin la crea directamente y el
 * backend descuenta stock (marca ítems DISPONIBLE→PRESTADO) automáticamente
 * según la cantidad pedida. Solo dos estados: ACTIVA → ANULADA (terminal,
 * restaura el stock). No hay selección de ítems específicos en este v1
 * (el backend lo soporta vía `id_items`, pero se deja fuera para no
 * complicar el formulario — mismo criterio que se usó para simplificar
 * Traslados/Solicitudes).
 *
 * Gating de botones: solo admin (ver nota en Novedades/Traslados/
 * Solicitudes — responsable-de-sitio queda pendiente).
 */
@Component({
  selector: 'app-materiales-asignaciones',
  standalone: true,
  imports: [FormsModule, DatePipe, StatusBadgeComponent, DateInputComponent, SearchableSelectComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Asignaciones</h1>
        <button (click)="nuevo()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Nueva asignación
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (asignaciones.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay asignaciones registradas</p>
      } @else {
        <div class="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <!-- Toolbar: búsqueda + filtro de estado + filas por página -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <div class="relative flex-1 max-w-sm">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>
              <input type="text" [(ngModel)]="filtroTexto" (ngModelChange)="page = 0"
                placeholder="Buscar por ficha o producto..."
                class="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900] focus:bg-white transition-all text-gray-900 placeholder:text-gray-400" />
              @if (filtroTexto) {
                <button (click)="filtroTexto = ''; page = 0" class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              }
            </div>
            <div class="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</span>

              <!-- Dropdown personalizado para estado -->
              <div class="relative">
                <button
                  type="button"
                  (click)="estadoDropdownOpen.update(v => !v)"
                  class="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-transparent focus:outline-none cursor-pointer">
                  <span>{{ filtroEstado || 'Todos' }}</span>
                  <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200" [class.rotate-180]="estadoDropdownOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                @if (estadoDropdownOpen()) {
                  <!-- Backdrop para cerrar al hacer clic afuera -->
                  <div class="fixed inset-0 z-10" (click)="estadoDropdownOpen.set(false)"></div>

                  <!-- Menú flotante -->
                  <div class="absolute left-0 top-full mt-2 z-20 w-40 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div class="p-1 space-y-0.5 max-h-64 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <button
                        type="button"
                        (click)="seleccionarEstado('')"
                        class="w-full px-3 py-1.5 text-sm text-left rounded-lg transition-colors font-medium"
                        [class.bg-green-50]="filtroEstado === ''"
                        [class.text-green-700]="filtroEstado === ''"
                        [class.text-gray-600]="filtroEstado !== ''"
                        [class.hover:bg-gray-50]="filtroEstado !== ''">
                        Todos
                      </button>
                      @for (e of estadosAsignacion; track e) {
                        <button
                          type="button"
                          (click)="seleccionarEstado(e)"
                          class="w-full px-3 py-1.5 text-sm text-left rounded-lg transition-colors font-medium"
                          [class.bg-green-50]="filtroEstado === e"
                          [class.text-green-700]="filtroEstado === e"
                          [class.text-gray-600]="filtroEstado !== e"
                          [class.hover:bg-gray-50]="filtroEstado !== e">
                          {{ e }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
            <!-- Filas por página -->
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
          </div>

          @if (asignacionesFiltradas.length === 0) {
            <p class="text-center text-gray-400 text-sm py-10">Sin resultados para estos filtros</p>
          } @else {
          <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50/80 text-gray-500 text-[11px] uppercase tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Ficha</th>
                <th class="px-4 py-3 text-left font-semibold">Producto</th>
                <th class="px-4 py-3 text-left font-semibold">Cantidad</th>
                <th class="px-4 py-3 text-left font-semibold">Estado</th>
                <th class="px-4 py-3 text-left font-semibold">Fecha</th>
                <th class="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (a of asignacionesPaginadas; track a.id_asignacion) {
                <tr class="hover:bg-gray-50/80 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ nombreFicha(a.id_curso) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ a.producto?.nombre ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ a.cantidad }}</td>
                  <td class="px-4 py-3"><app-status-badge [value]="a.estado" /></td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ a.fecha_asignacion | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-2">
                      @if (a.estado === 'ACTIVA' && puedeAnular) {
                        <button (click)="anular(a)"
                          class="px-3 py-1.5 rounded-full text-xs font-semibold border border-amber-200 text-amber-600 bg-white hover:bg-amber-50 transition-colors">
                          Anular
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          </div>

          @if (asignacionesFiltradas.length > pageSize()) {
            <div class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
              <span class="text-sm text-gray-500">
                Mostrando <strong class="text-gray-800">{{ asignacionesPaginadas.length }}</strong>
                de <strong class="text-gray-800">{{ asignacionesFiltradas.length }}</strong> registros
              </span>
              <div class="flex items-center gap-2">
                <button (click)="page = page - 1" [disabled]="page === 0"
                  class="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-[#39A900] hover:text-white hover:border-[#39A900] disabled:opacity-30 disabled:pointer-events-none transition-all">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <span class="px-4 py-1.5 text-sm font-semibold text-[#39A900] bg-[#39A900]/10 rounded-lg border border-[#39A900]/20">{{ page + 1 }} / {{ totalPaginas }}</span>
                <button (click)="page = page + 1" [disabled]="page + 1 >= totalPaginas"
                  class="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-[#39A900] hover:text-white hover:border-[#39A900] disabled:opacity-30 disabled:pointer-events-none transition-all">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>
          }
          }
        </div>
      }
    </div>

    @if (modalOpen) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarModal()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Nueva asignación</h2>
            <button (click)="cerrarModal()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Ficha</label>
              <app-ss [options]="opcionesFicha" placeholder="Seleccioná una ficha…" [(ngModel)]="form['id_curso']"></app-ss>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Producto</label>
              <app-ss [options]="opcionesProducto" placeholder="Seleccioná un producto…"
                [(ngModel)]="form['id_producto']" (ngModelChange)="onProductoChange($event)"></app-ss>
            </div>

            <!-- Panel de stock: mismo criterio que el módulo hermano SGM (frontend-proyecto) -->
            <div class="rounded-lg border px-3 py-2 text-xs"
              [class.border-gray-100]="stock.cargando"
              [class.bg-gray-50]="stock.cargando"
              [class.border-red-200]="!stock.cargando && stock.disponibles === 0"
              [class.bg-red-50]="!stock.cargando && stock.disponibles === 0"
              [class.border-amber-200]="!stock.cargando && stock.disponibles > 0 && stock.disponibles <= 3"
              [class.bg-amber-50]="!stock.cargando && stock.disponibles > 0 && stock.disponibles <= 3"
              [class.border-green-200]="!stock.cargando && stock.disponibles > 3"
              [class.bg-green-50]="!stock.cargando && stock.disponibles > 3">
              @if (stock.cargando) {
                <span class="text-gray-400">Consultando stock...</span>
              } @else if (stock.disponibles === 0) {
                <span class="text-red-600 font-medium">Sin unidades disponibles ({{ stock.total }} en total)</span>
              } @else if (stock.disponibles <= 3) {
                <span class="text-amber-700 font-medium">Stock bajo: {{ stock.disponibles }} disponible(s)</span>
                <span class="text-gray-500"> de {{ stock.total }}</span>
              } @else {
                <span class="text-green-700 font-medium">{{ stock.disponibles }} disponible(s)</span>
                <span class="text-gray-500"> de {{ stock.total }} unidad(es) totales</span>
              }
            </div>
            @if (!stock.cargando && form['cantidad'] > stock.disponibles) {
              <p class="text-red-500 text-xs -mt-1">No podés asignar más de las {{ stock.disponibles }} unidad(es) disponibles.</p>
            }

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
              <input type="number" [(ngModel)]="form['cantidad']" min="1" [max]="stock.disponibles || 1"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Fecha de devolución (opcional)</label>
              <app-date-input placeholder="DD/MM/AAAA"
                [ngModel]="cacheFechaDevolucion.get(form['fecha_devolucion'])"
                (ngModelChange)="form['fecha_devolucion'] = tuiDayToIso($event)"></app-date-input>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Observación (opcional)</label>
              <input type="text" [(ngModel)]="form['observacion']"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
            </div>
          </div>

          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarModal()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardar()" [disabled]="saving || !puedeGuardar()"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ saving ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialesAsignacionesComponent implements OnInit {
  private readonly confirm = inject(ConfirmService);

  asignaciones: Asignacion[] = [];
  productos: Producto[] = [];
  fichas: Ficha[] = [];

  get opcionesFicha() {
    return this.fichas.map((f) => ({ value: f.idCurso, label: `${f.codigo}${f.programa ? ' — ' + f.programa : ''}` }));
  }
  get opcionesProducto() {
    return this.productos.map((p) => ({ value: p.id_producto, label: p.nombre }));
  }

  loading = false;
  saving = false;
  error: string | null = null;

  // ── Filtros y paginación de la tabla (client-side) ──────────────────
  filtroTexto = '';
  filtroEstado: EstadoAsignacion | '' = '';
  pageSize = signal(20);
  pageSizeDropdownOpen = signal(false);
  estadoDropdownOpen = signal(false);
  page = 0;
  readonly estadosAsignacion: EstadoAsignacion[] = ['ACTIVA', 'ANULADA'];

  seleccionarPageSize(size: number): void {
    this.pageSize.set(size);
    this.page = 0;
    this.pageSizeDropdownOpen.set(false);
  }

  seleccionarEstado(valor: EstadoAsignacion | ''): void {
    this.filtroEstado = valor;
    this.page = 0;
    this.estadoDropdownOpen.set(false);
  }

  get asignacionesFiltradas(): Asignacion[] {
    const q = this.filtroTexto.trim().toLowerCase();
    return this.asignaciones.filter((a) => {
      if (this.filtroEstado && a.estado !== this.filtroEstado) return false;
      if (!q) return true;
      return this.nombreFicha(a.id_curso).toLowerCase().includes(q) ||
        (a.producto?.nombre?.toLowerCase().includes(q) ?? false);
    });
  }
  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.asignacionesFiltradas.length / this.pageSize()));
  }
  get asignacionesPaginadas(): Asignacion[] {
    const start = this.page * this.pageSize();
    return this.asignacionesFiltradas.slice(start, start + this.pageSize());
  }

  modalOpen = false;
  form: Record<string, any> = {};
  readonly cacheFechaDevolucion = new TuiDayCache();

  /** <app-date-input> trabaja con TuiDay; el resto del componente sigue en 'yyyy-MM-dd'. */
  tuiDayToIso(day: TuiDay | null): string {
    return TuiDayCache.toIso(day);
  }

  /** Stock del producto elegido — consultado en vivo, mismo endpoint que ya usa el módulo hermano SGM. */
  stock: { disponibles: number; total: number; cargando: boolean } = { disponibles: 0, total: 0, cargando: false };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private erpCatalogo: ErpCatalogoService,
  ) {}

  /** Gateado por servicio, no por cargo — ver plan "Ronda 3". */
  get puedeAnular(): boolean {
    return this.auth.tieneServicio('materiales.asignaciones.anular');
  }

  ngOnInit(): void {
    this.cargar();
  }

  async onProductoChange(idProducto: string): Promise<void> {
    const id = idProducto;
    if (!id) { this.stock = { disponibles: 0, total: 0, cargando: false }; return; }
    this.stock = { disponibles: 0, total: 0, cargando: true };
    try {
      const { disponibles, total } = await this.api.stockProducto(id);
      this.stock = { disponibles, total, cargando: false };
    } catch {
      this.stock = { disponibles: 0, total: 0, cargando: false };
    }
  }

  puedeGuardar(): boolean {
    const cantidad = Number(this.form['cantidad']) || 0;
    return !!this.form['id_curso'] && !!this.form['id_producto'] && cantidad >= 1 && !this.stock.cargando &&
      this.stock.disponibles > 0 && cantidad <= this.stock.disponibles;
  }

  nombreFicha(idCurso: string): string {
    const f = this.fichas.find((x) => x.idCurso === idCurso);
    return f ? `${f.codigo}${f.programa ? ' — ' + f.programa : ''}` : idCurso.slice(0, 8) + '…';
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [asignaciones, productos, fichasRaw] = await Promise.all([
        this.api.listarAsignaciones(),
        this.api.listarProductos(),
        this.erpCatalogo.getFichas(),
      ]);
      this.asignaciones = asignaciones;
      this.productos = productos;
      this.fichas = fichasRaw.map((f: any) => ({ idCurso: f.idCurso, codigo: f.codigo, programa: f.programa }));
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las asignaciones.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (this.productos.length === 0 || this.fichas.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un producto y una ficha para crear una asignación.');
      return;
    }
    this.form = {
      id_curso: this.fichas[0].idCurso,
      id_producto: this.productos[0].id_producto,
      cantidad: 1,
      fecha_devolucion: '',
      observacion: '',
    };
    this.error = null;
    this.modalOpen = true;
    this.onProductoChange(this.form['id_producto']);
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(): Promise<void> {
    // Doble chequeo — no alcanza con deshabilitar el botón, ver Fase 1 del plan.
    if (!this.puedeGuardar()) {
      this.error = this.stock.disponibles === 0
        ? 'Ese producto no tiene unidades disponibles.'
        : 'La cantidad supera el stock disponible.';
      return;
    }
    this.saving = true;
    this.error = null;
    try {
      const dto: CreateAsignacionDto = {
        id_curso: this.form['id_curso'],
        id_producto: this.form['id_producto'],
        cantidad: Number(this.form['cantidad']) || 1,
        observacion: this.form['observacion'] || undefined,
        fecha_devolucion: this.form['fecha_devolucion'] || undefined,
      };
      await this.api.crearAsignacion(dto);
      this.toast.ok('Asignación creada');
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear la asignación.';
    } finally {
      this.saving = false;
    }
  }

  async anular(a: Asignacion): Promise<void> {
    if (!(await this.confirm.ask(`¿Anular la asignación #${a.id_asignacion}? El stock de los ítems prestados se restaurará.`))) return;
    try {
      await this.api.anularAsignacion(a.id_asignacion);
      this.toast.ok('Asignación anulada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo anular la asignación.');
    }
  }

}
