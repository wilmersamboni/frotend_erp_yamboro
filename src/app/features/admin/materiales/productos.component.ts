import { Component, DoCheck, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { Categoria, Item, MaterialesApiService, Producto, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_TIPO_MATERIAL: OpcionSelect[] = [
  { label: 'Consumo', value: 'CONSUMO' },
  { label: 'Devolutivo', value: 'DEVOLUTIVO' },
  { label: 'Software', value: 'SOFTWARE' },
  { label: 'EPP', value: 'EPP' },
  { label: 'Perecedero', value: 'PERECEDERO' },
];

// Catálogo UNSPSC (Colombia Compra Eficiente) curado para SENA — mismo
// catálogo que usa el sistema hermano de bodega (frontend-proyecto/SGM),
// copiado 1:1 para que ambos sistemas ofrezcan los mismos códigos. Los que
// empiezan en '50' (segmento Alimentos y Bebidas) son "de gastronomía": el
// backend (create-producto.dto.ts) exime el SKU para esos, ver `esGastronomia()`.
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

// Unidades de medida frecuentes en SENA (alimentos, TIC, aseo, herramientas) —
// select en vez de texto libre. Lista completa, usada como fallback cuando
// no hay UNSPSC elegido o su familia no está en UNIDADES_POR_FAMILIA de abajo.
const TODAS_LAS_UNIDADES = [
  'UNIDAD', 'PAR', 'KIT', 'JUEGO', 'SET', 'METRO', 'ROLLO',
  'LITRO', 'MILILITRO', 'GALÓN', 'BOTELLA', 'LATA', 'FRASCO',
  'KILOGRAMO', 'GRAMO', 'LIBRA', 'TONELADA',
  'BULTO', 'PAQUETE', 'CAJA', 'CARTÓN', 'ATADO', 'BOLSA',
  'LICENCIA',
];
const OPCIONES_UNIDAD_MEDIDA: OpcionSelect[] = TODAS_LAS_UNIDADES.map((u) => ({ label: u, value: u }));

// Filtra las unidades ofrecidas según la familia UNSPSC elegida (primeros 4
// dígitos del código) — mismo criterio que SGM (`UNIDADES_POR_FAMILIA`),
// adaptado y extendido acá para cubrir también las familias no-alimenticias
// del catálogo propio del ERP (TIC, aseo, empaques, herramientas de cocina).
const UNIDADES_POR_FAMILIA: Record<string, string[]> = {
  '5010': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'BULTO', 'PAQUETE', 'TONELADA'], // Cereales y granos
  '5011': ['LITRO', 'MILILITRO', 'BOTELLA', 'GALÓN', 'LATA', 'KILOGRAMO'], // Aceites y grasas
  '5012': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'LITRO', 'BOTELLA', 'PAQUETE', 'BULTO'], // Condimentos
  '5013': ['LITRO', 'MILILITRO', 'BOTELLA', 'BOLSA', 'CAJA', 'KILOGRAMO', 'GRAMO', 'UNIDAD'], // Lácteos
  '5014': ['UNIDAD', 'CARTÓN', 'PAQUETE', 'CAJA'], // Huevos
  '5015': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'PAQUETE'], // Carnes
  '5017': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD'], // Pescado
  '5018': ['KILOGRAMO', 'GRAMO', 'LIBRA'], // Mariscos
  '5019': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'BULTO', 'PAQUETE'], // Legumbres
  '5020': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'ATADO', 'PAQUETE', 'BULTO'], // Verduras y tubérculos
  '5021': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'CAJA', 'PAQUETE'], // Frutas
  '5022': ['GRAMO', 'KILOGRAMO', 'PAQUETE', 'FRASCO', 'UNIDAD'], // Especias y hierbas
  '5028': ['GRAMO', 'KILOGRAMO', 'PAQUETE', 'CAJA', 'UNIDAD'], // Café y té
  '5029': ['LITRO', 'BOTELLA', 'UNIDAD'], // Agua y bebidas
  '5030': ['PAQUETE', 'UNIDAD', 'CAJA'], // Pastas y panadería
  '5214': ['UNIDAD', 'JUEGO', 'SET', 'KIT', 'CAJA'], // Utensilios de cocina
  '4810': ['UNIDAD'], // Equipos industriales de cocina
  '2611': ['UNIDAD', 'PAQUETE', 'CAJA'], // Baterías y pilas
  '4713': ['LITRO', 'MILILITRO', 'BOTELLA', 'GALÓN', 'LATA'], // Detergentes y desinfectantes
  '4714': ['UNIDAD', 'PAQUETE', 'CAJA'], // Esponjas, trapeadores, escobas
  '2411': ['ROLLO', 'PAQUETE', 'CAJA', 'METRO'], // Bolsas, film, papel aluminio
  '3120': ['UNIDAD', 'JUEGO', 'SET', 'CAJA'], // Recipientes herméticos
  '2412': ['PAQUETE', 'CAJA', 'UNIDAD'], // Desechables
  '4320': ['UNIDAD'], // Pantallas, proyectores, periféricos de video/audio
  '4321': ['UNIDAD', 'CAJA'], // Computadores y periféricos
  '4319': ['UNIDAD', 'CAJA'], // Almacenamiento (discos, memorias)
  '4322': ['UNIDAD', 'LICENCIA'], // Software y redes
  '4323': ['ROLLO', 'METRO', 'UNIDAD'], // Cableado de red
};

// Unidades de peso válidas para "peso por bulto" — subconjunto de
// OPCIONES_UNIDAD_MEDIDA, mismas 3 que ofrece SGM (unidadesPeso).
const OPCIONES_UNIDAD_PESO: OpcionSelect[] = ['KILOGRAMO', 'GRAMO', 'LIBRA'].map((u) => ({ label: u, value: u }));

// Al crear, `cantidad` genera N Item automáticamente; al editar no aplica
// (UpdateProductoDto no la acepta) — por eso las columnas del modal difieren.
// `SKU` se agrega condicionalmente en los getters `camposCrear`/`camposEditar`
// de abajo: el backend lo exime cuando el UNSPSC es de gastronomía (empieza en
// '50'), así que si el campo se dejara siempre visible confundiría — se oculta
// del todo en ese caso, igual que hace el SGM. `fecha_vencimiento` (solo si
// tipo_material=PERECEDERO) y `unidad_peso_bulto`/`peso_por_bulto` (solo si
// unidad_medida=BULTO/PAQUETE) se agregan igual de condicionalmente — el
// backend ya los acepta (create-producto.dto.ts) pero el formulario nunca
// los pedía, ver Fase 2 del plan.
// `es_psd` NO es un campo del formulario (Ronda 6): se descubrió comparando
// contra SGM que ese sistema tampoco lo expone como campo — lo deriva solo
// de tipo_material === 'PERECEDERO' (ver `onTipoMaterialChange` en
// frontend-proyecto/productos.component.ts). Acá se replica igual: se manda
// calculado en `guardar()`, nunca se pide en el modal.
const CAMPOS_CREAR_BASE  = ['nombre', 'descripcion', 'codigo_unspsc', 'SKU', 'marca', 'modelo', 'tipo_material', 'unidad_medida', 'unidad_peso_bulto', 'peso_por_bulto', 'fecha_vencimiento', 'id_categoria', 'id_sitio', 'cantidad', 'stock_minimo'];
const CAMPOS_EDITAR_BASE = ['nombre', 'descripcion', 'codigo_unspsc', 'SKU', 'marca', 'modelo', 'tipo_material', 'unidad_medida', 'unidad_peso_bulto', 'peso_por_bulto', 'fecha_vencimiento', 'id_categoria', 'id_sitio', 'stock_minimo'];

/**
 * CRUD de Productos (lotes). Crear un producto genera automáticamente
 * `cantidad` Items — la gestión individual de Items (buscar por placa,
 * reasignar sitio, cambiar estado) queda fuera de este slice.
 *
 * Pulido (Ronda 4, Fase 9): al crear (no al editar), el SKU se autogenera a
 * partir del nombre mientras se escribe (prefijo de 3 letras + consecutivo
 * por prefijo, mismo algoritmo que SGM `generarSku()`) — editable a mano en
 * cualquier momento; si se vacía el campo, vuelve al auto-fill. Como
 * `AdminModalComponent` es genérico y no expone un evento por cada
 * keystroke, se implementa con `ngDoCheck` comparando `form['nombre']`/
 * `form['SKU']` contra el último valor visto — Angular corre `ngDoCheck` en
 * cada ciclo de detección de cambios, incluidos los que dispara el modal
 * hijo al mutar el mismo objeto `form` por referencia. El `<select>` de
 * unidad de medida además se filtra por la familia UNSPSC elegida
 * (`UNIDADES_POR_FAMILIA`, arriba).
 */
@Component({
  selector: 'app-materiales-productos',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <h1 class="text-xl font-bold text-gray-800 mb-5">Productos</h1>

      <app-admin-table
        [addLabel]="'Nuevo producto'"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por nombre, SKU, categoría, placa…'"
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
      [placeholders]="placeholders"
      [forzarSelect]="['id_categoria', 'id_sitio']"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class MaterialesProductosComponent implements OnInit, DoCheck {
  private readonly confirm = inject(ConfirmService);

  productos: Producto[] = [];
  categorias: Categoria[] = [];
  sitios: Sitio[] = [];
  /** Solo para que el buscador de la tabla alcance la placa SENA (vive en Item, no en Producto). */
  items: Item[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  /** SKU se oculta del todo cuando el UNSPSC elegido es de gastronomía (empieza en '50') — ver comentario junto a CAMPOS_CREAR_BASE. */
  private esGastronomia(): boolean {
    return !!this.form['codigo_unspsc']?.startsWith('50');
  }

  private esPerecedero(): boolean {
    return this.form['tipo_material'] === 'PERECEDERO';
  }

  private esBulto(): boolean {
    return this.form['unidad_medida'] === 'BULTO' || this.form['unidad_medida'] === 'PAQUETE';
  }

  /** Filtra los campos condicionales (SKU/fecha de vencimiento/peso por bulto) según el estado actual del form — ver Fase 2 del plan. */
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
    cantidad: 'number', stock_minimo: 'number',
    fecha_vencimiento: 'date', peso_por_bulto: 'number',
  };
  placeholders: Record<string, string> = { nombre: 'Ej: Taladro percutor, Guantes de nitrilo…', descripcion: 'Ej: Uso exclusivo del taller de soldadura', SKU: 'Se autogenera si lo dejás vacío (ej. TAL-001)', marca: 'Ej: Bosch, 3M… (opcional)', modelo: 'Ej: GSB 550, 8210 (opcional)', stock_minimo: 'Ej: 5', cantidad: 'Ej: 10', peso_por_bulto: 'Ej: 25' };

  columnLabels: Record<string, string> = {
    categoria_nombre: 'Categoría',
    tipo_material: 'Tipo de material',
    unidad_medida: 'Unidad de medida',
    stock_minimo: 'Stock mínimo',
    codigo_unspsc: 'Código UNSPSC',
    SKU: 'SKU',
    id_categoria: 'Categoría',
    id_sitio: 'Sitio',
    cantidad: 'Cantidad a generar',
    fecha_vencimiento: 'Fecha de vencimiento',
    unidad_peso_bulto: 'Unidad de peso por bulto',
    peso_por_bulto: 'Peso por bulto',
  };

  /** Estado del auto-fill de SKU al crear — ver docblock arriba. */
  private skuEsAuto = true;
  private ultimoNombreVisto = '';
  private ultimoSkuAuto = '';

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngDoCheck(): void {
    if (!this.modalOpen || this.editando) return;
    const nombreActual: string = this.form['nombre'] ?? '';
    const skuActual: string = this.form['SKU'] ?? '';

    // Si el SKU visible no coincide con el último que autogeneré, alguien lo tocó a mano.
    if (skuActual !== this.ultimoSkuAuto) {
      this.skuEsAuto = !skuActual.trim(); // vacío → vuelve al auto-fill; con texto → deja de autogenerar
    }

    if (this.skuEsAuto && nombreActual !== this.ultimoNombreVisto) {
      this.ultimoNombreVisto = nombreActual;
      const nuevoSku = this.generarSku(nombreActual);
      this.form['SKU'] = nuevoSku;
      this.ultimoSkuAuto = nuevoSku;
    }
  }

  /** Prefijo de 3 letras del nombre + consecutivo por prefijo entre los productos ya cargados — mismo algoritmo que SGM. */
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

  /** Unidades ofrecidas según la familia UNSPSC elegida (primeros 4 dígitos) — ver UNIDADES_POR_FAMILIA. */
  private opcionesUnidadMedida(): OpcionSelect[] {
    const familia = (this.form['codigo_unspsc'] ?? '').slice(0, 4);
    const unidades = UNIDADES_POR_FAMILIA[familia];
    return unidades ? unidades.map((u) => ({ label: u, value: u })) : OPCIONES_UNIDAD_MEDIDA;
  }

  get filas(): any[] {
    return this.productos.map((p) => ({
      ...p,
      categoria_nombre: p.categoria?.nombre ?? this.categorias.find((c) => c.id_categoria === p.id_categoria)?.nombre ?? '—',
      // Campo oculto (no está en `columns`) — solo para que el buscador de la tabla matchee por placa SENA.
      _placas: this.items.filter((i) => i.id_producto === p.id_producto).map((i) => i.placa_sena).filter(Boolean).join(' '),
    }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [productos, categorias, sitios, items] = await Promise.all([
        this.api.listarProductos(),
        this.api.listarCategorias(),
        this.api.listarSitios(),
        this.api.listarItems().catch(() => [] as Item[]),
      ]);
      this.productos = productos;
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
    if (this.categorias.length === 0 || this.sitios.length === 0) {
      this.toast.warn('Faltan datos', 'Creá al menos una categoría y un sitio antes de registrar un producto.');
      return;
    }
    this.editando = null;
    this.form = {
      nombre: '', descripcion: '', codigo_unspsc: '', SKU: '', marca: '', modelo: '',
      tipo_material: 'CONSUMO', unidad_medida: '',
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
    const producto = this.productos.find((p) => p.id_producto === fila.id_producto)!;
    this.editando = producto;
    this.form = {
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? '',
      codigo_unspsc: producto.codigo_unspsc ?? '',
      SKU: producto.SKU ?? '',
      marca: producto.marca ?? '',
      modelo: producto.modelo ?? '',
      tipo_material: producto.tipo_material,
      unidad_medida: producto.unidad_medida,
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
    // Solo se mandan si el campo aplica y está visible — mismo criterio que SKU con gastronomía.
    const camposCondicionales = {
      fecha_vencimiento: this.esPerecedero() ? (form['fecha_vencimiento'] || undefined) : undefined,
      unidad_peso_bulto: this.esBulto() ? (form['unidad_peso_bulto'] || undefined) : undefined,
      peso_por_bulto: this.esBulto() && form['peso_por_bulto'] ? Number(form['peso_por_bulto']) : undefined,
    };
    // `es_psd` no lo llena el usuario — se deriva de tipo_material, igual que SGM (Ronda 6).
    const esPsd = this.esPerecedero();
    try {
      if (this.editando) {
        await this.api.actualizarProducto(this.editando.id_producto, {
          nombre: form['nombre'],
          descripcion: form['descripcion'] || undefined,
          codigo_unspsc: form['codigo_unspsc'] || undefined,
          SKU: form['SKU'] || undefined,
          marca: form['marca'] || undefined,
          modelo: form['modelo'] || undefined,
          tipo_material: form['tipo_material'],
          unidad_medida: form['unidad_medida'],
          es_psd: esPsd,
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
          marca: form['marca'] || undefined,
          modelo: form['modelo'] || undefined,
          tipo_material: form['tipo_material'],
          unidad_medida: form['unidad_medida'],
          es_psd: esPsd,
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
    if (!(await this.confirm.ask(`¿Eliminar el producto "${fila.nombre}"?`))) return;
    try {
      await this.api.eliminarProducto(fila.id_producto);
      this.toast.ok('Producto eliminado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar el producto.');
    }
  }
}
