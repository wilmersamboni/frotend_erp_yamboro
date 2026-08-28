import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { EncuestasApiService, FormularioEncuesta } from '../../../core/services/encuestas/encuestas-api.service';
import { encuestaYaRespondida, marcarEncuestaRespondida } from '../../../core/utils/encuestas-respondidas.util';

type Vista = 'cargando' | 'formulario' | 'error' | 'ya-respondida';

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
          <div class="mb-5">
            <h1 class="text-lg font-bold text-gray-900">Encuesta de satisfacción</h1>
            <p class="text-sm text-gray-500 mt-1">
              Ficha {{ formulario()!.numeroFicha }} — Instructor {{ formulario()!.instructorNombre }}
            </p>
            <p class="text-xs text-gray-400 mt-2">Tu respuesta es completamente anónima.</p>
          </div>

          <div class="space-y-4">
            @for (p of formulario()!.preguntas; track p.encuestaPreguntaId) {
              <div class="p-3 rounded-xl border border-gray-100">
                <p class="text-sm text-gray-800 mb-2">{{ p.texto }}</p>
                <div class="flex gap-2">
                  <button
                    (click)="marcar(p.encuestaPreguntaId, true)"
                    [class]="'flex-1 py-2 rounded-lg text-sm font-semibold transition-all ' +
                      (respuestas[p.encuestaPreguntaId] === true ? 'bg-[#39A900] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')">
                    Sí
                  </button>
                  <button
                    (click)="marcar(p.encuestaPreguntaId, false)"
                    [class]="'flex-1 py-2 rounded-lg text-sm font-semibold transition-all ' +
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
            (click)="enviar()"
            [disabled]="!todasRespondidas() || enviando()"
            class="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-white bg-[#39A900]
                   hover:bg-[#2d8400] disabled:opacity-50 transition-all">
            {{ enviando() ? 'Enviando...' : 'Enviar respuestas' }}
          </button>
        }

      </div>
    </div>

    <!-- ═══════════ Modal: encuesta enviada ═══════════ -->
    @if (mostrarModalGracias()) {
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
          <div class="w-16 h-16 mx-auto rounded-2xl bg-[#39A900]/10 flex items-center justify-center text-3xl mb-4">✅</div>
          <h2 class="text-lg font-bold text-gray-900">¡Gracias por completar esta encuesta!</h2>
          <p class="text-sm text-gray-500 mt-2">
            Recuerda que todo el proceso es completamente anónimo — nadie, ni siquiera el instructor evaluado,
            puede saber qué respondiste.
          </p>
          @if (grupoId) {
            <a [routerLink]="['/responder-grupo', grupoId]"
               class="block w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#39A900] hover:bg-[#2d8400] transition-all">
              Responder al siguiente instructor
            </a>
          } @else {
            <p class="text-xs text-gray-400 mt-4">Ya puedes cerrar esta ventana.</p>
          }
        </div>
      </div>
    }
  `,
})
export class ResponderEncuestaComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api   = inject(EncuestasApiService);

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
    } catch (e: any) {
      this.mostrarError(e?.error?.message ?? 'No se pudo cargar la encuesta.');
    }
  }

  marcar(encuestaPreguntaId: string, valor: boolean): void {
    this.respuestas[encuestaPreguntaId] = valor;
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
}
