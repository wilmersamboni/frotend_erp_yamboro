export interface RootUser {
  id: string;
  nombre: string;
  correo: string;
  creadoEn: string;
}

export interface CreateRootUserDto {
  nombre: string;
  correo: string;
  password: string;
}

export interface UpdateRootUserDto {
  nombre?: string;
  correo?: string;
  password?: string;
}
