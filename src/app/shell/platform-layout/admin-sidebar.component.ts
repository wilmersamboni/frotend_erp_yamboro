import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AdminAuthService } from '../../core/admin-auth/admin-auth.service';

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside
      class="sidebar-shell flex flex-col transition-all duration-300 ease-in-out select-none"
      [class.w-56]="open"
      [class.w-16]="!open"
      [class.is-open]="open"
      [class.mobile-open]="mobileOpen"
    >

      <!-- ── Hamburguesa: expande/colapsa a mano, como en el resto de la app ── -->
      <div class="flex flex-shrink-0 px-3.5 pt-3.5 pb-1" [class.justify-center]="!open">
        <button type="button" class="sb-toggle" (click)="toggle.emit()"
          [attr.aria-label]="open ? 'Colapsar el menú' : 'Expandir el menú'" [attr.aria-expanded]="open">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      <!-- ── Navegación ──────────────────────────────────────── -->
      <nav class="flex-1 px-2 py-2" [class.overflow-y-auto]="open">

        <!-- Principal -->
        @if (open) { <p class="nav-section-label mt-0">Principal</p> }

        <a routerLink="/dashboard" routerLinkActive="nav-link-active"
          [routerLinkActiveOptions]="{exact:true}" class="nav-link" [class.justify-center]="!open">
          <span class="flex-shrink-0 w-[18px] h-[18px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </span>
          @if (open) { <span>Resumen general</span> } @else { <span class="nav-tooltip">Resumen general</span> }
        </a>

        <!-- Gestión de Centros -->
        @if (open) {
          <p class="nav-section-label">Gestión de Centros</p>
        } @else {
          <hr class="border-gray-100 my-1.5 mx-2" />
        }

        <a routerLink="/tenants" routerLinkActive="nav-link-active" class="nav-link" [class.justify-center]="!open">
          <span class="flex-shrink-0 w-[18px] h-[18px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
            </svg>
          </span>
          @if (open) { <span>Centros de Formación</span> } @else { <span class="nav-tooltip">Centros de Formación</span> }
        </a>

        <a routerLink="/root-users" routerLinkActive="nav-link-active" class="nav-link" [class.justify-center]="!open">
          <span class="flex-shrink-0 w-[18px] h-[18px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </span>
          @if (open) { <span>Usuarios Root</span> } @else { <span class="nav-tooltip">Usuarios Root</span> }
        </a>

        <!-- Infraestructura -->
        @if (open) {
          <p class="nav-section-label">Infraestructura</p>
        } @else {
          <hr class="border-gray-100 my-1.5 mx-2" />
        }

        <a routerLink="/dominios" routerLinkActive="nav-link-active" class="nav-link" [class.justify-center]="!open">
          <span class="flex-shrink-0 w-[18px] h-[18px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
            </svg>
          </span>
          @if (open) { <span>Gestión de Dominios</span> } @else { <span class="nav-tooltip">Dominios</span> }
        </a>

        <!-- Monitoreo -->
        @if (open) {
          <p class="nav-section-label">Monitoreo</p>
        } @else {
          <hr class="border-gray-100 my-1.5 mx-2" />
        }

        <a routerLink="/audit-log" routerLinkActive="nav-link-active" class="nav-link" [class.justify-center]="!open">
          <span class="flex-shrink-0 w-[18px] h-[18px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </span>
          @if (open) { <span>Auditoría Global</span> } @else { <span class="nav-tooltip">Auditoría Global</span> }
        </a>

      </nav>

      <!-- ── Pie ─────────────────────────────────────────────── -->
      <div class="px-2 pt-2 pb-3 border-t border-gray-100">

        <a routerLink="/settings" routerLinkActive="nav-link-active" class="nav-link" [class.justify-center]="!open">
          <span class="flex-shrink-0 w-[18px] h-[18px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
          @if (open) { <span>Configuración</span> } @else { <span class="nav-tooltip">Configuración</span> }
        </a>

        <button type="button" (click)="cerrarSesion()" class="nav-logout w-full" [class.justify-center]="!open"
          [title]="!open ? 'Cerrar sesión' : ''">
          <svg class="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          @if (open) { <span>Cerrar sesión</span> }
        </button>

      </div>
    </aside>
  `,
  styles: [`
    .sidebar-shell {
      height: calc(100vh - 32px); margin: 16px 0 16px 16px; border-radius: 22px;
      background: var(--surface); border: 1px solid var(--border-soft);
      box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 12px 28px rgba(15,23,42,.06);
      color: var(--text); overflow: hidden;
    }
    .sidebar-shell:not(.is-open) { overflow: visible; }
    .sb-toggle {
      width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--border-soft);
      background: var(--surface2); color: var(--text-muted); display: flex; align-items: center;
      justify-content: center; cursor: pointer; flex-shrink: 0; transition: background .15s, color .15s;
    }
    .sb-toggle:hover { color: var(--accent-text); }
    .nav-link {
      position: relative; display: flex; align-items: center; gap: 10px;
      padding: 9px 10px 9px 11px; border-radius: 8px; font-size: 13px; font-weight: 500;
      color: var(--text); text-decoration: none; cursor: pointer;
      transition: background .15s, color .15s; 
    }
    .nav-link:hover { background: color-mix(in srgb, var(--accent) 7%, var(--surface3)); color: var(--text); }
    .nav-link:hover > span:first-child { color: var(--accent-text); }
    .nav-link-active { background: var(--accent-active-bg, var(--accent-soft)); color: var(--accent-text); font-weight: 600; }
    .nav-section-label {
      font-size: 12px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
      color: var(--text-muted); padding: 0 13px; margin: 14px 0 3px;
    }
    .nav-section-label.mt-0 { margin-top: 4px; }
    .nav-tooltip {
      position: absolute; left: calc(100% + 10px); top: 50%; transform: translateY(-50%);
      background: var(--tooltip-bg); color: #fff; font-size: 12px; font-weight: 500;
      padding: 5px 10px; border-radius: 7px; white-space: nowrap;
      opacity: 0; pointer-events: none; transition: opacity .15s; z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,.15);
    }
    .nav-tooltip::before {
      content: ''; position: absolute; right: 100%; top: 50%; transform: translateY(-50%);
      border: 5px solid transparent; border-right-color: var(--tooltip-bg);
    }
    .nav-link:hover .nav-tooltip { opacity: 1; }
    .nav-logout {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px; border-radius: 8px; border: none; background: none;
      font-size: 13px; font-weight: 500; color: var(--text-faint);
      cursor: pointer; transition: background .15s, color .15s; font-family: inherit;
    }
    .nav-logout:hover { background: var(--err-bg); color: var(--err-text); }

    /* ── Drawer táctil (<1024px) — ver mismo bloque en sidebar.component.css ── */
    @media (max-width: 1023.98px) {
      aside {
        position: fixed; top: 0; bottom: 0; left: 0; z-index: 70;
        width: 224px !important; margin: 0; height: auto; border-radius: 0;
        transform: translateX(-100%);
        transition: transform .25s ease-in-out;
        box-shadow: 4px 0 24px rgba(0,0,0,.18);
      }
      aside.mobile-open { transform: translateX(0); }
    }
  `],
})
export class AdminSidebarComponent {
  private readonly authService = inject(AdminAuthService);
  @Input() open = false;
  @Output() toggle = new EventEmitter<void>();
  /** Controla el drawer fijo en mobile (<1024px) — independiente de `open`. */
  @Input() mobileOpen = false;

  cerrarSesion(): void { this.authService.logout(); }
}
