import { Component, OnInit } from '@angular/core';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../services/admin.service';
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
 * Gestión de Ítems individuales (las unidades que genera Productos). No hay
 * alta acá — se crean solo vía Productos — solo edición (placa/sitio/estado)
 * y búsqueda por placa SENA, que además muestra si el ítem tiene un
 * préstamo/asignación/novedad activos (útil antes de reasignarlo).
 */
@Component({
  selector: 'app-materiales-items',
  standalone: true,
  imports: [AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <h1 class="text-xl font-bold text-gray-800 mb-4">Ítems</h1>

      <app-admin-table
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por SKU, producto, sitio, estado…'"
        [addLabel]="'Agregar ítem'"
        (add)="abrirAgregar()"
        [columns]="['codigo_sku', 'placa_sena', 'producto_nombre', 'sitio_nombre', 'estado']"
        [columnLabels]="columnLabels"
        [loading]="loading"
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
  `,
})
export class MaterialesItemsComponent implements OnInit {
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

  placeholders: Record<string, string> = { placa_sena: 'Ej: SENA-00123 (opcional)' };

  columnLabels: Record<string, string> = {
    codigo_sku: 'SKU', placa_sena: 'Placa SENA', producto_nombre: 'Producto', sitio_nombre: 'Sitio', id_sitio: 'Sitio', id_producto: 'Producto',
  };

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

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
      sitio_nombre: this.sitios.find((s) => s.id_sitio === i.id_sitio)?.nombre ?? '—',
    }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [items, sitios, productos] = await Promise.all([
        this.api.listarItems(),
        this.api.listarSitios(),
        this.api.listarProductos(),
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
}
