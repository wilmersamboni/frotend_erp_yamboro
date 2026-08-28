import { Component, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Item, MaterialesApiService, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_TIPO: OpcionSelect[] = [
  { label: 'Bodega', value: 'BODEGA' },
  { label: 'Ambiente', value: 'AMBIENTE' },
  { label: 'Laboratorio', value: 'LABORATORIO' },
  { label: 'Otro', value: 'OTRO' },
];

/**
 * Sitios de almacenamiento para instructor — crear/editar/eliminar gateado
 * por servicio (`materiales.sitios.crear/.editar/.eliminar`), no por cargo.
 * Antes esta pantalla era 100% solo-lectura sin importar el permiso; ver
 * plan "Ronda 3" para el contexto del bug.
 *
 * Pulido (Ronda 4, Fase 9): columna con el conteo de ítems por sitio +
 * "Ver ítems" al hacer clic en la fila — ver docblock de la versión admin.
 */
@Component({
  selector: 'app-instructor-materiales-sitios',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Sitios de almacenamiento</h1>
        @if (puedeCrear()) {
          <button (click)="nuevo()"
            class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style="background-color: #39A900">
            + Nuevo sitio
          </button>
        }
      </div>

      <app-admin-table
        [rows]="filas"
        [columns]="['nombre', 'tipo', 'items_count', 'estado']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="puedeEditar()"
        [canDelete]="puedeEliminar()"
        [selectable]="true"
        (rowSelected)="verItems($event)"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    @if (verItemsAbierto) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="verItemsAbierto = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Ítems en "{{ sitioSeleccionado?.nombre }}"</h2>
            <button (click)="verItemsAbierto = false" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          @if (itemsDelSitioSeleccionado().length === 0) {
            <p class="text-sm text-gray-400 py-6 text-center">Este sitio no tiene ítems.</p>
          } @else {
            <div class="divide-y divide-gray-50">
              @for (i of itemsDelSitioSeleccionado(); track i.id_item) {
                <div class="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <p class="font-medium text-gray-800">{{ i.producto?.nombre ?? i.codigo_sku }}</p>
                    <p class="text-xs text-gray-500 font-mono">{{ i.codigo_sku }}{{ i.placa_sena ? ' — ' + i.placa_sena : '' }}</p>
                  </div>
                  <span class="px-2 py-1 rounded-full text-xs"
                    [class.bg-green-100]="i.estado === 'DISPONIBLE'" [class.text-green-700]="i.estado === 'DISPONIBLE'"
                    [class.bg-amber-100]="i.estado === 'PRESTADO'" [class.text-amber-700]="i.estado === 'PRESTADO'"
                    [class.bg-red-100]="i.estado === 'DAÑADO' || i.estado === 'PERDIDO'" [class.text-red-700]="i.estado === 'DAÑADO' || i.estado === 'PERDIDO'">
                    {{ i.estado }}
                  </span>
                </div>
              }
            </div>
          }
        </div>
      </div>
    }

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="sitio"
      [columns]="['nombre', 'tipo', 'tipo_personalizado', 'codigo_lugar', 'id_responsable', 'id_centro', 'estado']"
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
export class InstructorMaterialesSitiosComponent implements OnInit {
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  editando: Sitio | null = null;
  form: Record<string, any> = {};

  opciones: Record<string, OpcionSelect[]> = { tipo: OPCIONES_TIPO };
  tiposCampo: Record<string, string> = { estado: 'boolean' };
  columnLabels: Record<string, string> = {
    id_responsable: 'Responsable (UUID, opcional)',
    id_centro: 'Centro (UUID, opcional)',
    codigo_lugar: 'Código de lugar',
    tipo_personalizado: 'Tipo personalizado',
    items_count: 'Ítems',
  };

  /** "Ver ítems" (Fase 9) — diálogo aparte, sin backend nuevo. */
  items: Item[] = [];
  verItemsAbierto = false;
  sitioSeleccionado: Sitio | null = null;

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.sitios.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.sitios.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.sitios.eliminar'));

  constructor(private api: MaterialesApiService, private toast: ToastService, private auth: AuthService) {}

  ngOnInit(): void {
    this.cargar();
  }

  get filas(): any[] {
    return this.sitios.map((s) => ({
      ...s,
      estado: s.estado ? 'Activo' : 'Inactivo',
      items_count: this.items.filter((i) => i.id_sitio === s.id_sitio).length,
    }));
  }

  itemsDelSitioSeleccionado(): Item[] {
    if (!this.sitioSeleccionado) return [];
    return this.items.filter((i) => i.id_sitio === this.sitioSeleccionado!.id_sitio);
  }

  verItems(fila: any): void {
    this.sitioSeleccionado = this.sitios.find((s) => s.id_sitio === fila.id_sitio) ?? null;
    this.verItemsAbierto = true;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [sitios, items] = await Promise.all([this.api.listarSitios(), this.api.listarItems()]);
      this.sitios = sitios;
      this.items = items;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los sitios.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (!this.puedeCrear()) return;
    this.editando = null;
    this.form = { nombre: '', tipo: 'BODEGA', tipo_personalizado: '', codigo_lugar: '', id_responsable: '', id_centro: '', estado: true };
    this.error = null;
    this.modalOpen = true;
  }

  editar(fila: any): void {
    if (!this.puedeEditar()) return;
    const sitio = this.sitios.find((s) => s.id_sitio === fila.id_sitio)!;
    this.editando = sitio;
    this.form = {
      nombre: sitio.nombre,
      tipo: sitio.tipo,
      tipo_personalizado: sitio.tipo_personalizado ?? '',
      codigo_lugar: sitio.codigo_lugar ?? '',
      id_responsable: sitio.id_responsable ?? '',
      id_centro: sitio.id_centro ?? '',
      estado: sitio.estado,
    };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(form: Record<string, any>): Promise<void> {
    if (!form['nombre']?.trim()) {
      this.error = 'El nombre es obligatorio.';
      return;
    }
    const dto = {
      nombre: form['nombre'],
      tipo: form['tipo'],
      tipo_personalizado: form['tipo_personalizado'] || undefined,
      codigo_lugar: form['codigo_lugar'] || undefined,
      id_responsable: form['id_responsable'] || undefined,
      id_centro: form['id_centro'] || undefined,
      estado: form['estado'],
    };
    this.saving = true;
    this.error = null;
    try {
      if (this.editando) {
        await this.api.actualizarSitio(this.editando.id_sitio, dto);
        this.toast.ok('Sitio actualizado');
      } else {
        await this.api.crearSitio(dto);
        this.toast.ok('Sitio creado');
      }
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar el sitio.';
    } finally {
      this.saving = false;
    }
  }

  async eliminar(fila: any): Promise<void> {
    if (!this.puedeEliminar()) return;
    if (!confirm(`¿Eliminar el sitio "${fila.nombre}"?`)) return;
    try {
      await this.api.eliminarSitio(fila.id_sitio);
      this.toast.ok('Sitio eliminado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar el sitio.');
    }
  }
}
