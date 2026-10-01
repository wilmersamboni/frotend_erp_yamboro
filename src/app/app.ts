import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FloatingButtons } from './shell/floating-controls/floating-buttons';
import { TuiRoot } from '@taiga-ui/core';
import { ThemeService } from './core/services/theme.service';
import { NgxSonnerToaster } from 'ngx-sonner';
import { SyncStatusBadgeComponent } from './shared/components/sync-status-badge.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, FloatingButtons, TuiRoot, NgxSonnerToaster, SyncStatusBadgeComponent],
  template: `
    <tui-root>
      <!-- Avisos globales (ToastService -> Sonner) y confirmaciones (ConfirmService -> Spartan,
           se abre por codigo en un overlay del CDK: no necesita marcado aqui). -->
      <!-- offset 72px: la barra superior mide 56px; sin esto el aviso tapaba el perfil y las notificaciones. -->
      <ngx-sonner-toaster position="top-right" [offset]="72" [closeButton]="true" [toastOptions]="toastOptions" />
      <router-outlet></router-outlet>
      <!-- Oculto en /responder/:token: el botón flotante tapa las opciones
           Sí/No del formulario en móvil y no aporta nada en ese flujo público. -->
      @if (mostrarBotFlotante()) {
        <app-floating-buttons></app-floating-buttons>
      }
      <!-- Escaneo offline (ver plan): invisible salvo que haya algo pendiente
           o en conflicto en la cola de sync — no depende de mostrarBotFlotante. -->
      <app-sync-status-badge></app-sync-status-badge>
    </tui-root>
  `
})
export class AppComponent implements OnInit {
  private theme = inject(ThemeService);
  private router = inject(Router);

  /** Avisos con el aspecto del Alert de Spartan: tarjeta blanca con borde y texto del color del tipo. */
  readonly toastOptions = {
    classes: {
      toast: '!rounded-xl !border !border-gray-200 !bg-white !shadow-lg !text-sm',
      title: '!font-medium',
      description: '!text-inherit !opacity-80',
      error: '!text-red-600',
      warning: '!bg-amber-50 !border-amber-200 !text-amber-900',
      success: '!text-emerald-700',
      info: '!text-sky-700',
    },
  };

  mostrarBotFlotante = signal(true);

  ngOnInit(): void {
    this.theme.apply();  // aplica color, fuente y modo oscuro desde localStorage al inicio

    this.actualizarVisibilidadBot(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.actualizarVisibilidadBot(e.urlAfterRedirects));
  }

  private actualizarVisibilidadBot(url: string): void {
    this.mostrarBotFlotante.set(!url.startsWith('/responder/'));
  }
}
