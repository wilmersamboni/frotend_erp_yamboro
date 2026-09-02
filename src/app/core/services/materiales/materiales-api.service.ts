import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// Materiales vive dentro de backend-epsas-horarios (mismo backend que
// horarios/encuestas, puerto 3001, prefijo api2 vía proxy) — no es un
// backend aparte.
const BASE = environment.apiPracticaUrl;

export type TipoSitio = 'BODEGA' | 'AMBIENTE' | 'LABORATORIO' | 'OTRO';
export type TipoMaterial = 'CONSUMO' | 'DEVOLUTIVO' | 'SOFTWARE' | 'EPP' | 'PERECEDERO';
export type EstadoItem = 'DISPONIBLE' | 'PRESTADO' | 'DAÑADO' | 'PERDIDO';
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
  // Programa de formación (ERP) al que pertenece el sitio. null = compartido /
  // sin clasificar. Recorta la visibilidad de Materiales por programa (Ronda 7).
  id_programa?: string | null;
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

export interface Inventario {
  id_inventario: string;
  estado: EstadoItem;
  id_item: string;
  id_sitio: string;
  item?: Item;
  sitio?: Sitio;
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
  id_programa?: string | null;
  estado?: boolean;
}

export interface CreateProductoDto {
  nombre: string;
  descripcion?: string;
  codigo_unspsc?: string;
  SKU?: string;
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
  id_sitio: string;
}

export interface CreateInventarioDto {
  estado: EstadoItem;
  id_item: string;
  id_sitio: string;
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
export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EN_ENTREGA' | 'ENTREGADA' | 'DEVUELTA';

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
}

export interface CreateSolicitudDto {
  tipo: 'PRESTAMO';
  id_producto: string;
  cantidad: number;
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
}

/** Override del estado físico de una unidad puntual del lote (M10a). */
export interface DevolucionItemInput {
  id_item: string;
  estado: EstadoDevolucion;
  observacion?: string;
}

/**
 * Devolución por LOTE (M10a): `estado_general` se aplica a todas las unidades
 * pendientes del préstamo; `items` lleva solo las excepciones.
 */
export interface CreateDevolucionDto {
  id_solicitud: string;
  estado_general: EstadoDevolucion;
  observacion?: string;
  items?: DevolucionItemInput[];
}

/**
 * Registro de "se hizo la inspección" tras una devolución — el estado
 * físico real ya vive en `Devolucion.estado` (Fase 6), esto es solo el
 * marcador de auditoría (quién y cuándo revisó), mismo criterio que SGM
 * (`crearChequeo` allá tampoco manda un estado — ver Ronda 4, Fase 8). El
 * detalle por ítem (`item_chequeo`, con su propio booleano pasa/no pasa)
 * queda fuera de alcance: ni SGM ni esta fase lo pueblan.
 */
export interface Chequeo {
  id_chequeo: string;
  fecha: string;
  id_usuario: string;
  id_solicitud: string;
}

export interface CreateChequeoDto {
  id_solicitud: string;
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
  listarProductos() {
    return this.unwrap(this.http.get<Envelope<Producto[]>>(`${BASE}/productos`));
  }
  crearProducto(dto: CreateProductoDto) {
    return this.unwrap(
      this.http.post<Envelope<{ producto: Producto; items_generados: Item[] }>>(`${BASE}/productos`, dto),
    );
  }
  actualizarProducto(id: string, dto: Partial<CreateProductoDto>) {
    return this.unwrap(this.http.patch<Envelope<Producto>>(`${BASE}/productos/${id}`, dto));
  }
  eliminarProducto(id: string) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/productos/${id}`));
  }
  /** Agrega un ítem suelto al lote de un producto existente (mismo SKU, estado DISPONIBLE). */
  agregarItemAProducto(idProducto: string, placaSena?: string) {
    return this.unwrap(
      this.http.post<Envelope<Item>>(`${BASE}/productos/${idProducto}/items`, {
        placa_sena: placaSena || undefined,
      }),
    );
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

  // ── Inventario ─────────────────────────────────────────────────────
  listarInventario() {
    return this.unwrap(this.http.get<Envelope<Inventario[]>>(`${BASE}/inventario`));
  }
  crearInventario(dto: CreateInventarioDto) {
    return this.unwrap(this.http.post<Envelope<Inventario>>(`${BASE}/inventario`, dto));
  }
  actualizarInventario(id: string, dto: Partial<CreateInventarioDto>) {
    return this.unwrap(this.http.patch<Envelope<Inventario>>(`${BASE}/inventario/${id}`, dto));
  }
  eliminarInventario(id: string) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/inventario/${id}`));
  }
  stockProducto(idProducto: string) {
    return this.unwrap(
      this.http.get<Envelope<{ disponibles: number; total: number }>>(`${BASE}/inventario/producto/${idProducto}/stock`),
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
  actualizarNovedad(id: string, estado: EstadoNovedad) {
    return this.unwrap(this.http.patch<Envelope<Novedad>>(`${BASE}/novedades/${id}`, { estado }));
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
  crearSolicitud(dto: CreateSolicitudDto) {
    return this.unwrap(this.http.post<Envelope<Solicitud>>(`${BASE}/solicitudes`, dto));
  }
  aprobarSolicitud(id: string) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/aprobar`, {}));
  }
  rechazarSolicitud(id: string) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/rechazar`, {}));
  }
  entregarSolicitud(id: string) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/entregar`, {}));
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
  /** Marca que se inspeccionó la devolución de una solicitud — ver docblock de `Chequeo`. */
  crearChequeo(dto: CreateChequeoDto) {
    return this.unwrap(this.http.post<Envelope<Chequeo>>(`${BASE}/chequeos`, dto));
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
