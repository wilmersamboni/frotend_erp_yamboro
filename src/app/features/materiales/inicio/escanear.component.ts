import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ArrowLeft,
  CalendarClock,
  CircleCheck,
  FileText,
  Handshake,
  History,
  Keyboard,
  Lightbulb,
  LucideAngularModule,
  LucideIconData,
  MapPin,
  Package,
  PackagePlus,
  ScanLine,
  Search,
  ShoppingCart,
  Tag,
  TriangleAlert,
  Truck,
  Undo2,
  UserCheck,
  Wrench,
} from 'lucide-angular';
import { BarcodeScannerComponent } from '../../../shared/scanner/barcode-scanner.component';
import { ToastService, mensajeDeError } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AccionEscaneo, EstadoItem, FichaEscaneo, MaterialesApiService } from '../data-access/materiales-api.service';

interface VistaEstado {
  texto: string;
  icono: LucideIconData;
  /** Franja superior de la tarjeta. */
  franja: string;
  /** Chip del estado. */
  chip: string;
}

const ESTADOS: Record<string, VistaEstado> = {
  DISPONIBLE: { texto: 'Disponible', icono: CircleCheck, franja: 'bg-emerald-50 text-emerald-700 border-emerald-100', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PRESTADO: { texto: 'Prestado', icono: Handshake, franja: 'bg-sky-50 text-sky-700 border-sky-100', chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
  'DAÑADO': { texto: 'Dañado', icono: TriangleAlert, franja: 'bg-rose-50 text-rose-700 border-rose-100', chip: 'bg-rose-50 text-rose-700 ring-rose-200' },
  EN_MANTENIMIENTO: { texto: 'En mantenimiento', icono: Wrench, franja: 'bg-amber-50 text-amber-700 border-amber-100', chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
  PERDIDO: { texto: 'Perdido', icono: Search, franja: 'bg-gray-100 text-gray-700 border-gray-200', chip: 'bg-gray-100 text-gray-700 ring-gray-300' },
  RESERVADO: { texto: 'Apartado para un traslado', icono: Truck, franja: 'bg-violet-50 text-violet-700 border-violet-100', chip: 'bg-violet-50 text-violet-700 ring-violet-200' },
};
const DE_BAJA: VistaEstado = { texto: 'Dado de baja', icono: Package, franja: 'bg-gray-100 text-gray-600 border-gray-200', chip: 'bg-gray-100 text-gray-600 ring-gray-300' };

const ACCIONES: Record<AccionEscaneo, { texto: string; icono: LucideIconData; principal?: boolean; ayuda: string }> = {
  PRESTAR: { texto: 'Entregar a una ficha', icono: Handshake, principal: true, ayuda: 'Se lo entregas a un grupo de aprendices' },
  TRASLADAR: { texto: 'Mover a otra bodega', icono: Truck, ayuda: 'Pasa a otra bodega o ambiente' },
  REPORTAR: { texto: 'Reportar un problema', icono: TriangleAlert, ayuda: 'Daño, pérdida o falla' },
  RECIBIR_DEVOLUCION: { texto: 'Recibir devolución', icono: Undo2, principal: true, ayuda: 'Te lo devolvieron' },
  RECIBIR_ASIGNACION: { texto: 'Recibir devolución', icono: Undo2, principal: true, ayuda: 'La ficha lo devolvió' },
  ENVIAR_MANTENIMIENTO: { texto: 'Enviar a mantenimiento', icono: Wrench, principal: true, ayuda: 'Lo van a revisar o reparar' },
  MARCAR_REPARADO: { texto: 'Ya está bien', icono: CircleCheck, ayuda: 'Vuelve a quedar disponible' },
  MARCAR_ENCONTRADO: { texto: 'Apareció', icono: Search, principal: true, ayuda: 'Vuelve a quedar disponible' },
  VER_NOVEDAD: { texto: 'Ver el problema reportado', icono: FileText, ayuda: 'Seguimiento del daño' },
  VER_TRASLADO: { texto: 'Ver el traslado', icono: Truck, ayuda: 'Está esperando aprobación' },
  PEDIR_PRESTADO: { texto: 'Pedirlo prestado', icono: ShoppingCart, principal: true, ayuda: 'Se envía la solicitud a la bodega' },
  VER_HISTORIAL: { texto: 'Ver todo su historial', icono: History, ayuda: 'Todos sus movimientos' },
};

interface Reciente {
  placa: string;
  nombre: string;
  estado: VistaEstado;
}

/**
 * "Escanear placa" (2026-10-05, rediseño): primero se escanea y el sistema
 * dice qué se puede hacer con ese equipo. Cada botón lleva a la pantalla que
 * ya existe (con el equipo ya elegido por la URL) o cambia el estado
 * directamente. `?placa=…` abre directo la tarjeta de esa placa.
 */
@Component({
  selector: 'app-materiales-escanear',
  standalone: true,
  imports: [BarcodeScannerComponent, RouterLink, LucideAngularModule],
  styles: [`
    .accion { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
    .accion:hover { transform: translateY(-1px); box-shadow: 0 8px 18px -10px rgb(15 23 42 / .3); }
  `],
  template: `
    <div class="p-4 sm:p-6 max-w-6xl mx-auto">
      <!-- ── Cabecera ── -->
      <section class="relative overflow-hidden rounded-3xl border border-gray-200 bg-white px-6 py-6 sm:px-8 shadow-sm">
        <lucide-icon [img]="i.ScanLine" [size]="180" [strokeWidth]="1" class="pointer-events-none absolute -right-6 -top-8 text-gray-100 hidden sm:block"></lucide-icon>
        <a routerLink="/materiales/inicio" class="relative inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#2d8000]">
          <lucide-icon [img]="i.ArrowLeft" [size]="14"></lucide-icon> Inicio
        </a>
        <div class="relative mt-2 flex items-center gap-4">
          <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#39A900]/10 text-[#2d8000] ring-1 ring-[#39A900]/20">
            <lucide-icon [img]="i.ScanLine" [size]="30"></lucide-icon>
          </span>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">Escanear placa</h1>
            <p class="text-sm text-gray-600">Apunta la cámara a la placa SENA y te decimos qué es y qué puedes hacer con él.</p>
          </div>
        </div>
      </section>

      <div class="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <!-- ── Columna principal ── -->
        <div class="min-w-0">
          @if (!ficha()) {
            <div class="rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
              <app-barcode-scanner perfil="placa" [activo]="!buscando()" (scanned)="buscar($event)"></app-barcode-scanner>
              @if (buscando()) {
                <div class="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                  <span class="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#39A900]"></span> Buscando la placa…
                </div>
              }
            </div>
            @if (noEncontrada(); as nf) {
              <div class="mt-4 flex gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                  <lucide-icon [img]="i.Search" [size]="22"></lucide-icon>
                </span>
                <div class="text-sm text-amber-900">
                  <p class="font-semibold">No encontramos la placa {{ nf }}</p>
                  <p class="mt-1 text-amber-800">Revisa que esté bien escrita. Si es un equipo nuevo, todavía no tiene la placa en el sistema:
                    quien gestiona la bodega se la pone en <a routerLink="/materiales/items" class="font-semibold underline">Equipos con placa</a>.</p>
                </div>
              </div>
            }
          } @else {
            @let f = ficha()!;
            @let e = estado(f);
            <article class="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
              <!-- Franja del estado -->
              <div class="flex items-center gap-3 border-b px-5 py-3" [class]="e.franja">
                <lucide-icon [img]="e.icono" [size]="20"></lucide-icon>
                <span class="text-sm font-semibold">{{ e.texto }}</span>
                <span class="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 font-mono text-xs text-gray-700 ring-1 ring-gray-200">
                  <lucide-icon [img]="i.Tag" [size]="12"></lucide-icon>{{ f.item.placa_sena }}
                </span>
              </div>

              <div class="p-5 sm:p-6">
                <div class="flex items-start gap-4">
                  <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-gray-500 ring-1 ring-gray-200">
                    <lucide-icon [img]="i.Package" [size]="28"></lucide-icon>
                  </span>
                  <div class="min-w-0">
                    <h2 class="text-xl font-bold leading-tight text-gray-900">{{ f.producto.nombre }}</h2>
                    <p class="mt-0.5 text-sm text-gray-500">{{ subtitulo(f) || 'Sin marca ni modelo' }}</p>
                  </div>
                </div>

                <dl class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
                    <lucide-icon [img]="i.MapPin" [size]="18" class="mt-0.5 text-gray-400"></lucide-icon>
                    <div><dt class="text-xs text-gray-500">Dónde está</dt><dd class="text-sm font-semibold text-gray-800">{{ f.ubicacion?.nombre ?? 'Sin bodega' }}</dd></div>
                  </div>
                  <div class="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
                    <lucide-icon [img]="i.UserCheck" [size]="18" class="mt-0.5 text-gray-400"></lucide-icon>
                    <div><dt class="text-xs text-gray-500">Quién responde</dt><dd class="text-sm font-semibold text-gray-800">{{ f.ubicacion?.responsable_nombre ?? 'Sin responsable' }}</dd></div>
                  </div>
                  @if (f.ingreso; as ing) {
                    <div class="flex items-start gap-3 rounded-xl bg-gray-50 p-3 sm:col-span-2">
                      <lucide-icon [img]="i.PackagePlus" [size]="18" class="mt-0.5 text-gray-400"></lucide-icon>
                      <div><dt class="text-xs text-gray-500">Cómo llegó</dt>
                        <dd class="text-sm font-semibold text-gray-800">{{ ing.codigo }} · {{ ing.fecha_ingreso }}{{ ing.proveedor ? ' · ' + ing.proveedor : '' }}</dd></div>
                    </div>
                  }
                </dl>

                @if (f.tenencia; as t) {
                  @let vencido = (t.dias_atraso ?? 0) > 0;
                  <div class="mt-4 flex gap-3 rounded-2xl border p-4" [class]="vencido ? 'border-rose-200 bg-rose-50' : 'border-sky-200 bg-sky-50'">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" [class]="vencido ? 'bg-rose-100 text-rose-600' : 'bg-sky-100 text-sky-600'">
                      <lucide-icon [img]="i.CalendarClock" [size]="20"></lucide-icon>
                    </span>
                    <div class="text-sm" [class]="vencido ? 'text-rose-900' : 'text-sky-900'">
                      <p class="font-semibold">
                        {{ t.tipo === 'PRESTAMO' ? 'Prestado' : 'Entregado a una ficha' }}@if (t.persona) { a {{ t.persona }}}@if (t.ficha) { · ficha {{ t.ficha }}}
                      </p>
                      <p class="mt-0.5">
                        @if (t.desde) { Desde el {{ t.desde }}. }
                        @if (t.hasta) {
                          @if (vencido) { <strong>Debía devolverse hace {{ t.dias_atraso }} día(s)</strong> ({{ t.hasta }}). }
                          @else if (t.dias_atraso === 0) { <strong>Se devuelve hoy.</strong> }
                          @else { Se devuelve el {{ t.hasta }}. }
                        }
                      </p>
                    </div>
                  </div>
                }

                @if (f.novedad_activa; as n) {
                  <div class="mt-3 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                      <lucide-icon [img]="i.TriangleAlert" [size]="20"></lucide-icon>
                    </span>
                    <div class="text-sm text-amber-900">
                      <p class="font-semibold">Problema reportado: {{ tipoNovedad(n.tipo) }} · {{ n.estado === 'PENDIENTE' ? 'sin atender' : 'en proceso' }}</p>
                      @if (n.descripcion) { <p class="mt-0.5">{{ n.descripcion }}</p> }
                    </div>
                  </div>
                }
              </div>

              <!-- Acciones -->
              @if (f.acciones.length) {
                <div class="border-t border-gray-100 bg-gray-50/70 p-5 sm:p-6">
                  <p class="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">¿Qué quieres hacer?</p>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    @for (a of accionesVisibles(f); track a) {
                      <button type="button" (click)="ejecutar(f, a)" [disabled]="trabajando()"
                        class="accion flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left disabled:opacity-60"
                        [class]="acc(a).principal ? 'border-transparent text-white' : 'border-gray-200 bg-white text-gray-800 hover:border-[#39A900]'"
                        [style.background-color]="acc(a).principal ? 'var(--accent-brand)' : null">
                        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                          [class]="acc(a).principal ? 'bg-white/20' : 'bg-gray-100 text-gray-600'">
                          <lucide-icon [img]="acc(a).icono" [size]="20"></lucide-icon>
                        </span>
                        <span class="min-w-0">
                          <span class="block text-sm font-semibold">{{ acc(a).texto }}</span>
                          <span class="block text-xs" [class]="acc(a).principal ? 'text-white/80' : 'text-gray-500'">{{ acc(a).ayuda }}</span>
                        </span>
                      </button>
                    }
                  </div>
                </div>
              } @else if (f.item.activo) {
                <p class="border-t border-gray-100 bg-gray-50/70 p-5 text-sm text-gray-600">
                  {{ f.item.estado === 'DISPONIBLE' ? 'Este equipo está en una bodega desde la que no puedes pedir. Pregúntale a quien la gestiona.' : 'Por ahora no hay nada que puedas hacer con este equipo.' }}
                </p>
              }

              <!-- Historial -->
              @if (f.historial.length) {
                <div class="border-t border-gray-100 p-5 sm:p-6">
                  <p class="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                    <lucide-icon [img]="i.History" [size]="14"></lucide-icon> Últimos movimientos
                  </p>
                  <ol class="relative ml-1.5 space-y-3 border-l-2 border-gray-100 pl-5">
                    @for (h of f.historial; track $index) {
                      <li class="relative">
                        <span class="absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white" [class]="h.tipo === 'ENTRADA' ? 'bg-emerald-500' : h.tipo === 'SALIDA' ? 'bg-rose-500' : 'bg-sky-500'"></span>
                        <p class="text-xs text-gray-400">{{ h.fecha }} · <span class="font-semibold text-gray-600">{{ h.tipo }}</span></p>
                        @if (h.observacion) { <p class="text-sm text-gray-700">{{ h.observacion }}</p> }
                      </li>
                    }
                  </ol>
                </div>
              }
            </article>

            <button type="button" (click)="otro()"
              class="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#39A900]/40 bg-white py-4 text-sm font-semibold text-[#2d8000] transition hover:border-[#39A900] hover:bg-[#39A900]/5">
              <lucide-icon [img]="i.ScanLine" [size]="18"></lucide-icon> Escanear otro equipo
            </button>
          }
        </div>

        <!-- ── Columna lateral ── -->
        <aside class="space-y-4">
          @if (recientes().length) {
            <div class="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <p class="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Escaneados ahora</p>
              <ul class="space-y-2">
                @for (r of recientes(); track r.placa) {
                  <li>
                    <button type="button" (click)="buscar(r.placa)" class="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-gray-50">
                      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1" [class]="r.estado.chip">
                        <lucide-icon [img]="r.estado.icono" [size]="16"></lucide-icon>
                      </span>
                      <span class="min-w-0">
                        <span class="block truncate text-sm font-medium text-gray-800">{{ r.nombre }}</span>
                        <span class="block font-mono text-xs text-gray-400">{{ r.placa }}</span>
                      </span>
                    </button>
                  </li>
                }
              </ul>
            </div>
          }
          <div class="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <p class="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
              <lucide-icon [img]="i.Lightbulb" [size]="14"></lucide-icon> Consejos
            </p>
            <ul class="space-y-3 text-sm text-gray-600">
              <li class="flex gap-3"><lucide-icon [img]="i.ScanLine" [size]="18" class="shrink-0 text-[#39A900]"></lucide-icon>Acerca la cámara hasta que el código llene el recuadro.</li>
              <li class="flex gap-3"><lucide-icon [img]="i.Lightbulb" [size]="18" class="shrink-0 text-[#39A900]"></lucide-icon>Si hay poca luz, prende la linterna desde el botón de la cámara.</li>
              <li class="flex gap-3"><lucide-icon [img]="i.Keyboard" [size]="18" class="shrink-0 text-[#39A900]"></lucide-icon>¿Etiqueta gastada? Usa «Escribir a mano» y digita la placa.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class EscanearComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly i = { ArrowLeft, CalendarClock, History, Keyboard, Lightbulb, MapPin, Package, PackagePlus, ScanLine, Search, Tag, TriangleAlert, UserCheck };
  readonly ficha = signal<FichaEscaneo | null>(null);
  readonly buscando = signal(false);
  readonly trabajando = signal(false);
  readonly noEncontrada = signal<string | null>(null);
  readonly recientes = signal<Reciente[]>([]);

  ngOnInit(): void {
    const placa = this.route.snapshot.queryParamMap.get('placa');
    if (placa) void this.buscar(placa);
  }

  async buscar(leido: string): Promise<void> {
    const placa = leido.trim();
    if (!placa || this.buscando()) return;
    this.buscando.set(true);
    this.noEncontrada.set(null);
    try {
      const f = await this.api.escanearPlaca(placa);
      this.ficha.set(f);
      this.recordar(f);
    } catch (e: any) {
      if (e?.status === 404) this.noEncontrada.set(placa);
      else this.toast.httpError(e, 'No se pudo buscar la placa.');
    } finally {
      this.buscando.set(false);
    }
  }

  /** Los últimos 5 escaneados de esta visita, para volver a uno con un clic. */
  private recordar(f: FichaEscaneo): void {
    const placa = f.item.placa_sena ?? '';
    const r: Reciente = { placa, nombre: f.producto.nombre, estado: this.estado(f) };
    this.recientes.update((lista) => [r, ...lista.filter((x) => x.placa !== placa)].slice(0, 5));
  }

  otro(): void {
    this.ficha.set(null);
    this.noEncontrada.set(null);
  }

  estado(f: FichaEscaneo): VistaEstado {
    if (!f.item.activo) return DE_BAJA;
    return ESTADOS[f.item.estado] ?? { ...DE_BAJA, texto: f.item.estado };
  }

  acc(a: AccionEscaneo) {
    return ACCIONES[a];
  }

  /** Principales primero. */
  accionesVisibles(f: FichaEscaneo): AccionEscaneo[] {
    return [...f.acciones].sort((a, b) => Number(!!ACCIONES[b].principal) - Number(!!ACCIONES[a].principal));
  }

  subtitulo(f: FichaEscaneo): string {
    return [f.producto.marca, f.producto.modelo, f.producto.categoria].filter(Boolean).join(' · ');
  }

  tipoNovedad(t: string): string {
    return ({ 'DAÑO': 'daño', PERDIDA: 'pérdida', MANTENIMIENTO: 'mantenimiento', DISCREPANCIA: 'no coincide con lo registrado', OTRO: 'otro' } as Record<string, string>)[t] ?? t;
  }

  async ejecutar(f: FichaEscaneo, a: AccionEscaneo): Promise<void> {
    const id = f.item.id_item;
    switch (a) {
      case 'PRESTAR':
        return void this.router.navigate(['/materiales/asignaciones'], { queryParams: { nuevo: 1, id_sitio: f.ubicacion?.id_sitio, id_producto: f.producto.id_producto } });
      case 'TRASLADAR':
        return void this.router.navigate(['/materiales/traslados'], { queryParams: { nuevo: 1, placa: f.item.placa_sena } });
      case 'REPORTAR':
        return void this.router.navigate(['/materiales/novedades'], { queryParams: { nuevo: 1, id_item: id, tipo: 'DAÑO' } });
      case 'RECIBIR_DEVOLUCION':
        return void this.router.navigate(['/materiales/devoluciones'], { queryParams: { id_solicitud: f.tenencia?.id_solicitud } });
      case 'RECIBIR_ASIGNACION':
        return void this.router.navigate(['/materiales/asignaciones'], { queryParams: { id_asignacion: f.tenencia?.id_asignacion } });
      case 'VER_NOVEDAD':
        return void this.router.navigate(['/materiales/novedades'], { queryParams: { id_item: id } });
      case 'VER_TRASLADO':
        return void this.router.navigate(['/materiales/traslados']);
      case 'VER_HISTORIAL':
        return void this.router.navigate(['/materiales/kardex'], { queryParams: { id_item: id } });
      case 'PEDIR_PRESTADO':
        return void this.router.navigate(['/materiales/solicitudes'], { queryParams: { nuevo: 1, ref: f.ref_solicitud } });
      case 'ENVIAR_MANTENIMIENTO':
        return this.cambiarEstado(f, 'EN_MANTENIMIENTO', '¿Enviar este equipo a mantenimiento? Queda fuera de préstamo hasta que lo marques como bien.');
      case 'MARCAR_REPARADO':
        return this.cambiarEstado(f, 'DISPONIBLE', '¿El equipo ya está bien? Vuelve a quedar disponible para prestar.');
      case 'MARCAR_ENCONTRADO':
        return this.cambiarEstado(f, 'DISPONIBLE', '¿Apareció el equipo? Vuelve a quedar disponible en su bodega.');
    }
  }

  private async cambiarEstado(f: FichaEscaneo, estado: EstadoItem, pregunta: string): Promise<void> {
    if (!(await this.confirm.ask(pregunta))) return;
    this.trabajando.set(true);
    try {
      await this.api.actualizarEstadoItem(f.item.id_item, estado);
      this.toast.ok('Listo', `${f.producto.nombre} quedó ${ESTADOS[estado]?.texto.toLowerCase() ?? estado}.`);
      const nueva = await this.api.escanearPlaca(f.item.placa_sena ?? '');
      this.ficha.set(nueva);
      this.recordar(nueva);
    } catch (e) {
      this.toast.error('No se pudo cambiar el estado', mensajeDeError(e, 'Intenta de nuevo.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
