import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import { Asignacion, CreateAsignacionDto, MaterialesApiService, Producto } from '../../../core/services/materiales/materiales-api.service';

interface Ficha {
  idCurso: string;
  codigo: string;
  programa: string;
}

/**
 * Asignación de material devolutivo a una ficha, para instructor — crear/
 * anular/eliminar gateados por servicio (`materiales.asignaciones.crear/
 * .anular/.eliminar`), no por cargo. Mismo flujo que la versión admin
 * (`features/admin/materiales/asignaciones.component.ts`) — ver ahí el
 * detalle del modelo (solo dos estados, sin selección de ítems en v1). Ver
 * plan "Ronda 3" (continuación): esta pantalla nunca existió para
 * instructor hasta ahora.
 */
@Component({
  selector: 'app-instructor-materiales-asignaciones',
  standalone: true,
  imports: [FormsModule, DatePipe, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Asignaciones</h1>
        @if (puedeCrear) {
          <button (click)="nuevo()"
            class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style="background-color: #39A900">
            + Nueva asignación
          </button>
        }
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (asignaciones.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay asignaciones registradas</p>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Ficha</th>
                <th class="px-4 py-3 text-left font-medium">Producto</th>
                <th class="px-4 py-3 text-left font-medium">Cantidad</th>
                <th class="px-4 py-3 text-left font-medium">Estado</th>
                <th class="px-4 py-3 text-left font-medium">Fecha</th>
                <th class="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (a of asignaciones; track a.id_asignacion) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ nombreFicha(a.id_curso) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ a.producto?.nombre ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ a.cantidad }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs"
                      [class.bg-green-100]="a.estado === 'ACTIVA'" [class.text-green-700]="a.estado === 'ACTIVA'"
                      [class.bg-gray-100]="a.estado === 'ANULADA'" [class.text-gray-500]="a.estado === 'ANULADA'">
                      {{ a.estado }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ a.fecha_asignacion | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-1.5">
                      @if (a.estado === 'ACTIVA' && puedeAnular) {
                        <button (click)="anular(a)"
                          class="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                          Anular
                        </button>
                      }
                      @if (a.estado === 'ANULADA' && puedeEliminar) {
                        <button (click)="eliminar(a)"
                          class="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors" title="Eliminar">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7
                                 m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      }
                    </div>
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
      labelSingular="asignación"
      [columns]="['id_curso', 'id_producto', 'cantidad', 'fecha_devolucion', 'observacion']"
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
export class InstructorMaterialesAsignacionesComponent implements OnInit {
  asignaciones: Asignacion[] = [];
  productos: Producto[] = [];
  fichas: Ficha[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  form: Record<string, any> = {};

  tiposCampo: Record<string, string> = { cantidad: 'number', fecha_devolucion: 'date' };
  columnLabels: Record<string, string> = {
    id_curso: 'Ficha',
    id_producto: 'Producto',
    fecha_devolucion: 'Fecha de devolución (opcional)',
    observacion: 'Observación (opcional)',
  };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private erpCatalogo: ErpCatalogoService,
  ) {}

  get puedeCrear(): boolean {
    return this.auth.tieneServicio('materiales.asignaciones.crear');
  }
  get puedeAnular(): boolean {
    return this.auth.tieneServicio('materiales.asignaciones.anular');
  }
  get puedeEliminar(): boolean {
    return this.auth.tieneServicio('materiales.asignaciones.eliminar');
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      id_curso: this.fichas.map((f) => ({ label: `${f.codigo}${f.programa ? ' — ' + f.programa : ''}`, value: f.idCurso })),
      id_producto: this.productos.map((p) => ({ label: p.nombre, value: p.id_producto })),
    };
  }

  ngOnInit(): void {
    this.cargar();
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
    if (!this.puedeCrear) return;
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
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(form: Record<string, any>): Promise<void> {
    this.saving = true;
    this.error = null;
    try {
      const dto: CreateAsignacionDto = {
        id_curso: form['id_curso'],
        id_producto: Number(form['id_producto']),
        cantidad: Number(form['cantidad']) || 1,
        observacion: form['observacion'] || undefined,
        fecha_devolucion: form['fecha_devolucion'] || undefined,
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
    if (!this.puedeAnular) return;
    if (!confirm(`¿Anular la asignación #${a.id_asignacion}? El stock de los ítems prestados se restaurará.`)) return;
    try {
      await this.api.anularAsignacion(a.id_asignacion);
      this.toast.ok('Asignación anulada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo anular la asignación.');
    }
  }

  async eliminar(a: Asignacion): Promise<void> {
    if (!this.puedeEliminar) return;
    if (!confirm(`¿Eliminar la asignación #${a.id_asignacion}? Esta acción no se puede deshacer.`)) return;
    try {
      await this.api.eliminarAsignacion(a.id_asignacion);
      this.toast.ok('Asignación eliminada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar la asignación.');
    }
  }
}
