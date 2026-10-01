import { Component, DestroyRef, ElementRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { AuditLogAdminService } from '../../core/services/admin/audit-log-admin.service';
import { AuditAccion, AuditLog } from '../../shared/models/admin/audit-log.model';

const BASE_KEY = 'admin_notif_base';
const LEIDAS_KEY = 'admin_notif_leidas';
const REFRESCO_MS = 2 * 60 * 1000;
const DIAS_ATRAS = 7;

const DESCARTADAS_KEY = 'admin_notif_descartadas';

/** Nombre, ícono y color de cada módulo que escribe en el registro de auditoría. */
const MODULOS: Record<string, { label: string; icono: keyof typeof ICONOS; color: string }> = {
  TENANTS:    { label: 'Centros',       icono: 'edificio', color: 'var(--accent-text)' },
  DOMINIOS:   { label: 'Dominios',      icono: 'globo',    color: 'var(--info-text)' },
  ROOT_USERS: { label: 'Usuarios root', icono: 'escudo',   color: 'var(--violet-text)' },
  AUTH:       { label: 'Acceso',        icono: 'llave',    color: 'var(--text-muted)' },
  CORREO:     { label: 'Correo',        icono: 'sobre',    color: 'var(--info-text)' },
};

/** Trazos estilo Heroicons outline, los mismos que usa la campana de la app. */
const ICONOS = {
  campana: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  mas: 'M12 4.5v15m7.5-7.5h-15',
  editar: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z',
  papelera: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  chevron: 'M8.25 4.5l7.5 7.5-7.5 7.5',
  tick: 'M4.5 12.75l6 6 9-13.5',
  equis: 'M6 18L18 6M6 6l12 12',
  edificio: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
  globo: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
  escudo: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  llave: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
  sobre: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  alerta: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
} as const;

const META: Record<string, { icono: keyof typeof ICONOS; label: string; bgUnread: string; dot: string; badgeBg: string; badgeText: string }> = {
  CREATE: { icono: 'mas',      label: 'Creación',     bgUnread: 'bg-green-50', dot: 'bg-green-500', badgeBg: 'bg-green-100', badgeText: 'text-green-700' },
  UPDATE: { icono: 'editar',   label: 'Modificación', bgUnread: 'bg-blue-50',  dot: 'bg-blue-500',  badgeBg: 'bg-blue-100',  badgeText: 'text-blue-700' },
  DELETE: { icono: 'papelera', label: 'Eliminación',  bgUnread: 'bg-red-50',   dot: 'bg-red-500',   badgeBg: 'bg-red-100',   badgeText: 'text-red-700' },
};
const META_OTRO = { icono: 'campana' as keyof typeof ICONOS, label: 'Actividad', bgUnread: 'bg-gray-100', dot: 'bg-gray-400', badgeBg: 'bg-gray-200', badgeText: 'text-gray-600' };

/**
 * Campana del panel de plataforma. Mismo aspecto que la de la app (panel amplio
 * con cabecera, filtros, tarjetas por tipo y pie), pero su contenido sale del
 * registro de auditoría: las últimas acciones de crear, modificar y eliminar
 * de los últimos 7 días. Qué está leído se guarda en el navegador.
 */
@Component({
  selector: 'app-admin-campana',
  standalone: true,
  imports: [DatePipe],
  styles: [`.notif-scroll { scrollbar-width: none; -ms-overflow-style: none; } .notif-scroll::-webkit-scrollbar { display: none; }`],
  template: `
    <div class="relative">
      <div class="relative group inline-block">
        <button type="button" (click)="toggle($event)" aria-label="Notificaciones del sistema" [attr.aria-expanded]="abierto()"
          class="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors focus:outline-none">
          <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="i.campana" />
          </svg>
          @if (sinLeer() > 0) {
            <span class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-xs font-bold
                         flex items-center justify-center leading-none animate-pulse">
              {{ sinLeer() > 99 ? '99+' : sinLeer() }}
            </span>
          }
        </button>
        <span class="absolute top-full mt-2 -translate-x-1/2 z-[99999] whitespace-nowrap rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white shadow-lg
                     invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200">
          Notificaciones del sistema
        </span>
      </div>

      @if (abierto()) {
        <div class="hidden sm:block absolute right-3 top-[38px] w-3.5 h-3.5 bg-white/95 border-t border-l border-white/70 rotate-45 z-[199]"></div>

        <div class="fixed left-4 right-4 top-20 sm:absolute sm:left-auto sm:right-0 sm:top-11 w-auto sm:w-[480px]
                    bg-white/95 backdrop-blur-xl border border-white/70 ring-1 ring-black/5 rounded-2xl
                    shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25),0_8px_24px_-8px_rgba(15,23,42,0.15)]
                    z-[200] overflow-hidden flex flex-col" style="max-height: 680px;" (click)="$event.stopPropagation()">

          <div class="flex-shrink-0 flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style="background:var(--accent-soft);">
              <svg class="w-6 h-6" style="color:var(--accent-text);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" [attr.d]="i.campana" />
              </svg>
            </div>
            <div class="flex-1 min-w-0 flex items-center gap-2">
              <span class="font-bold text-gray-800 text-base">Centro de Notificaciones</span>
              @if (sinLeer() > 0) {
                <span class="text-xs font-bold min-w-[20px] h-5 px-1.5 rounded-full text-white flex items-center justify-center flex-shrink-0"
                      style="background:var(--accent-brand);">{{ sinLeer() > 99 ? '99+' : sinLeer() }}</span>
              }
            </div>
            <button type="button" aria-label="Cerrar" (click)="abierto.set(false)" class="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="i.equis" />
              </svg>
            </button>
          </div>

          @if (eventos().length) {
            <div class="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-gray-50">
              <label class="flex items-center gap-1.5 text-xs font-medium text-gray-500 cursor-pointer select-none">
                <input type="checkbox" [checked]="soloNoLeidas()" (change)="soloNoLeidas.set(!soloNoLeidas())" class="w-3.5 h-3.5 rounded" />
                Solo no leídas
              </label>
              @if (sinLeer() > 0) {
                <button type="button" (click)="leerTodas()" class="text-xs hover:underline font-semibold" style="color:var(--accent-text);">
                  Marcar todas como leídas
                </button>
              }
            </div>

            <div class="flex-shrink-0 px-5 py-2.5 border-b border-gray-50">
              <div class="flex flex-wrap items-center gap-1 p-1 bg-gray-100 rounded-xl">
                <button type="button" (click)="filtro.set('')"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  [class.bg-white]="filtro() === ''" [class.shadow-sm]="filtro() === ''"
                  [class.text-gray-800]="filtro() === ''" [class.text-gray-500]="filtro() !== ''">
                  Todas ({{ eventos().length }})
                </button>
                @for (m of modulosPresentes(); track m.id) {
                  <button type="button" (click)="filtro.set(filtro() === m.id ? '' : m.id)"
                    class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    [class.bg-white]="filtro() === m.id" [class.shadow-sm]="filtro() === m.id"
                    [class.text-gray-800]="filtro() === m.id" [class.text-gray-500]="filtro() !== m.id">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="i[m.icono]" />
                    </svg>
                    {{ m.label }} ({{ m.total }})
                  </button>
                }
              </div>
            </div>
          }

          <div class="notif-scroll overflow-y-auto bg-gray-50/60 p-3 space-y-2.5 flex-1 min-h-0">
            @if (cargando() && !eventos().length) {
              <div class="flex justify-center py-12">
                <div class="w-5 h-5 border-2 rounded-full animate-spin" style="border-color:var(--accent-soft);border-top-color:var(--accent-brand);"></div>
              </div>
            } @else if (error() && !eventos().length) {
              <div class="text-center py-14">
                <svg class="w-10 h-10 mx-auto mb-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" [attr.d]="i.alerta" />
                </svg>
                <p class="text-sm font-semibold text-gray-700">No se pudieron cargar</p>
                <p class="text-xs text-gray-400 mt-1">Hubo un problema de conexión. Se reintentará automáticamente.</p>
              </div>
            } @else if (visibles().length === 0) {
              <div class="text-center py-14">
                <svg class="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" [attr.d]="i.campana" />
                </svg>
                <p class="text-sm font-semibold text-gray-700">Sin notificaciones</p>
                <p class="text-xs text-gray-400 mt-1">{{ filtro() || soloNoLeidas() ? 'No hay notificaciones con este filtro' : 'Todo al día por aquí' }}</p>
              </div>
            } @else {
              @for (n of visibles(); track n.id) {
                <div class="group relative rounded-xl border border-gray-100 px-4 py-3.5 transition-all duration-150"
                     [class]="esLeida(n) ? 'bg-white' : meta(n).bgUnread">
                  <div class="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    @if (!esLeida(n)) {
                      <button type="button" aria-label="Marcar como leída" title="Marcar como leída" (click)="leer(n); $event.stopPropagation()"
                        class="w-6 h-6 rounded-full flex items-center justify-center bg-white border border-gray-200 text-gray-400 hover:text-[#007832] hover:border-[#007832]/40 shadow-sm transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="i.tick" />
                        </svg>
                      </button>
                    }
                    <button type="button" aria-label="Descartar" title="Descartar" (click)="descartar(n); $event.stopPropagation()"
                      class="w-6 h-6 rounded-full flex items-center justify-center bg-white border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 shadow-sm transition-colors">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="i.equis" />
                      </svg>
                    </button>
                  </div>

                  <div class="flex items-start gap-3.5 pr-12">
                    <div class="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
                         [class]="esLeida(n) ? 'bg-gray-100' : meta(n).badgeBg">
                      <svg class="w-5 h-5" [class]="esLeida(n) ? 'text-gray-500' : meta(n).badgeText" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" [attr.d]="i[meta(n).icono]" />
                      </svg>
                    </div>
                    <div class="flex-1 min-w-0 cursor-pointer" (click)="leer(n)">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-xs font-bold uppercase tracking-wide" [style.color]="modulo(n).color">{{ modulo(n).label }}</span>
                        <span class="text-gray-300">·</span>
                        <span class="text-xs text-gray-400">{{ n.fecha | date:'d MMM, HH:mm' }}</span>
                      </div>
                      <div class="flex items-center gap-1.5 mt-1">
                        <p class="text-[15px] font-semibold text-gray-800 leading-snug flex-1 truncate">{{ titulo(n) }}</p>
                        @if (!esLeida(n)) { <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" [class]="meta(n).dot"></span> }
                      </div>
                      <p class="text-[13px] text-gray-500 mt-1 leading-relaxed">
                        {{ n.usuario }}@if (n.tenantSlug) { · {{ n.tenantSlug }} }
                      </p>
                      <span class="inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full" [class]="meta(n).badgeBg + ' ' + meta(n).badgeText">{{ meta(n).label }}</span>
                    </div>
                  </div>

                  @if (accion(n); as acc) {
                    <div class="mt-3 ml-[3.25rem]">
                      <button type="button" (click)="irA(n, acc.ruta); $event.stopPropagation()"
                        class="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                        {{ acc.label }}
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="i.chevron" />
                        </svg>
                      </button>
                    </div>
                  }
                </div>
              }
            }
          </div>

          <div class="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
            <p class="text-xs text-gray-400">{{ sinLeer() }} sin leer · {{ eventos().length }} en {{ dias }} días</p>
            <button type="button" (click)="irAuditoria()"
              class="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Ver auditoría
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="i.chevron" />
              </svg>
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminCampanaComponent implements OnInit {
  private readonly auditoria = inject(AuditLogAdminService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly i = ICONOS;
  readonly dias = DIAS_ATRAS;

  readonly abierto = signal(false);
  readonly cargando = signal(false);
  readonly error = signal(false);
  readonly soloNoLeidas = signal(false);
  readonly filtro = signal('');   // '' = todos los módulos
  readonly eventos = signal<AuditLog[]>([]);
  private readonly base = this.leerBase();
  private readonly leidas = signal<Set<string>>(this.leerLeidas());
  private readonly descartadas = signal<Set<string>>(this.leerLista(DESCARTADAS_KEY));

  readonly sinLeer = computed(() => this.eventos().filter(e => !this.esLeida(e)).length);

  readonly modulosPresentes = computed(() => {
    const cuenta = new Map<string, number>();
    for (const e of this.eventos()) cuenta.set(e.modulo, (cuenta.get(e.modulo) ?? 0) + 1);
    return [...cuenta].map(([id, total]) => ({ id, total, label: this.moduloDe(id).label, icono: this.moduloDe(id).icono }));
  });
  readonly visibles = computed(() =>
    this.eventos().filter(e => (!this.filtro() || e.modulo === this.filtro()) && (!this.soloNoLeidas() || !this.esLeida(e))));

  ngOnInit(): void {
    this.cargar();
    const t = setInterval(() => this.cargar(), REFRESCO_MS);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  meta(n: AuditLog) { return META[n.accion] ?? META_OTRO; }

  private moduloDe(id: string) { return MODULOS[id] ?? { label: id, icono: 'campana' as keyof typeof ICONOS, color: 'var(--text-muted)' }; }
  modulo(n: AuditLog) { return this.moduloDe(n.modulo); }

  /** A dónde lleva la tarjeta. Los ingresos no tienen pantalla a la que ir. */
  accion(n: AuditLog): { label: string; ruta: string } | null {
    switch (n.modulo) {
      case 'TENANTS':    return { label: n.tenantId ? 'Ver centro' : 'Ver centros', ruta: n.tenantId ? `/tenants/${n.tenantId}` : '/tenants' };
      case 'DOMINIOS':   return { label: 'Ver dominios', ruta: '/dominios' };
      case 'ROOT_USERS': return { label: 'Ver usuarios root', ruta: '/root-users' };
      case 'CORREO':     return { label: 'Ver configuración', ruta: '/settings' };
      default:           return null;
    }
  }

  irA(n: AuditLog, ruta: string): void {
    this.leer(n);
    this.abierto.set(false);
    void this.router.navigateByUrl(ruta);
  }

  descartar(n: AuditLog): void {
    const s = new Set(this.descartadas()).add(n.id);
    this.descartadas.set(s);
    this.guardarLista(DESCARTADAS_KEY, s);
    this.eventos.update(l => l.filter(e => e.id !== n.id));
  }

  titulo(n: AuditLog): string { return n.descripcion || `${this.meta(n).label} en ${n.modulo}`; }

  /** Lo de antes de la primera visita (y de las 24 h previas) cuenta como leído: no se presenta todo el historial como novedad. */
  esLeida(n: AuditLog): boolean {
    return this.leidas().has(n.id) || new Date(n.fecha).getTime() <= this.base;
  }

  toggle(ev: Event): void {
    ev.stopPropagation();
    const abrir = !this.abierto();
    this.abierto.set(abrir);
    if (abrir) this.cargar();
  }

  leer(n: AuditLog): void { this.guardarLeidas(new Set(this.leidas()).add(n.id)); }

  leerTodas(): void { this.guardarLeidas(new Set([...this.leidas(), ...this.eventos().map(e => e.id)])); }

  irAuditoria(): void {
    this.abierto.set(false);
    void this.router.navigateByUrl('/audit-log');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (this.abierto() && !this.host.nativeElement.contains(ev.target as Node)) this.abierto.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.abierto.set(false); }

  private cargar(): void {
    const desde = new Date(Date.now() - DIAS_ATRAS * 24 * 3600 * 1000).toISOString().slice(0, 10);
    this.cargando.set(true);
    this.auditoria.obtenerLogs({ desde, limite: 200 }).subscribe({
      next: (logs) => {
        this.eventos.set(
          logs.filter(l => (['CREATE', 'UPDATE', 'DELETE'] as AuditAccion[]).includes(l.accion) && !this.descartadas().has(l.id))
            .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
            .slice(0, 40),
        );
        this.error.set(false);
        this.cargando.set(false);
      },
      error: () => { this.error.set(true); this.cargando.set(false); },
    });
  }

  private leerLista(clave: string): Set<string> {
    try { return new Set<string>(JSON.parse(localStorage.getItem(clave) ?? '[]')); } catch { return new Set(); }
  }

  private guardarLista(clave: string, s: Set<string>): void {
    try { localStorage.setItem(clave, JSON.stringify([...s].slice(-300))); } catch { /* sin almacenamiento */ }
  }

  private guardarLeidas(s: Set<string>): void {
    // Solo se recuerdan las últimas 300 para que el almacenamiento no crezca sin fin.
    const lista = [...s].slice(-300);
    this.leidas.set(new Set(lista));
    try { localStorage.setItem(LEIDAS_KEY, JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
  }

  private leerLeidas(): Set<string> {
    try { return new Set<string>(JSON.parse(localStorage.getItem(LEIDAS_KEY) ?? '[]')); } catch { return new Set(); }
  }

  private leerBase(): number {
    try {
      const g = localStorage.getItem(BASE_KEY);
      if (g) return Number(g) || 0;
      localStorage.setItem(BASE_KEY, String(Date.now() - 86400000));
    } catch { /* sin almacenamiento */ }
    return Date.now() - 86400000;
  }
}
