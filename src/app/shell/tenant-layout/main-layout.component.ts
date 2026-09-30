import { Component, OnInit, signal, inject, effect, computed, DestroyRef } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NavbarComponent } from '../tenant-navbar/navbar.component';
import { SidebarComponent } from '../tenant-sidebar/sidebar.component';
import { AprendizContextService } from '../../core/services/aprendiz-context.service';

/**
 * sidebarOpen se controla 100% manual, vía el evento (toggle) que emite el
 * propio botón hamburguesa dentro de SidebarComponent — antes se abría/
 * cerraba solo con el mouse (mouseenter/mouseleave en este wrapper), pero
 * eso chocaba con el diseño de sidebar flotante nuevo.
 */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, NavbarComponent, SidebarComponent],
  template: `
    <div class="flex h-screen bg-[#F0F2F5]">

      <!-- Backdrop del drawer mobile -->
      @if (mobileMenuOpen()) {
        <div class="fixed inset-0 bg-black/40 z-[60] lg:hidden" (click)="mobileMenuOpen.set(false)"></div>
      }

      <!-- SIDEBAR (expande/colapsa con la hamburguesa propia; drawer en mobile) -->
      <div
        (click)="onSidebarAreaClick($event)"
        class="h-screen"
      >
        <app-sidebar
          [open]="sidebarOpen() || mobileMenuOpen()"
          [mobileOpen]="mobileMenuOpen()"
          (toggle)="onSidebarToggle()"
        />
      </div>

      <!-- CONTENIDO DERECHO -->
      <div class="flex flex-col flex-1 min-w-0 min-h-screen overflow-hidden bg-[#F0F2F5]">

        <!-- NAVBAR -->
        <app-navbar (menuClick)="mobileMenuOpen.update(v => !v)" [menuOpen]="mobileMenuOpen()" />

        <!-- PÁGINA ACTIVA — equivale a {children} en React.
             El gris (#F0F2F5, del div padre) queda como gutter alrededor vía
             MARGEN — a propósito, para no meter un div intermedio entre main
             y router-outlet: varias páginas (Horarios, Programador de
             Eventos) dependen de una cadena de alturas (h-full/flex-1) que
             asume a main como su padre directo con overflow-y-auto; un
             wrapper de por medio con solo min-height rompe esa cadena
             (min-height no resuelve height:100% de los hijos) y las deja
             "encerradas"/con scroll interno raro.
             El padding (p-4/p-6) SÍ vuelve a vivir acá, además del margen:
             no todas las páginas traen su propio relleno interno — las
             portadas de ChronoGest (Inicio, Horarios, Programador de
             Eventos) arrancan su template directo en <div class="page-header">
             sin ningún p-6 propio, asumiendo que el <main> de siempre se lo
             daba. Sin este padding, su título quedaba pegado (y recortado)
             contra la esquina redondeada nueva. Para las páginas que SÍ
             traen su propio p-6 (Vencimientos, Novedades...) esto solo
             suma un poco más de aire, no rompe nada. -->
        <main class="pretty-scroll m-4 lg:m-6 p-4 lg:p-6 flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          @if (mostrarMiga()) {
            <nav aria-label="Migas de pan" class="mb-4 flex items-center gap-2 text-sm text-gray-500">
              <a routerLink="/home" class="hover:text-[#39A900]">Inicio</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page" class="font-semibold text-gray-800">{{ etiquetaRuta() }}</span>
            </nav>
          }
          <router-outlet />
        </main>

        <!-- FOOTER (comentado en el original, disponible aquí) -->
        <!-- <app-footer /> -->
      </div>
    </div>
  `,
})
export class MainLayoutComponent implements OnInit {
  sidebarOpen = signal(false);
  mobileMenuOpen = signal(false);
  private aprendizContext = inject(AprendizContextService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private ruta = signal(this.router.url.split('?')[0]);
  readonly mostrarMiga = computed(() => this.ruta() !== '/home' && !this.ruta().includes('/materiales'));
  readonly etiquetaRuta = computed(() => {
    const segmento = this.ruta().split('/').filter(Boolean).at(-1) ?? 'Inicio';
    const etiquetas: Record<string, string> = {
      seguimiento: 'Seguimiento', docs: 'Historial del aprendiz', format: 'Formatos',
      blog: 'Asistente', admin: 'Administración', settings: 'Configuración', migracion: 'Migración',
      horarios: 'Horarios', 'programador-eventos': 'Programador de eventos',
      'mis-horarios': 'Mis horarios', 'aprendiz-mis-horarios': 'Mis horarios',
      encuestas: 'Encuestas', preguntas: 'Preguntas de encuesta',
    };
    return etiquetas[segmento] ?? segmento.replace(/-/g, ' ');
  });

  /** Evita que el drawer mobile quede abierto tapando la página tras navegar. */
  private readonly closeOnBodyScrollLock = effect(() => {
    document.body.style.overflow = this.mobileMenuOpen() ? 'hidden' : '';
  });

  ngOnInit(): void {
    // Se carga una sola vez por sesión — el sidebar y el home lo leen del
    // mismo signal, así que solo se pide al backend una vez.
    this.aprendizContext.cargar();
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((event) => this.ruta.set(event.urlAfterRedirects.split('?')[0]));
  }

  /** Cierra el drawer mobile al hacer click en cualquier link de navegación. */
  onSidebarAreaClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('a')) {
      this.mobileMenuOpen.set(false);
    }
  }

  /**
   * La hamburguesa DENTRO del sidebar hace dos cosas distintas según el
   * contexto — antes siempre tocaba sidebarOpen, que en mobile no tiene
   * ningún efecto visible porque `open` ya viene forzado a true por
   * mobileMenuOpen() (ver el binding arriba), así que el botón parecía no
   * responder cuando en realidad el usuario esperaba que cerrara el drawer.
   */
  onSidebarToggle(): void {
    if (this.mobileMenuOpen()) {
      this.mobileMenuOpen.set(false);
    } else {
      this.sidebarOpen.update(v => !v);
    }
  }
}
