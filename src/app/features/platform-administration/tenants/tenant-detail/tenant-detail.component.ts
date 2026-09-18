import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TenantAdminService } from '../../../../core/services/admin/tenant-admin.service';
import { AuditLogAdminService } from '../../../../core/services/admin/audit-log-admin.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';
import { Tenant, TenantCredenciales } from '../../../../shared/models/admin/tenant.model';
import { AuditLog, ACCION_COLORES } from '../../../../shared/models/admin/audit-log.model';
import { AdminBadgeEstadoComponent } from '../../../../shared/components/admin/badge-estado.component';
import { AdminLoadingSpinnerComponent } from '../../../../shared/components/admin/loading-spinner.component';
import { AdminCredencialesModalComponent } from '../../../../shared/components/admin/credenciales-modal.component';

@Component({
  selector: 'app-tenant-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, AdminBadgeEstadoComponent, AdminLoadingSpinnerComponent, AdminCredencialesModalComponent],
  template: `
    <div class="mb-6">
      <nav class="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
        <a routerLink="/tenants" class="hover:text-[#007832] transition-colors">Centros de Formación</a>
        <span>/</span>
        <span class="text-gray-600 font-medium">{{ tenant()?.nombre ?? '...' }}</span>
      </nav>
    </div>

    @if (cargando()) {
      <app-admin-loading-spinner mensaje="Cargando centro..." />
    } @else if (tenant(); as t) {
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight">{{ t.nombre }}</h1>
          <app-admin-badge-estado [estado]="t.estado" />
        </div>
        <div class="flex items-center gap-2">
          <button type="button" (click)="toggleEstado()" [disabled]="actualizandoEstado()"
            class="text-sm font-semibold px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            {{ t.estado === 'activo' ? 'Desactivar' : 'Activar' }}
          </button>
          <button type="button" (click)="reinicializar()" [disabled]="reinicializando()"
            class="text-sm font-semibold px-4 py-2.5 rounded-xl border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50">
            {{ reinicializando() ? 'Reinicializando...' : 'Reinicializar' }}
          </button>
          <button type="button" (click)="editar()"
            class="text-sm font-semibold px-4 py-2.5 rounded-xl text-white transition-opacity hover:opacity-90"
            style="background:#39A900;">
            Editar
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 font-semibold text-sm text-gray-800">Información general</div>
          <div class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Slug</p>
              <code class="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">{{ t.slug }}</code>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Dominio</p>
              <p class="text-gray-700">{{ t.dominio }}</p>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Creado</p>
              <p class="text-gray-700">{{ t.creadoEn | date: 'medium' }}</p>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Actualizado</p>
              <p class="text-gray-700">{{ t.actualizadoEn | date: 'medium' }}</p>
            </div>
          </div>
        </div>
      </div>

      <app-admin-credenciales-modal
        [visible]="mostrarCredenciales()"
        titulo="Credenciales reinicializadas"
        [login]="credencialesActuales()?.login ?? ''"
        [password]="credencialesActuales()?.password ?? ''"
        (cerrar)="mostrarCredenciales.set(false)" />

      <!-- Logs -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-4">
        <div class="px-5 py-3.5 border-b border-gray-100 font-semibold text-sm text-gray-800">Últimos registros de auditoría</div>
        @if (logs().length === 0) {
          <div class="flex flex-col items-center justify-center py-10 text-gray-400">
            <p class="text-sm">Sin actividad registrada para este tenant.</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500 border-b border-gray-100" style="background:#fafbfc;">
                  <th class="px-5 py-2.5 font-semibold">Fecha</th>
                  <th class="px-5 py-2.5 font-semibold">Usuario</th>
                  <th class="px-5 py-2.5 font-semibold">Acción</th>
                  <th class="px-5 py-2.5 font-semibold">Módulo</th>
                  <th class="px-5 py-2.5 font-semibold">Descripción</th>
                </tr>
              </thead>
              <tbody>
                @for (log of logs(); track log.id) {
                  <tr class="border-b border-gray-50">
                    <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap">{{ log.fecha | date: 'short' }}</td>
                    <td class="px-5 py-2.5 text-gray-700">{{ log.usuario }}</td>
                    <td class="px-5 py-2.5">
                      <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [class]="accionColores[log.accion]">{{ log.accion }}</span>
                    </td>
                    <td class="px-5 py-2.5 text-gray-500">{{ log.modulo }}</td>
                    <td class="px-5 py-2.5 text-gray-500">{{ log.descripcion ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }
  `,
})
export class TenantDetailComponent {
  private readonly tenantService   = inject(TenantAdminService);
  private readonly auditLogService = inject(AuditLogAdminService);
  private readonly toast           = inject(AdminToastService);
  private readonly route           = inject(ActivatedRoute);
  private readonly router          = inject(Router);

  readonly accionColores       = ACCION_COLORES;
  readonly cargando            = signal(true);
  readonly tenant              = signal<Tenant | null>(null);
  readonly logs                = signal<AuditLog[]>([]);
  readonly actualizandoEstado  = signal(false);
  readonly reinicializando     = signal(false);
  readonly mostrarCredenciales = signal(false);
  readonly credencialesActuales = signal<TenantCredenciales | null>(null);

  constructor() { this.cargarTenant(); }

  private cargarTenant(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/tenants']); return; }
    this.tenantService.obtenerPorId(id).subscribe({
      next: (tenant) => {
        this.tenant.set(tenant);
        this.cargando.set(false);
        this.auditLogService.obtenerLogs({ tenantId: id }).subscribe({
          next: (logs) => this.logs.set(logs.slice(0, 10)),
        });
      },
      error: () => { this.cargando.set(false); this.toast.error('No se pudo cargar el centro.'); this.router.navigate(['/tenants']); },
    });
  }

  toggleEstado(): void {
    const tenant = this.tenant();
    if (!tenant) return;
    const nuevoEstado = tenant.estado === 'activo' ? 'inactivo' : 'activo';
    this.actualizandoEstado.set(true);
    this.tenantService.toggleEstado(tenant.id, nuevoEstado).subscribe({
      next: (actualizado) => {
        this.tenant.set(actualizado);
        this.actualizandoEstado.set(false);
        this.toast.success(`Tenant ${nuevoEstado === 'activo' ? 'activado' : 'desactivado'} correctamente.`);
      },
      error: () => { this.actualizandoEstado.set(false); this.toast.error('No se pudo cambiar el estado del tenant.'); },
    });
  }

  reinicializar(): void {
    const tenant = this.tenant();
    if (!tenant) return;
    this.reinicializando.set(true);
    this.tenantService.reinicializar(tenant.id).subscribe({
      next: (respuesta) => {
        this.reinicializando.set(false);
        if (respuesta.credencialesDefecto) {
          this.credencialesActuales.set(respuesta.credencialesDefecto);
          this.mostrarCredenciales.set(true);
        } else {
          this.toast.error('Tenant reinicializado, pero no se pudieron obtener las credenciales.');
        }
      },
      error: () => { this.reinicializando.set(false); this.toast.error('No se pudo reinicializar el tenant.'); },
    });
  }

  editar(): void {
    const tenant = this.tenant();
    if (tenant) this.router.navigate(['/tenants', tenant.id, 'editar']);
  }
}
