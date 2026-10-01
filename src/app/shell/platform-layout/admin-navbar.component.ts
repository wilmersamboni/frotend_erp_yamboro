import { Component, computed, inject, Input, Output, EventEmitter } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminAuthService } from '../../core/admin-auth/admin-auth.service';
import { AdminCampanaComponent } from './admin-campana.component';
import { AdminBuscadorComponent } from './admin-buscador.component';

@Component({
  selector: 'app-admin-navbar',
  standalone: true,
  imports: [RouterLink, AdminCampanaComponent, AdminBuscadorComponent],
  template: `
    <header class="bg-white border border-gray-100 mx-4 mt-4 rounded-2xl sticky top-4 z-50"
            style="box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 12px 28px rgba(15,23,42,.06);">
      <nav class="h-14 flex items-center justify-between px-5">

        <div class="flex items-center gap-2">
          <!-- ── Botón menú (solo mobile, <1024px) ── -->
          <button type="button" (click)="menuClick.emit()" class="lg:hidden -ml-1 p-1.5 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Abrir menú">
            <svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              @if (menuOpen) {
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              } @else {
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>

          <!-- ── Marca ── -->
          <a routerLink="/dashboard" class="flex items-center gap-2.5 select-none">
            <img src="/img/logo.png" class="h-10 w-10 object-contain flex-shrink-0" alt="EPSAS"
              onerror="this.style.display='none'" />
            <div class="leading-none">
              <span class="font-bold text-[#007832] text-base tracking-wide block">EPSAS</span>
              <span class="text-xs text-gray-400 font-medium tracking-wide">Panel Administrativo</span>
            </div>
          </a>
        </div>

        <!-- ── Derecha: usuario + campana + avatar ── -->
        <div class="flex items-center gap-3">

          <div class="text-right hidden sm:block">
            <p class="text-sm font-semibold text-gray-800 leading-tight">{{ userNombre() }}</p>
            <p class="text-xs text-gray-400 leading-tight mt-0.5">Administrador Root</p>
          </div>

          <app-admin-buscador />
          <app-admin-campana />

          <!-- Avatar: lleva directo a Configuración. Colores por tokens del tema
               (no clases con hex) para que se lea con cualquier acento y en oscuro. -->
          <a routerLink="/settings" title="Configuración" aria-label="Ir a configuración"
            class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 select-none transition-colors hover:brightness-95"
            style="background:var(--accent-soft);color:var(--accent-text);border:2px solid color-mix(in srgb, var(--accent-brand) 30%, transparent);">
            {{ userInitials() }}
          </a>

        </div>
      </nav>
    </header>
  `,
})
export class AdminNavbarComponent {
  private readonly authService = inject(AdminAuthService);

  @Input() menuOpen = false;
  @Output() menuClick = new EventEmitter<void>();

  readonly userInitials = computed(() => {
    const correo = this.authService.currentUser()?.correo ?? 'A';
    return correo.split('@')[0].slice(0, 2).toUpperCase();
  });

  readonly userNombre = computed(() => {
    const correo = this.authService.currentUser()?.correo ?? 'Administrador';
    return correo.split('@')[0];
  });
}
