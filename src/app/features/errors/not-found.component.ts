import { Component, OnInit, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class NotFoundComponent implements OnInit, OnDestroy {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  clockInterval: ReturnType<typeof setInterval> | undefined;

  /**
   * La dirección que pidió el usuario. Toda ruta desconocida redirige a `/404`
   * (`app.routes.ts`), así que la URL actual ya no la tiene: se toma la URL
   * inicial de la navegación en curso, que es la de antes de la redirección.
   */
  readonly ruta: string =
    this.router.currentNavigation()?.initialUrl?.toString() ??
    this.router.lastSuccessfulNavigation()?.initialUrl?.toString() ??
    window.location.pathname;

  private readonly moverCursor = (e: MouseEvent) => {
    const cursor = document.getElementById('cursor');
    if (cursor) {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    }
  };

  ngOnInit() {
    document.addEventListener('mousemove', this.moverCursor);
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  updateClock() {
    const clock = document.getElementById('clock');
    if (clock) {
      const now = new Date();
      clock.textContent = now.toTimeString().slice(0, 8);
    }
  }

  /** Si se abrió la 404 directo (sin página anterior), "Volver" lleva al inicio. */
  volver(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/');
  }

  ngOnDestroy() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    // Antes no se quitaba: cada visita a la 404 dejaba otro listener vivo en todo el documento.
    document.removeEventListener('mousemove', this.moverCursor);
  }
}
