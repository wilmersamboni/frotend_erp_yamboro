import { Component, inject, computed, signal, ElementRef, HostListener, Input, Output, EventEmitter } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotificacionesCampanaComponent } from './notificaciones-campana.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, NotificacionesCampanaComponent],
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
          <a routerLink="/home" class="flex items-center gap-2.5 select-none">
            <img
              src="/img/logo.png"
              class="h-8 w-8 object-contain flex-shrink-0"
              alt="EPSAS"
              onerror="this.style.display='none'"
            />
            <span class="font-bold text-[#007832] text-base tracking-wide leading-none">
              EPSAS
            </span>
          </a>
        </div>

        <!-- ── Usuario ── -->
        <div class="flex items-center gap-3">

          <!-- Nombre y cargo (ocultos en móvil) -->
          <div class="text-right hidden sm:block">
            <p class="text-sm font-semibold text-gray-800 leading-tight">{{ userName() }}</p>
            <p class="text-[11px] text-gray-400 capitalize leading-tight mt-0.5">{{ userCargo() }}</p>
          </div>

          <!-- Campana de notificaciones para TODOS los roles autenticados -->
          @if (estaAutenticado()) {
            <app-notificaciones-campana [cargo]="userCargo()" />
          }

          <!-- Avatar con iniciales — despliega el menú de cuenta -->
          <div class="relative">
            <button type="button" (click)="toggleMenu($event)"
              class="w-9 h-9 rounded-full flex items-center justify-center
                     text-sm font-bold flex-shrink-0 select-none cursor-pointer
                     bg-[#007832]/10 text-[#007832] border-2 border-[#007832]/20
                     hover:bg-[#007832]/20 transition-colors">
              {{ userInitials() }}
            </button>

            @if (menuAbierto()) {
              <div class="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl border border-gray-100 shadow-lg py-1.5 z-50">
                <a routerLink="/settings" (click)="menuAbierto.set(false)"
                  class="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#007832] transition-colors">
                  <svg class="w-[16px] h-[16px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  Configuración
                </a>
              </div>
            }
          </div>

        </div>
      </nav>
    </header>
  `,
})
export class NavbarComponent {
  private auth = inject(AuthService);
  private el    = inject(ElementRef);

  @Input() menuOpen = false;
  @Output() menuClick = new EventEmitter<void>();

  userName        = computed(() => this.auth.user()?.nombre ?? 'Usuario');
  userCargo       = computed(() => this.auth.user()?.cargo  ?? '');
  userInitials    = computed(() =>
    (this.auth.user()?.nombre ?? 'U')
      .split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  );
  estaAutenticado = computed(() => this.auth.isAuthenticated());

  menuAbierto = signal(false);

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuAbierto.update(v => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    if (this.menuAbierto() && !this.el.nativeElement.contains(event.target)) {
      this.menuAbierto.set(false);
    }
  }
}
