// ─────────────────────────────────────────────────────────────────────────────
// notificaciones-campana.component.ts  (v2 – notificaciones por rol)
//
// Campana en el navbar que muestra SOLO las notificaciones del usuario
// autenticado. El backend filtra por sesión/cookie, por lo que cada
// usuario ve únicamente sus propias notificaciones.
//
// Íconos y colores varían según el tipo:
//   bitacora_subida      → azul   📄
//   bitacora_aprobada    → verde  ✅
//   bitacora_rechazada   → rojo   ❌
//   formato_nuevo        → verde  📂
//   formato_actualizado  → naranja ✏️
//   formato_eliminado    → gris   🗑️
// ─────────────────────────────────────────────────────────────────────────────
import {
  Component, Input, OnInit, OnDestroy,
  signal, computed, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService }   from '../../core/services/api.service';
import { AuthService }  from '../../core/services/auth.service';
import { MaterialesApiService } from '../../core/services/materiales/materiales-api.service';
import { NotificacionesRealtimeService } from '../../core/services/realtime/notificaciones-realtime.service';

// 'erp' → tabla `notificaciones` de backend-erp (id uuid, PATCH /notificaciones/:id/leer).
// 'materiales' → tabla `notificacion` de backend-epsas-horarios (id numérico,
// namespaceado acá como 'mat-<id>' para no chocar con los uuid del ERP,
// PATCH /api2/notificaciones/:id/marcar-leida). Ambas comparten estructura
// (tipo/titulo/mensaje/data) — ver notificacion.orm-entity.ts de Materiales.
export type OrigenNotificacion = 'erp' | 'materiales';

export interface Notificacion {
  id:        string;
  tipo:      string;
  titulo:    string;
  mensaje:   string;
  data:      Record<string, any> | null;
  leida:     boolean;
  createdAt: string;
  origen:    OrigenNotificacion;
}

interface TipoMeta {
  icon:      string;
  bgUnread:  string;   // clase bg cuando no leída
  dotColor:  string;   // clase color del dot
  badgeBg:   string;   // bg del badge de tipo
  badgeText: string;
  label:     string;
}

const TIPO_META: Record<string, TipoMeta> = {
  bitacora_subida: {
    icon: '📄', bgUnread: 'bg-blue-50', dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Bitácora subida',
  },
  bitacora_aprobada: {
    icon: '✅', bgUnread: 'bg-green-50', dotColor: 'bg-green-500',
    badgeBg: 'bg-green-100', badgeText: 'text-green-700', label: 'Aprobada',
  },
  bitacora_rechazada: {
    icon: '❌', bgUnread: 'bg-red-50', dotColor: 'bg-red-500',
    badgeBg: 'bg-red-100', badgeText: 'text-red-700', label: 'Rechazada',
  },
  formato_nuevo: {
    icon: '📂', bgUnread: 'bg-emerald-50', dotColor: 'bg-emerald-500',
    badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700', label: 'Nuevo formato',
  },
  formato_actualizado: {
    icon: '✏️', bgUnread: 'bg-orange-50', dotColor: 'bg-orange-500',
    badgeBg: 'bg-orange-100', badgeText: 'text-orange-700', label: 'Formato actualizado',
  },
  formato_eliminado: {
    icon: '🗑️', bgUnread: 'bg-gray-100', dotColor: 'bg-gray-400',
    badgeBg: 'bg-gray-200', badgeText: 'text-gray-600', label: 'Formato eliminado',
  },
  aprendices_habilitados: {
    icon: '👥', bgUnread: 'bg-purple-50', dotColor: 'bg-purple-500',
    badgeBg: 'bg-purple-100', badgeText: 'text-purple-700', label: 'Aprendices',
  },
  materiales_solicitud_creada: {
    icon: '📦', bgUnread: 'bg-blue-50', dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Nueva solicitud',
  },
  materiales_traslado_creado: {
    icon: '📦', bgUnread: 'bg-blue-50', dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Nuevo traslado',
  },
  materiales_traslado_aprobado: {
    icon: '✅', bgUnread: 'bg-green-50', dotColor: 'bg-green-500',
    badgeBg: 'bg-green-100', badgeText: 'text-green-700', label: 'Traslado aprobado',
  },
  materiales_traslado_rechazado: {
    icon: '❌', bgUnread: 'bg-red-50', dotColor: 'bg-red-500',
    badgeBg: 'bg-red-100', badgeText: 'text-red-700', label: 'Traslado rechazado',
  },
};

const DEFAULT_META: TipoMeta = {
  icon: '🔔', bgUnread: 'bg-[#007832]/5', dotColor: 'bg-[#007832]',
  badgeBg: 'bg-gray-100', badgeText: 'text-gray-600', label: 'Notificación',
};

function getMeta(tipo: string): TipoMeta {
  return TIPO_META[tipo] ?? DEFAULT_META;
}

@Component({
  selector:   'app-notificaciones-campana',
  standalone: true,
  imports:    [CommonModule],
  template: `
    <div class="relative">

      <!-- ── Botón campana ── -->
      <button
        (click)="toggleDropdown()"
        class="relative w-9 h-9 rounded-full flex items-center justify-center
               hover:bg-gray-100 transition-colors focus:outline-none"
        [title]="'Notificaciones (' + cargo + ')'">

        <!-- Icono campana -->
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0
               00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0
               .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>

        <!-- Badge contador -->
        @if (unread() > 0) {
          <span class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1
                       rounded-full bg-red-500 text-white text-[10px] font-bold
                       flex items-center justify-center leading-none animate-pulse">
            {{ unread() > 99 ? '99+' : unread() }}
          </span>
        }
      </button>

      <!-- ── Panel desplegable ──
           En mobile (<640px) el ancho fijo (380px) anclado a right-0 del ícono
           (pegado al borde derecho del navbar) se salía de la pantalla por la
           izquierda — se posiciona "fixed" con márgenes al viewport en vez de
           colgar del ícono; en sm: y superior vuelve al comportamiento original.
           left-4/right-4 (no "inset-x-4") y su contraparte sm:left-auto/sm:right-0
           a propósito: usar la utilidad combinada inset-x-* junto con right-0 en el
           mismo breakpoint hacía que ambas compitieran por la misma propiedad CSS
           ("right") y el panel quedaba mal posicionado en desktop.
           Sin "max-w-full": en desktop el contenedor de posicionamiento de
           "absolute" es el wrapper del ícono (~36px, ver el div .relative de
           arriba), así que max-width:100% lo colapsaba a ese ancho en vez de
           dejar que sm:w-[380px] mandara. -->
      @if (open()) {
        <div class="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-11 w-auto sm:w-[380px] bg-white rounded-2xl shadow-2xl border border-gray-100 z-[200] overflow-hidden"
             style="max-height: 560px;">

          <!-- Cabecera -->
          <div class="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div class="flex items-center gap-2">
              <span class="font-bold text-gray-800 text-sm">Notificaciones</span>
              <!-- Chip de rol -->
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                [class.bg-purple-100]="cargo === 'administrador'"
                [class.text-purple-700]="cargo === 'administrador'"
                [class.bg-blue-100]="cargo === 'instructor'"
                [class.text-blue-700]="cargo === 'instructor'"
                [class.bg-green-100]="cargo === 'aprendiz'"
                [class.text-green-700]="cargo === 'aprendiz'">
                {{ cargo }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              @if (unread() > 0) {
                <button (click)="leerTodas()"
                  class="text-xs text-[#007832] hover:underline font-medium">
                  Leer todas
                </button>
              }
              <button (click)="open.set(false)"
                class="text-gray-400 hover:text-gray-600 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Filtros de tipo (solo si hay notificaciones) -->
          @if (notificaciones().length > 0) {
            <div class="flex items-center gap-1.5 px-4 py-2 border-b border-gray-50
                        overflow-x-auto scrollbar-hide">
              <button (click)="filtroTipo.set('')"
                class="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                [class.bg-gray-800]="filtroTipo() === ''"
                [class.text-white]="filtroTipo() === ''"
                [class.bg-gray-100]="filtroTipo() !== ''"
                [class.text-gray-500]="filtroTipo() !== ''">
                Todas ({{ notificaciones().length }})
              </button>
              @for (tipo of tiposPresentes(); track tipo) {
                <button (click)="filtroTipo.set(filtroTipo() === tipo ? '' : tipo)"
                  class="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                  [class]="filtroTipo() === tipo
                    ? 'bg-gray-800 text-white'
                    : getMeta(tipo).badgeBg + ' ' + getMeta(tipo).badgeText">
                  {{ getMeta(tipo).icon }} {{ getMeta(tipo).label }}
                </button>
              }
            </div>
          }

          <!-- Lista -->
          <div class="overflow-y-auto" style="max-height: 440px;">
            @if (cargando()) {
              <div class="flex justify-center py-10">
                <div class="w-5 h-5 border-2 border-[#007832]/30 border-t-[#007832]
                            rounded-full animate-spin"></div>
              </div>
            } @else if (notificacionesFiltradas().length === 0) {
              <div class="text-center py-12">
                <div class="text-4xl mb-3">🔔</div>
                <p class="text-sm font-semibold text-gray-700">Sin notificaciones</p>
                <p class="text-xs text-gray-400 mt-1">
                  {{ filtroTipo() ? 'No hay notificaciones de este tipo' : 'Todo al día por aquí' }}
                </p>
              </div>
            } @else {
              @for (n of notificacionesFiltradas(); track n.id) {
                <div
                  class="px-4 py-3.5 border-b border-gray-50 cursor-pointer transition-all duration-150"
                  [ngClass]="[
                    !n.leida ? getMeta(n.tipo).bgUnread : 'bg-white',
                    'hover:brightness-95'
                  ]"
                  (click)="leer(n)">

                  <div class="flex items-start gap-3">

                    <!-- Ícono del tipo -->
                    <div class="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-base"
                      [ngClass]="!n.leida ? getMeta(n.tipo).badgeBg : 'bg-gray-100'">
                      {{ getMeta(n.tipo).icon }}
                    </div>

                    <div class="flex-1 min-w-0">
                      <!-- Título + dot no leído -->
                      <div class="flex items-center gap-1.5">
                        <p class="text-sm font-semibold text-gray-800 leading-tight flex-1 truncate">
                          {{ n.titulo }}
                        </p>
                        @if (!n.leida) {
                          <span class="w-2 h-2 rounded-full flex-shrink-0"
                            [ngClass]="getMeta(n.tipo).dotColor"></span>
                        }
                      </div>

                      <!-- Mensaje (clic expande/colapsa el texto completo) -->
                      <p class="text-xs text-gray-500 mt-0.5 leading-snug"
                        [class.line-clamp-2]="expandedId() !== n.id">
                        {{ n.mensaje }}
                      </p>

                      <!-- Lista de aprendices (tipo legacy aprendices_habilitados) -->
                      @if (n.tipo === 'aprendices_habilitados' && n.data?.['aprendices']?.length) {
                        <div class="mt-2 space-y-1 max-h-28 overflow-y-auto">
                          @for (a of n.data!['aprendices'].slice(0, 8); track a.cedula) {
                            <div class="flex items-center gap-1.5 text-xs text-gray-600">
                              <span class="w-1.5 h-1.5 rounded-full bg-[#39A900] flex-shrink-0"></span>
                              <span class="font-medium">{{ a.nombre }}</span>
                              <span class="text-gray-400">·</span>
                              <span class="text-[#007832] font-semibold">{{ a.avance }}%</span>
                            </div>
                          }
                          @if (n.data!['aprendices'].length > 8) {
                            <p class="text-xs text-gray-400 pl-3">
                              + {{ n.data!['aprendices'].length - 8 }} más…
                            </p>
                          }
                        </div>
                      }

                      <!-- Fecha -->
                      <p class="text-[10px] text-gray-400 mt-1.5">
                        {{ formatDate(n.createdAt) }}
                      </p>
                    </div>
                  </div>
                </div>
              }
            }
          </div>

          <!-- Footer -->
          @if (notificaciones().length > 0) {
            <div class="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-center">
              <p class="text-[11px] text-gray-400">
                {{ unread() }} sin leer · {{ notificaciones().length }} en total
              </p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class NotificacionesCampanaComponent implements OnInit, OnDestroy {

  /** Cargo del usuario actual (pasado desde el navbar) */
  @Input() cargo: string = '';

  notificaciones = signal<Notificacion[]>([]);
  cargando       = signal(false);
  open           = signal(false);
  filtroTipo     = signal('');
  expandedId     = signal<string | null>(null);

  unread = computed(() => this.notificaciones().filter(n => !n.leida).length);

  tiposPresentes = computed(() =>
    [...new Set(this.notificaciones().map(n => n.tipo))]
  );

  notificacionesFiltradas = computed(() => {
    const tipo = this.filtroTipo();
    const lista = this.notificaciones();
    return tipo ? lista.filter(n => n.tipo === tipo) : lista;
  });

  private pollingId?: ReturnType<typeof setInterval>;

  // Referencia guardada para des-registrar exactamente este handler en
  // ngOnDestroy sin cerrar el socket compartido (ver comentario en
  // NotificacionesRealtimeService.off).
  private onNotifNueva = (n: any) => {
    this.notificaciones.update((list) => [{ ...n, origen: 'erp' as const }, ...list.filter((x) => x.id !== n.id)]);
  };

  // El backend borra una notificación 5 min después de marcarla leída — este
  // handler la quita de la lista en vivo sin esperar al próximo polling.
  private onNotifEliminada = (payload: { id: string }) => {
    this.notificaciones.update((list) => list.filter((x) => x.id !== payload.id));
  };

  constructor(
    private api: ApiService,
    private materialesApi: MaterialesApiService,
    private auth: AuthService,
    private realtime: NotificacionesRealtimeService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    // Refresca cada 30 s (pausado si la pestaña está en segundo plano)
    this.pollingId = setInterval(() => {
      if (document.hidden) return;
      this.cargar();
    }, 30_000);

    // Empuje en vivo por WebSocket — el polling de abajo queda solo como
    // respaldo si el socket se cae (reconexión de red, etc).
    this.realtime.onNotificacionNueva(this.onNotifNueva);
    this.realtime.onNotificacionEliminada(this.onNotifEliminada);
    this.pollingId = setInterval(() => this.cargar(), 30_000);

  }

  ngOnDestroy(): void {
    if (this.pollingId) clearInterval(this.pollingId);
    this.realtime.off('notificacion:nueva', this.onNotifNueva);
    this.realtime.off('notificacion:eliminada', this.onNotifEliminada);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.open()) return;
    const target = ev.target as HTMLElement;
    if (!target.closest('app-notificaciones-campana')) {
      this.open.set(false);
    }
  }

  // Fusiona la campana del navbar (backend-erp, /api/notificaciones) con las
  // notificaciones de Materiales (backend-epsas-horarios, /api2/notificaciones)
  // — misma estructura tipo/titulo/mensaje/data en ambas tablas, ver
  // notificacion.orm-entity.ts de Materiales. Sin id de usuario todavía
  // (carga inicial antes de resolver sesión) se omite el lado Materiales.
  async cargar(): Promise<void> {
    this.cargando.set(true);
    const idUsuario = this.auth.user()?.id;
    const [erpList, materialesList] = await Promise.all([
      this.api.listarNotificaciones(),
      idUsuario ? this.materialesApi.listarNotificaciones(idUsuario).catch(() => []) : Promise.resolve([]),
    ]);

    const erp: Notificacion[] = erpList.map((n: any) => ({ ...n, origen: 'erp' as const }));
    const materiales: Notificacion[] = materialesList.map((n) => ({
      id:        `mat-${n.id_notificacion}`,
      tipo:      n.tipo,
      titulo:    n.titulo,
      mensaje:   n.mensaje,
      data:      n.data,
      leida:     n.leida,
      createdAt: n.fecha,
      origen:    'materiales' as const,
    }));

    const merged = [...erp, ...materiales].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    this.notificaciones.set(merged);
    this.cargando.set(false);
  }

  toggleDropdown(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.cargar();
  }

  async leer(n: Notificacion): Promise<void> {
    this.expandedId.update(id => id === n.id ? null : n.id);
    if (!n.leida) {
      if (n.origen === 'materiales') {
        await this.materialesApi.marcarNotificacionLeida(Number(n.id.slice('mat-'.length)));
      } else {
        await this.api.marcarNotificacionLeida(n.id);
      }
      this.notificaciones.update(list =>
        list.map(x => x.id === n.id ? { ...x, leida: true } : x)
      );
    }
  }

  async leerTodas(): Promise<void> {
    const idUsuario = this.auth.user()?.id;
    await Promise.all([
      this.api.marcarTodasNotificacionesLeidas(),
      idUsuario ? this.materialesApi.marcarTodasNotificacionesLeidas(idUsuario) : Promise.resolve(),
    ]);
    this.notificaciones.update(list => list.map(x => ({ ...x, leida: true })));
  }

  getMeta(tipo: string): TipoMeta {
    return getMeta(tipo);
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d    = new Date(iso);
    const now  = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;

    if (diff < 60)            return 'Hace un momento';
    if (diff < 3600)          return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400)         return `Hace ${Math.floor(diff / 3600)} h`;
    if (diff < 86400 * 7)     return `Hace ${Math.floor(diff / 86400)} días`;

    return d.toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }
}
