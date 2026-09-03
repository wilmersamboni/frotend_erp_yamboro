import { environment } from '../../../../environments/environment';

const BASE  = environment.apiUrl;
const BASE2 = environment.apiPracticaUrl;

export type Modulo =
  // ── backend-epsas (api) ────────────────────────────────
  | 'personas' | 'matriculas' | 'cursos' | 'programas' | 'areas'
  | 'usuarios' | 'credenciales'
  // ── catálogos internos (no pestaña) ───────────────────
  | 'sedes' | 'centros' | 'roles' | 'municipios' | 'aplicativos' | 'departamentos'
  | 'ambientes'
  // ── RBAC: solo administrador_erp (ver MODULOS_EPSAS, no en MODULOS_ADMIN) ──
  | 'modulos' | 'servicios' | 'permisos'
  // ── backend-practica-hexagonal (api2) ─────────────────
  | 'empresas' | 'modalidades' | 'etapas' | 'asignaciones'
  | 'seguimientos' | 'bitacoras' | 'observaciones' | 'formatos';

export interface Selector {
  /** Módulo del que se cargan las opciones */
  modulo: Modulo;
  /** Campo a mostrar como etiqueta en el <select> */
  label: string;
  /** Campo a usar como valor (el FK que se envía al backend) */
  value: string;
  /**
   * Filtro opcional: solo incluye items donde item[campo] === valor.
   * Útil para filtrar personas por cargo, etc.
   * Ejemplo: { cargo: 'aprendiz' }
   */
  filtro?: Record<string, any>;
}

export interface ModuloConfig {
  label:      string;
  idKey:      string;
  listar:     string;
  crear:      string | null;
  actualizar: ((id: string) => string) | null;
  eliminar:   ((id: string) => string) | null;
  columnas?: string[];
  campos?: string[];
  selectores?: Record<string, Selector>;
  tiposCampo?: Record<string, 'date' | 'number' | 'email' | 'text' | 'password' | 'boolean' | 'tel'>;
  usePatch?: boolean;
  grupo?: 'epsas' | 'practica';
  /** Categoría dentro del sidebar del panel admin — agrupa módulos afines. */
  categoria?: string;
  /**
   * Servicio dinámico requerido para VER esta pestaña en /admin — reusa el
   * mismo nombre que ya gatea el endpoint backend correspondiente (no se
   * inventan servicios nuevos). Opcional a propósito: solo se puso donde ya
   * existe un @RequiereServicio real detrás; los módulos sin guard backend
   * (cursos, sedes, usuarios, credenciales, roles/aplicativos/módulos/
   * servicios — este último grupo pendiente de decisión, ver plan) se dejan
   * sin `servicio` para no imponer una restricción que el backend no aplica.
   */
  servicio?: string;
  /**
   * Servicio que habilita "Agregar" y "Editar" en la tabla genérica — si no
   * se define, cae a `servicio` (el mismo que gatea ver la pestaña).
   * Hace falta un campo aparte cuando ver y escribir NO son el mismo nivel
   * — ej. Empresas: `servicio` es '.ver' (para que instructor la vea), pero
   * crear/editar exige '.administrar' (solo admin). Sin esto, cualquiera
   * que viera la pestaña veía también los botones de crear/editar, sin
   * importar si de verdad tenía ese nivel.
   */
  servicioEscritura?: string;
  /** Igual que `servicioEscritura` pero para "Eliminar" — cae a `servicioEscritura` (y de ahí a `servicio`) si no se define. */
  servicioEliminar?: string;
  /** Opciones estáticas para dropdowns sin módulo externo */
  opcionesEstaticas?: Record<string, { label: string; value: string }[]>;
  /**
   * Par de campos lat/lng que se muestran como un único selector de
   * ubicación en mapa (Leaflet) en vez de dos inputs numéricos sueltos.
   * Ambos nombres deben estar también en `campos`.
   */
  parCoordenadas?: { lat: string; lng: string };
  /** Etiqueta legible opcional por columna/campo — cabecera de tabla y label del modal. */
  columnLabels?: Record<string, string>;
  /**
   * Valor inicial explícito para un campo al abrir "Nuevo" — sobrescribe el
   * default genérico de abrirModal() (booleans → false, resto → ''). Usar
   * cuando `false` no es un valor neutro para ese campo (ver 'activo' en
   * `permisos`: ahí false significa denegación explícita, no "aún no").
   */
  defaultsCampo?: Record<string, any>;
}
export const CONFIG: Record<Modulo, ModuloConfig> = {

  // ── Catálogos (algunos visibles como pestaña) ──────────────────────────

  departamentos: {
    label: 'Departamentos', idKey: 'idDepartamento',
    listar: `${BASE}/departamentos`,
    crear: null, actualizar: null, eliminar: null,
    grupo: 'epsas', categoria: 'Organización',
    columnas: ['nombre'],
  },

  sedes: {
    label: 'Sedes', idKey: 'idSede',
    listar: `${BASE}/sedes`, crear: `${BASE}/sedes`,
    actualizar: id => `${BASE}/sedes/${id}`,
    eliminar:   id => `${BASE}/sedes/${id}`,
    grupo: 'epsas', categoria: 'Organización',
    // Lectura abierta (catálogo básico compartido); crear/editar/eliminar
    // sí exige el servicio — antes sede.controller.ts no tenía ningún guard.
    servicioEscritura: 'organizacion.gestionar',
    servicioEliminar: 'organizacion.gestionar',
    campos: ['nombre', 'centroFormacionId'],
    selectores: {
      centroFormacionId: { modulo: 'centros', label: 'nombre', value: 'idCentro' },
    },
  },

  centros: {
    label: 'Centros de Formación', idKey: 'idCentro',
    listar: `${BASE}/centro-formacion`,
    crear: null, actualizar: null, eliminar: null,
    grupo: 'epsas', categoria: 'Organización',
    columnas: ['nombre', 'direccion'],
  },

  roles: {
    label: 'Roles', idKey: 'idRol',
    listar: `${BASE}/roles`,
    crear: null, actualizar: null, eliminar: null,
    grupo: 'epsas', categoria: 'Seguridad y Acceso',
    // Puerta de entrada al panel de permisos rol-wide (<app-permisos-panel
    // modo="rol">, se embebe al seleccionar una fila) — sin esto nadie sin
    // cargo admin podía llegar a gestionar permisos aunque tuviera
    // permisos.gestionar otorgado. Ver plan "Ronda 3" (continuación).
    servicio: 'permisos.gestionar',
    columnas: ['nombre', 'aplicativo'],
  },

  municipios: {
    label: 'Municipios', idKey: 'idMunicipio',
    listar: `${BASE}/municipios`, crear: `${BASE}/municipios`,
    actualizar: id => `${BASE}/municipios/${id}`,
    eliminar:   id => `${BASE}/municipios/${id}`,
    grupo: 'epsas', categoria: 'Organización',
    servicioEscritura: 'organizacion.gestionar',
    servicioEliminar: 'organizacion.gestionar',
    columnas: ['nombre', 'departamento'],
    campos: ['nombre', 'departamentoId'],
    selectores: {
      departamentoId: { modulo: 'departamentos', label: 'nombre', value: 'idDepartamento' },
    },
  },

  aplicativos: {
    label: 'Aplicativos', idKey: 'idAplicativo',
    listar: `${BASE}/aplicativos`, crear: `${BASE}/aplicativos`,
    actualizar: id => `${BASE}/aplicativos/${id}`,
    eliminar:   id => `${BASE}/aplicativos/${id}`,
    grupo: 'epsas', categoria: 'Seguridad y Acceso',
    columnas: ['nombre'],
    campos: ['nombre'],
  },

  modulos: {
    label: 'Módulos', idKey: 'idModulo',
    listar: `${BASE}/modulos`, crear: `${BASE}/modulos`,
    actualizar: id => `${BASE}/modulos/${id}`,
    eliminar:   id => `${BASE}/modulos/${id}`,
    grupo: 'epsas', categoria: 'Seguridad y Acceso',
    // aplicativo viene como objeto anidado (eager); aplanarFila extrae 'nombre'
    columnas: ['nombre', 'aplicativo'],
    campos: ['nombre', 'aplicativoId'],
    selectores: {
      aplicativoId: { modulo: 'aplicativos', label: 'nombre', value: 'idAplicativo' },
    },
  },

  servicios: {
    label: 'Servicios', idKey: 'idServicio',
    listar: `${BASE}/servicios`, crear: `${BASE}/servicios`,
    actualizar: id => `${BASE}/servicios/${id}`,
    eliminar:   id => `${BASE}/servicios/${id}`,
    grupo: 'epsas', categoria: 'Seguridad y Acceso',
    columnas: ['nombre', 'url', 'modulo'],
    campos: ['nombre', 'url', 'moduloId'],
    selectores: {
      moduloId: { modulo: 'modulos', label: 'nombre', value: 'idModulo' },
    },
  },

  permisos: {
    label: 'Permisos', idKey: 'idPermiso',
    listar: `${BASE}/permisos`, crear: `${BASE}/permisos`,
    actualizar: id => `${BASE}/permisos/${id}`,
    eliminar:   id => `${BASE}/permisos/${id}`,
    grupo: 'epsas', categoria: 'Seguridad y Acceso',
    // rol/servicio/usuario vienen como objetos anidados (eager); aplanarFila extrae 'nombre'/'persona'
    columnas: ['rol', 'servicio', 'usuario', 'activo'],
    // usuarioId es opcional: sin él, el permiso aplica a TODO el rol.
    // Con él, es una excepción puntual para ese usuario.
    campos: ['rolId', 'servicioId', 'usuarioId', 'activo'],
    selectores: {
      rolId:      { modulo: 'roles',     label: 'nombre',  value: 'idRol'      },
      servicioId: { modulo: 'servicios', label: 'nombre',  value: 'idServicio' },
      usuarioId:  { modulo: 'usuarios',  label: 'persona', value: 'idUsuario'  },
    },
    tiposCampo: {
      activo: 'boolean',
    },
    // activo solo tiene efecto en filas CON usuario (excepción personal): en
    // false, deniega ese servicio puntual aunque el rol lo otorgue. En un
    // permiso rol-wide (sin usuario) el guard ni siquiera lo lee. Default
    // true al crear — con el default genérico (false) cualquier excepción
    // nueva nacería denegando en vez de otorgando, justo al revés de lo que
    // se usa para (dar acceso extra a un responsable de bodega, etc.).
    defaultsCampo: {
      activo: true,
    },
    columnLabels: {
      // Claves de la TABLA (ya aplanadas: rol/servicio/usuario/activo) y del
      // MODAL (campos crudos: rolId/servicioId/usuarioId/activo) — son
      // conjuntos de claves distintos, hay que cubrir ambos para que el label
      // se vea bien en los dos lugares.
      rol: 'Rol',
      servicio: 'Servicio',
      usuario: 'Usuario (excepción)',
      activo: 'Activo',
      rolId: 'Rol',
      servicioId: 'Servicio',
      // Aclara en el propio formulario la diferencia entre otorgar a todo el
      // rol vs. a una persona puntual — es la pregunta más común al usar esta
      // pantalla.
      usuarioId: 'Usuario (opcional — vacío = aplica a todo el rol; con persona = excepción solo para ella)',
    },
  },

  ambientes: {
    label: 'Ambientes', idKey: 'idAmbiente',
    listar: `${BASE}/ambientes`, crear: `${BASE}/ambientes`,
    actualizar: id => `${BASE}/ambientes/${id}`,
    eliminar:   id => `${BASE}/ambientes/${id}`,
    grupo: 'epsas', categoria: 'Organización',
    servicio: 'ambientes.gestionar',
    // sede/municipio/area vienen como objetos anidados (eager); aplanarFila extrae 'nombre'
    columnas: ['nombre', 'tipo', 'sede', 'municipio', 'area'],
    campos: ['nombre', 'tipo', 'sedeId', 'municipioId', 'areaId'],
    selectores: {
      sedeId:      { modulo: 'sedes',      label: 'nombre', value: 'idSede'      },
      municipioId: { modulo: 'municipios', label: 'nombre', value: 'idMunicipio' },
      areaId:      { modulo: 'areas',      label: 'nombre', value: 'idArea'      },
    },
    opcionesEstaticas: {
      tipo: [
        { label: 'Ambiente',          value: 'ambiente'          },
        { label: 'Auditorio',         value: 'auditorio'         },
        { label: 'Biblioteca',        value: 'biblioteca'        },
        { label: 'Restaurante',       value: 'restaurante'       },
        { label: 'Centro Deportivo',  value: 'centro_deportivo'  },
      ],
    },
  },

  // ── Módulos api (backend-epsas) ───────────────────────────────────────

  personas: {
    label: 'Personas', idKey: 'idPersona',
    listar: `${BASE}/personas`, crear: `${BASE}/personas`,
    actualizar: id => `${BASE}/personas/${id}`,
    eliminar:   id => `${BASE}/personas/${id}`,
    grupo: 'epsas', categoria: 'Personas y Cuentas',
    servicio: 'personas.ver',
    campos: ['nombre', 'cedula', 'telefono', 'municipioId', 'direccion', 'correo', 'genero', 'cargo', 'estado'],
    selectores: {
      municipioId: { modulo: 'municipios', label: 'nombre', value: 'idMunicipio' },
    },
    tiposCampo: {
      cedula:   'number',
      telefono: 'number',
      correo:   'email',
    },
    opcionesEstaticas: {
      genero: [
        { label: 'Masculino', value: 'masculino' },
        { label: 'Femenino',  value: 'femenino'  },
        { label: 'Otro',      value: 'otro'       },
      ],
      cargo: [
        { label: 'Aprendiz',          value: 'aprendiz'          },
        { label: 'Instructor',        value: 'instructor'        },
        { label: 'Administrador',     value: 'administrador'     },
        { label: 'Administrador ERP', value: 'administrador_erp' },
      ],
      estado: [
        { label: 'Activo',   value: 'activo'   },
        { label: 'Inactivo', value: 'inactivo' },
      ],
    },
  },

  matriculas: {
    label: 'Matrículas', idKey: 'idMatricula',
    listar: `${BASE}/matriculas`, crear: `${BASE}/matriculas`,
    actualizar: id => `${BASE}/matriculas/${id}`,
    eliminar:   id => `${BASE}/matriculas/${id}`,
    grupo: 'epsas', categoria: 'Académico',
    servicio: 'matriculas.ver',
    usePatch: true,
    columnas: ['estudiante', 'curso', 'estado', 'resultadosAprobados'],
    campos: ['persona', 'curso', 'estado', 'resultadosAprobados'],
    selectores: {
      persona: { modulo: 'personas', label: 'nombre', value: 'idPersona' },
      curso:   { modulo: 'cursos',   label: 'codigo', value: 'idCurso'  },
    },
    opcionesEstaticas: {
      estado: [
        { label: 'Activo',            value: 'activo'            },
        { label: 'Inactivo',          value: 'inactivo'          },
        { label: 'Certificado',       value: 'certificado'       },
        { label: 'Cancelado',         value: 'cancelado'         },
        { label: 'Retiro Voluntario', value: 'retiro voluntario' },
        { label: 'Trasladado',        value: 'trasladado'        },
        { label: 'Aplazado',          value: 'aplazado'          },
      ],
    },
    tiposCampo: {
      resultadosAprobados: 'boolean',
    },
  },

  cursos: {
    label: 'Cursos', idKey: 'idCurso',
    listar: `${BASE}/cursos`, crear: `${BASE}/cursos`,
    actualizar: id => `${BASE}/cursos/${id}`,
    eliminar:   id => `${BASE}/cursos/${id}`,
    grupo: 'epsas', categoria: 'Académico',
    // Lectura abierta (catálogo básico compartido); crear/editar/eliminar sí
    // exige el servicio — antes cursos.controller.ts no tenía ningún guard.
    servicioEscritura: 'academico.gestionar',
    servicioEliminar: 'academico.gestionar',
    // area, programa y lider vienen como objetos anidados (eager); aplanarFila extrae 'nombre'
    columnas: ['codigo', 'area', 'programa', 'lider', 'fechaInicio', 'fechaFin'],
    campos: ['codigo', 'fechaInicio', 'fechaFin', 'finLectiva', 'areaId', 'programaId', 'liderId'],
    selectores: {
      areaId:     { modulo: 'areas',     label: 'nombre', value: 'idArea'     },
      programaId: { modulo: 'programas', label: 'nombre', value: 'idPrograma' },
      liderId:    { modulo: 'personas',  label: 'nombre', value: 'idPersona'  },
    },
    tiposCampo: {
      fechaInicio: 'date',
      fechaFin:    'date',
      finLectiva:  'date',
    },
  },

  programas: {
    label: 'Programas', idKey: 'idPrograma',
    listar: `${BASE}/programas`, crear: `${BASE}/programas`,
    actualizar: id => `${BASE}/programas/${id}`,
    eliminar:   id => `${BASE}/programas/${id}`,
    grupo: 'epsas', categoria: 'Académico',
    servicioEscritura: 'academico.gestionar',
    servicioEliminar: 'academico.gestionar',
    usePatch: true,
    columnas: ['nombre', 'tipo'],
    campos: ['nombre', 'tipo'],
    opcionesEstaticas: {
      tipo: [
        { label: 'Tecnólogo', value: 'tecnologo' },
        { label: 'Técnico',   value: 'tecnico'   },
        { label: 'Auxiliar',  value: 'auxiliar'  },
      ],
    },
  },

  areas: {
    label: 'Áreas', idKey: 'idArea',
    listar: `${BASE}/areas`, crear: `${BASE}/areas`,
    actualizar: id => `${BASE}/areas/${id}`,
    eliminar:   id => `${BASE}/areas/${id}`,
    grupo: 'epsas', categoria: 'Organización',
    servicioEscritura: 'organizacion.gestionar',
    servicioEliminar: 'organizacion.gestionar',
    // sede viene como objeto anidado (eager); aplanarFila extrae 'nombre'
    columnas: ['nombre', 'sede'],
    campos: ['nombre', 'sedeId'],
    selectores: {
      sedeId: { modulo: 'sedes', label: 'nombre', value: 'idSede' },
    },
  },

  // Usuario (persona + aplicativo) y Credencial (login + password + rol)
  // fusionados en una sola pestaña/formulario — antes había que crear
  // primero el Usuario, copiar su ID a mano y recién ahí crear la
  // Credencial en una pestaña aparte. El backend (usuarios-credenciales,
  // ver UsuarioCredencialService) crea/edita/borra ambos en una sola
  // transacción. 'credenciales' como pestaña propia queda oculta (OCULTOS),
  // el endpoint /credenciales viejo se mantiene por si algo más lo usa.
  usuarios: {
    label: 'Usuarios', idKey: 'idUsuario',
    listar: `${BASE}/usuarios-credenciales`, crear: `${BASE}/usuarios-credenciales`,
    actualizar: id => `${BASE}/usuarios-credenciales/${id}`,
    eliminar:   id => `${BASE}/usuarios-credenciales/${id}`,
    grupo: 'epsas', categoria: 'Personas y Cuentas',
    // Gatea también la lectura, no solo escritura — ver un login/rol ya es
    // sensible. Reservado a administrador_erp/administrador.
    servicio: 'usuarios.gestionar',
    usePatch: true,
    columnas: ['persona', 'aplicativo', 'login', 'rol'],
    campos: ['personaId', 'aplicativoId', 'login', 'password', 'rolId'],
    selectores: {
      personaId:    { modulo: 'personas',    label: 'nombre', value: 'idPersona'    },
      aplicativoId: { modulo: 'aplicativos', label: 'nombre', value: 'idAplicativo' },
      rolId:        { modulo: 'roles',       label: 'nombre', value: 'idRol'        },
    },
    tiposCampo: {
      password: 'password',
    },
    columnLabels: {
      persona: 'Persona', aplicativo: 'Aplicativo', login: 'Login', rol: 'Rol',
      personaId: 'Persona', aplicativoId: 'Aplicativo', rolId: 'Rol',
      password: 'Contraseña (vacío = no cambiar)',
    },
  },

  // Config heredada, ya no se usa como pestaña (ver 'usuarios' arriba) —
  // se deja definida porque 'credenciales' sigue siendo parte del tipo
  // Modulo y CONFIG debe cubrir todas sus claves.
  credenciales: {
    label: 'Credenciales', idKey: 'idCredencial',
    listar: `${BASE}/credenciales`, crear: `${BASE}/credenciales`,
    actualizar: id => `${BASE}/credenciales/${id}`,
    eliminar:   id => `${BASE}/credenciales/${id}`,
    grupo: 'epsas', categoria: 'Personas y Cuentas',
    servicio: 'usuarios.gestionar',
    usePatch: true,
    columnas: ['login', 'rol', 'usuario'],
    campos: ['login', 'password', 'rolId', 'usuarioId'],
    selectores: {
      rolId:     { modulo: 'roles',    label: 'nombre',  value: 'idRol'     },
      usuarioId: { modulo: 'usuarios', label: 'persona', value: 'idUsuario' },
    },
    tiposCampo: {
      password: 'password',
    },
  },

  // ── Módulos api2 (backend-practica-hexagonal) ────────────────────────

 empresas: {
    label: 'Empresas', idKey: 'id',
    listar: `${BASE2}/empresas`, crear: `${BASE2}/empresas`,
    actualizar: id => `${BASE2}/empresas/${id}`,
    eliminar:   id => `${BASE2}/empresas/${id}`,
    grupo: 'practica', categoria: 'Empresas y Modalidades',
    servicio: 'practica.empresas.ver',
    // '.ver' basta para VER la pestaña (instructor la trae por defecto),
    // pero crear/editar/eliminar en empresa.controller.ts exige
    // '.administrar' completo — sin esto, cualquiera que viera Empresas
    // veía también "Agregar"/editar/eliminar aunque no tuviera ese nivel.
    servicioEscritura: 'practica.empresas.administrar',
    servicioEliminar: 'practica.empresas.administrar',
    usePatch: true,
    columnas: ['nit', 'nombre', 'municipio', 'telefono', 'correo', 'estado'],
    campos: ['nit', 'nombre', 'direccion', 'telefono', 'correo', 'municipio', 'estado', 'tipo', 'longitud', 'latitud'],
    selectores: {
      municipio: { modulo: 'municipios', label: 'nombre', value: 'nombre' },
    },
    tiposCampo: {
      correo:   'email',
      telefono: 'tel',
    },
    parCoordenadas: { lat: 'latitud', lng: 'longitud' },
    opcionesEstaticas: {
      estado: [
        { label: 'Activo',   value: 'activo'   },
        { label: 'Inactivo', value: 'inactivo' },
      ],
      tipo: [
        { label: 'Unipersonal', value: 'unipersonal' },
        { label: 'Empresa',     value: 'empresa'     },
      ],
    },
  },
  
  modalidades: {
    label: 'Modalidades', idKey: 'id',
    listar: `${BASE2}/modalidad`, crear: `${BASE2}/modalidad`,
    actualizar: id => `${BASE2}/modalidad/${id}`,
    eliminar:   id => `${BASE2}/modalidad/${id}`,
    grupo: 'practica', categoria: 'Empresas y Modalidades',
    servicio: 'practica.etapas.ver',
    // '.ver' basta para VER la pestaña; modalidad.controller.ts exige
    // '.administrar' de Etapas (Modalidades no tiene servicio propio, usa
    // el de Etapas) para crear/editar/eliminar.
    servicioEscritura: 'practica.etapas.administrar',
    servicioEliminar: 'practica.etapas.administrar',
    usePatch: true,
    campos: ['nombre'],
    opcionesEstaticas: {
      nombre: [
        { label: 'Proyecto Productivo',      value: 'proyecto productivo'      },
        { label: 'Pasantía',                 value: 'pasantia'                 },
        { label: 'Monitoría',                value: 'monitoria'                },
        { label: 'Contrato de Aprendizaje',  value: 'contrato de aprendizaje'  },
      ],
    },
  },

 etapas: {
    label: 'Etapas Prácticas', idKey: 'id',
    listar: `${BASE2}/etapa-practica`, crear: `${BASE2}/etapa-practica`,
    actualizar: id => `${BASE2}/etapa-practica/${id}`,
    // No se puede eliminar: tiene seguimientos/bitácoras/asignaciones asociados.
    // Usa el botón "Cambiar estado → Inactivo" en el módulo de Seguimiento.
    eliminar: null,
    grupo: 'practica', categoria: 'Seguimiento de Práctica',
    // '.administrar', no '.ver': el filtro de scope del backend
    // (RlsFilter.applyEtapaPractica) solo muestra TODAS las etapas cuando el
    // instructor tiene este nivel — '.ver' es la lectura básica que
    // cualquier instructor ya tiene por defecto (misma que usa su propio
    // Seguimiento), así que dejarlo en '.ver' mostraría esta pestaña con
    // datos SOLO suyos, no la tabla admin completa que promete. Ver plan
    // "Ronda 3" (continuación, Fase 14).
    servicio: 'practica.etapas.administrar',
    usePatch: true,
    columnas: ['empresa', 'modalidad', 'estado', 'fecha_inicio', 'fecha_fin', 'avance'],
    campos: ['empresaId', 'modalidadId', 'matriculaId', 'fecha_inicio', 'fecha_fin', 'estado', 'observacion'],
    selectores: {
      empresaId:   { modulo: 'empresas',    label: 'nombre',     value: 'id' },
      modalidadId: { modulo: 'modalidades', label: 'nombre',     value: 'id' },
      matriculaId: { modulo: 'matriculas',  label: 'estudiante', value: 'idMatricula', filtro: { cargo: 'aprendiz' } },
    },
    opcionesEstaticas: {
      estado: [
        { label: 'Activo',            value: 'activo'            },
        { label: 'Inactivo',          value: 'inactivo'          },
        { label: 'Suspendido',        value: 'suspendido'        },
        { label: 'Condicionado',      value: 'condicionado'      },
        { label: 'Certificado',       value: 'certificado'       },
        { label: 'Por Certificar',    value: 'por certificar'    },
        { label: 'Cancelado',         value: 'cancelado'         },
        { label: 'Retiro Voluntario', value: 'retiro voluntario' },
      ],
    },
    tiposCampo: {
      fecha_inicio: 'date',
      fecha_fin:    'date',
    },
  },

  asignaciones: {
    label: 'Asignaciones', idKey: 'id',
    listar: `${BASE2}/asignaciones`, crear: `${BASE2}/asignaciones`,
    actualizar: id => `${BASE2}/asignaciones/${id}`,
    eliminar:   id => `${BASE2}/asignaciones/${id}`,
    grupo: 'practica', categoria: 'Seguimiento de Práctica',
    // '.administrar', no '.ver' — mismo motivo que en 'etapas' arriba.
    servicio: 'practica.asignaciones.administrar',
    usePatch: true,
    columnas: ['instructor', 'fecha_inicio', 'fecha_fin', 'estado', 'horas'],
    campos: ['etapaId', 'instructor', 'fecha_inicio', 'fecha_fin', 'estado', 'horas'],
    selectores: {
      etapaId:    { modulo: 'etapas',   label: 'aprendiz', value: 'id' },
      instructor: { modulo: 'personas', label: 'nombre',   value: 'idPersona', filtro: { cargo: 'instructor' } },
    },
    opcionesEstaticas: {
      estado: [
        { label: 'Activo',   value: 'activo'   },
        { label: 'Inactivo', value: 'inactivo' },
      ],
    },
    tiposCampo: {
      fecha_inicio: 'date',
      fecha_fin:    'date',
      horas:        'number',
    },
  },

  seguimientos: {
      label: 'Seguimientos', idKey: 'id',
      listar: `${BASE2}/seguimientos`, crear: `${BASE2}/seguimientos`,
      actualizar: id => `${BASE2}/seguimientos/${id}`,
      eliminar:   id => `${BASE2}/seguimientos/${id}`,
      grupo: 'practica', categoria: 'Seguimiento de Práctica',
      // '.administrar', no '.ver' — mismo motivo que en 'etapas' arriba.
      servicio: 'practica.seguimientos.administrar',
      usePatch: true,
      columnas: ['aprendiz', 'estado', 'observacion', 'fecha_inicio', 'fecha_fin'],
      campos: ['etapaId', 'asignacionId', 'observacion', 'fecha_inicio', 'fecha_fin', 'estado'],
      selectores: {
        etapaId:      { modulo: 'etapas',       label: 'aprendiz',   value: 'id' },
        asignacionId: { modulo: 'asignaciones', label: 'instructor', value: 'id' },
      },
      opcionesEstaticas: {
        estado: [
          { label: 'Activo',            value: 'activo'            },
          { label: 'Inactivo',          value: 'inactivo'          },
          { label: 'Pendiente',         value: 'pendiente'         },
          { label: 'Condicionado',      value: 'condicionado'      },
          { label: 'Cancelado',         value: 'cancelado'         },
          { label: 'Retiro Voluntario', value: 'retiro voluntario' },
          { label: 'Certificado',       value: 'certificado'       },
        ],
      },
      tiposCampo: {
        fecha_inicio: 'date',
        fecha_fin:    'date',
    },
  },

  bitacoras: {
    label: 'Bitácoras', idKey: 'id',
    listar: `${BASE2}/bitacoras`, crear: `${BASE2}/bitacoras`,
    actualizar: id => `${BASE2}/bitacoras/${id}`,
    eliminar:   id => `${BASE2}/bitacoras/${id}`,
    grupo: 'practica', categoria: 'Seguimiento de Práctica',
    // '.administrar', no '.ver' — mismo motivo que en 'etapas' arriba.
    servicio: 'practica.bitacoras.administrar',
    usePatch: true,
    columnas: ['fecha', 'estado', 'bitacora_pdf'],
    campos: ['seguimientoId', 'fecha', 'bitacora_pdf', 'estado'],
    selectores: {
      seguimientoId: { modulo: 'seguimientos', label: 'estado', value: 'id' },
    },
    tiposCampo: {
      fecha: 'date',
    },
    opcionesEstaticas: {
      estado: [
        { label: 'Pendiente',  value: 'pendiente'  },
        { label: 'Aceptada',   value: 'aceptada'   },
        { label: 'Rechazada',  value: 'rechazada'  },
      ],
    },
  },

  observaciones: {
    label: 'Observaciones', idKey: 'id',
    listar: `${BASE2}/observaciones`, crear: `${BASE2}/observaciones`,
    actualizar: id => `${BASE2}/observaciones/${id}`,
    eliminar:   id => `${BASE2}/observaciones/${id}`,
    grupo: 'practica', categoria: 'Seguimiento de Práctica',
    // '.administrar', no '.ver' — mismo motivo que en 'etapas' arriba.
    servicio: 'practica.observaciones.administrar',
    usePatch: true,
    columnas: ['fecha', 'descripcion', 'persona', 'evidencia_foto'],
    campos: ['seguimientoId', 'fecha', 'descripcion', 'persona', 'evidencia_foto'],
    selectores: {
      seguimientoId: { modulo: 'seguimientos', label: 'estado', value: 'id' },
      persona:       { modulo: 'personas',     label: 'nombre', value: 'idPersona' },
    },
    tiposCampo: {
      fecha: 'date',
    },
  },

  formatos: {
    label: 'Formatos', idKey: 'id',
    listar: `${BASE2}/formatos`, crear: null,
    actualizar: id => `${BASE2}/formatos/${id}`,
    eliminar:   id => `${BASE2}/formatos/${id}`,
    grupo: 'practica', categoria: 'Seguimiento de Práctica',
    servicio: 'practica.formatos.ver',
    // '.ver' basta para VER la pestaña; editar/eliminar exige '.gestionar'
    // (único nivel de escritura de Formatos desde la fusión con
    // '.administrar' — ver migrate-formatos-permisos.ts).
    servicioEscritura: 'practica.formatos.gestionar',
    servicioEliminar: 'practica.formatos.gestionar',
    usePatch: true,
    columnas: ['tipo', 'nombre_original', 'mime_type', 'estado'],
    campos: ['tipo', 'nombre'],
  },

};


/**
 * Módulos que NO aparecen como pestañas.
 * 'permisos': su función queda cubierta por el panel embebido en Roles y
 * Usuarios (<app-permisos-panel>, ver plan "Adaptar la interfaz de permisos
 * de SGM al ERP") — el endpoint /permisos se sigue usando, solo deja de
 * tener una pantalla CRUD dedicada con IDs crudos.
 * 'credenciales': fusionada dentro de 'usuarios' — ver el módulo backend
 * usuarios-credenciales y el comentario en CONFIG.usuarios.
 * 'aplicativos'/'modulos'/'servicios': editor crudo del catálogo de
 * permisos — crear una fila ahí no conecta con ningún @RequiereServicio
 * real (eso solo se logra escribiendo código), y editar/eliminar una fila
 * EXISTENTE sí puede romper algo real (ej. borrar el servicio que gatea
 * Formatos lo tumba para todo el mundo, sin ningún mensaje que lo explique).
 * Alto riesgo, cero beneficio de uso diario — decisión explícita de dejarlas
 * ocultas. Los cambios reales al catálogo se hacen por código + script de
 * migración (ver scripts/migrate-*.ts), no por esta UI. Sus CONFIG siguen
 * definidos porque otros selectores (ej. usuarios.aplicativoId) siguen
 * usando `admin.cargar(...)` sobre ellos para poblar dropdowns.
 */
const OCULTOS: Modulo[] = ['permisos', 'credenciales', 'aplicativos', 'modulos', 'servicios'];

/** Solo los módulos que aparecen como pestañas en el panel */
export const MODULOS = (Object.keys(CONFIG) as Modulo[]).filter(
  m => !OCULTOS.includes(m)
);

/** Módulos del grupo epsas (backend-epsas / api) */
export const MODULOS_EPSAS = MODULOS.filter(m => CONFIG[m].grupo === 'epsas');

/** Módulos del grupo practica (backend-practica-hexagonal / api2) */
export const MODULOS_PRACTICA = MODULOS.filter(m => CONFIG[m].grupo === 'practica');

/**
 * Servicios que sí justifican dejar ENTRAR a /admin (ver app.routes.ts,
 * ruta 'admin') — a diferencia del filtro de pestañas de
 * `AdminPanelComponent.modulosVista()` (que decide QUÉ ve alguien ya
 * adentro), esta lista decide quién pasa la puerta.
 *
 * NO es "el servicio de cada pestaña de MODULOS_ADMIN" ni todos los
 * `.administrar`/`.gestionar` — a propósito, deja afuera cualquier servicio
 * que instructor o aprendiz ya reciban por defecto (ver SERVICIOS_POR_ROL /
 * PRACTICA_INSTRUCTOR / PRACTICA_APRENDIZ en tenant-admin.service.ts del
 * ERP), aunque ese servicio sí gatee una pestaña real:
 *   - Formatos ('practica.formatos.gestionar') queda FUERA aposta: es
 *     exactamente el nivel que un instructor normal ya tiene de fábrica —
 *     incluirlo dejaría entrar a /admin a cualquier instructor, el mismo bug
 *     que ya se corrigió una vez (ver comentario histórico en app.routes.ts).
 *   - Los '.ver' de cualquier recurso quedan fuera por el mismo motivo.
 * Solo entran acá servicios que NINGÚN rol recibe por defecto — el nivel
 * '.administrar' de Etapa Práctica (admin-only, instructor nunca lo tiene) y
 * los servicios "planos" que tampoco forman parte del set base de nadie.
 */
export const SERVICIOS_ADMIN_PANEL: string[] = [
  'permisos.gestionar',
  'ambientes.gestionar',
  'practica.empresas.administrar',
  'practica.etapas.administrar',
  'practica.asignaciones.administrar',
  'practica.seguimientos.administrar',
  'practica.bitacoras.administrar',
  'practica.observaciones.administrar',
  // Estos 3 los otorga el backend a CUALQUIER administrador sin importar su
  // aplicativo (ver SERVICIOS_ADMIN_SIN_RESTRICCION_APLICATIVO en
  // permisos.service.ts) — sin listarlos acá, un administrador de un
  // aplicativo de producto (Horarios, Materiales) que solo tiene estos 3
  // nunca veía el link "Admin" ni podía entrar a /admin. NO se agrega
  // personas.ver/gestionar ni matriculas.ver/gestionar aquí a propósito:
  // esos son baseline para instructor/aprendiz también (sinRestriccionAplicativo
  // los incluye siempre), así que listarlos reabriría /admin para cualquiera.
  'academico.gestionar',
  'organizacion.gestionar',
  'usuarios.gestionar',
];

/**
 * Vista del administrador de prácticas:
 * gestión académica básica (personas, matrículas, cursos, programas, usuarios, credenciales)
 * + todos los módulos de prácticas.
 */
export const MODULOS_ADMIN: Modulo[] = [
  // 'credenciales' fusionada dentro de 'usuarios' — ver CONFIG.usuarios.
  'personas', 'matriculas', 'cursos', 'programas', 'usuarios', 'ambientes',
  // 'roles' con servicio propio ('permisos.gestionar', ver arriba) — a
  // diferencia de aplicativos/modulos/servicios (decisión tomada: quedan
  // admin_erp-exclusivos, es el catálogo que define TODO el sistema de
  // permisos — ver Ronda 3, ítem 3 del backlog), es la puerta al panel de
  // permisos rol-wide y sí tiene sentido abrirla por servicio.
  'roles',
  // Catálogos de organización del tenant — sin guard backend dedicado (igual
  // que 'cursos'/'usuarios' arriba), así que quedan visibles a quien entre a
  // /admin, sin `servicio` propio. Antes eran admin_erp-exclusivos solo por
  // no estar en esta lista, sin ninguna razón de seguridad detrás — decisión
  // explícita del usuario (Ronda 3) de tratarlos igual que el resto.
  'departamentos', 'sedes', 'centros', 'municipios', 'areas',
  ...MODULOS_PRACTICA,
];

/** Orden fijo de categorías en el sidebar del panel admin (las no listadas van al final). */
export const CATEGORIA_ORDEN = [
  'Organización', 'Académico', 'Personas y Cuentas', 'Seguridad y Acceso',
  'Empresas y Modalidades', 'Seguimiento de Práctica',
];

/** Ícono (lucide) por categoría, usado en el encabezado del sidebar. */
export const CATEGORIA_ICONOS: Record<string, string> = {
  'Organización':            'map-pin',
  'Académico':               'book-open',
  'Personas y Cuentas':      'users',
  'Seguridad y Acceso':      'shield-check',
  'Empresas y Modalidades':  'building-2',
  'Seguimiento de Práctica': 'clipboard-check',
};

/** Descripción corta de cada categoría — ayuda a orientarse a un usuario no técnico. */
export const CATEGORIA_DESCRIPCIONES: Record<string, string> = {
  'Organización':            'Sedes, centros, municipios y ambientes físicos',
  'Académico':               'Cursos, programas, áreas y matrículas',
  'Personas y Cuentas':      'Personas, usuarios y credenciales de acceso',
  'Seguridad y Acceso':      'Roles, permisos y servicios del sistema',
  'Empresas y Modalidades':  'Empresas y modalidades de práctica',
  'Seguimiento de Práctica': 'Etapas, asignaciones, bitácoras y observaciones',
};
