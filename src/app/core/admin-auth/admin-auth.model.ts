export interface AdminLoginRequest {
  correo: string;
  password: string;
}

export interface AdminLoginResponse {
  token: string;
}

export interface AdminAuthUser {
  id: string;
  correo: string;
}
