import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UIChart } from 'primeng/chart';
import { TenantAdminService } from '../../../core/services/admin/tenant-admin.service';
import { DominioAdminService } from '../../../core/services/admin/dominio-admin.service';
import { AuditLogAdminService } from '../../../core/services/admin/audit-log-admin.service';
import { TenantSaludService } from '../../../core/services/admin/tenant-salud.service';
import { Tenant } from '../../../shared/models/admin/tenant.model';
import { Dominio } from '../../../shared/models/admin/dominio.model';
import { AuditLog, ACCION_ETIQUETA } from '../../../shared/models/admin/audit-log.model';
import { AdminConexionComponent } from '../../../shared/components/admin/conexion.component';
import { AdminBadgeEstadoComponent } from '../../../shared/components/admin/badge-estado.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';

type Orden = 'estado' | 'nombre' | 'gestion';
type Gravedad = 'error' | 'aviso';

interface Alerta {
  gravedad: Gravedad;
  titulo: string;
  detalle: string;
  enlace: string;
  accion: string;
}

const DIA = 86400000;
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const CIRCUNFERENCIA = 552.92;   // 2·π·88, el radio del aro

/** Ícono y colores de cada tipo de acción en la línea de tiempo (tokens: sirven en claro y oscuro). */
const ACCION_VISUAL: Record<string, { icono: string; bg: string; fg: string }> = {
  CREATE: { icono: 'pi-plus',     bg: 'var(--ok-bg)',     fg: 'var(--ok-text)' },
  UPDATE: { icono: 'pi-pencil',   bg: 'var(--info-bg)',   fg: 'var(--info-text)' },
  DELETE: { icono: 'pi-trash',    bg: 'var(--err-bg)',    fg: 'var(--err-text)' },
  LOGIN:  { icono: 'pi-sign-in',  bg: 'var(--violet-bg)', fg: 'var(--violet-text)' },
  LOGOUT: { icono: 'pi-sign-out', bg: 'var(--surface3)',  fg: 'var(--text-muted)' },
};

/**
 * Resumen general del panel de plataforma. Reutiliza las tarjetas, el panel de gráfica y el aro
 * del inicio de un centro (comparte su hoja de estilos) con datos del panel: centros, dominios,
 * comprobaciones de conexión y el registro de auditoría de los últimos 7 días.
 */
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [LoadingSkeletonComponent, RouterLink, DatePipe, AdminConexionComponent, AdminBadgeEstadoComponent, UIChart],
  styleUrl: '../../dashboard/home.component.css',
  styles: [`
    .rg-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; }
    .rg-sub { font-size: 13px; color: var(--text-muted); margin: 6px 0 0; }
    .rg-sub b { color: var(--text-2); font-weight: 600; text-transform: capitalize; }
    .rg-acciones { display: flex; flex-wrap: wrap; gap: 8px; }
    .rg-btn {
      display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px;
      border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s, opacity .15s;
      border: 1px solid var(--border); background: var(--surface); color: var(--text-2);
    }
    .rg-btn:hover:not(:disabled) { background: var(--surface2); }
    .rg-btn:disabled { opacity: .5; cursor: not-allowed; }
    .rg-btn-primario { background: var(--accent-brand); border-color: transparent; color: #fff; }
    .rg-btn-primario:hover:not(:disabled) { background: var(--accent-brand); opacity: .9; }

    .rg-estado {
      display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 14px;
      border: 1px solid var(--ok-border); background: var(--ok-bg); color: var(--ok-text); font-size: 13px;
    }
    .rg-estado i { font-size: 18px; }
    .rg-estado span { color: var(--text-2); }
    .rg-alertas { border: 1px solid var(--warn-border); background: var(--warn-bg); border-radius: 16px; overflow: hidden; }
    .rg-alertas-titulo { display: flex; align-items: center; gap: 8px; padding: 12px 16px; font-size: 14px; font-weight: 700; color: var(--warn-text); }
    .rg-alerta {
      display: flex; align-items: center; gap: 12px; padding: 12px 16px;
      background: color-mix(in srgb, var(--surface) 70%, transparent); border-top: 1px solid var(--warn-border);
    }
    .rg-alerta-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; }
    .rg-alerta a { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--accent-text); white-space: nowrap; }

    .rg-track { height: 8px; border-radius: 99px; background: var(--surface3); overflow: hidden; display: flex; margin-top: auto; }
    .rg-track > div { height: 100%; transition: width .4s; }

    .rg-bajo { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 18px; align-items: start; }
    .rg-panel {
      background: var(--surface); border: 1px solid var(--border-soft); border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,.05); overflow: hidden;
    }
    .rg-panel-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px 14px; }
    .rg-buscar {
      height: 34px; width: 180px; padding: 0 12px 0 32px; border-radius: 10px; font-size: 13px; outline: none;
      border: 1px solid var(--border); background: var(--surface2); color: var(--text);
    }
    .rg-buscar:focus { border-color: var(--accent-brand); }
    .rg-seg { display: inline-flex; padding: 3px; border-radius: 10px; background: var(--surface3); }
    .rg-seg button { font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 8px; color: var(--text-muted); }
    .rg-seg button.activo { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px var(--shadow-color, rgba(0,0,0,.1)); }
    .rg-lista { max-height: 430px; overflow-y: auto; }
    .rg-fila {
      display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 14px;
      padding: 11px 20px; border-top: 1px solid var(--border-soft); transition: background .15s;
    }
    .rg-fila:hover { background: var(--surface2); }
    .rg-avatar {
      width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0;
      font-size: 13px; font-weight: 700; background: var(--accent-soft); color: var(--accent-text);
    }
    .rg-avatar.apagado { background: var(--surface3); color: var(--text-muted); }

    .rg-tl { list-style: none; margin: 0; padding: 4px 20px 16px; }
    .rg-tl li { position: relative; display: flex; gap: 12px; padding: 10px 0; }
    .rg-tl li:not(:last-child)::before {
      content: ''; position: absolute; left: 15px; top: 42px; bottom: -2px; width: 2px; background: var(--border-soft);
    }
    .rg-tl-ic { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; font-size: 12px; }
    .rg-vacio { padding: 36px 20px; text-align: center; font-size: 13px; color: var(--text-faint); }

    @media (max-width: 1100px) { .rg-bajo { grid-template-columns: 1fr; } }
    @media (max-width: 640px) {
      .rg-fila { grid-template-columns: minmax(0, 1fr) auto; }
      .rg-fila .rg-col-gestion { display: none; }
      .rg-buscar { width: 100%; }
    }
  `],
  template: `
    <div class="dashboard">

      <!-- Encabezado -->
      <header class="rg-head">
        <div>
          <h1 class="dash-title">Resumen general</h1>
          <p class="rg-sub"><b>{{ hoyTexto }}</b> · cómo están los centros y qué se ha hecho en este panel</p>
        </div>
        <div class="rg-acciones">
          <button type="button" class="rg-btn" (click)="verificarTodos()" [disabled]="!tenantsActivos().length || verificando()"
            title="Comprueba que la base de datos de cada centro activo responde">
            <i class="pi" [class.pi-refresh]="!verificando()" [class.pi-spin]="verificando()" [class.pi-spinner]="verificando()"></i>
            {{ verificando() ? 'Comprobando…' : 'Comprobar conexión' }}
          </button>
          <a routerLink="/tenants" [queryParams]="{ nuevo: 1 }" class="rg-btn rg-btn-primario">
            <i class="pi pi-plus"></i> Nuevo centro
          </a>
        </div>
      </header>

      @if (cargando()) {
        <app-loading-skeleton variant="cards" label="Cargando información" />
      } @else {

        <!-- Estado: una línea si todo está bien; lista solo si hay algo que atender -->
        @if (alertas().length) {
          <section class="rg-alertas" aria-labelledby="rg-atencion">
            <h2 id="rg-atencion" class="rg-alertas-titulo">
              <i class="pi pi-exclamation-triangle"></i> Necesita tu atención ({{ alertas().length }})
            </h2>
            @for (a of alertas(); track a.titulo) {
              <div class="rg-alerta">
                <span class="rg-alerta-ic"
                      [style.background]="a.gravedad === 'error' ? 'var(--err-bg)' : 'var(--warn-bg)'"
                      [style.color]="a.gravedad === 'error' ? 'var(--err-text)' : 'var(--warn-text)'">
                  <i class="pi" [class.pi-server]="a.gravedad === 'error'" [class.pi-globe]="a.gravedad === 'aviso'"></i>
                </span>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-gray-800">{{ a.titulo }}</p>
                  <p class="text-xs text-gray-500 mt-0.5 truncate">{{ a.detalle }}</p>
                </div>
                <a [routerLink]="a.enlace">{{ a.accion }} →</a>
              </div>
            }
          </section>
        } @else {
          <div class="rg-estado" role="status">
            <i class="pi pi-check-circle"></i>
            <strong>Todo en orden.</strong>
            <span>
              @if (ultimaComprobacion(); as f) { Bases comprobadas a las {{ f | date: 'HH:mm' }}. }
              @else { Aún no se ha comprobado la conexión de las bases hoy. }
            </span>
          </div>
        }

        <!-- Tarjetas -->
        <div class="kpi-grid">

          <div class="kpi-card">
            <div class="kpi-head">
              <div class="kpi-icon-box box-green"><i class="pi pi-building"></i></div>
              <span class="kpi-badge badge-green">{{ creadosSemana() ? '+' + creadosSemana() + ' esta semana' : 'Registrados' }}</span>
            </div>
            <p class="kpi-label">Centros de formación</p>
            <h3 class="kpi-num">{{ tenants().length }}</h3>
            <div class="kpi-ctx">
              <span style="color:var(--ok-text);font-weight:700;">{{ tenantsActivos().length }} activos</span>
              <span>·</span>
              <span>{{ totalInactivos() }} inactivos</span>
            </div>
            <div class="rg-track" [attr.aria-label]="porcentajeActivos() + '% de los centros están activos'" role="img">
              <div [style.width.%]="porcentajeActivos()" style="background:var(--accent-brand);"></div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-head">
              <div class="kpi-icon-box box-blue"><i class="pi pi-server"></i></div>
              <span class="kpi-badge badge-blue">{{ porcentajeConexion() === null ? 'Sin revisar' : 'Revisado' }}</span>
            </div>
            <p class="kpi-label">Bases que responden</p>
            <h3 class="kpi-num">
              @if (porcentajeConexion() === null) { — } @else { {{ basesOk() }}<span class="text-lg font-semibold text-gray-400"> / {{ basesRevisadas() }}</span> }
            </h3>
            <div class="kpi-ctx kpi-ctx-blue">
              <i class="pi pi-info-circle"></i>
              <span>{{ porcentajeConexion() === null ? 'Pulsa "Comprobar conexión"' : 'de los centros activos revisados' }}</span>
            </div>
            <div class="rg-track">
              <div [style.width.%]="porcentajeConexion() ?? 0" style="background:#3b82f6;"></div>
              @if (basesFalla()) { <div [style.width.%]="100 - (porcentajeConexion() ?? 0)" style="background:var(--err-text);"></div> }
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-head">
              <div class="kpi-icon-box box-orange"><i class="pi pi-globe"></i></div>
              <span class="kpi-badge badge-orange">{{ dominiosPendientes() ? dominiosPendientes() + ' pendiente(s)' : 'Al día' }}</span>
            </div>
            <p class="kpi-label">Dominios</p>
            <h3 class="kpi-num">{{ dominios().length }}</h3>
            <div class="kpi-ctx kpi-ctx-orange">
              <i class="pi pi-lock"></i>
              <span>{{ porcentajeSsl() }}% de los activos con SSL</span>
            </div>
            <div class="rg-track">
              <div [style.width.%]="porcentajeSsl()" style="background:#f97316;"></div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-head">
              <div class="kpi-icon-box box-purple"><i class="pi pi-history"></i></div>
              <span class="kpi-badge badge-purple">{{ logsRecientes().length }} hoy</span>
            </div>
            <p class="kpi-label">Gestión esta semana</p>
            <h3 class="kpi-num">{{ logsSemana().length }}</h3>
            <div class="kpi-ctx kpi-ctx-purple">
              <i class="pi pi-user-edit"></i>
              <span>acciones hechas en este panel</span>
            </div>
            <div class="sparkline" aria-hidden="true">
              @for (d of serie().dias; track d.clave) {
                <div class="s-bar" [class.s-purple]="!d.hoy" [class.s-purple-solid]="d.hoy" [style.height.%]="altura(d.total, serie().max)" [title]="d.total + ' · ' + d.etiqueta"></div>
              }
            </div>
          </div>
        </div>

        <!-- Gráfica + aro -->
        <div class="charts-area">
          <div class="chart-panel">
            <div class="chart-panel-header">
              <div>
                <h4 class="chart-panel-title">Gestión por día</h4>
                <p class="chart-panel-sub">Acciones hechas desde este panel en los últimos 7 días. No mide el uso dentro de cada centro.</p>
              </div>
              <div class="chart-chips">
                <span class="chip chip-green">● Creaciones</span>
                <span class="chip chip-blue">● Modificaciones</span>
                <span class="chip chip-orange">● Eliminaciones</span>
              </div>
            </div>
            <div class="bar-chart-wrap">
              @if (logsSemana().length) {
                <p-chart type="bar" [data]="datosGrafica()" [options]="opcionesGrafica" width="100%" height="240px" />
              } @else {
                <div class="rg-vacio" style="height:240px;display:grid;place-items:center;">Sin acciones registradas esta semana.</div>
              }
            </div>
          </div>

          <div class="target-panel">
            <div class="target-header">
              <h4 class="target-title">Salud de la plataforma</h4>
              <p class="target-sub">Centros activos sobre el total</p>
            </div>

            <div class="circular-wrap">
              <svg class="circle-svg" viewBox="0 0 200 200" aria-hidden="true">
                <circle cx="100" cy="100" r="88" fill="none" style="stroke: var(--border)" stroke-width="12"/>
                <circle cx="100" cy="100" r="88" fill="none" style="stroke: var(--accent-brand)" stroke-width="12"
                        stroke-linecap="round" [attr.stroke-dasharray]="circunferencia"
                        [attr.stroke-dashoffset]="circunferencia * (1 - porcentajeActivos() / 100)"
                        transform="rotate(-90 100 100)"/>
              </svg>
              <div class="circle-center">
                <span class="circle-pct">{{ porcentajeActivos() }}%</span>
                <span class="circle-label">Activos</span>
              </div>
            </div>

            <div class="target-bars">
              <div class="t-bar-row">
                <div class="t-bar-info">
                  <span class="t-dot dot-green"></span>
                  <span class="t-label">Centros activos</span>
                  <span class="t-val">{{ porcentajeActivos() }}%</span>
                </div>
                <div class="t-track"><div class="t-fill fill-green" [style.width.%]="porcentajeActivos()"></div></div>
              </div>
              <div class="t-bar-row">
                <div class="t-bar-info">
                  <span class="t-dot dot-blue"></span>
                  <span class="t-label">Bases que responden</span>
                  <span class="t-val">{{ porcentajeConexion() === null ? 'Sin revisar' : porcentajeConexion() + '%' }}</span>
                </div>
                <div class="t-track"><div class="t-fill fill-blue" [style.width.%]="porcentajeConexion() ?? 0"></div></div>
              </div>
              <div class="t-bar-row">
                <div class="t-bar-info">
                  <span class="t-dot dot-orange"></span>
                  <span class="t-label">Dominios con SSL</span>
                  <span class="t-val">{{ porcentajeSsl() }}%</span>
                </div>
                <div class="t-track"><div class="t-fill fill-orange" [style.width.%]="porcentajeSsl()"></div></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Centros + actividad -->
        <div class="rg-bajo">

          <section class="rg-panel" aria-labelledby="rg-centros">
            <div class="rg-panel-head">
              <div>
                <h2 id="rg-centros" class="chart-panel-title">Centros</h2>
                <p class="chart-panel-sub">{{ centrosVisibles().length }} de {{ tenants().length }} · estado y conexión de cada uno</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <div class="relative">
                  <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400"></i>
                  <input type="search" class="rg-buscar" placeholder="Buscar centro" aria-label="Buscar centro"
                    [value]="busqueda()" (input)="busqueda.set($any($event.target).value)" />
                </div>
                <div class="rg-seg" role="radiogroup" aria-label="Ordenar centros">
                  @for (o of ordenes; track o.id) {
                    <button type="button" role="radio" [attr.aria-checked]="orden() === o.id" [class.activo]="orden() === o.id" (click)="orden.set(o.id)">{{ o.label }}</button>
                  }
                </div>
              </div>
            </div>

            @if (!tenants().length) {
              <div class="rg-vacio">
                Aún no hay centros registrados.
                <a routerLink="/tenants" [queryParams]="{ nuevo: 1 }" class="font-semibold hover:underline" style="color:var(--accent-text);">Crear el primero</a>
              </div>
            } @else if (!centrosVisibles().length) {
              <div class="rg-vacio">Ningún centro coincide con "{{ busqueda() }}".</div>
            } @else {
              <div class="rg-lista pretty-scroll">
                @for (t of centrosVisibles(); track t.id) {
                  <div class="rg-fila">
                    <a [routerLink]="['/tenants', t.id]" class="flex items-center gap-3 min-w-0 group">
                      <span class="rg-avatar" [class.apagado]="t.estado === 'inactivo'">{{ iniciales(t.nombre) }}</span>
                      <span class="min-w-0">
                        <span class="block text-sm font-semibold text-gray-800 truncate group-hover:underline" style="text-underline-offset:3px;">{{ t.nombre }}</span>
                        <span class="block text-xs text-gray-400 truncate">
                          {{ t.slug }}
                          <span class="rg-col-gestion">
                            · @if (ultimaActividad()[t.id]; as f) { gestionado {{ hace(f) }} } @else { sin gestión esta semana }
                          </span>
                        </span>
                      </span>
                    </a>
                    <app-admin-conexion class="rg-col-gestion" [estado]="salud.estado(t.id)" [inactivo]="t.estado === 'inactivo'" />
                    <app-admin-badge-estado [estado]="t.estado" />
                  </div>
                }
              </div>
            }
          </section>

          <section class="rg-panel" aria-labelledby="rg-actividad">
            <div class="rg-panel-head">
              <div>
                <h2 id="rg-actividad" class="chart-panel-title">Actividad reciente</h2>
                <p class="chart-panel-sub">Lo último hecho desde este panel</p>
              </div>
              <a routerLink="/audit-log" class="text-xs font-semibold hover:underline" style="color:var(--accent-text);">Ver auditoría →</a>
            </div>
            @if (!ultimosLogs().length) {
              <div class="rg-vacio">Sin actividad registrada en los últimos 7 días.</div>
            } @else {
              <ol class="rg-tl">
                @for (log of ultimosLogs(); track log.id) {
                  <li>
                    <span class="rg-tl-ic" [style.background]="visual(log).bg" [style.color]="visual(log).fg" [title]="etiqueta[log.accion]">
                      <i class="pi" [class]="visual(log).icono"></i>
                    </span>
                    <div class="min-w-0 pt-0.5">
                      <p class="text-sm font-medium text-gray-800 leading-snug">{{ log.descripcion ?? (etiqueta[log.accion] + ' en ' + log.modulo) }}</p>
                      <p class="text-xs text-gray-400 mt-0.5 truncate">
                        {{ log.usuario }} · <span [title]="log.fecha | date: 'medium'">{{ hace(log.fecha) }}</span>
                      </p>
                    </div>
                  </li>
                }
              </ol>
            }
          </section>
        </div>
      }
    </div>
  `,
})
export class AdminDashboardComponent {
  private readonly tenantService   = inject(TenantAdminService);
  private readonly dominioService  = inject(DominioAdminService);
  private readonly auditLogService = inject(AuditLogAdminService);
  readonly salud = inject(TenantSaludService);

  readonly circunferencia = CIRCUNFERENCIA;
  readonly etiqueta       = ACCION_ETIQUETA;
  readonly hoyTexto = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  readonly ordenes: { id: Orden; label: string }[] = [
    { id: 'estado', label: 'Estado' },
    { id: 'nombre', label: 'Nombre' },
    { id: 'gestion', label: 'Recientes' },
  ];

  readonly cargando   = signal(true);
  readonly orden      = signal<Orden>('estado');
  readonly busqueda   = signal('');
  readonly tenants    = signal<Tenant[]>([]);
  readonly dominios   = signal<Dominio[]>([]);
  readonly logsSemana = signal<AuditLog[]>([]);

  readonly logsRecientes  = computed(() => this.logsSemana().filter(l => new Date(l.fecha).getTime() >= Date.now() - DIA));
  readonly tenantsActivos = computed(() => this.tenants().filter((t) => t.estado === 'activo'));
  readonly totalInactivos = computed(() => this.tenants().length - this.tenantsActivos().length);
  readonly ultimosLogs    = computed(() => [...this.logsSemana()].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8));
  readonly dominiosPendientes = computed(() => this.dominios().filter(d => d.estado === 'pendiente').length);

  readonly porcentajeActivos = computed(() => {
    const n = this.tenants().length;
    return n ? Math.round((this.tenantsActivos().length / n) * 100) : 0;
  });

  readonly porcentajeSsl = computed(() => {
    const activos = this.dominios().filter(d => d.estado === 'activo');
    return activos.length ? Math.round((activos.filter(d => d.ssl).length / activos.length) * 100) : 0;
  });

  readonly verificando = computed(() => Object.values(this.salud.estados()).includes('verificando'));
  private readonly revisados = computed(() => {
    const e = this.salud.estados();
    return this.tenantsActivos().filter(t => e[t.id] === 'ok' || e[t.id] === 'falla');
  });
  readonly basesRevisadas = computed(() => this.revisados().length);
  readonly basesOk = computed(() => this.revisados().filter(t => this.salud.estados()[t.id] === 'ok').length);
  readonly basesFalla = computed(() => this.basesRevisadas() - this.basesOk());
  /** `null` mientras no se ha comprobado ningún centro activo. */
  readonly porcentajeConexion = computed(() =>
    this.basesRevisadas() ? Math.round((this.basesOk() / this.basesRevisadas()) * 100) : null);

  readonly ultimaComprobacion = computed(() => {
    const tiempos = Object.values(this.salud.ultimaRevision());
    return tiempos.length ? new Date(Math.max(...tiempos)) : null;
  });

  readonly creadosSemana = computed(() => this.serie().dias.reduce((s, d) => s + d.centros, 0));

  /** Fecha de la última acción registrada de cada centro en los últimos 7 días. */
  readonly ultimaActividad = computed(() => {
    const m: Record<string, string> = {};
    for (const l of this.logsSemana()) {
      if (l.tenantId && (!m[l.tenantId] || l.fecha > m[l.tenantId])) m[l.tenantId] = l.fecha;
    }
    return m;
  });

  readonly centrosVisibles = computed(() => {
    const ult = this.ultimaActividad();
    const q = this.busqueda().trim().toLowerCase();
    const lista = this.tenants().filter(t => !q || t.nombre.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
    switch (this.orden()) {
      case 'nombre':
        return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      case 'gestion':
        return lista.sort((a, b) => (ult[b.id] ?? '').localeCompare(ult[a.id] ?? '') || a.nombre.localeCompare(b.nombre));
      default:
        return lista.sort((a, b) => (a.estado === b.estado ? a.nombre.localeCompare(b.nombre) : a.estado === 'activo' ? -1 : 1));
    }
  });

  /** Acciones por día de la última semana, separadas por tipo. */
  readonly serie = computed(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dias = Array.from({ length: 7 }, (_, i) => {
      const f = new Date(hoy.getTime() - (6 - i) * DIA);
      return {
        f, clave: f.toISOString().slice(0, 10), hoy: i === 6,
        etiqueta: i === 6 ? 'Hoy' : `${DIAS_SEMANA[f.getDay()]} ${f.getDate()}`,
        total: 0, crear: 0, editar: 0, borrar: 0, centros: 0,
      };
    });
    for (const l of this.logsSemana()) {
      const f = new Date(l.fecha); f.setHours(0, 0, 0, 0);
      const d = dias.find(x => x.f.getTime() === f.getTime());
      if (!d) continue;
      d.total++;
      if (l.accion === 'CREATE') d.crear++;
      if (l.accion === 'UPDATE') d.editar++;
      if (l.accion === 'DELETE') d.borrar++;
      if (l.accion === 'CREATE' && l.modulo === 'TENANTS') d.centros++;
    }
    return { dias, max: Math.max(1, ...dias.map(d => d.total)) };
  });

  altura(valor: number, max: number): number { return Math.max(8, Math.round((valor / max) * 100)); }

  visual(l: AuditLog) { return ACCION_VISUAL[l.accion] ?? ACCION_VISUAL['LOGOUT']; }

  iniciales(nombre: string): string {
    const p = nombre.trim().split(/\s+/).filter(x => !/^(de|del|la|el|y)$/i.test(x));
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? p[0]?.[1] ?? '')).toUpperCase();
  }

  hace(fecha: string): string {
    const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ayer' : `hace ${d} días`;
  }

  /** Chart.js pinta en canvas y no entiende var(): se lee el token ya resuelto. */
  private color(nombre: string, respaldo: string): string {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : respaldo;
  }

  /** La misma fuente de la app (si no, Chart.js cae a una con serifa). */
  private readonly fuente = getComputedStyle(document.body).fontFamily || 'sans-serif';

  readonly datosGrafica = computed(() => {
    const s = this.serie();
    const barra = (label: string, datos: number[], color: string) => ({
      label, data: datos, backgroundColor: color, borderRadius: 6, borderSkipped: false, maxBarThickness: 38,
    });
    return {
      labels: s.dias.map(d => d.etiqueta),
      datasets: [
        barra('Creaciones', s.dias.map(d => d.crear), this.color('--accent-brand', '#39A900')),
        barra('Modificaciones', s.dias.map(d => d.editar), '#3b82f6'),
        barra('Eliminaciones', s.dias.map(d => d.borrar), '#f97316'),
      ],
    };
  });

  readonly opcionesGrafica = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        titleFont: { family: this.fuente }, bodyFont: { family: this.fuente },
        filter: (item: { raw: unknown }) => Number(item.raw) > 0,
      },
    },
    scales: {
      x: {
        stacked: true, grid: { display: false }, border: { display: false },
        ticks: { font: { size: 12, family: this.fuente }, color: '#94a3b8' },
      },
      y: {
        stacked: true, beginAtZero: true, grace: '10%',
        grid: { color: 'rgba(148, 163, 184, .18)' }, border: { display: false },
        ticks: { stepSize: 1, precision: 0, font: { size: 12, family: this.fuente }, color: '#94a3b8' },
      },
    },
  };

  readonly alertas = computed<Alerta[]>(() => {
    const a: Alerta[] = [];
    const estados = this.salud.estados();
    const sinConexion = this.tenants().filter(t => estados[t.id] === 'falla');
    if (sinConexion.length) {
      a.push({
        gravedad: 'error',
        titulo: `${sinConexion.length} centro(s) con la base de datos sin respuesta`,
        detalle: sinConexion.map(t => t.nombre).join(', '),
        enlace: '/tenants', accion: 'Revisar',
      });
    }
    const pendientes = this.dominios().filter(d => d.estado === 'pendiente');
    if (pendientes.length) {
      a.push({
        gravedad: 'aviso',
        titulo: `${pendientes.length} dominio(s) pendiente(s) de activar`,
        detalle: pendientes.map(d => d.subdominio).join(', '),
        enlace: '/dominios', accion: 'Ver dominios',
      });
    }
    const sinSsl = this.dominios().filter(d => d.estado === 'activo' && !d.ssl);
    if (sinSsl.length) {
      a.push({
        gravedad: 'aviso',
        titulo: `${sinSsl.length} dominio(s) activo(s) sin certificado SSL`,
        detalle: `${sinSsl.map(d => d.subdominio).join(', ')}. Sin SSL el navegador avisa que la conexión no es segura.`,
        enlace: '/dominios', accion: 'Ver dominios',
      });
    }
    return a;
  });

  constructor() { this.cargarDatos(); }

  private cargarDatos(): void {
    const desde = new Date(Date.now() - 7 * DIA).toISOString();
    this.dominioService.obtenerTodos().subscribe({ next: (d) => this.dominios.set(d) });
    this.tenantService.obtenerTodos().subscribe({
      next: (tenants) => {
        this.tenants.set(tenants);
        this.auditLogService.obtenerLogs({ desde, limite: 500 }).subscribe({
          next: (logs) => { this.logsSemana.set(logs); this.cargando.set(false); },
          error: () => this.cargando.set(false),
        });
      },
      error: () => this.cargando.set(false),
    });
  }

  verificarTodos(): void {
    this.salud.verificar(this.tenantsActivos().map((t) => t.id));
  }
}
