import { Component, inject, computed, Input, Output, EventEmitter } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotificacionesCampanaComponent } from './notificaciones-campana.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, NotificacionesCampanaComponent],
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
          <a routerLink="/home" class="flex items-center gap-2.5 select-none">
            <img
              src="/img/logo.png"
              class="h-10 w-10 object-contain flex-shrink-0"
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
            <p class="text-xs text-gray-400 capitalize leading-tight mt-0.5">{{ userCargo() }}</p>
          </div>

          <!-- Campana de notificaciones para TODOS los roles autenticados -->
          @if (estaAutenticado()) {
            <app-notificaciones-campana [cargo]="userCargo()" />
          }

          <!-- Colores por tokens del tema (no clases con el hex fijo): esas clases chocaban con los overrides de ThemeService y el avatar quedaba verde sobre verde. -->
          <!-- Avatar — foto de perfil si el usuario subió una (Ajustes > Perfil), iniciales por defecto.
               Lleva directo a Ajustes: antes abría un menú con una sola opción
               ("Configuración"), o sea un clic de más. -->
          <a routerLink="/settings" title="Configuración" aria-label="Ir a configuración"
            class="w-9 h-9 rounded-full flex items-center justify-center
                   text-sm font-bold flex-shrink-0 select-none cursor-pointer
                   transition-[filter] hover:brightness-95 overflow-hidden"
            style="background:var(--accent-soft);color:var(--accent-text);border:2px solid color-mix(in srgb, var(--accent-brand) 30%, transparent);">
            @if (userFotoUrl()) {
              <img [src]="userFotoUrl()" alt="" class="w-full h-full object-cover" />
            } @else {
              {{ userInitials() }}
            }
          </a>

        </div>
      </nav>
    </header>
  `,
})
export class NavbarComponent {
  private auth = inject(AuthService);

  @Input() menuOpen = false;
  @Output() menuClick = new EventEmitter<void>();

  userName        = computed(() => this.auth.user()?.nombre ?? 'Usuario');
  userCargo       = computed(() => this.auth.user()?.cargo  ?? '');
  userInitials    = computed(() =>
    (this.auth.user()?.nombre ?? 'U')
      .split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  );
  /** Ruta relativa guardada en `Usuario.fotoPerfil` (ver settings.component.ts) → URL completa, o null si no ha subido ninguna. */
  userFotoUrl     = computed(() => {
    const ruta = this.auth.user()?.fotoPerfil;
    return ruta ? `${environment.apiUrl}/${ruta}` : null;
  });
  estaAutenticado = computed(() => this.auth.isAuthenticated());

}
