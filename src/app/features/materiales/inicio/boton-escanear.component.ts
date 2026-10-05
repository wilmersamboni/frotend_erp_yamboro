import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { LucideAngularModule, ScanLine } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { SERVICIOS_ENTRADA } from '../materiales-acceso';

/**
 * Botón flotante "Escanear" (2026-10-05): en todas las pantallas de
 * Materiales, abajo a la derecha (donde llega el pulgar en el celular).
 * En pantallas anchas es una píldora con texto; en el celular, un círculo.
 * Un anillo suave late para que se note sin molestar. No aparece en la
 * propia pantalla de escanear ni a quien no usa Materiales.
 */
@Component({
  selector: 'app-boton-escanear',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  styles: [`
    .fab { background-color: var(--accent-brand); }
    .anillo { animation: latido 2.4s ease-out infinite; }
    @keyframes latido {
      0% { transform: scale(1); opacity: .45; }
      70% { transform: scale(1.35); opacity: 0; }
      100% { transform: scale(1.35); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) { .anillo { animation: none; opacity: 0; } }
  `],
  template: `
    @if (visible()) {
      <a routerLink="/materiales/escanear" aria-label="Escanear placa" title="Escanear placa"
        class="group fixed bottom-5 right-5 z-40 print:hidden">
        <span class="anillo absolute inset-0 rounded-full fab" aria-hidden="true"></span>
        <span class="fab relative flex h-14 items-center gap-2.5 rounded-full px-4 sm:pr-5 text-white shadow-[0_10px_25px_-8px_rgba(42,125,0,.7)] ring-4 ring-white transition group-hover:shadow-[0_14px_30px_-8px_rgba(42,125,0,.8)] group-hover:-translate-y-0.5">
          <lucide-icon [img]="icono" [size]="24"></lucide-icon>
          <span class="hidden sm:inline text-sm font-semibold">Escanear</span>
        </span>
      </a>
    }
  `,
})
export class BotonEscanearComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly url = signal(this.router.url);
  readonly icono = ScanLine;

  readonly visible = computed(() => {
    const u = this.url().split('?')[0];
    const enMateriales = u.startsWith('/materiales/') || u === '/mi-bodega';
    return enMateriales && u !== '/materiales/escanear' && SERVICIOS_ENTRADA.some((s) => this.auth.tieneServicio(s));
  });

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }
}
