import { Component, Injectable, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CampoCaracteristica, MaterialesApiService, PlantillaCaracteristicas } from '../data-access/materiales-api.service';
import {
  MAX_CAMPOS_PROPIOS, MAX_NOMBRE_CAMPO, MAX_VALOR_CAMPO, camposPropios, esCampoPropio, gruposDe,
} from '../caracteristicas-equipo.util';

export { resumenCaracteristicas, valoresLimpios } from '../caracteristicas-equipo.util';

/**
 * Características de los equipos (2026-10-08/09, decisiones del dueño). Hay dos clases de campos:
 *  - la **lista sugerida** de una categoría (hoy solo cómputo: procesador, RAM…), definida en el backend y pedida una
 *    sola vez por sesión;
 *  - **campos propios**: el usuario escribe el nombre del campo y su valor (Raspberry, Arduino, osciloscopio…), para
 *    cualquier producto, con o sin lista.
 */
@Injectable({ providedIn: 'root' })
export class PlantillasCaracteristicasService {
  private readonly api = inject(MaterialesApiService);
  private cache: Promise<Record<string, PlantillaCaracteristicas>> | null = null;
  /** Ya resueltas: para que una tarjeta pueda pintar sin esperar (`deSync`). */
  private resueltas: Record<string, PlantillaCaracteristicas> | null = null;

  todas(): Promise<Record<string, PlantillaCaracteristicas>> {
    this.cache ??= this.api.plantillasCaracteristicas().then(
      (t) => (this.resueltas = t),
      (e) => {
        this.cache = null; // que el próximo intento vuelva a pedirla
        throw e;
      },
    );
    return this.cache;
  }

  /** Pide las listas por adelantado (al abrir la pantalla), sin bloquear ni avisar si falla. */
  precargar(): void {
    this.todas().catch(() => undefined);
  }

  /** La lista si ya llegó; `undefined` si todavía no (null = esa categoría no tiene lista). */
  deSync(codigo: string | null | undefined): PlantillaCaracteristicas | null | undefined {
    if (!codigo) return null;
    return this.resueltas ? this.resueltas[codigo] ?? null : undefined;
  }

  async de(codigo: string | null | undefined): Promise<PlantillaCaracteristicas | null> {
    if (!codigo) return null;
    return (await this.todas())[codigo] ?? null;
  }
}

interface FilaPropia {
  campo: string;
  valor: string;
}

/**
 * <app-campos-caracteristicas> — editor de características. Edita en sitio el objeto `valores` del padre:
 *  - campos de la lista sugerida agrupados (Procesador, RAM…), cada uno se puede **quitar** (se vacía y se oculta) y
 *    volver a mostrar;
 *  - **campos propios**: filas nombre · valor · quitar, y "+ Agregar campo" con los nombres ya usados como sugerencia
 *    (`sugeridos`, del backend: lo usado en la ficha y su categoría).
 * Mismos límites que el backend; los errores se muestran en vivo (`errorPropios`).
 */
@Component({
  selector: 'app-campos-caracteristicas',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="space-y-4">
      @if (plantilla) {
        <div class="space-y-3">
          @for (g of gruposVisibles; track g.grupo) {
            <fieldset>
              <legend class="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">{{ g.grupo }}</legend>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                @for (c of g.campos; track c.clave) {
                  <label class="block" [class.col-span-2]="c.clave === 'procesador' || c.clave === 'graficos_modelo'">
                    <span class="flex items-center justify-between text-xs text-gray-500 mb-0.5">
                      <span>{{ c.etiqueta }}@if (c.unidad) { <span class="text-gray-400"> ({{ c.unidad }})</span> }</span>
                      <button type="button" (click)="quitarSugerido(c.clave)" title="Quitar este campo" class="text-gray-300 hover:text-red-500 leading-none">×</button>
                    </span>
                    @if (c.tipo === 'OPCION') {
                      <select [(ngModel)]="valores[c.clave]" [name]="c.clave"
                        class="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                        <option [ngValue]="undefined">—</option>
                        @for (o of c.opciones ?? []; track o) { <option [ngValue]="o">{{ o }}</option> }
                      </select>
                    } @else {
                      <input [type]="c.tipo === 'NUMERO' ? 'number' : 'text'" [attr.min]="c.tipo === 'NUMERO' ? 0 : null"
                        [attr.maxlength]="c.tipo === 'TEXTO' ? 120 : null" [(ngModel)]="valores[c.clave]" [name]="c.clave"
                        [placeholder]="c.ayuda ?? ''"
                        class="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                    }
                  </label>
                }
              </div>
            </fieldset>
          }
          @if (ocultos.size) {
            <button type="button" (click)="mostrarSugeridos()" class="text-xs font-medium text-[#2d8000] hover:underline">
              Mostrar los {{ ocultos.size }} campo(s) sugerido(s) quitados
            </button>
          }
        </div>
      }

      <!-- Campos propios: el usuario define el nombre y el valor. -->
      <div>
        @if (plantilla) {
          <p class="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Otros campos</p>
        }
        @if (filas.length) {
          <div class="space-y-1.5">
            @for (f of filas; track $index; let i = $index) {
              <div class="flex items-start gap-1.5">
                <input type="text" [(ngModel)]="f.campo" (ngModelChange)="sincronizar()" [attr.list]="idLista" [maxlength]="maxNombre"
                  placeholder="Campo (ej: Pines GPIO)" [name]="'campo' + i"
                  class="w-2/5 px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"
                  [class.border-red-400]="errorFila(i)" [class.border-gray-200]="!errorFila(i)" />
                <input type="text" [(ngModel)]="f.valor" (ngModelChange)="sincronizar()" [maxlength]="maxValor"
                  placeholder="Valor (ej: 40)" [name]="'valor' + i"
                  class="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                <button type="button" (click)="quitarFila(i)" aria-label="Quitar campo"
                  class="shrink-0 px-2 py-1.5 text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
              </div>
              @if (errorFila(i); as e) { <p class="text-[11px] text-red-500 -mt-1">{{ e }}</p> }
            }
          </div>
        } @else if (!plantilla) {
          <p class="text-xs text-gray-400">Agrega los campos que tenga este producto (ej: Microcontrolador, Pines GPIO, Voltaje).</p>
        }
        <datalist [id]="idLista">
          @for (s of sugeridosLibres; track s) { <option [value]="s"></option> }
        </datalist>
        @if (filas.length < maxPropios) {
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <button type="button" (click)="agregarFila()"
              class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-[#39A900]/40 text-[#2d8000] bg-[#39A900]/5 hover:bg-[#39A900]/10">
              + Agregar campo
            </button>
            @for (s of sugeridosLibres.slice(0, 6); track s) {
              <button type="button" (click)="agregarFila(s)"
                class="px-2.5 py-1 rounded-full text-[11px] border border-gray-200 text-gray-600 hover:border-gray-400">+ {{ s }}</button>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class CamposCaracteristicasComponent implements OnChanges {
  @Input({ required: true }) valores!: Record<string, any>;
  /** Nombres de campos propios ya usados (en la ficha y su categoría), para sugerir. */
  @Input() sugeridos: string[] = [];

  readonly maxPropios = MAX_CAMPOS_PROPIOS;
  readonly maxNombre = MAX_NOMBRE_CAMPO;
  readonly maxValor = MAX_VALOR_CAMPO;
  readonly idLista = `campos-sugeridos-${Math.random().toString(36).slice(2, 8)}`;

  grupos: { grupo: string; campos: CampoCaracteristica[] }[] = [];
  /** Campos de la lista sugerida que el usuario quitó (no aplican a este equipo). */
  ocultos = new Set<string>();
  filas: FilaPropia[] = [];
  /** Claves propias que este editor escribió en `valores` (para reemplazarlas al sincronizar). */
  private clavesPropias: string[] = [];
  private _plantilla: PlantillaCaracteristicas | null = null;

  @Input() set plantilla(p: PlantillaCaracteristicas | null) {
    this._plantilla = p;
    this.grupos = gruposDe(p);
  }
  get plantilla(): PlantillaCaracteristicas | null {
    return this._plantilla;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['valores']) {
      // Otro objeto = otra unidad / otro formulario: se rearman las filas desde lo que traiga.
      this.filas = camposPropios(this.valores ?? {}).map((p) => ({ ...p }));
      this.clavesPropias = this.filas.map((f) => f.campo);
      this.ocultos = new Set();
    }
  }

  get gruposVisibles() {
    return this.grupos
      .map((g) => ({ grupo: g.grupo, campos: g.campos.filter((c) => !this.ocultos.has(c.clave)) }))
      .filter((g) => g.campos.length);
  }

  /** Sugerencias que todavía no están en las filas. */
  get sugeridosLibres(): string[] {
    const usados = new Set(this.filas.map((f) => f.campo.trim().toLowerCase()));
    return this.sugeridos.filter((s) => esCampoPropio(s) && !usados.has(s.toLowerCase()));
  }

  quitarSugerido(clave: string): void {
    delete this.valores[clave];
    this.ocultos = new Set([...this.ocultos, clave]);
  }

  mostrarSugeridos(): void {
    this.ocultos = new Set();
  }

  agregarFila(campo = ''): void {
    if (this.filas.length >= this.maxPropios) return;
    this.filas = [...this.filas, { campo, valor: '' }];
    this.sincronizar();
  }

  quitarFila(i: number): void {
    this.filas = this.filas.filter((_, j) => j !== i);
    this.sincronizar();
  }

  /** Mensaje de error de una fila (mismos límites que el backend), o null. */
  errorFila(i: number): string | null {
    const f = this.filas[i];
    const nombre = f.campo.replace(/\s+/g, ' ').trim();
    if (!f.valor.trim()) return null; // fila sin valor: no se guarda
    if (nombre.length < 2) return 'Escribe el nombre del campo (mínimo 2 caracteres).';
    if (!esCampoPropio(nombre)) return 'Ese nombre está reservado; usa otro.';
    const repetido = this.filas.some((o, j) => j < i && o.valor.trim() && o.campo.replace(/\s+/g, ' ').trim().toLowerCase() === nombre.toLowerCase());
    return repetido ? 'Este campo está repetido.' : null;
  }

  /** ¿Algún campo propio tiene error? El padre lo usa para no dejar guardar. */
  get hayErrores(): boolean {
    return this.filas.some((_, i) => !!this.errorFila(i));
  }

  /** Pasa las filas al objeto `valores` del padre (reemplaza las claves propias anteriores). */
  sincronizar(): void {
    for (const k of this.clavesPropias) delete this.valores[k];
    this.clavesPropias = [];
    for (const f of this.filas) {
      const nombre = f.campo.replace(/\s+/g, ' ').trim();
      if (!nombre || !esCampoPropio(nombre) || nombre in this.valores) continue;
      this.valores[nombre] = f.valor;
      this.clavesPropias.push(nombre);
    }
  }
}
