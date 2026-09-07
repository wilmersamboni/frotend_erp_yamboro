import { Component, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Item, MaterialesApiService, Producto, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_ESTADO: OpcionSelect[] = [
  { label: 'Disponible', value: 'DISPONIBLE' },
  { label: 'Prestado', value: 'PRESTADO' },
  { label: 'Dañado', value: 'DAÑADO' },
  { label: 'Perdido', value: 'PERDIDO' },
  { label: 'En mantenimiento', value: 'EN_MANTENIMIENTO' },
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
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold text-gray-800">Ítems</h1>
        @if (puedeEditar() && productosConPlacasPendientes.length > 0) {
          <button (click)="abrirAsignarPlacas()"
            class="px-3 py-2 text-sm font-medium rounded-lg border border-[#39A900] text-[#39A900] hover:bg-[#39A900]/5 transition-colors">
            Asignar placas SENA
          </button>
        }
      </div>

      <app-admin-table
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por SKU, producto, estado…'"
        [addLabel]="puedeCrear() ? 'Agregar ítem' : null"
        (add)="abrirAgregar()"
        [columns]="['codigo_sku', 'placa_sena', 'producto_nombre', 'estado']"
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
      [placeholders]="placeholders"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />

    <app-admin-modal
      [open]="agregarOpen"
      [editando]="null"
      labelSingular="ítem al lote"
      [columns]="['id_producto', 'placa_sena']"
      [form]="agregarForm"
      [opciones]="opcionesAgregar"
      [columnLabels]="columnLabels"
      [placeholders]="placeholders"
      [saving]="agregarSaving"
      [error]="agregarError"
      (closed)="cerrarAgregar()"
      (saved)="guardarNuevoItem($event)" />

    @if (asignarPlacasOpen) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarAsignarPlacas()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800">Asignar placas SENA</h2>
            <button (click)="cerrarAsignarPlacas()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Producto</label>
              <select [(ngModel)]="placasProductoId" (ngModelChange)="onProductoPlacasChange()"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                @for (p of productosConPlacasPendientes; track p.id_producto) {
                  <option [value]="p.id_producto">{{ p.nombre }} — {{ p.count }} sin placa</option>
                }
              </select>
            </div>

            @if (filasPlacas.length > 0) {
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Pegar lista (una placa por línea)</label>
                <textarea [(ngModel)]="pegado" (ngModelChange)="aplicarPegado()" rows="3"
                  placeholder="SENA-00123&#10;SENA-00124&#10;…"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"></textarea>
                <p class="text-[11px] text-gray-400 mt-1">Se reparten de arriba hacia abajo. También podés escribir cada una en la grilla.</p>
              </div>

              <div class="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                @for (fila of filasPlacas; track fila.id_item; let i = $index) {
                  <div class="flex items-center gap-3 px-3 py-2">
                    <span class="text-xs text-gray-400 w-6 shrink-0">#{{ i + 1 }}</span>
                    <span class="text-[11px] text-gray-400 w-24 shrink-0 truncate">{{ fila.estado }}</span>
                    <input type="text" [(ngModel)]="fila.placa" placeholder="Placa SENA"
                      class="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                  </div>
                }
              </div>
            }
          </div>

          @if (asignarPlacasError) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ asignarPlacasError }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarAsignarPlacas()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardarPlacas()" [disabled]="asignarPlacasSaving || placasLlenas === 0"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ asignarPlacasSaving ? 'Asignando…' : 'Asignar ' + placasLlenas + ' placa(s)' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AprendizMaterialesItemsComponent implements OnInit {
  items: Item[] = [];
  sitios: Sitio[] = [];
  productos: Producto[] = [];
  loading = false;
  saving = false;
  error: string | null = null;


  modalOpen = false;
  editando: Item | null = null;
  form: Record<string, any> = {};

  /** "Agregar ítem al lote" (Fase 3, Ronda 4) — modal aparte, siempre en modo creación. */
  agregarOpen = false;
  agregarForm: Record<string, any> = {};
  agregarSaving = false;
  agregarError: string | null = null;

  /** "Asignar placas SENA" — alta masiva sobre ítems ya generados que aún no tienen placa. */
  asignarPlacasOpen = false;
  placasProductoId: string | null = null;
  filasPlacas: { id_item: string; estado: string; placa: string }[] = [];
  pegado = '';
  asignarPlacasSaving = false;
  asignarPlacasError: string | null = null;

  placeholders: Record<string, string> = { placa_sena: 'Ej: SENA-00123 (opcional)' };

  columnLabels: Record<string, string> = {
    codigo_sku: 'SKU', placa_sena: 'Placa SENA', producto_nombre: 'Producto', sitio_nombre: 'Sitio', id_sitio: 'Sitio', id_producto: 'Producto',
  };

  puedeEditar = computed(() => this.auth.tieneServicio('materiales.items.editar'));
  puedeCrear = computed(() => this.auth.tieneServicio('materiales.items.crear'));

  constructor(private api: MaterialesApiService, private toast: ToastService, private auth: AuthService) {}

  ngOnInit(): void {
    this.cargar();
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return { id_sitio: this.sitios.map((s) => ({ label: s.nombre, value: s.id_sitio })), estado: OPCIONES_ESTADO };
  }

  get opcionesAgregar(): Record<string, OpcionSelect[]> {
    return { id_producto: this.productos.map((p) => ({ label: p.SKU ? `${p.nombre} (${p.SKU})` : p.nombre, value: p.id_producto })) };
  }

  get filas(): any[] {
    return this.items.map((i) => ({
      ...i,
      producto_nombre: i.producto?.nombre ?? '—',
    }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // Sin `materiales.sitios.ver` no se pide /sitios (el aprendiz no edita
      // ítems ni ve la columna Sitio) — antes el 403 tumbaba toda la carga.
      const verSitios = this.auth.tieneServicio('materiales.sitios.ver');
      const [items, sitios, productos] = await Promise.all([
        this.api.listarItems(),
        verSitios ? this.api.listarSitios().catch(() => [] as Sitio[]) : Promise.resolve([] as Sitio[]),
        this.api.listarProductos().catch(() => [] as Producto[]),
      ]);
      this.items = items;
      this.sitios = sitios;
      this.productos = productos;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los ítems.');
    } finally {
      this.loading = false;
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
        id_sitio: form['id_sitio'] || undefined,
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

  abrirAgregar(): void {
    if (!this.puedeCrear()) return;
    if (this.productos.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un producto para agregar un ítem.');
      return;
    }
    this.agregarForm = { id_producto: this.productos[0].id_producto, placa_sena: '' };
    this.agregarError = null;
    this.agregarOpen = true;
  }

  cerrarAgregar(): void {
    this.agregarOpen = false;
  }

  async guardarNuevoItem(form: Record<string, any>): Promise<void> {
    if (!this.puedeCrear()) return;
    if (!form['id_producto']) {
      this.agregarError = 'Elegí un producto.';
      return;
    }
    this.agregarSaving = true;
    this.agregarError = null;
    try {
      await this.api.agregarItemAProducto(form['id_producto'], form['placa_sena'] || undefined);
      this.toast.ok('Ítem agregado al lote');
      this.agregarOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.agregarError = e?.error?.message ?? 'No se pudo agregar el ítem.';
    } finally {
      this.agregarSaving = false;
    }
  }

  // ── Asignar placas SENA en lote ────────────────────────────────────
  /** Productos DEVOLUTIVO con al menos un ítem sin placa. */
  get productosConPlacasPendientes(): { id_producto: string; nombre: string; count: number }[] {
    return this.productos
      .filter((p) => p.tipo_material === 'DEVOLUTIVO')
      .map((p) => ({
        id_producto: p.id_producto,
        nombre: p.SKU ? `${p.nombre} (${p.SKU})` : p.nombre,
        count: this.items.filter((i) => i.id_producto === p.id_producto && !i.placa_sena?.trim()).length,
      }))
      .filter((p) => p.count > 0);
  }

  get placasLlenas(): number {
    return this.filasPlacas.filter((f) => f.placa.trim()).length;
  }

  abrirAsignarPlacas(): void {
    if (!this.puedeEditar()) return;
    const pendientes = this.productosConPlacasPendientes;
    if (pendientes.length === 0) return;
    this.placasProductoId = pendientes[0].id_producto;
    this.pegado = '';
    this.asignarPlacasError = null;
    this.onProductoPlacasChange();
    this.asignarPlacasOpen = true;
  }

  onProductoPlacasChange(): void {
    this.pegado = '';
    this.filasPlacas = this.items
      .filter((i) => i.id_producto === this.placasProductoId && !i.placa_sena?.trim())
      .map((i) => ({ id_item: i.id_item, estado: i.estado, placa: '' }));
  }

  aplicarPegado(): void {
    const placas = this.pegado.split('\n').map((s) => s.trim());
    this.filasPlacas.forEach((f, i) => {
      if (placas[i] !== undefined && placas[i] !== '') f.placa = placas[i];
    });
  }

  cerrarAsignarPlacas(): void {
    this.asignarPlacasOpen = false;
  }

  async guardarPlacas(): Promise<void> {
    if (!this.puedeEditar()) return;
    const asignaciones = this.filasPlacas
      .filter((f) => f.placa.trim())
      .map((f) => ({ id_item: f.id_item, placa_sena: f.placa.trim() }));
    if (asignaciones.length === 0) {
      this.asignarPlacasError = 'Escribí al menos una placa.';
      return;
    }
    const repetidas = asignaciones.map((a) => a.placa_sena.toLowerCase());
    if (new Set(repetidas).size !== repetidas.length) {
      this.asignarPlacasError = 'Hay placas repetidas en la lista.';
      return;
    }
    this.asignarPlacasSaving = true;
    this.asignarPlacasError = null;
    try {
      const { actualizados } = await this.api.asignarPlacasItems(asignaciones);
      this.toast.ok(`Se asignaron ${actualizados} placa(s) SENA`);
      this.asignarPlacasOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.asignarPlacasError = e?.error?.message ?? 'No se pudieron asignar las placas.';
    } finally {
      this.asignarPlacasSaving = false;
    }
  }
}
