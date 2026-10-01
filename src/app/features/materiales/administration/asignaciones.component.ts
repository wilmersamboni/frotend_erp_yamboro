import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService, mensajeDeError } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { ErpCatalogoService } from '../../schedules/data-access/erp-catalogo.service';
import { HorariosApiService } from '../../schedules/data-access/horarios-api.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { DateInputComponent } from '../../../shared/components/date-input.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { TuiDayCache } from '../../../shared/utils/tui-day.util';
import type { TuiDay } from '@taiga-ui/cdk';
import { Asignacion, CreateAsignacionDto, EstadoAsignacion, MaterialesApiService, Producto, Sitio } from '../data-access/materiales-api.service';
import { ElegirPlacasAsignacionModalComponent } from '../ui/elegir-placas-asignacion-modal.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { EsperaDirective } from '../../../shared/directives/espera.directive';
import { PageSizeSelectComponent } from '../../../shared/components/page-size-select.component';
import { TableFilterComponent } from '../../../shared/components/table-filter.component';
import { CargasSecundarias } from '../data-access/cargas-secundarias';
import { AvisoCargasComponent } from '../ui/aviso-cargas.component';
import { MaterialesScreenPolicy } from '../ui/materiales-screen-policy';

interface LineaAsignacionForm{
  id_producto:string;
  cantidad:number
}

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
 * restaura el stock).
 *
 * Gating de botones: solo admin (ver nota en Novedades/Traslados/
 * Solicitudes — responsable-de-sitio queda pendiente).
 */
@Component({
  selector: 'app-materiales-asignaciones',
  standalone: true,
  imports: [AvisoCargasComponent, EsperaDirective, DialogDirective, AlertComponent, EmptyStateComponent, FormsModule, DatePipe, StatusBadgeComponent, DateInputComponent, SearchableSelectComponent, ElegirPlacasAsignacionModalComponent, LoadingSkeletonComponent, PageSizeSelectComponent, TableFilterComponent],
  template: `
    <div class="p-6">
      <nav aria-label="Migas de pan" class="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <span>Materiales</span><span aria-hidden="true">/</span><span>Operación</span><span aria-hidden="true">/</span><span aria-current="page" class="font-semibold text-gray-800">Asignaciones</span>
      </nav>
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Asignaciones</h1>
        <button (click)="nuevo()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: var(--accent-brand)">
          + Nueva asignación
        </button>
      </div>

      <app-aviso-cargas [cargas]="secundarias" (reintentar)="recargar()" />

      @if (bodegasInactivas().length > 0) {
        <app-alert class="mb-4" variante="advertencia" [titulo]="bodegasInactivas().length === 1 ? 'Bodega inactiva' : 'Bodegas inactivas'">
          <strong>{{ bodegasInactivas().map(s => s.nombre).join(', ') }}</strong>
          — no se pueden gestionar sus productos, ítems, lotes, solicitudes ni traslados mientras estén así.
        </app-alert>
      }

      @if (loading) {
        <app-loading-skeleton variant="table" [rows]="6" [columns]="5" [showToolbar]="false" label="Cargando asignaciones" />
      } @else if (asignaciones.length === 0) {
        <app-empty-state titulo="No hay asignaciones registradas" />
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
              <input appEspera type="text" [(ngModel)]="filtroTexto" (ngModelChange)="page = 0"
                placeholder="Buscar por ficha o producto..."
                class="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900] focus:bg-white transition-all text-gray-900 placeholder:text-gray-400" />
              @if (filtroTexto) {
                <button aria-label="Limpiar búsqueda" (click)="filtroTexto = ''; page = 0" class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              }
            </div>
            <app-table-filter label="Estado" [options]="opcionesEstadoFiltro" [value]="filtroEstado"
              (valueChange)="seleccionarEstado($event)" />
            @if (false) {
            <div class="relative flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200" [class.z-40]="estadoDropdownOpen()">
              <button type="button" (click)="estadoDropdownOpen.update(v => !v)" class="absolute inset-0 z-0 rounded-xl cursor-pointer" aria-label="Estado de asignación"></button>
              <span class="pointer-events-none relative z-10 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</span>

              <!-- Dropdown personalizado para estado -->
              <div class="relative z-20 pointer-events-none">
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
                  <div class="absolute left-0 top-full mt-2 z-20 w-40 pointer-events-auto rounded-xl border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100" style="background-color: var(--surface); border-color: var(--border);">
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
            }
            <app-page-size-select [value]="pageSize()" (valueChange)="seleccionarPageSize($event)" />
          </div>

          @if (asignacionesFiltradas.length === 0) {
            <app-empty-state titulo="Sin resultados para estos filtros" variante="busqueda" />
          } @else {
          <div class="space-y-3 p-3 md:hidden">
            @for (a of asignacionesPaginadas; track a.id_asignacion) {
              <article class="rounded-xl border border-gray-200 p-3 text-sm">
                <div class="flex items-start justify-between gap-3"><strong class="text-gray-800">{{ nombreFicha(a) }}</strong><app-status-badge [value]="a.estado" /></div>
                <p class="mt-2 text-gray-700">{{ descripcionLineas(a) }}</p>
                <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt class="text-gray-500">Cantidad</dt><dd class="text-right">{{ a.cantidad }}</dd><dt class="text-gray-500">Fecha</dt><dd class="text-right">{{ a.fecha_asignacion | date: 'short' }}</dd></dl>
                <div class="mt-3 flex flex-wrap justify-end gap-2">
                  <button (click)="toggleUbicacion(a)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600">Ambiente</button>
                  @if (a.estado === 'ACTIVA' && puedeAnular) { <button (click)="anular(a)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-amber-200 text-amber-700">Anular</button> }
                </div>
                @if (filaAbierta === a.id_asignacion) {
                  <p class="mt-2 text-xs text-gray-500">{{ ubicacionCargando.has(a.id_curso) ? 'Consultando ambiente...' : ((ubicacionesFicha.get(a.id_curso) ?? []).join(', ') || 'Esta ficha no tiene ambiente asignado.') }}</p>
                }
              </article>
            }
          </div>
          <div class="hidden overflow-x-auto md:block">
          <table class="w-full text-sm">
            <thead class="bg-gray-50/80 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Ficha</th>
                <th class="px-4 py-3 text-left font-semibold">Producto</th>
                <th class="px-4 py-3 text-left font-semibold">Cantidad</th>
                <th class="px-4 py-3 text-left font-semibold">Estado</th>
                <th class="px-4 py-3 text-left font-semibold">Fecha</th>
                <th class="px-4 py-3 text-center font-semibold">Ambiente</th>
                <th class="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (a of asignacionesPaginadas; track a.id_asignacion) {
                <tr class="hover:bg-gray-50/80 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ nombreFicha(a) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ descripcionLineas(a) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ a.cantidad }}</td>
                  <td class="px-4 py-3"><app-status-badge [value]="a.estado" /></td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ a.fecha_asignacion | date: 'short' }}</td>
                  <td class="px-4 py-3 text-center">
                    <button aria-label="Ver ambiente de la ficha" (click)="toggleUbicacion(a)" title="Ver ambiente de la ficha"
                      class="inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors"
                      [class.bg-green-50]="filaAbierta === a.id_asignacion"
                      [class.text-green-700]="filaAbierta === a.id_asignacion"
                      [class.text-gray-400]="filaAbierta !== a.id_asignacion"
                      [class.hover:bg-gray-100]="filaAbierta !== a.id_asignacion">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                    </button>
                  </td>
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
                @if (filaAbierta === a.id_asignacion) {
                  <tr class="bg-gray-50/60">
                    <td colspan="7" class="px-4 py-3">
                      @if (ubicacionCargando.has(a.id_curso)) {
                        <span class="text-xs text-gray-400">Consultando ambiente...</span>
                      } @else if ((ubicacionesFicha.get(a.id_curso) ?? []).length === 0) {
                        <span class="text-xs text-gray-400">Esta ficha no tiene ambiente asignado todavía.</span>
                      } @else {
                        @for (nombre of ubicacionesFicha.get(a.id_curso); track nombre) {
                          <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full mr-1.5"
                            style="background-color: color-mix(in srgb, var(--accent-brand) 10%, transparent); color: var(--accent-text);">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"/>
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            {{ nombre }}
                          </span>
                        }
                      }
                    </td>
                  </tr>
                }
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
                <button aria-label="Página anterior" (click)="page = page - 1" [disabled]="page === 0"
                  class="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-[#39A900] hover:text-white hover:border-[#39A900] disabled:opacity-30 disabled:pointer-events-none transition-all">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <span class="px-4 py-1.5 text-sm font-semibold text-[#39A900] bg-[#39A900]/10 rounded-lg border border-[#39A900]/20">{{ page + 1 }} / {{ totalPaginas }}</span>
                <button aria-label="Página siguiente" (click)="page = page + 1" [disabled]="page + 1 >= totalPaginas"
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
      <div appDialog class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarModal()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Nueva asignación</h2>
            <button aria-label="Cerrar" (click)="cerrarModal()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Ficha</label>
              <app-ss [options]="opcionesFicha" placeholder="Seleccioná una ficha…" [(ngModel)]="form['id_curso']"></app-ss>
            </div>

            <div>
  <div class="flex items-center justify-between mb-1.5">
    <label class="block text-xs font-medium text-gray-600">Productos a asignar</label>
    <button type="button" data-dirty (click)="agregarLineas()"
      class="text-xs font-medium text-[#39A900] hover:underline">
      + Agregar línea
    </button>
  </div>

  <div class="space-y-2">
    @for (linea of lineas; track $index) {
      <div class="flex gap-2 items-start">
        <div class="flex-1 min-w-0">
          <app-ss [options]="opcionesProductoLinea(linea)" placeholder="— Selecciona un producto —"
            [(ngModel)]="linea.id_producto" (ngModelChange)="onProductoLineaChange(linea)"></app-ss>
          @if (linea.id_producto) {
            <p class="text-xs mt-0.5"
              [class.text-red-500]="disponibleDe(linea) < linea.cantidad"
              [class.text-gray-400]="disponibleDe(linea) >= linea.cantidad">
              {{ disponibleDe(linea) }} disponible(s){{ disponibleDe(linea) < linea.cantidad ? ' — cantidad excede el stock' : '' }}
            </p>
          }
        </div>
        <input type="number" [(ngModel)]="linea.cantidad" min="1"
          class="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
        <button aria-label="Quitar" type="button" data-dirty (click)="quitarLineas($index)"
          class="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 text-lg leading-none">×</button>
      </div>
    }
  </div>
</div>

@if (bodegaDelProductoInactiva()) {
  <p class="text-amber-600 text-xs -mt-1">La bodega de algún producto elegido está inactiva — no se puede asignar mientras esté así.</p>
}


            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Fecha de devolución (opcional)</label>
              <app-date-input placeholder="DD/MM/AAAA" [min]="hoyTuiDay"
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
              [style.opacity]="(saving || !puedeGuardar()) ? 0.6 : 1"
              [style.cursor]="(saving || !puedeGuardar()) ? 'not-allowed' : 'pointer'"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg transition-colors"
              style="background-color: var(--accent-brand)">
              {{ saving ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
      
    }
    <app-elegir-placas-asignacion-modal
  [abierto]="elegirPlacasOpen"
  [lineas]="lineasParaElegirPlacas"
  (cerrado)="elegirPlacasOpen = false"
  (confirmado)="confirmarCreacionAsignacion($event)">
</app-elegir-placas-asignacion-modal>
  `,
})
export class MaterialesAsignacionesComponent implements OnInit {
  /** Catálogos auxiliares de la pantalla: si uno falla se avisa, no se muestra vacío. */
  readonly secundarias = new CargasSecundarias();
  readonly recargar = (): void => void this.cargar();
  private readonly acceso = inject(MaterialesScreenPolicy);
  private readonly confirm = inject(ConfirmService);

  asignaciones: Asignacion[] = [];
  productos: Producto[] = [];
  sitios: Sitio[] = [];
  fichas: Ficha[] = [];

  get opcionesFicha() {
    return this.fichas.map((f) => ({ value: f.idCurso, label: `${f.codigo}${f.programa ? ' — ' + f.programa : ''}` }));
  }
  /** Solo DEVOLUTIVO: una asignación a ficha presta activos con placa que
   *  luego vuelven. Un consumible se saca por solicitud, no se asigna. */
  get productosAsignables(): Producto[] {
    return this.productos.filter((p) => p.tipo_material === 'DEVOLUTIVO');
  }
  get opcionesProducto() {
    return this.productosAsignables.map((p) => ({ value: p.id_producto, label: p.nombre }));
  }

  loading = false;
  saving = false;
  error: string | null = null;

  // ── Filtros y paginación de la tabla (client-side) ──────────────────
  filtroTexto = '';
  filtroEstado: EstadoAsignacion | '' = '';
  pageSize = signal(20);
  readonly opcionesEstadoFiltro = [
    { value: '', label: 'Todos' },
    ...(['ACTIVA', 'DEVUELTA', 'ANULADA'] as EstadoAsignacion[]).map((estado) => ({ value: estado, label: estado })),
  ];
  /** Solo sostiene el bloque legado inactivo durante la migración a TableFilter. */
  estadoDropdownOpen = signal(false);
  page = 0;
  readonly estadosAsignacion: EstadoAsignacion[] = ['ACTIVA', 'DEVUELTA', 'ANULADA'];

  seleccionarPageSize(size: number): void {
    this.pageSize.set(size);
    this.page = 0;
  }

  seleccionarEstado(valor: string): void {
    this.filtroEstado = valor as EstadoAsignacion | '';
    this.page = 0;
  }

  get asignacionesFiltradas(): Asignacion[] {
    const q = this.filtroTexto.trim().toLowerCase();
    return this.asignaciones.filter((a) => {
      if (this.filtroEstado && a.estado !== this.filtroEstado) return false;
      if (!q) return true;
      return this.nombreFicha(a).toLowerCase().includes(q) ||
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

  // ── Ambiente de la ficha (consulta bajo demanda a Horarios) ─────────
  ambientes: { id: string; nombre: string }[] = [];
  filaAbierta: string | null = null;
  ubicacionesFicha = new Map<string, string[]>();
  ubicacionCargando = new Set<string>();

  modalOpen = false;
  form: Record<string, any> = {};
  readonly cacheFechaDevolucion = new TuiDayCache();
  /** Mínimo del calendario: hoy en hora LOCAL (el backend rechaza fechas pasadas con el mismo criterio). */
  readonly hoyTuiDay = (() => {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return TuiDayCache.fromIso(`${d.getFullYear()}-${mes}-${dia}`);
  })();
  elegirPlacasOpen = false;
  lineasParaElegirPlacas: { id_producto: string; nombre: string; cantidad: number }[] = [];

  /** <app-date-input> trabaja con TuiDay; el resto del componente sigue en 'yyyy-MM-dd'. */
  tuiDayToIso(day: TuiDay | null): string {
    return TuiDayCache.toIso(day);
  }

  /** Stock del producto elegido — consultado en vivo, mismo endpoint que ya usa el módulo hermano SGM. */
  lineas:LineaAsignacionForm[]=[];
  stockProd: Record<string, {disponibles:number, total:number}>= {}
  agregarLineas():void{
    this.lineas.push({id_producto: '', cantidad:1})
  }
  quitarLineas(i:number):void{
    this.lineas.splice(i, 1);
    if(this.lineas.length === 0 ) this.lineas.push({id_producto:'', cantidad:1})
  }


  disponibleDe(linea:LineaAsignacionForm):number{
    if(!linea.id_producto) return 0
    return this.stockProd[linea.id_producto]?.disponibles ?? 0;
  }

  async onProductoLineaChange(linea:LineaAsignacionForm):Promise<void>{
    if(!linea.id_producto || this.stockProd[linea.id_producto]) return;

    try {
      this.stockProd[linea.id_producto] = await this.api.stockProducto(linea.id_producto)
    } catch (error) {
      this.stockProd[linea.id_producto] = {disponibles:0, total:0}
    }
  }

  opcionesProductoLinea(linea:LineaAsignacionForm){
    const usados = new Set(
      this.lineas.filter((l)=> l !== linea).map((l)=> l.id_producto).filter(Boolean),
    )

    return this.productosAsignables.filter((p)=> !usados.has(p.id_producto)).map((p)=> ({value:p.id_producto, label:p.nombre}))
  }

  
  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private erpCatalogo: ErpCatalogoService,
    private horariosApi: HorariosApiService,
  ) {}

  /** Gateado por servicio, no por cargo — ver plan "Ronda 3". */
  get puedeAnular(): boolean {
    return this.auth.tieneServicio('materiales.asignaciones.anular');
  }

  ngOnInit(): void {
    this.cargar();
  }



  puedeGuardar(): boolean {
    if (!this.form['id_curso'] || this.lineas.length === 0) return false;
    if (this.bodegaDelProductoInactiva()) return false;

    return this.lineas.every((l)=>{
      if(!l.id_producto) return false;
      const cantidad= Number(l.cantidad) || 0;
      const disponibles = this.disponibleDe(l);
      return cantidad >= 1 && cantidad <= disponibles
    })
  }

  /** La bodega del producto elegido ya no acepta asignaciones nuevas (ver
   *  plan 2026-09-18) — el backend rechazaría la creación igual. */
  /** Banner general de la pantalla — lista todas las bodegas inactivas del
   *  tenant (ver plan 2026-09-18). */
  bodegasInactivas(): Sitio[] {
    return this.sitios.filter((s) => !s.estado);
  }

  bodegaDelProductoInactiva(): boolean {
    return this.lineas.some((l)=>{
      
      if (!l.id_producto) return false;
      const idSitio = this.productos.find((p) => p.id_producto === l.id_producto)?.id_sitio;
      if (!idSitio) return false;
      return this.sitios.find((s) => s.id_sitio === idSitio)?.estado === false;
    })
    
  }

  /**
   * Prefiere `a.ficha_codigo`/`ficha_programa` (resueltos por el backend vía
   * SQL directo a `cursos`, sin recorte de RLS) sobre `this.fichas` (viene de
   * `GET /api/cursos`, recortado a "mis cursos" — no incluye la ficha de una
   * asignación ajena, ej. la de otro instructor que un líder de área está
   * viendo). Cae al lookup local solo para asignaciones creadas antes de este
   * fix (respuesta vieja en caché) o si el backend no pudo resolverla.
   */
  nombreFicha(a: { id_curso: string; ficha_codigo?: string | null; ficha_programa?: string | null }): string {
    if (a.ficha_codigo) return `${a.ficha_codigo}${a.ficha_programa ? ' — ' + a.ficha_programa : ''}`;
    const f = this.fichas.find((x) => x.idCurso === a.id_curso);
    return f ? `${f.codigo}${f.programa ? ' — ' + f.programa : ''}` : 'Ficha no disponible';
  }

  descripcionLineas(a: Asignacion): string {
    if(a.lineas && a.lineas.length > 0){
      return a.lineas.map((l)=>`${l.producto_nombre ?? 'Producto'} (x${l.cantidad})`).join(', ')
    }
    return a.producto?.nombre ?? '-'
  }

  /** Resumen corto para diálogos: los primeros `max` productos y "y N más". */
  resumenLineas(a: Asignacion, max = 2): string {
    const ls = a.lineas ?? [];
    if (ls.length === 0) return a.producto?.nombre ?? 'sin productos';
    const vistos = ls
      .slice(0, max)
      .map((l) => `${l.producto_nombre ?? 'Producto'} (x${l.cantidad})`)
      .join(', ');
    return ls.length > max ? `${vistos} y ${ls.length - max} más` : vistos;
  }

  /**
   * El ambiente de una ficha no vive en Materiales — solo en Horarios
   * (AsignacionHorario: ficha + ambiente + día/jornada). Se consulta bajo
   * demanda (no en cada carga de la tabla) y se cachea por ficha, ya que
   * varias asignaciones de materiales pueden compartir la misma ficha.
   * Se ignoran los registros "transversales" (instructor sin ambiente fijo,
   * ver ubicacionTransversalId en el backend) — solo interesa el ambiente
   * real de la ficha, si lo tiene.
   */
  async toggleUbicacion(a: Asignacion): Promise<void> {
    if (this.filaAbierta === a.id_asignacion) {
      this.filaAbierta = null;
      return;
    }
    this.filaAbierta = a.id_asignacion;
    if (this.ubicacionesFicha.has(a.id_curso)) return;

    this.ubicacionCargando.add(a.id_curso);
    try {
      const horarios = await this.horariosApi.getHorariosByFicha(a.id_curso);
      const nombres = new Set<string>();
      for (const h of horarios ?? []) {
        if (!h.ambienteId) continue;
        const ambiente = this.ambientes.find((amb) => amb.id === h.ambienteId);
        nombres.add(ambiente?.nombre ?? 'Ambiente no disponible');
      }
      this.ubicacionesFicha.set(a.id_curso, [...nombres]);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo consultar el ambiente de la ficha.');
      this.ubicacionesFicha.set(a.id_curso, []);
    } finally {
      this.ubicacionCargando.delete(a.id_curso);
    }
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    this.secundarias.reiniciar();
    try {
      const [asignaciones, productos, sitios, fichasRaw, ambientes] = await Promise.all([
        this.api.listarAsignaciones(),
        this.api.listarProductos(),
        this.secundarias.cargar('bodegas', () => this.api.listarSitios(), this.acceso.puedeListar('sitios')),
        this.erpCatalogo.getFichas(),
        this.erpCatalogo.getAmbientes(),
      ]);
      this.asignaciones = asignaciones;
      this.productos = productos;
      this.sitios = sitios;
      this.fichas = fichasRaw.map((f: any) => ({ idCurso: f.idCurso, codigo: f.codigo, programa: f.programa }));
      this.ambientes = ambientes;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las asignaciones.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (this.productosAsignables.length === 0 || this.fichas.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un producto devolutivo y una ficha para crear una asignación.');
      return;
    }
    this.form = {
      id_curso: this.fichas[0].idCurso,
      //id_producto: this.productosAsignables[0].id_producto,
      //cantidad: 1,
      fecha_devolucion: '',
      observacion: '',
    };
    this.error = null;
    this.modalOpen = true;
    this.lineas = [{ id_producto: '', cantidad: 1 }];

    //this.onProductoChange(this.form['id_producto']);
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(): Promise<void> {
    // Doble chequeo — no alcanza con deshabilitar el botón, ver Fase 1 del plan.
    if (!this.puedeGuardar()) {
      this.error = this.bodegaDelProductoInactiva()
        ? 'La bodega de este producto está inactiva — no se puede asignar.'
        : 'Revisa las lineas: cada una necesita un producto y una cantidad dentro del stock disponible.'
        
      return;
    }
    this.error = null;
    this.lineasParaElegirPlacas = this.lineas.map((l)=>({
      id_producto: l.id_producto,
      nombre: this.productosAsignables.find((p)=> p.id_producto === l.id_producto)?.nombre ?? 'Producto',
      cantidad:Number(l.cantidad) || 1
    }))
    this.elegirPlacasOpen = true
  }

  async confirmarCreacionAsignacion(seleccion: { id_producto: string; id_items: string[] }[] | undefined): Promise<void> {
  this.elegirPlacasOpen = false;
  this.saving = true;
  this.error = null;
  try {
    const dto: CreateAsignacionDto = {
      id_curso: this.form['id_curso'],
      lineas: this.lineas.map((l) => ({
        id_producto: l.id_producto,
        cantidad: Number(l.cantidad) || 1,
        id_items: seleccion?.find((s) => s.id_producto === l.id_producto)?.id_items,
      })),
      observacion: this.form['observacion'] || undefined,
      fecha_devolucion: this.form['fecha_devolucion'] || undefined,
    };
    await this.api.crearAsignacion(dto);
    this.toast.ok('Asignación creada');
    this.modalOpen = false;
    await this.cargar();
  } catch (e: any) {
    this.error = mensajeDeError(e, 'No se pudo crear la asignación.');
  } finally {
    this.saving = false;
  }
}
  

  async anular(a: Asignacion): Promise<void> {
    const msg = `¿Anular la asignación de ${this.resumenLineas(a)} a la ficha ${this.nombreFicha(a)}? Los ítems que sigan prestados volverán al inventario.`;
    if (!(await this.confirm.ask(msg))) return;
    try {
      await this.api.anularAsignacion(a.id_asignacion);
      this.toast.ok('Asignación anulada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo anular la asignación.');
    }
  }

}
