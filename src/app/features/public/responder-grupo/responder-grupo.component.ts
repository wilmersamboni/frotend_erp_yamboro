import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { EncuestasApiService, EncuestaDeGrupoPublico } from '../../../core/services/encuestas/encuestas-api.service';
import { encuestaYaRespondida } from '../../../core/utils/encuestas-respondidas.util';

type Vista = 'cargando' | 'listado' | 'error';

/**
 * Punto de entrada del link/QR único por grupo de encuesta. Totalmente
 * anónimo: no exige sesión (ver app.routes.ts). Como no hay personaId, no
 * se puede resolver "el siguiente pendiente" ni tachar los ya respondidos
 * — se listan todos los instructores del grupo y el aprendiz elige a cuál
 * responder, uno por uno, vía /responder/:token.
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
          <div class="mb-5">
            <h1 class="text-lg font-bold text-gray-900">Encuestas de satisfacción</h1>
            <p class="text-sm text-gray-500 mt-1">Ficha {{ encuestas()[0]?.numeroFicha }}</p>
            <p class="text-xs text-gray-400 mt-2">Elige un instructor para responder. Tu respuesta es completamente anónima.</p>
          </div>

          <div class="space-y-2">
            @for (e of encuestas(); track e.token) {
              @if (yaRespondida(e.token)) {
                <div class="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50">
                  <span class="text-sm text-gray-500">{{ e.instructorNombre }}</span>
                  <span class="flex items-center gap-1 text-xs font-semibold text-[#39A900]">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    Respondida
                  </span>
                </div>
              } @else if (e.estado === 'ACTIVA') {
                <a [routerLink]="['/responder', e.token]" [queryParams]="{ grupo: grupoId }"
                   class="group flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:border-[#39A900] hover:shadow-md active:scale-[0.99] transition-all">
                  <span class="text-sm text-gray-800 font-medium">{{ e.instructorNombre }}</span>
                  <span class="flex items-center gap-1.5 text-sm font-semibold text-[#39A900]">
                    Responder
                    <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                  </span>
                </a>
              } @else {
                <div class="flex items-center justify-between p-4 rounded-xl border border-gray-100 opacity-50">
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

  vista        = signal<Vista>('cargando');
  errorMensaje = signal('');
  encuestas    = signal<EncuestaDeGrupoPublico[]>([]);
  grupoId      = '';

  yaRespondida = encuestaYaRespondida;

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
    } catch (e: any) {
      this.mostrarError(e?.error?.message ?? 'No se pudo cargar el grupo de encuestas.');
    }
  }

  private mostrarError(mensaje: string): void {
    this.errorMensaje.set(mensaje);
    this.vista.set('error');
  }
}
