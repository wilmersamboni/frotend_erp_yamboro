import { Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { CreateLoteDto, Lote, MaterialesApiService, Producto, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_ESTADO: OpcionSelect[] = [
  { label: 'Activo', value: 'ACTIVO' },
  { label: 'Agotado', value: 'AGOTADO' },
  { label: 'Vencido', value: 'VENCIDO' },
  { label: 'Dado de baja', value: 'DADO_DE_BAJA' },
];

const OPCIONES_UNIDAD: OpcionSelect[] = [
  { label: 'Unidades (und)', value: 'und' }, { label: 'Cajas (cja)', value: 'cja' },
  { label: 'Paquetes (paq)', value: 'paq' }, { label: 'Resmas (res)', value: 'res' },
  { label: 'Bolsas (bol)', value: 'bol' }, { label: 'Rollos (rol)', value: 'rol' },
  { label: 'Litros (L)', value: 'L' }, { label: 'Mililitros (mL)', value: 'mL' },
  { label: 'Kilogramos (kg)', value: 'kg' }, { label: 'Gramos (g)', value: 'g' },
];

/**
 * Lotes — stock CONTABLE de consumibles (portado de SigMat). Un lote lleva
 * `cantidad_disponible` que baja/sube con los movimientos, en vez de N ítems
 * individuales. El alta escribe un movimiento de kardex ENTRADA.
 *
 * Ruta abierta a admin/instructor/aprendiz por `materiales.lotes.ver` (antes
 * era admin-only por `roles`, aunque instructor/aprendiz ya tenían `.ver` de
 * catálogo por defecto — quedaban con el servicio pero sin forma de llegar a
 * la pantalla). Crear/editar/eliminar sí quedan gateados acá por servicio —
 * antes los botones se mostraban siempre, confiando en que el admin fuera el
 * único que pudiera llegar a verlos.
 */
@Component({
  selector: 'app-materiales-lotes',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center gap-2 mb-5">
        <h1 class="text-xl font-bold text-gray-800">Lotes</h1>
        @if (idProductoFiltro) {
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#39A900]/10 text-[#2d8000] border border-[#39A900]/20">
            Filtrando por producto
            <button (click)="quitarFiltroProducto()" class="hover:text-red-600" title="Quitar filtro">×</button>
          </span>
        }
      </div>

      <app-admin-table
        [addLabel]="puedeCrear() ? 'Nuevo lote' : null"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por producto, código de lote, sitio…'"
        [columns]="['producto_nombre', 'codigo_lote', 'disponible', 'unidad_medida', 'vence', 'sitio_nombre', 'estado']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="puedeEditar()"
        [canDelete]="puedeEliminar()"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="lote"
      [columns]="camposModal"
      [form]="form"
      [opciones]="opciones"
      [placeholders]="placeholders"
      [columnLabels]="columnLabels"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (fieldChange)="onCampoModal($event)"
      (saved)="guardar($event)" />
  `,
})
export class MaterialesLotesComponent implements OnInit {
  private readonly confirm = inject(ConfirmService);

  lotes: Lote[] = [];
  productos: Producto[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  editando: Lote | null = null;
  form: Record<string, any> = {};

  columnLabels: Record<string, string> = {
    producto_nombre: 'Producto', codigo_lote: 'Código lote', disponible: 'Disponible',
    unidad_medida: 'Unidad', vence: 'Vence', sitio_nombre: 'Sitio', estado: 'Estado',
    id_producto: 'Producto', id_sitio: 'Sitio', cantidad_inicial: 'Cantidad inicial',
    cantidad_disponible: 'Disponible', fecha_vencimiento: 'Fecha de vencimiento',
  };

  placeholders: Record<string, string> = {
    codigo_lote: 'Ej: LT-2026-014', cantidad_inicial: 'Ej: 500',
  };

  /** `?id_producto=` de la navegación cruzada (Productos → Lotes). */
  idProductoFiltro: string | null = null;

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.lotes.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.lotes.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.lotes.eliminar'));

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.idProductoFiltro = this.route.snapshot.queryParamMap.get('id_producto');
    this.cargar();
  }

  quitarFiltroProducto(): void {
    this.idProductoFiltro = null;
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  /** Solo los CONSUMO/PERECEDERO llevan lote — un DEVOLUTIVO se gestiona por ítems con placa. */
  private get productosLoteables(): Producto[] {
    return this.productos.filter((p) => p.tipo_material !== 'DEVOLUTIVO');
  }

  /** El producto elegido (alta) o el del lote en edición. */
  private get productoDelForm(): Producto | undefined {
    const id = this.editando ? this.editando.id_producto : this.form['id_producto'];
    return this.productos.find((p) => p.id_producto === id);
  }

  get esPerecedero(): boolean {
    return this.productoDelForm?.tipo_material === 'PERECEDERO';
  }

  get camposModal(): string[] {
    // "Fecha de vencimiento" solo aplica si el producto del lote es PERECEDERO.
    const venc = this.esPerecedero ? ['fecha_vencimiento'] : [];
    return this.editando
      ? ['codigo_lote', 'unidad_medida', ...venc, 'id_sitio', 'cantidad_disponible', 'estado']
      : ['id_producto', 'cantidad_inicial', 'unidad_medida', 'codigo_lote', ...venc, 'id_sitio'];
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      id_producto: this.productosLoteables.map((p) => ({ label: p.SKU ? `${p.nombre} (${p.SKU})` : p.nombre, value: p.id_producto })),
      id_sitio: this.sitios.map((s) => ({ label: s.nombre, value: s.id_sitio })),
      unidad_medida: OPCIONES_UNIDAD,
      estado: OPCIONES_ESTADO,
    };
  }

  get filas(): any[] {
    return this.lotes
      .filter((l) => !this.idProductoFiltro || l.id_producto === this.idProductoFiltro)
      .map((l) => ({
        ...l,
        producto_nombre: l.producto?.nombre ?? '—',
        disponible: `${l.cantidad_disponible} / ${l.cantidad_inicial}`,
        vence: l.fecha_vencimiento ? String(l.fecha_vencimiento).slice(0, 10) : '—',
        sitio_nombre: this.sitios.find((s) => s.id_sitio === l.id_sitio)?.nombre ?? '—',
      }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // Sin `materiales.sitios.ver` (caso típico de aprendiz) ni se pide
      // /sitios ni se deja que un 403 ahí muestre el toast global — mismo
      // criterio que Items/Productos.
      const verSitios = this.auth.tieneServicio('materiales.sitios.ver');
      const [lotes, productos, sitios] = await Promise.all([
        this.api.listarLotes(),
        this.api.listarProductos().catch(() => []),
        verSitios ? this.api.listarSitios().catch(() => []) : Promise.resolve([]),
      ]);
      this.lotes = lotes;
      this.productos = productos;
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los lotes.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (!this.puedeCrear()) return;
    const loteables = this.productosLoteables;
    if (loteables.length === 0) {
      this.toast.warn('Faltan datos', 'Creá al menos un producto de consumo o perecedero antes de registrar un lote.');
      return;
    }
    this.editando = null;
    const primero = loteables[0];
    this.form = {
      id_producto: primero.id_producto, cantidad_inicial: null, unidad_medida: 'und',
      codigo_lote: '', fecha_vencimiento: null,
      // Precarga la bodega "de casa" del producto — editable si el lote va a otra.
      id_sitio: primero.id_sitio ?? null,
    };
    this.error = null;
    this.modalOpen = true;
  }

  /** Al cambiar el producto en el alta, precarga su bodega por defecto (queda editable). */
  onCampoModal(e: { col: string; value: any }): void {
    if (e.col !== 'id_producto' || this.editando) return;
    const prod = this.productos.find((p) => p.id_producto === e.value);
    if (prod?.id_sitio) this.form['id_sitio'] = prod.id_sitio;
  }

  editar(fila: any): void {
    if (!this.puedeEditar()) return;
    const l = this.lotes.find((x) => x.id_lote === fila.id_lote);
    if (!l) return;
    this.editando = l;
    this.form = {
      codigo_lote: l.codigo_lote ?? '', unidad_medida: l.unidad_medida ?? 'und',
      fecha_vencimiento: l.fecha_vencimiento ? String(l.fecha_vencimiento).slice(0, 10) : null,
      id_sitio: l.id_sitio ?? null, cantidad_disponible: l.cantidad_disponible, estado: l.estado,
    };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void { this.modalOpen = false; }

  async guardar(form: Record<string, any>): Promise<void> {
    if (this.editando ? !this.puedeEditar() : !this.puedeCrear()) return;
    this.saving = true;
    this.error = null;
    try {
      // Solo mandamos fecha de vencimiento si el producto del lote es perecedero.
      const fechaVenc = this.esPerecedero ? (form['fecha_vencimiento'] || undefined) : undefined;
      if (this.editando) {
        await this.api.actualizarLote(this.editando.id_lote, {
          codigo_lote: form['codigo_lote'] || undefined,
          unidad_medida: form['unidad_medida'] || undefined,
          fecha_vencimiento: fechaVenc,
          id_sitio: form['id_sitio'] || undefined,
          cantidad_disponible: form['cantidad_disponible'] != null ? Number(form['cantidad_disponible']) : undefined,
          estado: form['estado'] || undefined,
        });
        this.toast.ok('Lote actualizado');
      } else {
        const dto: CreateLoteDto = {
          id_producto: form['id_producto'],
          cantidad_inicial: Number(form['cantidad_inicial'] ?? 0),
          unidad_medida: form['unidad_medida'] || undefined,
          codigo_lote: form['codigo_lote'] || undefined,
          fecha_vencimiento: fechaVenc,
          id_sitio: form['id_sitio'] || undefined,
        };
        await this.api.crearLote(dto);
        this.toast.ok('Lote registrado');
      }
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar el lote.';
    } finally {
      this.saving = false;
    }
  }

  async eliminar(fila: any): Promise<void> {
    if (!this.puedeEliminar()) return;
    if (!(await this.confirm.ask(`¿Eliminar el lote ${fila.codigo_lote || ''} de "${fila.producto_nombre}"?`))) return;
    try {
      await this.api.eliminarLote(fila.id_lote);
      this.toast.ok('Lote eliminado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar el lote.');
    }
  }
}
