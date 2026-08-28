import { Component, Input, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AdminAuthService } from '../../core/admin-auth/admin-auth.service';

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside
      class="h-screen flex flex-col bg-white border-r border-gray-100 transition-all duration-300 ease-in-out select-none"
      [class.w-56]="open"
      [class.w-16]="!open"
      [class.mobile-open]="mobileOpen"
      style="box-shadow: 1px 0 10px 0 rgba(0,0,0,.04);">

      <!-- ── Perfil ──────────────────────────────────────────── -->
      <div class="px-3 py-4 border-b border-gray-100">
        <div class="flex items-center gap-2.5" [class.justify-center]="!open">
          <div class="w-8 h-8 rounded-full flex items-center justify-center
                       text-[#007832] text-xs font-bold flex-shrink-0
                       bg-[#007832]/10 border border-[#007832]/20">
            {{ userInitials() }}
          </div>
          @if (open) {
            <div class="overflow-hidden">
              <p class="text-[#007832] text-xs font-semibold truncate leading-tight">{{ userNombre() }}</p>
              <p class="text-gray-400 text-[10px] truncate leading-tight mt-0.5">Administrador Root</p>
            </div>
          }
        </div>
      </div>

      <!-- ── Navegación ──────────────────────────────────────── -->
      <nav class="flex-1 px-2 py-2" [class.overflow-y-auto]="open">

        <!-- Principal -->
        @if (open) { <p class="nav-section-label mt-0">Principal</p> }

        <a routerLink="/dashboard" routerLinkActive="nav-link-active"
          [routerLinkActiveOptions]="{exact:true}" class="nav-link" [class.justify-center]="!open">
          <span class="flex-shrink-0 w-[18px] h-[18px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
          </span>
          @if (open) { <span>Dashboard</span> } @else { <span class="nav-tooltip">Dashboard</span> }
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
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" />
            </svg>
          </span>
          @if (open) { <span>Centros de Formación</span> } @else { <span class="nav-tooltip">Centros de Formación</span> }
        </a>

        <a routerLink="/root-users" routerLinkActive="nav-link-active" class="nav-link" [class.justify-center]="!open">
          <span class="flex-shrink-0 w-[18px] h-[18px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 8h6m-6 4h6" />
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
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
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
    .nav-link {
      position: relative; display: flex; align-items: center; gap: 10px;
      padding: 9px 10px 9px 11px; border-radius: 8px; font-size: 13px; font-weight: 500;
      color: #2B2F38; text-decoration: none; cursor: pointer;
      transition: background .15s, color .15s; border-left: 3px solid transparent;
    }
    .nav-link:hover { background: #f8fafc; color: #1e293b; }
    .nav-link-active { background: rgba(0,120,50,.08); color: #007832; border-left-color: #007832; font-weight: 600; }
    .nav-section-label {
      font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
      color: #656E85; padding: 0 13px; margin: 14px 0 3px;
    }
    .nav-section-label.mt-0 { margin-top: 4px; }
    .nav-tooltip {
      position: absolute; left: calc(100% + 10px); top: 50%; transform: translateY(-50%);
      background: #1e293b; color: #fff; font-size: 12px; font-weight: 500;
      padding: 5px 10px; border-radius: 7px; white-space: nowrap;
      opacity: 0; pointer-events: none; transition: opacity .15s; z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,.15);
    }
    .nav-tooltip::before {
      content: ''; position: absolute; right: 100%; top: 50%; transform: translateY(-50%);
      border: 5px solid transparent; border-right-color: #1e293b;
    }
    .nav-link:hover .nav-tooltip { opacity: 1; }
    .nav-logout {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px; border-radius: 8px; border: none; background: none;
      font-size: 13px; font-weight: 500; color: #94a3b8;
      cursor: pointer; transition: background .15s, color .15s; font-family: inherit;
    }
    .nav-logout:hover { background: #fef2f2; color: #dc2626; }

    /* ── Drawer táctil (<1024px) — ver mismo bloque en sidebar.component.css ── */
    @media (max-width: 1023.98px) {
      aside {
        position: fixed; top: 0; bottom: 0; left: 0; z-index: 70;
        width: 224px !important;
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
  /** Controla el drawer fijo en mobile (<1024px) — independiente de `open`. */
  @Input() mobileOpen = false;

  readonly userInitials = computed(() => {
    const correo = this.authService.currentUser()?.correo ?? 'A';
    return correo.split('@')[0].slice(0, 2).toUpperCase();
  });

  readonly userNombre = computed(() => {
    const correo = this.authService.currentUser()?.correo ?? 'Administrador';
    return correo.split('@')[0];
  });

  cerrarSesion(): void { this.authService.logout(); }
}
