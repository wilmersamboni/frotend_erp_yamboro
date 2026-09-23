import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FloatingButtons } from './shell/floating-controls/floating-buttons';
import { TuiRoot } from '@taiga-ui/core';
import { ThemeService } from './core/services/theme.service';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SyncStatusBadgeComponent } from './shared/components/sync-status-badge.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, FloatingButtons, TuiRoot, ToastModule, ConfirmDialogModule, SyncStatusBadgeComponent],
  template: `
    <tui-root>
      <!-- Toast global — todas las features lo comparten -->
      <p-toast position="top-right" [baseZIndex]="9999" />
      <!-- Diálogo de confirmación global (Ronda 6): ConfirmationService es
           singleton, así que un solo <p-confirmDialog> montado acá sirve para
           cualquier feature que no monte el suyo propio (ej. Materiales). -->
      <p-confirmDialog [baseZIndex]="10000" />
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
