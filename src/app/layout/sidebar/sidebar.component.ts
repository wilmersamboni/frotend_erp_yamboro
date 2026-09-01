import { Component, HostListener, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AprendizContextService } from '../../core/services/aprendiz-context.service';
import { ContactWidgetService } from '../../core/services/contact-widget.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

interface NavLink  {
  label: string; href: string; safeIcon: SafeHtml; roles?: string[]; aplicativo?: string;
  /** Solo para rol aprendiz: mostrar únicamente si SÍ tiene etapa práctica creada. */
  soloAprendizConEtapa?: boolean;
  /** Solo para rol aprendiz: mostrar únicamente si NO tiene etapa práctica creada. */
  soloAprendizSinEtapa?: boolean;
  /** Servicio del sistema de permisos dinámico que también habilita este link,
   * aunque el cargo no esté en `roles` (ver AuthService.tieneServicio). OR con
   * `roles` — pensado para poblaciones DISTINTAS (ej. `roles` = admin,
   * `servicio` = alternativa para instructor/aprendiz). */
  servicio?: string;
  /** Igual que `servicio` (OR con `roles`) pero para cuando CUALQUIERA de
   * varios servicios habilita el link — ej. "Admin": el link debe aparecer
   * si el usuario tiene AL MENOS UNO de los servicios que ya gatean las
   * pestañas de adentro de /admin (mismo criterio que `servicios` en
   * app.routes.ts para esa misma ruta — deben mantenerse en sync). */
  servicios?: string[];
  /** Servicio requerido EN AND con `roles` (no como alternativa): el link
   * solo se muestra si el cargo matchea Y además tiene este servicio. Usar
   * cuando `roles` y el servicio gatean a la MISMA población — ej. Materiales
   * instructor: usar `servicio` (OR) sería un no-op, porque el cargo del
   * propio usuario siempre matchea su propio `roles`, así que el servicio
   * nunca se llegaría a chequear. */
  servicioEstricto?: string;
}
interface NavGroup {
  id: string; label: string; links: NavLink[]; aplicativo?: string;
  /** Label del link cuyo ícono representa al grupo colapsado en modo ícono
   * (sidebar minimizado). Si falta, se usa el del primer link. */
  iconoRepresentativo?: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside
      class="h-screen flex flex-col bg-white border-r border-gray-100 transition-all duration-300 ease-in-out select-none"
      [class.w-56]="open"
      [class.w-16]="!open"
      [class.mobile-open]="mobileOpen"
      style="box-shadow: 1px 0 10px 0 rgba(0,0,0,.04);"
    >

      <!-- ── Centro/sede actual ────────────────────────────────── -->
      <div class="px-3 py-4 border-b border-gray-100">
        <div class="flex items-center gap-2.5" [class.justify-center]="!open"
          [title]="!open ? centroLabel : ''">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center
                       bg-[#007832]/10 text-[#007832] flex-shrink-0">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/>
            </svg>
          </div>
          @if (open) {
            <div class="overflow-hidden">
              <p class="text-gray-400 text-[10px] uppercase tracking-wide leading-tight">Centro</p>
              <p class="text-[#007832] text-xs font-semibold truncate leading-tight mt-0.5">{{ centroLabel }}</p>
            </div>
          }
        </div>
      </div>

      <!-- ── Navegación ──────────────────────────────────────── -->
      <!-- overflow-y-auto solo cuando está abierto para que los tooltips
           del modo colapsado no queden cortados -->
      <nav class="flex-1 px-2 py-2" [class.overflow-y-auto]="open">

        @for (group of visibleGroups; track group.id; let first = $first) {

          <!-- Separador / encabezado de sección -->
          @if (open) {
            @if (isCollapsible(group)) {
              <button type="button" class="nav-section-toggle" [class.mt-0]="first"
                (click)="toggleGroup(group)">
                <span class="nav-section-label !p-0 !m-0">{{ group.label }}</span>
                <svg class="nav-section-chevron" [class.expanded]="!isGroupCollapsed(group)"
                  width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            } @else {
              <p class="nav-section-label" [class.mt-0]="first">{{ group.label }}</p>
            }
          } @else {
            @if (!first) {
              <hr class="border-gray-100 my-1.5 mx-2" />
            }
          }

          <!-- Modo ícono + grupo desplegable: un solo ícono representativo
               (el del primer link) en vez de los N íconos sueltos — se
               resalta si la ruta activa vive dentro del grupo. Al pasar el
               mouse el sidebar completo se abre igual (mouseenter en
               main-layout) y ahí se ve el desplegable real con sus labels. -->
          @if (!open && isCollapsible(group)) {
            <a
              [routerLink]="linkRepresentativo(group).href"
              class="nav-link justify-center"
              [class.nav-link-active]="isGroupActive(group)"
            >
              <span class="flex-shrink-0 w-[18px] h-[18px]" [innerHTML]="linkRepresentativo(group).safeIcon"></span>
              <span class="nav-tooltip">{{ group.label }} ({{ group.links.length }})</span>
            </a>
          } @else if (!open || !isCollapsible(group) || !isGroupCollapsed(group)) {
            @for (link of group.links; track link.href) {
              <a
                [routerLink]="link.href"
                routerLinkActive="nav-link-active"
                [routerLinkActiveOptions]="{ exact: link.href === '/' }"
                class="nav-link"
                [class.justify-center]="!open"
              >
                <span class="flex-shrink-0 w-[18px] h-[18px]" [innerHTML]="link.safeIcon"></span>

                @if (open) {
                  <span>{{ link.label }}</span>
                } @else {
                  <!-- Tooltip personalizado en modo colapsado -->
                  <span class="nav-tooltip">{{ link.label }}</span>
                }
              </a>
            }
          }

        }
      </nav>

      <!-- ── Pie: contáctanos + cerrar sesión ────────────────── -->
      <div class="px-2 pt-2 pb-3 relative">

        <!-- Popover con las opciones de contacto — abre hacia arriba porque
             el botón que lo dispara vive al fondo del sidebar. -->
        @if (contactoAbierto()) {
          <div class="contacto-popover" [class.collapsed]="!open">
            <button class="contacto-opt wa" (click)="abrirWhatsApp()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.18-2.587-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217s.231.001.332.005c.108.004.254-.041.398.305.144.346.491 1.197.534 1.284.043.087.072.188.014.305s-.087.188-.173.289c-.087.101-.183.226-.262.303-.092.09-.188.188-.081.372.107.184.475.783 1.021 1.27.703.627 1.296.822 1.481.914.185.092.293.077.4-.048.107-.125.462-.538.585-.72.123-.182.246-.153.414-.092.168.061 1.066.503 1.251.596s.308.139.353.218c.045.079.045.459-.099.864z"/>
              </svg>
              WhatsApp
            </button>
            <button class="contacto-opt bot" (click)="abrirAsistente($event)">
              🤖 Asistente Virtual
            </button>
          </div>
        }

        <button
          class="nav-logout"
          [class.justify-center]="!open"
          (click)="toggleContacto($event)"
          [title]="!open ? 'Contáctanos' : ''"
        >
          <svg class="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0
                 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418
                 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          @if (open) {
            <span>Contáctanos</span>
          }
        </button>

        <hr class="border-gray-100 my-2" />

        <button
          class="nav-logout"
          [class.justify-center]="!open"
          (click)="auth.logout()"
          [title]="!open ? 'Cerrar sesión' : ''"
        >
          <svg class="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3
                 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          @if (open) {
            <span>Cerrar sesión</span>
          }
        </button>

      </div>

    </aside>
  `,
  styleUrls: ['./sidebar.component.css'],
})
export class SidebarComponent implements OnChanges {
  @Input() open = false;
  /** Controla el drawer fijo en mobile (<1024px) — independiente de `open`,
   * que en mobile siempre viene en true junto con este (ver main-layout). */
  @Input() mobileOpen = false;

  contactoAbierto = signal(false);

  // El sidebar se colapsa al sacar el mouse (mouseleave en main-layout) —
  // si el popover de contacto seguía abierto, quedaba flotando con la
  // posición del sidebar expandido mientras este se achicaba debajo,
  // saltando feo. Se cierra apenas el sidebar deja de estar abierto.
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && !changes['open'].currentValue) {
      this.contactoAbierto.set(false);
    }
  }

  private allGroups: NavGroup[] = [];

  /** Umbral a partir del cual un grupo pasa a ser desplegable/colapsable. */
  private static readonly UMBRAL_DESPLEGABLE = 4;

  /** Overrides manuales de expandir/colapsar por grupo (true = colapsado). */
  private groupOverrides = signal<Map<string, boolean>>(new Map());

  constructor(
    public auth: AuthService,
    private sanitizer: DomSanitizer,
    private aprendizContext: AprendizContextService,
    private contactWidget: ContactWidgetService,
    private router: Router,
  ) {
    this.allGroups = [
      {
        id: 'principal',
        label: 'Principal',
        links: [
          {
            label: 'Inicio', href: '/home',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>`),
          },
          {
            label: 'Seguimiento', href: '/seguimiento',
            aplicativo: 'Etapa Práctica',
            // Para aprendiz específicamente: solo visible si YA tiene una
            // etapa práctica creada (si no, ve "Mis Horarios" en su lugar).
            // No afecta a admin/instructor, que no llevan esta marca.
            soloAprendizConEtapa: true,
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`),
          },
        ],
      },
      {
        id: 'modulos',
        label: 'Módulos',
        links: [
          {
            label: 'Formatos', href: '/format',
            aplicativo: 'Etapa Práctica',
            // Para aprendiz: los formatos son plantillas de la etapa práctica —
            // no le sirven durante la lectiva. Solo visible cuando ya tiene una
            // etapa práctica (mismo criterio que "Seguimiento"). No afecta a
            // admin/instructor.
            soloAprendizConEtapa: true,
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`),
          },
          {
            label: 'Historial', href: '/docs',
            // Herramienta de consulta por cédula ("Historial del aprendiz") —
            // es para que el STAFF inspeccione a un aprendiz, no para que el
            // aprendiz se vea a sí mismo. Se gatea por cargo (admin/instructor),
            // NO por personas.ver/matriculas.ver: esos son servicios baseline
            // que TODO rol tiene (incluido aprendiz) para consultar su propio
            // registro, así que como gate dejaban entrar al aprendiz a un
            // módulo que no le sirve. Mantener en sync con app.routes.ts.
            roles: ['administrador', 'administrador_erp', 'instructor'],
            aplicativo: 'Etapa Práctica',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`),
          },
          {
            label: 'Migración', href: '/migracion',
            roles: ['administrador', 'administrador_erp'],
            // OR con roles (no servicioEstricto/AND) — mismo motivo que la
            // ruta: roles=admin y "instructor con el servicio" son
            // poblaciones distintas, mantener en sync con app.routes.ts.
            servicios: ['practica.migracion'],
            aplicativo: 'Etapa Práctica',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>`),
          },
          {
            label: 'Admin', href: '/admin',
            // Sin 'roles': 100% por 'permisos.gestionar' (el servicio de
            // RBAC) — misma lista que la ruta en app.routes.ts, mantener en
            // sync. Un solo servicio a propósito, ver comentario en la ruta.
            servicio: 'permisos.gestionar',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`),
          },
        ],
      },
      {
        id: 'horarios',
        label: 'Horarios',
        // Sin aplicativo a nivel de grupo: instructor y aprendiz ven sus
        // enlaces de Horarios siempre (no dependen de a qué aplicativo
        // pertenece su cuenta) — solo los enlaces de administración del
        // módulo Horarios siguen restringidos por aplicativo, ver abajo.
        links: [
          {
            label: 'Horarios', href: '/horarios',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Horarios',
            servicio: 'horarios.gestionar',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`),
          },
          {
            label: 'Programador de Eventos', href: '/programador-eventos',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Horarios',
            servicio: 'horarios.eventos',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v6m3-3H9m11 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`),
          },
          {
            label: 'Mis Horarios', href: '/mis-horarios',
            roles: ['instructor'],
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`),
          },
          {
            label: 'Mis Horarios', href: '/aprendiz-mis-horarios',
            roles: ['aprendiz'],
            // Complemento de "Seguimiento" arriba: solo visible si el
            // aprendiz NO tiene etapa práctica creada.
            soloAprendizSinEtapa: true,
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`),
          },
        ],
      },
      {
        id: 'encuestas',
        label: 'Encuestas',
        aplicativo: 'Encuestas',
        links: [
          {
            label: 'Encuestas', href: '/encuestas',
            roles: ['administrador', 'administrador_erp'],
            servicio: 'encuestas.gestionar',
            // Antes reusaba el ícono de documento de "Formatos"; el primer
            // reemplazo (globo de chat) resultó ser el mismo que ya usa el
            // botón "Contáctanos" del sidebar — ícono de lista/checklist,
            // no usado en ningún otro lado del sidebar.
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`),
          },
        ],
      },
      // Nota: las encuestas para aprendices se responden solo por link/QR
      // anónimo (ver /responder y /responder-grupo en app.routes.ts) — no
      // hay entrada de sidebar ni página de "Mis Encuestas" para ese flujo.
      {
        id: 'materiales',
        label: 'Materiales',
        iconoRepresentativo: 'Productos',
        // Sin aplicativo a nivel de grupo (mismo criterio que 'horarios'):
        // instructor y aprendiz no dependen de a qué aplicativo pertenece su
        // cuenta para ver Materiales (RequiereServicioGuard del backend trae
        // sinRestriccionAplicativo=true para esos roles). Solo los links de
        // admin siguen atados al aplicativo 'Materiales' (o
        // administrador_erp), marcado individualmente en cada uno.
        links: [
          {
            label: 'Categorías', href: '/materiales/categorias',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>`),
          },
          {
            label: 'Sitios', href: '/materiales/sitios',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V9a2 2 0 00-2-2h-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2H5a2 2 0 00-2 2v12h18zM9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4"/></svg>`),
          },
          {
            label: 'Productos', href: '/materiales/productos',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`),
          },
          {
            label: 'Inventario', href: '/materiales/inventario',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>`),
          },
          {
            label: 'Ítems', href: '/materiales/items',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375C2.754 3.75 2.25 4.254 2.25 4.875v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>`),
          },
          {
            label: 'Kardex', href: '/materiales/kardex',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>`),
          },
          {
            label: 'Novedades', href: '/materiales/novedades',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`),
          },
          {
            label: 'Traslados', href: '/materiales/traslados',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3m4 8l-4-4m0 0l4-4m-4 4h18"/></svg>`),
          },
          {
            label: 'Solicitudes', href: '/materiales/solicitudes',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 8l2 2 4-4"/></svg>`),
          },
          {
            label: 'Devoluciones', href: '/materiales/devoluciones',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l-4-4m0 0l4-4m-4 4h11a4 4 0 010 8h-1"/></svg>`),
          },
          {
            label: 'Asignaciones', href: '/materiales/asignaciones',
            roles: ['administrador', 'administrador_erp'],
            aplicativo: 'Materiales',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1a4 4 0 100-8 4 4 0 000 8zm6 3a4 4 0 00-3-3.87M9 13a4 4 0 00-3 3.87"/></svg>`),
          },

          // ── Instructor: solo lectura salvo lo suyo (solicitudes/traslados/
          // novedades) — sin `aplicativo`, no depende de a qué aplicativo
          // pertenece la cuenta (mismo criterio que Horarios para instructor).
          // Mismo orden e íconos que la versión admin arriba — mantener en
          // sync (antes Categorías estaba al final e Ítems/Inventario
          // invertidos respecto a admin, y Asignaciones/Categorías usaban
          // íconos distintos a los de admin).
          {
            // Sin servicio propio ('materiales.categorias.*' no existe en el catálogo) — reusa materiales.inventario.ver.
            label: 'Categorías', href: '/instructor/materiales/categorias',
            roles: ['instructor'],
            servicioEstricto: 'materiales.inventario.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>`),
          },
          {
            label: 'Sitios', href: '/instructor/materiales/sitios',
            roles: ['instructor'],
            servicioEstricto: 'materiales.sitios.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V9a2 2 0 00-2-2h-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2H5a2 2 0 00-2 2v12h18zM9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4"/></svg>`),
          },
          {
            label: 'Productos', href: '/instructor/materiales/productos',
            roles: ['instructor'],
            servicioEstricto: 'materiales.productos.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`),
          },
          {
            label: 'Inventario', href: '/instructor/materiales/inventario',
            roles: ['instructor'],
            servicioEstricto: 'materiales.inventario.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>`),
          },
          {
            label: 'Ítems', href: '/instructor/materiales/items',
            roles: ['instructor'],
            servicioEstricto: 'materiales.items.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375C2.754 3.75 2.25 4.254 2.25 4.875v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>`),
          },
          {
            label: 'Kardex', href: '/instructor/materiales/kardex',
            roles: ['instructor'],
            servicioEstricto: 'materiales.kardex.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>`),
          },
          {
            label: 'Novedades', href: '/instructor/materiales/novedades',
            roles: ['instructor'],
            servicioEstricto: 'materiales.novedades.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`),
          },
          {
            label: 'Traslados', href: '/instructor/materiales/traslados',
            roles: ['instructor'],
            servicioEstricto: 'materiales.traslados.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3m4 8l-4-4m0 0l4-4m-4 4h18"/></svg>`),
          },
          {
            label: 'Solicitudes', href: '/instructor/materiales/solicitudes',
            roles: ['instructor'],
            servicioEstricto: 'materiales.solicitudes.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 8l2 2 4-4"/></svg>`),
          },
          {
            label: 'Devoluciones', href: '/instructor/materiales/devoluciones',
            roles: ['instructor'],
            servicioEstricto: 'materiales.devoluciones.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l-4-4m0 0l4-4m-4 4h11a4 4 0 010 8h-1"/></svg>`),
          },
          {
            label: 'Asignaciones', href: '/instructor/materiales/asignaciones',
            roles: ['instructor'],
            servicioEstricto: 'materiales.asignaciones.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1a4 4 0 100-8 4 4 0 000 8zm6 3a4 4 0 00-3-3.87M9 13a4 4 0 00-3 3.87"/></svg>`),
          },

          // ── Aprendiz: solo lectura + solicitar/recibir préstamos propios —
          // sin `aplicativo`, mismo criterio que instructor arriba. Mismo
          // orden relativo que la versión admin (Productos antes que
          // Inventario) — mantener en sync.
          {
            label: 'Productos', href: '/aprendiz/materiales/productos',
            roles: ['aprendiz'],
            servicioEstricto: 'materiales.productos.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`),
          },
          {
            label: 'Inventario', href: '/aprendiz/materiales/inventario',
            roles: ['aprendiz'],
            servicioEstricto: 'materiales.inventario.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>`),
          },
          {
            label: 'Ítems', href: '/aprendiz/materiales/items',
            roles: ['aprendiz'],
            servicioEstricto: 'materiales.items.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375C2.754 3.75 2.25 4.254 2.25 4.875v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>`),
          },
          {
            label: 'Solicitudes', href: '/aprendiz/materiales/solicitudes',
            roles: ['aprendiz'],
            servicioEstricto: 'materiales.solicitudes.ver',
            safeIcon: this.safe(`<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 8l2 2 4-4"/></svg>`),
          },
        ],
      },
    ];
  }

  /** Grupos filtrados según el cargo del usuario y, si aplica, su aplicativo */
  get visibleGroups(): NavGroup[] {
    const cargo = this.auth.cargo();
    const esAprendiz = cargo === 'aprendiz';
    const tieneEtapa = this.aprendizContext.tieneEtapa();
    // instructor/aprendiz nunca quedan registrados en el aplicativo "Etapa
    // Práctica" en sí (ver RegistroRapidoModalComponent: su cuenta siempre
    // se crea en el aplicativo propio del tenant), pero ese aplicativo
    // propio SIEMPRE trae sembrados los permisos practica.* completos
    // (SERVICIOS_POR_ROL en tenant-admin.service.ts) — sin esta excepción,
    // "Seguimiento"/"Formatos" nunca aparecían para ningún instructor o
    // aprendiz real, porque perteneceAplicativo('Etapa Práctica') siempre
    // daba false para ellos.
    const tieneAccesoPracticaPorRol = cargo === 'instructor' || esAprendiz;

    return this.allGroups
      // El aplicativo del GRUPO tiene el mismo escape hatch por servicio que
      // los links individuales (ver más abajo) — si no, un servicio otorgado
      // a un link nunca se llega a evaluar porque el grupo entero ya se filtró.
      .filter(g => !g.aplicativo || this.auth.perteneceAplicativo(g.aplicativo)
        || g.links.some(l => l.servicio && this.auth.tieneServicio(l.servicio)))
      .map(g => ({
        ...g,
        links: g.links.filter(l => {
          // El servicio dinámico es una vía alternativa (OR) al cargo — si el
          // cargo no matchea pero el usuario tiene el servicio otorgado (rol o
          // excepción propia, ver AuthService.tieneServicio), igual se muestra.
          // El servicio dinámico también exime del recorte por aplicativo del
          // link — si no, un link con `aplicativo` fijo (ej. 'Horarios')
          // nunca se llega a mostrar para un instructor/aprendiz al que se le
          // otorgó el servicio pero cuya cuenta no pertenece a ese aplicativo
          // (mismo bug que ya se corrigió a nivel de grupo en Fase 1).
          const tieneServicioDelLink = !!(l.servicio && this.auth.tieneServicio(l.servicio))
            || !!(l.servicios && l.servicios.some(s => this.auth.tieneServicio(s)));
          if (l.roles) {
            if (!l.roles.includes(cargo) && !tieneServicioDelLink) return false;
          } else if ((l.servicio || l.servicios) && !tieneServicioDelLink) {
            // Sin 'roles': el link es 100% por permiso — antes, sin este
            // 'else if', un link con SOLO 'servicio'/'servicios' (sin
            // 'roles' ni 'aplicativo') se mostraba siempre, porque
            // 'tieneServicioDelLink' solo se consultaba como rescate DENTRO
            // del bloque de 'roles' — nunca como requisito. Bug real: el
            // link "Admin" (gateado solo por 'permisos.gestionar' desde la
            // Ronda 3, sin 'roles') seguía apareciendo aunque se le revocara
            // el servicio. Ver plan "Ronda 3" (continuación, Fase 11).
            return false;
          }
          // `servicioEstricto` es un AND aparte de `roles` (no un OR como
          // `servicio` arriba): aunque el cargo matchee, si no tiene este
          // servicio se oculta igual. Necesario para Materiales instructor/
          // aprendiz — con `servicio` (OR) el propio cargo del usuario
          // siempre matchea su propio `roles`, así que el servicio nunca se
          // llegaba a chequear (bug: revocar todo no ocultaba nada).
          if (l.servicioEstricto && !this.auth.tieneServicio(l.servicioEstricto)) return false;
          if (l.aplicativo && l.aplicativo !== 'Etapa Práctica' && !this.auth.perteneceAplicativo(l.aplicativo) && !tieneServicioDelLink) return false;
          if (l.aplicativo === 'Etapa Práctica' && !tieneAccesoPracticaPorRol && !this.auth.perteneceAplicativo(l.aplicativo) && !tieneServicioDelLink) return false;
          // Mientras no se sabe si el aprendiz tiene etapa (tieneEtapa===null,
          // recién logueado) se ocultan ambos — evita mostrar el que no es
          // por un instante y luego cambiarlo.
          if (esAprendiz && l.soloAprendizConEtapa && tieneEtapa !== true) return false;
          if (esAprendiz && l.soloAprendizSinEtapa && tieneEtapa !== false) return false;
          return true;
        }),
      }))
      .filter(g => g.links.length > 0);
  }

  /** Un grupo con más de 4 submódulos pasa a ser desplegable. */
  isCollapsible(group: NavGroup): boolean {
    return group.links.length > SidebarComponent.UMBRAL_DESPLEGABLE;
  }

  /**
   * Colapsado por defecto salvo que el usuario lo haya expandido manualmente,
   * o que la ruta activa actual viva dentro de ese grupo (para no esconder
   * el enlace activo al recargar/navegar).
   */
  isGroupCollapsed(group: NavGroup): boolean {
    if (!this.isCollapsible(group)) return false;
    const override = this.groupOverrides().get(group.id);
    if (override !== undefined) return override;
    return !this.isGroupActive(group);
  }

  /** true si la ruta activa actual es uno de los links de este grupo. */
  isGroupActive(group: NavGroup): boolean {
    const url = this.router.url;
    return group.links.some(l => url === l.href || url.startsWith(l.href + '/'));
  }

  /** Link cuyo ícono representa al grupo colapsado en modo ícono. */
  linkRepresentativo(group: NavGroup): NavLink {
    return group.links.find(l => l.label === group.iconoRepresentativo) ?? group.links[0];
  }

  toggleGroup(group: NavGroup): void {
    const colapsadoActual = this.isGroupCollapsed(group);
    this.groupOverrides.update(map => {
      const next = new Map(map);
      next.set(group.id, !colapsadoActual);
      return next;
    });
  }

  get userName(): string    { return this.auth.user()?.nombre ?? 'Usuario'; }
  get userCargo(): string   { return this.auth.user()?.cargo  ?? ''; }

  /**
   * Nombre "bonito" del centro/sede a partir del tenantSlug guardado en el
   * login (ej. "verif-fusion" → "Verif Fusion"). No hay un nombre real de
   * centro disponible en el cliente sin una llamada extra al ERP, así que
   * esto es una aproximación — evita duplicar nombre/cargo/iniciales, que
   * ya se muestran en el navbar.
   */
  get centroLabel(): string {
    const slug = localStorage.getItem('tenantSlug');
    if (!slug) return 'Centro';
    return slug
      .split(/[-_]/)
      .filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1))
      .join(' ');
  }

  private safe(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  toggleContacto(ev: Event): void {
    ev.stopPropagation();
    this.contactoAbierto.update((v) => !v);
  }

  abrirWhatsApp(): void {
    window.open('https://wa.me/573223699382', '_blank');
    this.contactoAbierto.set(false);
  }

  abrirAsistente(ev: MouseEvent): void {
    // Sin esto, el mismo clic que abre el chat llega también al listener de
    // "clic afuera" de FloatingButtons (document:click) y lo vuelve a cerrar
    // de inmediato, porque el botón no está dentro del propio panel del chat.
    ev.stopPropagation();
    this.contactWidget.abrirChat();
    this.contactoAbierto.set(false);
  }

  @HostListener('document:click')
  cerrarPopoverContacto(): void {
    if (this.contactoAbierto()) this.contactoAbierto.set(false);
  }
}
