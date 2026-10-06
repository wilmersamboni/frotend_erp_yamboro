import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { filter, firstValueFrom, map, Observable, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';

// Materiales vive dentro de backend-epsas-horarios (mismo backend que
// horarios/encuestas, puerto 3001, prefijo api2 vía proxy) — no es un
// backend aparte.
const BASE = environment.apiPracticaUrl;

export type TipoSitio = 'BODEGA' | 'AMBIENTE' | 'LABORATORIO' | 'OTRO';
export type TipoMaterial = 'CONSUMO' | 'DEVOLUTIVO' | 'PERECEDERO';
export type EstadoItem = 'DISPONIBLE' | 'PRESTADO' | 'DAÑADO' | 'PERDIDO' | 'EN_MANTENIMIENTO';
export type EstadoLote = 'ACTIVO' | 'AGOTADO' | 'VENCIDO' | 'DADO_DE_BAJA';
export type TipoNovedad = 'DAÑO' | 'PERDIDA' | 'MANTENIMIENTO' | 'DISCREPANCIA' | 'OTRO';
export type EstadoNovedad = 'PENDIENTE' | 'EN_PROCESO' | 'RESUELTA';

export interface Categoria {
  id_categoria: string;
  nombre: string;
}

export interface Unspsc {
  codigo: string;
  nombre: string;
  segmento: string | null;
  familia: string | null;
  clase: string | null;
}

export interface Sitio {
  id_sitio: string;
  nombre: string;
  tipo: TipoSitio;
  /** Ambiente del ERP del que salió este sitio: su nombre y área vienen de ahí (no se editan en Materiales). */
  id_ambiente_origen?: string | null;
  tipo_personalizado?: string | null;
  codigo_lugar?: string | null;
  id_responsable?: string | null;
  id_centro?: string | null;
  // Área (ERP) a la que pertenece el sitio. null = compartido entre
  // instructor/admin, sin aprendices. Recorta la visibilidad de Materiales por área.
  id_area?: string | null;
  // Excepción: visible para cualquier rol sin importar el área (ej. biblioteca).
  acceso_publico?: boolean;
  estado: boolean;
}

export interface Producto {
  id_producto: string;
  nombre: string;
  descripcion?: string | null;
  codigo_unspsc?: string | null;
  SKU?: string | null;
  tipo_material: TipoMaterial;
  unidad_medida: string;
  es_psd: boolean;
  id_categoria: string;
  categoria?: Categoria;
  stock_minimo: number;
  fecha_vencimiento?: string | null;
  unidad_peso_bulto?: string | null;
  peso_por_bulto?: number | null;
  /** Marca de la lista de marcas; `marca` es su nombre. La ficha no tiene bodega (2026-10-05). */
  id_marca?: string | null;
  marca?: string | null;
  modelo?: string | null;
  /** Solo DEVOLUTIVO. true (default) = los ítems no llevan el SKU copiado, se identifican por su placa SENA. */
  usa_placa_sena?: boolean;
  /** B1 — false = producto desactivado (soft-delete). Solo llega cuando se pide `incluirInactivos`. */
  activo?: boolean;
}

export interface Lote {
  id_lote: string;
  id_producto: string;
  cantidad_inicial: number;
  cantidad_disponible: number;
  cantidad_reservada?: number;
  id_lote_origen?: string | null;
  estado: EstadoLote;
  codigo_lote?: string | null;
  unidad_medida?: string | null;
  fecha_ingreso?: string | null;
  fecha_vencimiento?: string | null;
  id_sitio?: string | null;
  id_responsable?: string | null;
  producto?: { id_producto: string; nombre: string; SKU: string | null; tipo_material: string; unidad_medida?: string };
}

export interface CreateLoteDto {
  id_producto: string;
  cantidad_inicial: number;
  unidad_medida?: string;
  codigo_lote?: string;
  fecha_ingreso?: string;
  fecha_vencimiento?: string;
  id_sitio?: string;
  id_responsable?: string;
}

export interface Item {
  id_item: string;
  codigo_sku: string;
  estado: EstadoItem;
  id_producto: string;
  placa_sena?: string | null;
  id_sitio?: string | null;
  /** Soft-delete por ítem (independiente de `producto.activo`, 2026-09-18) — false = fuera de circulación. */
  activo?: boolean;
  producto?: Producto;
}

export interface CreateCategoriaDto {
  nombre: string;
}

export interface CreateSitioDto {
  nombre: string;
  tipo: TipoSitio;
  tipo_personalizado?: string | null;
  codigo_lugar?: string;
  id_responsable?: string;
  id_centro?: string;
  id_area?: string | null;
  acceso_publico?: boolean;
  estado?: boolean;
}

/** #5 — resultado del PASO 2 (confirmar): acá sí se registró en la base. */
export interface ResultadoImportacion {
  total: number;
  productos_creados: number;
  stock_agregado: number;
  errores: { fila: number; error: string }[];
}

/** #5 — una fila parseada del archivo, para que el encargado la revise (PASO 1). */
export interface FilaImportacion {
  fila: number;
  nombre: string;
  descripcion: string | null;
  codigo_unspsc: string | null;
  unidad_medida: string;
  marca: string | null;
  modelo: string | null;
  stock_minimo: number;
  cantidad: number;
  codigo_lote: string | null;
  fecha_vencimiento: string | null;
  sku: string;
  tipo_material: TipoMaterial | null;
  sitio_sugerido: string | null;
  id_sitio_sugerido: string | null;
  advertencias: string[];
  ya_existe_nombre: boolean;
  /** Producto nuevo que quien importa no puede crear (solo líder de área / administrador). */
  requiere_lider?: boolean;
}

/** #5 — resultado del PASO 1 (previsualizar): NADA se escribió todavía. */
export interface ResultadoPrevisualizacion {
  archivo: string;
  total: number;
  filas: FilaImportacion[];
  errores: { fila: number; error: string }[];
  /** ¿Quien importa puede crear fichas nuevas? (administrador_erp o líder de área) */
  puede_crear_fichas?: boolean;
  catalogos: {
    sitios: { id_sitio: string; nombre: string }[];
    categorias: { id_categoria: string; nombre: string }[];
  };
}

/** #5 — fila ya revisada por el encargado que se manda en el PASO 2. */
export interface FilaConfirmada {
  nombre: string;
  descripcion?: string | null;
  codigo_unspsc?: string | null;
  unidad_medida: string;
  tipo_material: TipoMaterial;
  id_categoria: string;
  id_sitio?: string | null;
  sku?: string;
  marca?: string | null;
  modelo?: string | null;
  stock_minimo?: number;
  cantidad?: number;
  codigo_lote?: string | null;
  fecha_vencimiento?: string | null;
  placas_sena?: string[];
  fila_origen?: number;
}

/** Salida de material: consumible (permanente) o devolutivo (despacho con póliza). */
/** MIXTA = la misma salida lleva consumibles (lotes) y devolutivos (unidades); el backend la deduce de las líneas. */
export type ClaseSalida = 'CONSUMO' | 'DEVOLUTIVO' | 'MIXTA';
export type TipoDestinoSalida = 'PROPIO' | 'TERCERO';
export type EstadoSalida = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA' | 'REGRESADA';

export interface SalidaResumen {
  id_salida: string;
  numero: number;
  codigo: string;
  clase: ClaseSalida;
  estado: EstadoSalida;
  /** Solo true en un devolutivo que va y regresa (póliza). Consumible o devolutivo permanente: false. */
  con_regreso: boolean;
  id_sitio: string;
  sitio_nombre: string | null;
  /** Ubicación de la bodega (sede → centro → regional), resuelta por el backend para los encabezados de los Excel. */
  sede_nombre?: string | null;
  centro_nombre?: string | null;
  area_nombre?: string | null;
  regional_nombre?: string | null;
  id_usuario_solicita: string;
  solicitante_nombre: string | null;
  /** Cargo crudo (instructor, administrador_erp…), para las firmas del reporte. */
  solicitante_cargo?: string | null;
  tipo_destino: TipoDestinoSalida;
  dest_nombre: string | null;
  dest_documento: string | null;
  dest_cargo: string | null;
  dest_sede: string | null;
  lugar_destino: string | null;
  medio_transporte: string | null;
  id_jefe_inmediato: string | null;
  jefe_nombre: string | null;
  jefe_cargo?: string | null;
  motivo: string;
  valor_total: number | null;
  aprueba_nombre: string | null;
  fecha_aprobacion: string | null;
  motivo_rechazo: string | null;
  fecha_regreso: string | null;
  fecha: string;
  lineas_count: number;
}

export interface LineaSalida {
  id_linea: string;
  id_producto: string;
  producto_nombre: string;
  marca: string | null;
  modelo: string | null;
  descripcion: string | null;
  unidad_medida: string | null;
  id_lote: string | null;
  codigo_lote: string | null;
  id_item: string | null;
  placa_sena: string | null;
  serial: string | null;
  cantidad: number;
  valor_unitario: number | null;
  nota: string | null;
  id_cuentadante: string | null;
  cuentadante_nombre: string | null;
}

export interface SalidaDetalle extends SalidaResumen {
  lineas: LineaSalida[];
  /** Solo en `GET /salidas/:id`: ¿me toca aprobar o rechazar esta? */
  puede_resolver?: boolean;
}

export interface LineaSalidaDto {
  id_lote?: string;
  id_item?: string;
  cantidad?: number;
  valor_unitario?: number;
  serial?: string;
  nota?: string;
}

export interface CrearSalidaDto {
  clase: ClaseSalida;
  /** Obligatorio en devolutivos: true = va y regresa (póliza); false = sale para siempre, como un consumible. */
  con_regreso?: boolean;
  id_sitio: string;
  tipo_destino: TipoDestinoSalida;
  dest_nombre?: string;
  dest_documento?: string;
  dest_cargo?: string;
  dest_sede?: string;
  lugar_destino?: string;
  medio_transporte?: string;
  id_jefe_inmediato?: string;
  motivo: string;
  lineas: LineaSalidaDto[];
}

/** Lo que se puede sacar de una bodega (lotes de consumibles, unidades con o sin placa, posibles jefes). */
export interface OpcionesSalida {
  lotes: { id_lote: string; producto_nombre: string; codigo_lote: string | null; unidad_medida: string | null; libres: number; fecha_vencimiento: string | null }[];
  unidades: {
    id_item: string;
    producto_nombre: string;
    marca: string | null;
    modelo: string | null;
    placa_sena: string | null;
    codigo_sku: string | null;
    /** Últimos 4 del id: identifica una unidad sin placa. */
    codigo: string;
    id_cuentadante: string | null;
    cuentadante_nombre: string | null;
    puede_despachar: boolean;
  }[];
  jefes: { id_usuario: string; nombre: string; cargo: string | null }[];
}

/** Encabezado del reporte de póliza (por tenant). */
export type ConfigSalida = Record<
  'poliza_numero' | 'limite_despacho' | 'presupuesto_anual' | 'regional' | 'centro_formacion' | 'dependencia',
  string | null
>;

/** Cuentadante de devolutivos — un ingreso a bodega (las unidades que entraron juntas). */
export interface IngresoDevolutivo {
  id_ingreso: string;
  fecha_ingreso: string;
  id_producto: string;
  producto_nombre: string;
  unidades: number;
  id_sitio: string | null;
  sitio_nombre: string | null;
  id_cuentadante: string | null;
  cuentadante_nombre: string | null;
  sin_asignar: number;
  /** Solo si entró por el módulo de ingresos (ING-000001). */
  numero_ingreso: string | null;
  proveedor_nombre: string | null;
}

/** Ítem del que el usuario actual es cuentadante, esté donde esté. */
export interface BienACargo {
  id_item: string;
  placa_sena: string | null;
  codigo_sku: string | null;
  estado: string;
  id_producto: string;
  producto_nombre: string;
  id_sitio: string | null;
  sitio_nombre: string | null;
  fecha_ingreso: string | null;
}

export interface HistorialCuentadante {
  id_historial: string;
  id_item: string;
  placa_sena: string | null;
  cuentadante_anterior_nombre: string | null;
  cuentadante_nuevo_nombre: string | null;
  asigna_nombre: string | null;
  motivo: string | null;
  fecha: string;
}

/** "Pedir ficha al líder" — pedido de un encargado para que el líder cree una ficha del catálogo. */
export interface SolicitudFicha {
  id_solicitud_ficha: string;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  tipo_material: string | null;
  unidad_medida: string | null;
  codigo_unspsc: string | null;
  nota: string | null;
  id_usuario: string;
  solicitante_nombre: string | null;
  id_sitio: string | null;
  sitio_nombre: string | null;
  estado: 'PENDIENTE' | 'ATENDIDA' | 'RECHAZADA';
  id_producto: string | null;
  motivo_rechazo: string | null;
  fecha: string;
  fecha_atencion: string | null;
}

export interface PedirFichaDto {
  nombre: string;
  marca?: string;
  modelo?: string;
  tipo_material?: string;
  unidad_medida?: string;
  codigo_unspsc?: string;
  nota?: string;
  id_sitio?: string;
}

/** De dónde sale el responsable actual de un material — ver `GET /existencias/reporte`. */
export type OrigenResponsable = 'PRESTAMO' | 'ASIGNACION' | 'SITIO' | 'SIN_RESPONSABLE';

export interface ResponsableMaterial {
  origen: OrigenResponsable;
  nombre: string | null;
  documento: string | null;
  /** AAAA-MM-DD */
  desde: string | null;
  /** AAAA-MM-DD — fecha pactada de devolución */
  hasta: string | null;
  referencia: string | null;
  id_solicitud: string | null;
}

interface UbicacionReporte {
  id_sitio: string | null;
  sitio: string | null;
  sitio_tipo: string | null;
  /** Responsable del sitio, aunque el material esté prestado a otra persona. */
  sitio_responsable: string | null;
  responsable: ResponsableMaterial;
}

export interface ReporteUnidad extends UbicacionReporte {
  id_item: string;
  placa_sena: string | null;
  codigo_sku: string | null;
  estado: string;
  id_producto: string;
  producto: string;
  codigo_unspsc: string | null;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
}

export interface ReporteLote extends UbicacionReporte {
  id_lote: string;
  codigo_lote: string | null;
  id_producto: string;
  producto: string;
  codigo_unspsc: string | null;
  tipo_material: string;
  unidad_medida: string;
  categoria: string | null;
  cantidad_disponible: number;
  cantidad_inicial: number;
  cantidad_reservada: number;
  fecha_ingreso: string | null;
  fecha_vencimiento: string | null;
}

export interface ReporteMateriales {
  generado: string;
  unidades: ReporteUnidad[];
  lotes: ReporteLote[];
}

export interface AgregarExistenciasDto {
  id_sitio: string;
  cantidad: number;
  /** Solo DEVOLUTIVO, por posición; los ítems sin placa quedan listos para asignársela. */
  placas_sena?: string[];
  /** Solo CONSUMO/PERECEDERO. */
  codigo_lote?: string;
  /** AAAA-MM-DD, obligatoria para PERECEDERO. */
  fecha_vencimiento?: string;
}

export interface CreateProductoDto {
  nombre: string;
  descripcion?: string;
  /** Obligatorio al crear (catálogo amarrado a UNSPSC, 2026-10-02). */
  codigo_unspsc?: string;
  SKU?: string;
  marca?: string;
  /** Marca de la lista (manda sobre `marca`). */
  id_marca?: string | null;
  modelo?: string;
  tipo_material: TipoMaterial;
  unidad_medida: string;
  es_psd: boolean;
  fecha_vencimiento?: string;
  id_categoria: string;
  cantidad: number;
  placas_sena?: string[];
  stock_minimo: number;
  unidad_peso_bulto?: string;
  peso_por_bulto?: number;
  /** Bodega "de casa" del producto. Opcional (Paso 0 de #5) — un producto puede quedar sin bodega. */
  id_sitio?: string;
  usa_placa_sena?: boolean;
}

/** Fila del panel de existencias de solo lectura (Tier SigMat M6, `GET /api2/existencias`). */
export interface ResumenExistencias {
  id_producto: string;
  nombre: string;
  sku: string | null;
  marca: string | null;
  modelo: string | null;
  tipo_material: TipoMaterial;
  unidad_medida: string;
  id_sitio: string | null;
  sitio_nombre: string | null;
  disponibles: number;
  prestados: number;
  danados: number;
  perdidos: number;
  mantenimiento: number;
  total: number;
  /** Saldo de lotes (consumibles) — SUM(lote.cantidad_disponible). */
  lote_disponible: number;
  /** Alta total de lotes (consumibles) — SUM(lote.cantidad_inicial). */
  lote_total: number;
  lotes_por_vencer: number;
  /** Mínimo efectivo en esta bodega (el propio o, si no fijó uno, el de la ficha). */
  stock_minimo?: number;
  /** ¿La bodega fijó su propio mínimo? */
  minimo_propio?: boolean;
}

export interface UpdateItemDto {
  placa_sena?: string;
  id_sitio?: string | null;
}

export interface Novedad {
  id_novedad: string;
  tipo: TipoNovedad;
  descripcion: string;
  estado: EstadoNovedad;
  fecha: string;
  id_usuario: string;
  /** "Nombre Apellido" de quien reportó, resuelto por el backend (el frontend no
   *  puede bulk-cargar `/api/usuarios`). Null si no se pudo resolver. */
  usuario_nombre?: string | null;
  id_item: string | null;
  item?: Item;
}

export interface CreateNovedadDto {
  tipo: TipoNovedad;
  descripcion: string;
  id_item?: string | null;
}

export type EstadoTraslado = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EN_ENTREGA' | 'ENTREGADA' | 'DEVUELTA' | 'CANCELADA' | 'CONSUMIDA';

/** Línea de una solicitud multi-línea (Tier SigMat M4). Producto devolutivo XOR lote consumible. */
export interface LineaSolicitud {
  id_detalle: string;
  id_producto: string | null;
  id_lote: string | null;
  cantidad: number;
  cantidad_entregada: number;
  producto_nombre?: string | null;
  lote_codigo?: string | null;
}

export interface Solicitud {
  id_solicitud: string;
  fecha: string;
  estado: EstadoSolicitud;
  tipo: 'PRESTAMO';
  observacion: string | null;
  id_usuario: string;
  id_producto: string | null;
  cantidad: number;
  id_usuario_aprueba?: string | null;
  id_curso?: string | null;
  fecha_devolucion?: string | null;
  producto?: { id_producto: string; nombre: string; SKU: string | null; tipo_material: string };
  // Tier SigMat M4/M5
  lineas?: LineaSolicitud[];
  id_usuario_entrega?: string | null;
  fecha_aprobacion?: string | null;
  fecha_entrega?: string | null;
  /** Nombres resueltos por el backend (lista y detalle). */
  usuario_nombre?: string | null;
  usuario_aprueba_nombre?: string | null;
  usuario_entrega_nombre?: string | null;
  /** Bodega de la que sale el material (resuelto por el backend). */
  bodega_nombre?: string | null;
  /** `sitio.id_responsable` de esa misma bodega — usar esto para el gating de
   *  Aprobar/Rechazar/Entregar/Cancelar, no `producto?.id_sitio` (la "bodega
   *  de casa" del producto puede no ser de dónde sale ESTA solicitud). */
  bodega_responsable_id?: string | null;
  /** `sitio.estado` de esa misma bodega — `false` bloquea Aprobar/Entregar
   *  (ver plan 2026-09-18); `null`/`undefined` si no se pudo resolver bodega. */
  bodega_activa?: boolean | null;
  /** Id de esa misma bodega (2026-09-21) — cruzar contra `sitiosACargo()`
   *  (mismo `SitiosACargoService` que usa el backend para autorizar) para
   *  saber si el usuario puede gestionar esta solicitud por LIDERAR EL ÁREA
   *  de esta bodega, no solo cuando `bodega_responsable_id` coincide con él. */
  id_sitio?: string | null;
  /** Justificación del rechazo — presente solo si `estado === 'RECHAZADA'`. */
  motivo_rechazo?: string | null;
}

/** #3 — una fila del seguimiento de préstamos vencidos / por vencer. */
export interface FilaVencimiento {
  id_solicitud: string;
  producto_nombre: string;
  cantidad: number;
  fecha_entrega: string | null;
  fecha_devolucion: string | null;
  /** Días de atraso (vencidas) o días que faltan (por_vencer). */
  dias: number;
  solicitante_nombre: string | null;
  bodega_nombre: string | null;
  responsable_nombre: string | null;
  /** Ya resuelto por el backend (responsable puntual, líder del área de la bodega, o admin) — no replicar la regla acá, solo renderizar. */
  puede_gestionar_devolucion: boolean;
}

export interface SeguimientoVencimientos {
  vencidas: FilaVencimiento[];
  por_vencer: FilaVencimiento[];
  ventana_dias: number;
}

/** Una línea al crear una solicitud multi-línea: producto devolutivo XOR lote consumible. */
export interface LineaSolicitudInput {
  id_producto?: string;
  id_lote?: string;
  /** Línea de producto: bodega de la que sale (catálogo único — una ficha puede estar en varias). */
  id_sitio?: string;
  cantidad: number;
}

/** Opción del selector de la nueva solicitud: un devolutivo en UNA bodega, con sus disponibles ahí. */
export interface OpcionDevolutivo {
  id_producto: string;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  codigo_unspsc: string | null;
  id_sitio: string;
  sitio_nombre: string;
  disponibles: number;
}

/** Selección manual de placas al entregar una línea devolutiva — ver `entregarSolicitud()`. */
export interface SeleccionLineaEntregaInput {
  id_detalle: string | null;
  id_items: string[];
}

export interface CreateSolicitudDto {
  tipo: 'PRESTAMO';
  /** Legacy 1 línea — seguí mandando esto O `lineas`, no ambos. */
  id_producto?: string;
  cantidad?: number;
  /** Tier SigMat M4 — solicitud multi-línea. Todas las líneas deben ser de la misma bodega. */
  lineas?: LineaSolicitudInput[];
  observacion?: string;
  fecha_devolucion?: string;
  /** Instructor líder de ficha: si viene, la solicitud es una asignación a
   *  esa ficha (no personal) — ver `id_curso` en `Solicitud`. */
  id_curso?: string;
}

/** Ubicación (bodega) real del ítem + responsable con nombre resuelto por el backend. */
export interface UbicacionItem {
  id_sitio: string;
  nombre: string;
  id_responsable: string | null;
  responsable_nombre: string | null;
}

export interface ItemDetalleBusqueda {
  item: Item;
  prestamo_activo: any;
  asignacion_activa: any;
  novedad_activa: any;
  ubicacion: UbicacionItem | null;
}

export interface Traslado {
  id_traslado: string;
  id_item: string | null;
  id_sitio_origen: string;
  id_sitio_destino: string;
  id_usuario_solicita: string;
  estado: EstadoTraslado;
  fecha_solicitud: string;
  justificacion: string | null;
  id_usuario_aprueba?: string | null;
  fecha_resolucion?: string | null;
  observacion_resolucion?: string | null;
  item?: Item;
  sitio_origen?: Sitio;
  sitio_destino?: Sitio;
  /** Nombre del encargado de cada bodega, resuelto por el backend. */
  origen_responsable_nombre?: string | null;
  destino_responsable_nombre?: string | null;
  lineas?: TrasladoLinea[];
}

export interface TrasladoLinea {
  id_traslado_linea: string;
  tipo: 'ITEM' | 'LOTE';
  cantidad: number;
  id_item: string | null;
  id_lote: string | null;
  item?: Item | null;
  lote?: Lote | null;
}

export interface CreateTrasladoDto {
  /** Un ítem (compat). Usar `id_items` para traslado masivo. */
  id_item?: string;
  /** Traslado masivo: varios ítems al mismo destino (un traslado por ítem). */
  id_items?: string[];
  /** Operación unificada: ítems serializados y/o cantidades de lote. */
  lineas?: ({ id_item: string } | { id_lote: string; cantidad: number })[];
  id_sitio_destino: string;
  /** Obligatoria (mín. 10 caracteres). */
  justificacion: string;
}

/** Ítems que el backend rechazó en un traslado masivo (respuesta 400, `data.fallidos`). */
export interface ItemTrasladoFallido {
  id_item: string;
  motivo: string;
}

export type EstadoDevolucion = 'BUENO' | 'REGULAR' | 'DAÑADO' | 'PERDIDO';

export interface Devolucion {
  id_devolucion: string;
  fecha: string;
  estado: EstadoDevolucion | 'DEVUELTO';
  observacion: string | null;
  id_solicitud: string;
  /** Exactamente uno de los dos: `id_item` (devolutivo) o `id_lote`+`cantidad` (consumible/perecedero). */
  id_item: string | null;
  id_lote?: string | null;
  cantidad?: number | null;
  solicitud?: Solicitud;
}

/**
 * Línea de LOTE (consumible/perecedero) de una solicitud con sobrante
 * pendiente de devolver (2026-09-11) — "un consumible mayormente no vuelve
 * (ej. un pollo), pero a veces sí un sobrante parcial (ej. 1-2kg de 250kg de
 * abono)". `cantidad_pendiente` es lo máximo acreditable de vuelta al lote.
 */
export interface LineaConsumiblePendiente {
  id_lote: string;
  id_detalle: string | null;
  id_producto: string | null;
  producto_nombre: string | null;
  unidad_medida: string | null;
  codigo_lote: string | null;
  cantidad_entregada: number;
  cantidad_ya_devuelta: number;
  cantidad_pendiente: number;
  /** Hasta cuándo se acepta sobrante (entrega + 30 días); después la solicitud pasa a CONSUMIDA. */
  fecha_limite: string;
}

export interface CreateDevolucionConsumibleDto {
  id_solicitud: string;
  id_lote: string;
  cantidad: number;
  observacion?: string;
}

/** Unidad de un préstamo pendiente de devolver (M10a). */
export interface ItemPendienteDevolucion {
  id_item: string;
  placa_sena: string | null;
  codigo_sku: string | null;
  estado: string;
  /** Producto real de ESTA unidad (una solicitud multi-línea mezcla varios). */
  id_producto: string | null;
  producto_nombre: string | null;
}

/** Override del estado físico de una unidad puntual del lote (M10a). */
export interface DevolucionItemInput {
  id_item: string;
  estado: EstadoDevolucion;
  observacion?: string;
}

/**
 * Devolución por LOTE (M10a) + parcial (M9):
 *  - `estado_general` sin `items` → cierre total (todas las pendientes).
 *  - `items` presente → devolución PARCIAL: solo esas unidades vuelven; el
 *    préstamo sigue ENTREGADO hasta que vuelvan todas.
 */
export interface CreateDevolucionDto {
  id_solicitud: string;
  estado_general?: EstadoDevolucion;
  observacion?: string;
  items?: DevolucionItemInput[];
}

/**
 * Registro de "se hizo la inspección" tras una devolución — el estado
 * físico real ya vive en `Devolucion.estado`, esto es solo el marcador de
 * auditoría (quién y cuándo cerró el préstamo). El backend lo crea solo,
 * junto con un `ItemChequeo` por cada unidad, cuando ya volvieron TODAS las
 * unidades pendientes de una solicitud (ver DevolucionesRepositoryAdapter.
 * registrarLote en backend-practica-hexagonal).
 */
export interface Chequeo {
  id_chequeo: string;
  fecha: string;
  id_usuario: string;
  id_solicitud: string;
}

/** Detalle pasa/no-pasa por unidad de un chequeo — poblado al cerrar una devolución. */
export interface ItemChequeo {
  id_item_chequeo: string;
  estado: boolean;
  observacion: string | null;
  id_chequeo: string;
  id_item: string;
  item?: Item;
}

/**
 * Acta de entrega/devolución: PDF generado automáticamente por el backend.
 * Cada solicitud puede tener HASTA DOS actas independientes — una de
 * `tipo: 'ENTREGA'` (al confirmar recepción) y una de `tipo: 'DEVOLUCION'`
 * (al cerrarse el préstamo) — no son excluyentes entre sí. `url_pdf` es
 * relativa (`uploads/materiales-actas/<archivo>.pdf`) y debe descargarse
 * autenticado, no con un <a href> plano — ver MaterialesApiService.descargarActaPdf.
 */
export interface Acta {
  id_acta: string;
  fecha: string;
  url_pdf: string | null;
  tipo: 'ENTREGA' | 'DEVOLUCION';
  id_solicitud: string;
  id_usuario: string;
  solicitud?: Solicitud;
}

export type EstadoAsignacion = 'ACTIVA' | 'ANULADA' | 'DEVUELTA';

export interface Asignacion {
  id_asignacion: string;
  id_curso: string;
  id_producto: string;
  cantidad: number;
  fecha_asignacion: string;
  id_usuario_asigna: string;
  observacion: string | null;
  estado: EstadoAsignacion;
  fecha_devolucion?: string | null;
  producto?: Producto;
  lineas?: { id_producto: string; producto_nombre: string | null; cantidad: number; id_items: string[] }[];
  /** Resueltos por el backend vía SQL directo a `cursos` — no dependen de que
   *  el `GET /api/cursos` del cliente (recortado por RLS a "mis cursos")
   *  incluya la ficha de esta asignación, que puede ser de otro instructor. */
  ficha_codigo?: string | null;
  ficha_programa?: string | null;
}

export interface CreateAsignacionDto {
  id_curso: string;
  /** Bodega de la que salen las unidades (catálogo único). */
  id_sitio?: string;
  lineas:{id_producto:string, cantidad:number, id_items?: string[]}[],
  observacion?: string;
  fecha_devolucion?: string;
}

export interface Kardex {
  id_kardex: string;
  tipo: 'ENTRADA' | 'SALIDA';
  cantidad: number;
  saldo_anterior: number;
  saldo_actual: number;
  fecha: string;
  observacion: string | null;
  /** Movimiento de una unidad devolutiva (`id_item`) o de un lote de consumo/perecedero (`id_lote`). */
  id_item: string | null;
  id_lote?: string | null;
  id_usuario: string;
  item?: Item;
}

// ── Proveedores e ingreso de materiales (2026-10-05) ───────────────────
export type TipoDocumentoProveedor = 'NIT' | 'CC' | 'CE' | 'PASAPORTE' | 'OTRO';
export interface Proveedor {
  id_proveedor: string;
  nombre: string;
  tipo_documento: TipoDocumentoProveedor;
  documento: string;
  direccion: string | null;
  id_municipio: string | null;
  /** "Pitalito (Huila)" */
  municipio_nombre: string | null;
  telefono: string | null;
  correo: string | null;
  contacto: string | null;
  observaciones: string | null;
  activo: boolean;
  fecha_creacion: string;
  /** Ingresos registrados con este proveedor. */
  ingresos: number;
}
export interface ProveedorDto {
  nombre?: string;
  tipo_documento?: TipoDocumentoProveedor;
  documento?: string;
  direccion?: string | null;
  id_municipio?: string | null;
  telefono?: string | null;
  correo?: string | null;
  contacto?: string | null;
  observaciones?: string | null;
  activo?: boolean;
}
export type TipoIngreso = 'COMPRA' | 'DONACION' | 'COMODATO' | 'TRASLADO_CENTRO' | 'REPOSICION' | 'OTRO';
export type TipoSoporte = 'FACTURA' | 'REMISION' | 'ORDEN_COMPRA' | 'CONTRATO' | 'ACTA' | 'OTRO';
export interface IngresoMaterial {
  id_ingreso: string;
  numero: number;
  /** ING-000001 */
  codigo: string;
  tipo_ingreso: TipoIngreso;
  id_proveedor: string | null;
  proveedor_nombre: string | null;
  proveedor_documento: string | null;
  id_sitio: string;
  sitio_nombre: string | null;
  tipo_soporte: TipoSoporte | null;
  numero_soporte: string | null;
  fecha_soporte: string | null;
  fecha_ingreso: string;
  recibe_nombre: string | null;
  recibido_por: string | null;
  registra_nombre: string | null;
  observaciones: string | null;
  valor_total: number | null;
  estado: 'REGISTRADO' | 'ANULADO';
  motivo_anulacion: string | null;
  fecha_anulacion: string | null;
  fecha_registro: string;
  lineas_count: number;
  cantidad_total: number;
}
export interface LineaIngresoMaterial {
  id_linea: string;
  id_producto: string;
  producto_nombre: string;
  marca: string | null;
  modelo: string | null;
  codigo_unspsc: string | null;
  tipo_material: string;
  unidad_medida: string;
  cantidad: number;
  valor_unitario: number | null;
  codigo_lote: string | null;
  fecha_vencimiento: string | null;
  observacion: string | null;
  unidades: { id_item: string; placa_sena: string | null; codigo_sku: string | null; estado: string; id_sitio: string | null }[];
  lote: { id_lote: string; codigo_lote: string | null; cantidad_disponible: number; estado: string } | null;
}
/** Archivo que respalda el ingreso (foto o PDF de la factura, remisión…). */
export interface SoporteIngreso {
  id_soporte: string;
  nombre_original: string;
  mime: string;
  tamano: number;
  fecha: string;
  subido_por: string | null;
}
export type IngresoMaterialDetalle = IngresoMaterial & { lineas: LineaIngresoMaterial[]; soportes: SoporteIngreso[] };
export interface LineaIngresoDto {
  id_producto: string;
  cantidad: number;
  valor_unitario?: number | null;
  placas_sena?: string[];
  codigo_lote?: string | null;
  fecha_vencimiento?: string | null;
  observacion?: string | null;
}
export interface RegistrarIngresoDto {
  tipo_ingreso: TipoIngreso;
  id_proveedor?: string | null;
  id_sitio: string;
  tipo_soporte?: TipoSoporte | null;
  numero_soporte?: string | null;
  fecha_soporte?: string | null;
  fecha_ingreso?: string | null;
  recibido_por?: string | null;
  observaciones?: string | null;
  lineas: LineaIngresoDto[];
}

// ── Listas maestras del catálogo (2026-10-05) ──
export interface Marca {
  id_marca: string;
  nombre: string;
  activo: boolean;
  /** Fichas con esta marca. */
  fichas: number;
}
export interface UnidadMedida {
  /** Lo que guardan la ficha y el lote (ej. "METRO_CUADRADO"). */
  codigo: string;
  /** Para mostrar (ej. "Metro cuadrado"). */
  nombre: string;
}
export interface Municipio {
  id_municipio: string;
  nombre: string;
  departamento: string | null;
}

// ── Inicio de Materiales: escaneo de placa y pendientes (2026-10-05) ──
export type AccionEscaneo =
  | 'PRESTAR' | 'TRASLADAR' | 'REPORTAR' | 'RECIBIR_DEVOLUCION' | 'RECIBIR_ASIGNACION'
  | 'ENVIAR_MANTENIMIENTO' | 'MARCAR_REPARADO' | 'MARCAR_ENCONTRADO' | 'VER_NOVEDAD'
  | 'VER_TRASLADO' | 'PEDIR_PRESTADO' | 'VER_HISTORIAL';
export interface FichaEscaneo {
  item: { id_item: string; placa_sena: string | null; codigo_sku: string | null; estado: string; activo: boolean };
  producto: {
    id_producto: string; nombre: string; marca: string | null; modelo: string | null;
    tipo_material: string; categoria: string | null; codigo_unspsc: string | null;
  };
  ubicacion: { id_sitio: string; nombre: string; responsable_nombre: string | null } | null;
  tenencia: {
    tipo: 'PRESTAMO' | 'ASIGNACION';
    id_solicitud: string | null;
    id_asignacion: string | null;
    persona: string | null;
    ficha: string | null;
    desde: string | null;
    hasta: string | null;
    dias_atraso: number | null;
  } | null;
  novedad_activa: { id_novedad: string; tipo: string; descripcion: string | null; estado: string; fecha: string } | null;
  ingreso: { codigo: string; tipo_ingreso: string; fecha_ingreso: string; proveedor: string | null } | null;
  historial: { fecha: string; tipo: string; observacion: string | null }[];
  gestiona: boolean;
  acciones: AccionEscaneo[];
  ref_solicitud: string | null;
}
export interface PendienteMateriales {
  clave: string;
  nivel: 'rojo' | 'amarillo' | 'azul';
  titulo: string;
  detalle: string | null;
  cantidad: number;
  ruta: string;
  query?: Record<string, string>;
}

/** Todos los endpoints de Materiales envuelven la respuesta así — nunca devuelven el recurso "pelado". */
interface Envelope<T> {
  statusCode: number;
  message: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class MaterialesApiService {
  constructor(private http: HttpClient) {}

  private unwrap<T>(obs: Observable<Envelope<T>>): Promise<T> {
    return firstValueFrom(obs.pipe(map((res) => res.data)));
  }

  // ── Categorías ─────────────────────────────────────────────────────
  listarCategorias() {
    return this.unwrap(this.http.get<Envelope<Categoria[]>>(`${BASE}/categorias`));
  }
  crearCategoria(dto: CreateCategoriaDto) {
    return this.unwrap(this.http.post<Envelope<Categoria>>(`${BASE}/categorias`, dto));
  }
  actualizarCategoria(id: string, dto: Partial<CreateCategoriaDto>) {
    return this.unwrap(this.http.patch<Envelope<Categoria>>(`${BASE}/categorias/${id}`, dto));
  }
  eliminarCategoria(id: string) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/categorias/${id}`));
  }

  // ── Sitios ─────────────────────────────────────────────────────────
  listarSitios() {
    return this.unwrap(this.http.get<Envelope<Sitio[]>>(`${BASE}/sitios`));
  }
  /** Bodegas de las que el usuario logueado es responsable — pantalla "Mi Bodega". */
  sitiosACargo() {
    return this.unwrap(this.http.get<Envelope<Sitio[]>>(`${BASE}/sitios/a-cargo`));
  }
  crearSitio(dto: CreateSitioDto) {
    return this.unwrap(this.http.post<Envelope<Sitio>>(`${BASE}/sitios`, dto));
  }
  actualizarSitio(id: string, dto: Partial<CreateSitioDto>) {
    return this.unwrap(this.http.patch<Envelope<Sitio>>(`${BASE}/sitios/${id}`, dto));
  }
  eliminarSitio(id: string) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/sitios/${id}`));
  }

  // ── Productos ──────────────────────────────────────────────────────
  /** `incluirInactivos` (B1) trae también los desactivados (soft-delete). */
  listarProductos(incluirInactivos = false) {
    const params = incluirInactivos ? { incluirInactivos: 'true' } : undefined;
    return this.unwrap(this.http.get<Envelope<Producto[]>>(`${BASE}/productos`, { params }));
  }
  /**
   * Búsqueda remota en el catálogo UNSPSC (reemplaza el arreglo hardcodeado
   * OPCIONES_UNSPSC de ~77 códigos) — server-side, nunca trae el catálogo
   * completo al navegador. Ver `<app-ss [loadOptions]>` en productos.component.ts.
   */
  buscarUnspsc(q: string, limit = 20) {
    return this.unwrap(
      this.http.get<Envelope<Unspsc[]>>(
        `${BASE}/unspsc?q=${encodeURIComponent(q)}&limit=${limit}`,
      ),
    );
  }
  /** DEVOLUTIVO genera `items_generados` (uno por unidad); CONSUMO/PERECEDERO genera `lote_generado` en su lugar. */
  crearProducto(dto: CreateProductoDto) {
    return this.unwrap(
      this.http.post<Envelope<{ producto: Producto; items_generados: Item[]; lote_generado: Lote | null }>>(`${BASE}/productos`, dto),
    );
  }
  actualizarProducto(id: string, dto: Partial<CreateProductoDto>) {
    return this.unwrap(this.http.patch<Envelope<Producto>>(`${BASE}/productos/${id}`, dto));
  }
  /**
   * Catálogo único del centro (2026-10-02): todas las fichas activas, sin
   * recorte por bodega — de acá se elige al "agregar al inventario".
   */
  catalogoProductos() {
    return this.unwrap(this.http.get<Envelope<Producto[]>>(`${BASE}/productos/catalogo`));
  }
  // ── Pedir ficha al líder (catálogo único) ──
  pedirFicha(dto: PedirFichaDto) {
    return this.unwrap(this.http.post<Envelope<SolicitudFicha>>(`${BASE}/materiales/solicitudes-ficha`, dto));
  }
  /** Gestor del catálogo: todos los pedidos; los demás: los suyos. */
  listarSolicitudesFicha() {
    return this.unwrap(
      this.http.get<Envelope<{ puede_atender: boolean; solicitudes: SolicitudFicha[] }>>(`${BASE}/materiales/solicitudes-ficha`),
    );
  }
  atenderSolicitudFicha(id: string, idProducto: string) {
    return this.unwrap(this.http.patch<Envelope<SolicitudFicha>>(`${BASE}/materiales/solicitudes-ficha/${id}/atender`, { id_producto: idProducto }));
  }
  rechazarSolicitudFicha(id: string, motivo: string) {
    return this.unwrap(this.http.patch<Envelope<SolicitudFicha>>(`${BASE}/materiales/solicitudes-ficha/${id}/rechazar`, { motivo }));
  }

  // ── Stock mínimo por bodega ──
  /** Mínimos propios de una bodega (los productos sin fila usan el de la ficha). */
  minimosBodega(idSitio: string) {
    return this.unwrap(
      this.http.get<Envelope<{ id_producto: string; stock_minimo: number }[]>>(`${BASE}/productos/minimos`, { params: { id_sitio: idSitio } }),
    );
  }
  /** `stockMinimo = null` vuelve al mínimo de la ficha. */
  fijarMinimoBodega(idProducto: string, idSitio: string, stockMinimo: number | null) {
    return this.unwrap(
      this.http.put<Envelope<null>>(`${BASE}/productos/${idProducto}/minimo`, { id_sitio: idSitio, stock_minimo: stockMinimo }),
    );
  }

  /** Reporte global: cada unidad y lote con ubicación, estado y responsable actual (recortado por scope). */
  reporteMateriales() {
    return this.unwrap(this.http.get<Envelope<ReporteMateriales>>(`${BASE}/existencias/reporte`));
  }
  /** ¿Puedo crear/editar fichas del catálogo? Solo administrador_erp y líderes de área. */
  async puedeGestionarCatalogo(): Promise<boolean> {
    const r = await this.unwrap(
      this.http.get<Envelope<{ puede_gestionar: boolean }>>(`${BASE}/productos/catalogo/gestion`),
    );
    return !!r?.puede_gestionar;
  }
  // ── Salidas de material ──
  listarSalidas(estado?: string) {
    return this.unwrap(
      this.http.get<Envelope<SalidaResumen[]>>(`${BASE}/materiales/salidas`, { params: estado ? { estado } : {} }),
    );
  }
  bodegasSalida() {
    return this.unwrap(this.http.get<Envelope<{ id_sitio: string; nombre: string; tipo: string | null }[]>>(`${BASE}/materiales/salidas/bodegas`));
  }
  opcionesSalida(idSitio: string) {
    return this.unwrap(this.http.get<Envelope<OpcionesSalida>>(`${BASE}/materiales/salidas/opciones`, { params: { id_sitio: idSitio } }));
  }
  obtenerSalida(id: string) {
    return this.unwrap(this.http.get<Envelope<SalidaDetalle>>(`${BASE}/materiales/salidas/${id}`));
  }
  crearSalida(dto: CrearSalidaDto) {
    return this.unwrap(this.http.post<Envelope<SalidaDetalle>>(`${BASE}/materiales/salidas`, dto));
  }
  aprobarSalida(id: string) {
    return this.unwrap(this.http.patch<Envelope<SalidaDetalle>>(`${BASE}/materiales/salidas/${id}/aprobar`, {}));
  }
  rechazarSalida(id: string, motivo: string) {
    return this.unwrap(this.http.patch<Envelope<SalidaDetalle>>(`${BASE}/materiales/salidas/${id}/rechazar`, { motivo }));
  }
  cancelarSalida(id: string) {
    return this.unwrap(this.http.patch<Envelope<SalidaDetalle>>(`${BASE}/materiales/salidas/${id}/cancelar`, {}));
  }
  registrarRegresoSalida(id: string) {
    return this.unwrap(this.http.patch<Envelope<SalidaDetalle>>(`${BASE}/materiales/salidas/${id}/regreso`, {}));
  }
  datosPolizaSalida(id: string) {
    return this.unwrap(
      this.http.get<Envelope<{ config: ConfigSalida; salida: SalidaDetalle }>>(`${BASE}/materiales/salidas/${id}/poliza`),
    );
  }
  obtenerConfigSalida() {
    return this.unwrap(this.http.get<Envelope<ConfigSalida>>(`${BASE}/materiales/salidas/config`));
  }
  guardarConfigSalida(config: Partial<ConfigSalida>) {
    return this.unwrap(this.http.put<Envelope<ConfigSalida>>(`${BASE}/materiales/salidas/config`, config));
  }
  /** Ingresos de devolutivos con su cuentadante. Solo administrador_erp y líderes de área (403 al resto). */
  listarIngresosCuentadante() {
    return this.unwrap(this.http.get<Envelope<IngresoDevolutivo[]>>(`${BASE}/materiales/cuentadante/ingresos`));
  }
  /** Asigna el cuentadante a todas las unidades de un ingreso. */
  asignarCuentadante(idIngreso: string, idCuentadante: string, motivo?: string) {
    return this.unwrap(
      this.http.put<Envelope<{ actualizados: number }>>(`${BASE}/materiales/cuentadante/ingresos/${idIngreso}`, {
        id_cuentadante: idCuentadante,
        motivo: motivo?.trim() || undefined,
      }),
    );
  }
  historialCuentadante(idIngreso: string) {
    return this.unwrap(
      this.http.get<Envelope<HistorialCuentadante[]>>(`${BASE}/materiales/cuentadante/ingresos/${idIngreso}/historial`),
    );
  }
  /** "Mis bienes a cargo": ítems de los que soy cuentadante. */
  misBienesACargo() {
    return this.unwrap(this.http.get<Envelope<BienACargo[]>>(`${BASE}/materiales/cuentadante/mis-bienes`));
  }
  /** La bodega declara cuántas unidades tiene de una ficha: DEVOLUTIVO → ítems, CONSUMO/PERECEDERO → lote. */
  agregarExistencias(idProducto: string, dto: AgregarExistenciasDto) {
    return this.unwrap(
      this.http.post<Envelope<{ producto: Producto; items_generados: Item[]; lote_generado: Lote | null }>>(
        `${BASE}/productos/${idProducto}/existencias`,
        dto,
      ),
    );
  }
  /** #5 — descarga la plantilla .xlsx (blob, sin envelope). */
  descargarPlantillaProductos(): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${BASE}/productos/importar/plantilla`, { responseType: 'blob' }),
    );
  }
  /** #5 PASO 1 — sube un .xlsx/.csv y devuelve el RESUMEN para revisar. No registra nada. */
  /** `onProgreso` (opcional) recibe el % REAL de subida del archivo (0–100). */
  previsualizarImportacion(archivo: File, onProgreso?: (pct: number) => void) {
    const fd = new FormData();
    fd.append('archivo', archivo);
    return this.unwrap(
      this.http
        .post<Envelope<ResultadoPrevisualizacion>>(`${BASE}/productos/importar/previsualizar`, fd, {
          reportProgress: true,
          observe: 'events',
        })
        .pipe(
          tap((ev) => {
            if (ev.type === HttpEventType.UploadProgress && ev.total) {
              onProgreso?.(Math.round((ev.loaded / ev.total) * 100));
            }
          }),
          filter((ev) => ev.type === HttpEventType.Response),
          map((ev) => ev.body as Envelope<ResultadoPrevisualizacion>),
        ),
    );
  }
  /** #5 PASO 2 — el encargado ya revisó: registra productos + stock. */
  confirmarImportacion(filas: FilaConfirmada[]) {
    return this.unwrap(
      this.http.post<Envelope<ResultadoImportacion>>(
        `${BASE}/productos/importar/confirmar`,
        { filas },
      ),
    );
  }
  /** B1 — soft-delete: marca el producto como inactivo (no borra nada). */
  eliminarProducto(id: string) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/productos/${id}`));
  }
  /** Borra un producto registrado por error y lo que generó; el backend lo rechaza (400) si ya tiene historia. */
  eliminarProductoDefinitivo(id: string) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/productos/${id}/definitivo`));
  }
  /** B1 — reactiva un producto desactivado. */
  activarProducto(id: string) {
    return this.unwrap(this.http.patch<Envelope<Producto>>(`${BASE}/productos/${id}/activar`, {}));
  }
  /** Agrega un ítem suelto al lote de un producto existente (mismo SKU, estado DISPONIBLE). */
  /** `idSitio`: bodega donde queda la unidad — obligatoria para fichas del catálogo único (sin bodega "de casa"). */
  agregarItemAProducto(idProducto: string, placaSena?: string, idSitio?: string) {
    return this.unwrap(
      this.http.post<Envelope<Item>>(`${BASE}/productos/${idProducto}/items`, {
        placa_sena: placaSena || undefined,
        id_sitio: idSitio || undefined,
      }),
    );
  }

  // ── Lotes (stock contable para consumibles) ────────────────────────
  listarLotes() {
    return this.unwrap(this.http.get<Envelope<Lote[]>>(`${BASE}/lotes`));
  }
  crearLote(dto: CreateLoteDto) {
    return this.unwrap(this.http.post<Envelope<Lote>>(`${BASE}/lotes`, dto));
  }
  /** `fecha_vencimiento: null` borra la fecha del lote (omitirla la deja como está). */
  actualizarLote(id: string, dto: Omit<Partial<CreateLoteDto>, 'fecha_vencimiento'> & { fecha_vencimiento?: string | null; cantidad_disponible?: number; estado?: EstadoLote }) {
    return this.unwrap(this.http.patch<Envelope<Lote>>(`${BASE}/lotes/${id}`, dto));
  }
  eliminarLote(id: string) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/lotes/${id}`));
  }

  // ── Items ──────────────────────────────────────────────────────────
  listarItems(idProducto?: string) {
    const params = idProducto != null ? { id_producto: idProducto } : undefined;
    return this.unwrap(this.http.get<Envelope<Item[]>>(`${BASE}/items`, { params }));
  }
  buscarItemPorPlaca(placa: string) {
    return this.unwrap(
      this.http.get<Envelope<ItemDetalleBusqueda | null>>(
        `${BASE}/items/buscar/${encodeURIComponent(placa)}`,
      ),
    );
  }
  actualizarItem(id: string, dto: UpdateItemDto) {
    return this.unwrap(this.http.patch<Envelope<Item>>(`${BASE}/items/${id}`, dto));
  }
  actualizarEstadoItem(id: string, estado: EstadoItem) {
    return this.unwrap(this.http.patch<Envelope<Item>>(`${BASE}/items/${id}/estado`, { estado }));
  }
  /** Soft-delete por ítem (independiente de `producto.activo`) — solo las unidades de ESTA bodega, no todo el producto. */
  desactivarItem(id: string) {
    return this.unwrap(this.http.patch<Envelope<Item>>(`${BASE}/items/${id}/desactivar`, {}));
  }
  activarItem(id: string) {
    return this.unwrap(this.http.patch<Envelope<Item>>(`${BASE}/items/${id}/activar`, {}));
  }
  /** Alta masiva de placas SENA sobre ítems ya generados (uno por unidad). Atómica en el backend. */
  asignarPlacasItems(asignaciones: { id_item: string; placa_sena: string }[]) {
    return this.unwrap(
      this.http.patch<Envelope<{ actualizados: number }>>(`${BASE}/items/asignar-placas`, { asignaciones }),
    );
  }

  // ── Existencias (solo lectura) ──────────────────────────────────────
  /** Panel de existencias (Tier SigMat M6) — calculado desde `item`/`lote`, recortado por programa/bodega. Sin CRUD propio: no hay altas/bajas de "existencia", solo de ítems/lotes. */
  obtenerExistencias() {
    return this.unwrap(this.http.get<Envelope<ResumenExistencias[]>>(`${BASE}/existencias`));
  }
  stockProducto(idProducto: string) {
    return this.unwrap(
      this.http.get<Envelope<{ disponibles: number; total: number }>>(`${BASE}/existencias/producto/${idProducto}/stock`),
    );
  }

  // ── Kardex (solo lectura) ─────────────────────────────────────────
  listarKardex() {
    return this.unwrap(this.http.get<Envelope<Kardex[]>>(`${BASE}/kardex`));
  }

  // ── Novedades ──────────────────────────────────────────────────────
  listarNovedades() {
    return this.unwrap(this.http.get<Envelope<Novedad[]>>(`${BASE}/novedades`));
  }
  crearNovedad(dto: CreateNovedadDto) {
    return this.unwrap(this.http.post<Envelope<Novedad>>(`${BASE}/novedades`, dto));
  }
  /** `estadoItem` (Tier SigMat M7): estado en el que queda el ítem de la novedad — solo si la novedad tiene `id_item`. */
  actualizarNovedad(id: string, estado: EstadoNovedad, estadoItem?: EstadoItem) {
    return this.unwrap(
      this.http.patch<Envelope<Novedad>>(`${BASE}/novedades/${id}`, {
        estado,
        ...(estadoItem ? { estado_item: estadoItem } : {}),
      }),
    );
  }
  /** Corrige tipo/descripción/ítem de una novedad PENDIENTE (`id_item: null` = quitar el ítem). */
  corregirNovedad(id: string, dto: { tipo?: TipoNovedad; descripcion?: string; id_item?: string | null }) {
    return this.unwrap(this.http.patch<Envelope<Novedad>>(`${BASE}/novedades/${id}/datos`, dto));
  }
  eliminarNovedad(id: string) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/novedades/${id}`));
  }

  // ── Traslados ──────────────────────────────────────────────────────
  listarTraslados() {
    return this.unwrap(this.http.get<Envelope<Traslado[]>>(`${BASE}/traslados`));
  }
  crearTraslado(dto: CreateTrasladoDto) {
    return this.unwrap(this.http.post<Envelope<Traslado>>(`${BASE}/traslados`, dto));
  }
  aprobarTraslado(id: string) {
    return this.unwrap(this.http.patch<Envelope<Traslado>>(`${BASE}/traslados/${id}/aprobar`, {}));
  }
  rechazarTraslado(id: string, observacion_resolucion?: string) {
    return this.unwrap(this.http.patch<Envelope<Traslado>>(`${BASE}/traslados/${id}/rechazar`, { observacion_resolucion }));
  }

  // ── Solicitudes ────────────────────────────────────────────────────
  listarSolicitudes() {
    return this.unwrap(this.http.get<Envelope<Solicitud[]>>(`${BASE}/solicitudes`));
  }
  /** Trae una solicitud con sus `lineas[]` (multi-línea, Tier SigMat M4) — la lista no las incluye. */
  obtenerSolicitud(id: string) {
    return this.unwrap(this.http.get<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}`));
  }
  /** "Producto — bodega — disponibles" de devolutivos que el usuario puede pedir (selector de nueva solicitud). */
  opcionesDevolutivos() {
    return this.unwrap(this.http.get<Envelope<OpcionDevolutivo[]>>(`${BASE}/solicitudes/opciones/devolutivos`));
  }
  crearSolicitud(dto: CreateSolicitudDto) {
    return this.unwrap(this.http.post<Envelope<Solicitud>>(`${BASE}/solicitudes`, dto));
  }
  /** #3b — `fecha_devolucion` (yyyy-MM-dd) opcional: el aprobador la fija/mueve al aprobar. No puede ser pasada (400). */
  aprobarSolicitud(id: string, opts: { fecha_devolucion?: string } = {}) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/aprobar`, opts));
  }
  /** El motivo es obligatorio — el backend rechaza con 400 si viene vacío. */
  rechazarSolicitud(id: string, motivo: string) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/rechazar`, { motivo }));
  }
  /** #3 — préstamos ENTREGADA vencidos / por vencer (recortado por bodega/rol). */
  vencimientosSolicitudes(ventana = 7) {
    return this.unwrap(
      this.http.get<Envelope<SeguimientoVencimientos>>(`${BASE}/solicitudes/vencimientos`, { params: { ventana } }),
    );
  }
  /**
   * Sin `seleccion`: cada línea toma automáticamente los primeros N ítems
   * DISPONIBLE (comportamiento de siempre). Con `seleccion`: el responsable
   * eligió a mano qué placa(s) puntuales entregar por línea (2026-09-16,
   * pedido explícito — "lo ideal sería tener las dos opciones") — el backend
   * revalida igual (cantidad exacta, producto correcto, DISPONIBLE).
   */
  entregarSolicitud(id: string, seleccion?: SeleccionLineaEntregaInput[]) {
    return this.unwrap(
      this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/entregar`, seleccion ? { seleccion } : {}),
    );
  }
  /** Cancela una solicitud APROBADA que no se va a entregar (no toca inventario). */
  cancelarSolicitud(id: string) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/cancelar`, {}));
  }
  confirmarRecepcionSolicitud(id: string) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/confirmar-recepcion`, {}));
  }

  // ── Devoluciones (por lote / por unidad — M10a) ────────────────────
  listarDevoluciones() {
    return this.unwrap(this.http.get<Envelope<Devolucion[]>>(`${BASE}/devoluciones`));
  }
  /** Unidades del préstamo que aún faltan devolver (con placa SENA / SKU). */
  itemsPendientesDevolucion(idSolicitud: string) {
    return this.unwrap(
      this.http.get<Envelope<ItemPendienteDevolucion[]>>(`${BASE}/devoluciones/pendientes/${idSolicitud}`),
    );
  }
  /** Registra la devolución de todas las unidades pendientes de un préstamo. */
  crearDevolucion(dto: CreateDevolucionDto) {
    return this.unwrap(this.http.post<Envelope<Devolucion[]>>(`${BASE}/devoluciones`, dto));
  }
  /** Líneas de LOTE (consumible/perecedero) con sobrante pendiente de devolver. */
  lineasConsumiblesPendientes(idSolicitud: string) {
    return this.unwrap(
      this.http.get<Envelope<LineaConsumiblePendiente[]>>(`${BASE}/devoluciones/pendientes-consumible/${idSolicitud}`),
    );
  }
  /** Acredita un sobrante parcial de consumible/perecedero de vuelta al lote de origen. */
  registrarDevolucionConsumible(dto: CreateDevolucionConsumibleDto) {
    return this.unwrap(this.http.post<Envelope<Devolucion>>(`${BASE}/devoluciones/consumible`, dto));
  }

  // ── Chequeos ───────────────────────────────────────────────────────
  /** El backend los genera solo — uno por solicitud, al cerrar su devolución. Solo lectura. */
  listarChequeos() {
    return this.unwrap(this.http.get<Envelope<Chequeo[]>>(`${BASE}/chequeos`));
  }
  /** Sin filtro por chequeo en el backend — se trae todo y se agrupa por id_chequeo en el cliente. */
  listarItemsChequeo() {
    return this.unwrap(this.http.get<Envelope<ItemChequeo[]>>(`${BASE}/items-chequeo`));
  }

  // ── Actas ──────────────────────────────────────────────────────────
  /** El backend las genera solo — al confirmar recepción o al cerrar una devolución. */
  listarActas() {
    return this.unwrap(this.http.get<Envelope<Acta[]>>(`${BASE}/actas`));
  }
  obtenerActa(id: string) {
    return this.unwrap(this.http.get<Envelope<Acta>>(`${BASE}/actas/${id}`));
  }
  /**
   * Descarga el PDF autenticado — un `<a href="/uploads/...">` plano no pasa
   * por el interceptor (x-tenant + cookie de sesión), y en un despliegue por
   * IP sin subdominio el backend no tiene de dónde más sacar el tenant (ver
   * seguimiento.service.ts.descargarArchivo, mismo criterio).
   */
  async descargarActaPdf(urlRelativa: string): Promise<Blob> {
    const ruta = urlRelativa.startsWith('/') ? urlRelativa : `/${urlRelativa}`;
    return firstValueFrom(this.http.get(ruta, { responseType: 'blob' }));
  }

  // ── Asignaciones ───────────────────────────────────────────────────
  // Ruta con prefijo materiales/ — 'asignaciones' a secas colisiona con el
  // controller de etapa_practica (instructor↔etapa), que gana esa ruta en
  // el router global de Nest (ver comentario en el controller del backend).
  listarAsignaciones() {
    return this.unwrap(this.http.get<Envelope<Asignacion[]>>(`${BASE}/materiales/asignaciones`));
  }
  crearAsignacion(dto: CreateAsignacionDto) {
    return this.unwrap(this.http.post<Envelope<Asignacion>>(`${BASE}/materiales/asignaciones`, dto));
  }
  anularAsignacion(id: string) {
    return this.unwrap(this.http.patch<Envelope<Asignacion>>(`${BASE}/materiales/asignaciones/${id}/anular`, {}));
  }
  // Sin eliminarAsignacion: una asignación no se borra, se anula (A3).

  // ── Inicio: escaneo y pendientes (2026-10-05) ──
  escanearPlaca(placa: string) {
    return this.unwrap(this.http.get<Envelope<FichaEscaneo>>(`${BASE}/materiales/escaneo/${encodeURIComponent(placa.trim())}`));
  }
  pendientesMateriales() {
    return this.unwrap(this.http.get<Envelope<PendienteMateriales[]>>(`${BASE}/materiales/pendientes`));
  }

  // ── Listas maestras (2026-10-05) ──
  listarMarcas(incluirInactivas = false) {
    const q = incluirInactivas ? '?incluir_inactivas=true' : '';
    return this.unwrap(this.http.get<Envelope<Marca[]>>(`${BASE}/materiales/marcas${q}`));
  }
  crearMarca(nombre: string) {
    return this.unwrap(this.http.post<Envelope<Marca>>(`${BASE}/materiales/marcas`, { nombre }));
  }
  actualizarMarca(id: string, dto: { nombre?: string; activo?: boolean }) {
    return this.unwrap(this.http.patch<Envelope<Marca>>(`${BASE}/materiales/marcas/${id}`, dto));
  }
  /** Pasa las fichas de `id` a `idDestino` y borra `id`. */
  fusionarMarca(id: string, idDestino: string) {
    return this.unwrap(
      this.http.post<Envelope<{ marca: Marca; fichas_movidas: number; fichas_repetidas: string[] }>>(
        `${BASE}/materiales/marcas/${id}/fusionar`, { id_destino: idDestino },
      ),
    );
  }
  listarUnidadesMedida() {
    return this.unwrap(this.http.get<Envelope<UnidadMedida[]>>(`${BASE}/materiales/unidades-medida`));
  }
  listarMunicipios() {
    return this.unwrap(this.http.get<Envelope<Municipio[]>>(`${BASE}/materiales/municipios`));
  }

  // ── Proveedores e ingreso de materiales (2026-10-05) ──
  listarProveedores(incluirInactivos = false) {
    const q = incluirInactivos ? '?incluir_inactivos=true' : '';
    return this.unwrap(this.http.get<Envelope<Proveedor[]>>(`${BASE}/materiales/proveedores${q}`));
  }
  crearProveedor(dto: ProveedorDto) {
    return this.unwrap(this.http.post<Envelope<Proveedor>>(`${BASE}/materiales/proveedores`, dto));
  }
  actualizarProveedor(id: string, dto: ProveedorDto) {
    return this.unwrap(this.http.patch<Envelope<Proveedor>>(`${BASE}/materiales/proveedores/${id}`, dto));
  }
  /** ¿Puede registrar llegadas de material y a qué bodegas? No responde 403 a quien no puede. */
  accesoIngresos() {
    return this.unwrap(
      this.http.get<Envelope<{ puede: boolean; bodegas: Sitio[] }>>(`${BASE}/materiales/ingresos/acceso`),
    );
  }
  listarIngresos() {
    return this.unwrap(this.http.get<Envelope<IngresoMaterial[]>>(`${BASE}/materiales/ingresos`));
  }
  obtenerIngreso(id: string) {
    return this.unwrap(this.http.get<Envelope<IngresoMaterialDetalle>>(`${BASE}/materiales/ingresos/${id}`));
  }
  registrarIngreso(dto: RegistrarIngresoDto) {
    return this.unwrap(this.http.post<Envelope<IngresoMaterialDetalle>>(`${BASE}/materiales/ingresos`, dto));
  }
  anularIngreso(id: string, motivo: string) {
    return this.unwrap(this.http.patch<Envelope<IngresoMaterialDetalle>>(`${BASE}/materiales/ingresos/${id}/anular`, { motivo }));
  }
  /** PDF/JPG/PNG/WEBP, hasta 10 MB c/u y 5 por ingreso. */
  subirSoportesIngreso(id: string, archivos: File[]) {
    const fd = new FormData();
    for (const a of archivos) fd.append('archivos', a, a.name);
    return this.unwrap(this.http.post<Envelope<SoporteIngreso[]>>(`${BASE}/materiales/ingresos/${id}/soportes`, fd));
  }
  /** Por HttpClient (blob) y no por un <a href>: así viajan la sesión y la cabecera x-tenant. */
  descargarSoporteIngreso(id: string, idSoporte: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${BASE}/materiales/ingresos/${id}/soportes/${idSoporte}/descargar`, { responseType: 'blob' }));
  }
  quitarSoporteIngreso(id: string, idSoporte: string) {
    return this.unwrap(this.http.delete<Envelope<SoporteIngreso[]>>(`${BASE}/materiales/ingresos/${id}/soportes/${idSoporte}`));
  }

  // Notificaciones: retiradas en la Fase 4 del plan de fusión de
  // notificaciones — desde la Fase 1, Materiales escribe en la tabla única
  // del ERP (backend-erp, `notificaciones`) en vez de en su propia tabla
  // local. La campana del navbar (`ApiService.listarNotificaciones()`,
  // backend-erp) ya muestra las de Materiales con tipo/ícono propio.
  // Las 3 pantallas dedicadas (`/materiales/notificaciones` y variantes
  // instructor/aprendiz) se eliminaron en la Ronda 6, Fase 10 — no
  // aportaban nada sobre la campana. El servicio `materiales.notificaciones.ver`
  // queda huérfano en el catálogo (documentado, sin borrar filas) y el
  // controller `/api2/notificaciones` del backend sigue en pie pero sin
  // clientes (su retiro es la Fase 5, aún en pausa, del plan de fusión).
}
