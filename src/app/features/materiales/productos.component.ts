import { Component, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminTableComponent, TableRowLink } from '../../shared/components/admin-table.component';
import { ProductoFormModalComponent } from '../../shared/components/producto-form-modal.component';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Categoria, Item, MaterialesApiService, Producto, Sitio } from '../../core/services/materiales/materiales-api.service';

/**
 * CRUD de Productos. Crear un producto DEVOLUTIVO genera automáticamente
 * `cantidad` Items; en CONSUMO/PERECEDERO el stock se carga aparte como
 * lote(s) en el módulo de Lotes — ver `MaterialesApiService.crearProducto`.
 *
 * El formulario de crear/editar vive en `<app-producto-form-modal>`
 * (`shared/components/producto-form-modal.component.ts`) — antes era un
 * diálogo propio acá mismo, ahora es el ÚNICO formulario de producto del
 * sistema: `features/mi-bodega/mi-bodega.component.ts` (consola del
 * encargado de bodega, cualquier cargo) usa exactamente el mismo componente
 * en vez de su propia versión reducida (sin UNSPSC/marca/modelo/placa
 * SENA/SKU automático) que tenía antes.
 *
 * Componente único para admin/instructor/aprendiz (plan de unificación) —
 * antes vivía triplicado en `features/{admin,instructor,aprendiz}/materiales/`,
 * con el catálogo UNSPSC (100+ líneas) copiado 1:1 en cada copia. El gating
 * por servicio (`puedeCrear/Editar/Eliminar`) reemplaza al gate por cargo:
 * admin trae todos los servicios de Materiales por su bundle de rol.
 *
 * Navegación cruzada (rowLinks): desde un producto, ir directo a sus
 * Existencias / Kardex / Lotes ya filtrados por `id_producto`.
 */
@Component({
  selector: 'app-materiales-productos',
  standalone: true,
  imports: [FormsModule, RouterLink, AdminTableComponent, ProductoFormModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Productos</h1>
        @if (puedeCrear()) {
          <a routerLink="/materiales/importar"
            class="group inline-flex items-center gap-1.5 text-xs font-semibold rounded-full pl-2.5 pr-3.5 py-2 border border-[#39A900]/25 text-[#2d8000] bg-[#39A900]/[0.07] shadow-sm hover:bg-[#39A900]/15 hover:border-[#39A900]/45 transition-colors">
            <svg class="w-4 h-4 transition-transform group-hover:translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Importar
          </a>
        }
      </div>

      <app-admin-table
        [addLabel]="puedeCrear() ? 'Nuevo producto' : null"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por nombre, SKU, categoría, placa…'"
        [columns]="['nombre', 'categoria_nombre', 'tipo_material', 'unidad_medida', 'stock_minimo']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [filterOptions]="puedeEliminar() ? estadoOpciones : null"
        [filterValue]="estadoFiltro"
        filterLabel="Estado"
        (filterValueChange)="onEstadoFiltro($event)"
        [canEdit]="puedeEditar() && estadoFiltro === 'activos'"
        [canDelete]="puedeEliminar() && estadoFiltro !== 'todos'"
        [deleteLabel]="estadoFiltro === 'inactivos' ? 'Reactivar' : 'Desactivar'"
        [rowLinks]="rowLinks"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    <app-producto-form-modal
      [open]="modalOpen"
      [editando]="editando"
      [categorias]="categorias"
      [sitios]="sitios"
      [productosExistentes]="productos"
      (closed)="cerrarModal()"
      (guardado)="onProductoGuardado()" />
  `,
})
export class MaterialesProductosComponent implements OnInit {
  productos: Producto[] = [];
  categorias: Categoria[] = [];
  sitios: Sitio[] = [];
  /** Solo para que el buscador de la tabla alcance la placa SENA (vive en Item, no en Producto). */
  items: Item[] = [];
  loading = false;

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.productos.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.productos.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.productos.eliminar'));
  puedeVerSitios = computed(() => this.auth.tieneServicio('materiales.sitios.ver'));

  modalOpen = false;
  editando: Producto | null = null;

  columnLabels: Record<string, string> = {
    categoria_nombre: 'Categoría',
    tipo_material: 'Tipo de material',
    unidad_medida: 'Unidad de medida',
    stock_minimo: 'Stock mínimo',
  };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private confirm: ConfirmService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  /**
   * Navegación cruzada: desde un producto, ir directo a su stock/movimientos/
   * lotes ya filtrados. Existencias está unificado (una ruta para los 3
   * cargos); Kardex bifurca por cargo y Lotes es admin-only.
   */
  readonly rowLinks: TableRowLink[] = [
    { label: 'Existencias', routerLink: () => ['/materiales/existencias'], queryParams: (r) => ({ id_producto: r.id_producto }) },
    {
      label: 'Kardex',
      routerLink: () => [this.auth.isAdmin() ? '/materiales/kardex' : '/instructor/materiales/kardex'],
      queryParams: (r) => ({ id_producto: r.id_producto }),
      // Antes solo miraba el cargo ('instructor'), no el servicio real — un
      // instructor común ya NO tiene `materiales.kardex.ver` por defecto
      // desde el recorte de 2026-09-16, así que el link quedaba visible pero
      // llevaba a una ruta que el roleGuard rebotaba al Home. Sigue
      // apareciendo para quien SÍ lo tiene (encargado de bodega/líder de
      // área, vía su bundle).
      visible: () => this.auth.isAdmin() || this.auth.tieneServicio('materiales.kardex.ver'),
    },
    {
      label: 'Lotes',
      routerLink: () => ['/materiales/lotes'],
      queryParams: (r) => ({ id_producto: r.id_producto }),
      visible: () => this.auth.isAdmin(),
    },
  ];

  /** B1 — filtro de estado del toolbar (solo se ofrece a quien puede desactivar).
   *  'todos' = activos + desactivados mezclados, solo lectura (default);
   *  'activos' = solo activos, editable/desactivable; 'inactivos' = solo los
   *  desactivados, para reactivarlos. Edit/Reactivar/Desactivar quedan
   *  deshabilitados en 'todos' porque `<app-admin-table>` no soporta un
   *  label o permiso distinto por fila — mezclar activos/inactivos en la
   *  misma tabla haría ambiguo un solo botón "Desactivar"/"Reactivar" para
   *  toda la tabla. Para mutar un registro, cambiar a la vista específica. */
  readonly estadoOpciones = [
    { value: 'todos', label: 'Todos' },
    { value: 'activos', label: 'Activos' },
    { value: 'inactivos', label: 'Desactivados' },
  ];
  estadoFiltro: 'todos' | 'activos' | 'inactivos' = 'todos';

  get filas(): any[] {
    return this.productos.map((p) => ({
      ...p,
      nombre: (p as any).activo === false ? `${p.nombre}  ·  (desactivado)` : p.nombre,
      categoria_nombre: p.categoria?.nombre ?? this.categorias.find((c) => c.id_categoria === p.id_categoria)?.nombre ?? '—',
      // Campo oculto (no está en `columns`) — solo para que el buscador de la tabla matchee por placa SENA.
      _placas: this.items.filter((i) => i.id_producto === p.id_producto).map((i) => i.placa_sena).filter(Boolean).join(' '),
    }));
  }

  onEstadoFiltro(v: string): void {
    this.estadoFiltro = v === 'inactivos' || v === 'activos' ? v : 'todos';
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // Un aprendiz o instructor comunes ya NO traen por defecto
      // `materiales.sitios.ver`/`materiales.categorias.ver`/`materiales.items.ver`
      // — ninguna de las tres se pide siquiera si no se tiene el servicio (no
      // alcanza con un `.catch()`: la petición igual sale y queda como 403 de
      // ruido en la consola/red aunque no rompa la pantalla). Sin categorías
      // no se pierde nada visible: el nombre ya llega embebido en
      // `producto.categoria`.
      const verSitios = this.puedeVerSitios();
      const verCategorias = this.auth.tieneServicio('materiales.categorias.ver');
      const verItems = this.auth.tieneServicio('materiales.items.ver');
      // Quien no puede desactivar tampoco ve el filtro (línea 61) — para esa
      // audiencia el comportamiento se mantiene igual que siempre: solo activos.
      const incluirInactivos = this.puedeEliminar() && this.estadoFiltro !== 'activos';
      const [productos, categorias, sitios, items] = await Promise.all([
        this.api.listarProductos(incluirInactivos),
        verCategorias ? this.api.listarCategorias().catch(() => [] as Categoria[]) : Promise.resolve([] as Categoria[]),
        verSitios ? this.api.listarSitios().catch(() => [] as Sitio[]) : Promise.resolve([] as Sitio[]),
        verItems ? this.api.listarItems().catch(() => [] as Item[]) : Promise.resolve([] as Item[]),
      ]);
      // `listarProductos(true)` trae activos + desactivados; en modo
      // "Desactivados" nos quedamos solo con los que están dados de baja, en
      // "Todos" se muestran ambos tal cual llegan.
      this.productos = this.estadoFiltro === 'inactivos'
        ? productos.filter((p) => (p as any).activo === false)
        : productos;
      this.categorias = categorias;
      this.sitios = sitios;
      this.items = items;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los productos.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (!this.puedeCrear()) return;
    if (this.categorias.length === 0) {
      this.toast.warn('Faltan datos', 'Creá al menos una categoría antes de registrar un producto.');
      return;
    }
    this.editando = null;
    this.modalOpen = true;
  }

  editar(fila: any): void {
    if (!this.puedeEditar()) return;
    const producto = this.productos.find((p) => p.id_producto === fila.id_producto)!;
    this.editando = producto;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async onProductoGuardado(): Promise<void> {
    this.modalOpen = false;
    await this.cargar();
  }

  /** B1 — el botón de la derecha es "Desactivar" (soft-delete) o "Reactivar" según el modo. */
  async eliminar(fila: any): Promise<void> {
    if (!this.puedeEliminar()) return;
    const p = this.productos.find((x) => x.id_producto === fila.id_producto);
    const nombre = p?.nombre ?? 'este producto';

    if (this.estadoFiltro === 'inactivos') {
      if (!(await this.confirm.ask(`¿Reactivar el producto "${nombre}"?`, { danger: false, acceptLabel: 'Reactivar' }))) return;
      try {
        await this.api.activarProducto(fila.id_producto);
        this.toast.ok('Producto reactivado');
        await this.cargar();
      } catch (e) {
        this.toast.httpError(e, 'No se pudo reactivar el producto.');
      }
      return;
    }

    if (!(await this.confirm.ask(
      `¿Desactivar el producto "${nombre}"? Sale de las listas y los selects; su histórico (kardex, préstamos, lotes) queda intacto y podés reactivarlo.`,
      { acceptLabel: 'Desactivar' },
    ))) return;
    try {
      await this.api.eliminarProducto(fila.id_producto);
      this.toast.ok('Producto desactivado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo desactivar el producto.');
    }
  }
}
