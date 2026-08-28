import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { RootUserAdminService } from '../../../../core/services/admin/root-user-admin.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';
import { RootUser } from '../../../../shared/models/admin/root-user.model';
import { AdminConfirmDialogComponent } from '../../../../shared/components/admin/confirm-dialog.component';

@Component({
  selector: 'app-root-user-list',
  standalone: true,
  imports: [DatePipe, AdminConfirmDialogComponent],
  template: `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Usuarios Root</h1>
        <p class="text-sm text-gray-500 mt-1">Administra los usuarios con acceso al panel administrativo.</p>
      </div>
      <button type="button" (click)="nuevoUsuario()"
        class="flex items-center gap-2 text-sm font-semibold text-white px-4 py-2.5 rounded-xl transition-opacity hover:opacity-90 flex-shrink-0"
        style="background:#39A900;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" d="M12 5v14m-7-7h14" />
        </svg>
        Nuevo Usuario
      </button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      @if (cargando()) {
        <div class="flex flex-col items-center justify-center py-16">
          <svg class="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#39A900" stroke-width="3">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <p class="text-sm text-gray-400 mt-3">Cargando usuarios...</p>
        </div>
      } @else if (usuarios().length === 0) {
        <div class="flex flex-col items-center justify-center py-16 text-gray-400">
          <p class="text-sm">Aún no hay usuarios root registrados.</p>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-gray-100" style="background:#fafbfc;">
                <th class="px-5 py-3 font-semibold">Nombre</th>
                <th class="px-5 py-3 font-semibold">Correo</th>
                <th class="px-5 py-3 font-semibold">Creado en</th>
                <th class="px-5 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (usuario of usuarios(); track usuario.id) {
                <tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                  <td class="px-5 py-3 font-semibold text-gray-800">{{ usuario.nombre }}</td>
                  <td class="px-5 py-3 text-gray-500">{{ usuario.correo }}</td>
                  <td class="px-5 py-3 text-gray-500">{{ usuario.creadoEn | date: 'medium' }}</td>
                  <td class="px-5 py-3 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <button type="button" (click)="editarUsuario(usuario)" title="Editar"
                        class="p-1.5 rounded-lg text-gray-400 hover:text-[#007832] hover:bg-[#007832]/10 transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button type="button" (click)="solicitarEliminar(usuario)" title="Eliminar"
                        class="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-admin-confirm-dialog
      [visible]="!!usuarioAEliminar()"
      titulo="Eliminar usuario"
      [mensaje]="'¿Deseas eliminar a &quot;' + (usuarioAEliminar()?.nombre ?? '') + '&quot;? Esta acción no se puede deshacer.'"
      textoConfirmar="Eliminar"
      variante="danger"
      (confirmar)="confirmarEliminar()"
      (cancelar)="cancelarEliminar()" />
  `,
})
export class RootUserListComponent {
  private readonly rootUserService = inject(RootUserAdminService);
  private readonly toast           = inject(AdminToastService);
  private readonly router          = inject(Router);

  readonly usuarios        = signal<RootUser[]>([]);
  readonly cargando        = signal(true);
  readonly usuarioAEliminar = signal<RootUser | null>(null);

  constructor() { this.cargarUsuarios(); }

  cargarUsuarios(): void {
    this.cargando.set(true);
    this.rootUserService.obtenerTodos().subscribe({
      next: (data) => { this.usuarios.set(data); this.cargando.set(false); },
      error: () => { this.cargando.set(false); this.toast.error('No se pudieron cargar los usuarios root.'); },
    });
  }

  nuevoUsuario(): void { this.router.navigate(['/root-users/nuevo']); }
  editarUsuario(usuario: RootUser): void { this.router.navigate(['/root-users', usuario.id, 'editar']); }
  solicitarEliminar(usuario: RootUser): void { this.usuarioAEliminar.set(usuario); }
  cancelarEliminar(): void { this.usuarioAEliminar.set(null); }

  confirmarEliminar(): void {
    const usuario = this.usuarioAEliminar();
    if (!usuario) return;
    this.rootUserService.eliminar(usuario.id).subscribe({
      next: () => { this.toast.success(`"${usuario.nombre}" fue eliminado.`); this.usuarioAEliminar.set(null); this.cargarUsuarios(); },
      error: () => { this.toast.error('No se pudo eliminar el usuario.'); this.usuarioAEliminar.set(null); },
    });
  }
}
