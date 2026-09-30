import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { from, of } from 'rxjs';
import { catchError, concatMap, map, toArray } from 'rxjs/operators';
import { TenantAdminService } from '../../../../core/services/admin/tenant-admin.service';
import { TenantSaludService } from '../../../../core/services/admin/tenant-salud.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';
import { Tenant, TenantCreado, TenantCredenciales } from '../../../../shared/models/admin/tenant.model';
import { AdminConfirmDialogComponent } from '../../../../shared/components/admin/confirm-dialog.component';
import { AdminCredencialesModalComponent } from '../../../../shared/components/admin/credenciales-modal.component';
import { AdminBadgeEstadoComponent } from '../../../../shared/components/admin/badge-estado.component';
import { TenantNuevoModalComponent } from '../tenant-form/tenant-nuevo-modal.component';
import { AdminCopiarComponent } from '../../../../shared/components/admin/copiar.component';
import { AdminConexionComponent } from '../../../../shared/components/admin/conexion.component';
import { AdminEmptyStateComponent } from '../../../../shared/components/admin/empty-state.component';
import { AdminLoadingSpinnerComponent } from '../../../../shared/components/admin/loading-spinner.component';
import { EsperaDirective } from '../../../../shared/directives/espera.directive';

@Component({
  selector: 'app-tenant-list',
  standalone: true,
  imports: [RouterLink, TenantNuevoModalComponent, AdminCopiarComponent, EsperaDirective, FormsModule, AdminConfirmDialogComponent, AdminBadgeEstadoComponent, AdminConexionComponent, AdminEmptyStateComponent, AdminLoadingSpinnerComponent, AdminCredencialesModalComponent],
  template: `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Centros de Formación</h1>
        <p class="text-sm text-gray-500 mt-1">Cada centro tiene su propia base de datos y usuarios. Desde aquí los creas, los activas o desactivas y compruebas que funcionan. Haz clic en un centro para ver su detalle.</p>
      </div>
      <button type="button" (click)="nuevoTenant()"
        class="flex items-center gap-2 text-sm font-semibold text-white px-4 py-2.5 rounded-xl transition-opacity hover:opacity-90 flex-shrink-0"
        style="background:var(--accent-brand);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" d="M12 5v14m-7-7h14" />
        </svg>
        Nuevo Centro
      </button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[14rem] max-w-xs">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="M21 21l-4.35-4.35" />
            </svg>
          </span>
          <input appEspera type="text" placeholder="Buscar por nombre, slug o dominio..." aria-label="Buscar centros"
            [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)"
            class="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 outline-none transition-colors"
            style="background:var(--surface2);" />
        </div>
        <button type="button" (click)="verificarVisibles()" [disabled]="!tenantsFiltrados().length"
          class="ml-auto text-sm font-semibold px-3.5 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40">
          Verificar los centros activos
        </button>
      </div>

      <!-- Barra de acciones sobre lo seleccionado -->
      @if (seleccion().size > 0) {
        <div class="px-4 py-2.5 border-b flex flex-wrap items-center gap-2 text-sm"
             style="background:var(--accent-soft);border-color:var(--border-soft);">
          <span class="font-semibold" style="color:var(--accent-text);">{{ seleccion().size }} seleccionado(s)</span>
          <span class="flex-1"></span>
          <button type="button" (click)="verificarSeleccion()" [disabled]="procesando()"
            class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40">Verificar conexión</button>
          <button type="button" (click)="accionMasiva = 'activo'; confirmandoMasivo.set(true)" [disabled]="procesando()"
            class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40">Activar</button>
          <button type="button" (click)="accionMasiva = 'inactivo'; confirmandoMasivo.set(true)" [disabled]="procesando()"
            class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-40">Desactivar</button>
          <button type="button" (click)="seleccion.set(vacio)"
            class="text-xs font-semibold px-2 py-1.5 text-gray-500 hover:text-gray-800">Quitar selección</button>
        </div>
      }

      @if (cargando()) {
        <app-admin-loading-spinner mensaje="Cargando centros..." />
      } @else if (tenantsFiltrados().length === 0) {
        <app-admin-empty-state
          [mensaje]="busqueda() ? 'No se encontraron centros para &quot;' + busqueda() + '&quot;.' : 'Aún no hay centros registrados. Crea el primero.'" />
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-gray-100" style="background:var(--surface2);">
                <th class="pl-5 pr-2 py-3 w-8">
                  <input type="checkbox" aria-label="Seleccionar todos" [checked]="todosMarcados()" (change)="marcarTodos()" class="w-4 h-4 rounded" />
                </th>
                <th class="px-3 py-3 font-semibold">Nombre</th>
                <th class="px-5 py-3 font-semibold hidden md:table-cell" title="Nombre corto del centro que usa el sistema">Identificador</th>
                <th class="px-5 py-3 font-semibold hidden lg:table-cell" title="Dirección con la que entran los usuarios del centro">Dirección de acceso</th>
                <th class="px-5 py-3 font-semibold">Estado</th>
                <th class="px-5 py-3 font-semibold hidden sm:table-cell">Conexión</th>
                <th class="px-5 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (tenant of tenantsFiltrados(); track tenant.id) {
                <tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors" [style.background]="seleccion().has(tenant.id) ? 'var(--accent-soft)' : ''">
                  <td class="pl-5 pr-2 py-3">
                    <input type="checkbox" [attr.aria-label]="'Seleccionar ' + tenant.nombre"
                      [checked]="seleccion().has(tenant.id)" (change)="marcar(tenant.id)" class="w-4 h-4 rounded" />
                  </td>
                  <td class="px-3 py-3">
                    <a [routerLink]="['/tenants', tenant.id]" class="font-semibold text-gray-800 hover:underline" style="text-underline-offset:3px;">{{ tenant.nombre }}</a>
                  </td>
                  <td class="px-5 py-3 hidden md:table-cell">
                    <code class="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">{{ tenant.slug }}</code>
                    <app-admin-copiar [valor]="tenant.slug" etiqueta="el identificador" />
                  </td>
                  <td class="px-5 py-3 text-gray-500 hidden lg:table-cell">{{ tenant.dominio }}</td>
                  <td class="px-5 py-3"><app-admin-badge-estado [estado]="tenant.estado" /></td>
                  <td class="px-5 py-3 hidden sm:table-cell"><app-admin-conexion [estado]="salud.estado(tenant.id)" [inactivo]="tenant.estado === 'inactivo'" /></td>
                  <td class="px-5 py-3 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <button aria-label="Verificar conexión" type="button" (click)="salud.verificar([tenant.id])" [disabled]="tenant.estado === 'inactivo'" title="Verificar conexión"
                        class="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                      </button>
                      <button aria-label="Reinicializar" type="button" (click)="solicitarReinicializar(tenant)" [disabled]="reinicializandoId() === tenant.id"
                        title="Reinicializar" class="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      <button aria-label="Editar" type="button" (click)="editarTenant(tenant)" title="Editar"
                        class="p-1.5 rounded-lg text-gray-400 hover:text-[#007832] hover:bg-[#007832]/10 transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button aria-label="Desactivar" type="button" (click)="solicitarEliminar(tenant)" [disabled]="tenant.estado === 'inactivo'"
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
        <div class="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">{{ tenantsFiltrados().length }} centro(s)</div>
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

    <app-admin-confirm-dialog
      [visible]="!!tenantAReinicializar()"
      titulo="Reinicializar centro"
      [mensaje]="'Esto invalida la contraseña actual del usuario root de &quot;' + (tenantAReinicializar()?.nombre ?? '') + '&quot; y genera una nueva. No se puede deshacer.'"
      [textoAEscribir]="tenantAReinicializar()?.nombre ?? ''"
      textoConfirmar="Reinicializar"
      variante="danger"
      (confirmar)="confirmarReinicializar()"
      (cancelar)="cancelarReinicializar()" />

    <app-admin-confirm-dialog
      [visible]="confirmandoMasivo()"
      [titulo]="accionMasiva === 'activo' ? 'Activar centros' : 'Desactivar centros'"
      [mensaje]="(accionMasiva === 'activo' ? 'Se activarán ' : 'Se desactivarán ') + seleccion().size + ' centro(s). Desactivar corta el acceso de sus usuarios.'"
      [textoConfirmar]="accionMasiva === 'activo' ? 'Activar' : 'Desactivar'"
      [variante]="accionMasiva === 'activo' ? 'primary' : 'danger'"
      (confirmar)="aplicarMasivo()"
      (cancelar)="confirmandoMasivo.set(false)" />

    @if (creando()) {
      <app-tenant-nuevo-modal (cerrar)="creando.set(false)" (creado)="alCrear($event)" />
    }

    <app-admin-credenciales-modal
      [visible]="mostrarCredenciales()"
      [titulo]="tituloCredenciales()"
      [login]="credencialesActuales()?.login ?? ''"
      [password]="credencialesActuales()?.password ?? ''"
      (cerrar)="mostrarCredenciales.set(false)" />
  `,
})
export class TenantListComponent {
  private readonly tenantService = inject(TenantAdminService);
  private readonly toast         = inject(AdminToastService);
  private readonly router        = inject(Router);
  readonly salud                 = inject(TenantSaludService);

  readonly vacio = new Set<string>();
  readonly tenants           = signal<Tenant[]>([]);
  readonly cargando          = signal(true);
  readonly busqueda          = signal('');
  readonly seleccion         = signal<Set<string>>(this.vacio);
  readonly procesando        = signal(false);
  readonly confirmandoMasivo = signal(false);
  accionMasiva: 'activo' | 'inactivo' = 'inactivo';
  readonly tenantAEliminar   = signal<Tenant | null>(null);
  readonly tenantAReinicializar = signal<Tenant | null>(null);
  readonly reinicializandoId = signal<string | null>(null);
  readonly creando              = signal(false);
  readonly tituloCredenciales   = signal('Credenciales reinicializadas');
  readonly mostrarCredenciales  = signal(false);
  readonly credencialesActuales = signal<TenantCredenciales | null>(null);

  readonly tenantsFiltrados = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    if (!termino) return this.tenants();
    return this.tenants().filter(
      (t) => t.nombre.toLowerCase().includes(termino) || t.slug.toLowerCase().includes(termino) || t.dominio.toLowerCase().includes(termino),
    );
  });

  readonly todosMarcados = computed(() => {
    const lista = this.tenantsFiltrados();
    return lista.length > 0 && lista.every(t => this.seleccion().has(t.id));
  });

  constructor() {
    this.cargarTenants();
    // Enlaces como "Nuevo centro" del buscador abren el formulario encima de la lista.
    if (inject(ActivatedRoute).snapshot.queryParamMap.has('nuevo')) this.creando.set(true);
  }

  cargarTenants(): void {
    this.cargando.set(true);
    this.tenantService.obtenerTodos().subscribe({
      next: (data) => { this.tenants.set(data); this.cargando.set(false); },
      error: (err) => { this.cargando.set(false); this.toast.httpError(err, 'No se pudieron cargar los centros.'); },
    });
  }

  marcar(id: string): void {
    const s = new Set(this.seleccion());
    s.has(id) ? s.delete(id) : s.add(id);
    this.seleccion.set(s);
  }

  marcarTodos(): void {
    this.seleccion.set(this.todosMarcados() ? new Set() : new Set(this.tenantsFiltrados().map(t => t.id)));
  }

  verificarVisibles(): void {
    this.salud.verificar(this.tenantsFiltrados().filter(t => t.estado === 'activo').map(t => t.id), (ok, falla) => this.avisarVerificacion(ok, falla));
  }

  verificarSeleccion(): void {
    const ids = this.tenants().filter(t => this.seleccion().has(t.id) && t.estado === 'activo').map(t => t.id);
    this.salud.verificar(ids, (ok, falla) => this.avisarVerificacion(ok, falla));
  }

  private avisarVerificacion(ok: number, falla: number): void {
    if (falla === 0) this.toast.success(`Conexión correcta en ${ok} centro(s).`);
    else this.toast.error(`${falla} centro(s) sin conexión a su base de datos (${ok} bien).`);
  }

  /** Uno por uno, no en paralelo: si uno falla, el resto sigue y al final se cuenta qué pasó con cada uno. */
  aplicarMasivo(): void {
    const estado = this.accionMasiva;
    const objetivo = this.tenants().filter(t => this.seleccion().has(t.id) && t.estado !== estado);
    this.confirmandoMasivo.set(false);
    if (!objetivo.length) { this.toast.success('Los centros seleccionados ya estaban en ese estado.'); return; }
    this.procesando.set(true);
    from(objetivo).pipe(
      concatMap(t => this.tenantService.toggleEstado(t.id, estado).pipe(map(() => true), catchError(() => of(false)))),
      toArray(),
    ).subscribe((res) => {
      const bien = res.filter(Boolean).length;
      const mal = res.length - bien;
      this.procesando.set(false);
      this.seleccion.set(new Set());
      this.cargarTenants();
      if (mal === 0) this.toast.success(`${bien} centro(s) ${estado === 'activo' ? 'activados' : 'desactivados'}.`);
      else this.toast.error(`${bien} listo(s) y ${mal} con error. Revisa los que no cambiaron.`);
    });
  }

  nuevoTenant(): void { this.creando.set(true); }

  alCrear(respuesta: TenantCreado): void {
    this.creando.set(false);
    this.cargarTenants();
    if (respuesta.credencialesDefecto) {
      this.tituloCredenciales.set('Centro creado — guarda las credenciales');
      this.credencialesActuales.set(respuesta.credencialesDefecto);
      this.mostrarCredenciales.set(true);
    } else {
      this.toast.success(`"${respuesta.nombre}" fue creado.`);
    }
  }

  solicitarReinicializar(tenant: Tenant): void { this.tenantAReinicializar.set(tenant); }
  cancelarReinicializar(): void { this.tenantAReinicializar.set(null); }

  confirmarReinicializar(): void {
    const tenant = this.tenantAReinicializar();
    if (!tenant) return;
    this.tenantAReinicializar.set(null);
    this.reinicializandoId.set(tenant.id);
    this.tenantService.reinicializar(tenant.id).subscribe({
      next: (respuesta) => {
        this.reinicializandoId.set(null);
        if (respuesta.credencialesDefecto) {
          this.tituloCredenciales.set('Credenciales reinicializadas');
          this.credencialesActuales.set(respuesta.credencialesDefecto);
          this.mostrarCredenciales.set(true);
        } else {
          this.toast.error(`"${tenant.nombre}" reinicializado, pero no se obtuvieron credenciales.`);
        }
      },
      error: (err) => { this.reinicializandoId.set(null); this.toast.httpError(err, 'No se pudo reinicializar el centro.'); },
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
      error: (err) => { this.toast.httpError(err, 'No se pudo desactivar el centro.'); this.tenantAEliminar.set(null); },
    });
  }
}
