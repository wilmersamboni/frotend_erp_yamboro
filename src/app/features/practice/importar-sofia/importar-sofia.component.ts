import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { MigrationComponent } from '../migration/migration.component';
import { JuiciosEvaluativosComponent } from '../juicios-evaluativos/juicios-evaluativos.component';

export type PestanaSofia = 'aprendices' | 'juicios';

interface Modulo {
  id: PestanaSofia;
  texto: string;
  descripcion: string;
  archivo: string;
  servicio: string;
  quienPide: string;
  /** Ícono (trazo de 24×24, mismo estilo que el resto del menú). */
  icono: string;
  tono: string;
}

const MODULOS: Modulo[] = [
  {
    id: 'aprendices',
    texto: 'Aprendices y fichas',
    descripcion: 'Carga la base de aprendices del centro: programas, fichas, personas y matrículas.',
    archivo: 'Excel de matrícula',
    servicio: 'practica.migracion',
    quienPide: 'Solo administradores o quien tenga el permiso de migración.',
    icono: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    tono: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'juicios',
    texto: 'Juicios evaluativos',
    descripcion: 'Habilita la etapa práctica de quienes solo tienen pendiente esa competencia.',
    archivo: 'Un reporte por ficha',
    servicio: 'matriculas.gestionar',
    quienPide: 'Solo administradores o quien tenga el permiso de gestionar matrículas.',
    icono: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    tono: 'bg-green-100 text-green-700',
  },
];

/**
 * Una sola pantalla para los dos Excel de SofiaPlus. Solo une la interfaz: cada módulo sigue llamando a su
 * propio endpoint y exige su propio permiso (Migración: `practica.migracion`; Juicios: `matriculas.gestionar`),
 * así que quien puede habilitar juicios no puede disparar la migración masiva ni al revés.
 *
 * - Sin `?pestana=` y con acceso a los dos: inicio con una tarjeta por módulo (la sin permiso sale con candado).
 * - Con un solo permiso: abre directo en ese módulo, sin pasar por el inicio.
 * - Dentro de un módulo: solo el botón para volver al inicio.
 */
@Component({
  selector: 'app-importar-sofia',
  standalone: true,
  imports: [MigrationComponent, JuiciosEvaluativosComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (activo(); as modulo) {
      <!-- ═══ Dentro de un módulo ═══ -->
      <div class="max-w-5xl mx-auto px-6 pt-6 flex flex-wrap items-center justify-between gap-3">
        @if (puedeVolver()) {
          <button (click)="volver()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            Importar desde SofiaPlus
          </button>
        } @else {
          <h1 class="text-2xl font-bold text-gray-900">Importar desde SofiaPlus</h1>
        }
      </div>

      @switch (modulo) {
        @case ('aprendices') { <app-migration /> }
        @case ('juicios') { <app-juicios-evaluativos /> }
      }
    } @else {
      <!-- ═══ Inicio: elegir módulo ═══ -->
      <div class="max-w-5xl mx-auto p-6">
        <h1 class="text-2xl font-bold text-gray-900">Importar desde SofiaPlus</h1>
        <p class="text-sm text-gray-500 mt-1">
          Elige qué quieres importar. Lo normal es empezar por los aprendices y seguir con los juicios.
        </p>

        @if (todosBloqueados()) {
          <p class="mt-6 text-sm text-gray-500">No tienes permiso para ninguna de estas importaciones. Pídeselo a un administrador.</p>
        } @else {
          <div class="grid gap-4 mt-6 sm:grid-cols-2">
            @for (m of tarjetas(); track m.id) {
              <div class="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3" [class.opacity-70]="!m.permitido">
                <div class="w-10 h-10 rounded-xl grid place-items-center" [class]="m.tono">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="m.icono"/></svg>
                </div>
                <div>
                  <p class="text-base font-semibold text-gray-900">{{ m.texto }}</p>
                  <p class="text-sm text-gray-500 mt-1 leading-relaxed">{{ m.descripcion }}</p>
                </div>
                @if (m.permitido) {
                  <span class="self-start px-2 py-0.5 rounded-md text-xs bg-gray-100 text-gray-600">{{ m.archivo }}</span>
                  <button (click)="abrir(m.id)"
                    class="mt-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#39A900] hover:bg-[#2d8400]">
                    Abrir
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-6-6l6 6-6 6"/></svg>
                  </button>
                } @else {
                  <span class="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-gray-100 text-gray-600">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    Requiere permiso
                  </span>
                  <p class="mt-auto text-xs text-gray-400">{{ m.quienPide }}</p>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class ImportarSofiaComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly pedida = toSignal(
    this.route.queryParamMap.pipe(map((q) => q.get('pestana'))),
    { initialValue: this.route.snapshot.queryParamMap.get('pestana') },
  );

  /** El cargo administrador entra a los dos, como en las rutas de antes; el resto, por su servicio. */
  private permitido(m: Modulo): boolean {
    return this.auth.isAdmin() || this.auth.tieneServicio(m.servicio);
  }

  readonly permitidos = computed(() => MODULOS.filter((m) => this.permitido(m)));

  readonly tarjetas = computed(() => MODULOS.map((m) => ({ ...m, permitido: this.permitido(m) })));

  readonly todosBloqueados = computed(() => this.permitidos().length === 0);

  /** Hay inicio al que volver solo si hay más de un módulo disponible. */
  readonly puedeVolver = computed(() => this.permitidos().length > 1);

  /**
   * El módulo abierto: el pedido por la URL si lo puede usar; con un solo permiso, ese; y con más de uno y sin
   * pedido, ninguno (se muestra el inicio).
   */
  readonly activo = computed<PestanaSofia | null>(() => {
    const permitidos = this.permitidos();
    const pedido = permitidos.find((m) => m.id === this.pedida());
    if (pedido) return pedido.id;
    return permitidos.length === 1 ? permitidos[0].id : null;
  });

  /** Desde el inicio se apila en el historial (Atrás vuelve al inicio); entre módulos solo se reemplaza. */
  abrir(id: PestanaSofia): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { pestana: id }, replaceUrl: this.activo() !== null });
  }

  volver(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { pestana: null } });
  }
}
