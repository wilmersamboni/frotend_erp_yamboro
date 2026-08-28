import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { MaterialesApiService, Producto, Solicitud } from '../../../core/services/materiales/materiales-api.service';

/**
 * Solicitudes de préstamo para aprendiz: crear + ver propias + confirmar
 * recepción. El backend ya filtra `GET /solicitudes` por dueño para quien
 * no es admin ni responsable (`SolicitudesService.obtenerSolicitudes`), así
 * que acá no se filtra nada client-side — la lista ya viene siendo "mis
 * solicitudes". Sin aprobar/rechazar/entregar: esas acciones son de
 * admin/responsable de bodega.
 */
@Component({
  selector: 'app-aprendiz-materiales-solicitudes',
  standalone: true,
  imports: [FormsModule, DatePipe, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Mis solicitudes</h1>
        <button (click)="nuevo()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Nueva solicitud
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (solicitudes.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No tenés solicitudes registradas</p>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Producto</th>
                <th class="px-4 py-3 text-left font-medium">Cantidad</th>
                <th class="px-4 py-3 text-left font-medium">Estado</th>
                <th class="px-4 py-3 text-left font-medium">Fecha</th>
                <th class="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (s of solicitudes; track s.id_solicitud) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ s.producto?.nombre ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ s.cantidad }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs"
                      [class.bg-amber-100]="s.estado === 'PENDIENTE'" [class.text-amber-700]="s.estado === 'PENDIENTE'"
                      [class.bg-blue-100]="s.estado === 'APROBADA' || s.estado === 'EN_ENTREGA'" [class.text-blue-700]="s.estado === 'APROBADA' || s.estado === 'EN_ENTREGA'"
                      [class.bg-green-100]="s.estado === 'ENTREGADA'" [class.text-green-700]="s.estado === 'ENTREGADA'"
                      [class.bg-red-100]="s.estado === 'RECHAZADA'" [class.text-red-700]="s.estado === 'RECHAZADA'">
                      {{ s.estado }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ s.fecha | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    @if (s.estado === 'EN_ENTREGA') {
                      <div class="flex justify-end">
                        <button (click)="confirmarRecepcion(s)"
                          class="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                          Confirmar recepción
                        </button>
                      </div>
                    }
                  </td>
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
      labelSingular="solicitud"
      [columns]="['id_producto', 'cantidad']"
      [form]="form"
      [opciones]="opciones"
      [tiposCampo]="tiposCampo"
      [columnLabels]="columnLabels"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class AprendizMaterialesSolicitudesComponent implements OnInit {
  solicitudes: Solicitud[] = [];
  productos: Producto[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  form: Record<string, any> = {};

  tiposCampo: Record<string, string> = { cantidad: 'number' };
  columnLabels: Record<string, string> = { id_producto: 'Producto' };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
  ) {}

  get opciones(): Record<string, OpcionSelect[]> {
    return { id_producto: this.productos.map((p) => ({ label: p.nombre, value: p.id_producto })) };
  }

  ngOnInit(): void {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [solicitudes, productos] = await Promise.all([this.api.listarSolicitudes(), this.api.listarProductos()]);
      this.solicitudes = solicitudes;
      this.productos = productos;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las solicitudes.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (this.productos.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un producto para crear una solicitud.');
      return;
    }
    this.form = { id_producto: this.productos[0].id_producto, cantidad: 1 };
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
      await this.api.crearSolicitud({
        tipo: 'PRESTAMO',
        id_producto: Number(form['id_producto']),
        cantidad: Number(form['cantidad']) || 1,
      });
      this.toast.ok('Solicitud creada');
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear la solicitud.';
    } finally {
      this.saving = false;
    }
  }

  async confirmarRecepcion(s: Solicitud): Promise<void> {
    try {
      await this.api.confirmarRecepcionSolicitud(s.id_solicitud);
      this.toast.ok('Recepción confirmada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo confirmar la recepción.');
    }
  }
}
