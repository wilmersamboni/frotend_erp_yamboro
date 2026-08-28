import { Component, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DominioAdminService } from '../../../../core/services/admin/dominio-admin.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';
import { Dominio, DOMINIO_ESTADO_COLORES } from '../../../../shared/models/admin/dominio.model';
import { AdminLoadingSpinnerComponent } from '../../../../shared/components/admin/loading-spinner.component';
import { AdminEmptyStateComponent } from '../../../../shared/components/admin/empty-state.component';
import { SearchableSelectComponent, SSOption } from '../../../../shared/components/searchable-select.component';

@Component({
  selector: 'app-dominio-list',
  standalone: true,
  imports: [RouterLink, TitleCasePipe, FormsModule, AdminLoadingSpinnerComponent, AdminEmptyStateComponent, SearchableSelectComponent],
  template: `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Gestión de Dominios</h1>
        <p class="text-sm text-gray-400 mt-0.5">Subdominios por tenant · Certificados SSL</p>
      </div>
      <a routerLink="nuevo"
        class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style="background:#39A900;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" d="M12 5v14M5 12h14"/>
        </svg>
        Nuevo dominio
      </a>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4 mb-5">
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Total</p>
        <p class="text-2xl font-bold text-gray-900">{{ dominios().length }}</p>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Con SSL activo</p>
        <p class="text-2xl font-bold" style="color:#39A900;">{{ conSSL() }}</p>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Pendientes</p>
        <p class="text-2xl font-bold text-yellow-600">{{ pendientes() }}</p>
      </div>
    </div>

    <!-- Filtros -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex gap-3">
      <input type="text" placeholder="Buscar subdominio o tenant..."
        class="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-xl outline-none focus:border-[#39A900] transition-colors"
        [value]="filtroTexto()" (input)="filtroTexto.set($any($event.target).value)" />
      <div class="w-56">
        <app-ss [options]="estadoOptions" placeholder="Todos los estados"
          [ngModel]="filtroEstado()" (ngModelChange)="filtroEstado.set($event)"></app-ss>
      </div>
    </div>

    <!-- Tabla -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      @if (cargando()) {
        <app-admin-loading-spinner mensaje="Cargando dominios..." />
      } @else if (dominiosFiltrados().length === 0) {
        <app-admin-empty-state mensaje="No se encontraron dominios registrados" />
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-gray-100" style="background:#fafbfc;">
                <th class="px-5 py-3 font-semibold">Subdominio</th>
                <th class="px-5 py-3 font-semibold">Tenant</th>
                <th class="px-5 py-3 font-semibold text-center">SSL</th>
                <th class="px-5 py-3 font-semibold">Estado</th>
                <th class="px-5 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (d of dominiosFiltrados(); track d.id) {
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td class="px-5 py-3">
                    <div class="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#39A900" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                      </svg>
                      <code class="text-xs text-gray-700">{{ d.subdominio }}</code>
                    </div>
                  </td>
                  <td class="px-5 py-3 text-gray-600">{{ d.tenantNombre ?? d.tenantId }}</td>
                  <td class="px-5 py-3 text-center">
                    @if (d.ssl) {
                      <span class="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                        Activo
                      </span>
                    } @else {
                      <span class="text-xs text-gray-400">Sin SSL</span>
                    }
                  </td>
                  <td class="px-5 py-3">
                    <span class="text-xs font-semibold px-2.5 py-1 rounded-full" [class]="estadoColores[d.estado]">
                      {{ d.estado | titlecase }}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-right">
                    <div class="flex items-center justify-end gap-2">
                      <a [routerLink]="[d.id, 'editar']"
                        class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                        Editar
                      </a>
                      <button type="button" (click)="eliminar(d)"
                        class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors">
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
          {{ dominiosFiltrados().length }} dominio(s) encontrado(s)
        </div>
      }
    </div>
  `,
})
export class DominioListComponent {
  private readonly dominioService = inject(DominioAdminService);
  private readonly toast          = inject(AdminToastService);

  readonly estadoColores = DOMINIO_ESTADO_COLORES;
  readonly cargando      = signal(true);
  readonly dominios      = signal<Dominio[]>([]);
  readonly filtroTexto   = signal('');
  readonly filtroEstado  = signal('');

  readonly estadoOptions: SSOption[] = [
    { value: '',          label: 'Todos los estados' },
    { value: 'activo',    label: 'Activo' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'inactivo',  label: 'Inactivo' },
  ];

  readonly conSSL     = () => this.dominios().filter(d => d.ssl && d.estado === 'activo').length;
  readonly pendientes = () => this.dominios().filter(d => d.estado === 'pendiente').length;

  readonly dominiosFiltrados = () => {
    let lista = this.dominios();
    const txt = this.filtroTexto().toLowerCase().trim();
    if (txt) lista = lista.filter(d => d.subdominio.toLowerCase().includes(txt) || (d.tenantNombre ?? '').toLowerCase().includes(txt));
    if (this.filtroEstado()) lista = lista.filter(d => d.estado === this.filtroEstado());
    return lista;
  };

  constructor() {
    this.dominioService.obtenerTodos().subscribe({
      next: (data) => { this.dominios.set(data); this.cargando.set(false); },
      error: () => { this.cargando.set(false); this.toast.error('No se pudieron cargar los dominios.'); },
    });
  }

  eliminar(dominio: Dominio): void {
    if (!confirm(`¿Eliminar el dominio "${dominio.subdominio}"?`)) return;
    this.dominioService.eliminar(dominio.id).subscribe({
      next: () => { this.dominios.update(lista => lista.filter(d => d.id !== dominio.id)); this.toast.success('Dominio eliminado.'); },
      error: () => this.toast.error('No se pudo eliminar el dominio.'),
    });
  }
}
