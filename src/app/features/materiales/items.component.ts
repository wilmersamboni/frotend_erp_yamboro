import { Component, OnInit, computed } from '@angular/core';
import { AdminTableComponent, TableRowLink } from '../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../shared/components/admin-modal.component';
import { OpcionSelect } from '../admin/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Item, MaterialesApiService, Producto, Sitio } from '../../core/services/materiales/materiales-api.service';

const OPCIONES_ESTADO: OpcionSelect[] = [
  { label: 'Disponible', value: 'DISPONIBLE' },
  { label: 'Prestado', value: 'PRESTADO' },
  { label: 'Dañado', value: 'DAÑADO' },
  { label: 'Perdido', value: 'PERDIDO' },
  { label: 'En mantenimiento', value: 'EN_MANTENIMIENTO' },
];

/**
 * Gestión de Ítems individuales (las unidades que genera Productos). No hay
 * alta acá — se crean solo vía Productos, salvo "agregar ítem suelto al
 * lote" — solo edición (placa/sitio/estado) y búsqueda por placa SENA.
 *
 * Crear/editar gateados por servicio (`materiales.items.crear/.editar`; no
 * hay `.eliminar` en el catálogo, los ítems no se borran individualmente) —
 * admin los tiene siempre vía su bundle de rol.
 *
 * La columna "Sitio" y su carga (`listarSitios()`) dependen de
 * `materiales.sitios.ver`: sin ese permiso (el caso típico de aprendiz) ni
 * se pide el endpoint ni se muestra la columna — antes un 403 ahí tumbaba
 * toda la carga de Ítems.
 *
 * Componente único para admin/instructor/aprendiz (ítem 5 del plan de
 * unificación) — antes vivía triplicado en
 * `features/{admin,instructor,aprendiz}/materiales/`.
 *
 * Navegación cruzada (ítem 4): "Kardex"/"Novedades" por fila.
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
        [addLabel]="puedeCrear() ? 'Agregar ítem' : null"
        (add)="abrirAgregar()"
        [columns]="columnas"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="puedeEditar()"
        [canDelete]="false"
        [rowLinks]="rowLinks"
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

  /** "Agregar ítem al lote" — modal aparte, siempre en modo creación. */
  agregarOpen = false;
  agregarForm: Record<string, any> = {};
  agregarSaving = false;
  agregarError: string | null = null;

  placeholders: Record<string, string> = { placa_sena: 'Ej: SENA-00123 (opcional)' };

  columnLabels: Record<string, string> = {
    codigo_sku: 'SKU', placa_sena: 'Placa SENA', producto_nombre: 'Producto', sitio_nombre: 'Sitio', id_sitio: 'Sitio', id_producto: 'Producto',
  };

  puedeEditar = computed(() => this.auth.tieneServicio('materiales.items.editar'));
  puedeCrear = computed(() => this.auth.tieneServicio('materiales.items.crear'));
  puedeVerSitios = computed(() => this.auth.tieneServicio('materiales.sitios.ver'));

  /**
   * Navegación cruzada (ítem 4): desde un ítem, ir directo a su historial de
   * movimientos/novedades. Kardex y Novedades NO se unificaron (ítem 5) —
   * siguen con ruta propia por rol — así que acá sí hace falta bifurcar
   * según el cargo. Aprendiz no tiene ninguna de las dos pantallas: los
   * links se ocultan del todo para ese cargo.
   */
  readonly rowLinks: TableRowLink[] = [
    {
      label: 'Kardex',
      routerLink: () => [this.auth.isAdmin() ? '/materiales/kardex' : '/instructor/materiales/kardex'],
      queryParams: (r) => ({ id_item: r.id_item }),
      visible: () => this.auth.isAdmin() || this.auth.cargo() === 'instructor',
    },
    {
      label: 'Novedades',
      routerLink: () => [this.auth.isAdmin() ? '/materiales/novedades' : '/instructor/materiales/novedades'],
      queryParams: (r) => ({ id_item: r.id_item }),
      visible: () => this.auth.isAdmin() || this.auth.cargo() === 'instructor',
    },
  ];

  constructor(private api: MaterialesApiService, private toast: ToastService, private auth: AuthService) {}

  ngOnInit(): void {
    this.cargar();
  }

  get columnas(): string[] {
    const base = ['codigo_sku', 'placa_sena', 'producto_nombre'];
    return this.puedeVerSitios() ? [...base, 'sitio_nombre', 'estado'] : [...base, 'estado'];
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
      // Sin `materiales.sitios.ver` no se pide /sitios — antes un 403 ahí
      // tumbaba toda la carga de Ítems.
      const verSitios = this.puedeVerSitios();
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
}
