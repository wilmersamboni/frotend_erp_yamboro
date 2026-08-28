import { Component, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Item, MaterialesApiService, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_ESTADO: OpcionSelect[] = [
  { label: 'Disponible', value: 'DISPONIBLE' },
  { label: 'Prestado', value: 'PRESTADO' },
  { label: 'Dañado', value: 'DAÑADO' },
  { label: 'Perdido', value: 'PERDIDO' },
];

/**
 * Ítems individuales para aprendiz — edición gateada por servicio
 * (`materiales.items.editar`; sin `.eliminar` en el catálogo). Conserva la
 * búsqueda por placa SENA (siempre de lectura). Ver plan "Ronda 3".
 */
@Component({
  selector: 'app-aprendiz-materiales-items',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Ítems</h1>
        <div class="flex gap-2">
          <input [(ngModel)]="placaBuscar" (keydown.enter)="buscarPorPlaca()"
            placeholder="Buscar por placa SENA..."
            class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
          <button (click)="buscarPorPlaca()"
            class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style="background-color: #39A900">
            Buscar
          </button>
        </div>
      </div>

      @if (resultadoBusqueda !== undefined) {
        <div class="mb-5 p-4 rounded-xl border border-gray-100 bg-gray-50">
          @if (resultadoBusqueda === null) {
            <p class="text-sm text-gray-500">No se encontró ningún ítem con esa placa.</p>
          } @else {
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium text-gray-800">{{ resultadoBusqueda.item.codigo_sku }} — {{ resultadoBusqueda.item.producto?.nombre ?? 'sin producto' }}</p>
                <p class="text-xs text-gray-500 mt-1">Estado: {{ resultadoBusqueda.item.estado }}</p>
              </div>
              <div class="flex gap-1.5 text-xs">
                @if (resultadoBusqueda.prestamo_activo) { <span class="px-2 py-1 rounded-full bg-amber-100 text-amber-700">Préstamo activo</span> }
                @if (resultadoBusqueda.asignacion_activa) { <span class="px-2 py-1 rounded-full bg-blue-100 text-blue-700">Asignación activa</span> }
                @if (resultadoBusqueda.novedad_activa) { <span class="px-2 py-1 rounded-full bg-red-100 text-red-700">Novedad activa</span> }
              </div>
            </div>
          }
        </div>
      }

      <app-admin-table
        [rows]="filas"
        [columns]="['codigo_sku', 'placa_sena', 'producto_nombre', 'sitio_nombre', 'estado']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="puedeEditar()"
        [canDelete]="false"
        (edit)="editar($event)" />
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="ítem"
      [columns]="['placa_sena', 'id_sitio', 'estado']"
      [form]="form"
      [opciones]="opciones"
      [columnLabels]="columnLabels"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class AprendizMaterialesItemsComponent implements OnInit {
  items: Item[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  placaBuscar = '';
  resultadoBusqueda: { item: Item; prestamo_activo: any; asignacion_activa: any; novedad_activa: any } | null | undefined = undefined;

  modalOpen = false;
  editando: Item | null = null;
  form: Record<string, any> = {};

  columnLabels: Record<string, string> = {
    codigo_sku: 'SKU', placa_sena: 'Placa SENA', producto_nombre: 'Producto', sitio_nombre: 'Sitio', id_sitio: 'Sitio',
  };

  puedeEditar = computed(() => this.auth.tieneServicio('materiales.items.editar'));

  constructor(private api: MaterialesApiService, private toast: ToastService, private auth: AuthService) {}

  ngOnInit(): void {
    this.cargar();
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return { id_sitio: this.sitios.map((s) => ({ label: s.nombre, value: s.id_sitio })), estado: OPCIONES_ESTADO };
  }

  get filas(): any[] {
    return this.items.map((i) => ({
      ...i,
      producto_nombre: i.producto?.nombre ?? '—',
      sitio_nombre: this.sitios.find((s) => s.id_sitio === i.id_sitio)?.nombre ?? '—',
    }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [items, sitios] = await Promise.all([this.api.listarItems(), this.api.listarSitios()]);
      this.items = items;
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los ítems.');
    } finally {
      this.loading = false;
    }
  }

  async buscarPorPlaca(): Promise<void> {
    if (!this.placaBuscar.trim()) return;
    try {
      this.resultadoBusqueda = await this.api.buscarItemPorPlaca(this.placaBuscar.trim());
    } catch (e) {
      this.toast.httpError(e, 'No se pudo buscar el ítem.');
    }
  }

  editar(fila: any): void {
    if (!this.puedeEditar()) return;
    const item = this.items.find((i) => i.id_item === fila.id_item)!;
    this.editando = item;
    this.form = { placa_sena: item.placa_sena ?? '', id_sitio: item.id_sitio ?? this.sitios[0]?.id_sitio, estado: item.estado };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(form: Record<string, any>): Promise<void> {
    if (!this.editando) return;
    this.saving = true;
    this.error = null;
    try {
      await this.api.actualizarItem(this.editando.id_item, {
        placa_sena: form['placa_sena'] || undefined,
        id_sitio: form['id_sitio'] ? Number(form['id_sitio']) : undefined,
      });
      if (form['estado'] !== this.editando.estado) {
        await this.api.actualizarEstadoItem(this.editando.id_item, form['estado']);
      }
      this.toast.ok('Ítem actualizado');
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar el ítem.';
    } finally {
      this.saving = false;
    }
  }
}
