import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TenantAdminService } from '../../../../core/services/admin/tenant-admin.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';
import { Tenant, TenantCredenciales } from '../../../../shared/models/admin/tenant.model';
import { AdminConfirmDialogComponent } from '../../../../shared/components/admin/confirm-dialog.component';
import { AdminCredencialesModalComponent } from '../../../../shared/components/admin/credenciales-modal.component';
import { AdminBadgeEstadoComponent } from '../../../../shared/components/admin/badge-estado.component';
import { AdminEmptyStateComponent } from '../../../../shared/components/admin/empty-state.component';
import { AdminLoadingSpinnerComponent } from '../../../../shared/components/admin/loading-spinner.component';

@Component({
  selector: 'app-tenant-list',
  standalone: true,
  imports: [FormsModule, AdminConfirmDialogComponent, AdminBadgeEstadoComponent, AdminEmptyStateComponent, AdminLoadingSpinnerComponent, AdminCredencialesModalComponent],
  template: `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Centros de Formación</h1>
        <p class="text-sm text-gray-500 mt-1">Administra los centros del sistema.</p>
      </div>
      <button type="button" (click)="nuevoTenant()"
        class="flex items-center gap-2 text-sm font-semibold text-white px-4 py-2.5 rounded-xl transition-opacity hover:opacity-90 flex-shrink-0"
        style="background:#39A900;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" d="M12 5v14m-7-7h14" />
        </svg>
        Nuevo Centro
      </button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="p-4 border-b border-gray-100">
        <div class="relative max-w-xs">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="M21 21l-4.35-4.35" />
            </svg>
          </span>
          <input type="text" placeholder="Buscar por nombre, slug o dominio..."
            [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)"
            class="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 outline-none transition-colors focus:border-[#39A900]"
            style="background:#f8fafc;" />
        </div>
      </div>

      @if (cargando()) {
        <app-admin-loading-spinner mensaje="Cargando centros..." />
      } @else if (tenantsFiltrados().length === 0) {
        <app-admin-empty-state
          [mensaje]="busqueda() ? 'No se encontraron centros para &quot;' + busqueda() + '&quot;.' : 'Aún no hay centros registrados. Crea el primero.'" />
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-gray-100" style="background:#fafbfc;">
                <th class="px-5 py-3 font-semibold">Nombre</th>
                <th class="px-5 py-3 font-semibold">Slug</th>
                <th class="px-5 py-3 font-semibold">Dominio</th>
                <th class="px-5 py-3 font-semibold">Estado</th>
                <th class="px-5 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (tenant of tenantsFiltrados(); track tenant.id) {
                <tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                  <td class="px-5 py-3 font-semibold text-gray-800">{{ tenant.nombre }}</td>
                  <td class="px-5 py-3">
                    <code class="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">{{ tenant.slug }}</code>
                  </td>
                  <td class="px-5 py-3 text-gray-500">{{ tenant.dominio }}</td>
                  <td class="px-5 py-3"><app-admin-badge-estado [estado]="tenant.estado" /></td>
                  <td class="px-5 py-3 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <button type="button" (click)="reinicializarTenant(tenant)" [disabled]="reinicializandoId() === tenant.id"
                        title="Reinicializar" class="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      <button type="button" (click)="editarTenant(tenant)" title="Editar"
                        class="p-1.5 rounded-lg text-gray-400 hover:text-[#007832] hover:bg-[#007832]/10 transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button type="button" (click)="solicitarEliminar(tenant)" [disabled]="tenant.estado === 'inactivo'"
                        title="Desactivar" class="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400">
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
      [visible]="!!tenantAEliminar()"
      titulo="Desactivar centro"
      [mensaje]="'¿Deseas desactivar &quot;' + (tenantAEliminar()?.nombre ?? '') + '&quot;? Su estado cambiará a inactivo.'"
      textoConfirmar="Desactivar"
      variante="danger"
      (confirmar)="confirmarEliminar()"
      (cancelar)="cancelarEliminar()" />

    <app-admin-credenciales-modal
      [visible]="mostrarCredenciales()"
      titulo="Credenciales reinicializadas"
      [login]="credencialesActuales()?.login ?? ''"
      [password]="credencialesActuales()?.password ?? ''"
      (cerrar)="mostrarCredenciales.set(false)" />
  `,
})
export class TenantListComponent {
  private readonly tenantService = inject(TenantAdminService);
  private readonly toast         = inject(AdminToastService);
  private readonly router        = inject(Router);

  readonly tenants           = signal<Tenant[]>([]);
  readonly cargando          = signal(true);
  readonly busqueda          = signal('');
  readonly tenantAEliminar   = signal<Tenant | null>(null);
  readonly reinicializandoId = signal<string | null>(null);
  readonly mostrarCredenciales  = signal(false);
  readonly credencialesActuales = signal<TenantCredenciales | null>(null);

  readonly tenantsFiltrados = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    if (!termino) return this.tenants();
    return this.tenants().filter(
      (t) => t.nombre.toLowerCase().includes(termino) || t.slug.toLowerCase().includes(termino) || t.dominio.toLowerCase().includes(termino),
    );
  });

  constructor() { this.cargarTenants(); }

  cargarTenants(): void {
    this.cargando.set(true);
    this.tenantService.obtenerTodos().subscribe({
      next: (data) => { this.tenants.set(data); this.cargando.set(false); },
      error: () => { this.cargando.set(false); this.toast.error('No se pudieron cargar los centros.'); },
    });
  }

  nuevoTenant(): void { this.router.navigate(['/tenants/nuevo']); }

  reinicializarTenant(tenant: Tenant): void {
    this.reinicializandoId.set(tenant.id);
    this.tenantService.reinicializar(tenant.id).subscribe({
      next: (respuesta) => {
        this.reinicializandoId.set(null);
        if (respuesta.credencialesDefecto) {
          this.credencialesActuales.set(respuesta.credencialesDefecto);
          this.mostrarCredenciales.set(true);
        } else {
          this.toast.error(`"${tenant.nombre}" reinicializado, pero no se obtuvieron credenciales.`);
        }
      },
      error: () => { this.reinicializandoId.set(null); this.toast.error('No se pudo reinicializar el tenant.'); },
    });
  }

  editarTenant(tenant: Tenant): void { this.router.navigate(['/tenants', tenant.id, 'editar']); }
  solicitarEliminar(tenant: Tenant): void { this.tenantAEliminar.set(tenant); }
  cancelarEliminar(): void { this.tenantAEliminar.set(null); }

  confirmarEliminar(): void {
    const tenant = this.tenantAEliminar();
    if (!tenant) return;
    this.tenantService.eliminar(tenant.id).subscribe({
      next: () => { this.toast.success(`"${tenant.nombre}" fue desactivado.`); this.tenantAEliminar.set(null); this.cargarTenants(); },
      error: () => { this.toast.error('No se pudo desactivar el centro.'); this.tenantAEliminar.set(null); },
    });
  }
}
