import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TenantAdminService } from '../../core/services/admin/tenant-admin.service';
import { DominioAdminService } from '../../core/services/admin/dominio-admin.service';
import { RootUserAdminService } from '../../core/services/admin/root-user-admin.service';
import { DialogDirective } from '../../shared/directives/dialog.directive';

interface Resultado {
  grupo: 'Ir a' | 'Centros' | 'Dominios' | 'Usuarios root';
  titulo: string;
  detalle?: string;
  ruta: string;
}

const PAGINAS: Resultado[] = [
  { grupo: 'Ir a', titulo: 'Resumen general', ruta: '/dashboard' },
  { grupo: 'Ir a', titulo: 'Centros de Formación', ruta: '/tenants' },
  { grupo: 'Ir a', titulo: 'Nuevo centro', ruta: '/tenants?nuevo=1' },
  { grupo: 'Ir a', titulo: 'Usuarios Root', ruta: '/root-users' },
  { grupo: 'Ir a', titulo: 'Dominios', ruta: '/dominios' },
  { grupo: 'Ir a', titulo: 'Auditoría Global', ruta: '/audit-log' },
  { grupo: 'Ir a', titulo: 'Configuración', ruta: '/settings' },
];

const ORDEN = ['Ir a', 'Centros', 'Dominios', 'Usuarios root'];

/**
 * Buscador global del panel (Ctrl+K, o el botón de la barra superior). Salta a una
 * pantalla, a un centro, a un dominio o a un usuario root. Usa los mismos servicios
 * que las listas y carga los datos al abrirse, sin pedirle nada nuevo al servidor.
 */
@Component({
  selector: 'app-admin-buscador',
  standalone: true,
  imports: [DialogDirective],
  template: `
    <button type="button" (click)="abrir()" aria-label="Buscar en el panel (Ctrl K)" title="Buscar (Ctrl K)"
      class="hidden sm:flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl border border-gray-200 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
      style="background:var(--surface2);">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="M21 21l-4.35-4.35" />
      </svg>
      <span>Buscar…</span>
      <kbd class="text-xs font-semibold px-1.5 py-0.5 rounded-md border border-gray-200 bg-white text-gray-500">Ctrl K</kbd>
    </button>
    <button type="button" (click)="abrir()" aria-label="Buscar en el panel"
      class="sm:hidden w-9 h-9 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="M21 21l-4.35-4.35" />
      </svg>
    </button>

    @if (visible()) {
      <div appDialog [dialogGuard]="false" (click)="cerrar()"
           class="fixed inset-0 z-[1100] flex items-start justify-center px-4 pt-[12vh] bg-black/50 backdrop-blur-[1px]">
        <div class="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden" (click)="$event.stopPropagation()">
          <h2 class="sr-only">Buscar en el panel</h2>
          <div class="flex items-center gap-3 px-4 border-b border-gray-100">
            <svg class="w-5 h-5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input #entrada type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true"
              aria-label="Buscar centros, dominios, usuarios o pantallas" placeholder="Buscar centros, dominios, usuarios o pantallas…"
              [value]="texto()" (input)="texto.set($any($event.target).value); activo.set(0)"
              (keydown.arrowdown)="mover(1, $event)" (keydown.arrowup)="mover(-1, $event)" (keydown.enter)="elegirActivo($event)"
              class="flex-1 py-4 text-sm outline-none bg-transparent" style="color:var(--text);" />
            <kbd class="text-xs font-semibold px-1.5 py-0.5 rounded-md border border-gray-200 text-gray-400">Esc</kbd>
          </div>

          <div class="max-h-[50vh] overflow-y-auto py-2" role="listbox">
            @if (cargando() && !resultados().length) {
              <p class="px-4 py-6 text-center text-sm text-gray-400">Cargando…</p>
            } @else if (!resultados().length) {
              <p class="px-4 py-8 text-center text-sm text-gray-500">Sin resultados para "{{ texto() }}".</p>
            } @else {
              @for (r of resultados(); track r.ruta + r.titulo; let i = $index) {
                @if (i === 0 || resultados()[i - 1].grupo !== r.grupo) {
                  <p class="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-gray-400">{{ r.grupo }}</p>
                }
                <button type="button" role="option" [attr.aria-selected]="i === activo()" (click)="ir(r)" (mouseenter)="activo.set(i)"
                  class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                  [style.background]="i === activo() ? 'var(--accent-soft)' : ''"
                  [style.color]="i === activo() ? 'var(--accent-text)' : 'var(--text)'">
                  <span class="font-medium truncate">{{ r.titulo }}</span>
                  @if (r.detalle) { <span class="text-xs text-gray-400 truncate">{{ r.detalle }}</span> }
                </button>
              }
            }
          </div>

          <div class="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-xs text-gray-400">
            <span><kbd class="font-semibold">↑↓</kbd> moverse</span>
            <span><kbd class="font-semibold">Enter</kbd> abrir</span>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminBuscadorComponent {
  private readonly router = inject(Router);
  private readonly tenants = inject(TenantAdminService);
  private readonly dominios = inject(DominioAdminService);
  private readonly rootUsers = inject(RootUserAdminService);
  private readonly entrada = viewChild<ElementRef<HTMLInputElement>>('entrada');

  readonly visible = signal(false);
  readonly cargando = signal(false);
  readonly texto = signal('');
  readonly activo = signal(0);
  private readonly datos = signal<Resultado[]>([]);

  readonly resultados = computed(() => {
    const t = this.texto().trim().toLowerCase();
    const todos = [...PAGINAS, ...this.datos()];
    const filtrados = t
      ? todos.filter(r => `${r.titulo} ${r.detalle ?? ''}`.toLowerCase().includes(t))
      : [...PAGINAS, ...this.datos().slice(0, 6)];
    return filtrados
      .sort((a, b) => ORDEN.indexOf(a.grupo) - ORDEN.indexOf(b.grupo))
      .slice(0, 30);
  });

  @HostListener('document:keydown', ['$event'])
  onTecla(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.visible() ? this.cerrar() : this.abrir();
    }
  }

  abrir(): void {
    this.texto.set('');
    this.activo.set(0);
    this.visible.set(true);
    this.cargar();
    // El foco inicial lo pone la directiva; el campo se enfoca en cuanto se dibuja.
    setTimeout(() => this.entrada()?.nativeElement.focus());
  }

  cerrar(): void { this.visible.set(false); }

  mover(paso: number, e: Event): void {
    e.preventDefault();
    const n = this.resultados().length;
    if (n) this.activo.set((this.activo() + paso + n) % n);
  }

  elegirActivo(e: Event): void {
    e.preventDefault();
    const r = this.resultados()[this.activo()];
    if (r) this.ir(r);
  }

  ir(r: Resultado): void {
    this.cerrar();
    void this.router.navigateByUrl(r.ruta);
  }

  private cargar(): void {
    this.cargando.set(true);
    const acumulado: Resultado[] = [];
    const nombres = new Map<string, string>();
    let pendientes = 3;
    const fin = () => {
      if (--pendientes === 0) {
        // Los dominios solo traen el id del centro: el nombre se pone cuando ya llegó la lista de centros.
        for (const r of acumulado) if (r.grupo === 'Dominios' && r.detalle) r.detalle = nombres.get(r.detalle) ?? 'Centro no encontrado';
        this.datos.set(acumulado); this.cargando.set(false); }
    };
    this.tenants.obtenerTodos().subscribe({
      next: (l) => { l.forEach(t => nombres.set(t.id, t.nombre)); acumulado.push(...l.map(t => ({ grupo: 'Centros' as const, titulo: t.nombre, detalle: t.slug, ruta: `/tenants/${t.id}` }))); fin(); },
      error: fin,
    });
    this.dominios.obtenerTodos().subscribe({
      next: (l) => { acumulado.push(...l.map(d => ({ grupo: 'Dominios' as const, titulo: d.subdominio, detalle: d.tenantId, ruta: `/dominios/${d.id}/editar` }))); fin(); },
      error: fin,
    });
    this.rootUsers.obtenerTodos().subscribe({
      next: (l) => { acumulado.push(...l.map(u => ({ grupo: 'Usuarios root' as const, titulo: u.nombre, detalle: u.correo, ruta: `/root-users/${u.id}/editar` }))); fin(); },
      error: fin,
    });
  }
}
