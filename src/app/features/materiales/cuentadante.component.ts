import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BienACargo,
  GrupoSinIngreso,
  HistorialCuentadante,
  IngresoDevolutivo,
  InventarioCuentadante,
  MaterialesApiService,
  ResumenCuentadante,
  UnidadSinIngreso,
} from './data-access/materiales-api.service';
import { ESTADO_LEGIBLE, marcaModelo } from './cuentadante-formato';
import { PersonaService } from '../../core/services/persona.service';
import { ToastService } from '../../core/services/toast.service';
import { SearchableSelectComponent, SSOption } from '../../shared/components/searchable-select.component';
import { log } from '../../core/utils/log';

type Pestana = 'mis-bienes' | 'cuentadantes' | 'ingresos' | 'anterior';

/**
 * Cuentadante de devolutivos (2026-10-05). El cuentadante (instructor o
 * funcionario de planta) recibe los materiales de formación cuando llegan y a
 * fin de año debe decir dónde está cada uno y en qué estado. Pestañas:
 *  - "Mis bienes a cargo": los ítems de los que soy cuentadante, con su
 *    paradero (bodega, préstamo, ficha, fuera de la sede) y la descarga del
 *    inventario de fin de año (`inventario-cuentadante-excel.ts`).
 *  - "Por cuentadante", "Asignar por ingreso" y "Material anterior": solo
 *    administrador_erp y líderes de área (`puedeGestionarCatalogo`, el mismo
 *    criterio del backend). "Material anterior" cubre lo que ya existía antes
 *    del módulo, que no tiene ingreso: se asigna unidad por unidad.
 * El cuentadante responde por el ítem sin importar el sitio; el encargado de
 * bodega sigue gestionando solo lo que está en su sitio.
 */
@Component({
  selector: 'app-materiales-cuentadante',
  standalone: true,
  imports: [FormsModule, SearchableSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-4 md:p-6 space-y-4">
      <div>
        <h1 class="text-xl font-bold text-gray-900">Cuentadante</h1>
        <p class="text-sm text-gray-500">Quién responde por cada devolutivo, esté donde esté.</p>
      </div>

      <div class="flex gap-2 border-b border-gray-200">
        <button type="button" (click)="pestana.set('mis-bienes')"
          class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px"
          [class]="pestana() === 'mis-bienes' ? 'border-[var(--accent-brand)] text-gray-900' : 'border-transparent text-gray-500'">
          Mis bienes a cargo ({{ bienes().length }})
        </button>
        @if (puedeAsignar()) {
          <button type="button" (click)="pestana.set('cuentadantes')"
            class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px"
            [class]="pestana() === 'cuentadantes' ? 'border-[var(--accent-brand)] text-gray-900' : 'border-transparent text-gray-500'">
            Por cuentadante ({{ cuentadantes().length }})
          </button>
          <button type="button" (click)="pestana.set('ingresos')"
            class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px"
            [class]="pestana() === 'ingresos' ? 'border-[var(--accent-brand)] text-gray-900' : 'border-transparent text-gray-500'">
            Asignar por ingreso ({{ ingresos().length }})
          </button>
          <button type="button" (click)="pestana.set('anterior')"
            class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px"
            [class]="pestana() === 'anterior' ? 'border-[var(--accent-brand)] text-gray-900' : 'border-transparent text-gray-500'">
            Material anterior ({{ sinIngreso().length }})
          </button>
        }
      </div>

      @if (cargando()) {
        <p class="text-sm text-gray-500">Cargando…</p>
      } @else if (error()) {
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{{ error() }}</span>
          <button type="button" (click)="cargar()" class="font-semibold underline">Reintentar</button>
        </div>
      } @else if (pestana() === 'mis-bienes') {
        @if (bienes().length === 0) {
          <p class="text-sm text-gray-500 py-8 text-center">No tienes bienes a tu cargo todavía.</p>
        } @else {
          <div class="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div class="text-sm text-gray-600">
              <p class="font-semibold text-gray-800">Inventario de fin de año</p>
              <p class="text-xs mt-0.5">
                Descarga la lista de tus bienes con dónde está cada uno, revísalos y marca si los viste y en qué estado están.
              </p>
            </div>
            <button type="button" (click)="descargarMio()" [disabled]="descargando() === 'yo'"
              class="px-4 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50" style="background-color: var(--accent-brand)">
              {{ descargando() === 'yo' ? 'Generando…' : 'Descargar inventario (Excel)' }}
            </button>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            @for (c of contadores(); track c.label) {
              <div class="rounded-xl border bg-white px-3 py-2" [class]="c.valor && c.alerta ? 'border-amber-300' : 'border-gray-200'">
                <p class="text-lg font-bold" [class]="c.valor && c.alerta ? 'text-amber-700' : 'text-gray-900'">{{ c.valor }}</p>
                <p class="text-xs text-gray-500">{{ c.label }}</p>
              </div>
            }
          </div>

          <div class="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th class="text-left px-3 py-2">Bien</th>
                  <th class="text-left px-3 py-2">Placa SENA</th>
                  <th class="text-left px-3 py-2">Dónde está</th>
                  <th class="text-left px-3 py-2">Estado</th>
                  <th class="text-left px-3 py-2">Ingresó</th>
                </tr>
              </thead>
              <tbody>
                @for (b of bienes(); track b.id_item) {
                  <tr class="border-t border-gray-100 align-top">
                    <td class="px-3 py-2">
                      <p class="font-medium text-gray-800">{{ b.producto_nombre }}</p>
                      @if (marcaModelo(b)) { <p class="text-xs text-gray-500">{{ marcaModelo(b) }}</p> }
                    </td>
                    <td class="px-3 py-2">
                      @if (b.placa_sena) { <span class="text-gray-700">{{ b.placa_sena }}</span> }
                      @else { <span class="text-xs font-semibold text-amber-700">Sin placa</span> }
                    </td>
                    <td class="px-3 py-2 text-gray-700">
                      {{ b.ubicacion }}
                      @if (b.en_poder_de) { <p class="text-xs text-gray-500">{{ b.en_poder_de }}</p> }
                    </td>
                    <td class="px-3 py-2">
                      <span class="text-gray-700">{{ estado(b) }}</span>
                      @if (b.novedad) { <p class="text-xs font-semibold text-red-700">{{ b.novedad }}</p> }
                    </td>
                    <td class="px-3 py-2 text-gray-500">{{ fecha(b.fecha_ingreso) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else if (pestana() === 'anterior') {
        @if (sinIngreso().length === 0) {
          <p class="text-sm text-gray-500 py-8 text-center">No hay material anterior al módulo pendiente de asignar.</p>
        } @else {
          <p class="text-xs text-gray-500">
            Equipos que ya estaban registrados antes de existir el cuentadante. Abre una ficha, marca las unidades y elige el instructor
            que responde por ellas; puedes repartirlas entre varios.
          </p>
          <ul class="space-y-2">
            @for (g of sinIngreso(); track claveGrupo(g)) {
              <li class="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-gray-800">
                      {{ g.producto_nombre }} <span class="font-normal text-gray-500">· {{ g.unidades }} unidad(es)</span>
                    </p>
                    <p class="text-xs text-gray-500 mt-0.5">{{ g.sitio_nombre || 'Sin bodega' }}</p>
                    <p class="text-xs mt-1" [class]="g.sin_asignar ? 'text-amber-700' : 'text-gray-600'">
                      @if (g.sin_asignar === g.unidades) { Sin cuentadante }
                      @else if (g.sin_asignar > 0) { {{ g.unidades - g.sin_asignar }} con cuentadante · {{ g.sin_asignar }} sin asignar }
                      @else { Todas con cuentadante }
                      @if (g.sin_placa) { · <span class="font-semibold">{{ g.sin_placa }} sin placa</span> }
                    </p>
                  </div>
                  <button type="button" (click)="abrirGrupo(g)"
                    class="px-3 py-1.5 rounded-full text-xs font-semibold text-white" style="background-color: var(--accent-brand)">
                    {{ grupoAbierto()?.clave === claveGrupo(g) ? 'Cerrar' : 'Asignar' }}
                  </button>
                </div>

                @if (grupoAbierto()?.clave === claveGrupo(g)) {
                  <div class="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-3">
                    <div class="flex items-center justify-between">
                      <label class="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                        <input type="checkbox" [checked]="todasMarcadas()" (change)="marcarTodas($any($event.target).checked)" />
                        Marcar todas
                      </label>
                      <span class="text-xs text-gray-500">{{ seleccion().size }} marcada(s)</span>
                    </div>
                    <ul class="max-h-64 overflow-y-auto divide-y divide-gray-100">
                      @for (u of grupoAbierto()!.unidades; track u.id_item) {
                        <li>
                          <label class="flex items-center gap-3 py-1.5 text-sm cursor-pointer">
                            <input type="checkbox" [checked]="seleccion().has(u.id_item)" (change)="marcar(u.id_item, $any($event.target).checked)" />
                            <span class="text-gray-800">
                              @if (u.placa_sena) { {{ u.placa_sena }} } @else { <span class="text-amber-700 font-semibold">Sin placa</span>{{ u.codigo_sku ? ' · ' + u.codigo_sku : '' }} }
                            </span>
                            <span class="text-xs text-gray-500 ml-auto">{{ u.cuentadante_nombre ? 'A cargo de ' + u.cuentadante_nombre : 'Sin cuentadante' }}</span>
                          </label>
                        </li>
                      }
                    </ul>
                    <div class="grid gap-2 md:grid-cols-[1fr_1fr_auto] items-end">
                      <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">Cuentadante</label>
                        <app-ss [options]="candidatos()" placeholder="Elige una persona" [(ngModel)]="nuevoCuentadante"></app-ss>
                      </div>
                      <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">Motivo (opcional)</label>
                        <input type="text" [(ngModel)]="motivo" maxlength="500" placeholder="Ej. inventario inicial 2026"
                          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
                      </div>
                      <button type="button" (click)="guardarGrupo()" [disabled]="!nuevoCuentadante || seleccion().size === 0 || enviando()"
                        class="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style="background-color: var(--accent-brand)">
                        Asignar a {{ seleccion().size }}
                      </button>
                    </div>
                  </div>
                }
              </li>
            }
          </ul>
        }
      } @else if (pestana() === 'cuentadantes') {
        @if (cuentadantes().length === 0) {
          <p class="text-sm text-gray-500 py-8 text-center">Todavía nadie tiene bienes a cargo. Asígnalos en "Asignar por ingreso".</p>
        } @else {
          <p class="text-xs text-gray-500">Descarga el inventario de fin de año de cada cuentadante para revisarlo con él.</p>
          <ul class="space-y-2">
            @for (c of cuentadantes(); track c.id_cuentadante) {
              <li class="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-gray-800">
                    {{ c.nombre || 'Persona sin nombre' }}
                    @if (c.cargo) { <span class="font-normal text-gray-500">· {{ cargo(c.cargo) }}</span> }
                  </p>
                  <p class="text-xs text-gray-500 mt-0.5">
                    {{ c.bienes }} bien(es)
                    @if (c.fuera_de_bodega) { · {{ c.fuera_de_bodega }} fuera de la bodega }
                    @if (c.sin_placa) { · <span class="text-amber-700 font-semibold">{{ c.sin_placa }} sin placa</span> }
                    @if (c.con_novedad) { · <span class="text-red-700 font-semibold">{{ c.con_novedad }} con novedad</span> }
                  </p>
                </div>
                <button type="button" (click)="descargarDe(c.id_cuentadante)" [disabled]="descargando() === c.id_cuentadante"
                  class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-700 bg-white hover:border-gray-400 disabled:opacity-50">
                  {{ descargando() === c.id_cuentadante ? 'Generando…' : 'Descargar inventario' }}
                </button>
              </li>
            }
          </ul>
        }
      } @else {
        @if (ingresos().length === 0) {
          <p class="text-sm text-gray-500 py-8 text-center">
            No hay ingresos de devolutivos todavía. Aparecen cuando una bodega agrega existencias de un devolutivo.
          </p>
        } @else {
          <ul class="space-y-2">
            @for (i of ingresos(); track i.id_ingreso) {
              <li class="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-gray-800">
                      {{ i.producto_nombre }}
                      <span class="font-normal text-gray-500">· {{ i.unidades }} unidad(es)</span>
                    </p>
                    <p class="text-xs text-gray-500 mt-0.5">
                      @if (i.numero_ingreso) { <strong>{{ i.numero_ingreso }}</strong> · }
                      Ingresó el {{ fecha(i.fecha_ingreso) }}{{ i.sitio_nombre ? ' a ' + i.sitio_nombre : '' }}{{ i.proveedor_nombre ? ' · ' + i.proveedor_nombre : '' }}
                    </p>
                    <p class="text-xs mt-1" [class]="i.sin_asignar ? 'text-amber-700' : 'text-gray-600'">
                      @if (i.sin_asignar === i.unidades) { Sin cuentadante }
                      @else if (i.sin_asignar > 0) { Cuentadante: {{ i.cuentadante_nombre || '—' }} · {{ i.sin_asignar }} unidad(es) sin asignar }
                      @else { Cuentadante: {{ i.cuentadante_nombre || '—' }} }
                    </p>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    <button type="button" (click)="abrirAsignar(i)"
                      class="px-3 py-1.5 rounded-full text-xs font-semibold text-white" style="background-color: var(--accent-brand)">
                      {{ i.id_cuentadante ? 'Cambiar' : 'Asignar' }}
                    </button>
                    <button type="button" (click)="verHistorial(i)"
                      class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400">
                      Historial
                    </button>
                  </div>
                </div>

                @if (asignando()?.id_ingreso === i.id_ingreso) {
                  <div class="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto] items-end">
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Cuentadante</label>
                      <app-ss [options]="candidatos()" placeholder="Elige una persona" [(ngModel)]="nuevoCuentadante"></app-ss>
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Motivo (opcional)</label>
                      <input type="text" [(ngModel)]="motivo" maxlength="500" placeholder="Ej. entrega del contrato 2026"
                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
                    </div>
                    <div class="flex gap-2">
                      <button type="button" (click)="guardar(i)" [disabled]="!nuevoCuentadante || enviando()"
                        class="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style="background-color: var(--accent-brand)">Guardar</button>
                      <button type="button" (click)="asignando.set(null)"
                        class="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 bg-white">Cancelar</button>
                    </div>
                  </div>
                }

                @if (historialDe()?.id === i.id_ingreso) {
                  <div class="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-3">
                    @if (historialDe()!.filas.length === 0) {
                      <p class="text-xs text-gray-500">Sin movimientos.</p>
                    } @else {
                      <ul class="space-y-1">
                        @for (h of historialDe()!.filas; track h.id_historial) {
                          <li class="text-xs text-gray-600">
                            {{ fecha(h.fecha) }} · {{ h.placa_sena || 'sin placa' }}:
                            {{ h.cuentadante_anterior_nombre || 'sin cuentadante' }} → <strong>{{ h.cuentadante_nuevo_nombre || '—' }}</strong>
                            · lo asignó {{ h.asigna_nombre || '—' }}{{ h.motivo ? ' · “' + h.motivo + '”' : '' }}
                          </li>
                        }
                      </ul>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
})
export class MaterialesCuentadanteComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly personaApi = inject(PersonaService);
  private readonly toast = inject(ToastService);

  readonly pestana = signal<Pestana>('mis-bienes');
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly bienes = signal<BienACargo[]>([]);
  readonly ingresos = signal<IngresoDevolutivo[]>([]);
  readonly puedeAsignar = signal(false);
  readonly candidatos = signal<SSOption[]>([]);
  readonly asignando = signal<IngresoDevolutivo | null>(null);
  readonly historialDe = signal<{ id: string; filas: HistorialCuentadante[] } | null>(null);
  readonly enviando = signal(false);
  readonly cuentadantes = signal<ResumenCuentadante[]>([]);
  readonly sinIngreso = signal<GrupoSinIngreso[]>([]);
  readonly grupoAbierto = signal<{ clave: string; grupo: GrupoSinIngreso; unidades: UnidadSinIngreso[] } | null>(null);
  readonly seleccion = signal<Set<string>>(new Set());
  readonly todasMarcadas = computed(() => {
    const g = this.grupoAbierto();
    return !!g && g.unidades.length > 0 && g.unidades.every((u) => this.seleccion().has(u.id_item));
  });
  /** 'yo' o el id del cuentadante cuyo inventario se está generando. */
  readonly descargando = signal<string | null>(null);

  readonly contadores = computed(() => {
    const b = this.bienes();
    return [
      { label: 'Bienes a cargo', valor: b.length, alerta: false },
      { label: 'Fuera de la bodega', valor: b.filter((x) => ['PRESTADO', 'FUERA_DE_SEDE', 'SALIDO'].includes(x.estado)).length, alerta: false },
      { label: 'Sin placa SENA', valor: b.filter((x) => !x.placa_sena?.trim()).length, alerta: true },
      { label: 'Con daño o novedad', valor: b.filter((x) => !!x.novedad || ['DAÑADO', 'PERDIDO'].includes(x.estado)).length, alerta: true },
    ];
  });

  readonly marcaModelo = marcaModelo;

  nuevoCuentadante: string | null = null;
  motivo = '';

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.bienes.set((await this.api.misBienesACargo()) ?? []);
      // Quien no gestiona el catálogo no ve la pestaña de asignar (el backend le daría 403).
      const gestor = await this.api.puedeGestionarCatalogo().catch(() => false);
      this.puedeAsignar.set(gestor);
      if (gestor) {
        const [ingresos, cuentadantes, sinIngreso] = await Promise.all([
          this.api.listarIngresosCuentadante(),
          this.api.listarCuentadantes(),
          this.api.listarSinIngresoCuentadante(),
        ]);
        this.ingresos.set(ingresos ?? []);
        this.cuentadantes.set(cuentadantes ?? []);
        this.sinIngreso.set(sinIngreso ?? []);
        void this.cargarCandidatos();
        if (this.bienes().length === 0) this.pestana.set(this.sinIngreso().length && !this.ingresos().length ? 'anterior' : 'ingresos');
      }
    } catch (e) {
      log.error('cuentadante: no se pudo cargar', e);
      this.error.set('No se pudo cargar la información del cuentadante.');
    } finally {
      this.cargando.set(false);
    }
  }

  /**
   * Personas elegibles: instructores activos más las cuentas que el administrador habilitó como
   * cuentadante en Usuarios (`puedeSerCuentadante`, 2026-10-07; el backend aplica la misma regla).
   * Un aprendiz nunca aparece, tenga o no la marca.
   * Se toman del mismo endpoint de datos mínimos que los responsables de bodega, que no exige
   * `usuarios.gestionar`. Ser encargado de bodega no cambia nada: son cosas independientes.
   */
  private async cargarCandidatos(): Promise<void> {
    try {
      const usuarios = await this.personaApi.listarResponsablesBodega();
      this.candidatos.set(
        usuarios
          .filter((u: any) => u.persona?.cargo === 'instructor' || (u.puedeSerCuentadante === true && u.persona?.cargo !== 'aprendiz'))
          .map((u: any) => ({
            value: u.idUsuario,
            label: `${u.persona?.nombre ?? ''} ${u.persona?.apellido ?? ''}`.trim(),
          })),
      );
    } catch (e) {
      log.warn('cuentadante: no se pudo cargar la lista de personas', e);
      this.toast.warn('No se pudo cargar la lista de personas', 'Reintentá recargando la pantalla.');
    }
  }

  abrirAsignar(i: IngresoDevolutivo): void {
    this.historialDe.set(null);
    this.nuevoCuentadante = i.id_cuentadante;
    this.motivo = '';
    this.asignando.set(i);
  }

  async guardar(i: IngresoDevolutivo): Promise<void> {
    if (!this.nuevoCuentadante) return;
    this.enviando.set(true);
    try {
      const r = await this.api.asignarCuentadante(i.id_ingreso, this.nuevoCuentadante, this.motivo);
      this.toast.ok(
        r?.actualizados ? 'Cuentadante asignado' : 'Sin cambios',
        r?.actualizados ? `${r.actualizados} unidad(es) actualizadas.` : 'Ya estaba a cargo de esa persona.',
      );
      this.asignando.set(null);
      this.ingresos.set((await this.api.listarIngresosCuentadante()) ?? []);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo asignar el cuentadante.');
    } finally {
      this.enviando.set(false);
    }
  }

  async verHistorial(i: IngresoDevolutivo): Promise<void> {
    if (this.historialDe()?.id === i.id_ingreso) {
      this.historialDe.set(null);
      return;
    }
    this.asignando.set(null);
    try {
      this.historialDe.set({ id: i.id_ingreso, filas: (await this.api.historialCuentadante(i.id_ingreso)) ?? [] });
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el historial.');
    }
  }

  claveGrupo(g: GrupoSinIngreso): string {
    return `${g.id_producto}|${g.id_sitio ?? ''}`;
  }

  async abrirGrupo(g: GrupoSinIngreso): Promise<void> {
    if (this.grupoAbierto()?.clave === this.claveGrupo(g)) {
      this.grupoAbierto.set(null);
      return;
    }
    try {
      this.nuevoCuentadante = null;
      this.motivo = '';
      await this.cargarUnidades(g);
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las unidades.');
    }
  }

  /** Carga las unidades del grupo y marca las que aún no tienen cuentadante (lo normal al repartir el inventario inicial). */
  private async cargarUnidades(g: GrupoSinIngreso): Promise<void> {
    const unidades = (await this.api.unidadesSinIngresoCuentadante(g.id_producto, g.id_sitio)) ?? [];
    this.seleccion.set(new Set(unidades.filter((u) => !u.id_cuentadante).map((u) => u.id_item)));
    this.grupoAbierto.set({ clave: this.claveGrupo(g), grupo: g, unidades });
  }

  marcar(id: string, marcado: boolean): void {
    const s = new Set(this.seleccion());
    if (marcado) s.add(id);
    else s.delete(id);
    this.seleccion.set(s);
  }

  marcarTodas(marcado: boolean): void {
    this.seleccion.set(marcado ? new Set(this.grupoAbierto()?.unidades.map((u) => u.id_item) ?? []) : new Set());
  }

  async guardarGrupo(): Promise<void> {
    const abierto = this.grupoAbierto();
    if (!abierto || !this.nuevoCuentadante || this.seleccion().size === 0) return;
    this.enviando.set(true);
    try {
      const r = await this.api.asignarCuentadanteItems([...this.seleccion()], this.nuevoCuentadante, this.motivo);
      this.toast.ok(
        r?.actualizados ? 'Cuentadante asignado' : 'Sin cambios',
        r?.actualizados ? `${r.actualizados} unidad(es) actualizadas.` : 'Ya estaban a cargo de esa persona.',
      );
      const [grupos, cuentadantes] = await Promise.all([this.api.listarSinIngresoCuentadante(), this.api.listarCuentadantes()]);
      this.sinIngreso.set(grupos ?? []);
      this.cuentadantes.set(cuentadantes ?? []);
      const sigue = (grupos ?? []).find((x) => this.claveGrupo(x) === abierto.clave);
      if (sigue) await this.cargarUnidades(sigue);
      else this.grupoAbierto.set(null);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo asignar el cuentadante.');
    } finally {
      this.enviando.set(false);
    }
  }

  async descargarMio(): Promise<void> {
    await this.descargar('yo', () => this.api.miInventarioCuentadante());
  }

  async descargarDe(idUsuario: string): Promise<void> {
    await this.descargar(idUsuario, () => this.api.inventarioDeCuentadante(idUsuario));
  }

  private async descargar(clave: string, pedir: () => Promise<InventarioCuentadante>): Promise<void> {
    this.descargando.set(clave);
    try {
      const { descargarInventarioCuentadante } = await import('./inventario-cuentadante-excel');
      await descargarInventarioCuentadante(await pedir());
    } catch (e) {
      this.toast.httpError(e, 'No se pudo generar el inventario.');
    } finally {
      this.descargando.set(null);
    }
  }

  estado(b: BienACargo): string {
    return ESTADO_LEGIBLE[b.estado] ?? b.estado;
  }

  cargo(c: string): string {
    return c.replace(/_/g, ' ').replace(/^\w/, (l) => l.toUpperCase());
  }

  fecha(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }
}
