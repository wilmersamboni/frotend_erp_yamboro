import { Component, HostListener, computed, inject, signal, Input, Output, EventEmitter } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminAuthService } from '../../core/admin-auth/admin-auth.service';

@Component({
  selector: 'app-admin-navbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="bg-white border-b border-gray-100 sticky top-0 z-50"
            style="box-shadow: 0 1px 8px 0 rgba(0,0,0,.06);">
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
            <img
              src="/img/logo.png"
              class="h-8 w-8 object-contain flex-shrink-0"
              alt="EPSAS"
              onerror="this.style.display='none'"
            />
            <div class="leading-none">
              <span class="font-bold text-[#007832] text-base tracking-wide block">EPSAS</span>
              <span class="text-[10px] text-gray-400 font-medium tracking-wide">Panel Administrativo</span>
            </div>
          </a>
        </div>

        <!-- ── Derecha: campana + usuario ── -->
        <div class="flex items-center gap-3">

          <!-- Campana (admin — sin tenant, sin polling) -->
          <div class="relative">
            <button type="button" (click)="toggleNotif($event)"
              class="relative w-9 h-9 rounded-full flex items-center justify-center
                     hover:bg-gray-100 transition-colors focus:outline-none"
              title="Notificaciones del sistema">
              <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0
                     00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0
                     .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
            </button>

            @if (notifOpen()) {
              <div class="absolute right-0 top-11 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[200] overflow-hidden"
                   (click)="$event.stopPropagation()">
                <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span class="text-sm font-bold text-gray-800">Notificaciones</span>
                </div>
                <div class="px-4 py-8 text-center">
                  <div class="text-3xl mb-2">🔔</div>
                  <p class="text-sm text-gray-500">Sin notificaciones nuevas</p>
                </div>
              </div>
            }
          </div>

          <!-- Separador -->
          <div class="w-px h-6 bg-gray-200"></div>

          <!-- Nombre + cargo + avatar -->
          <div class="text-right hidden sm:block">
            <p class="text-sm font-semibold text-gray-800 leading-tight">{{ userNombre() }}</p>
            <p class="text-[11px] text-gray-400 leading-tight mt-0.5 capitalize">Administrador Root</p>
          </div>

          <div class="w-9 h-9 rounded-full flex items-center justify-center
                      text-sm font-bold flex-shrink-0 select-none
                      bg-[#007832]/10 text-[#007832] border-2 border-[#007832]/20">
            {{ userInitials() }}
          </div>

        </div>
      </nav>
    </header>
  `,
})
export class AdminNavbarComponent {
  private readonly authService = inject(AdminAuthService);

  @Input() menuOpen = false;
  @Output() menuClick = new EventEmitter<void>();

  readonly notifOpen = signal(false);

  readonly userInitials = computed(() => {
    const correo = this.authService.currentUser()?.correo ?? 'A';
    return correo.split('@')[0].slice(0, 2).toUpperCase();
  });

  readonly userNombre = computed(() => {
    const correo = this.authService.currentUser()?.correo ?? 'Administrador';
    return correo.split('@')[0];
  });

  toggleNotif(event: Event): void {
    event.stopPropagation();
    this.notifOpen.update((v) => !v);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.notifOpen.set(false);
  }
}
