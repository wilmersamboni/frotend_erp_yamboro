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
  id_categoria: number;
  nombre: string;
}

export interface Sitio {
  id_sitio: number;
  nombre: string;
  tipo: TipoSitio;
  tipo_personalizado?: string | null;
  codigo_lugar?: string | null;
  id_responsable?: string | null;
  id_centro?: string | null;
  estado: boolean;
}

export interface Producto {
  id_producto: number;
  nombre: string;
  descripcion?: string | null;
  codigo_unspsc?: string | null;
  SKU?: string | null;
  tipo_material: TipoMaterial;
  unidad_medida: string;
  es_psd: boolean;
  id_categoria: number;
  categoria?: Categoria;
  stock_minimo: number;
  fecha_vencimiento?: string | null;
  unidad_peso_bulto?: string | null;
  peso_por_bulto?: number | null;
  id_sitio?: number | null;
}

export interface Item {
  id_item: number;
  codigo_sku: string;
  estado: EstadoItem;
  id_producto: number;
  placa_sena?: string | null;
  id_sitio?: number | null;
  producto?: Producto;
}

export interface Inventario {
  id_inventario: number;
  estado: EstadoItem;
  id_item: number;
  id_sitio: number;
  item?: Item;
  sitio?: Sitio;
}

export interface CreateCategoriaDto {
  nombre: string;
}

export interface CreateSitioDto {
  nombre: string;
  tipo: TipoSitio;
  tipo_personalizado?: string;
  codigo_lugar?: string;
  id_responsable?: string;
  id_centro?: string;
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
  id_categoria: number;
  cantidad: number;
  placas_sena?: string[];
  stock_minimo: number;
  unidad_peso_bulto?: string;
  peso_por_bulto?: number;
  id_sitio: number;
}

export interface CreateInventarioDto {
  estado: EstadoItem;
  id_item: number;
  id_sitio: number;
}

export interface UpdateItemDto {
  placa_sena?: string;
  id_sitio?: number | null;
}

export interface Novedad {
  id_novedad: number;
  tipo: TipoNovedad;
  descripcion: string;
  estado: EstadoNovedad;
  fecha: string;
  id_usuario: string;
  id_item: number | null;
  item?: Item;
}

export interface CreateNovedadDto {
  tipo: TipoNovedad;
  descripcion: string;
  id_item?: number | null;
}

export type EstadoTraslado = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EN_ENTREGA' | 'ENTREGADA' | 'DEVUELTA';

export interface Solicitud {
  id_solicitud: number;
  fecha: string;
  estado: EstadoSolicitud;
  tipo: 'PRESTAMO';
  observacion: string | null;
  id_usuario: string;
  id_producto: number | null;
  cantidad: number;
  id_usuario_aprueba?: string | null;
  id_curso?: string | null;
  fecha_devolucion?: string | null;
  producto?: { id_producto: number; nombre: string; SKU: string | null; id_sitio: number | null; tipo_material: string };
}

export interface CreateSolicitudDto {
  tipo: 'PRESTAMO';
  id_producto: number;
  cantidad: number;
  observacion?: string;
  fecha_devolucion?: string;
}

export interface Traslado {
  id_traslado: number;
  id_item: number;
  id_sitio_origen: number;
  id_sitio_destino: number;
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
  id_item: number;
  id_sitio_destino: number;
  justificacion?: string;
}

export type EstadoDevolucion = 'BUENO' | 'REGULAR' | 'DAÑADO' | 'PERDIDO';

export interface Devolucion {
  id_devolucion: number;
  fecha: string;
  estado: EstadoDevolucion;
  observacion: string | null;
  id_solicitud: number;
  id_item: number;
  solicitud?: Solicitud;
}

export interface CreateDevolucionDto {
  id_solicitud: number;
  id_item: number;
  estado: EstadoDevolucion;
  observacion?: string;
}

export type EstadoAsignacion = 'ACTIVA' | 'ANULADA';

export interface Asignacion {
  id_asignacion: number;
  id_curso: string;
  id_producto: number;
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
  id_producto: number;
  cantidad: number;
  observacion?: string;
  fecha_devolucion?: string;
}

export interface Notificacion {
  id_notificacion: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  data: Record<string, any> | null;
  leida: boolean;
  fecha: string;
  id_usuario: string;
}

export interface Kardex {
  id_kardex: number;
  tipo: 'ENTRADA' | 'SALIDA';
  cantidad: number;
  saldo_anterior: number;
  saldo_actual: number;
  fecha: string;
  observacion: string | null;
  id_item: number;
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
  actualizarCategoria(id: number, dto: Partial<CreateCategoriaDto>) {
    return this.unwrap(this.http.patch<Envelope<Categoria>>(`${BASE}/categorias/${id}`, dto));
  }
  eliminarCategoria(id: number) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/categorias/${id}`));
  }

  // ── Sitios ─────────────────────────────────────────────────────────
  listarSitios() {
    return this.unwrap(this.http.get<Envelope<Sitio[]>>(`${BASE}/sitios`));
  }
  crearSitio(dto: CreateSitioDto) {
    return this.unwrap(this.http.post<Envelope<Sitio>>(`${BASE}/sitios`, dto));
  }
  actualizarSitio(id: number, dto: Partial<CreateSitioDto>) {
    return this.unwrap(this.http.patch<Envelope<Sitio>>(`${BASE}/sitios/${id}`, dto));
  }
  eliminarSitio(id: number) {
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
  actualizarProducto(id: number, dto: Partial<CreateProductoDto>) {
    return this.unwrap(this.http.patch<Envelope<Producto>>(`${BASE}/productos/${id}`, dto));
  }
  eliminarProducto(id: number) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/productos/${id}`));
  }

  // ── Items ──────────────────────────────────────────────────────────
  listarItems(idProducto?: number) {
    const params = idProducto != null ? { id_producto: String(idProducto) } : undefined;
    return this.unwrap(this.http.get<Envelope<Item[]>>(`${BASE}/items`, { params }));
  }
  buscarItemPorPlaca(placa: string) {
    return this.unwrap(
      this.http.get<Envelope<{ item: Item; prestamo_activo: any; asignacion_activa: any; novedad_activa: any } | null>>(
        `${BASE}/items/buscar/${encodeURIComponent(placa)}`,
      ),
    );
  }
  actualizarItem(id: number, dto: UpdateItemDto) {
    return this.unwrap(this.http.patch<Envelope<Item>>(`${BASE}/items/${id}`, dto));
  }
  actualizarEstadoItem(id: number, estado: EstadoItem) {
    return this.unwrap(this.http.patch<Envelope<Item>>(`${BASE}/items/${id}/estado`, { estado }));
  }

  // ── Inventario ─────────────────────────────────────────────────────
  listarInventario() {
    return this.unwrap(this.http.get<Envelope<Inventario[]>>(`${BASE}/inventario`));
  }
  crearInventario(dto: CreateInventarioDto) {
    return this.unwrap(this.http.post<Envelope<Inventario>>(`${BASE}/inventario`, dto));
  }
  stockProducto(idProducto: number) {
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
  actualizarNovedad(id: number, estado: EstadoNovedad) {
    return this.unwrap(this.http.patch<Envelope<Novedad>>(`${BASE}/novedades/${id}`, { estado }));
  }
  eliminarNovedad(id: number) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/novedades/${id}`));
  }

  // ── Traslados ──────────────────────────────────────────────────────
  listarTraslados() {
    return this.unwrap(this.http.get<Envelope<Traslado[]>>(`${BASE}/traslados`));
  }
  crearTraslado(dto: CreateTrasladoDto) {
    return this.unwrap(this.http.post<Envelope<Traslado>>(`${BASE}/traslados`, dto));
  }
  aprobarTraslado(id: number) {
    return this.unwrap(this.http.patch<Envelope<Traslado>>(`${BASE}/traslados/${id}/aprobar`, {}));
  }
  rechazarTraslado(id: number, observacion_resolucion?: string) {
    return this.unwrap(this.http.patch<Envelope<Traslado>>(`${BASE}/traslados/${id}/rechazar`, { observacion_resolucion }));
  }

  // ── Solicitudes ────────────────────────────────────────────────────
  listarSolicitudes() {
    return this.unwrap(this.http.get<Envelope<Solicitud[]>>(`${BASE}/solicitudes`));
  }
  crearSolicitud(dto: CreateSolicitudDto) {
    return this.unwrap(this.http.post<Envelope<Solicitud>>(`${BASE}/solicitudes`, dto));
  }
  aprobarSolicitud(id: number) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/aprobar`, {}));
  }
  rechazarSolicitud(id: number) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/rechazar`, {}));
  }
  entregarSolicitud(id: number) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/entregar`, {}));
  }
  confirmarRecepcionSolicitud(id: number) {
    return this.unwrap(this.http.patch<Envelope<Solicitud>>(`${BASE}/solicitudes/${id}/confirmar-recepcion`, {}));
  }

  // ── Devoluciones (solo registro — sin máquina de estados propia) ─────
  listarDevoluciones() {
    return this.unwrap(this.http.get<Envelope<Devolucion[]>>(`${BASE}/devoluciones`));
  }
  crearDevolucion(dto: CreateDevolucionDto) {
    return this.unwrap(this.http.post<Envelope<Devolucion>>(`${BASE}/devoluciones`, dto));
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
  anularAsignacion(id: number) {
    return this.unwrap(this.http.patch<Envelope<Asignacion>>(`${BASE}/materiales/asignaciones/${id}/anular`, {}));
  }
  eliminarAsignacion(id: number) {
    return this.unwrap(this.http.delete<Envelope<null>>(`${BASE}/materiales/asignaciones/${id}`));
  }

  // ── Notificaciones ─────────────────────────────────────────────────
  listarNotificaciones(idUsuario: string) {
    return this.unwrap(this.http.get<Envelope<Notificacion[]>>(`${BASE}/notificaciones`, { params: { id_usuario: idUsuario } }));
  }
  marcarNotificacionLeida(id: number) {
    return this.unwrap(this.http.patch<Envelope<Notificacion>>(`${BASE}/notificaciones/${id}/marcar-leida`, {}));
  }
  marcarTodasNotificacionesLeidas(idUsuario: string) {
    return this.unwrap(this.http.patch<Envelope<null>>(`${BASE}/notificaciones/leer-todas`, {}, { params: { id_usuario: idUsuario } }));
  }
}
