import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ToastService, mensajeDeError } from '../../../core/services/toast.service';

type Clasificacion =
  | 'habilitable'
  | 'ya_habilitada'
  | 'faltan_competencias'
  | 'estado_no_aplica'
  | 'practica_aprobada'
  | 'sin_competencia_practica'
  | 'sin_matricula';

interface AprendizJuicio {
  documento: string;
  nombre: string;
  estadoReporte: string;
  clasificacion: Clasificacion;
  pendientes: { competencia: string; resultado: string }[];
  matriculaId: string | null;
}

interface AnalisisJuicios {
  ficha: string;
  programa: string | null;
  estadoFicha: string | null;
  fechaReporte: string | null;
  totales: Record<Clasificacion, number> & { total: number };
  aprendices: AprendizJuicio[];
}

interface ResultadoConfirmacion {
  ficha: string;
  habilitados: { documento: string; nombre: string }[];
  fallidos: { documento: string; nombre: string; motivo: string }[];
  sinCambio: number;
}

type Filtro = 'todos' | 'habilitables' | 'no_cumplen';

const ETIQUETA: Record<Clasificacion, { texto: string; clase: string }> = {
  habilitable:              { texto: 'Habilitable',            clase: 'bg-green-100 text-green-800' },
  ya_habilitada:            { texto: 'Ya habilitada',          clase: 'bg-gray-100 text-gray-600' },
  faltan_competencias:      { texto: 'Le faltan competencias', clase: 'bg-amber-100 text-amber-800' },
  estado_no_aplica:         { texto: 'No aplica',              clase: 'bg-gray-100 text-gray-600' },
  practica_aprobada:        { texto: 'Práctica aprobada',      clase: 'bg-gray-100 text-gray-600' },
  sin_competencia_practica: { texto: 'Sin competencia de práctica', clase: 'bg-gray-100 text-gray-600' },
  sin_matricula:            { texto: 'No encontrado',          clase: 'bg-red-100 text-red-800' },
};

const MAX_BYTES = 10 * 1024 * 1024;

@Component({
  selector: 'app-juicios-evaluativos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-5xl mx-auto p-6 space-y-5">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Juicios Evaluativos</h2>
        <p class="text-sm text-gray-500 mt-1">
          Sube el reporte de juicios evaluativos de una ficha para habilitar la etapa práctica de los aprendices
          que solo tienen pendiente esa competencia.
        </p>
      </div>

      @if (resultado(); as r) {
        <!-- ═══ Resultado ═══ -->
        <div class="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
          <p class="font-semibold text-gray-900">
            {{ r.habilitados.length }} {{ r.habilitados.length === 1 ? 'aprendiz habilitado' : 'aprendices habilitados' }}
            en la ficha {{ r.ficha }}
          </p>
          @if (r.habilitados.length) {
            <p class="text-sm text-gray-500">
              Cada uno recibió la notificación de resultados aprobados y ya puede iniciar su etapa práctica: en la tabla
              de aprendices de Etapa Práctica se activa el botón "Crear etapa práctica".
            </p>
            <ul class="text-sm text-gray-700 divide-y divide-gray-100 border border-gray-100 rounded-xl">
              @for (h of r.habilitados; track h.documento) {
                <li class="px-3 py-2 flex justify-between gap-3"><span>{{ h.nombre }}</span><span class="text-gray-400 tabular-nums">{{ h.documento }}</span></li>
              }
            </ul>
          } @else {
            <p class="text-sm text-gray-500">Ningún aprendiz se habilitó.</p>
          }
          @if (r.fallidos.length) {
            <div class="text-sm text-red-700 bg-red-50 rounded-xl p-3">
              <p class="font-medium mb-1">No se pudo habilitar a {{ r.fallidos.length }}:</p>
              @for (f of r.fallidos; track f.documento) { <p>{{ f.nombre }} — {{ f.motivo }}</p> }
            </div>
          }
          <button (click)="reiniciar()" class="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
            Cargar otro reporte
          </button>
        </div>
      } @else if (!analisis()) {
        <!-- ═══ Subir ═══ -->
        <div
          class="bg-white border-2 border-dashed rounded-2xl p-10 text-center transition-colors"
          [class]="arrastrando() ? 'border-[#39A900] bg-[#39A900]/5' : 'border-gray-200'"
          (dragover)="$event.preventDefault(); arrastrando.set(true)"
          (dragleave)="arrastrando.set(false)"
          (drop)="soltar($event)">
          <p class="text-gray-700 font-medium">Arrastra el reporte aquí (.xls o .xlsx)</p>
          <p class="text-xs text-gray-400 mt-1">Un reporte por ficha. La ficha se toma del encabezado del archivo.</p>
          <label class="inline-block mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#39A900] hover:bg-[#2d8400] cursor-pointer"
                 [class.opacity-60]="cargando()">
            {{ cargando() ? 'Leyendo el reporte…' : 'Elegir archivo' }}
            <input type="file" class="hidden" accept=".xls,.xlsx" [disabled]="cargando()" (change)="elegir($event)" />
          </label>
          @if (error()) { <p class="text-sm text-red-600 mt-3">{{ error() }}</p> }
        </div>
        <p class="text-xs text-gray-400">
          Se habilita a quien está EN FORMACION, tiene la competencia "Resultados de aprendizaje etapa práctica" por
          evaluar y todo lo demás aprobado. Esta pantalla no crea la etapa: solo la deja lista para crear.
        </p>
      } @else {
        <!-- ═══ Vista previa ═══ -->
        @let a = analisis()!;
        <div class="bg-white border border-gray-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-gray-900">Ficha {{ a.ficha }}</p>
            <p class="text-xs text-gray-500">
              {{ a.programa }}@if (a.estadoFicha) { · {{ a.estadoFicha }} }@if (a.fechaReporte) { · reporte del {{ a.fechaReporte }} }
            </p>
          </div>
          <button (click)="reiniciar()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
            Cambiar archivo
          </button>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-white border border-gray-100 rounded-xl p-3"><p class="text-xs text-gray-500">En el reporte</p><p class="text-2xl font-semibold">{{ a.totales.total }}</p></div>
          <div class="bg-white border border-gray-100 rounded-xl p-3"><p class="text-xs text-gray-500">Habilitables</p><p class="text-2xl font-semibold text-green-700">{{ a.totales.habilitable }}</p></div>
          <div class="bg-white border border-gray-100 rounded-xl p-3"><p class="text-xs text-gray-500">Le faltan competencias</p><p class="text-2xl font-semibold">{{ a.totales.faltan_competencias }}</p></div>
          <div class="bg-white border border-gray-100 rounded-xl p-3"><p class="text-xs text-gray-500">Sin cambio</p><p class="text-2xl font-semibold">{{ sinCambio() }}</p></div>
        </div>

        <div class="flex gap-2">
          @for (f of filtros; track f.id) {
            <button (click)="filtro.set(f.id)"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold border"
              [class]="filtro() === f.id ? 'bg-[#39A900]/10 text-[#2d8400] border-[#39A900]/40' : 'bg-white text-gray-600 border-gray-200'">
              {{ f.texto }}
            </button>
          }
        </div>

        <div class="bg-white border border-gray-100 rounded-2xl overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-gray-500 border-b border-gray-100">
                <th class="px-3 py-2 font-medium">Aprendiz</th>
                <th class="px-3 py-2 font-medium">Documento</th>
                <th class="px-3 py-2 font-medium">Resultado</th>
                <th class="px-3 py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              @for (x of visibles(); track x.documento) {
                <tr class="border-b border-gray-50 align-top">
                  <td class="px-3 py-2 text-gray-800">{{ x.nombre }}</td>
                  <td class="px-3 py-2 text-gray-500 tabular-nums">{{ x.documento }}</td>
                  <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-md text-xs whitespace-nowrap" [class]="etiqueta(x).clase">{{ etiqueta(x).texto }}</span></td>
                  <td class="px-3 py-2 text-xs text-gray-500">{{ detalle(x) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-gray-500">Confirmar marca "resultados aprobados" en la matrícula y avisa al aprendiz. No crea la etapa.</p>
          <button (click)="confirmar()" [disabled]="confirmando()"
            class="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#39A900] hover:bg-[#2d8400] disabled:opacity-60">
            {{ confirmando() ? 'Habilitando…' : 'Habilitar ' + a.totales.habilitable + (a.totales.habilitable === 1 ? ' aprendiz' : ' aprendices') }}
          </button>
        </div>
        @if (error()) { <p class="text-sm text-red-600">{{ error() }}</p> }
      }
    </div>
  `,
})
export class JuiciosEvaluativosComponent {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly filtros: { id: Filtro; texto: string }[] = [
    { id: 'todos', texto: 'Todos' },
    { id: 'habilitables', texto: 'Habilitables' },
    { id: 'no_cumplen', texto: 'No cumplen' },
  ];

  analisis = signal<AnalisisJuicios | null>(null);
  resultado = signal<ResultadoConfirmacion | null>(null);
  filtro = signal<Filtro>('todos');
  cargando = signal(false);
  confirmando = signal(false);
  arrastrando = signal(false);
  error = signal('');

  /** El archivo se conserva para volver a mandarlo al confirmar: el servidor lo vuelve a evaluar. */
  private archivo: File | null = null;

  sinCambio = computed(() => {
    const a = this.analisis();
    return a ? a.totales.total - a.totales.habilitable - a.totales.faltan_competencias : 0;
  });

  visibles = computed(() => {
    const lista = this.analisis()?.aprendices ?? [];
    const f = this.filtro();
    if (f === 'habilitables') return lista.filter((x) => x.clasificacion === 'habilitable');
    if (f === 'no_cumplen') return lista.filter((x) => x.clasificacion !== 'habilitable');
    return lista;
  });

  etiqueta(x: AprendizJuicio) { return ETIQUETA[x.clasificacion]; }

  detalle(x: AprendizJuicio): string {
    switch (x.clasificacion) {
      case 'habilitable': return 'Solo falta la etapa práctica';
      case 'ya_habilitada': return 'Ya tenía los resultados aprobados marcados';
      case 'faltan_competencias': {
        const n = x.pendientes.length;
        const primeros = x.pendientes.slice(0, 2).map((p) => p.resultado || p.competencia).join('; ');
        return `${n} resultado(s) por aprobar: ${primeros}${n > 2 ? '…' : ''}`;
      }
      case 'estado_no_aplica': return `Estado ${x.estadoReporte}`;
      case 'practica_aprobada': return 'La etapa práctica ya está aprobada';
      case 'sin_competencia_practica': return 'El reporte no trae la competencia de etapa práctica';
      case 'sin_matricula': return 'No hay matrícula con este documento en la ficha';
    }
  }

  elegir(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.leer(file);
  }

  soltar(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando.set(false);
    const file = ev.dataTransfer?.files?.[0];
    if (file) void this.leer(file);
  }

  private async leer(file: File): Promise<void> {
    this.error.set('');
    if (!/\.(xls|xlsx)$/i.test(file.name)) { this.error.set('Solo se aceptan archivos .xls o .xlsx.'); return; }
    if (file.size > MAX_BYTES) { this.error.set('El archivo supera el máximo de 10 MB.'); return; }

    this.cargando.set(true);
    try {
      this.analisis.set(await this.enviar<AnalisisJuicios>('previsualizar', file));
      this.archivo = file;
      this.filtro.set('todos');
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo leer el reporte.'));
    } finally {
      this.cargando.set(false);
    }
  }

  async confirmar(): Promise<void> {
    if (!this.archivo || this.confirmando()) return;
    if (!this.analisis()?.totales.habilitable) {
      this.error.set('Ningún aprendiz cumple la regla, no hay nada que habilitar.');
      return;
    }
    this.error.set('');
    this.confirmando.set(true);
    try {
      this.resultado.set(await this.enviar<ResultadoConfirmacion>('confirmar', this.archivo));
      this.toast.ok('Aprendices habilitados', 'Los resultados de aprendizaje quedaron marcados como aprobados.');
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo habilitar a los aprendices.'));
    } finally {
      this.confirmando.set(false);
    }
  }

  reiniciar(): void {
    this.analisis.set(null);
    this.resultado.set(null);
    this.archivo = null;
    this.error.set('');
  }

  private enviar<T>(accion: 'previsualizar' | 'confirmar', file: File): Promise<T> {
    const fd = new FormData();
    fd.append('file', file);
    return firstValueFrom(this.http.post<T>(`${environment.apiUrl}/juicios-evaluativos/${accion}`, fd));
  }
}
