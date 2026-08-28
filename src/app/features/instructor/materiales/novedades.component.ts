import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { PermisosService } from '../../../core/services/permisos.service';
import { Item, MaterialesApiService, Novedad, TipoNovedad } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_TIPO: OpcionSelect[] = [
  { label: 'Daño', value: 'DAÑO' },
  { label: 'Pérdida', value: 'PERDIDA' },
  { label: 'Mantenimiento', value: 'MANTENIMIENTO' },
  { label: 'Discrepancia', value: 'DISCREPANCIA' },
  { label: 'Otro', value: 'OTRO' },
];

/**
 * Reportes de novedades sobre ítems para instructor: crear siempre
 * disponible; marcar en proceso/resuelta y eliminar solo si tiene la
 * excepción personal de "responsable de bodega"
 * (`PermisosService.tieneServicio('materiales.novedades.<accion>')`).
 */
@Component({
  selector: 'app-instructor-materiales-novedades',
  standalone: true,
  imports: [FormsModule, DatePipe, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Novedades</h1>
        <button (click)="nuevo()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Nueva novedad
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (novedades.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay novedades registradas</p>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Tipo</th>
                <th class="px-4 py-3 text-left font-medium">Descripción</th>
                <th class="px-4 py-3 text-left font-medium">Ítem</th>
                <th class="px-4 py-3 text-left font-medium">Estado</th>
                <th class="px-4 py-3 text-left font-medium">Fecha</th>
                <th class="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (n of novedades; track n.id_novedad) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ n.tipo }}</td>
                  <td class="px-4 py-3 text-gray-700 max-w-[280px] truncate">{{ n.descripcion }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ n.item?.codigo_sku ?? '—' }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs"
                      [class.bg-amber-100]="n.estado === 'PENDIENTE'" [class.text-amber-700]="n.estado === 'PENDIENTE'"
                      [class.bg-blue-100]="n.estado === 'EN_PROCESO'" [class.text-blue-700]="n.estado === 'EN_PROCESO'"
                      [class.bg-green-100]="n.estado === 'RESUELTA'" [class.text-green-700]="n.estado === 'RESUELTA'">
                      {{ n.estado }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ n.fecha | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-1.5">
                      @if (puedeEditar && n.estado === 'PENDIENTE') {
                        <button (click)="cambiarEstado(n, 'EN_PROCESO')"
                          class="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                          Marcar en proceso
                        </button>
                      }
                      @if (puedeEditar && n.estado === 'EN_PROCESO') {
                        <button (click)="cambiarEstado(n, 'RESUELTA')"
                          class="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                          Marcar resuelta
                        </button>
                      }
                      @if (puedeEliminar) {
                        <button (click)="eliminar(n)"
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
      labelSingular="novedad"
      [columns]="['tipo', 'descripcion', 'id_item']"
      [form]="form"
      [opciones]="opciones"
      [columnLabels]="columnLabels"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class InstructorMaterialesNovedadesComponent implements OnInit {
  novedades: Novedad[] = [];
  items: Item[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  form: Record<string, any> = {};

  columnLabels: Record<string, string> = { id_item: 'Ítem (opcional)' };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private permisos: PermisosService,
  ) {}

  get puedeEditar(): boolean {
    return this.permisos.tieneServicio('materiales.novedades.editar');
  }
  get puedeEliminar(): boolean {
    return this.permisos.tieneServicio('materiales.novedades.eliminar');
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      tipo: OPCIONES_TIPO,
      id_item: this.items.map((i) => ({ label: `${i.codigo_sku}${i.placa_sena ? ' — ' + i.placa_sena : ''}`, value: i.id_item })),
    };
  }

  ngOnInit(): void {
    this.permisos.cargar();
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [novedades, items] = await Promise.all([this.api.listarNovedades(), this.api.listarItems()]);
      this.novedades = novedades;
      this.items = items;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las novedades.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    this.form = { tipo: 'OTRO', descripcion: '', id_item: null };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(form: Record<string, any>): Promise<void> {
    if (!form['descripcion']?.trim()) {
      this.error = 'La descripción es obligatoria.';
      return;
    }
    this.saving = true;
    this.error = null;
    try {
      await this.api.crearNovedad({
        tipo: form['tipo'] as TipoNovedad,
        descripcion: form['descripcion'],
        id_item: form['id_item'] ? Number(form['id_item']) : undefined,
      });
      this.toast.ok('Novedad registrada');
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo registrar la novedad.';
    } finally {
      this.saving = false;
    }
  }

  async cambiarEstado(n: Novedad, estado: 'EN_PROCESO' | 'RESUELTA'): Promise<void> {
    try {
      await this.api.actualizarNovedad(n.id_novedad, estado);
      this.toast.ok('Novedad actualizada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo actualizar la novedad.');
    }
  }

  async eliminar(n: Novedad): Promise<void> {
    if (!confirm(`¿Eliminar la novedad "${n.descripcion}"?`)) return;
    try {
      await this.api.eliminarNovedad(n.id_novedad);
      this.toast.ok('Novedad eliminada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar la novedad.');
    }
  }
}
