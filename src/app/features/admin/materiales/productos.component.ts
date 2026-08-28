import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { Categoria, MaterialesApiService, Producto, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_TIPO_MATERIAL: OpcionSelect[] = [
  { label: 'Consumo', value: 'CONSUMO' },
  { label: 'Devolutivo', value: 'DEVOLUTIVO' },
  { label: 'Software', value: 'SOFTWARE' },
  { label: 'EPP', value: 'EPP' },
  { label: 'Perecedero', value: 'PERECEDERO' },
];

// Al crear, `cantidad` genera N Item automáticamente; al editar no aplica
// (UpdateProductoDto no la acepta) — por eso las columnas del modal difieren.
const CAMPOS_CREAR  = ['nombre', 'descripcion', 'codigo_unspsc', 'SKU', 'tipo_material', 'unidad_medida', 'es_psd', 'id_categoria', 'id_sitio', 'cantidad', 'stock_minimo'];
const CAMPOS_EDITAR = ['nombre', 'descripcion', 'codigo_unspsc', 'SKU', 'tipo_material', 'unidad_medida', 'es_psd', 'id_categoria', 'id_sitio', 'stock_minimo'];

/**
 * CRUD de Productos (lotes). Crear un producto genera automáticamente
 * `cantidad` Items — la gestión individual de Items (buscar por placa,
 * reasignar sitio, cambiar estado) queda fuera de este slice.
 */
@Component({
  selector: 'app-materiales-productos',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Productos</h1>
        <button (click)="nuevo()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Nuevo producto
        </button>
      </div>

      <app-admin-table
        [rows]="filas"
        [columns]="['nombre', 'categoria_nombre', 'tipo_material', 'unidad_medida', 'stock_minimo']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="producto"
      [columns]="editando ? camposEditar : camposCrear"
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
export class MaterialesProductosComponent implements OnInit {
  productos: Producto[] = [];
  categorias: Categoria[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  camposCrear = CAMPOS_CREAR;
  camposEditar = CAMPOS_EDITAR;

  modalOpen = false;
  editando: Producto | null = null;
  form: Record<string, any> = {};

  tiposCampo: Record<string, string> = { es_psd: 'boolean', cantidad: 'number', stock_minimo: 'number' };
  columnLabels: Record<string, string> = {
    categoria_nombre: 'Categoría',
    tipo_material: 'Tipo de material',
    unidad_medida: 'Unidad de medida',
    stock_minimo: 'Stock mínimo',
    codigo_unspsc: 'Código UNSPSC',
    SKU: 'SKU',
    es_psd: 'Es PSD',
    id_categoria: 'Categoría',
    id_sitio: 'Sitio',
    cantidad: 'Cantidad a generar',
  };

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargar();
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      tipo_material: OPCIONES_TIPO_MATERIAL,
      id_categoria: this.categorias.map((c) => ({ label: c.nombre, value: c.id_categoria })),
      id_sitio: this.sitios.map((s) => ({ label: s.nombre, value: s.id_sitio })),
    };
  }

  get filas(): any[] {
    return this.productos.map((p) => ({
      ...p,
      categoria_nombre: p.categoria?.nombre ?? this.categorias.find((c) => c.id_categoria === p.id_categoria)?.nombre ?? '—',
    }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [productos, categorias, sitios] = await Promise.all([
        this.api.listarProductos(),
        this.api.listarCategorias(),
        this.api.listarSitios(),
      ]);
      this.productos = productos;
      this.categorias = categorias;
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los productos.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (this.categorias.length === 0 || this.sitios.length === 0) {
      this.toast.warn('Faltan datos', 'Creá al menos una categoría y un sitio antes de registrar un producto.');
      return;
    }
    this.editando = null;
    this.form = {
      nombre: '', descripcion: '', codigo_unspsc: '', SKU: '',
      tipo_material: 'CONSUMO', unidad_medida: '', es_psd: false,
      id_categoria: this.categorias[0].id_categoria,
      id_sitio: this.sitios[0].id_sitio,
      cantidad: 1, stock_minimo: 1,
    };
    this.error = null;
    this.modalOpen = true;
  }

  editar(fila: any): void {
    const producto = this.productos.find((p) => p.id_producto === fila.id_producto)!;
    this.editando = producto;
    this.form = {
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? '',
      codigo_unspsc: producto.codigo_unspsc ?? '',
      SKU: producto.SKU ?? '',
      tipo_material: producto.tipo_material,
      unidad_medida: producto.unidad_medida,
      es_psd: producto.es_psd,
      id_categoria: producto.id_categoria,
      id_sitio: producto.id_sitio ?? this.sitios[0]?.id_sitio,
      stock_minimo: producto.stock_minimo,
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
    if (!form['unidad_medida']?.trim()) {
      this.error = 'La unidad de medida es obligatoria.';
      return;
    }
    this.saving = true;
    this.error = null;
    try {
      if (this.editando) {
        await this.api.actualizarProducto(this.editando.id_producto, {
          nombre: form['nombre'],
          descripcion: form['descripcion'] || undefined,
          codigo_unspsc: form['codigo_unspsc'] || undefined,
          SKU: form['SKU'] || undefined,
          tipo_material: form['tipo_material'],
          unidad_medida: form['unidad_medida'],
          es_psd: !!form['es_psd'],
          id_categoria: Number(form['id_categoria']),
          id_sitio: Number(form['id_sitio']),
          stock_minimo: Number(form['stock_minimo']),
        });
        this.toast.ok('Producto actualizado');
      } else {
        const cantidad = Number(form['cantidad']) || 1;
        const { items_generados } = await this.api.crearProducto({
          nombre: form['nombre'],
          descripcion: form['descripcion'] || undefined,
          codigo_unspsc: form['codigo_unspsc'] || undefined,
          SKU: form['SKU'] || undefined,
          tipo_material: form['tipo_material'],
          unidad_medida: form['unidad_medida'],
          es_psd: !!form['es_psd'],
          id_categoria: Number(form['id_categoria']),
          id_sitio: Number(form['id_sitio']),
          cantidad,
          stock_minimo: Number(form['stock_minimo']),
        });
        this.toast.ok('Producto creado', `Se generaron ${items_generados.length} ítem(s).`);
      }
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar el producto.';
    } finally {
      this.saving = false;
    }
  }

  async eliminar(fila: any): Promise<void> {
    if (!confirm(`¿Eliminar el producto "${fila.nombre}"?`)) return;
    try {
      await this.api.eliminarProducto(fila.id_producto);
      this.toast.ok('Producto eliminado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar el producto.');
    }
  }
}
