import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DominioAdminService } from '../../../../core/services/admin/dominio-admin.service';
import { TenantAdminService } from '../../../../core/services/admin/tenant-admin.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';
import { Dominio } from '../../../../shared/models/admin/dominio.model';
import { Tenant } from '../../../../shared/models/admin/tenant.model';
import { AdminLoadingSpinnerComponent } from '../../../../shared/components/admin/loading-spinner.component';
import { SearchableSelectComponent, SSOption } from '../../../../shared/components/searchable-select.component';
import { ConfirmService } from '../../../../core/services/confirm.service';
import { EsperaDirective } from '../../../../shared/directives/espera.directive';
import { AdminCopiarComponent } from '../../../../shared/components/admin/copiar.component';

/** Colores del estado de un dominio, por tokens del tema (sirven en claro y oscuro). */
const ESTADO: Record<Dominio['estado'], { label: string; bg: string; fg: string }> = {
  activo:    { label: 'Activo',    bg: 'var(--ok-bg)',   fg: 'var(--ok-text)' },
  pendiente: { label: 'Pendiente', bg: 'var(--warn-bg)', fg: 'var(--warn-text)' },
  inactivo:  { label: 'Inactivo',  bg: 'var(--surface3)', fg: 'var(--text-muted)' },
};

@Component({
  selector: 'app-dominio-list',
  standalone: true,
  imports: [AdminCopiarComponent, EsperaDirective, RouterLink, FormsModule, AdminLoadingSpinnerComponent, SearchableSelectComponent],
  styleUrl: '../../../dashboard/home.component.css',
  styles: [`
    .dm-fila {
      display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto auto; align-items: center; gap: 16px;
      padding: 12px 20px; border-top: 1px solid var(--border-soft); transition: background .15s;
    }
    .dm-fila:hover { background: var(--surface2); }
    .dm-cab { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); background: var(--surface2); border-top: none; }
    .dm-cab:hover { background: var(--surface2); }
    .dm-ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; }
    .dm-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 99px; white-space: nowrap; }
    .dm-btn { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; color: var(--text-muted); transition: background .15s, color .15s; }
    .dm-btn:hover { background: var(--surface3); color: var(--text); }
    .dm-btn.peligro:hover { background: var(--err-bg); color: var(--err-text); }
    @media (max-width: 760px) {
      .dm-fila { grid-template-columns: minmax(0, 1fr) auto; }
      .dm-fila .dm-opc { display: none; }
    }
  `],
  template: `
    <div class="dashboard">

      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="dash-title">Dominios</h1>
          <p class="text-sm text-gray-500 mt-1.5">
            La dirección web con la que cada centro entra al sistema, y si tiene certificado SSL (el candado de seguridad del navegador).
          </p>
        </div>
        <a routerLink="nuevo"
          class="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style="background:var(--accent-brand);">
          <i class="pi pi-plus"></i> Nuevo dominio
        </a>
      </div>

      <!-- Tarjetas -->
      <div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        <div class="kpi-card">
          <div class="kpi-head">
            <div class="kpi-icon-box box-green"><i class="pi pi-globe"></i></div>
            <span class="kpi-badge badge-green">{{ centrosConDominio() }} centro(s)</span>
          </div>
          <p class="kpi-label">Dominios registrados</p>
          <h3 class="kpi-num">{{ dominios().length }}</h3>
        </div>
        <div class="kpi-card">
          <div class="kpi-head">
            <div class="kpi-icon-box box-blue"><i class="pi pi-lock"></i></div>
            <span class="kpi-badge badge-blue">{{ porcentajeSsl() }}%</span>
          </div>
          <p class="kpi-label">Activos con SSL</p>
          <h3 class="kpi-num">{{ conSSL() }}</h3>
        </div>
        <div class="kpi-card">
          <div class="kpi-head">
            <div class="kpi-icon-box box-orange"><i class="pi pi-clock"></i></div>
            <span class="kpi-badge badge-orange">{{ pendientes() ? 'Por activar' : 'Al día' }}</span>
          </div>
          <p class="kpi-label">Pendientes</p>
          <h3 class="kpi-num">{{ pendientes() }}</h3>
        </div>
        <div class="kpi-card">
          <div class="kpi-head">
            <div class="kpi-icon-box box-purple"><i class="pi pi-building"></i></div>
            <span class="kpi-badge badge-purple">Sin dirección</span>
          </div>
          <p class="kpi-label">Centros activos sin dominio</p>
          <h3 class="kpi-num">{{ centrosSinDominio().length }}</h3>
        </div>
      </div>

      <!-- Lista -->
      <section class="chart-panel" style="padding:0;gap:0;overflow:hidden;" aria-label="Lista de dominios">
        <div class="flex flex-wrap items-center gap-3 px-5 py-4">
          <div class="relative flex-1 min-w-[14rem]">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400"></i>
            <input appEspera type="search" placeholder="Buscar por dirección o centro" aria-label="Buscar dominio"
              class="w-full h-10 pl-9 pr-3 text-sm rounded-xl border outline-none transition-colors"
              style="background:var(--surface2);border-color:var(--border);color:var(--text);"
              [value]="filtroTexto()" (input)="filtroTexto.set($any($event.target).value)" />
          </div>
          <div class="w-52">
            <app-ss [options]="estadoOptions" placeholder="Todos los estados"
              [ngModel]="filtroEstado()" (ngModelChange)="filtroEstado.set($event)"></app-ss>
          </div>
        </div>

        @if (cargando()) {
          <app-admin-loading-spinner mensaje="Cargando dominios..." />
        } @else if (!dominios().length) {
          <div class="py-14 text-center">
            <i class="pi pi-globe text-3xl text-gray-300"></i>
            <p class="text-sm font-semibold text-gray-700 mt-3">Aún no hay dominios registrados</p>
            <a routerLink="nuevo" class="text-sm font-semibold hover:underline mt-1 inline-block" style="color:var(--accent-text);">Registrar el primero</a>
          </div>
        } @else if (!dominiosFiltrados().length) {
          <p class="py-12 text-center text-sm text-gray-400">Ningún dominio coincide con los filtros.</p>
        } @else {
          <div class="dm-fila dm-cab">
            <span>Dirección</span>
            <span>Centro</span>
            <span class="dm-opc">SSL</span>
            <span class="dm-opc">Estado</span>
            <span class="text-right">Acciones</span>
          </div>
          @for (d of dominiosFiltrados(); track d.id) {
            <div class="dm-fila">
              <div class="flex items-center gap-3 min-w-0">
                <span class="dm-ic" [style.background]="d.ssl ? 'var(--ok-bg)' : 'var(--surface3)'" [style.color]="d.ssl ? 'var(--ok-text)' : 'var(--text-muted)'">
                  <i class="pi" [class.pi-lock]="d.ssl" [class.pi-lock-open]="!d.ssl"></i>
                </span>
                <div class="min-w-0">
                  <p class="flex items-center gap-1 text-sm font-semibold text-gray-800">
                    <span class="truncate">{{ d.subdominio }}</span>
                    <app-admin-copiar [valor]="d.subdominio" etiqueta="la dirección" />
                  </p>
                  <p class="text-xs text-gray-400">{{ d.ssl ? 'https://' : 'http://' }}{{ d.subdominio }}</p>
                </div>
              </div>

              <div class="min-w-0">
                @if (centro(d); as c) {
                  <a [routerLink]="['/tenants', c.id]" class="block text-sm font-medium text-gray-700 truncate hover:underline" style="text-underline-offset:3px;">{{ c.nombre }}</a>
                  <p class="text-xs text-gray-400 truncate">{{ c.slug }}@if (c.estado === 'inactivo') { · centro inactivo }</p>
                } @else {
                  <p class="text-sm font-medium" style="color:var(--warn-text);">Centro no encontrado</p>
                  <p class="text-xs text-gray-400 truncate" [title]="d.tenantId">Puede haber sido eliminado</p>
                }
              </div>

              <span class="dm-opc dm-pill" [style.background]="d.ssl ? 'var(--ok-bg)' : 'var(--surface3)'" [style.color]="d.ssl ? 'var(--ok-text)' : 'var(--text-muted)'">
                <i class="pi text-xs" [class.pi-check]="d.ssl" [class.pi-minus]="!d.ssl"></i>{{ d.ssl ? 'Con SSL' : 'Sin SSL' }}
              </span>

              <span class="dm-opc dm-pill" [style.background]="estado(d).bg" [style.color]="estado(d).fg">
                <span class="w-1.5 h-1.5 rounded-full" [style.background]="estado(d).fg"></span>{{ estado(d).label }}
              </span>

              <div class="flex items-center justify-end gap-1">
                <a [routerLink]="[d.id, 'editar']" class="dm-btn" aria-label="Editar dominio" title="Editar"><i class="pi pi-pencil text-sm"></i></a>
                <button type="button" (click)="eliminar(d)" class="dm-btn peligro" aria-label="Eliminar dominio" title="Eliminar"><i class="pi pi-trash text-sm"></i></button>
              </div>
            </div>
          }
          <div class="px-5 py-3 text-xs text-gray-400" style="border-top:1px solid var(--border-soft);">
            {{ dominiosFiltrados().length }} de {{ dominios().length }} dominio(s)
          </div>
        }
      </section>

      @if (!cargando() && centrosSinDominio().length) {
        <section class="rounded-2xl border px-5 py-4" style="border-color:var(--info-border);background:var(--info-bg);">
          <p class="text-sm font-semibold" style="color:var(--info-text);">Centros activos que aún no tienen dirección registrada</p>
          <div class="flex flex-wrap gap-2 mt-2.5">
            @for (c of centrosSinDominio(); track c.id) {
              <a [routerLink]="['/tenants', c.id]" class="text-xs font-semibold px-2.5 py-1 rounded-full hover:underline"
                 style="background:var(--surface);color:var(--text-2);border:1px solid var(--border);">{{ c.nombre }}</a>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class DominioListComponent {
  private readonly confirmDlg     = inject(ConfirmService);
  private readonly dominioService = inject(DominioAdminService);
  private readonly tenantService  = inject(TenantAdminService);
  private readonly toast          = inject(AdminToastService);

  readonly cargando     = signal(true);
  readonly dominios     = signal<Dominio[]>([]);
  readonly tenants      = signal<Tenant[]>([]);
  readonly filtroTexto  = signal('');
  readonly filtroEstado = signal('');

  readonly estadoOptions: SSOption[] = [
    { value: '',          label: 'Todos los estados' },
    { value: 'activo',    label: 'Activo' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'inactivo',  label: 'Inactivo' },
  ];

  /** El servidor solo manda el id del centro de cada dominio: el nombre se toma de la lista de centros. */
  private readonly porId = computed(() => new Map(this.tenants().map(t => [t.id, t])));

  readonly conSSL     = computed(() => this.dominios().filter(d => d.ssl && d.estado === 'activo').length);
  readonly pendientes = computed(() => this.dominios().filter(d => d.estado === 'pendiente').length);
  readonly porcentajeSsl = computed(() => {
    const activos = this.dominios().filter(d => d.estado === 'activo').length;
    return activos ? Math.round((this.conSSL() / activos) * 100) : 0;
  });
  readonly centrosConDominio = computed(() => new Set(this.dominios().map(d => d.tenantId)).size);
  readonly centrosSinDominio = computed(() => {
    const con = new Set(this.dominios().map(d => d.tenantId));
    return this.tenants().filter(t => t.estado === 'activo' && !con.has(t.id));
  });

  readonly dominiosFiltrados = computed(() => {
    const txt = this.filtroTexto().toLowerCase().trim();
    return this.dominios().filter(d => {
      if (this.filtroEstado() && d.estado !== this.filtroEstado()) return false;
      if (!txt) return true;
      const c = this.centro(d);
      return d.subdominio.toLowerCase().includes(txt)
        || (c?.nombre ?? '').toLowerCase().includes(txt)
        || (c?.slug ?? '').toLowerCase().includes(txt);
    });
  });

  constructor() {
    this.tenantService.obtenerTodos().subscribe({ next: (t) => this.tenants.set(t) });
    this.dominioService.obtenerTodos().subscribe({
      next: (data) => { this.dominios.set(data); this.cargando.set(false); },
      error: (err) => { this.cargando.set(false); this.toast.httpError(err, 'No se pudieron cargar los dominios.'); },
    });
  }

  centro(d: Dominio): Tenant | undefined { return this.porId().get(d.tenantId); }

  estado(d: Dominio) { return ESTADO[d.estado] ?? ESTADO.inactivo; }

  async eliminar(dominio: Dominio): Promise<void> {
    const nombre = this.centro(dominio)?.nombre;
    const msg = `Se eliminará la dirección "${dominio.subdominio}"${nombre ? ` de ${nombre}` : ''}. Sus usuarios dejarán de poder entrar por ella.`;
    if (!(await this.confirmDlg.ask(msg, { header: 'Eliminar dominio', acceptLabel: 'Eliminar' }))) return;
    this.dominioService.eliminar(dominio.id).subscribe({
      next: () => { this.dominios.update(lista => lista.filter(d => d.id !== dominio.id)); this.toast.success('Dominio eliminado.'); },
      error: (err) => this.toast.httpError(err, 'No se pudo eliminar el dominio.'),
    });
  }
}
