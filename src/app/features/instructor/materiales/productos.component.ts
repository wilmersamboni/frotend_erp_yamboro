import { Component, DoCheck, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Categoria, MaterialesApiService, Producto, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_TIPO_MATERIAL: OpcionSelect[] = [
  { label: 'Consumo', value: 'CONSUMO' },
  { label: 'Devolutivo', value: 'DEVOLUTIVO' },
  { label: 'Software', value: 'SOFTWARE' },
  { label: 'EPP', value: 'EPP' },
  { label: 'Perecedero', value: 'PERECEDERO' },
];

// Mismo catálogo UNSPSC curado que la versión admin
// (features/admin/materiales/productos.component.ts) — ver ese archivo para
// el comentario completo sobre el origen y la decisión de mantenerlo
// hardcodeado (pendiente de revisar tabla+búsqueda server-side más adelante).
const OPCIONES_UNSPSC: OpcionSelect[] = [
  { label: '50101501 - Arroz', value: '50101501' },
  { label: '50101701 - Harina de trigo', value: '50101701' },
  { label: '50101702 - Harina de maíz', value: '50101702' },
  { label: '50111501 - Aceite vegetal comestible', value: '50111501' },
  { label: '50111601 - Mantequilla', value: '50111601' },
  { label: '50111602 - Margarina', value: '50111602' },
  { label: '50121501 - Azúcar refinada', value: '50121501' },
  { label: '50121901 - Sal de mesa', value: '50121901' },
  { label: '50122001 - Vinagre', value: '50122001' },
  { label: '50131501 - Leche entera pasteurizada', value: '50131501' },
  { label: '50131502 - Leche descremada', value: '50131502' },
  { label: '50131601 - Crema de leche', value: '50131601' },
  { label: '50131701 - Queso fresco', value: '50131701' },
  { label: '50141501 - Huevos de gallina', value: '50141501' },
  { label: '50151501 - Pollo entero fresco', value: '50151501' },
  { label: '50151502 - Carne de res fresca', value: '50151502' },
  { label: '50151601 - Cerdo fresco', value: '50151601' },
  { label: '50171501 - Pescado fresco', value: '50171501' },
  { label: '50181501 - Camarón fresco', value: '50181501' },
  { label: '50191501 - Legumbres secas (lentejas, frijoles, garbanzos)', value: '50191501' },
  { label: '50201501 - Papas frescas', value: '50201501' },
  { label: '50201502 - Cebollas frescas', value: '50201502' },
  { label: '50201503 - Tomates frescos', value: '50201503' },
  { label: '50201701 - Zanahorias frescas', value: '50201701' },
  { label: '50211501 - Manzanas frescas', value: '50211501' },
  { label: '50211502 - Plátanos frescos', value: '50211502' },
  { label: '50221501 - Especias y condimentos', value: '50221501' },
  { label: '50221502 - Hierbas aromáticas secas', value: '50221502' },
  { label: '50281501 - Café molido', value: '50281501' },
  { label: '50281701 - Té en bolsas', value: '50281701' },
  { label: '50291501 - Agua embotellada', value: '50291501' },
  { label: '50301701 - Pasta alimentaria', value: '50301701' },
  { label: '50301801 - Pan industrial', value: '50301801' },
  { label: '52141501 - Ollas de acero inoxidable', value: '52141501' },
  { label: '52141502 - Sartenes de acero inoxidable', value: '52141502' },
  { label: '52141601 - Tablas de cortar plásticas', value: '52141601' },
  { label: '52141701 - Cuchillos de cocina profesional', value: '52141701' },
  { label: '52141702 - Juego de cuchillos de chef', value: '52141702' },
  { label: '52141801 - Cucharones y espumaderas', value: '52141801' },
  { label: '52141901 - Bowls de acero inoxidable', value: '52141901' },
  { label: '52142001 - Bandejas de hornear', value: '52142001' },
  { label: '52142101 - Coladeras y coladores', value: '52142101' },
  { label: '52142201 - Peladores de verduras', value: '52142201' },
  { label: '52142301 - Batidores de alambre (globo)', value: '52142301' },
  { label: '52142401 - Termómetros de cocina', value: '52142401' },
  { label: '48101701 - Licuadora industrial', value: '48101701' },
  { label: '48101702 - Batidora de pedestal industrial', value: '48101702' },
  { label: '48101801 - Horno de convección', value: '48101801' },
  { label: '48102001 - Freidora industrial', value: '48102001' },
  { label: '48102101 - Plancha de cocina industrial', value: '48102101' },
  { label: '26111701 - Baterías recargables', value: '26111701' },
  { label: '26111702 - Pilas alcalinas', value: '26111702' },
  { label: '48102301 - Estufa industrial a gas', value: '48102301' },
  { label: '47131501 - Detergente desengrasante para cocina', value: '47131501' },
  { label: '47131502 - Desinfectante multiusos para superficies', value: '47131502' },
  { label: '47131601 - Jabón antibacterial líquido', value: '47131601' },
  { label: '47131701 - Blanqueador / hipoclorito de sodio', value: '47131701' },
  { label: '47141501 - Esponjas y estropajos', value: '47141501' },
  { label: '47141601 - Guantes de caucho para limpieza', value: '47141601' },
  { label: '47141701 - Traperos y mochos', value: '47141701' },
  { label: '47141702 - Escobas y cepillos', value: '47141702' },
  { label: '24111501 - Bolsas plásticas para alimentos', value: '24111501' },
  { label: '24111601 - Film plástico / vinipel', value: '24111601' },
  { label: '24111701 - Papel aluminio para cocina', value: '24111701' },
  { label: '24111801 - Papel encerado para alimentos', value: '24111801' },
  { label: '31201501 - Recipientes herméticos plásticos', value: '31201501' },
  { label: '24121501 - Contenedores desechables de icopor', value: '24121501' },
  { label: '24121601 - Vasos desechables de plástico', value: '24121601' },
  { label: '24121701 - Cubiertos desechables', value: '24121701' },
  { label: '43211501 - Computador de escritorio (PC)', value: '43211501' },
  { label: '43211503 - Computador portátil / laptop', value: '43211503' },
  { label: '43211507 - Servidor de red', value: '43211507' },
  { label: '43211604 - Teclado USB', value: '43211604' },
  { label: '43211605 - Mouse / ratón óptico', value: '43211605' },
  { label: '43211901 - Memoria USB / pendrive', value: '43211901' },
  { label: '43211702 - Impresora de inyección de tinta', value: '43211702' },
  { label: '43211701 - Equipo de lectura de código de barras', value: '43211701' },
  { label: '43212105 - Tableta electrónica (tablet)', value: '43212105' },
  { label: '43201401 - Proyector multimedia / video beam', value: '43201401' },
  { label: '43201405 - Pantalla interactiva / smartboard', value: '43201405' },
  { label: '43201601 - Monitor de computador', value: '43201601' },
  { label: '43202201 - Cámara web / webcam', value: '43202201' },
  { label: '43201801 - Audífonos con micrófono (headset)', value: '43201801' },
  { label: '43191501 - Disco duro externo', value: '43191501' },
  { label: '43191602 - Tarjeta de memoria SD', value: '43191602' },
  { label: '43221501 - Software de sistema operativo', value: '43221501' },
  { label: '43221502 - Software de ofimática (Office)', value: '43221502' },
  { label: '43221701 - Software antivirus / seguridad', value: '43221701' },
  { label: '43222601 - Router / enrutador de red', value: '43222601' },
  { label: '43222602 - Switch de red', value: '43222602' },
  { label: '43222603 - Punto de acceso inalámbrico (WiFi)', value: '43222603' },
  { label: '43222501 - UPS / sistema de alimentación ininterrumpida', value: '43222501' },
  { label: '43231501 - Cable de red UTP', value: '43231501' },
];

const TODAS_LAS_UNIDADES = [
  'UNIDAD', 'PAR', 'KIT', 'JUEGO', 'SET', 'METRO', 'ROLLO',
  'LITRO', 'MILILITRO', 'GALÓN', 'BOTELLA', 'LATA', 'FRASCO',
  'KILOGRAMO', 'GRAMO', 'LIBRA', 'TONELADA',
  'BULTO', 'PAQUETE', 'CAJA', 'CARTÓN', 'ATADO', 'BOLSA',
  'LICENCIA',
];
const OPCIONES_UNIDAD_MEDIDA: OpcionSelect[] = TODAS_LAS_UNIDADES.map((u) => ({ label: u, value: u }));

// Mismo mapa que la versión admin (ver ese archivo para el detalle completo por familia).
const UNIDADES_POR_FAMILIA: Record<string, string[]> = {
  '5010': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'BULTO', 'PAQUETE', 'TONELADA'],
  '5011': ['LITRO', 'MILILITRO', 'BOTELLA', 'GALÓN', 'LATA', 'KILOGRAMO'],
  '5012': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'LITRO', 'BOTELLA', 'PAQUETE', 'BULTO'],
  '5013': ['LITRO', 'MILILITRO', 'BOTELLA', 'BOLSA', 'CAJA', 'KILOGRAMO', 'GRAMO', 'UNIDAD'],
  '5014': ['UNIDAD', 'CARTÓN', 'PAQUETE', 'CAJA'],
  '5015': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'PAQUETE'],
  '5017': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD'],
  '5018': ['KILOGRAMO', 'GRAMO', 'LIBRA'],
  '5019': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'BULTO', 'PAQUETE'],
  '5020': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'ATADO', 'PAQUETE', 'BULTO'],
  '5021': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'CAJA', 'PAQUETE'],
  '5022': ['GRAMO', 'KILOGRAMO', 'PAQUETE', 'FRASCO', 'UNIDAD'],
  '5028': ['GRAMO', 'KILOGRAMO', 'PAQUETE', 'CAJA', 'UNIDAD'],
  '5029': ['LITRO', 'BOTELLA', 'UNIDAD'],
  '5030': ['PAQUETE', 'UNIDAD', 'CAJA'],
  '5214': ['UNIDAD', 'JUEGO', 'SET', 'KIT', 'CAJA'],
  '4810': ['UNIDAD'],
  '2611': ['UNIDAD', 'PAQUETE', 'CAJA'],
  '4713': ['LITRO', 'MILILITRO', 'BOTELLA', 'GALÓN', 'LATA'],
  '4714': ['UNIDAD', 'PAQUETE', 'CAJA'],
  '2411': ['ROLLO', 'PAQUETE', 'CAJA', 'METRO'],
  '3120': ['UNIDAD', 'JUEGO', 'SET', 'CAJA'],
  '2412': ['PAQUETE', 'CAJA', 'UNIDAD'],
  '4320': ['UNIDAD'],
  '4321': ['UNIDAD', 'CAJA'],
  '4319': ['UNIDAD', 'CAJA'],
  '4322': ['UNIDAD', 'LICENCIA'],
  '4323': ['ROLLO', 'METRO', 'UNIDAD'],
};

const OPCIONES_UNIDAD_PESO: OpcionSelect[] = ['KILOGRAMO', 'GRAMO', 'LIBRA'].map((u) => ({ label: u, value: u }));

// SKU/fecha_vencimiento/unidad_peso_bulto/peso_por_bulto se agregan
// condicionalmente en los getters camposCrear/camposEditar de abajo — ver
// el comentario completo en la versión admin de este componente.
const CAMPOS_CREAR_BASE  = ['nombre', 'descripcion', 'codigo_unspsc', 'SKU', 'tipo_material', 'unidad_medida', 'unidad_peso_bulto', 'peso_por_bulto', 'es_psd', 'fecha_vencimiento', 'id_categoria', 'id_sitio', 'cantidad', 'stock_minimo'];
const CAMPOS_EDITAR_BASE = ['nombre', 'descripcion', 'codigo_unspsc', 'SKU', 'tipo_material', 'unidad_medida', 'unidad_peso_bulto', 'peso_por_bulto', 'es_psd', 'fecha_vencimiento', 'id_categoria', 'id_sitio', 'stock_minimo'];

/**
 * Catálogo de productos para instructor — crear/editar/eliminar gateado por
 * servicio (`materiales.productos.crear/.editar/.eliminar`), no por cargo.
 * Ver plan "Ronda 3". Pulido (Ronda 4, Fase 9): auto-SKU al crear + unidad
 * de medida filtrada por familia UNSPSC — ver docblock de la versión admin.
 */
@Component({
  selector: 'app-instructor-materiales-productos',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Productos</h1>
        @if (puedeCrear()) {
          <button (click)="nuevo()"
            class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style="background-color: #39A900">
            + Nuevo producto
          </button>
        }
      </div>

      <app-admin-table
        [rows]="filas"
        [columns]="['nombre', 'categoria_nombre', 'tipo_material', 'unidad_medida', 'stock_minimo']"
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
export class InstructorMaterialesProductosComponent implements OnInit, DoCheck {
  productos: Producto[] = [];
  categorias: Categoria[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  private esGastronomia(): boolean {
    return !!this.form['codigo_unspsc']?.startsWith('50');
  }
  private esPerecedero(): boolean {
    return this.form['tipo_material'] === 'PERECEDERO';
  }
  private esBulto(): boolean {
    return this.form['unidad_medida'] === 'BULTO' || this.form['unidad_medida'] === 'PAQUETE';
  }
  private filtrarCamposCondicionales(campos: string[]): string[] {
    return campos.filter((c) => {
      if (c === 'SKU') return !this.esGastronomia();
      if (c === 'fecha_vencimiento') return this.esPerecedero();
      if (c === 'unidad_peso_bulto' || c === 'peso_por_bulto') return this.esBulto();
      return true;
    });
  }
  get camposCrear(): string[] {
    return this.filtrarCamposCondicionales(CAMPOS_CREAR_BASE);
  }
  get camposEditar(): string[] {
    return this.filtrarCamposCondicionales(CAMPOS_EDITAR_BASE);
  }

  modalOpen = false;
  editando: Producto | null = null;
  form: Record<string, any> = {};

  tiposCampo: Record<string, string> = {
    es_psd: 'boolean', cantidad: 'number', stock_minimo: 'number',
    fecha_vencimiento: 'date', peso_por_bulto: 'number',
  };
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
    fecha_vencimiento: 'Fecha de vencimiento',
    unidad_peso_bulto: 'Unidad de peso por bulto',
    peso_por_bulto: 'Peso por bulto',
  };

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.productos.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.productos.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.productos.eliminar'));

  /** Estado del auto-fill de SKU al crear — ver docblock de la versión admin. */
  private skuEsAuto = true;
  private ultimoNombreVisto = '';
  private ultimoSkuAuto = '';

  constructor(private api: MaterialesApiService, private toast: ToastService, private auth: AuthService) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngDoCheck(): void {
    if (!this.modalOpen || this.editando) return;
    const nombreActual: string = this.form['nombre'] ?? '';
    const skuActual: string = this.form['SKU'] ?? '';
    if (skuActual !== this.ultimoSkuAuto) {
      this.skuEsAuto = !skuActual.trim();
    }
    if (this.skuEsAuto && nombreActual !== this.ultimoNombreVisto) {
      this.ultimoNombreVisto = nombreActual;
      const nuevoSku = this.generarSku(nombreActual);
      this.form['SKU'] = nuevoSku;
      this.ultimoSkuAuto = nuevoSku;
    }
  }

  private generarSku(nombre: string): string {
    const limpio = nombre.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const prefijo = limpio.substring(0, 3);
    if (!prefijo) return '';
    const nums = this.productos
      .map((p) => {
        const sku = (p.SKU ?? '').toUpperCase();
        if (!sku.startsWith(prefijo + '-')) return NaN;
        return parseInt(sku.split('-').pop() ?? '', 10);
      })
      .filter((n) => !isNaN(n) && n > 0);
    const siguiente = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `${prefijo}-${siguiente}`;
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      tipo_material: OPCIONES_TIPO_MATERIAL,
      codigo_unspsc: OPCIONES_UNSPSC,
      unidad_medida: this.opcionesUnidadMedida(),
      unidad_peso_bulto: OPCIONES_UNIDAD_PESO,
      id_categoria: this.categorias.map((c) => ({ label: c.nombre, value: c.id_categoria })),
      id_sitio: this.sitios.map((s) => ({ label: s.nombre, value: s.id_sitio })),
    };
  }

  private opcionesUnidadMedida(): OpcionSelect[] {
    const familia = (this.form['codigo_unspsc'] ?? '').slice(0, 4);
    const unidades = UNIDADES_POR_FAMILIA[familia];
    return unidades ? unidades.map((u) => ({ label: u, value: u })) : OPCIONES_UNIDAD_MEDIDA;
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
    if (!this.puedeCrear()) return;
    if (this.categorias.length === 0 || this.sitios.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos una categoría y un sitio antes de registrar un producto.');
      return;
    }
    this.editando = null;
    this.form = {
      nombre: '', descripcion: '', codigo_unspsc: '', SKU: '',
      tipo_material: 'CONSUMO', unidad_medida: '', es_psd: false,
      fecha_vencimiento: '', unidad_peso_bulto: '', peso_por_bulto: '',
      id_categoria: this.categorias[0].id_categoria,
      id_sitio: this.sitios[0].id_sitio,
      cantidad: 1, stock_minimo: 1,
    };
    this.skuEsAuto = true;
    this.ultimoNombreVisto = '';
    this.ultimoSkuAuto = '';
    this.error = null;
    this.modalOpen = true;
  }

  editar(fila: any): void {
    if (!this.puedeEditar()) return;
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
      fecha_vencimiento: producto.fecha_vencimiento ?? '',
      unidad_peso_bulto: producto.unidad_peso_bulto ?? '',
      peso_por_bulto: producto.peso_por_bulto ?? '',
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
    if (!this.esGastronomia() && !form['SKU']?.trim()) {
      this.error = 'El SKU es obligatorio salvo para productos de gastronomía (código UNSPSC que empieza en 50).';
      return;
    }
    this.saving = true;
    this.error = null;
    const camposCondicionales = {
      fecha_vencimiento: this.esPerecedero() ? (form['fecha_vencimiento'] || undefined) : undefined,
      unidad_peso_bulto: this.esBulto() ? (form['unidad_peso_bulto'] || undefined) : undefined,
      peso_por_bulto: this.esBulto() && form['peso_por_bulto'] ? Number(form['peso_por_bulto']) : undefined,
    };
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
          id_categoria: form['id_categoria'],
          id_sitio: form['id_sitio'],
          stock_minimo: Number(form['stock_minimo']),
          ...camposCondicionales,
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
          id_categoria: form['id_categoria'],
          id_sitio: form['id_sitio'],
          cantidad,
          stock_minimo: Number(form['stock_minimo']),
          ...camposCondicionales,
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
    if (!this.puedeEliminar()) return;
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
