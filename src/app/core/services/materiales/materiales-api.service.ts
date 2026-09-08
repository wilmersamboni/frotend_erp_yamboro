import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map, Observable } from 'rxjs';
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

export interface Sitio {
  id_sitio: string;
  nombre: string;
  tipo: TipoSitio;
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
  id_sitio?: string | null;
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
  estado: EstadoLote;
  codigo_lote?: string | null;
  unidad_medida?: string | null;
  fecha_ingreso?: string | null;
  fecha_vencimiento?: string | null;
  id_sitio?: string | null;
  id_responsable?: string | null;
  producto?: { id_producto: string; nombre: string; SKU: string | null; tipo_material: string };
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
}

/** #5 — resultado del PASO 1 (previsualizar): NADA se escribió todavía. */
export interface ResultadoPrevisualizacion {
  archivo: string;
  total: number;
  filas: FilaImportacion[];
  errores: { fila: number; error: string }[];
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

export interface CreateProductoDto {
  nombre: string;
  descripcion?: string;
  codigo_unspsc?: string;
  SKU?: string;
  marca?: string;
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
  lote_disponible: number;
  lotes_por_vencer: number;
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
  id_item: string | null;
  item?: Item;
}

export interface CreateNovedadDto {
  tipo: TipoNovedad;
  descripcion: string;
  id_item?: string | null;
}

export type EstadoTraslado = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EN_ENTREGA' | 'ENTREGADA' | 'DEVUELTA' | 'CANCELADA';

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
  producto?: { id_producto: string; nombre: string; SKU: string | null; id_sitio: string | null; tipo_material: string };
  // Tier SigMat M4/M5
  lineas?: LineaSolicitud[];
  id_usuario_entrega?: string | null;
  fecha_aprobacion?: string | null;
  fecha_entrega?: string | null;
  /** Nombres resueltos por el backend (lista y detalle). */
  usuario_nombre?: string | null;
  usuario_aprueba_nombre?: string | null;
  usuario_entrega_nombre?: string | null;
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
  cantidad: number;
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
}

export interface Traslado {
  id_traslado: string;
  id_item: string;
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
}

export interface CreateTrasladoDto {
  id_item: string;
  id_sitio_destino: string;
  justificacion?: string;
}

export type EstadoDevolucion = 'BUENO' | 'REGULAR' | 'DAÑADO' | 'PERDIDO';

export interface Devolucion {
  id_devolucion: string;
  fecha: string;
  estado: EstadoDevolucion;
  observacion: string | null;
  id_solicitud: string;
  id_item: string;
  solicitud?: Solicitud;
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

export type EstadoAsignacion = 'ACTIVA' | 'ANULADA';

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
}

export interface CreateAsignacionDto {
  id_curso: string;
  id_producto: string;
  cantidad: number;
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
  id_item: string;
  id_usuario: string;
  item?: Item;
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
  /** DEVOLUTIVO genera `items_generados` (uno por unidad); CONSUMO/PERECEDERO genera `lote_generado` en su lugar. */
  crearProducto(dto: CreateProductoDto) {
    return this.unwrap(
      this.http.post<Envelope<{ producto: Producto; items_generados: Item[]; lote_generado: Lote | null }>>(`${BASE}/productos`, dto),
    );
  }
  actualizarProducto(id: string, dto: Partial<CreateProductoDto>) {
    return this.unwrap(this.http.patch<Envelope<Producto>>(`${BASE}/productos/${id}`, dto));
  }
  /** #5 — descarga la plantilla .xlsx (blob, sin envelope). */
  descargarPlantillaProductos(): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${BASE}/productos/importar/plantilla`, { responseType: 'blob' }),
    );
  }
  /** #5 PASO 1 — sube un .xlsx/.csv y devuelve el RESUMEN para revisar. No registra nada. */
  previsualizarImportacion(archivo: File) {
    const fd = new FormData();
    fd.append('archivo', archivo);
    return this.unwrap(
      this.http.post<Envelope<ResultadoPrevisualizacion>>(
        `${BASE}/productos/importar/previsualizar`,
        fd,
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
  /** B1 — reactiva un producto desactivado. */
  activarProducto(id: string) {
    return this.unwrap(this.http.patch<Envelope<Producto>>(`${BASE}/productos/${id}/activar`, {}));
  }
  /** Agrega un ítem suelto al lote de un producto existente (mismo SKU, estado DISPONIBLE). */
  agregarItemAProducto(idProducto: string, placaSena?: string) {
    return this.unwrap(
      this.http.post<Envelope<Item>>(`${BASE}/productos/${idProducto}/items`, {
        placa_sena: placaSena || undefined,
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
  actualizarLote(id: string, dto: Partial<CreateLoteDto> & { cantidad_disponible?: number; estado?: EstadoLote }) {
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
      this.http.get<Envelope<{ item: Item; prestamo_activo: any; asignacion_activa: any; novedad_activa: any } | null>>(
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
  entregarSolicitud(id: string) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/entregar`, {}));
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
