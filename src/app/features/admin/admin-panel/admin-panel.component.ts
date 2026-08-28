import { Component, OnInit, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';

import { CONFIG, MODULOS, MODULOS_EPSAS, MODULOS_PRACTICA, MODULOS_ADMIN, CATEGORIA_ORDEN, CATEGORIA_ICONOS, CATEGORIA_DESCRIPCIONES, Modulo } from '../config/admin.config';
import { AdminService } from '../services/admin.service';
import { ApiService } from '../../../core/services/api.service';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { RegistroRapidoModalComponent } from '../components/registro-rapido-modal.component';
import { AdminInicioComponent } from '../components/admin-inicio.component';
import { CrearPracticaModalComponent } from '../../seguimiento/components/crear-practica-modal.component';
import { PermisosPanelComponent } from '../permisos/permisos-panel.component';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [
    FormsModule,
    LucideAngularModule,
    ToastModule,
    ConfirmDialogModule,
    AdminTableComponent,
    AdminModalComponent,
    RegistroRapidoModalComponent,
    AdminInicioComponent,
    CrearPracticaModalComponent,
    PermisosPanelComponent,
  ],
  providers: [MessageService, ConfirmationService, AdminService],
  template: `
    <p-toast position="top-right" [baseZIndex]="9999" />
    <p-confirmdialog />

    <div class="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50 p-4 lg:p-8">
      <div class="max-w-[1600px] mx-auto space-y-6">

        <!-- ── Header ── -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[#39A900] to-[#2d8500]
                      flex items-center justify-center shadow-lg shadow-[#39A900]/20">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2
                   M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
            </svg>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Panel Administrativo</h1>
            <p class="text-muted text-sm">Gestión de datos académicos y etapas prácticas</p>
          </div>
        </div>

        <!-- ── PANTALLA DE ENTRADA GUIADA (por defecto) ── -->
        @if (auth.isAdmin() && vistaPrincipal() === 'inicio') {
          <app-admin-inicio
            [isAdminErp]="auth.isAdminErp()"
            [vePractica]="auth.perteneceAplicativo('Etapa Práctica')"
            (registrarPersona)="abrirWizard($event)"
            (crear)="crearDirecto($event)"
            (irModulo)="irAvanzado($event)"
            (verTodo)="irAvanzado()"
          />
        }

        <!-- ── GESTIÓN DE TABLAS (modo avanzado) ── -->
        @if (!auth.isAdmin() || vistaPrincipal() === 'avanzado') {
        @if (auth.isAdmin()) {
          <button (click)="vistaPrincipal.set('inicio')"
            class="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Volver al inicio
          </button>
        }
        <div class="bg-white rounded-2xl shadow-xl border border-gray-200/60 overflow-hidden">

          <!-- ── Barra de vista: ERP / Prácticas (solo administrador_erp) ── -->
          @if (auth.isAdminErp()) {
            <div class="px-6 pt-5 pb-4 border-b border-gray-100 bg-gray-50/60">
              <div class="inline-flex items-center bg-white rounded-2xl shadow-sm border border-gray-200 p-1 gap-1">

                <!-- Botón ERP -->
                <button (click)="setVista('epsas')"
                  class="relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200"
                  [class]="vista() === 'epsas'
                    ? 'bg-[#39A900] text-white shadow-md shadow-[#39A900]/25'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round"
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                  ERP
                </button>

                <!-- Botón Prácticas -->
                <button (click)="setVista('practica')"
                  class="relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200"
                  [class]="vista() === 'practica'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round"
                      d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  Prácticas
                </button>

              </div>
            </div>
          }

          <div class="flex flex-col lg:flex-row">

            <!-- ── Sidebar: categorías agrupadas (contraíble manualmente) ── -->
            @if (sidebarColapsado()) {
              <div class="flex lg:flex-col items-center gap-2 border-b lg:border-b-0 lg:border-r
                          border-gray-300/80 bg-gray-100/75 p-2 lg:w-16 lg:flex-shrink-0">
                <button (click)="toggleSidebar()" title="Expandir panel de módulos"
                  class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-700 hover:bg-gray-200 transition-colors">
                  <lucide-icon name="panel-right-close" [size]="20"></lucide-icon>
                </button>
              </div>
            } @else {
            <div class="lg:w-64 lg:flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-300/80 bg-gray-100/75 p-3">
              <div class="flex items-center justify-between mb-2 px-1">
                <span class="text-[11px] font-bold uppercase tracking-wide text-gray-600">Módulos</span>
                <button (click)="toggleSidebar()" title="Contraer panel de módulos"
                  class="w-6 h-6 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-700 hover:bg-gray-200 transition-colors">
                  <lucide-icon name="panel-right-open" [size]="20"></lucide-icon>
                </button>
              </div>
              @for (cat of categoriasVista(); track cat.nombre) {
                <div class="mb-1">
                  <button (click)="toggleCategoria(cat.nombre)"
                    [title]="categoriaDescripciones[cat.nombre]"
                    class="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors">
                    <lucide-icon [name]="cat.icono" [size]="14"></lucide-icon>
                    <span class="flex-1 text-left">{{ cat.nombre }}</span>
                    <lucide-icon [name]="categoriasAbiertas().has(cat.nombre) ? 'chevron-up' : 'chevron-down'" [size]="12"></lucide-icon>
                  </button>
                  @if (categoriasAbiertas().has(cat.nombre)) {
                    <div class="flex flex-col gap-0.5 pl-3 mt-0.5">
                      @for (mod of cat.modulos; track mod) {
                        <button (click)="admin.activeTab.set(mod)"
                          class="text-left px-3 py-1.5 text-sm rounded-lg transition-colors"
                          [class]="admin.activeTab() === mod
                            ? (vista() === 'epsas' ? 'bg-[#39A900]/10 text-[#39A900] font-bold' : 'bg-indigo-50 text-indigo-600 font-bold')
                            : 'text-gray-600 hover:bg-gray-100'">
                          {{ config[mod].label }}
                        </button>
                      }
                    </div>
                  }
                </div>
              }
            </div>
            }

          <div class="p-6 flex-1 min-w-0">

            <!-- Breadcrumb: dónde estoy dentro del panel -->
            <div class="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
              <span>{{ categoriaActual() }}</span>
              <lucide-icon name="chevron-right" [size]="12"></lucide-icon>
              <span class="text-gray-600 font-semibold">{{ config[admin.activeTab()].label }}</span>
            </div>

            <!-- Controles -->
            <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 mb-6">

              <div class="flex flex-col sm:flex-row gap-3 flex-1">
                <!-- Buscador -->
                <div class="relative flex-1 max-w-sm">
                  <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                  </div>
                  <input type="text" [(ngModel)]="admin.filtro"
                    (ngModelChange)="admin.setFiltro($event)"
                    [placeholder]="admin.activeTab() === 'usuarios' ? 'Buscar por nombre o cédula...' : 'Buscar registros...'"
                    class="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900] focus:bg-white transition-all text-gray-900 placeholder:text-gray-400" />
                  @if (admin.filtro()) {
                    <button (click)="admin.setFiltro('')"
                      class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  }
                </div>

                <!-- Filas por página -->
                <div class="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filas</span>
                  <select [ngModel]="admin.registrosPorPagina()"
                    (ngModelChange)="admin.setRegistrosPorPagina($event)"
                    class="text-sm font-semibold bg-transparent border-none focus:ring-0 text-gray-700 cursor-pointer">
                    <option [ngValue]="10">10</option>
                    <option [ngValue]="20">20</option>
                    <option [ngValue]="50">50</option>
                    <option [ngValue]="100">100</option>
                  </select>
                </div>
              </div>

              <!-- Botón Agregar -->
              @if (config[admin.activeTab()].crear) {
                <button (click)="admin.abrirModal()"
                  class="group flex items-center gap-2 px-5 py-2 text-white text-sm font-bold rounded-xl
                         shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  [style]="vista() === 'epsas'
                    ? 'background: linear-gradient(135deg, #39A900 0%, #2d8500 100%)'
                    : 'background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)'">
                  <svg class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
                  </svg>
                  Agregar {{ config[admin.activeTab()].label.slice(0,-1) }}
                </button>
              }
            </div>

            <!-- Tabla -->
            <app-admin-table
              [rows]="admin.activeData()"
              [columns]="admin.activeColumns()"
              [loading]="admin.loading()"
              [canEdit]="!!config[admin.activeTab()].actualizar"
              [canDelete]="!!config[admin.activeTab()].eliminar"
              [columnLabels]="config[admin.activeTab()].columnLabels ?? {}"
              [selectable]="admin.activeTab() === 'roles' || admin.activeTab() === 'usuarios'"
              [selectedRow]="admin.activeTab() === 'roles' ? rolSeleccionado() : usuarioSeleccionado()"
              [idKey]="config[admin.activeTab()].idKey"
              (edit)="admin.editarFila($event)"
              (delete)="admin.eliminarFila($event)"
              (rowSelected)="onRowSelected($event)"
            />

            <!-- Permisos del rol / usuario seleccionado (ver plan "Adaptar la
                 interfaz de permisos de SGM al ERP") -->
            @if (admin.activeTab() === 'roles' && rolSeleccionado()) {
              <app-permisos-panel modo="rol" [rolFila]="rolSeleccionado()" />
            }
            @if (admin.activeTab() === 'usuarios' && usuarioSeleccionado()) {
              <app-permisos-panel modo="usuario" [usuarioFila]="usuarioSeleccionado()" />
            }

            <!-- Paginación -->
            @if (!admin.loading() && admin.totalRegistros() > 0) {
              <div class="flex flex-col sm:flex-row items-center justify-between mt-5 gap-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">

                <span class="text-sm text-gray-500">
                  Mostrando
                  <strong class="text-gray-800">{{ admin.activeData().length }}</strong>
                  de
                  <strong class="text-gray-800">{{ admin.totalRegistros() }}</strong>
                  registros
                </span>

                <div class="flex items-center gap-2">
                  <button (click)="admin.paginaActual.update(p => p - 1)"
                    [disabled]="admin.paginaActual() === 1"
                    class="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-[#39A900] hover:text-white hover:border-[#39A900] disabled:opacity-30 disabled:pointer-events-none transition-all">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                    </svg>
                  </button>

                  <span class="px-4 py-1.5 text-sm font-semibold text-[#39A900]
                               bg-[#39A900]/10 rounded-lg border border-[#39A900]/20">
                    {{ admin.paginaActual() }} / {{ admin.totalPaginas() }}
                  </span>

                  <button (click)="admin.paginaActual.update(p => p + 1)"
                    [disabled]="admin.paginaActual() >= admin.totalPaginas()"
                    class="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-[#39A900] hover:text-white hover:border-[#39A900] disabled:opacity-30 disabled:pointer-events-none transition-all">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>
            }
          </div>
          </div>
        </div>
        }

      </div>
    </div>

    <!-- ── Modal CRUD ──────────────────────────────────────────────────────
         "etapas" usa el mismo formulario rico del módulo de Seguimiento
         (calendario, autocomplete de instructor, carga de archivos, etc.)
         en vez del formulario genérico de campos planos. -->
    @if (admin.activeTab() === 'etapas') {
      <app-crear-practica-modal
        [isOpen]="admin.modalOpen()"
        [practicaId]="admin.editando()?.id ?? null"
        [aprendices]="aprendicesParaEtapa()"
        (closed)="admin.cerrarModal()"
        (success)="onEtapaGuardada()"
      />
    } @else {
      <app-admin-modal
        [open]="admin.modalOpen()"
        [editando]="admin.editando()"
        [labelSingular]="config[admin.activeTab()].label.slice(0,-1)"
        [columns]="admin.editableColumns()"
        [form]="admin.modalForm"
        [opciones]="admin.opcionesModal"
        [tiposCampo]="config[admin.activeTab()].tiposCampo ?? {}"
        [parCoordenadas]="config[admin.activeTab()].parCoordenadas"
        [columnLabels]="config[admin.activeTab()].columnLabels ?? {}"
        [saving]="admin.saving()"
        [error]="admin.modalError()"
        (closed)="admin.cerrarModal()"
        (saved)="onSaved($event)"
      />
    }

    <!-- ── Wizard Registro Rápido ── -->
    <app-registro-rapido-modal
      [isOpen]="wizardOpen()"
      [cargo]="wizardCargo()"
      (closed)="wizardOpen.set(false)"
      (success)="onWizardSuccess()"
    />

    <style>
      div::-webkit-scrollbar { display: none; }
    </style>
  `,
})
export class AdminPanelComponent implements OnInit {
  modulos         = MODULOS;
  modulosEpsas    = MODULOS_EPSAS;
  modulosPractica = MODULOS_PRACTICA;
  config          = CONFIG;

  // ── Vista activa: ERP vs Prácticas ──────────────────────────
  vista = signal<'epsas' | 'practica'>('epsas');

  // Aplicativos "producto" (no el aplicativo propio del tenant) — un admin
  // scoped a uno de estos no gestiona Ambientes, que es un módulo del
  // aplicativo propio del tenant (ver sembrarAplicativosYPermisos en el ERP).
  private static readonly APLICATIVOS_PRODUCTO = ['Horarios', 'Etapa Práctica'];

  modulosVista = computed(() => {
    if (this.auth.isAdminErp()) {
      return this.vista() === 'epsas' ? MODULOS_EPSAS : MODULOS_PRACTICA;
    }
    // Admin no-erp (y, desde que /admin acepta 'servicios' como alternativa
    // a 'roles' en app.routes.ts, también instructor/aprendiz/etc. que
    // entraron por esa puerta): el filtro de aplicativo y el de servicio
    // deben evaluarse JUNTOS (OR), no en dos pasadas separadas — si no, a
    // alguien cuyo aplicativo de cuenta no es 'Etapa Práctica' (ej. un
    // instructor scoped al aplicativo propio del tenant) el filtro de
    // aplicativo lo descartaría ANTES de que el servicio tuviera chance de
    // dejarlo pasar, aunque tenga el permiso real. Mismo tipo de bug que ya
    // se corrigió en el sidebar (sidebar.component.ts, `tieneServicioDelLink`).
    const aplicativo = this.auth.aplicativoNombre();
    return MODULOS_ADMIN.filter(m => {
      const servicio = this.config[m].servicio;
      const tieneServicioDelModulo = !!(servicio && this.auth.tieneServicio(servicio));
      if (m === 'ambientes') {
        return !AdminPanelComponent.APLICATIVOS_PRODUCTO.includes(aplicativo) || tieneServicioDelModulo;
      }
      if (MODULOS_PRACTICA.includes(m)) {
        return (aplicativo === 'Etapa Práctica' || tieneServicioDelModulo) && (!servicio || tieneServicioDelModulo);
      }
      return !servicio || tieneServicioDelModulo;
    });
  });

  setVista(v: 'epsas' | 'practica'): void {
    this.vista.set(v);
    // Activa la primera pestaña del grupo seleccionado
    const grupo = v === 'epsas' ? MODULOS_EPSAS : MODULOS_PRACTICA;
    if (grupo.length) this.admin.activeTab.set(grupo[0]);
  }

  // ── Sidebar: módulos agrupados por categoría ─────────────────
  // Reemplaza la fila horizontal de tabs (que ya necesitaba flechas de
  // scroll con 11+ módulos) por un menú lateral agrupado y colapsable.
  categoriasVista = computed(() => {
    const grupos = new Map<string, Modulo[]>();
    for (const mod of this.modulosVista()) {
      const cat = this.config[mod].categoria ?? 'Otros';
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat)!.push(mod);
    }
    return CATEGORIA_ORDEN
      .filter(nombre => grupos.has(nombre))
      .concat([...grupos.keys()].filter(nombre => !CATEGORIA_ORDEN.includes(nombre)))
      .map(nombre => ({ nombre, icono: CATEGORIA_ICONOS[nombre] ?? 'folder', modulos: grupos.get(nombre)! }));
  });

  /**
   * Solo la categoría del módulo activo empieza abierta — con 6 categorías y
   * ~25 módulos, mostrarlas todas de entrada abrumaba. El resto se expande
   * bajo demanda y se mantiene sincronizado con el módulo activo (ver el
   * effect() en el constructor).
   */
  categoriasAbiertas = signal<Set<string>>(new Set());

  toggleCategoria(nombre: string): void {
    this.categoriasAbiertas.update(set => {
      const next = new Set(set);
      if (next.has(nombre)) next.delete(nombre);
      else next.add(nombre);
      return next;
    });
  }

  /** Categoría a la que pertenece un módulo (para el breadcrumb y el sidebar). */
  categoriaDeModulo(mod: Modulo): string {
    return this.config[mod].categoria ?? 'Otros';
  }

  categoriaDescripciones = CATEGORIA_DESCRIPCIONES;

  /** Breadcrumb: "Categoría › Módulo" del módulo activo, para orientar dentro del panel. */
  categoriaActual = computed(() => this.categoriaDeModulo(this.admin.activeTab()));

  /** Contrae el sidebar de módulos manualmente para darle más espacio a la tabla. */
  sidebarColapsado = signal(false);
  toggleSidebar(): void {
    this.sidebarColapsado.update(v => !v);
  }

  // ── Pantalla de entrada guiada vs. modo avanzado (tablas completas) ──
  vistaPrincipal = signal<'inicio' | 'avanzado'>('inicio');

  /** Cambia a modo avanzado; si se indica un módulo, lo abre directamente. */
  irAvanzado(mod?: Modulo): void {
    this.vistaPrincipal.set('avanzado');
    if (mod) {
      if (this.auth.isAdminErp() && MODULOS_PRACTICA.includes(mod)) this.vista.set('practica');
      this.admin.activeTab.set(mod);
    }
  }

  /**
   * Abre el formulario de creación de un módulo directamente encima de la
   * pantalla de inicio (sin pasar por el modo avanzado) — usado para
   * acciones de "crear un solo registro" como etapas, matrículas, cursos
   * o programas. Para 'etapas' el modal real es CrearPracticaModalComponent
   * (ver el @if en el template), pero el disparador (activeTab + abrirModal)
   * es el mismo para todos los módulos.
   */
  crearDirecto(mod: Modulo): void {
    this.admin.activeTab.set(mod);
    this.admin.abrirModal();
  }

  // ── Wizard ──────────────────────────────────────────────────
  wizardOpen  = signal(false);
  wizardCargo = signal<'instructor' | 'aprendiz' | 'administrador'>('instructor');

  // ── Panel de permisos embebido en Roles / Usuarios ───────────
  // (ver plan "Adaptar la interfaz de permisos de SGM al ERP") — guarda la
  // fila CRUDA (con UUIDs reales) del rol o usuario seleccionado, para que
  // <app-permisos-panel> pueda cruzar rol/persona/servicio sin volver a pedir
  // los datos que AdminService ya tiene en rawData().
  rolSeleccionado     = signal<any>(null);
  usuarioSeleccionado = signal<any>(null);

  onRowSelected(row: any): void {
    const mod = this.admin.activeTab();
    const cfg = this.config[mod];
    const raw = this.admin.rawData()[mod]?.find(r => r[cfg.idKey] === row[cfg.idKey]) ?? row;
    if (mod === 'roles') {
      this.rolSeleccionado.update(actual => (actual?.[cfg.idKey] === raw[cfg.idKey] ? null : raw));
    } else if (mod === 'usuarios') {
      this.usuarioSeleccionado.update(actual => (actual?.[cfg.idKey] === raw[cfg.idKey] ? null : raw));
    }
  }

  constructor(
    public admin: AdminService,
    private msg: MessageService,
    public auth: AuthService,
    private api: ApiService,
  ) {
    // Mantiene siempre visible la categoría del módulo activo, sin forzar
    // abiertas las demás — así el sidebar se siente ordenado en vez de
    // mostrar 25 módulos de una vez.
    effect(() => {
      const cat = this.categoriaDeModulo(this.admin.activeTab());
      this.categoriasAbiertas.update(set => (set.has(cat) ? set : new Set([...set, cat])));
    }, { allowSignalWrites: true });

    // Cambiar de pestaña cierra el panel de permisos si estaba abierto —
    // evita mostrar el panel de un rol/usuario que ya no corresponde a la
    // tabla visible.
    effect(() => {
      this.admin.activeTab();
      this.rolSeleccionado.set(null);
      this.usuarioSeleccionado.set(null);
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    if (!this.auth.isAdminErp()) {
      // administrador: vista plana (personas → prácticas), sin toggle ERP/Prácticas
      // AdminService ya reacciona a este cambio de pestaña y carga 'personas'
      // (y sus dependencias) por su cuenta — ver el effect() en su constructor.
      if (MODULOS_ADMIN.length) this.admin.activeTab.set(MODULOS_ADMIN[0]);
    }
    if (this.auth.perteneceAplicativo('Etapa Práctica')) {
      this.cargarAprendicesParaEtapa();
    }
  }

  // ── Tabla CRUD ───────────────────────────────────────────────
  onSaved(form: Record<string, any>): void {
    this.admin.modalForm = form;
    this.admin.guardar();
  }

  // ── "Etapas" — mismo formulario del módulo de Seguimiento ────
  aprendicesParaEtapa = signal<any[]>([]);

  private async cargarAprendicesParaEtapa(): Promise<void> {
    try {
      this.aprendicesParaEtapa.set(await this.api.listarAprendicesConPractica());
    } catch (e) {
      console.error('[AdminPanel] Error cargando aprendices para etapas:', e);
    }
  }

  onEtapaGuardada(): void {
    this.admin.cerrarModal();
    this.admin.cargar('etapas');
    this.cargarAprendicesParaEtapa();
    this.msg.add({
      severity: 'success',
      summary: 'Guardado',
      detail: 'La etapa práctica fue procesada correctamente.',
      life: 3000,
    });
  }

  // ── Wizard ──────────────────────────────────────────────────
  abrirWizard(cargo: 'instructor' | 'aprendiz' | 'administrador'): void {
    this.wizardCargo.set(cargo);
    this.wizardOpen.set(true);
  }

  onWizardSuccess(): void {
    // Recarga personas, usuarios y credenciales para reflejar el nuevo registro
    this.admin.cargar('personas');
    this.admin.cargar('usuarios');
    this.admin.cargar('credenciales');
    const etiqueta = { instructor: 'instructor', aprendiz: 'aprendiz', administrador: 'administrador' }[this.wizardCargo()];
    this.msg.add({
      severity: 'success',
      summary: '¡Registro creado!',
      detail: `El ${etiqueta} fue registrado correctamente.`,
      life: 4000,
    });
  }
}
