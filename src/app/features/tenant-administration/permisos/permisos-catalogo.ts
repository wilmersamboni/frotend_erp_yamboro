/**
 * Lógica pura (sin Angular) del panel de permisos: cómo se llaman las cosas en
 * español, cómo se agrupan los servicios técnicos en "recursos" con una
 * escalera de nivel, y cómo se decide el estado de cada permiso.
 *
 * Todo lo que falte en los diccionarios cae a un formateador genérico en vez de
 * romperse o mostrar vacío: los diccionarios son solo cosméticos, el catálogo
 * real de servicios sale siempre del backend.
 */

export interface ServicioCat {
  idServicio: string;
  nombre: string;
}

/** Un peldaño de la escalera: uno o más servicios que se otorgan/revocan juntos. */
export interface PasoEscalera {
  servicios: ServicioCat[];
  label: string;
  /** Columna de la matriz: 0 = Ver, 1 = Modificar (crear/editar), 2 = Control total (eliminar/administrar). */
  posicion: number;
  /** Su nombre no es el genérico de la columna (ej. «Ver listado»): la celda lo muestra con texto propio. */
  especial: boolean;
}

/** Acción que no es un nivel de acceso (aprobar, subir, competencias...): se muestra como interruptor aparte. */
export interface ExtraSwitch {
  servicio: ServicioCat;
  /** Frase completa, ej. «Aprobar traslados». */
  label: string;
}

export interface RecursoUI {
  /** Nombre técnico del recurso (todo antes del último '.'), ej. 'practica.formatos'. */
  recurso: string;
  label: string;
  /** Ordenados de menor a mayor acceso. Vacío si el recurso solo tiene extras. */
  pasos: PasoEscalera[];
  extras: ExtraSwitch[];
}

export interface ModuloUI {
  /** Nombre real en el catálogo (`servicio.modulo.nombre`). */
  nombre: string;
  etiqueta: string;
  descripcion: string;
  servicios: ServicioCat[];
  recursos: RecursoUI[];
}

/**
 * Decisión sobre un servicio. En modo rol solo hay `otorgado` y `heredar`
 * (= el rol no lo tiene). En modo usuario `heredar` es "sin excepción propia",
 * `otorgado` es una excepción que lo da y `denegado` una que lo quita.
 */
export type Decision = 'heredar' | 'otorgado' | 'denegado';

/** De dónde sale lo que ve la persona: del rol, de una excepción que lo añade, de una que lo quita, o no lo tiene. */
export type Origen = 'rol' | 'extra' | 'bloqueado' | 'no';

// ── Textos ──────────────────────────────────────────────────────────────────

const SERVICIO_LABELS: Record<string, string> = {
  // Materiales — catálogo
  'materiales.sitios.ver': 'Ver sitios de bodega', 'materiales.sitios.crear': 'Crear sitios de bodega',
  'materiales.sitios.editar': 'Editar sitios de bodega', 'materiales.sitios.eliminar': 'Eliminar sitios de bodega',
  'materiales.productos.ver': 'Ver catálogo de productos', 'materiales.productos.crear': 'Crear productos',
  'materiales.productos.editar': 'Editar productos', 'materiales.productos.eliminar': 'Eliminar productos',
  'materiales.items.ver': 'Ver ítems individuales', 'materiales.items.crear': 'Crear ítems',
  'materiales.items.editar': 'Editar ítems',
  'materiales.existencias.ver': 'Ver existencias',
  'materiales.categorias.ver': 'Ver categorías', 'materiales.categorias.crear': 'Crear categorías',
  'materiales.categorias.editar': 'Editar categorías', 'materiales.categorias.eliminar': 'Eliminar categorías',
  'materiales.kardex.ver': 'Ver kardex de movimientos',
  'materiales.notificaciones.ver': 'Ver notificaciones de materiales',
  // Materiales — solicitudes de préstamo
  'materiales.solicitudes.ver': 'Ver solicitudes de material', 'materiales.solicitudes.crear': 'Crear solicitudes de material',
  'materiales.solicitudes.aprobar': 'Aprobar solicitudes de material', 'materiales.solicitudes.rechazar': 'Rechazar solicitudes de material',
  'materiales.solicitudes.entregar': 'Entregar material solicitado', 'materiales.solicitudes.confirmar': 'Confirmar recepción de material',
  // Materiales — novedades / traslados / asignaciones / devoluciones
  'materiales.novedades.ver': 'Ver novedades (daño/pérdida)', 'materiales.novedades.crear': 'Reportar novedades',
  'materiales.novedades.editar': 'Resolver novedades', 'materiales.novedades.eliminar': 'Eliminar novedades',
  'materiales.traslados.ver': 'Ver traslados entre sitios', 'materiales.traslados.crear': 'Crear traslados',
  'materiales.traslados.aprobar': 'Aprobar traslados', 'materiales.traslados.rechazar': 'Rechazar traslados',
  'materiales.asignaciones.ver': 'Ver asignaciones a fichas', 'materiales.asignaciones.crear': 'Crear asignaciones',
  'materiales.asignaciones.anular': 'Anular asignaciones', 'materiales.asignaciones.editar': 'Editar asignaciones',
  'materiales.asignaciones.eliminar': 'Eliminar asignaciones',
  'materiales.devoluciones.ver': 'Ver devoluciones', 'materiales.devoluciones.crear': 'Registrar devoluciones',
  'materiales.detalle-solicitud.ver': 'Ver detalle de solicitudes', 'materiales.detalle-solicitud.crear': 'Crear detalle de solicitudes',
  'materiales.actas.ver': 'Ver actas de entrega', 'materiales.actas.crear': 'Crear actas de entrega',
  'materiales.ingresos.gestionar': 'Gestionar ingresos y proveedores',
  'materiales.chequeos.ver': 'Ver chequeos de devolución', 'materiales.items-chequeo.ver': 'Ver ítems de chequeo',
  // Personas y Matrículas
  'personas.ver': 'Ver personas', 'personas.gestionar': 'Crear y editar personas',
  'matriculas.ver': 'Ver matrículas', 'matriculas.gestionar': 'Crear y editar matrículas',
  // Horarios
  'horarios.ver': 'Ver horarios', 'horarios.gestionar': 'Crear y editar horarios',
  'horarios.competencias': 'Gestionar competencias', 'horarios.eventos': 'Gestionar eventos del calendario',
  // Etapa Práctica — los nombres técnicos 'gestionar'/'administrar' engañan: .gestionar de empresas es
  // en realidad VER el listado completo y .administrar es lo que cubre crear/editar/eliminar.
  'practica.empresas.ver': 'Ver el detalle de una empresa',
  'practica.empresas.gestionar': 'Ver el listado completo de empresas',
  'practica.empresas.administrar': 'Crear, editar y eliminar empresas — control total',
  'practica.formatos.ver': 'Ver formatos', 'practica.formatos.gestionar': 'Gestionar formatos (subir, editar y eliminar)',
  'practica.migracion': 'Migrar datos de práctica',
  'practica.bitacoras.subir': 'Subir bitácoras',
  'materiales.salidas.ver': 'Ver salidas de material', 'materiales.salidas.crear': 'Pedir y gestionar salidas de material',
  'materiales.cuentadante.ver': 'Ver cuentadantes y bienes a cargo', 'materiales.escaneo.usar': 'Escanear placas de equipos',
  'materiales.catalogo.ver': 'Ver la pantalla Catálogo de productos (necesita también «Ver productos»)',
  'horarios.competencias.ver': 'Ver competencias', 'horarios.competencias.gestionar': 'Crear y editar competencias',
  'horarios.eventos.ver': 'Ver eventos del calendario', 'horarios.eventos.gestionar': 'Crear y editar eventos del calendario',
  // Encuestas
  'encuestas.preguntas': 'Gestionar preguntas de encuestas', 'encuestas.gestionar': 'Gestionar encuestas',
  // Ambientes / RBAC
  'ambientes.gestionar': 'Gestionar ambientes físicos', 'permisos.gestionar': 'Gestionar roles y permisos del sistema',
  'usuarios.gestionar': 'Ver y gestionar usuarios y credenciales de acceso',
  'academico.gestionar': 'Crear, editar y eliminar cursos y programas',
  'organizacion.gestionar': 'Crear, editar y eliminar sedes, municipios y áreas',
};

const RECURSO_LABELS: Record<string, string> = {
  'materiales.sitios': 'Sitios y bodegas', 'materiales.productos': 'Productos',
  'materiales.items': 'Ítems individuales', 'materiales.existencias': 'Existencias',
  'materiales.categorias': 'Categorías', 'materiales.kardex': 'Historial de movimientos',
  'materiales.notificaciones': 'Notificaciones', 'materiales.solicitudes': 'Solicitudes y préstamos',
  'materiales.novedades': 'Daños y problemas', 'materiales.traslados': 'Traslados entre bodegas',
  'materiales.asignaciones': 'Entregas a fichas', 'materiales.devoluciones': 'Devoluciones',
  'materiales.detalle-solicitud': 'Detalle de solicitudes', 'materiales.actas': 'Actas de entrega',
  'materiales.ingresos': 'Ingresos y proveedores', 'materiales.chequeos': 'Chequeos de devolución',
  'materiales.items-chequeo': 'Ítems de chequeo', 'materiales.lotes': 'Material que se gasta (lotes)',
  'materiales.salidas': 'Salidas de material', 'materiales.cuentadante': 'Cuentadante', 'materiales.escaneo': 'Escanear placa', 'materiales.catalogo': 'Pantalla Catálogo de productos',
  'personas': 'Personas', 'matriculas': 'Matrículas', 'horarios': 'Horarios',
  'practica.empresas': 'Empresas', 'practica.formatos': 'Formatos', 'practica.migracion': 'Migración de datos',
  'practica': 'Migración de datos', 'practica.asignaciones': 'Asignaciones de instructor', 'practica.bitacoras': 'Bitácoras',
  'practica.etapas': 'Etapas prácticas', 'practica.historial': 'Historial', 'practica.observaciones': 'Observaciones',
  'practica.seguimientos': 'Seguimientos', 'horarios.competencias': 'Competencias', 'horarios.eventos': 'Eventos del calendario',
  'encuestas': 'Encuestas', 'ambientes': 'Ambientes', 'permisos': 'Roles y permisos',
  'usuarios': 'Usuarios y credenciales', 'academico': 'Cursos y programas', 'organizacion': 'Sedes, municipios y áreas',
};

const MODULO_ETIQUETA: Record<string, string> = { RBAC: 'Roles y permisos' };

const MODULO_DESCRIPCION: Record<string, string> = {
  'Personas y Matrículas': 'Fichas de personas y sus matrículas en los cursos.',
  'Académico': 'Cursos y programas de formación.',
  'Organización': 'Sedes, municipios y áreas.',
  'Usuarios y Credenciales': 'Cuentas de acceso, roles y contraseñas.',
  'Horarios': 'Horarios, competencias y calendario.',
  'Etapa Práctica': 'Empresas, formatos y seguimiento de la etapa práctica.',
  'Materiales': 'Bodegas, inventario, préstamos y salidas de material.',
  'Encuestas': 'Encuestas de satisfacción.',
  'Ambientes': 'Aulas y espacios físicos.',
  'RBAC': 'Quién puede cambiar los roles y los permisos del sistema.',
};

/** Orden de los módulos en la lista lateral: lo que más se usa primero; lo desconocido, al final por orden alfabético. */
const MODULO_ORDEN = [
  'Personas y Matrículas', 'Académico', 'Organización', 'Usuarios y Credenciales', 'Horarios',
  'Etapa Práctica', 'Materiales', 'Encuestas', 'Ambientes', 'RBAC',
];

const ACCION_VERBO: Record<string, string> = {
  ver: 'Ver', crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar', gestionar: 'Gestionar',
  administrar: 'Administrar', aprobar: 'Aprobar', rechazar: 'Rechazar', entregar: 'Entregar',
  confirmar: 'Confirmar', anular: 'Anular', activar: 'Activar', desactivar: 'Desactivar',
  subir: 'Subir', descargar: 'Descargar', importar: 'Importar', exportar: 'Exportar',
};

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function humanizar(s: string): string {
  return capitalizar(s.replace(/[-_]/g, ' '));
}

/** 'practica.formatos.ver' → 'practica.formatos'; 'personas.ver' → 'personas'. */
export function recursoDe(nombre: string): string {
  const i = nombre.lastIndexOf('.');
  return i === -1 ? nombre : nombre.slice(0, i);
}

export function etiquetaRecurso(recurso: string): string {
  return RECURSO_LABELS[recurso] ?? humanizar(recurso.split('.').pop()!);
}

/** Frase en español de un servicio técnico: «Ver sitios de bodega», «Crear lotes»... */
export function fraseServicio(nombre: string): string {
  const conocida = SERVICIO_LABELS[nombre];
  if (conocida) return conocida;
  const accion = nombre.split('.').pop()!;
  const verbo = ACCION_VERBO[accion];
  const recurso = etiquetaRecurso(recursoDe(nombre)).toLowerCase();
  if (verbo && nombre.includes('.')) return `${verbo} ${recurso}`;
  return humanizar(nombre.split('.').join(' · '));
}

/** Texto para comparar al buscar: sin tildes ni mayúsculas. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ── Escalera de nivel ───────────────────────────────────────────────────────

/**
 * Posición en la escalera según el último segmento del nombre técnico.
 * 'crear'/'editar'/'gestionar' comparten posición porque en este catálogo
 * nunca conviven como niveles independientes de un mismo recurso. Cualquier
 * acción fuera de este mapa (aprobar, subir, competencias...) no es un nivel
 * de acceso: va aparte como interruptor.
 */
const RUNGO_POSICION: Record<string, number> = {
  ver: 0,
  crear: 1, editar: 1, gestionar: 1,
  eliminar: 2, administrar: 2,
};

/** Textos cortos de los peldaños cuyo nombre técnico no describe lo que realmente hacen. */
const RUNGO_LABEL_OVERRIDE: Record<string, string> = {
  'practica.empresas.ver': 'Ver detalle',
  'practica.empresas.gestionar': 'Ver listado',
};

function labelPasoGenerico(posicion: number, acciones: string[]): string {
  if (posicion === 0) return 'Ver';
  if (posicion === 2) return acciones.includes('administrar') ? 'Control total' : 'Eliminar';
  return acciones.includes('editar') || acciones.includes('gestionar') ? 'Editar' : 'Crear';
}

export function construirRecurso(recurso: string, items: ServicioCat[]): RecursoUI {
  const porPosicion = new Map<number, ServicioCat[]>();
  const extras: ExtraSwitch[] = [];

  for (const s of items) {
    const posicion = RUNGO_POSICION[s.nombre.split('.').pop()!];
    if (posicion === undefined) {
      extras.push({ servicio: s, label: fraseServicio(s.nombre) });
      continue;
    }
    porPosicion.set(posicion, [...(porPosicion.get(posicion) ?? []), s]);
  }

  const pasos: PasoEscalera[] = [...porPosicion.entries()]
    .sort(([a], [b]) => a - b)
    .map(([posicion, servicios]) => {
      const override = servicios.map(s => RUNGO_LABEL_OVERRIDE[s.nombre]).find(Boolean);
      const acciones = servicios.map(s => s.nombre.split('.').pop()!);
      return { servicios, label: override ?? labelPasoGenerico(posicion, acciones), posicion, especial: !!override };
    });

  extras.sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return { recurso, label: etiquetaRecurso(recurso), pasos, extras };
}

/** Nivel de la escalera: cuántos peldaños consecutivos desde abajo tienen TODOS sus servicios activos. */
export function nivelDe(r: RecursoUI, activo: (idServicio: string) => boolean): number {
  let n = 0;
  for (const paso of r.pasos) {
    if (paso.servicios.every(s => activo(s.idServicio))) n++;
    else break;
  }
  return n;
}

/** ¿Hay peldaños activos por encima del nivel (ej. puede eliminar pero no ver)? Combinación inusual que la escalera no puede mostrar. */
export function tieneHuecos(r: RecursoUI, activo: (idServicio: string) => boolean): boolean {
  const nivel = nivelDe(r, activo);
  return r.pasos.some((paso, i) => i >= nivel && paso.servicios.some(s => activo(s.idServicio)));
}

/** «Sin acceso», «Ver», «Ver y editar», «Ver, editar y eliminar». */
export function textoNivel(r: RecursoUI, nivel: number): string {
  if (nivel <= 0) return 'Sin acceso';
  const partes = r.pasos.slice(0, nivel).map(p => p.label.toLowerCase());
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
  return capitalizar(lista);
}

// ── Catálogo ────────────────────────────────────────────────────────────────

/** Arma los módulos con sus recursos a partir de la lista de servicios del backend (`servicio.modulo.nombre`). */
export function construirModulos(servicios: any[]): ModuloUI[] {
  const porModulo = new Map<string, ServicioCat[]>();
  for (const s of servicios) {
    const nombre = s.modulo?.nombre ?? 'Otros';
    porModulo.set(nombre, [...(porModulo.get(nombre) ?? []), { idServicio: s.idServicio, nombre: s.nombre }]);
  }

  const modulos = [...porModulo.entries()].map(([nombre, lista]): ModuloUI => {
    const porRecurso = new Map<string, ServicioCat[]>();
    for (const s of lista) {
      const rec = recursoDe(s.nombre);
      porRecurso.set(rec, [...(porRecurso.get(rec) ?? []), s]);
    }
    return {
      nombre,
      etiqueta: MODULO_ETIQUETA[nombre] ?? nombre,
      descripcion: MODULO_DESCRIPCION[nombre] ?? '',
      servicios: lista,
      recursos: [...porRecurso.entries()]
        .map(([rec, items]) => construirRecurso(rec, items))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    };
  });

  const posicion = (nombre: string) => {
    const i = MODULO_ORDEN.indexOf(nombre);
    return i === -1 ? MODULO_ORDEN.length : i;
  };
  return modulos.sort((a, b) => posicion(a.nombre) - posicion(b.nombre) || a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

// ── Estado de un permiso ────────────────────────────────────────────────────

/** Qué ve la persona frente a lo que da su rol. */
export function origenDe(efectivo: boolean, delRol: boolean): Origen {
  if (efectivo) return delRol ? 'rol' : 'extra';
  return delRol ? 'bloqueado' : 'no';
}

/**
 * Decisión mínima que produce el resultado `quiere`. Si coincide con lo que ya
 * da el rol, no hace falta excepción alguna (`heredar`): así nunca se guardan
 * excepciones redundantes.
 */
export function decisionPara(quiere: boolean, delRol: boolean, modoRol: boolean): Decision {
  if (modoRol) return quiere ? 'otorgado' : 'heredar';
  if (quiere === delRol) return 'heredar';
  return quiere ? 'otorgado' : 'denegado';
}

/** Resultado efectivo de una decisión. En modo usuario `heredar` vale lo que dé el rol; en modo rol solo `otorgado` lo da. */
export function efectivoDe(decision: Decision, delRol: boolean, modoRol: boolean): boolean {
  if (modoRol) return decision === 'otorgado';
  if (decision === 'otorgado') return true;
  if (decision === 'denegado') return false;
  return delRol;
}

// ── Qué permisos del rol valen de verdad para una cuenta ────────────────────

/** Roles que no quedan atados al aplicativo de su cuenta. Mismo criterio que `RebacGuard` (backend-epsas). */
const ROLES_SIN_RESTRICCION_APLICATIVO = ['administrador_erp', 'instructor', 'aprendiz'];

/**
 * Servicios del núcleo del ERP que cualquier administrador usa sin importar su aplicativo.
 * Copia de `SERVICIOS_ADMIN_SIN_RESTRICCION_APLICATIVO` en backend-epsas
 * (`permisos.service.ts`): si cambia allá, hay que cambiarla aquí.
 */
const SERVICIOS_SIN_RESTRICCION_APLICATIVO = new Set([
  'personas.ver', 'personas.gestionar', 'matriculas.ver', 'matriculas.gestionar',
  'academico.gestionar', 'organizacion.gestionar', 'usuarios.gestionar', 'ambientes.gestionar',
]);

/**
 * ¿El permiso que guarda el rol vale para esta cuenta? Un `administrador` solo usa los servicios de
 * módulos de su propio aplicativo (más el núcleo del ERP): el rol es compartido por todos los
 * administradores y guarda permisos de todos los módulos, pero el sistema filtra por aplicativo al
 * comprobarlos. Una excepción personal sí se salta ese filtro, y por eso es como se le da un módulo ajeno.
 */
export function aplicaAlRol(
  rolNombre: string,
  nombreServicio: string,
  aplicativoDelServicio: string | null | undefined,
  aplicativoDeLaCuenta: string | null | undefined,
): boolean {
  if (ROLES_SIN_RESTRICCION_APLICATIVO.includes(rolNombre)) return true;
  if (SERVICIOS_SIN_RESTRICCION_APLICATIVO.has(nombreServicio)) return true;
  return !!aplicativoDeLaCuenta && aplicativoDelServicio === aplicativoDeLaCuenta;
}
