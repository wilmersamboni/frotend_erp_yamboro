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
 */
export type AccesoPantalla =
  | { tipo: 'servicio'; servicio: string }
  | { tipo: 'admin' }
  | { tipo: 'admin-o-servicio'; servicio: string }
  | { tipo: 'responsable-bodega' };

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

/** En el orden del menú: lo de uso diario arriba, la configuración abajo. */
export const PANTALLAS_MATERIALES: PantallaMateriales[] = [
  { id: 'mi-bodega', label: 'Mi Bodega', path: 'mi-bodega', seccion: 'Inventario', acceso: { tipo: 'responsable-bodega' } },
  { id: 'solicitudes', label: 'Solicitudes', path: 'materiales/solicitudes', seccion: 'Operación', acceso: servicio('materiales.solicitudes.ver') },
  { id: 'devoluciones', label: 'Devoluciones', path: 'materiales/devoluciones', seccion: 'Operación', acceso: servicio('materiales.devoluciones.ver') },
  // Préstamos vencidos / por vencer; la pestaña de perecederos se suma con `materiales.lotes.ver`.
  { id: 'vencimientos', label: 'Vencimientos', path: 'materiales/vencimientos', seccion: 'Inventario', acceso: servicio('materiales.solicitudes.ver') },
  { id: 'existencias', label: 'Existencias', path: 'materiales/existencias', seccion: 'Inventario', acceso: servicio('materiales.existencias.ver') },
  { id: 'items', label: 'Ítems', path: 'materiales/items', seccion: 'Inventario', acceso: servicio('materiales.items.ver') },
  { id: 'lotes', label: 'Lotes', path: 'materiales/lotes', seccion: 'Inventario', acceso: servicio('materiales.lotes.ver') },
  { id: 'productos', label: 'Productos', path: 'materiales/productos', seccion: 'Catálogo', acceso: servicio('materiales.productos.ver'), cubiertaPorMiBodega: true },
  // "Mi Bodega" sin recortar a "las mías" — consola del administrador.
  { id: 'bodegas', label: 'Bodegas', path: 'materiales/bodegas', seccion: 'Catálogo', acceso: { tipo: 'admin' } },
  { id: 'novedades', label: 'Novedades', path: 'materiales/novedades', seccion: 'Operación', acceso: servicio('materiales.novedades.ver') },
  { id: 'traslados', label: 'Traslados', path: 'materiales/traslados', seccion: 'Operación', acceso: servicio('materiales.traslados.ver') },
  { id: 'asignaciones', label: 'Asignaciones', path: 'materiales/asignaciones', seccion: 'Operación', acceso: { tipo: 'admin-o-servicio', servicio: 'materiales.asignaciones.ver' } },
  { id: 'kardex', label: 'Kardex', path: 'materiales/kardex', seccion: 'Inventario', acceso: servicio('materiales.kardex.ver') },
  { id: 'sitios', label: 'Sitios', path: 'materiales/sitios', seccion: 'Catálogo', acceso: servicio('materiales.sitios.ver') },
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
