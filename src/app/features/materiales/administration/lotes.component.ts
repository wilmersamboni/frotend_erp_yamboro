import { Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminTableComponent, TableRowLink } from '../../../shared/components/admin-table.component';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { AdminModalComponent } from '../../tenant-administration/ui/admin-modal.component';
import { OpcionSelect } from '../../tenant-administration/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService, mensajeDeError } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { CreateLoteDto, Lote, MaterialesApiService, Producto, Sitio } from '../data-access/materiales-api.service';
import { ExportColumn, TableExportService } from '../../../shared/services/table-export.service';
import { CargasSecundarias } from '../data-access/cargas-secundarias';
import { AvisoCargasComponent } from '../ui/aviso-cargas.component';
import { MaterialesScreenPolicy } from '../ui/materiales-screen-policy';
import { codigoLoteSugerido } from '../codigo-lote.util';

const OPCIONES_ESTADO: OpcionSelect[] = [
  { label: 'Activo', value: 'ACTIVO' },
  { label: 'Agotado', value: 'AGOTADO' },
  { label: 'Vencido', value: 'VENCIDO' },
  { label: 'Dado de baja', value: 'DADO_DE_BAJA' },
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
import { EditarCaracteristicasModalComponent, ObjetivoCaracteristicas } from '../ui/editar-caracteristicas-modal.component';
import { resumenCaracteristicas } from '../caracteristicas-equipo.util';

@Component({
  selector: 'app-materiales-lotes',
  standalone: true,
  imports: [EditarCaracteristicasModalComponent, AvisoCargasComponent, FormsModule, AdminTableComponent, AdminModalComponent, DialogDirective],
  template: `
    <div class="p-6">
      <nav aria-label="Migas de pan" class="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <span>Materiales</span><span aria-hidden="true">/</span><span>Inventario</span><span aria-hidden="true">/</span><span aria-current="page" class="font-semibold text-gray-800">Lotes</span>
      </nav>
      <div class="flex items-center justify-between gap-2 mb-5">
        <div class="flex items-center gap-2">
          <h1 class="text-xl font-bold text-gray-800">Material que se Gasta<span class="block text-xs font-normal text-gray-400">antes «Lotes»</span></h1>
        @if (idProductoFiltro) {
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#39A900]/10 text-[#2d8000] border border-[#39A900]/20">
            Filtrando por producto
            <button aria-label="Quitar filtro" (click)="quitarFiltroProducto()" class="hover:text-red-600" title="Quitar filtro">×</button>
          </span>
        }
        </div>
        <div class="flex gap-2">
          <button type="button" (click)="exportarExcel()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-[#39A900] hover:text-[#267700]" aria-label="Exportar lotes a Excel">Excel</button>
          <button type="button" (click)="exportarPdf()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-[#39A900] hover:text-[#267700]" aria-label="Exportar lotes a PDF">PDF</button>
        </div>
      </div>

      <app-aviso-cargas [cargas]="secundarias" (reintentar)="recargar()" />

      <app-admin-table
        [addLabel]="puedeCrear() ? 'Nuevo lote' : null"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por producto, código de lote, sitio…'"
        [columns]="['producto_nombre', 'codigo_lote', 'disponible', 'unidad_medida', 'vence', 'caracteristicas_resumen', 'sitio_nombre', 'estado']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="puedeEditar()"
        [canDelete]="puedeEliminar()"
        [rowLinks]="accionesFila"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    @if (bajaDe; as b) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="bajaDe = null">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-bold text-gray-800">Dar de baja el lote</h2>
          <p class="text-sm text-gray-500 mt-1">
            {{ b.producto_nombre }}{{ b.codigo_lote ? ' · lote ' + b.codigo_lote : '' }}: quedan <strong>{{ b.cantidad_disponible }}</strong>.
            Pasa a 0 y queda como <em>dado de baja</em>; su historial se conserva completo.
          </p>
          <label class="block text-xs font-medium text-gray-600 mt-4 mb-1">Motivo <span class="text-red-500">*</span></label>
          <textarea rows="3" [(ngModel)]="motivoBaja" maxlength="500" placeholder="Ej: se venció y se desechó; se dañó con humedad; se perdió en el traslado"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"></textarea>
          @if (errorBaja) { <p class="text-red-600 text-xs mt-2 p-2 bg-red-50 rounded-lg">{{ errorBaja }}</p> }
          <div class="flex justify-end gap-2 mt-5">
            <button (click)="bajaDe = null" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
            <button (click)="confirmarBaja()" [disabled]="saving || motivoBaja.trim().length < 5"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg bg-red-600 disabled:opacity-50">{{ saving ? 'Guardando…' : 'Dar de baja' }}</button>
          </div>
        </div>
      </div>
    }

    <!-- Características del lote (campos propios: nombre + valor, 2026-10-09). Se abre solo al registrar un lote. -->
    <app-editar-caracteristicas-modal [objetivo]="caracObjetivo" (cerrado)="caracObjetivo = null" (guardado)="onCaracteristicasGuardadas($event)" />

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="lote"
      [columns]="camposModal"
      [form]="form"
      [opciones]="opciones"
      [tiposCampo]="tiposCampo"
      [minDateToday]="['fecha_vencimiento']"
      [fechasLimpiables]="['fecha_vencimiento']"
      [minDateFields]="{ fecha_vencimiento: 'fecha_ingreso' }"
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
  /** Catálogos auxiliares de la pantalla: si uno falla se avisa, no se muestra vacío. */
  readonly secundarias = new CargasSecundarias();
  readonly recargar = (): void => void this.cargar();
  private readonly acceso = inject(MaterialesScreenPolicy);
  private readonly confirm = inject(ConfirmService);

  lotes: Lote[] = [];
  productos: Producto[] = [];
  sitios: Sitio[] = [];
  /** Sitios donde el usuario puede crear o mover lotes: sus bodegas o su área liderada. */
  sitiosGestionables: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  editando: Lote | null = null;
  form: Record<string, any> = {};

  /**
   * `unidad_medida` del lote se SACÓ del formulario (2026-09-11): antes era un
   * segundo campo independiente con su propio vocabulario abreviado
   * (und/kg/cja…), distinto del vocabulario del producto (UNIDAD/KILOGRAMO…
   * elegido por familia UNSPSC) — se podían guardar valores que no
   * coincidían entre sí (reporte QA: "la cantidad inicial no dice de qué,
   * y la unidad se pide dos veces y salió distinta"). Ahora el lote SIEMPRE
   * hereda `producto.unidad_medida` (ver `guardar()`); el label de
   * "Cantidad inicial"/"Disponible" muestra esa unidad entre paréntesis.
   */
  get columnLabels(): Record<string, string> {
    const u = this.productoDelForm?.unidad_medida;
    return {
      producto_nombre: 'Producto', codigo_lote: 'Código lote', disponible: 'Disponible', caracteristicas_resumen: 'Características',
      unidad_medida: 'Unidad', vence: 'Vence', sitio_nombre: 'Sitio', estado: 'Estado',
      id_producto: 'Producto', id_sitio: 'Sitio',
      cantidad_inicial: u ? `Cantidad inicial (en ${u})` : 'Cantidad inicial',
      cantidad_disponible: u ? `Disponible (en ${u})` : 'Disponible',
      fecha_vencimiento: 'Fecha de vencimiento',
    };
  }

  /** Alta: el código que se generará si se deja vacío (2026-10-06); se puede escribir otro. */
  get placeholders(): Record<string, string> {
    const producto = this.editando ? null : this.productos.find((p) => p.id_producto === this.form['id_producto']);
    return {
      codigo_lote: this.editando
        ? 'Ej: ANE-06-10-26'
        : producto
          ? `Vacío = automático: ${codigoLoteSugerido(producto.nombre)}`
          : 'Vacío = se genera solo',
      cantidad_inicial: 'Ej: 500',
    };
  }

  /** `fecha_vencimiento` como calendario desplegable (no <input> de texto). */
  tiposCampo: Record<string, string> = { fecha_vencimiento: 'date' };

  /** `?id_producto=` de la navegación cruzada (Productos → Lotes). */
  idProductoFiltro: string | null = null;

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.lotes.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.lotes.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.lotes.eliminar'));

  // ── Dar de baja (2026-10-07): la salida honesta cuando un lote no se puede eliminar ──
  bajaDe: any | null = null;
  motivoBaja = '';
  errorBaja: string | null = null;
  readonly accionesFila: TableRowLink[] = [
    {
      label: 'Características',
      onClick: (row) => this.abrirCaracteristicas(row),
      visible: () => this.puedeEditar(),
    },
    {
      label: 'Dar de baja',
      onClick: (row) => this.abrirBaja(row),
      visible: (row) => this.puedeEditar() && row.estado !== 'DADO_DE_BAJA',
    },
  ];

  abrirBaja(row: any): void {
    this.bajaDe = row;
    this.motivoBaja = '';
    this.errorBaja = null;
  }

  async confirmarBaja(): Promise<void> {
    const b = this.bajaDe;
    if (!b || this.motivoBaja.trim().length < 5) return;
    this.saving = true;
    this.errorBaja = null;
    try {
      await this.api.darDeBajaLote(b.id_lote, this.motivoBaja.trim());
      this.toast.ok('Lote dado de baja', 'Quedó en 0 y su historial se conserva.');
      this.bajaDe = null;
      await this.cargar();
    } catch (e) {
      this.errorBaja = mensajeDeError(e, 'No se pudo dar de baja el lote.');
    } finally {
      this.saving = false;
    }
  }

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private exporter: TableExportService,
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

  /**
   * El producto elegido (alta) o el del lote en edición. Al editar se usa la
   * relación incluida en el lote como respaldo: la lista auxiliar de
   * productos puede venir recortada por permisos o alcance y no debe ocultar
   * la fecha de vencimiento de un lote perecedero ya existente.
   */
  private get productoDelForm(): { tipo_material: string; unidad_medida?: string } | undefined {
    const id = this.editando ? this.editando.id_producto : this.form['id_producto'];
    return this.productos.find((p) => p.id_producto === id) ?? this.editando?.producto;
  }

  /**
   * "Fecha de vencimiento" — antes solo se mostraba para PERECEDERO. Un
   * CONSUMO también puede vencer (ej. un insumo químico, un medicamento) sin
   * ser tan crítico como para forzar el seguimiento de vencimientos que sí
   * aplica a PERECEDERO — por eso ahora se muestra para ambos, siempre
   * opcional (el backend nunca la exigió: `CreateLoteDto.fecha_vencimiento`
   * es `@IsOptional()` sin importar el tipo de material).
   */
  get mostrarVencimiento(): boolean {
    const tipo = this.productoDelForm?.tipo_material;
    return tipo === 'PERECEDERO' || tipo === 'CONSUMO';
  }

  get camposModal(): string[] {
    // `unidad_medida` NO va en el form — se hereda siempre de `producto.unidad_medida`.
    const venc = this.mostrarVencimiento ? ['fecha_vencimiento'] : [];
    return this.editando
      ? ['codigo_lote', ...venc, 'id_sitio', 'cantidad_disponible', 'estado']
      : ['id_producto', 'cantidad_inicial', 'codigo_lote', ...venc, 'id_sitio'];
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      id_producto: this.productosLoteables.map((p) => ({ label: p.SKU ? `${p.nombre} (${p.SKU})` : p.nombre, value: p.id_producto })),
      id_sitio: this.sitiosGestionables.map((s) => ({ label: s.nombre, value: s.id_sitio })),
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
        caracteristicas_resumen: resumenCaracteristicas(l.caracteristicas) || '—',
      }));
  }

  // ── Características del lote (2026-10-09): campos propios, sin historial (un lote se consume) ──
  caracObjetivo: ObjetivoCaracteristicas | null = null;

  abrirCaracteristicas(row: { id_lote: string }): void {
    const l = this.lotes.find((x) => x.id_lote === row.id_lote);
    if (!l) return;
    this.caracObjetivo = {
      tipo: 'lote',
      id: l.id_lote,
      id_producto: l.id_producto,
      titulo: `${l.producto?.nombre ?? 'Lote'} · ${l.codigo_lote || 'sin código'}`,
      codigoPlantilla: null,
      caracteristicas: { ...(l.caracteristicas ?? {}) },
    };
  }

  onCaracteristicasGuardadas(c: Record<string, string>): void {
    const id = this.caracObjetivo?.id;
    this.lotes = this.lotes.map((l) => (l.id_lote === id ? { ...l, caracteristicas: c } : l));
    this.caracObjetivo = null;
  }

  private readonly exportColumns: ExportColumn<any>[] = [
    { label: 'Producto', value: (f) => f.producto_nombre }, { label: 'Código lote', value: (f) => f.codigo_lote },
    { label: 'Disponible', value: (f) => f.disponible }, { label: 'Unidad', value: (f) => f.unidad_medida },
    { label: 'Vence', value: (f) => f.vence }, { label: 'Sitio', value: (f) => f.sitio_nombre }, { label: 'Estado', value: (f) => f.estado },
  ];

  exportarExcel(): void { void this.exporter.excel('lotes', 'Lotes', this.exportColumns, this.filas); }
  exportarPdf(): void { void this.exporter.pdf('lotes', 'Lotes', this.exportColumns, this.filas); }

  private async cargar(): Promise<void> {
    this.loading = true;
    this.secundarias.reiniciar();
    try {
      // Lo que el usuario no puede leer (caso típico: /sitios para un
      // aprendiz) ni se pide — mismo criterio que Items/Productos.
      const verSitios = this.acceso.puedeListar('sitios');
      const [lotes, productos, sitios, sitiosGestionables] = await Promise.all([
        this.api.listarLotes(),
        this.secundarias.cargar('productos', () => this.api.listarProductos(), this.acceso.puedeListar('productos')),
        this.secundarias.cargar('bodegas', () => this.api.listarSitios(), verSitios),
        this.auth.isAdmin()
          ? this.secundarias.cargar('bodegas', () => this.api.listarSitios(), verSitios)
          : this.secundarias.cargar('bodegas a tu cargo', () => this.api.sitiosACargo()),
      ]);
      this.lotes = lotes;
      this.productos = productos;
      this.sitiosGestionables = sitiosGestionables;
      this.sitios = sitios.length ? sitios : sitiosGestionables;
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
    if (this.sitiosGestionables.length === 0) {
      this.toast.warn('Sin bodega a cargo', 'Solo podés crear lotes en una bodega asignada a vos o que pertenezca a un área que liderás.');
      return;
    }
    this.editando = null;
    const primero = loteables[0];
    this.form = {
      id_producto: primero.id_producto, cantidad_inicial: null,
      codigo_lote: '', fecha_vencimiento: null,
      // La ficha no tiene bodega: con una sola bodega a cargo se precarga esa.
      id_sitio: this.sitiosGestionables.length === 1 ? this.sitiosGestionables[0].id_sitio : '',
    };
    this.error = null;
    this.modalOpen = true;
  }

  /** La ficha no tiene bodega (2026-10-05): cambiar el producto no cambia la bodega elegida. */
  onCampoModal(_e: { col: string; value: any }): void {}

  editar(fila: any): void {
    if (!this.puedeEditar()) return;
    const l = this.lotes.find((x) => x.id_lote === fila.id_lote);
    if (!l) return;
    this.editando = l;
    this.form = {
      codigo_lote: l.codigo_lote ?? '',
      // El calendario recibe siempre `YYYY-MM-DD`; la API puede serializar el
      // DATE de PostgreSQL como ISO con hora, por eso se descarta ese sufijo.
      fecha_vencimiento: this.fechaParaFormulario(l.fecha_vencimiento),
      // No es un campo editable del form (no está en `tiposCampo`/`campos`) —
      // solo viaja acá para que `minDateFields` pueda usarlo como piso del
      // calendario de `fecha_vencimiento` (no puede vencer antes de existir).
      fecha_ingreso: this.fechaParaFormulario(l.fecha_ingreso),
      id_sitio: l.id_sitio ?? null, cantidad_disponible: l.cantidad_disponible, estado: l.estado,
    };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void { this.modalOpen = false; }

  private fechaParaFormulario(fecha: string | null | undefined): string | null {
    const coincidencia = String(fecha ?? '').match(/^\d{4}-\d{2}-\d{2}/);
    return coincidencia?.[0] ?? null;
  }

  async guardar(form: Record<string, any>): Promise<void> {
    if (this.editando ? !this.puedeEditar() : !this.puedeCrear()) return;
    this.saving = true;
    this.error = null;
    try {
      // Solo mandamos fecha de vencimiento si el producto la admite (PERECEDERO o CONSUMO) — siempre opcional.
      const fechaVenc = this.mostrarVencimiento ? (form['fecha_vencimiento'] || undefined) : undefined;
      // Al editar, una fecha vaciada se manda como `null` para borrarla en el
      // backend (con `undefined` el PATCH la dejaba como estaba).
      const fechaVencEditar = this.mostrarVencimiento ? (form['fecha_vencimiento'] || null) : undefined;
      // El lote SIEMPRE hereda la unidad de medida de su producto — nunca se
      // pregunta aparte (evita que diverjan, ej. "kg" del lote vs "KILOGRAMO"
      // del producto). Al editar, esto también auto-corrige un lote viejo
      // cuya unidad hubiera quedado desalineada.
      const unidadHeredada = this.productoDelForm?.unidad_medida || undefined;
      if (this.editando) {
        await this.api.actualizarLote(this.editando.id_lote, {
          codigo_lote: form['codigo_lote'] || undefined,
          unidad_medida: unidadHeredada,
          fecha_vencimiento: fechaVencEditar,
          id_sitio: form['id_sitio'] || undefined,
          cantidad_disponible: form['cantidad_disponible'] != null ? Number(form['cantidad_disponible']) : undefined,
          estado: form['estado'] || undefined,
        });
        this.toast.ok('Lote actualizado');
      } else {
        const dto: CreateLoteDto = {
          id_producto: form['id_producto'],
          cantidad_inicial: Number(form['cantidad_inicial'] ?? 0),
          unidad_medida: unidadHeredada,
          codigo_lote: form['codigo_lote'] || undefined,
          fecha_vencimiento: fechaVenc,
          id_sitio: form['id_sitio'] || undefined,
        };
        const creado = await this.api.crearLote(dto);
        this.toast.ok('Lote registrado', 'Si quieres, agrégale sus características (opcional).');
        this.modalOpen = false;
        await this.cargar();
        // Paso siguiente al registrar: las características del lote nuevo (se puede cerrar sin llenar nada).
        if (this.puedeEditar()) this.abrirCaracteristicas(creado);
        return;
      }
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = mensajeDeError(e, 'No se pudo guardar el lote.');
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
    } catch (e: any) {
      // 409: el lote tiene historia (vino de una llegada o ya se movió). El
      // mensaje del backend dice qué hacer; se ofrece la baja de una vez.
      if (e?.status === 409 && this.puedeEditar() && fila.estado !== 'DADO_DE_BAJA') {
        this.toast.warn('No se puede eliminar', mensajeDeError(e, 'El lote tiene historia.'), 9000);
        this.abrirBaja(fila);
      } else {
        this.toast.httpError(e, 'No se pudo eliminar el lote.');
      }
    }
  }
}
