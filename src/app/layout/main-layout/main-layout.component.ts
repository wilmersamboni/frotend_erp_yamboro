import { Component, OnInit, signal, inject, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { AprendizContextService } from '../../core/services/aprendiz-context.service';

/**
 * Equivalente al DefaultLayout de React:
 *
 *   export default function DefaultLayout({ children }) {
 *     const [open, setOpen] = useState(false);
 *     return (
 *       <div className="flex h-screen">
 *         <div onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
 *           <Sidebar open={open} />
 *         </div>
 *         <div className="flex flex-col flex-1 ...">
 *           <Navbar />
 *           <main>{children}</main>
 *         </div>
 *       </div>
 *     );
 *   }
 *
 * En Angular, {children} se reemplaza por <router-outlet>.
 */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, SidebarComponent],
  template: `
    <div class="flex h-screen">

      <!-- Backdrop del drawer mobile -->
      @if (mobileMenuOpen()) {
        <div class="fixed inset-0 bg-black/40 z-[60] lg:hidden" (click)="mobileMenuOpen.set(false)"></div>
      }

      <!-- SIDEBAR (expande/colapsa al hover en desktop; drawer en mobile) -->
      <div
        (mouseenter)="sidebarOpen.set(true)"
        (mouseleave)="sidebarOpen.set(false)"
        (click)="onSidebarAreaClick($event)"
        class="h-screen"
      >
        <app-sidebar [open]="sidebarOpen() || mobileMenuOpen()" [mobileOpen]="mobileMenuOpen()" />
      </div>

      <!-- CONTENIDO DERECHO -->
      <div class="flex flex-col flex-1 min-h-screen overflow-hidden bg-[#F0F2F5]">

        <!-- NAVBAR -->
        <app-navbar (menuClick)="mobileMenuOpen.update(v => !v)" [menuOpen]="mobileMenuOpen()" />

        <!-- PÁGINA ACTIVA — equivale a {children} en React -->
        <main class="p-6 flex-1 overflow-y-auto bg-[#EEF2F7]">
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

  /** Evita que el drawer mobile quede abierto tapando la página tras navegar. */
  private readonly closeOnBodyScrollLock = effect(() => {
    document.body.style.overflow = this.mobileMenuOpen() ? 'hidden' : '';
  });

  ngOnInit(): void {
    // Se carga una sola vez por sesión — el sidebar y el home lo leen del
    // mismo signal, así que solo se pide al backend una vez.
    this.aprendizContext.cargar();
  }

  /** Cierra el drawer mobile al hacer click en cualquier link de navegación. */
  onSidebarAreaClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('a')) {
      this.mobileMenuOpen.set(false);
    }
  }
}
