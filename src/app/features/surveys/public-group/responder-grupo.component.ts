import { Component, OnInit, signal, inject, ElementRef, Injector, afterNextRender } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import gsap from 'gsap';

import { EncuestasApiService, EncuestaDeGrupoPublico } from '../data-access/encuestas-api.service';
import { encuestaYaRespondida } from '../../../core/utils/encuestas-respondidas.util';

type Vista = 'cargando' | 'listado' | 'error';

/**
 * Punto de entrada del link/QR único por grupo de encuesta. Totalmente
 * anónimo: no exige sesión (ver app.routes.ts). Como no hay personaId, no
 * se puede resolver "el siguiente pendiente" ni tachar los ya respondidos
 * — se listan todos los instructores del grupo y el aprendiz elige a cuál
 * responder, uno por uno, vía /responder/:token.
 *
 * Animaciones GSAP (2026-09-25): al volver de responder a un instructor,
 * la lista entra en cascada, la barra "N de M respondidas" avanza desde 0
 * y los "✓ Respondida" aparecen con un rebote — así se nota el avance al
 * pasar de un instructor al siguiente. Desactivadas con prefers-reduced-motion.
 */
@Component({
  selector: 'app-responder-grupo',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div class="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

        @if (vista() === 'cargando') {
          <p class="text-center text-sm text-gray-400 py-10">Cargando encuestas del grupo...</p>
        }

        @if (vista() === 'error') {
          <div class="text-center py-10">
            <div class="w-14 h-14 mx-auto rounded-2xl bg-red-50 flex items-center justify-center text-2xl mb-4">⚠️</div>
            <p class="text-gray-800 font-semibold">{{ errorMensaje() }}</p>
          </div>
        }

        @if (vista() === 'listado') {
          <div data-anim="cabecera" class="mb-5">
            <h1 class="text-lg font-bold text-gray-900">Encuestas de satisfacción</h1>
            <p class="text-sm text-gray-500 mt-1">Ficha {{ encuestas()[0]?.numeroFicha }}</p>
            <p class="text-xs text-gray-400 mt-2">Elige un instructor para responder. Tu respuesta es completamente anónima.</p>
          </div>

          @if (encuestas().length > 0) {
            <div data-anim="cabecera" class="mb-4">
              <div class="flex items-center justify-between text-xs mb-1.5">
                <span class="font-medium text-gray-500">Tu avance</span>
                <span class="font-semibold tabular-nums" [class]="respondidas() === encuestas().length ? 'text-[#2d8400]' : 'text-gray-600'">
                  {{ respondidas() }} de {{ encuestas().length }} respondidas
                </span>
              </div>
              <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div data-anim="avance" class="h-full rounded-full bg-[#39A900]"
                  [style.width.%]="(respondidas() / encuestas().length) * 100"></div>
              </div>
              @if (respondidas() === encuestas().length) {
                <p class="text-xs text-[#2d8400] font-medium mt-2">¡Listo! Respondiste a todos los instructores. Ya puedes cerrar esta ventana.</p>
              }
            </div>
          }

          <div class="space-y-2">
            @for (e of encuestas(); track e.token) {
              @if (yaRespondida(e.token)) {
                <div data-anim="instructor" class="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50">
                  <span class="text-sm text-gray-500">{{ e.instructorNombre }}</span>
                  <span data-anim="respondida" class="flex items-center gap-1 text-xs font-semibold text-[#39A900]">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    Respondida
                  </span>
                </div>
              } @else if (e.estado === 'ACTIVA') {
                <a data-anim="instructor" [routerLink]="['/responder', e.token]" [queryParams]="{ grupo: grupoId }"
                   class="group flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:border-[#39A900] hover:shadow-md active:scale-[0.99] transition-all">
                  <span class="text-sm text-gray-800 font-medium">{{ e.instructorNombre }}</span>
                  <span class="flex items-center gap-1.5 text-sm font-semibold text-[#39A900]">
                    Responder
                    <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                  </span>
                </a>
              } @else {
                <div data-anim="instructor" class="flex items-center justify-between p-4 rounded-xl border border-gray-100 opacity-50">
                  <span class="text-sm text-gray-600">{{ e.instructorNombre }}</span>
                  <span class="text-xs text-gray-400">Cerrada</span>
                </div>
              }
            }
          </div>
        }

      </div>
    </div>
  `,
})
export class ResponderGrupoComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api   = inject(EncuestasApiService);
  private host  = inject(ElementRef).nativeElement as HTMLElement;
  private injector = inject(Injector);

  readonly reducirMovimiento =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  vista        = signal<Vista>('cargando');
  errorMensaje = signal('');
  encuestas    = signal<EncuestaDeGrupoPublico[]>([]);
  grupoId      = '';

  yaRespondida = encuestaYaRespondida;

  respondidas(): number {
    return this.encuestas().filter((e) => encuestaYaRespondida(e.token)).length;
  }

  async ngOnInit(): Promise<void> {
    this.grupoId = this.route.snapshot.paramMap.get('grupoId') ?? '';
    if (!this.grupoId) {
      this.mostrarError('Enlace inválido.');
      return;
    }
    try {
      const encuestas = await this.api.getGrupoPublico(this.grupoId);
      this.encuestas.set(encuestas);
      this.vista.set('listado');
      if (!this.reducirMovimiento) {
        afterNextRender(() => this.entrarListado(), { injector: this.injector });
      }
    } catch (e: any) {
      this.mostrarError(e?.error?.message ?? 'No se pudo cargar el grupo de encuestas.');
    }
  }

  private entrarListado(): void {
    const cabecera = this.host.querySelectorAll('[data-anim="cabecera"]');
    const instructores = this.host.querySelectorAll('[data-anim="instructor"]');
    const respondidas = this.host.querySelectorAll('[data-anim="respondida"]');
    const avance = this.host.querySelector('[data-anim="avance"]');

    gsap.from(cabecera, { y: -8, opacity: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out', clearProps: 'transform,opacity' });
    gsap.from(instructores, { x: 24, opacity: 0, duration: 0.4, stagger: 0.07, delay: 0.1, ease: 'power2.out', clearProps: 'transform,opacity' });
    // Sin clearProps: el ancho final es el que Angular puso en [style.width.%].
    if (avance) gsap.from(avance, { width: 0, duration: 0.8, delay: 0.2, ease: 'power2.out' });
    gsap.from(respondidas, { scale: 0.5, opacity: 0, duration: 0.4, stagger: 0.07, delay: 0.35, ease: 'back.out(2.6)', clearProps: 'transform,opacity' });
  }

  private mostrarError(mensaje: string): void {
    this.errorMensaje.set(mensaje);
    this.vista.set('error');
  }
}
