import { Component, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent, TableRowLink } from '../../shared/components/admin-table.component';
import { AdminModalComponent } from '../tenant-administration/ui/admin-modal.component';
import { OpcionSelect } from '../tenant-administration/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Item, MaterialesApiService, Producto, Sitio } from './data-access/materiales-api.service';
import { BarcodeScannerComponent } from '../../shared/scanner/barcode-scanner.component';
import { SyncQueueService } from '../../core/offline/sync-queue.service';
import { OfflineSnapshotService } from '../../core/offline/offline-snapshot.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { AlertComponent } from '../../shared/ui/alert.component';

const OPCIONES_ESTADO: OpcionSelect[] = [
  { label: 'Disponible', value: 'DISPONIBLE' },
  { label: 'Prestado', value: 'PRESTADO' },
  { label: 'Dañado', value: 'DAÑADO' },
  { label: 'Perdido', value: 'PERDIDO' },
  { label: 'En mantenimiento', value: 'EN_MANTENIMIENTO' },
];

const OPCIONES_FILTRO_ESTADO: OpcionSelect[] = [
  { label: 'Todos los estados', value: '' },
  ...OPCIONES_ESTADO,
];

/**
 * Gestión de Ítems individuales (las unidades que genera Productos). No hay
 * alta acá — se crean solo vía Productos, salvo "agregar ítem suelto al
 * lote" — solo edición (placa/sitio/estado) y búsqueda por placa SENA.
 *
 * Crear/editar gateados por servicio (`materiales.items.crear/.editar`) —
 * admin los tiene siempre vía su bundle de rol. Desactivar/Reactivar
 * (`item.activo`, 2026-09-18) usa el mismo servicio `.editar` — no hay
 * `.eliminar` propio en el catálogo de Ítems, a diferencia de Productos, para
 * no sumar un servicio nuevo solo para esto. Es POR ÍTEM, independiente de
 * `producto.activo`: un encargado de bodega solo puede actuar sobre los
 * ítems que están físicamente en SU bodega (`item.id_sitio`), no sobre todo
 * el producto — ver `ItemsService.desactivarItem`.
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
  imports: [AlertComponent, FormsModule, AdminTableComponent, AdminModalComponent, BarcodeScannerComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold text-gray-800">Ítems</h1>
        @if (puedeEditar() && opcionesProductoPlacas.length > 0) {
          <div class="flex gap-2">
            @if (red.alcanzable() && productosConPlacasPendientes.length > 0) {
              <button (click)="prepararOffline()"
                class="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                Preparar para trabajar offline
              </button>
            }
            <button (click)="abrirAsignarPlacas()"
              class="px-3 py-2 text-sm font-medium rounded-lg border border-[#39A900] text-[#39A900] hover:bg-[#39A900]/5 transition-colors">
              Asignar placas SENA
            </button>
          </div>
        }
      </div>

      @if (bodegasInactivas().length > 0) {
        <app-alert class="mb-4" variante="advertencia" [titulo]="bodegasInactivas().length === 1 ? 'Bodega inactiva' : 'Bodegas inactivas'">
          <strong>{{ bodegasInactivas().map(s => s.nombre).join(', ') }}</strong>
          — no se pueden gestionar sus productos, ítems, lotes, solicitudes ni traslados mientras estén así.
        </app-alert>
      }

      <app-admin-table
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por SKU, producto, sitio, estado…'"
        [addLabel]="(puedeCrear() && !bodegaFiltroInactiva) ? 'Agregar ítem' : null"
        (add)="abrirAgregar()"
        [columns]="columnas"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [filterOptions]="estadoOpciones"
        [filterValue]="estadoFiltro"
        filterLabel="Estado"
        (filterValueChange)="estadoFiltro = $event"
        [secondaryFilterOptions]="puedeVerSitios() ? sitioOpciones : null"
        [secondaryFilterValue]="sitioFiltro"
        secondaryFilterLabel="Sitio"
        (secondaryFilterValueChange)="sitioFiltro = $event"
        statusColumn="estado"
        [canEdit]="puedeEditar()"
        [canDelete]="canGestionarActivo"
        [deleteLabel]="labelActivo"
        [rowLinks]="rowLinks"
        (edit)="editar($event)"
        (delete)="toggleActivo($event)" />
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="ítem"
      [columns]="columnasEditar"
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
                @for (p of opcionesProductoPlacas; track p.id_producto) {
                  <option [value]="p.id_producto">{{ p.nombre }} — {{ p.count }} sin placa</option>
                }
              </select>
              @if (!red.alcanzable()) {
                <p class="text-[11px] text-amber-600 mt-1">Sin conexión — mostrando lo preparado la última vez con señal.</p>
              }
            </div>

            @if (filasPlacas.length > 0) {
              <app-barcode-scanner [activo]="asignarPlacasOpen" [modoManual]="false" (scanned)="onCodigoEscaneado($event)"></app-barcode-scanner>

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
export class MaterialesItemsComponent implements OnInit {
  items: Item[] = [];
  sitios: Sitio[] = [];
  productos: Producto[] = [];
  loading = false;
  saving = false;
  error: string | null = null;
  estadoFiltro = '';
  sitioFiltro = '';

  modalOpen = false;
  editando: Item | null = null;
  form: Record<string, any> = {};

  /** "Agregar ítem al lote" — modal aparte, siempre en modo creación. */
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
  /** Productos preparados para escanear/asignar sin red (ver plan de escaneo
   *  offline) — cargado del snapshot local, no de `this.productos`/`this.items`
   *  (que pueden estar vacíos si la PWA se abrió ya sin señal). */
  productosOfflinePreparados: { id_producto: string; nombre: string; count: number }[] = [];

  placeholders: Record<string, string> = { placa_sena: 'Ej: SENA-00123 (opcional)' };

  columnLabels: Record<string, string> = {
    codigo_sku: 'SKU', placa_sena: 'Placa SENA', producto_nombre: 'Producto', sitio_nombre: 'Sitio', id_sitio: 'Sitio', id_producto: 'Producto',
  };

  puedeEditar = computed(() => this.auth.tieneServicio('materiales.items.editar'));
  puedeCrear = computed(() => this.auth.tieneServicio('materiales.items.crear'));
  // `GET /sitios` (backend) ya acepta `materiales.sitios.ver` O
  // `materiales.traslados.crear` (ver SitiosController) — antes acá solo se
  // chequeaba el primero, más estricto de lo que el backend permite, así
  // que alguien con solo `traslados.crear` no cargaba bodegas ni veía el
  // aviso de bodega inactiva (2026-09-18), aunque sí lo viera en Solicitudes.
  puedeVerSitios = computed(() =>
    this.auth.tieneServicio('materiales.sitios.ver') || this.auth.tieneServicio('materiales.traslados.crear'),
  );

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

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private confirm: ConfirmService,
    private syncQueue: SyncQueueService,
    private offlineSnapshot: OfflineSnapshotService,
    public red: NetworkStatusService,
  ) {}

  /** Botón "Desactivar"/"Reactivar" por fila — mismo servicio que editar,
   *  la ubicación real del ítem la valida el backend (`ItemsService
   *  .desactivarItem`/`activarItem`), no esta pantalla. */
  canGestionarActivo = (): boolean => this.puedeEditar();
  labelActivo = (row: any): string => (row.activo === false ? 'Reactivar' : 'Desactivar');

  async toggleActivo(fila: any): Promise<void> {
    const item = this.items.find((i) => i.id_item === fila.id_item);
    if (!item) return;
    const referencia = item.placa_sena || item.codigo_sku || fila.producto_nombre || 'este ítem';
    if (item.activo === false) {
      if (!(await this.confirm.ask(`¿Reactivar "${referencia}"?`, { danger: false, acceptLabel: 'Reactivar' }))) return;
      try {
        await this.api.activarItem(item.id_item);
        this.toast.ok('Ítem reactivado');
        await this.cargar();
      } catch (e) {
        this.toast.httpError(e, 'No se pudo reactivar el ítem.');
      }
      return;
    }
    if (!(await this.confirm.ask(
      `¿Desactivar "${referencia}"? Sale de los selectores de traslados, solicitudes y asignaciones; su histórico (kardex, novedades) queda intacto y podés reactivarlo.`,
      { acceptLabel: 'Desactivar' },
    ))) return;
    try {
      await this.api.desactivarItem(item.id_item);
      this.toast.ok('Ítem desactivado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo desactivar el ítem.');
    }
  }

  ngOnInit(): void {
    this.cargar();
    this.cargarIndexOffline();
  }

  private async cargarIndexOffline(): Promise<void> {
    const snap = await this.offlineSnapshot.obtener<typeof this.productosOfflinePreparados>('materiales.placas', '__index__');
    if (snap) this.productosOfflinePreparados = snap.data;
  }

  get columnas(): string[] {
    const base = ['codigo_sku', 'placa_sena', 'producto_nombre'];
    return this.puedeVerSitios() ? [...base, 'sitio_nombre', 'estado'] : [...base, 'estado'];
  }

  /**
   * Columnas del modal de editar ítem. Sin `materiales.sitios.ver` (caso
   * típico del encargado de bodega, ver encargado-bodega-permisos.service.ts)
   * `this.sitios` llega vacío y el <select> de "id_sitio" no tiene opciones
   * para mostrar — el modal genérico cae a un <input> de texto plano con el
   * UUID crudo del sitio actual. Se oculta el campo en ese caso: el usuario
   * no puede elegir un sitio con sentido sin ver el catálogo, y no lo
   * necesita para su trabajo (usa "Mi Bodega").
   */
  get columnasEditar(): string[] {
    const base = ['placa_sena', 'id_sitio', 'estado'];
    return this.puedeVerSitios() ? base : base.filter((c) => c !== 'id_sitio');
  }

  get opciones(): Record<string, OpcionSelect[]> {
    // Una bodega inactiva no acepta ítems nuevos (ver plan 2026-09-18) — se
    // excluye del selector, salvo que algún ítem YA la tenga asignada (si
    // no, editar ese ítem dejaría el campo en blanco).
    const idsUsados = new Set(this.items.map((i) => i.id_sitio).filter((id): id is string => !!id));
    const disponibles = this.sitios.filter((s) => s.estado || idsUsados.has(s.id_sitio));
    return { id_sitio: disponibles.map((s) => ({ label: s.nombre, value: s.id_sitio })), estado: OPCIONES_ESTADO };
  }

  /** La vista queda acotada a una sola bodega (vía el filtro secundario) y
   *  esa bodega está inactiva — dispara el banner de aviso. */
  get bodegaFiltroInactiva(): boolean {
    if (!this.sitioFiltro) return false;
    return this.sitios.find((s) => s.id_sitio === this.sitioFiltro)?.estado === false;
  }

  /** Banner general de la pantalla — lista todas las bodegas inactivas del
   *  tenant, no solo la que esté filtrada (ver plan 2026-09-18). */
  bodegasInactivas(): Sitio[] {
    return this.sitios.filter((s) => !s.estado);
  }

  readonly estadoOpciones = OPCIONES_FILTRO_ESTADO;

  get sitioOpciones(): OpcionSelect[] {
    return [
      { label: 'Todos los sitios', value: '' },
      ...this.sitios.map((s) => ({ label: s.nombre, value: s.id_sitio })),
    ];
  }

  /** Solo los DEVOLUTIVO se gestionan por ítems/placa — un consumible lleva
   *  lote con saldo contable, no unidades sueltas. */
  private get productosDevolutivos(): Producto[] {
    return this.productos.filter((p) => p.tipo_material === 'DEVOLUTIVO');
  }

  get opcionesAgregar(): Record<string, OpcionSelect[]> {
    return { id_producto: this.productosDevolutivos.map((p) => ({ label: p.SKU ? `${p.nombre} (${p.SKU})` : p.nombre, value: p.id_producto })) };
  }

  get filas(): any[] {
    return this.items
      .filter((i) => !this.estadoFiltro || i.estado === this.estadoFiltro)
      .filter((i) => !this.sitioFiltro || i.id_sitio === this.sitioFiltro)
      .map((i) => ({
        ...i,
        // El SKU pertenece al producto. Un ítem con placa SENA no lo duplica,
        // pero la tabla debe seguir mostrando la referencia del catálogo.
        codigo_sku: i.codigo_sku ?? i.producto?.SKU ?? this.productos.find((p) => p.id_producto === i.id_producto)?.SKU ?? '—',
        producto_nombre:
          (i.producto?.nombre ?? this.productos.find((p) => p.id_producto === i.id_producto)?.nombre ?? '—') +
          (i.activo === false ? '  ·  (inactivo)' : ''),
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
    const devolutivos = this.productosDevolutivos;
    if (devolutivos.length === 0) {
      this.toast.warn('Faltan datos', 'Solo los productos devolutivos se manejan por ítems. Para consumibles registrá un lote.');
      return;
    }
    this.agregarForm = { id_producto: devolutivos[0].id_producto, placa_sena: '' };
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
      .filter((p) => p.tipo_material === 'DEVOLUTIVO' && p.usa_placa_sena !== false)
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

  /** Con red: los productos pendientes en vivo. Sin red: lo que se haya
   *  preparado antes con `prepararOffline()` (índice guardado localmente,
   *  no depende de que `this.productos`/`this.items` sigan en memoria). */
  get opcionesProductoPlacas(): { id_producto: string; nombre: string; count: number }[] {
    return this.red.alcanzable() ? this.productosConPlacasPendientes : this.productosOfflinePreparados;
  }

  /** Descarga un snapshot local (por producto) de los ítems pendientes de
   *  placa — para poder abrir el modal y escanear sin red más adelante. */
  async prepararOffline(): Promise<void> {
    const pendientes = this.productosConPlacasPendientes;
    if (pendientes.length === 0) return;
    for (const p of pendientes) {
      const filas = this.items
        .filter((i) => i.id_producto === p.id_producto && !i.placa_sena?.trim())
        .map((i) => ({ id_item: i.id_item, estado: i.estado }));
      await this.offlineSnapshot.guardar('materiales.placas', p.id_producto, filas);
    }
    this.productosOfflinePreparados = pendientes;
    await this.offlineSnapshot.guardar('materiales.placas', '__index__', this.productosOfflinePreparados);
    this.toast.ok(`Preparado para trabajar offline: ${pendientes.length} producto(s)`);
  }

  abrirAsignarPlacas(): void {
    if (!this.puedeEditar()) return;
    const opciones = this.opcionesProductoPlacas;
    if (opciones.length === 0) return;
    this.placasProductoId = opciones[0].id_producto;
    this.pegado = '';
    this.asignarPlacasError = null;
    this.onProductoPlacasChange();
    this.asignarPlacasOpen = true;
  }

  async onProductoPlacasChange(): Promise<void> {
    this.pegado = '';
    if (!this.placasProductoId) {
      this.filasPlacas = [];
      return;
    }
    if (this.red.alcanzable()) {
      this.filasPlacas = this.items
        .filter((i) => i.id_producto === this.placasProductoId && !i.placa_sena?.trim())
        .map((i) => ({ id_item: i.id_item, estado: i.estado, placa: '' }));
      return;
    }
    const snap = await this.offlineSnapshot.obtener<{ id_item: string; estado: string }[]>(
      'materiales.placas',
      this.placasProductoId,
    );
    this.filasPlacas = (snap?.data ?? []).map((f) => ({ ...f, placa: '' }));
  }

  /** El escáner de cámara escribe en la primera fila sin placa todavía y
   *  avanza — pensado para escanear ítem físico tras ítem físico sin tocar
   *  el teclado. */
  onCodigoEscaneado(codigo: string): void {
    const fila = this.filasPlacas.find((f) => !f.placa.trim());
    if (!fila) {
      this.toast.warn('Sin filas libres', 'Ya completaste todas las placas de este producto.');
      return;
    }
    fila.placa = codigo;
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

    if (!this.red.alcanzable()) {
      await this.encolarPlacasOffline(asignaciones);
      this.asignarPlacasSaving = false;
      return;
    }

    try {
      const { actualizados } = await this.api.asignarPlacasItems(asignaciones);
      this.toast.ok(`Se asignaron ${actualizados} placa(s) SENA`);
      this.asignarPlacasOpen = false;
      await this.cargar();
    } catch (e: any) {
      // status 0 = no llegó al servidor (ver error.interceptor.ts) — puede
      // que `red.alcanzable()` todavía no se haya actualizado (el ping es
      // periódico, no instantáneo ante un corte). Se trata igual que "sin
      // conexión" en vez de mostrar error.
      if (e?.status === 0) {
        await this.encolarPlacasOffline(asignaciones);
      } else {
        this.asignarPlacasError = e?.error?.message ?? 'No se pudieron asignar las placas.';
      }
    } finally {
      this.asignarPlacasSaving = false;
    }
  }

  /** Guarda localmente lo que no se pudo enviar ya — optimista: saca esos
   *  ítems de la grilla y del snapshot para no invitar a re-escanearlos. La
   *  asignación real todavía no ocurrió en el servidor (ver
   *  `SyncQueueService`/reconciliación si el backend luego la rechaza). */
  private async encolarPlacasOffline(asignaciones: { id_item: string; placa_sena: string }[]): Promise<void> {
    await this.syncQueue.enqueue('materiales.asignarPlacas', { asignaciones, id_producto: this.placasProductoId });
    const idsAsignados = new Set(asignaciones.map((a) => a.id_item));
    this.filasPlacas = this.filasPlacas.filter((f) => !idsAsignados.has(f.id_item));
    if (this.placasProductoId) {
      await this.offlineSnapshot.guardar(
        'materiales.placas',
        this.placasProductoId,
        this.filasPlacas.map((f) => ({ id_item: f.id_item, estado: f.estado })),
      );
    }
    this.toast.ok(`Guardado localmente — se enviará cuando haya señal (${asignaciones.length} placa(s))`);
    if (this.filasPlacas.length === 0) this.asignarPlacasOpen = false;
  }
}
