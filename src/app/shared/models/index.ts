// ── Autenticación ─────────────────────────────────────────────────────────────
export interface Usuario {
  id?: string;
  personaId?: string;
  nombre?: string;
  cargo?: string;
  correo?: string;
  login?: string;
  aplicativoId?: string;
  aplicativoNombre?: string;
}

export interface LoginRequest {
  login: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  usuario: Usuario;
  accion: string;
  mensaje: string;
  centroId: string;
  tenantSlug: string;
}

// ── Áreas ─────────────────────────────────────────────────────────────────────
export interface Area {
  id_area: number;
  nombre: string;
  descripcion?: string;
  estado?: string;
}

// ── Cursos ────────────────────────────────────────────────────────────────────
export interface Curso {
  id_curso: number;
  codigo?: string;
  nombre?: string;
  estado?: string;
  fk_area?: number;
}

// ── Formatos ──────────────────────────────────────────────────────────────────
export interface Formato {
  id:              string;
  nombre:          string;
  tipo:            string;
  ruta_archivo:    string;
  nombre_original: string;
  mime_type:       string;
  tamanio:         number | null;
  estado:          string;
  created_at:      string;
  etapa?:          { id: string } | null;
}

// ── Persona ───────────────────────────────────────────────────────────────────
export interface Persona {
  id_persona?: string;
  nombre: string;
  correo: string;
  telefono: string;
  direccion: string;
  genero?: string;
  fk_municipio?: number;
  cargo?: string;
  estado?: string;
}

// ── Respuesta genérica de listado ─────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  mensaje?: string;
}
