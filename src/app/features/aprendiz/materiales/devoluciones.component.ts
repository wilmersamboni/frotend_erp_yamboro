import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import {
  CreateDevolucionDto,
  Devolucion,
  EstadoDevolucion,
  Item,
  ItemPendienteDevolucion,
  MaterialesApiService,
  Solicitud,
} from '../../../core/services/materiales/materiales-api.service';

const ESTADOS_DEVOLUCION: { value: EstadoDevolucion; label: string; desc: string }[] = [
  { value: 'BUENO', label: 'Bueno', desc: 'Sin daños visibles' },
  { value: 'REGULAR', label: 'Regular', desc: 'Desgaste normal de uso' },
  { value: 'DAÑADO', label: 'Dañado', desc: 'Requiere reparación' },
  { value: 'PERDIDO', label: 'Perdido', desc: 'No fue devuelto' },
];

interface FilaDevolucion extends ItemPendienteDevolucion {
  estadoDev: EstadoDevolucion;
}

/**
 * Registro de devoluciones para aprendiz — copia casi literal de
 * `features/instructor/materiales/devoluciones.component.ts` (M10a — devolución
 * por unidad). La ruta `aprendiz/materiales/devoluciones` exige
 * `serviciosRequeridos: ['materiales.devoluciones.ver']`, que NO está en
 * `MATERIALES_APRENDIZ` por defecto → solo llega acá un **aprendiz encargado
 * de bodega** (con el bundle B3 otorgado al hacerlo `sitio.id_responsable`).
 * Ve los préstamos de SU bodega vía `findForResponsable`. Ver docblock de la
 * versión admin para el detalle del flujo.
 */
@Component({
  selector: 'app-aprendiz-materiales-devoluciones',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Devoluciones</h1>
        <button (click)="abrirCrear()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Registrar devolución
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (devoluciones.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay devoluciones registradas</p>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Producto</th>
                <th class="px-4 py-3 text-left font-medium">Ítem</th>
                <th class="px-4 py-3 text-left font-medium">Estado</th>
                <th class="px-4 py-3 text-left font-medium">Observación</th>
                <th class="px-4 py-3 text-left font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (d of devoluciones; track d.id_devolucion) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ nombreProducto(d) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreItem(d.id_item) }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs"
                      [class.bg-green-100]="d.estado === 'BUENO'" [class.text-green-700]="d.estado === 'BUENO'"
                      [class.bg-amber-100]="d.estado === 'REGULAR'" [class.text-amber-700]="d.estado === 'REGULAR'"
                      [class.bg-red-100]="d.estado === 'DAÑADO' || d.estado === 'PERDIDO'" [class.text-red-700]="d.estado === 'DAÑADO' || d.estado === 'PERDIDO'">
                      {{ d.estado }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-500 max-w-[220px] truncate">{{ d.observacion ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ d.fecha | date: 'short' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (crearOpen) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarCrear()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Registrar devolución</h2>
            <button (click)="cerrarCrear()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Préstamo a devolver</label>
              <select [(ngModel)]="idSolicitud" (ngModelChange)="onSolicitudChange()"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                <option [ngValue]="null">— Selecciona —</option>
                @for (s of solicitudesEntregadas; track s.id_solicitud) {
                  <option [ngValue]="s.id_solicitud">
                    {{ s.producto?.nombre ?? 'Material' }} — Cant. {{ s.cantidad }} — {{ s.fecha | date: 'short' }}
                  </option>
                }
              </select>
            </div>

            @if (idSolicitud) {
              @if (cargandoPendientes) {
                <p class="text-gray-400 text-xs">Cargando unidades…</p>
              } @else if (filas.length === 0) {
                <p class="rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-xs px-3 py-2">
                  No quedan unidades pendientes de devolución para este préstamo.
                </p>
              } @else {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Estado de todas las unidades</label>
                  <select [(ngModel)]="estadoGeneral" (ngModelChange)="aplicarATodas()"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                    @for (op of estadosDevolucion; track op.value) {
                      <option [ngValue]="op.value">{{ op.label }} — {{ op.desc }}</option>
                    }
                  </select>
                  <p class="text-[11px] text-gray-400 mt-1">
                    Se aplica a las {{ filas.length }} unidad(es). Cambiá abajo solo las que vuelven distinto.
                  </p>
                </div>

                <div class="rounded-lg border border-gray-100 divide-y divide-gray-50 max-h-56 overflow-y-auto">
                  @for (f of filas; track f.id_item) {
                    <div class="flex items-center gap-3 px-3 py-2">
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-gray-800 truncate">{{ f.producto_nombre || 'Unidad' }}</p>
                        <p class="font-mono text-[11px] text-gray-400 truncate">
                          {{ f.placa_sena || f.codigo_sku || '' }}{{ f.placa_sena && f.codigo_sku ? ' · ' + f.codigo_sku : '' }}
                        </p>
                      </div>
                      <select [(ngModel)]="f.estadoDev"
                        class="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"
                        [class.border-red-300]="f.estadoDev === 'DAÑADO' || f.estadoDev === 'PERDIDO'"
                        [class.border-amber-300]="f.estadoDev === 'REGULAR'">
                        @for (op of estadosDevolucion; track op.value) {
                          <option [ngValue]="op.value">{{ op.label }}</option>
                        }
                      </select>
                    </div>
                  }
                </div>

                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Observación general (opcional)</label>
                  <input type="text" [(ngModel)]="observacion"
                    placeholder="Estado físico, daños, detalles del chequeo..."
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                </div>
              }
            }
          </div>

          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarCrear()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardarDevolucion()" [disabled]="saving || !idSolicitud || filas.length === 0"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ saving ? 'Guardando...' : 'Registrar devolución' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AprendizMaterialesDevolucionesComponent implements OnInit {
  devoluciones: Devolucion[] = [];
  solicitudes: Solicitud[] = [];
  items: Item[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  readonly estadosDevolucion = ESTADOS_DEVOLUCION;

  crearOpen = false;
  idSolicitud: string | null = null;
  cargandoPendientes = false;
  filas: FilaDevolucion[] = [];
  estadoGeneral: EstadoDevolucion = 'BUENO';
  observacion = '';

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
  ) {}

  /** Ver docblock de la versión admin. */
  get solicitudesEntregadas(): Solicitud[] {
    return this.solicitudes.filter((s) => s.estado === 'ENTREGADA');
  }

  ngOnInit(): void {
    this.cargar();
  }

  nombreItem(id: string): string {
    const item = this.items.find((i) => i.id_item === id);
    return item ? `${item.codigo_sku}${item.placa_sena ? ' — ' + item.placa_sena : ''}` : '—';
  }

  nombreProducto(d: Devolucion): string {
    const item = this.items.find((i) => i.id_item === d.id_item);
    return (
      item?.producto?.nombre ??
      this.solicitudes.find((s) => s.id_solicitud === d.id_solicitud)?.producto?.nombre ??
      '—'
    );
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // M9 — solo `listarDevoluciones()` es crítico; si una secundaria da 403
      // (excepción personal) no debe tumbar la tabla entera.
      const [devoluciones, solicitudes, items] = await Promise.all([
        this.api.listarDevoluciones(),
        this.api.listarSolicitudes().catch(() => [] as Solicitud[]),
        this.api.listarItems().catch(() => [] as Item[]),
      ]);
      this.devoluciones = devoluciones;
      this.solicitudes = solicitudes;
      this.items = items;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las devoluciones.');
    } finally {
      this.loading = false;
    }
  }

  abrirCrear(): void {
    if (this.solicitudesEntregadas.length === 0) {
      this.toast.warn('Nada que devolver', 'No hay préstamos en estado ENTREGADA pendientes de devolución.');
      return;
    }
    this.idSolicitud = null;
    this.filas = [];
    this.estadoGeneral = 'BUENO';
    this.observacion = '';
    this.error = null;
    this.crearOpen = true;
  }

  cerrarCrear(): void {
    this.crearOpen = false;
  }

  async onSolicitudChange(): Promise<void> {
    this.filas = [];
    this.error = null;
    if (!this.idSolicitud) return;
    this.cargandoPendientes = true;
    try {
      const pendientes = await this.api.itemsPendientesDevolucion(this.idSolicitud);
      this.filas = pendientes.map((p) => ({ ...p, estadoDev: this.estadoGeneral }));
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudieron cargar las unidades del préstamo.';
    } finally {
      this.cargandoPendientes = false;
    }
  }

  aplicarATodas(): void {
    for (const f of this.filas) f.estadoDev = this.estadoGeneral;
  }

  async guardarDevolucion(): Promise<void> {
    if (!this.idSolicitud || this.filas.length === 0) return;
    this.saving = true;
    this.error = null;
    try {
      const excepciones = this.filas
        .filter((f) => f.estadoDev !== this.estadoGeneral)
        .map((f) => ({ id_item: f.id_item, estado: f.estadoDev }));
      const dto: CreateDevolucionDto = {
        id_solicitud: this.idSolicitud,
        estado_general: this.estadoGeneral,
        observacion: this.observacion.trim() || undefined,
        items: excepciones.length > 0 ? excepciones : undefined,
      };
      await this.api.crearDevolucion(dto);
      this.toast.ok('Devolución registrada');
      this.crearOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo registrar la devolución.';
    } finally {
      this.saving = false;
    }
  }
}
