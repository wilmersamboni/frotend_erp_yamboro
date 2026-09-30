import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TuiDay } from '@taiga-ui/cdk';
import { AuditLogAdminService } from '../../../../core/services/admin/audit-log-admin.service';
import { TenantAdminService } from '../../../../core/services/admin/tenant-admin.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';
import { AuditAccion, AuditLog, ACCION_COLORES, ACCION_ETIQUETA } from '../../../../shared/models/admin/audit-log.model';
import { Tenant } from '../../../../shared/models/admin/tenant.model';
import { SearchableSelectComponent, SSOption } from '../../../../shared/components/searchable-select.component';
import { DateInputComponent } from '../../../../shared/components/date-input.component';
import { EsperaDirective } from '../../../../shared/directives/espera.directive';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton.component';

const ACCIONES: AuditAccion[] = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'];

@Component({
  selector: 'app-audit-log-list',
  standalone: true,
  imports: [EsperaDirective, LoadingSkeletonComponent, FormsModule, DatePipe, SearchableSelectComponent, DateInputComponent],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Registro de Auditoría</h1>
      <p class="text-sm text-gray-500 mt-1">Quién hizo qué y cuándo en este panel: altas, cambios y eliminaciones de centros, dominios y usuarios root, e ingresos. No incluye lo que hacen los usuarios dentro de cada centro. Filtra para encontrar un hecho concreto.</p>
    </div>

    <!-- Filtros -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">

        <!-- Tenant -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Centro</label>
          <app-ss [options]="tenantOptions()" placeholder="Todos"
            [ngModel]="filtroTenantId()" (ngModelChange)="filtroTenantId.set($event)"></app-ss>
        </div>

        <!-- Desde -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Desde</label>
          <app-date-input [ngModel]="filtroDesde()" (ngModelChange)="filtroDesde.set($event)"
            placeholder="Seleccionar"></app-date-input>
        </div>

        <!-- Hasta -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Hasta</label>
          <app-date-input [ngModel]="filtroHasta()" (ngModelChange)="filtroHasta.set($event)"
            placeholder="Seleccionar"></app-date-input>
        </div>

        <!-- Acción -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Acción</label>
          <app-ss [options]="accionOptions" placeholder="Todas"
            [ngModel]="filtroAccion()" (ngModelChange)="filtroAccion.set($event)"></app-ss>
        </div>

        <!-- Usuario (filtra sobre lo ya cargado) -->
        <div>
          <label for="aud-usuario" class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Usuario</label>
          <input id="aud-usuario" appEspera type="text" placeholder="Correo o nombre"
            [ngModel]="filtroUsuario()" (ngModelChange)="filtroUsuario.set($event)"
            class="w-full text-sm rounded-xl border border-gray-200 outline-none px-3.5 py-2.5 transition-colors"
            style="background:var(--surface);color:var(--text);" />
        </div>

        <!-- Módulo (opciones según lo cargado) -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Módulo</label>
          <app-ss [options]="moduloOptions()" placeholder="Todos"
            [ngModel]="filtroModulo()" (ngModelChange)="filtroModulo.set($event)"></app-ss>
        </div>

        <!-- Botones -->
        <div class="flex gap-2 lg:col-span-2 lg:justify-end">
          <button type="button" (click)="aplicarFiltros()"
            class="flex-1 text-sm font-semibold text-white px-4 py-2 rounded-xl transition-opacity hover:opacity-90"
            style="background:var(--accent-brand);">Filtrar</button>
          <button type="button" (click)="limpiarFiltros()"
            class="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Limpiar</button>
          <button type="button" (click)="exportarExcel()" [disabled]="!visibles().length || exportando()"
            class="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
            title="Descarga en un archivo de Excel lo que ves en la tabla, con formato">
            {{ exportando() ? 'Preparando…' : 'Exportar a Excel' }}</button>
        </div>
      </div>
    </div>

    <!-- Tabla -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      @if (cargando()) {
        <div class="p-4"><app-loading-skeleton variant="table" [rows]="8" [columns]="5" [showToolbar]="false" label="Cargando registros" /></div>
      } @else if (visibles().length === 0) {
        <div class="flex flex-col items-center justify-center py-16 text-gray-400">
          <p class="text-sm">No hay registros de auditoría para los filtros seleccionados.</p>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-gray-100" style="background:var(--surface2);">
                <th class="px-5 py-3 font-semibold">Fecha</th>
                <th class="px-5 py-3 font-semibold">Centro</th>
                <th class="px-5 py-3 font-semibold">Usuario</th>
                <th class="px-5 py-3 font-semibold">Acción</th>
                <th class="px-5 py-3 font-semibold">Módulo</th>
                <th class="px-5 py-3 font-semibold">Descripción</th>
              </tr>
            </thead>
            <tbody>
              @for (log of visibles(); track log.id) {
                <tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                  <td class="px-5 py-3 text-gray-500 whitespace-nowrap">{{ log.fecha | date: 'medium' }}</td>
                  <td class="px-5 py-3 text-gray-700">{{ log.tenantSlug ?? '—' }}</td>
                  <td class="px-5 py-3 text-gray-700">{{ log.usuario }}</td>
                  <td class="px-5 py-3">
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [class]="accionColores[log.accion]">{{ etiqueta[log.accion] }}</span>
                  </td>
                  <td class="px-5 py-3 text-gray-500">{{ log.modulo }}</td>
                  <td class="px-5 py-3 text-gray-500">{{ log.descripcion ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
          {{ visibles().length }} registro(s) encontrado(s)
          @if (logs().length >= limite) { · se muestran como máximo los {{ limite }} más recientes; afina los filtros para ver otros }
        </div>
      }
    </div>
  `,
})
export class AuditLogListComponent {
  private readonly auditLogService = inject(AuditLogAdminService);
  private readonly tenantService   = inject(TenantAdminService);
  private readonly toast           = inject(AdminToastService);

  readonly acciones      = ACCIONES;
  readonly etiqueta      = ACCION_ETIQUETA;
  readonly limite        = 500;
  readonly accionColores = ACCION_COLORES;
  readonly logs          = signal<AuditLog[]>([]);
  readonly tenants       = signal<Tenant[]>([]);
  readonly cargando      = signal(true);

  readonly filtroTenantId = signal('');
  readonly filtroDesde    = signal<TuiDay | null>(null);
  readonly filtroHasta    = signal<TuiDay | null>(null);
  readonly filtroAccion   = signal<AuditAccion | ''>('');
  readonly filtroUsuario  = signal('');
  readonly filtroModulo   = signal('');

  readonly moduloOptions = computed<SSOption[]>(() => [
    { value: '', label: 'Todos' },
    ...[...new Set(this.logs().map((l) => l.modulo))].sort().map((m) => ({ value: m, label: m })),
  ]);

  /** Lo que se ve: lo cargado del servidor, más los filtros de usuario y módulo (se aplican al instante). */
  readonly visibles = computed(() => {
    const u = this.filtroUsuario().trim().toLowerCase();
    const m = this.filtroModulo();
    return this.logs().filter((l) => (!m || l.modulo === m) && (!u || l.usuario.toLowerCase().includes(u)));
  });

  readonly tenantOptions = computed<SSOption[]>(() => [
    { value: '', label: 'Todos' },
    ...this.tenants().map((t) => ({ value: t.id, label: t.nombre })),
  ]);

  readonly accionOptions: SSOption[] = [
    { value: '', label: 'Todas' },
    ...ACCIONES.map((a) => ({ value: a, label: ACCION_ETIQUETA[a] })),
  ];

  constructor() {
    this.tenantService.obtenerTodos().subscribe({ next: (t) => this.tenants.set(t) });
    this.cargarLogs();
  }

  private tuiDayToISO(day: TuiDay | null): string | undefined {
    if (!day) return undefined;
    const m = String(day.month + 1).padStart(2, '0');
    const d = String(day.day).padStart(2, '0');
    return `${day.year}-${m}-${d}`;
  }

  aplicarFiltros(): void { this.cargarLogs(); }

  limpiarFiltros(): void {
    this.filtroTenantId.set('');
    this.filtroDesde.set(null);
    this.filtroHasta.set(null);
    this.filtroAccion.set('');
    this.filtroUsuario.set('');
    this.filtroModulo.set('');
    this.cargarLogs();
  }

  private cargarLogs(): void {
    this.cargando.set(true);
    this.auditLogService.obtenerLogs({
      tenantId: this.filtroTenantId() || undefined,
      desde:    this.tuiDayToISO(this.filtroDesde()),
      hasta:    this.tuiDayToISO(this.filtroHasta()),
      accion:   this.filtroAccion() || undefined,
      limite:   this.limite,
    }).subscribe({
      next: (logs) => { this.logs.set(logs); this.cargando.set(false); },
      error: (err) => { this.cargando.set(false); this.toast.httpError(err, 'No se pudieron cargar los registros de auditoría.'); },
    });
  }

  readonly exportando = signal(false);

  /**
   * Descarga lo que se ve en la tabla como un libro de Excel con formato: título, filtros
   * aplicados, encabezado de color, filas alternadas, acción coloreada, filtro en cada columna
   * y fila de encabezado fija. ExcelJS se carga solo al exportar, para no pesar en el inicio.
   */
  async exportarExcel(): Promise<void> {
    const filas = this.visibles();
    if (!filas.length || this.exportando()) return;
    this.exportando.set(true);
    try {
      const ExcelJS = await import('exceljs');
      const libro = new ExcelJS.Workbook();
      libro.creator = 'EPSAS · Panel de plataforma';
      libro.created = new Date();
      const hoja = libro.addWorksheet('Auditoría', { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }] });

      const VERDE = 'FF1F6300';
      const GRIS = 'FFF1F5F9';
      const BORDE = { style: 'thin' as const, color: { argb: 'FFE2E8F0' } };
      const COLOR_ACCION: Record<string, { fondo: string; texto: string }> = {
        CREATE: { fondo: 'FFDCFCE7', texto: 'FF166534' },
        UPDATE: { fondo: 'FFDBEAFE', texto: 'FF1E40AF' },
        DELETE: { fondo: 'FFFEE2E2', texto: 'FF991B1B' },
        LOGIN:  { fondo: 'FFF3E8FF', texto: 'FF6B21A8' },
        LOGOUT: { fondo: 'FFF1F5F9', texto: 'FF475569' },
      };

      hoja.columns = [
        { key: 'fecha', width: 20 }, { key: 'centro', width: 22 }, { key: 'usuario', width: 30 },
        { key: 'accion', width: 16 }, { key: 'modulo', width: 16 }, { key: 'descripcion', width: 62 },
      ];

      // Título y contexto
      hoja.mergeCells('A1:F1');
      const titulo = hoja.getCell('A1');
      titulo.value = 'Registro de auditoría — Panel de plataforma';
      titulo.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
      titulo.alignment = { vertical: 'middle', indent: 1 };
      hoja.getRow(1).height = 30;

      const filtros: string[] = [];
      const centro = this.tenants().find((t) => t.id === this.filtroTenantId());
      if (centro) filtros.push(`Centro: ${centro.nombre}`);
      if (this.filtroDesde()) filtros.push(`Desde: ${this.tuiDayToISO(this.filtroDesde())}`);
      if (this.filtroHasta()) filtros.push(`Hasta: ${this.tuiDayToISO(this.filtroHasta())}`);
      if (this.filtroAccion()) filtros.push(`Acción: ${ACCION_ETIQUETA[this.filtroAccion() as AuditAccion]}`);
      if (this.filtroUsuario().trim()) filtros.push(`Usuario: ${this.filtroUsuario().trim()}`);
      if (this.filtroModulo()) filtros.push(`Módulo: ${this.filtroModulo()}`);

      hoja.mergeCells('A2:F2');
      hoja.getCell('A2').value = `Generado el ${new Date().toLocaleString('es-CO')} · ${filas.length} registro(s)`;
      hoja.mergeCells('A3:F3');
      hoja.getCell('A3').value = filtros.length ? `Filtros: ${filtros.join('  ·  ')}` : 'Filtros: ninguno (todos los registros cargados)';
      for (const fila of [2, 3]) {
        hoja.getCell(`A${fila}`).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
        hoja.getCell(`A${fila}`).alignment = { indent: 1 };
      }

      // Encabezado de la tabla (fila 5)
      const encabezado = hoja.getRow(5);
      ['Fecha', 'Centro', 'Usuario', 'Acción', 'Módulo', 'Descripción'].forEach((t, i) => {
        const c = encabezado.getCell(i + 1);
        c.value = t;
        c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
        c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      });
      encabezado.height = 24;

      // Filas
      filas.forEach((l, i) => {
        const fila = hoja.getRow(6 + i);
        fila.values = [new Date(l.fecha), l.tenantSlug ?? '—', l.usuario, ACCION_ETIQUETA[l.accion], l.modulo, l.descripcion ?? '—'];
        fila.height = 20;
        fila.eachCell({ includeEmpty: true }, (c) => {
          c.font = { name: 'Calibri', size: 10.5, color: { argb: 'FF1E293B' } };
          c.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
          c.border = { bottom: BORDE };
          if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
        });
        fila.getCell(1).numFmt = 'dd/mm/yyyy hh:mm';
        const color = COLOR_ACCION[l.accion];
        if (color) {
          const c = fila.getCell(4);
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color.fondo } };
          c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: color.texto } };
          c.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });

      hoja.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + filas.length, column: 6 } };
      hoja.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

      const datos = await libro.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `auditoria-${new Date().toISOString().slice(0, 10)}.xlsx`;
      // El enlace debe estar en la página para que todos los navegadores acepten el clic, y la
      // dirección temporal no se libera al instante: algunos cortan la descarga si se hace.
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      this.toast.success(`Se preparó el Excel con ${filas.length} registro(s). Revisa tu carpeta de descargas.`);
    } catch {
      this.toast.error('No se pudo generar el archivo de Excel.');
    } finally {
      this.exportando.set(false);
    }
  }
}
