import {
  Component, OnDestroy, OnInit, signal, computed, ChangeDetectionStrategy, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient }   from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService }   from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface ResumenMigracion {
  programas_insertados:    number;
  cursos_insertados:       number;
  cursos_actualizados:     number;
  personas_insertadas:     number;
  personas_actualizadas:   number;
  usuarios_creados:        number;
  matriculas_insertadas:   number;
  matriculas_actualizadas: number;
  sin_apellido:            number;
  omitidas:                number;
  errores:                 number;
}

interface AprendizHabilitado {
  nombre:   string;
  cedula:   string;
  programa: string;
}

interface EstadoMigracion {
  status:    'idle' | 'running' | 'completed' | 'error';
  startTime?: string;
  endTime?:   string;
  duracion?:  string;
  logs:       string[];
  resumen?:   ResumenMigracion;
  mensaje?:   string;
}

// ── Componente ─────────────────────────────────────────────────────────────────
@Component({
  selector:        'app-migration',
  standalone:      true,
  imports:         [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50 p-6">

  <!-- ── Encabezado ── -->
  <div class="max-w-4xl mx-auto">
    <div class="flex items-center gap-3 mb-6">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700
                  flex items-center justify-center shadow-lg shadow-blue-600/20">
        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0
               0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
      </div>
      <div>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Migración de Base de Datos</h1>
        <p class="text-xs text-gray-500">SENA – Centro Yamboró · El proceso corre en el servidor</p>
      </div>

      <!-- Badge de estado -->
      <span class="ml-auto px-3 py-1.5 rounded-full text-xs font-semibold"
        [class]="estadoBadgeClass()">
        {{ estadoLabel() }}
      </span>
    </div>

    <!-- ── Notificación de finalización ── -->
    @if (mostrarNotificacion()) {
      <div class="mb-4 rounded-xl p-4 flex items-start gap-3 shadow"
        [class]="estado().status === 'completed'
          ? 'bg-green-50 border border-green-200'
          : 'bg-red-50 border border-red-200'">
        <span class="text-2xl">{{ estado().status === 'completed' ? '✅' : '❌' }}</span>
        <div class="flex-1">
          <p class="font-semibold"
            [class]="estado().status === 'completed' ? 'text-green-800' : 'text-red-800'">
            {{ estado().status === 'completed' ? '¡Migración completada!' : 'Migración finalizada con errores' }}
          </p>
          <p class="text-sm mt-0.5"
            [class]="estado().status === 'completed' ? 'text-green-700' : 'text-red-700'">
            Duración: {{ estado().duracion }} ·
            Personas: {{ estado().resumen?.personas_insertadas ?? 0 }} nuevas,
            {{ estado().resumen?.personas_actualizadas ?? 0 }} actualizadas ·
            Errores: {{ estado().resumen?.errores ?? 0 }}
          </p>
        </div>
        <button (click)="cerrarNotificacion()"
          class="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>
    }

    <!-- ── Zona de carga ── -->
    <div class="bg-white rounded-2xl shadow border border-gray-200 p-6 mb-4">
      <h2 class="text-base font-bold text-gray-800 mb-4">1 · Seleccionar archivo Excel</h2>

      <div
        class="relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
               transition-all duration-200"
        [class]="dragging()
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'"
        (click)="fileInput.click()"
        (dragover)="$event.preventDefault(); dragging.set(true)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)">

        <input #fileInput type="file" accept=".xlsx,.xls"
          (change)="onFileChange($event)" hidden>

        @if (!archivo()) {
          <div class="space-y-2">
            <div class="text-5xl">📂</div>
            <p class="font-medium text-gray-700">
              Arrastra el archivo aquí o
              <span class="text-blue-600 font-bold">haz clic para seleccionar</span>
            </p>
            <p class="text-xs text-gray-400">Formatos aceptados: .xlsx · .xls · máx. 50 MB</p>
          </div>
        } @else {
          <div class="flex items-center justify-center gap-4">
            <span class="text-4xl">📊</span>
            <div class="text-left">
              <p class="font-bold text-gray-900">{{ archivo()!.name }}</p>
              <p class="text-xs text-gray-500 mt-1">
                {{ (archivo()!.size / 1024 / 1024).toFixed(2) }} MB · clic para cambiar
              </p>
            </div>
          </div>
        }
      </div>

      <!-- Botón principal -->
      <div class="mt-4 flex gap-3">
        <button
          [disabled]="!archivo() || estado().status === 'running' || subiendo()"
          (click)="iniciar()"
          class="flex-1 py-3 rounded-xl font-semibold text-sm transition-all
                 disabled:opacity-40 disabled:cursor-not-allowed"
          [class]="estado().status === 'running' || subiendo()
            ? 'bg-blue-100 text-blue-600 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20'">
          @if (subiendo()) {
            <span class="flex items-center justify-center gap-2">
              <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10"
                  stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Subiendo archivo…
            </span>
          } @else if (estado().status === 'running') {
            🔄 Migración en curso…
          } @else {
            🚀 Iniciar Migración
          }
        </button>

        @if (estado().status === 'completed' || estado().status === 'error') {
          <button (click)="nuevaMigracion()"
            class="px-5 py-3 rounded-xl font-semibold text-sm border border-gray-300 hover:bg-gray-50 transition-all text-gray-700">
            Nueva migración
          </button>
        }
      </div>
    </div>

    <!-- ── Panel de progreso / logs ── -->
    @if (estado().status !== 'idle') {
      <div class="bg-white rounded-2xl shadow border border-gray-200 p-6 mb-4">
        <h2 class="text-base font-bold text-gray-800 mb-4">2 · Progreso en tiempo real</h2>

        <!-- Barra de progreso indeterminada mientras corre -->
        @if (estado().status === 'running') {
          <div class="w-full bg-gray-100 rounded-full h-2 mb-4 overflow-hidden">
            <div class="h-2 bg-blue-500 rounded-full animate-pulse"
              style="width: 100%; animation: progress-bar 1.5s ease-in-out infinite alternate;">
            </div>
          </div>
          <p class="text-xs text-blue-600 mb-3 font-medium animate-pulse">
            ⏳ Procesando en el servidor… puedes seguir trabajando
          </p>
        }

        <!-- Terminal de logs -->
        <div class="bg-gray-900 rounded-xl p-4 font-mono text-xs text-green-300
                    h-64 overflow-y-auto scroll-smooth" #logBox>
          @for (line of logsVisibles(); track $index) {
            <div [class]="lineClass(line)">{{ line }}</div>
          }
          @if (estado().status === 'running') {
            <div class="text-blue-400 animate-pulse">█</div>
          }
        </div>
      </div>

      <!-- ── Resumen final ── -->
      @if (estado().resumen && estado().status !== 'running') {
        <div class="bg-white rounded-2xl shadow border border-gray-200 p-6">
          <h2 class="text-base font-bold text-gray-800 mb-4">3 · Resumen</h2>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            @for (item of resumenItems(); track item.label) {
              <div class="rounded-xl p-4 text-center"
                [class]="item.color">
                <div class="text-2xl font-bold">{{ item.valor }}</div>
                <div class="text-xs mt-1 opacity-75">{{ item.label }}</div>
              </div>
            }
          </div>

          @if (estado().resumen!.errores > 0) {
            <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              ⚠ Hubo <strong>{{ estado().resumen!.errores }}</strong> errores durante la migración.
              Revisa el archivo <code class="bg-red-100 px-1 rounded">scripts/migrate_aprendices.log</code>
              en el servidor para ver el detalle.
            </div>
          }

          <!-- ── Aprendices habilitados post-migración ── -->
          @if (aprendicesHabilitados().length > 0) {
            <div class="mt-5 rounded-xl border border-green-200 bg-green-50 overflow-hidden">
              <div class="flex items-center gap-2 px-4 py-3 border-b border-green-200 bg-green-100/60">
                <span class="text-lg">🎓</span>
                <span class="font-semibold text-green-800 text-sm">
                  {{ aprendicesHabilitados().length }} aprendiz{{ aprendicesHabilitados().length !== 1 ? 'ces' : '' }}
                  habilitado{{ aprendicesHabilitados().length !== 1 ? 's' : '' }} para etapa práctica
                </span>
                <span class="ml-auto text-xs text-green-600 font-medium bg-green-200 px-2 py-0.5 rounded-full">
                  Resultados aprobados
                </span>
              </div>
              <div class="divide-y divide-green-100 max-h-56 overflow-y-auto">
                @for (a of aprendicesHabilitados(); track a.cedula) {
                  <div class="flex items-center gap-3 px-4 py-2.5">
                    <div class="w-7 h-7 rounded-full bg-green-600 text-white flex items-center
                                justify-center text-xs font-bold flex-shrink-0">
                      {{ a.nombre.charAt(0) }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-gray-800 truncate">{{ a.nombre }}</p>
                      <p class="text-xs text-gray-500 truncate">{{ a.programa || 'Sin programa' }}</p>
                    </div>
                    <span class="text-green-600 flex-shrink-0" title="Resultados aprobados">✓</span>
                  </div>
                }
              </div>
              <div class="px-4 py-2 bg-green-100/40 text-xs text-green-700 text-center">
                Estos aprendices pueden ser vinculados a una etapa práctica desde la sección de Seguimiento.
              </div>
            </div>
          } @else if (estado().status === 'completed') {
            <div class="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 text-center">
              <span class="text-base">🔔</span>
              Ningún aprendiz con resultados de aprendizaje aprobados aún.
            </div>
          }
        </div>
      }
    }

  </div><!-- /max-w-4xl -->
</div>

<style>
@keyframes progress-bar {
  from { transform: translateX(-100%); }
  to   { transform: translateX(0); }
}
</style>
  `,
})
export class MigrationComponent implements OnInit, OnDestroy {

  private readonly http  = inject(HttpClient);
  private readonly api   = inject(ApiService);
  private readonly toast = inject(ToastService);

  // ── Signals ──────────────────────────────────────────────────────────────────
  archivo  = signal<File | null>(null);
  dragging = signal(false);
  subiendo = signal(false);
  aprendicesHabilitados = signal<AprendizHabilitado[]>([]);
  private _notificacionVisible = signal(false);
  private _estado = signal<EstadoMigracion>({ status: 'idle', logs: [] });

  readonly estado          = this._estado.asReadonly();
  readonly mostrarNotificacion = computed(() =>
    this._notificacionVisible() &&
    (this._estado().status === 'completed' || this._estado().status === 'error')
  );

  readonly logsVisibles = computed(() => this._estado().logs.slice(-80));

  readonly resumenItems = computed(() => {
    const r = this._estado().resumen;
    if (!r) return [];
    return [
      { label: 'Personas nuevas',     valor: r.personas_insertadas,   color: 'bg-blue-50 text-blue-700' },
      { label: 'Personas actualizadas', valor: r.personas_actualizadas, color: 'bg-indigo-50 text-indigo-700' },
      { label: 'Usuarios creados',    valor: r.usuarios_creados,       color: 'bg-teal-50 text-teal-700' },
      { label: 'Cursos (fichas)',      valor: r.cursos_insertados,     color: 'bg-purple-50 text-purple-700' },
      { label: 'Matrículas',          valor: r.matriculas_insertadas,  color: 'bg-green-50 text-green-700' },
      { label: 'Programas',           valor: r.programas_insertados,   color: 'bg-yellow-50 text-yellow-700' },
      { label: 'Sin apellido',        valor: r.sin_apellido,
        color: r.sin_apellido > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600' },
      { label: 'Omitidas',            valor: r.omitidas,               color: 'bg-gray-50 text-gray-600' },
      { label: 'Errores',             valor: r.errores,
        color: r.errores > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700' },
    ];
  });

  readonly estadoBadgeClass = computed(() => {
    const map: Record<string, string> = {
      idle:      'bg-gray-100 text-gray-600',
      running:   'bg-blue-600 text-white animate-pulse',
      completed: 'bg-green-100 text-green-700',
      error:     'bg-red-100 text-red-700',
    };
    return map[this._estado().status] ?? map['idle'];
  });

  readonly estadoLabel = computed(() => {
    const map: Record<string, string> = {
      idle: 'Listo', running: 'Procesando…',
      completed: 'Completado', error: 'Con errores',
    };
    return map[this._estado().status] ?? 'Listo';
  });

  // ── Ciclo de vida ─────────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<EstadoMigracion>('/api/migracion/estado')
      );
      this._estado.set(data);

      if (data.status === 'running') {
        // Migración en curso: retomar polling
        this.iniciarPolling();
      } else if (data.status === 'completed' || data.status === 'error') {
        // Ya terminó mientras estábamos fuera: mostrar notificación
        this._notificacionVisible.set(true);
        if (data.status === 'completed') this.cargarAprendicesHabilitados();
      }
    } catch { /* sin conexión al arrancar — mostramos estado idle */ }
  }

  private async cargarAprendicesHabilitados(): Promise<void> {
    try {
      const notifs = await this.api.listarNotificaciones();
      const noti = notifs.find((n: any) => n.tipo === 'aprendices_habilitados');
      if (noti?.data?.aprendices) {
        this.aprendicesHabilitados.set(noti.data.aprendices as AprendizHabilitado[]);
      } else {
        this.aprendicesHabilitados.set([]);
      }
    } catch { this.aprendicesHabilitados.set([]); }
  }

  // ── Polling ───────────────────────────────────────────────────────────────────
  private pollingId?: ReturnType<typeof setInterval>;

  private iniciarPolling(): void {
    this.stopPolling();
    this.pollingId = setInterval(async () => {
      try {
        const data = await firstValueFrom(
          this.http.get<EstadoMigracion>('/api/migracion/estado')
        );
        this._estado.set(data);

        if (data.status === 'completed' || data.status === 'error') {
          this.stopPolling();
          this._notificacionVisible.set(true);
          if (data.status === 'completed') {
            // Pequeño delay para que el backend termine de guardar la notificación
            setTimeout(() => this.cargarAprendicesHabilitados(), 1500);
          }
        }
      } catch { /* error de red — seguimos intentando */ }
    }, 2000);
  }

  private stopPolling(): void {
    if (this.pollingId) {
      clearInterval(this.pollingId);
      this.pollingId = undefined;
    }
  }

  ngOnDestroy(): void { this.stopPolling(); }

  // ── Acciones ──────────────────────────────────────────────────────────────────
  onFileChange(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) this.archivo.set(f);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragging.set(false);
    const f = ev.dataTransfer?.files?.[0];
    if (f) this.archivo.set(f);
  }

  async iniciar(): Promise<void> {
    const file = this.archivo();
    if (!file || this._estado().status === 'running') return;

    this.subiendo.set(true);
    this._notificacionVisible.set(false);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await firstValueFrom(
        this.http.post<EstadoMigracion>('/api/migracion/iniciar', formData)
      );
      this._estado.set({ ...res, status: 'running' });
      this.iniciarPolling();
    } catch (err: any) {
      this._estado.set({
        status: 'error',
        logs: [`Error al iniciar: ${err?.error?.message ?? err?.message ?? 'Error desconocido'}`],
      });
    } finally {
      this.subiendo.set(false);
    }
  }

  async nuevaMigracion(): Promise<void> {
    try {
      await firstValueFrom(this.http.delete('/api/migracion/resetear'));
    } catch { /* ignorar */ }
    this.archivo.set(null);
    this._estado.set({ status: 'idle', logs: [] });
    this._notificacionVisible.set(false);
    this.aprendicesHabilitados.set([]);
  }

  cerrarNotificacion(): void { this._notificacionVisible.set(false); }

  // ── Helpers de UI ─────────────────────────────────────────────────────────────
  lineClass(line: string): string {
    if (line.includes('[ERROR]') || line.includes('ERROR'))  return 'text-red-400';
    if (line.includes('[INFO]'))  return 'text-green-300';
    if (line.includes('✓') || line.includes('Completada') || line.includes('completad'))
      return 'text-green-400 font-semibold';
    if (line.includes('⚠') || line.includes('WARNING'))     return 'text-yellow-300';
    return 'text-gray-400';
  }
}
