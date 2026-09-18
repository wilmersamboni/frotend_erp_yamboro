import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TenantAdminService } from '../../../core/services/admin/tenant-admin.service';
import { AuditLogAdminService } from '../../../core/services/admin/audit-log-admin.service';
import { Tenant } from '../../../shared/models/admin/tenant.model';
import { AuditLog, ACCION_COLORES } from '../../../shared/models/admin/audit-log.model';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
      <p class="text-sm text-gray-500 mt-1">Resumen general del sistema de Centros de Formación.</p>
    </div>

    @if (cargando()) {
      <div class="flex flex-col items-center justify-center py-16">
        <svg class="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#39A900" stroke-width="3">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
        <p class="text-sm text-gray-400 mt-3">Cargando información...</p>
      </div>
    } @else {
      <!-- Métricas -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Centros</p>
          <p class="text-2xl font-bold text-gray-900 mt-2">{{ tenants().length }}</p>
        </div>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Activos</p>
          <p class="text-2xl font-bold mt-2" style="color:#007832;">{{ totalActivos() }}</p>
        </div>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Inactivos</p>
          <p class="text-2xl font-bold text-gray-500 mt-2">{{ totalInactivos() }}</p>
        </div>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Logs últimas 24h</p>
          <p class="text-2xl font-bold mt-2" style="color:#00304D;">{{ logsRecientes().length }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Últimos logs -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden lg:col-span-2">
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 class="font-semibold text-sm text-gray-800">Actividad reciente</h2>
            <a routerLink="/audit-log" class="text-xs font-semibold hover:underline" style="color:#39A900;">Ver todo</a>
          </div>
          @if (ultimosLogs().length === 0) {
            <div class="flex flex-col items-center justify-center py-10 text-gray-400">
              <p class="text-sm">Sin actividad registrada en las últimas 24 horas.</p>
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
                  </tr>
                </thead>
                <tbody>
                  @for (log of ultimosLogs(); track log.id) {
                    <tr class="border-b border-gray-50">
                      <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap">{{ log.fecha | date: 'short' }}</td>
                      <td class="px-5 py-2.5 text-gray-700">{{ log.usuario }}</td>
                      <td class="px-5 py-2.5">
                        <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [class]="accionColores[log.accion]">{{ log.accion }}</span>
                      </td>
                      <td class="px-5 py-2.5 text-gray-500">{{ log.modulo }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <!-- Centros inactivos -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100">
            <h2 class="font-semibold text-sm text-gray-800">Centros inactivos</h2>
          </div>
          @if (tenantsInactivos().length === 0) {
            <div class="flex flex-col items-center justify-center py-10 text-gray-400">
              <p class="text-sm">Todos los centros están activos.</p>
            </div>
          } @else {
            <ul class="divide-y divide-gray-50">
              @for (tenant of tenantsInactivos(); track tenant.id) {
                <li class="px-5 py-3 flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-gray-800 truncate">{{ tenant.nombre }}</p>
                    <p class="text-xs text-gray-400 truncate">{{ tenant.slug }}</p>
                  </div>
                  <a [routerLink]="['/tenants', tenant.id]" class="text-xs font-semibold whitespace-nowrap hover:underline" style="color:#dc2626;">Ver</a>
                </li>
              }
            </ul>
          }
        </div>
      </div>
    }
  `,
})
export class AdminDashboardComponent {
  private readonly tenantService   = inject(TenantAdminService);
  private readonly auditLogService = inject(AuditLogAdminService);

  readonly accionColores  = ACCION_COLORES;
  readonly cargando       = signal(true);
  readonly tenants        = signal<Tenant[]>([]);
  readonly logsRecientes  = signal<AuditLog[]>([]);

  readonly totalActivos    = computed(() => this.tenants().filter((t) => t.estado === 'activo').length);
  readonly totalInactivos  = computed(() => this.tenants().filter((t) => t.estado === 'inactivo').length);
  readonly tenantsInactivos = computed(() => this.tenants().filter((t) => t.estado === 'inactivo'));
  readonly ultimosLogs     = computed(() => this.logsRecientes().slice(0, 5));

  constructor() { this.cargarDatos(); }

  private cargarDatos(): void {
    const desde = new Date(Date.now() - 86400000).toISOString();
    this.tenantService.obtenerTodos().subscribe({
      next: (tenants) => {
        this.tenants.set(tenants);
        this.auditLogService.obtenerLogs({ desde }).subscribe({
          next: (logs) => { this.logsRecientes.set(logs); this.cargando.set(false); },
          error: () => this.cargando.set(false),
        });
      },
      error: () => this.cargando.set(false),
    });
  }
}
