/**
 * Fuente única de "quién entra a qué" en Materiales, del lado del frontend.
 *
 * Antes la misma regla vivía copiada en tres sitios — la ruta
 * (`materiales.routes.ts`), el menú (`sidebar.component.ts`, con un link por
 * pantalla Y por cargo) y cada componente que pedía una lista auxiliar — y se
 * desincronizaban: un aprendiz encargado de bodega recibía
 * `materiales.traslados.ver` con su bundle, la ruta lo dejaba entrar, pero el
 * menú no tenía link de Traslados para el cargo aprendiz, así que la pantalla
 * existía y era invisible. Ahora rutas y menú se generan de `PANTALLAS_MATERIALES`.
 *
 * No sustituye la autorización del backend: los nombres de servicio y los
 * `@RequiereServicio(...)` de backend-practica-hexagonal siguen siendo la
 * verdad. Si allá cambia quién puede leer una lista, se actualiza
 * `LECTURA_LISTA` acá — es el único lugar.
 */

export const CARGOS_ADMIN = ['administrador', 'administrador_erp'];

export type SeccionMateriales = 'Operación' | 'Inventario' | 'Catálogo' | 'Actas';

/**
 * Regla de acceso de una pantalla:
 * - `servicio`: hace falta ese servicio, sea cual sea el cargo (lo normal).
 * - `admin`: solo cargo administrador.
 * - `admin-o-servicio`: cargo administrador, o cualquiera con el servicio.
 * - `responsable-bodega`: ser `id_responsable` de ≥1 bodega y no ser admin
 *   (lo resuelve `miBodegaGuard`, no `roleGuard`).
 * - `gestor`: el servicio, y además gestionar Materiales: admin, encargado de
 *   ≥1 bodega o líder de área (`gestorMaterialesGuard`). Para pantallas con
 *   datos personales de terceros, como el Reporte de materiales.
 * - `cualquiera`: alguno de los servicios (OR) — pantallas de entrada que usa
 *   todo el que trabaja con Materiales (Inicio, Escanear placa).
 */
export type AccesoPantalla =
  | { tipo: 'servicio'; servicio: string }
  | { tipo: 'admin' }
  | { tipo: 'admin-o-servicio'; servicio: string }
  | { tipo: 'responsable-bodega' }
  | { tipo: 'gestor'; servicio: string }
  | { tipo: 'cualquiera'; servicios: string[] };

export interface PantallaMateriales {
  id: string;
  label: string;
  /** Sin `/` inicial, como en `Routes`. */
  path: string;
  seccion: SeccionMateriales;
  acceso: AccesoPantalla;
  /** `false` = tiene ruta pero no link propio en el menú (se llega desde otra pantalla). */
  enMenu?: boolean;
  /** "Mi Bodega" ya la cubre: el link se oculta a un no-admin que administra una bodega. */
  cubiertaPorMiBodega?: boolean;
}

const servicio = (nombre: string): AccesoPantalla => ({ tipo: 'servicio', servicio: nombre });

/** Quien usa Materiales de cualquier forma (ver, pedir, gestionar): mismo OR que el backend de `materiales/escaneo` y `materiales/pendientes`. */
export const SERVICIOS_ENTRADA = [
  'materiales.items.ver',
  'materiales.productos.ver',
  'materiales.solicitudes.crear',
  'materiales.solicitudes.ver',
  'materiales.existencias.ver',
];

/** En el orden del menú: lo de uso diario arriba, la configuración abajo. */
export const PANTALLAS_MATERIALES: PantallaMateriales[] = [
  // Entrada de Materiales por TAREAS (2026-10-05): "¿qué quieres hacer?" + lo pendiente de cada uno.
  { id: 'inicio', label: 'Inicio', path: 'materiales/inicio', seccion: 'Operación', acceso: { tipo: 'cualquiera', servicios: SERVICIOS_ENTRADA } },
  { id: 'escanear', label: 'Escanear placa', path: 'materiales/escanear', seccion: 'Operación', acceso: { tipo: 'cualquiera', servicios: SERVICIOS_ENTRADA } },
  { id: 'mi-bodega', label: 'Mi Bodega', path: 'mi-bodega', seccion: 'Inventario', acceso: { tipo: 'responsable-bodega' } },
  { id: 'solicitudes', label: 'Pedidos y préstamos', path: 'materiales/solicitudes', seccion: 'Operación', acceso: servicio('materiales.solicitudes.ver') },
  // Material que sale de la sede: consumibles (permanente) y devolutivos (despacho con póliza), 2026-10-05.
  { id: 'salidas', label: 'Salidas', path: 'materiales/salidas', seccion: 'Operación', acceso: servicio('materiales.solicitudes.ver') },
  { id: 'devoluciones', label: 'Devoluciones', path: 'materiales/devoluciones', seccion: 'Operación', acceso: servicio('materiales.devoluciones.ver') },
  // Préstamos vencidos / por vencer; la pestaña de perecederos se suma con `materiales.lotes.ver`.
  { id: 'vencimientos', label: 'Fechas por vencer', path: 'materiales/vencimientos', seccion: 'Inventario', acceso: servicio('materiales.solicitudes.ver') },
  { id: 'existencias', label: '¿Qué hay y dónde?', path: 'materiales/existencias', seccion: 'Inventario', acceso: servicio('materiales.existencias.ver') },
  // Qué hay, dónde, en qué estado y quién responde por cada material (2026-10-02).
  // Trae nombres y cédulas de quien tiene cada material: solo para quienes gestionan.
  { id: 'ingresos', label: 'Llegada de material', path: 'materiales/ingresos', seccion: 'Inventario', acceso: { tipo: 'gestor', servicio: 'materiales.productos.ver' } },
  { id: 'reporte', label: 'Reporte de materiales', path: 'materiales/reporte', seccion: 'Inventario', acceso: { tipo: 'gestor', servicio: 'materiales.existencias.ver' } },
  // Quién responde por cada devolutivo (2026-10-05): "Mis bienes a cargo" para cualquiera
  // que use Materiales —un instructor cuentadante no trae `items.ver`—; las pestañas de
  // gestión las decide `puedeGestionarCatalogo` dentro de la pantalla.
  { id: 'cuentadante', label: 'Cuentadante', path: 'materiales/cuentadante', seccion: 'Inventario', acceso: { tipo: 'cualquiera', servicios: SERVICIOS_ENTRADA } },
  { id: 'items', label: 'Equipos con placa', path: 'materiales/items', seccion: 'Inventario', acceso: servicio('materiales.items.ver') },
  { id: 'lotes', label: 'Material que se gasta', path: 'materiales/lotes', seccion: 'Inventario', acceso: servicio('materiales.lotes.ver') },
  { id: 'productos', label: 'Catálogo de productos', path: 'materiales/productos', seccion: 'Catálogo', acceso: servicio('materiales.productos.ver'), cubiertaPorMiBodega: true },
  // "Mi Bodega" sin recortar a "las mías" — consola del administrador.
  { id: 'bodegas', label: 'Bodegas', path: 'materiales/bodegas', seccion: 'Catálogo', acceso: { tipo: 'admin' } },
  { id: 'novedades', label: 'Daños y problemas', path: 'materiales/novedades', seccion: 'Operación', acceso: servicio('materiales.novedades.ver') },
  { id: 'traslados', label: 'Mover entre bodegas', path: 'materiales/traslados', seccion: 'Operación', acceso: servicio('materiales.traslados.ver') },
  { id: 'asignaciones', label: 'Entregas a fichas', path: 'materiales/asignaciones', seccion: 'Operación', acceso: { tipo: 'admin-o-servicio', servicio: 'materiales.asignaciones.ver' } },
  { id: 'kardex', label: 'Historial de movimientos', path: 'materiales/kardex', seccion: 'Inventario', acceso: servicio('materiales.kardex.ver') },
  { id: 'sitios', label: 'Sitios', path: 'materiales/sitios', seccion: 'Catálogo', acceso: servicio('materiales.sitios.ver') },
  { id: 'marcas', label: 'Marcas', path: 'materiales/marcas', seccion: 'Catálogo', acceso: { tipo: 'gestor', servicio: 'materiales.productos.ver' } },
  { id: 'proveedores', label: 'Proveedores', path: 'materiales/proveedores', seccion: 'Catálogo', acceso: { tipo: 'gestor', servicio: 'materiales.productos.ver' } },
  { id: 'categorias', label: 'Categorías', path: 'materiales/categorias', seccion: 'Catálogo', acceso: servicio('materiales.categorias.ver') },
  { id: 'actas', label: 'Actas', path: 'materiales/actas', seccion: 'Actas', acceso: servicio('materiales.actas.ver') },
  { id: 'importar', label: 'Importar productos', path: 'materiales/importar', seccion: 'Catálogo', acceso: servicio('materiales.productos.crear'), enMenu: false },
];

export function pantallaMateriales(id: string): PantallaMateriales {
  const pantalla = PANTALLAS_MATERIALES.find((p) => p.id === id);
  if (!pantalla) throw new Error(`Pantalla de Materiales desconocida: ${id}`);
  return pantalla;
}

/** `data` de la ruta, en el formato que entiende `roleGuard`. */
export function datosRutaMateriales(id: string): {
  roles?: string[];
  servicios?: string[];
  serviciosRequeridos?: string[];
} {
  const { acceso } = pantallaMateriales(id);
  switch (acceso.tipo) {
    case 'servicio':
      return { serviciosRequeridos: [acceso.servicio] };
    case 'admin':
      return { roles: CARGOS_ADMIN };
    case 'admin-o-servicio':
      return { roles: CARGOS_ADMIN, servicios: [acceso.servicio] };
    case 'responsable-bodega':
      return {};
    case 'gestor':
      return { serviciosRequeridos: [acceso.servicio] };
    case 'cualquiera':
      return { servicios: acceso.servicios };
  }
}

/**
 * Servicios con los que el backend deja LEER cada lista — el OR de cada
 * `@RequiereServicio(...)` del `@Get()` correspondiente. Las listas de
 * catálogo aceptan también el `.crear` de los flujos cuyo formulario las
 * necesita (ej. quien puede crear un traslado puede listar ítems y sitios).
 */
export const LECTURA_LISTA = {
  productos: ['materiales.productos.ver', 'materiales.asignaciones.crear', 'materiales.solicitudes.crear', 'materiales.items.crear'],
  items: ['materiales.items.ver', 'materiales.novedades.crear', 'materiales.traslados.crear'],
  sitios: ['materiales.sitios.ver', 'materiales.traslados.crear'],
  lotes: ['materiales.lotes.ver', 'materiales.solicitudes.crear'],
  categorias: ['materiales.categorias.ver'],
  solicitudes: ['materiales.solicitudes.ver'],
  chequeos: ['materiales.chequeos.ver'],
  itemsChequeo: ['materiales.items-chequeo.ver'],
} as const;

export type ListaMateriales = keyof typeof LECTURA_LISTA;

export function puedeListarMateriales(
  lista: ListaMateriales,
  tieneServicio: (nombre: string) => boolean,
): boolean {
  return LECTURA_LISTA[lista].some((nombre) => tieneServicio(nombre));
}
