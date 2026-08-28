import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { CreateDevolucionDto, Devolucion, Item, MaterialesApiService, Solicitud } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_ESTADO: OpcionSelect[] = [
  { label: 'Bueno', value: 'BUENO' },
  { label: 'Regular', value: 'REGULAR' },
  { label: 'Dañado', value: 'DAÑADO' },
  { label: 'Perdido', value: 'PERDIDO' },
];

/**
 * Registro de devoluciones de material prestado. A diferencia de
 * Novedades/Traslados/Solicitudes, este submódulo NO tiene máquina de
 * estados propia en el backend (solo `GET`/`POST` — ver
 * devoluciones.controller.ts): es un log de "esto se devolvió, en tal
 * estado", no un flujo con aprobación. Por eso no hay botones de fila,
 * solo alta + listado.
 *
 * Solo se puede devolver una solicitud en estado ENTREGADA (filtro de
 * UI — el backend no lo valida, pero no tiene sentido ofrecer otras).
 */
@Component({
  selector: 'app-materiales-devoluciones',
  standalone: true,
  imports: [FormsModule, DatePipe, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Devoluciones</h1>
        <button (click)="nuevo()"
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

    <app-admin-modal
      [open]="modalOpen"
      [editando]="null"
      labelSingular="devolución"
      [columns]="['id_solicitud', 'id_item', 'estado', 'observacion']"
      [form]="form"
      [opciones]="opciones"
      [columnLabels]="columnLabels"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class MaterialesDevolucionesComponent implements OnInit {
  devoluciones: Devolucion[] = [];
  solicitudes: Solicitud[] = [];
  items: Item[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  form: Record<string, any> = {};

  columnLabels: Record<string, string> = {
    id_solicitud: 'Solicitud a devolver',
    id_item: 'Ítem devuelto',
    estado: 'Estado del ítem',
    observacion: 'Observación (opcional)',
  };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
  ) {}

  /** Solo se puede registrar devolución de solicitudes ya entregadas. */
  get solicitudesEntregadas(): Solicitud[] {
    return this.solicitudes.filter((s) => s.estado === 'ENTREGADA');
  }

  get opciones(): Record<string, OpcionSelect[]> {
    const idProductoSeleccionado = this.solicitudes.find(
      (s) => s.id_solicitud === this.form['id_solicitud'],
    )?.id_producto;
    const itemsFiltrados = idProductoSeleccionado
      ? this.items.filter((i) => i.id_producto === idProductoSeleccionado)
      : this.items;
    return {
      id_solicitud: this.solicitudesEntregadas.map((s) => ({
        label: `${s.producto?.nombre ?? 'Producto #' + s.id_producto} — cant. ${s.cantidad}`,
        value: s.id_solicitud,
      })),
      id_item: itemsFiltrados.map((i) => ({ label: `${i.codigo_sku}${i.placa_sena ? ' — ' + i.placa_sena : ''}`, value: i.id_item })),
      estado: OPCIONES_ESTADO,
    };
  }

  ngOnInit(): void {
    this.cargar();
  }

  nombreItem(id: number): string {
    const item = this.items.find((i) => i.id_item === id);
    return item ? `${item.codigo_sku}${item.placa_sena ? ' — ' + item.placa_sena : ''}` : '—';
  }

  /**
   * `GET /devoluciones` solo trae la relación `solicitud` a un nivel (sin
   * su `producto` anidado), así que el nombre se resuelve contra la lista
   * ya cargada por `listarSolicitudes()`, que sí lo trae completo.
   */
  nombreProducto(d: Devolucion): string {
    return this.solicitudes.find((s) => s.id_solicitud === d.id_solicitud)?.producto?.nombre ?? '—';
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [devoluciones, solicitudes, items] = await Promise.all([
        this.api.listarDevoluciones(),
        this.api.listarSolicitudes(),
        this.api.listarItems(),
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

  nuevo(): void {
    if (this.solicitudesEntregadas.length === 0) {
      this.toast.warn('Nada que devolver', 'No hay solicitudes en estado ENTREGADA pendientes de devolución.');
      return;
    }
    if (this.items.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un ítem para registrar una devolución.');
      return;
    }
    this.form = {
      id_solicitud: this.solicitudesEntregadas[0].id_solicitud,
      id_item: this.items[0].id_item,
      estado: 'BUENO',
      observacion: '',
    };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(form: Record<string, any>): Promise<void> {
    this.saving = true;
    this.error = null;
    try {
      const dto: CreateDevolucionDto = {
        id_solicitud: Number(form['id_solicitud']),
        id_item: Number(form['id_item']),
        estado: form['estado'],
        observacion: form['observacion'] || undefined,
      };
      await this.api.crearDevolucion(dto);
      this.toast.ok('Devolución registrada');
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo registrar la devolución.';
    } finally {
      this.saving = false;
    }
  }
}
