export interface AdminLoginRequest {
  correo: string;
  password: string;
}

/** El token ya no viene en el cuerpo: lo pone el backend en la cookie httpOnly `root_token` (H10). */
export interface AdminLoginResponse {
  id: string;
  correo: string;
  /** Epoch en ms en que vence la sesión (igual que el JWT root, 8 h). */
  expiraEn: number;
}

export interface AdminAuthUser {
  id: string;
  correo: string;
}
