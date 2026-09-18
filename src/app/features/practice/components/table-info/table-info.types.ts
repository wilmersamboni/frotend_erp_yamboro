// ─────────────────────────────────────────────────────────────────────────────
// table-info.types.ts  — Interfaces, constantes y helpers compartidos
// ─────────────────────────────────────────────────────────────────────────────

export interface Column {
  name: string;
  uid:  ColumnUid;
  sortable: boolean;
}

export interface StatusOption {
  name: string;
  uid:  string;
}

export type ColumnUid =
  | keyof Aprendiz
  | 'actions'; // 👈 única que NO existe en Aprendiz

export interface Aprendiz {
  id:               any;
  name:             string;
  lastName:         string;
  age:              string;   // cédula
  email:            string;
  programa:         string;
  area:             string;
  number:           string;   // código ficha
  estado:           string;
  startDate:        string;
  endDate:          string;
  avance:           number;   // avance de la etapa práctica (bitácoras)
  resultados_aprobados: boolean;   // resultados de aprendizaje del programa aprobados (excepto etapa práctica)
  id_matricula:     string | null;
  observacion:      string;
  id_practica:      any;
}

// ── Constantes ────────────────────────────────────────────────────────────────

export const COLUMNS: Column[] = [
  { name: 'Nombre',           uid: 'name',             sortable: true  },
  { name: 'Identificación',   uid: 'age',              sortable: true  },
  { name: 'Email',            uid: 'email',            sortable: false },
  { name: 'Área',             uid: 'area',             sortable: false },
  { name: 'Programa',         uid: 'programa',         sortable: true  },
  { name: 'Ficha',            uid: 'number',           sortable: false },
  { name: 'Fecha Inicio',     uid: 'startDate',        sortable: false },
  { name: 'Fecha Fin',        uid: 'endDate',          sortable: true  },
  { name: 'Observación',      uid: 'observacion',      sortable: false },
  { name: '% Práctica',  uid: 'avance',           sortable: true  },
  { name: 'Estado',           uid: 'estado',           sortable: false },
  { name: 'Acciones',         uid: 'actions',          sortable: false },
];

export const INITIAL_VISIBLE_COLS = new Set([
  'name', 'age', 'area', 'programa', 'number',
  'startDate', 'endDate', 'observacion',
  'avance', 'estado', 'actions',
]);

export const STATUS_OPTIONS: StatusOption[] = [
  { name: 'Activo',            uid: 'activo'            },
  { name: 'Inactivo',          uid: 'inactivo'          },
  { name: 'Suspendido',        uid: 'suspendido'        },
  { name: 'Condicionado',      uid: 'condicionado'      },
  { name: 'Certificado',       uid: 'certificado'       },
  { name: 'Por certificar',    uid: 'por certificar'    },
  { name: 'Cancelado',         uid: 'cancelado'         },
  { name: 'Retiro Voluntario', uid: 'retiro voluntario' },
];

// ── Helpers puros (sin dependencia de Angular) ────────────────────────────────

export function formatDate(d: string): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

export function initials(name: string): string {
  return (name ?? '').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

export function avatarColor(name: string): string {
  const palette = [
    'bg-blue-100 text-blue-600',    'bg-purple-100 text-purple-600',
    'bg-orange-100 text-orange-600','bg-pink-100 text-pink-600',
    'bg-teal-100 text-teal-600',    'bg-yellow-100 text-yellow-600',
  ];
  return palette[(name?.charCodeAt(0) ?? 0) % palette.length];
}

export function avanceValor(avance: any): number { return parseInt(avance) || 0; }

export function avanceColor(avance: any): string {
  const v = avanceValor(avance);
  return v >= 75 ? '#39A900' : v >= 40 ? '#f5a524' : v > 0 ? '#f31260' : '#e4e4e7';
}

export function statusDotColor(uid: string): string {
  const map: Record<string, string> = {
    activo:            '#39A900',
    inactivo:          '#f31260',
    suspendido:        '#f5a524',
    condicionado:      '#eab308',
    certificado:       '#3b82f6',
    'por certificar':  '#6366f1',
    cancelado:         '#dc2626',
    'retiro voluntario': '#94a3b8',
  };
  return map[uid] ?? '#ccc';
}

