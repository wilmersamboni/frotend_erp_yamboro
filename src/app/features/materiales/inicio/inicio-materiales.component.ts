import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ArrowRight,
  Bell,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  FileText,
  Handshake,
  LucideAngularModule,
  LucideIconData,
  PackagePlus,
  PartyPopper,
  ScanLine,
  Search,
  ShoppingCart,
  Tag,
  TriangleAlert,
  Truck,
  Undo2,
  UserCheck,
  Warehouse,
} from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { MaterialesApiService, PendienteMateriales } from '../data-access/materiales-api.service';

type Tono = 'verde' | 'azul' | 'violeta' | 'ambar' | 'rosa' | 'indigo' | 'naranja' | 'teal' | 'gris';

interface Tarea {
  icono: LucideIconData;
  tono: Tono;
  titulo: string;
  ayuda: string;
  ruta: string;
  query?: Record<string, string | number>;
  visible: boolean;
  /** Pendientes que se cuentan en el globito de la tarjeta. */
  pendientes?: string[];
}

/** Recuadro del ícono y realce de la tarjeta, por tono. */
const TONOS: Record<Tono, { tile: string; borde: string }> = {
  verde: { tile: 'bg-emerald-50 text-emerald-600 ring-emerald-100', borde: 'hover:border-emerald-300' },
  azul: { tile: 'bg-sky-50 text-sky-600 ring-sky-100', borde: 'hover:border-sky-300' },
  violeta: { tile: 'bg-violet-50 text-violet-600 ring-violet-100', borde: 'hover:border-violet-300' },
  ambar: { tile: 'bg-amber-50 text-amber-600 ring-amber-100', borde: 'hover:border-amber-300' },
  rosa: { tile: 'bg-rose-50 text-rose-600 ring-rose-100', borde: 'hover:border-rose-300' },
  indigo: { tile: 'bg-indigo-50 text-indigo-600 ring-indigo-100', borde: 'hover:border-indigo-300' },
  naranja: { tile: 'bg-orange-50 text-orange-600 ring-orange-100', borde: 'hover:border-orange-300' },
  teal: { tile: 'bg-teal-50 text-teal-600 ring-teal-100', borde: 'hover:border-teal-300' },
  gris: { tile: 'bg-gray-100 text-gray-600 ring-gray-200', borde: 'hover:border-gray-300' },
};

/** Ícono de cada pendiente de la bandeja. */
const ICONO_PENDIENTE: Record<string, LucideIconData> = {
  prestamos_vencidos: CalendarClock,
  asignaciones_vencidas: CalendarClock,
  solicitudes_por_aprobar: ClipboardCheck,
  solicitudes_por_entregar: Handshake,
  traslados_por_aprobar: Truck,
  novedades_abiertas: TriangleAlert,
  stock_bajo: Boxes,
  lotes_por_vencer: Clock3,
  unidades_sin_placa: Tag,
  ingresos_sin_soporte: FileText,
  fichas_pedidas: PackagePlus,
  mis_prestamos_vencidos: CalendarClock,
  mis_prestamos_por_vencer: Clock3,
  mis_solicitudes_listas: UserCheck,
  mis_fichas_respondidas: Bell,
};

/**
 * Inicio de Materiales (2026-10-05, rediseño): saludo con resumen y el
 * escaneo como acción principal; tareas agrupadas, cada una con su ícono y
 * color (y un globito si tiene pendientes); y la bandeja de pendientes con
 * semáforo. Solo se muestran las tareas que esa persona puede usar.
 */
@Component({
  selector: 'app-materiales-inicio',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  styles: [`
    .tarjeta { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
    .tarjeta:hover { transform: translateY(-2px); box-shadow: 0 10px 24px -12px rgb(15 23 42 / .25); }
    .tarjeta:hover .flecha { transform: translateX(3px); opacity: 1; }
    .flecha { transition: transform .18s ease, opacity .18s ease; opacity: .45; }
  `],
  template: `
    <div class="p-4 sm:p-6 max-w-6xl mx-auto space-y-8">
      <!-- ── Saludo + escaneo ── -->
      <section class="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <lucide-icon [img]="iconos.Warehouse" [size]="220" [strokeWidth]="1"
          class="pointer-events-none absolute -right-10 -bottom-12 text-gray-100 hidden sm:block"></lucide-icon>
        <div class="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p class="text-sm font-medium text-gray-500 capitalize">{{ fecha }}</p>
            <h1 class="mt-1 text-2xl sm:text-3xl font-bold text-gray-900">{{ saludo }}, {{ nombre() }}</h1>
            <p class="mt-1 text-gray-600">{{ resumenPendientes() }}</p>
            @if (conteo().total > 0) {
              <div class="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                @if (conteo().rojo) { <span class="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-red-700 ring-1 ring-red-200"><span class="h-2 w-2 rounded-full bg-red-500"></span>{{ conteo().rojo }} urgente(s)</span> }
                @if (conteo().amarillo) { <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-700 ring-1 ring-amber-200"><span class="h-2 w-2 rounded-full bg-amber-500"></span>{{ conteo().amarillo }} por atender</span> }
                @if (conteo().azul) { <span class="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-sky-700 ring-1 ring-sky-200"><span class="h-2 w-2 rounded-full bg-sky-500"></span>{{ conteo().azul }} para revisar</span> }
              </div>
            }
          </div>
          <a routerLink="/materiales/escanear"
            class="relative group inline-flex items-center gap-4 self-start lg:self-auto rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-gray-800 transition hover:border-[#39A900] hover:bg-white hover:shadow-md">
            <span class="flex h-12 w-12 items-center justify-center rounded-xl text-white" style="background-color: var(--accent-brand)">
              <lucide-icon [img]="iconos.ScanLine" [size]="26"></lucide-icon>
            </span>
            <span>
              <span class="block text-base font-bold">Escanear placa</span>
              <span class="block text-xs text-gray-500">Mira qué es un equipo y qué hacer con él</span>
            </span>
            <lucide-icon [img]="iconos.ArrowRight" [size]="18" class="text-gray-400 transition group-hover:translate-x-1"></lucide-icon>
          </a>
        </div>
      </section>

      <!-- ── Tareas ── -->
      @for (grupo of grupos(); track grupo.titulo) {
        @if (grupo.tareas.length) {
          <section>
            <h2 class="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">{{ grupo.titulo }}</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              @for (t of grupo.tareas; track t.titulo) {
                <a [routerLink]="t.ruta" [queryParams]="t.query ?? null"
                  class="tarjeta relative flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" [class]="tono(t).borde">
                  <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1" [class]="tono(t).tile">
                    <lucide-icon [img]="t.icono" [size]="24"></lucide-icon>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[15px] font-semibold text-gray-900">{{ t.titulo }}</span>
                    <span class="mt-0.5 block text-sm text-gray-500 leading-snug">{{ t.ayuda }}</span>
                  </span>
                  <lucide-icon [img]="iconos.ArrowRight" [size]="18" class="flecha mt-1 text-gray-400"></lucide-icon>
                  @if (globito(t); as n) {
                    <span class="absolute -top-2 -right-2 min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow ring-2 ring-white">{{ n }}</span>
                  }
                </a>
              }
            </div>
          </section>
        }
      }

      <!-- ── Pendientes ── -->
      <section>
        <div class="mb-3 flex items-center gap-2">
          <lucide-icon [img]="iconos.Bell" [size]="18" class="text-gray-500"></lucide-icon>
          <h2 class="text-lg font-bold text-gray-800">Lo que tienes pendiente</h2>
        </div>
        @if (cargando()) {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            @for (x of [1, 2]; track x) { <div class="h-20 rounded-2xl bg-gray-100 animate-pulse"></div> }
          </div>
        } @else if (pendientes().length === 0) {
          <div class="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5">
            <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <lucide-icon [img]="iconos.PartyPopper" [size]="24"></lucide-icon>
            </span>
            <div>
              <p class="font-semibold text-emerald-900">¡Todo al día!</p>
              <p class="text-sm text-emerald-800/80">No tienes nada pendiente en Materiales.</p>
            </div>
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            @for (p of pendientes(); track p.clave) {
              <a [routerLink]="p.ruta" [queryParams]="p.query ?? null"
                class="tarjeta group flex items-center gap-4 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm"
                [class]="nivel(p).borde">
                <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" [class]="nivel(p).tile">
                  <lucide-icon [img]="iconoPendiente(p)" [size]="22"></lucide-icon>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline gap-2">
                    <span class="text-2xl font-bold" [class]="nivel(p).numero">{{ p.cantidad }}</span>
                    <span class="text-sm font-medium text-gray-800 leading-tight">{{ p.titulo }}</span>
                  </span>
                  @if (p.detalle) { <span class="mt-0.5 block truncate text-xs text-gray-500">{{ p.detalle }}</span> }
                </span>
                <span class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition group-hover:brightness-95" [class]="nivel(p).boton">Ver</span>
              </a>
            }
          </div>
        }
      </section>
    </div>
  `,
})
export class InicioMaterialesComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly auth = inject(AuthService);

  readonly iconos = { ArrowRight, Bell, PartyPopper, ScanLine, Warehouse };
  readonly pendientes = signal<PendienteMateriales[]>([]);
  readonly cargando = signal(true);
  private readonly gestor = signal(false);
  private readonly encargado = signal(false);
  private readonly registraIngresos = signal(false);

  readonly fecha = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  readonly saludo = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  })();
  readonly nombre = computed(() => (this.auth.user()?.nombre ?? '').split(' ')[0] || 'bienvenido');

  readonly conteo = computed(() => {
    const ps = this.pendientes();
    const c = { rojo: 0, amarillo: 0, azul: 0, total: ps.length };
    for (const p of ps) c[p.nivel]++;
    return c;
  });

  readonly resumenPendientes = computed(() => {
    if (this.cargando()) return 'Revisando lo que tienes pendiente…';
    const n = this.conteo().total;
    return n === 0 ? 'Todo está al día. ¿Qué quieres hacer hoy?' : `Tienes ${n} asunto${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'}. Empieza por lo rojo.`;
  });

  readonly grupos = computed(() => {
    const s = (n: string) => this.auth.tieneServicio(n);
    const gestor = this.gestor();
    const recibir: Tarea[] = [
      { icono: PackagePlus, tono: 'verde', titulo: 'Llegó material', ayuda: 'Registra lo que entró a la sede, con su factura', ruta: '/materiales/ingresos', query: { nuevo: 1 }, visible: this.registraIngresos(), pendientes: ['ingresos_sin_soporte'] },
      { icono: ClipboardCheck, tono: 'azul', titulo: 'Aprobar y entregar pedidos', ayuda: 'Lo que te pidieron prestado', ruta: '/materiales/solicitudes', visible: gestor && s('materiales.solicitudes.ver'), pendientes: ['solicitudes_por_aprobar', 'solicitudes_por_entregar'] },
      { icono: ShoppingCart, tono: 'violeta', titulo: 'Pedir material', ayuda: 'Pide prestado o para gastar', ruta: '/materiales/solicitudes', query: { nuevo: 1 }, visible: s('materiales.solicitudes.crear'), pendientes: ['mis_solicitudes_listas'] },
      { icono: Undo2, tono: 'teal', titulo: 'Me devolvieron algo', ayuda: 'Recibe lo que se había prestado', ruta: '/materiales/devoluciones', visible: gestor && s('materiales.devoluciones.ver'), pendientes: ['prestamos_vencidos'] },
      { icono: Handshake, tono: 'indigo', titulo: 'Entregar a una ficha', ayuda: 'Material para un grupo de aprendices', ruta: '/materiales/asignaciones', query: { nuevo: 1 }, visible: gestor && (this.auth.isAdmin() || s('materiales.asignaciones.crear')), pendientes: ['asignaciones_vencidas'] },
    ];
    const controlar: Tarea[] = [
      { icono: Truck, tono: 'naranja', titulo: 'Mover a otra bodega', ayuda: 'Pasa equipos o material entre bodegas', ruta: '/materiales/traslados', query: { nuevo: 1 }, visible: s('materiales.traslados.crear'), pendientes: ['traslados_por_aprobar'] },
      { icono: TriangleAlert, tono: 'rosa', titulo: 'Algo se dañó o perdió', ayuda: 'Reporta un problema con un equipo', ruta: '/materiales/novedades', query: { nuevo: 1 }, visible: s('materiales.novedades.crear'), pendientes: ['novedades_abiertas'] },
      { icono: Search, tono: 'ambar', titulo: '¿Qué hay y dónde?', ayuda: 'Cuánto hay de cada cosa y en qué bodega', ruta: '/materiales/existencias', visible: s('materiales.existencias.ver'), pendientes: ['stock_bajo'] },
      { icono: Warehouse, tono: 'gris', titulo: 'Mi bodega', ayuda: 'Todo lo de las bodegas a tu cargo', ruta: '/mi-bodega', visible: this.encargado() && !this.auth.isAdmin() },
    ];
    return [
      { titulo: 'Recibir y entregar', tareas: recibir.filter((t) => t.visible) },
      { titulo: 'Mover y controlar', tareas: controlar.filter((t) => t.visible) },
    ];
  });

  ngOnInit(): void {
    void this.cargarRol();
    void this.cargarPendientes();
  }

  private async cargarRol(): Promise<void> {
    const [aCargo, lider, ingresos] = await Promise.all([
      this.api.sitiosACargo().catch(() => []),
      this.api.puedeGestionarCatalogo().catch(() => false),
      this.api.accesoIngresos().catch(() => ({ puede: false })),
    ]);
    this.registraIngresos.set(ingresos.puede);
    this.encargado.set(aCargo.length > 0);
    this.gestor.set(this.auth.isAdmin() || aCargo.length > 0 || lider);
  }

  private async cargarPendientes(): Promise<void> {
    try {
      this.pendientes.set(await this.api.pendientesMateriales());
    } catch {
      this.pendientes.set([]);
    } finally {
      this.cargando.set(false);
    }
  }

  tono(t: Tarea) {
    return TONOS[t.tono];
  }

  /** Suma de los pendientes de la tarea (0 → sin globito). */
  globito(t: Tarea): number {
    const claves = new Set(t.pendientes ?? []);
    return this.pendientes().filter((p) => claves.has(p.clave)).reduce((a, p) => a + p.cantidad, 0);
  }

  iconoPendiente(p: PendienteMateriales): LucideIconData {
    return ICONO_PENDIENTE[p.clave] ?? Bell;
  }

  nivel(p: PendienteMateriales) {
    if (p.nivel === 'rojo') return { borde: 'border-red-200 hover:border-red-300', tile: 'bg-red-50 text-red-600', numero: 'text-red-600', boton: 'bg-red-50 text-red-700' };
    if (p.nivel === 'amarillo') return { borde: 'border-amber-200 hover:border-amber-300', tile: 'bg-amber-50 text-amber-600', numero: 'text-amber-600', boton: 'bg-amber-50 text-amber-700' };
    return { borde: 'border-sky-200 hover:border-sky-300', tile: 'bg-sky-50 text-sky-600', numero: 'text-sky-600', boton: 'bg-sky-50 text-sky-700' };
  }
}
