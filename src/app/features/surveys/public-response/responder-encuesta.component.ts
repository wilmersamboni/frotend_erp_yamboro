import { Component, OnInit, signal, inject, ElementRef, Injector, afterNextRender } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import gsap from 'gsap';

import { EncuestasApiService, FormularioEncuesta } from '../data-access/encuestas-api.service';
import { encuestaYaRespondida, marcarEncuestaRespondida } from '../../../core/utils/encuestas-respondidas.util';

type Vista = 'cargando' | 'formulario' | 'error' | 'ya-respondida';

/**
 * Formulario público que abre el aprendiz (normalmente en el celular, tras
 * escanear el QR). Animaciones GSAP (2026-09-25): las preguntas entran en
 * cascada, una barra "N de M respondidas" avanza con cada respuesta, el
 * botón Sí/No elegido rebota, y el modal de "¡Gracias!" entra con el ✓
 * dibujándose. Todo se desactiva con `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-responder-encuesta',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div class="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

        @if (vista() === 'cargando') {
          <p class="text-center text-sm text-gray-400 py-10">Cargando encuesta...</p>
        }

        @if (vista() === 'error') {
          <div class="text-center py-10">
            <div class="w-14 h-14 mx-auto rounded-2xl bg-red-50 flex items-center justify-center text-2xl mb-4">⚠️</div>
            <p class="text-gray-800 font-semibold">{{ errorMensaje() }}</p>
          </div>
        }

        @if (vista() === 'ya-respondida') {
          <div class="text-center py-10">
            <div class="w-14 h-14 mx-auto rounded-2xl bg-[#39A900]/10 flex items-center justify-center text-2xl mb-4">✅</div>
            <p class="text-gray-800 font-semibold">Ya respondiste esta encuesta desde este dispositivo</p>
            <p class="text-sm text-gray-500 mt-2">Gracias por participar — no es posible responderla dos veces.</p>
            @if (grupoId) {
              <a [routerLink]="['/responder-grupo', grupoId]"
                 class="inline-block mt-4 text-sm font-semibold text-[#39A900] hover:underline">
                ← Volver a la lista de instructores
              </a>
            }
          </div>
        }

        @if (vista() === 'formulario' && formulario()) {
          <div data-anim="cabecera" class="mb-5">
            <h1 class="text-lg font-bold text-gray-900">Encuesta de satisfacción</h1>
            <p class="text-sm text-gray-500 mt-1">
              Ficha {{ formulario()!.numeroFicha }} — Instructor {{ formulario()!.instructorNombre }}
            </p>
            <p class="text-xs text-gray-400 mt-2">Tu respuesta es completamente anónima.</p>
          </div>

          <!-- progreso: fijo arriba al hacer scroll en el celular -->
          <div data-anim="cabecera" class="sticky top-0 z-10 -mx-6 px-6 py-3 mb-4 bg-white/95 backdrop-blur border-b border-gray-100">
            <div class="flex items-center justify-between text-xs mb-1.5">
              <span class="font-medium text-gray-500">Tu progreso</span>
              <span class="font-semibold tabular-nums" [class]="todasRespondidas() ? 'text-[#2d8400]' : 'text-gray-600'">
                {{ cantidadRespondidas() }} de {{ totalPreguntas() }} respondidas
              </span>
            </div>
            <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
              <!-- el ancho lo maneja GSAP (ver actualizarProgreso) -->
              <div data-anim="progreso" class="h-full rounded-full bg-[#39A900]" style="width:0%"></div>
            </div>
          </div>

          <div class="space-y-4">
            @for (p of formulario()!.preguntas; track p.encuestaPreguntaId; let i = $index) {
              <div data-anim="pregunta" class="p-3 rounded-xl border transition-colors"
                [class]="respuestas[p.encuestaPreguntaId] !== undefined ? 'border-[#39A900]/30 bg-[#39A900]/[0.03]' : 'border-gray-100'">
                <p class="text-sm text-gray-800 mb-2">
                  <span class="text-gray-400 font-medium tabular-nums">{{ i + 1 }}.</span> {{ p.texto }}
                </p>
                <div class="flex gap-2">
                  <button
                    (click)="marcar(p.encuestaPreguntaId, true, $event)"
                    [class]="'flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ' +
                      (respuestas[p.encuestaPreguntaId] === true ? 'bg-[#39A900] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')">
                    Sí
                  </button>
                  <button
                    (click)="marcar(p.encuestaPreguntaId, false, $event)"
                    [class]="'flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ' +
                      (respuestas[p.encuestaPreguntaId] === false ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')">
                    No
                  </button>
                </div>
              </div>
            }
          </div>

          @if (enviarError()) {
            <p class="text-xs text-red-600 mt-3">{{ enviarError() }}</p>
          }

          <button
            data-anim="enviar"
            (click)="enviar()"
            [disabled]="!todasRespondidas() || enviando()"
            class="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-white bg-[#39A900]
                   hover:bg-[#2d8400] disabled:opacity-50 transition-colors">
            {{ enviando() ? 'Enviando...' : 'Enviar respuestas' }}
          </button>
        }

      </div>
    </div>

    <!-- ═══════════ Modal: encuesta enviada ═══════════ -->
    @if (mostrarModalGracias()) {
      <div data-anim="gracias-overlay" class="anim-gsap fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div data-anim="gracias-card" class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
          <div data-anim="gracias-icono" class="w-16 h-16 mx-auto rounded-full bg-[#39A900]/10 text-[#2d8400] grid place-items-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path data-anim="gracias-check" d="M20 6 9 17l-5-5"/>
            </svg>
          </div>
          <h2 data-anim="gracias-texto" class="text-lg font-bold text-gray-900">¡Gracias por completar esta encuesta!</h2>
          <p data-anim="gracias-texto" class="text-sm text-gray-500 mt-2">
            Recuerda que todo el proceso es completamente anónimo — nadie, ni siquiera el instructor evaluado,
            puede saber qué respondiste.
          </p>
          @if (grupoId) {
            <a data-anim="gracias-texto" [routerLink]="['/responder-grupo', grupoId]"
               class="block w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#39A900] hover:bg-[#2d8400] transition-colors">
              Responder al siguiente instructor
            </a>
          } @else {
            <p data-anim="gracias-texto" class="text-xs text-gray-400 mt-4">Ya puedes cerrar esta ventana.</p>
          }
        </div>
      </div>
    }
  `,
})
export class ResponderEncuestaComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api   = inject(EncuestasApiService);
  private host  = inject(ElementRef).nativeElement as HTMLElement;
  private injector = inject(Injector);

  readonly reducirMovimiento =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  vista        = signal<Vista>('cargando');
  formulario   = signal<FormularioEncuesta | null>(null);
  errorMensaje = signal('');
  enviarError  = signal('');
  enviando     = signal(false);

  mostrarModalGracias = signal(false);

  respuestas: Record<string, boolean> = {};
  private token = '';
  /** Presente solo si se llegó desde /responder-grupo/:grupoId — habilita el link de "volver". */
  grupoId = '';

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.grupoId = this.route.snapshot.queryParamMap.get('grupo') ?? '';
    if (!this.token) {
      this.mostrarError('Enlace inválido.');
      return;
    }
    if (encuestaYaRespondida(this.token)) {
      this.vista.set('ya-respondida');
      return;
    }
    try {
      const formulario = await this.api.getFormulario(this.token);
      this.formulario.set(formulario);
      this.vista.set('formulario');
      if (!this.reducirMovimiento) {
        afterNextRender(() => this.entrarFormulario(), { injector: this.injector });
      }
    } catch (e: any) {
      this.mostrarError(e?.error?.message ?? 'No se pudo cargar la encuesta.');
    }
  }

  totalPreguntas(): number {
    return this.formulario()?.preguntas.length ?? 0;
  }

  cantidadRespondidas(): number {
    const preguntas = this.formulario()?.preguntas ?? [];
    return preguntas.filter((p) => this.respuestas[p.encuestaPreguntaId] !== undefined).length;
  }

  marcar(encuestaPreguntaId: string, valor: boolean, ev?: Event): void {
    const eraCompleta = this.todasRespondidas();
    this.respuestas[encuestaPreguntaId] = valor;
    this.actualizarProgreso();
    if (this.reducirMovimiento) return;

    const boton = ev?.currentTarget as HTMLElement | undefined;
    if (boton) gsap.fromTo(boton, { scale: 0.9 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', clearProps: 'transform' });

    // Al contestar la última pregunta, el botón de enviar "llama" una vez.
    if (!eraCompleta && this.todasRespondidas()) {
      afterNextRender(() => {
        const enviar = this.host.querySelector('[data-anim="enviar"]');
        if (enviar) gsap.fromTo(enviar, { scale: 1 }, { scale: 1.04, duration: 0.18, yoyo: true, repeat: 1, ease: 'power1.inOut', clearProps: 'transform' });
      }, { injector: this.injector });
    }
  }

  todasRespondidas(): boolean {
    const preguntas = this.formulario()?.preguntas ?? [];
    return preguntas.length > 0 && preguntas.every((p) => this.respuestas[p.encuestaPreguntaId] !== undefined);
  }

  async enviar(): Promise<void> {
    if (!this.todasRespondidas()) return;
    this.enviando.set(true);
    this.enviarError.set('');
    try {
      const respuestas = Object.entries(this.respuestas).map(([encuestaPreguntaId, valor]) => ({
        encuestaPreguntaId,
        valor,
      }));
      await this.api.responder(this.token, respuestas);
      marcarEncuestaRespondida(this.token);
      this.mostrarModalGracias.set(true);
      if (!this.reducirMovimiento) {
        afterNextRender(() => this.entrarGracias(), { injector: this.injector });
      }
    } catch (e: any) {
      this.enviarError.set(e?.error?.message ?? 'No se pudo enviar tu respuesta. Intenta de nuevo.');
    } finally {
      this.enviando.set(false);
    }
  }

  private mostrarError(mensaje: string): void {
    this.errorMensaje.set(mensaje);
    this.vista.set('error');
  }

  // ── 7 · Formulario ────────────────────────────────────────────────
  private entrarFormulario(): void {
    const cabecera = this.host.querySelectorAll('[data-anim="cabecera"]');
    const preguntas = this.host.querySelectorAll('[data-anim="pregunta"]');
    const enviar = this.host.querySelector('[data-anim="enviar"]');
    gsap.from(cabecera, { y: -8, opacity: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out', clearProps: 'transform,opacity' });
    gsap.from(preguntas, { y: 16, opacity: 0, duration: 0.4, stagger: 0.07, delay: 0.1, ease: 'power2.out', clearProps: 'transform,opacity' });
    if (enviar) gsap.from(enviar, { y: 10, opacity: 0, duration: 0.3, delay: 0.1 + preguntas.length * 0.07, clearProps: 'transform,opacity' });
  }

  private actualizarProgreso(): void {
    const barra = this.host.querySelector<HTMLElement>('[data-anim="progreso"]');
    if (!barra) return;
    const total = this.totalPreguntas();
    const pct = total ? (this.cantidadRespondidas() / total) * 100 : 0;
    if (this.reducirMovimiento) barra.style.width = `${pct}%`;
    else gsap.to(barra, { width: `${pct}%`, duration: 0.45, ease: 'power2.out' });
  }

  // ── 8 · Modal "¡Gracias!" ─────────────────────────────────────────
  private entrarGracias(): void {
    const overlay = this.host.querySelector('[data-anim="gracias-overlay"]');
    const card = this.host.querySelector('[data-anim="gracias-card"]');
    const icono = this.host.querySelector('[data-anim="gracias-icono"]');
    const check = this.host.querySelector<SVGPathElement>('[data-anim="gracias-check"]');
    const textos = this.host.querySelectorAll('[data-anim="gracias-texto"]');

    if (overlay) gsap.from(overlay, { opacity: 0, duration: 0.25, clearProps: 'opacity' });
    if (card) gsap.from(card, { scale: 0.85, y: 20, opacity: 0, duration: 0.5, ease: 'back.out(1.8)', clearProps: 'transform,opacity' });
    if (icono) gsap.from(icono, { scale: 0.3, opacity: 0, duration: 0.5, delay: 0.15, ease: 'back.out(2.6)', clearProps: 'transform,opacity' });
    if (check) {
      const largo = check.getTotalLength();
      gsap.fromTo(check, { strokeDasharray: largo, strokeDashoffset: largo }, { strokeDashoffset: 0, duration: 0.5, delay: 0.4, ease: 'power2.out' });
    }
    gsap.from(textos, { y: 10, opacity: 0, duration: 0.35, stagger: 0.08, delay: 0.35, ease: 'power2.out', clearProps: 'transform,opacity' });
  }
}
