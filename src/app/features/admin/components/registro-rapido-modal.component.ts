import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, signal, inject, computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { AuthService } from '../../../core/services/auth.service';

const BASE  = environment.apiUrl;

interface Step1 {
  nombre:      string;
  apellido:    string;
  cedula:      number | null;
  telefono:    number | null;
  correo:      string;
  genero:      string;
  direccion:   string;
  municipioId: string;
}

interface Step2 {
  login:        string;
  password:     string;
  confirmar:    string;
  aplicativoId: string | null;   // UUID
  rolId:        string | null;   // UUID
}

type Cargo = 'instructor' | 'aprendiz' | 'administrador';

interface Esquema {
  label: string;
  bgIcon: string;
  textIcon: string;
  hex: string;
  borderBox: string;
  bgBox: string;
  textBox: string;
}

const ESQUEMAS: Record<Cargo, Esquema> = {
  instructor: {
    label: 'Instructor', bgIcon: 'bg-blue-100', textIcon: 'text-blue-600', hex: '#3b82f6',
    borderBox: 'border-blue-100', bgBox: 'bg-blue-50', textBox: 'text-blue-700',
  },
  aprendiz: {
    label: 'Aprendiz', bgIcon: 'bg-emerald-100', textIcon: 'text-emerald-600', hex: '#10b981',
    borderBox: 'border-emerald-100', bgBox: 'bg-emerald-50', textBox: 'text-emerald-700',
  },
  administrador: {
    label: 'Administrador', bgIcon: 'bg-purple-100', textIcon: 'text-purple-600', hex: '#9333ea',
    borderBox: 'border-purple-100', bgBox: 'bg-purple-50', textBox: 'text-purple-700',
  },
};

@Component({
  selector: 'app-registro-rapido-modal',
  standalone: true,
  imports: [FormsModule, SearchableSelectComponent],
  template: `
    @if (isOpen) {
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="$event.target === $event.currentTarget && cerrar()">

        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">

          <!-- ── Header ── -->
          <div class="px-6 py-5 border-b border-gray-100 flex-shrink-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <!-- ícono según cargo -->
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  [class]="esquema().bgIcon + ' ' + esquema().textIcon">
                  @if (cargo === 'instructor') {
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.422A12.08 12.08 0 0121 15c0 4.418-4.03 8-9 8s-9-3.582-9-8c0-1.348.29-2.63.84-3.778L12 14z"/>
                    </svg>
                  } @else if (cargo === 'administrador') {
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                  } @else {
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                  }
                </div>
                <div>
                  <h2 class="text-base font-bold text-gray-900">
                    Nuevo {{ esquema().label }}
                  </h2>
                  <p class="text-xs text-gray-400">
                    Paso {{ paso() }} de 2 — {{ paso() === 1 ? 'Datos personales' : 'Acceso al sistema' }}
                  </p>
                </div>
              </div>
              <button (click)="cerrar()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <!-- Barra de progreso -->
            <div class="mt-4 flex gap-1.5">
              <div class="h-1.5 flex-1 rounded-full transition-all duration-300"
                [style.background]="paso() >= 1 ? esquema().hex : '#e5e7eb'"></div>
              <div class="h-1.5 flex-1 rounded-full transition-all duration-300"
                [style.background]="paso() >= 2 ? esquema().hex : '#e5e7eb'"></div>
            </div>
          </div>

          <!-- ── Body ── -->
          <div class="flex-1 overflow-y-auto p-6">

            @if (cargando()) {
              <div class="flex justify-center py-12">
                <div class="w-8 h-8 border-4 border-gray-200 border-t-[#39A900] rounded-full animate-spin"></div>
              </div>
            } @else if (exito()) {
              <!-- Estado de éxito -->
              <div class="flex flex-col items-center py-8 gap-4">
                <div class="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <div class="text-center">
                  <p class="font-bold text-gray-900 text-lg">¡Registro exitoso!</p>
                  <p class="text-sm text-gray-500 mt-1">
                    {{ esquema().label }}
                    <strong class="text-gray-700">{{ s1.nombre }}</strong> fue creado correctamente.
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5">Login: <code class="bg-gray-100 px-1 rounded">{{ s2.login }}</code></p>
                </div>
                <button (click)="cerrar()"
                  class="mt-2 px-6 py-2 rounded-xl text-white text-sm font-semibold"
                  [style.background]="esquema().hex">
                  Cerrar
                </button>
              </div>

            } @else if (paso() === 1) {
              <!-- ── PASO 1: Datos Personales ── -->
              <div class="space-y-3">

                <!-- Nombre -->
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Nombre completo *</label>
                  <input type="text" [(ngModel)]="s1.nombre" name="nombre" placeholder="Ej: Juan Pérez"
                    class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
                    [class]="errorCampo('nombre') ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-[#39A900]/20 focus:border-[#39A900]'" />
                  @if (errorCampo('nombre')) {
                    <p class="text-red-500 text-xs mt-0.5">El nombre es obligatorio</p>
                  }
                </div>

                <!-- Apellido -->
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Apellido</label>
                  <input type="text" [(ngModel)]="s1.apellido" name="apellido" placeholder="Ej: Pérez Gómez"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" />
                </div>

                <!-- Cédula + Teléfono -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1">Cédula</label>
                    <input type="number" [(ngModel)]="s1.cedula" name="cedula" placeholder="1234567890"
                      class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1">Teléfono</label>
                    <input type="number" [(ngModel)]="s1.telefono" name="telefono" placeholder="3001234567"
                      class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" />
                  </div>
                </div>

                <!-- Correo -->
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Correo electrónico</label>
                  <input type="email" [(ngModel)]="s1.correo" name="correo" placeholder="ejemplo@sena.edu.co"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" />
                </div>

                <!-- Género + Municipio -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1">Género</label>
                    <app-ss [options]="generoOptions" [(ngModel)]="s1.genero" name="genero"></app-ss>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1">Municipio</label>
                    <div class="relative">
                      <input type="text" [(ngModel)]="municipioTexto" name="municipioTexto"
                        (input)="filtrarMunicipios($any($event.target).value)"
                        (focus)="mostrarMunicipios = true"
                        (blur)="ocultarConDelay()"
                        placeholder="Buscar municipio…"
                        autocomplete="off"
                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" />
                      @if (mostrarMunicipios && municipiosFiltrados().length) {
                        <div class="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-36 overflow-y-auto mt-1">
                          @for (m of municipiosFiltrados(); track m.idMunicipio) {
                            <button type="button" (mousedown)="seleccionarMunicipio(m)"
                              class="w-full text-left px-3 py-1.5 text-xs hover:bg-[#39A900]/10 hover:text-[#39A900] transition-colors">
                              {{ m.nombre }}
                            </button>
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>

                <!-- Dirección -->
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Dirección</label>
                  <input type="text" [(ngModel)]="s1.direccion" name="direccion" placeholder="Calle 1 # 2-3"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" />
                </div>

                <!-- Cargo (readonly, informativo) -->
                <div class="flex items-center gap-2 p-3 rounded-xl border"
                  [class]="esquema().borderBox + ' ' + esquema().bgBox">
                  <svg class="w-4 h-4 flex-shrink-0"
                    [class]="esquema().textBox"
                    fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <p class="text-xs"
                    [class]="esquema().textBox">
                    El cargo se asignará automáticamente como
                    <strong>{{ cargo }}</strong>.
                  </p>
                </div>
              </div>

            } @else {
              <!-- ── PASO 2: Acceso al sistema ── -->
              <div class="space-y-3">

                <!-- Login -->
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Nombre de usuario (login) *</label>
                  <input type="text" [(ngModel)]="s2.login" name="login" placeholder="Ej: jperez"
                    class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
                    [class]="errorCampo('login') ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-[#39A900]/20 focus:border-[#39A900]'" />
                  @if (errorCampo('login')) {
                    <p class="text-red-500 text-xs mt-0.5">El login es obligatorio</p>
                  }
                </div>

                <!-- Password + Confirmar -->
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Contraseña *</label>
                  <input type="password" [(ngModel)]="s2.password" name="password" placeholder="Mínimo 5 caracteres"
                    class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
                    [class]="errorCampo('password') ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-[#39A900]/20 focus:border-[#39A900]'" />
                  @if (errorCampo('password')) {
                    <p class="text-red-500 text-xs mt-0.5">La contraseña debe tener al menos 5 caracteres</p>
                  }
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Confirmar contraseña *</label>
                  <input type="password" [(ngModel)]="s2.confirmar" name="confirmar" placeholder="Repite la contraseña"
                    class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
                    [class]="errorCampo('confirmar') ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-[#39A900]/20 focus:border-[#39A900]'" />
                  @if (errorCampo('confirmar')) {
                    <p class="text-red-500 text-xs mt-0.5">Las contraseñas no coinciden</p>
                  }
                </div>

                @if (necesitaSeleccionManual()) {
                  <!-- Aplicativo -->
                  <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1">Aplicativo *</label>
                    <app-ss [options]="aplicativoOptions()" placeholder="— Selecciona aplicativo —"
                      [(ngModel)]="s2.aplicativoId" name="aplicativoId"
                      (ngModelChange)="s2.rolId = null"></app-ss>
                    @if (errorCampo('aplicativoId')) {
                      <p class="text-red-500 text-xs mt-0.5">Selecciona un aplicativo</p>
                    }
                  </div>

                  <!-- Rol -->
                  <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1">Rol *</label>
                    <app-ss [options]="rolOptions()" placeholder="— Selecciona rol —"
                      [(ngModel)]="s2.rolId" name="rolId"></app-ss>
                    @if (errorCampo('rolId')) {
                      <p class="text-red-500 text-xs mt-0.5">Selecciona un rol</p>
                    }
                  </div>
                } @else {
                  <!-- Instructor/aprendiz: el acceso ya viene resuelto por el rol
                       estándar sembrado en el aplicativo propio del tenant — no
                       hace falta preguntar, solo se informa qué quedó asignado. -->
                  <div class="flex items-center gap-2 p-3 rounded-xl border"
                    [class]="esquema().borderBox + ' ' + esquema().bgBox">
                    <svg class="w-4 h-4 flex-shrink-0" [class]="esquema().textBox"
                      fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                    <p class="text-xs" [class]="esquema().textBox">
                      Se le dará acceso automático a
                      <strong>{{ aplicativoAutoNombre() }}</strong>
                      con el rol <strong>{{ cargo }}</strong>.
                    </p>
                  </div>
                }

                <!-- Resumen persona -->
                <div class="p-3 rounded-xl bg-gray-50 border border-gray-100 mt-2">
                  <p class="text-xs font-semibold text-gray-500 mb-1.5">Resumen de datos personales</p>
                  <p class="text-xs text-gray-700"><strong>Nombre:</strong> {{ s1.nombre }}</p>
                  @if (s1.apellido) { <p class="text-xs text-gray-700"><strong>Apellido:</strong> {{ s1.apellido }}</p> }
                  @if (s1.cedula) { <p class="text-xs text-gray-700"><strong>Cédula:</strong> {{ s1.cedula }}</p> }
                  @if (s1.correo) { <p class="text-xs text-gray-700"><strong>Correo:</strong> {{ s1.correo }}</p> }
                  <p class="text-xs text-gray-700"><strong>Cargo:</strong> {{ cargo }}</p>
                </div>
              </div>
            }

            <!-- Error global -->
            @if (error() && !exito()) {
              <div class="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p class="text-red-600 text-xs">{{ error() }}</p>
              </div>
            }
          </div>

          <!-- ── Footer ── -->
          @if (!exito() && !cargando()) {
            <div class="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex justify-between gap-3">

              @if (paso() === 1) {
                <button (click)="cerrar()"
                  class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Cancelar
                </button>
                <button (click)="irPaso2()"
                  class="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold transition-all"
                  [style.background]="esquema().hex">
                  Siguiente
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              } @else {
                <button (click)="paso.set(1)"
                  class="flex items-center gap-1 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M15 19l-7-7 7-7"/>
                  </svg>
                  Atrás
                </button>
                <button (click)="guardar()" [disabled]="guardando()"
                  class="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60"
                  [style.background]="esquema().hex">
                  @if (guardando()) {
                    <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                    Creando…
                  } @else {
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7"/>
                    </svg>
                    Crear {{ esquema().label.toLowerCase() }}
                  }
                </button>
              }
            </div>
          }

        </div>
      </div>
    }
  `,
})
export class RegistroRapidoModalComponent implements OnChanges {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  @Input() isOpen = false;
  @Input() cargo: Cargo = 'instructor';
  @Output() closed  = new EventEmitter<void>();
  @Output() success = new EventEmitter<void>();

  // Método (no computed): lee `cargo`, un @Input() plano, no un signal — un
  // computed() lo cachearía desde la primera apertura y nunca reaccionaría a
  // que el wizard se reabra con un cargo distinto (la instancia se reusa).
  esquema(): Esquema {
    return ESQUEMAS[this.cargo];
  }

  // ── Estado ────────────────────────────────────────────────────
  paso     = signal(1);
  cargando = signal(false);
  guardando= signal(false);
  error    = signal('');
  exito    = signal(false);
  camposConError = signal<string[]>([]);

  // ── Formulario paso 1 ─────────────────────────────────────────
  s1: Step1 = this.emptyS1();
  s2: Step2 = this.emptyS2();

  // ── Catálogos ──────────────────────────────────────────────────
  municipios  = signal<any[]>([]);
  aplicativos = signal<any[]>([]);
  roles       = signal<any[]>([]);

  generoOptions: SSOption[] = [
    { value: 'masculino', label: 'Masculino' },
    { value: 'femenino',  label: 'Femenino' },
  ];
  aplicativoOptions = computed<SSOption[]>(() =>
    this.aplicativos().map(a => ({ value: a.idAplicativo, label: a.nombre }))
  );
  // Método (no computed): filtra por s2.aplicativoId, un campo plano de un
  // formulario mutable — un computed() no reaccionaría a sus cambios porque
  // no es un signal, quedaría con el valor de la primera evaluación.
  rolOptions(): SSOption[] {
    return this.roles()
      .filter(r => !this.s2.aplicativoId || r.aplicativoId === this.s2.aplicativoId)
      .map(r => ({ value: r.idRol, label: r.nombre }));
  }

  /**
   * Instructor y aprendiz usan siempre el rol estándar (mismo nombre que el
   * cargo) del aplicativo propio del tenant — ya viene con los permisos
   * correctos sembrados de fábrica (ver SERVICIOS_POR_ROL en
   * tenant-admin.service.ts), así que no hay nada que elegir. Administrador
   * sí puede variar a cuál aplicativo administra, y se deja manual. Si por
   * algún motivo la auto-resolución no encontró rol (tenant mal sembrado,
   * admin_erp fuera de su aplicativo propio), se cae de vuelta al selector
   * manual en vez de bloquear el registro con un campo requerido invisible.
   */
  necesitaSeleccionManual(): boolean {
    if (this.cargo === 'administrador' || this.auth.isAdminErp()) return true;
    return !this.s2.rolId;
  }

  aplicativoAutoNombre(): string {
    return this.aplicativos().find(a => a.idAplicativo === this.s2.aplicativoId)?.nombre ?? '—';
  }

  // ── Autocomplete municipio ─────────────────────────────────────
  municipioTexto   = '';
  mostrarMunicipios = false;
  municipiosFiltrados = signal<any[]>([]);

  // ─────────────────────────────────────────────────────────────
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) {
      this.reset();
      this.cargarCatalogos();
    }
  }

  private emptyS1(): Step1 {
    return { nombre: '', apellido: '', cedula: null, telefono: null, correo: '', genero: '', direccion: '', municipioId: '' };
  }
  private emptyS2(): Step2 {
    return { login: '', password: '', confirmar: '', aplicativoId: null, rolId: null };
  }

  private reset(): void {
    this.paso.set(1);
    this.error.set('');
    this.exito.set(false);
    this.camposConError.set([]);
    this.s1 = this.emptyS1();
    this.s2 = this.emptyS2();
    this.municipioTexto = '';
    this.mostrarMunicipios = false;
  }

  // ── Catálogos ──────────────────────────────────────────────────
  async cargarCatalogos(): Promise<void> {
    this.cargando.set(true);
    try {
      const [muns, apps, rols] = await Promise.all([
        firstValueFrom(this.http.get<any[]>(`${BASE}/municipios`)),
        firstValueFrom(this.http.get<any[]>(`${BASE}/aplicativos`)),
        firstValueFrom(this.http.get<any[]>(`${BASE}/roles`)),
      ]);
      const toArr = (r: any) => Array.isArray(r) ? r : r?.data ?? [];
      this.municipios.set(toArr(muns));
      this.aplicativos.set(toArr(apps));
      this.roles.set(toArr(rols));
      this.municipiosFiltrados.set(this.municipios());
      this.autoResolverAccesoSiAplica();
    } catch {
      this.error.set('Error cargando catálogos. Verifica la conexión con el servidor.');
    } finally {
      this.cargando.set(false);
    }
  }

  /**
   * Para instructor/aprendiz: preselecciona el aplicativo propio del admin
   * actual y el rol que coincide en nombre con el cargo dentro de ese
   * aplicativo. No pisa nada si el cargo es administrador (ese sí elige
   * manual) — necesitaSeleccionManual() decide si esto se usa o no.
   */
  private autoResolverAccesoSiAplica(): void {
    if (this.cargo === 'administrador') return;

    const aplicativoId = this.auth.aplicativoId();
    if (!aplicativoId) return;

    const rol = this.roles().find(r => r.aplicativoId === aplicativoId && r.nombre === this.cargo);
    if (!rol) return; // sin match: necesitaSeleccionManual() cae al selector manual

    this.s2.aplicativoId = aplicativoId;
    this.s2.rolId = rol.idRol;
  }

  // ── Autocomplete municipio ─────────────────────────────────────
  filtrarMunicipios(texto: string): void {
    this.municipioTexto = texto;
    if (!texto.trim()) {
      this.s1.municipioId = '';
      this.municipiosFiltrados.set(this.municipios());
      return;
    }
    const q = texto.toLowerCase();
    this.municipiosFiltrados.set(
      this.municipios().filter(m => (m.nombre ?? '').toLowerCase().includes(q)).slice(0, 20)
    );
    this.mostrarMunicipios = true;
  }

  seleccionarMunicipio(m: any): void {
    this.s1.municipioId  = String(m.idMunicipio ?? m.id ?? '');
    this.municipioTexto  = m.nombre ?? '';
    this.mostrarMunicipios = false;
  }

  ocultarConDelay(): void {
    setTimeout(() => { this.mostrarMunicipios = false; }, 200);
  }

  // ── Validación ────────────────────────────────────────────────
  errorCampo(campo: string): boolean {
    return this.camposConError().includes(campo);
  }

  private validarPaso1(): boolean {
    const errs: string[] = [];
    if (!this.s1.nombre.trim()) errs.push('nombre');
    this.camposConError.set(errs);
    return errs.length === 0;
  }

  private validarPaso2(): boolean {
    const errs: string[] = [];
    if (!this.s2.login.trim())            errs.push('login');
    if (this.s2.password.length < 5)      errs.push('password');
    if (this.s2.password !== this.s2.confirmar) errs.push('confirmar');
    if (!this.s2.aplicativoId)            errs.push('aplicativoId');
    if (!this.s2.rolId)                   errs.push('rolId');
    this.camposConError.set(errs);
    return errs.length === 0;
  }

  // ── Navegación ────────────────────────────────────────────────
  irPaso2(): void {
    if (!this.validarPaso1()) return;
    this.error.set('');
    this.paso.set(2);
  }

  cerrar(): void {
    this.closed.emit();
  }

  // ── Guardar ──────────────────────────────────────────────────
  async guardar(): Promise<void> {
    if (!this.validarPaso2()) return;

    this.guardando.set(true);
    this.error.set('');

    try {
      // 1. Crear persona
      const personaBody: any = {
        nombre:  this.s1.nombre.trim(),
        cargo:   this.cargo,
        estado:  'activo',
      };
      if (this.s1.apellido)     personaBody.apellido    = this.s1.apellido.trim();
      if (this.s1.cedula)       personaBody.cedula      = Number(this.s1.cedula);
      if (this.s1.telefono)     personaBody.telefono    = Number(this.s1.telefono);
      if (this.s1.correo)       personaBody.correo      = this.s1.correo.trim();
      if (this.s1.genero)       personaBody.genero      = this.s1.genero;
      if (this.s1.direccion)    personaBody.direccion   = this.s1.direccion.trim();
      if (this.s1.municipioId)  personaBody.municipioId = this.s1.municipioId;

      const personaResp: any = await firstValueFrom(
        this.http.post(`${BASE}/personas`, personaBody)
      );

      // Extraer el UUID del idPersona — la respuesta puede tener distintas formas
      const raw       = Array.isArray(personaResp) ? personaResp[0] : personaResp;
      const dataObj   = raw?.data ?? raw;
      const idPersona = String(
        dataObj?.idPersona ?? dataObj?.id_persona ?? dataObj?.id ?? ''
      ).trim();

      if (!idPersona) throw new Error('El servidor no devolvió el ID de la persona creada.');

      // 2. Crear usuario + credencial (auth/register)
      // Los IDs son UUIDs (strings) — NO convertir a Number
      await firstValueFrom(
        this.http.post(`${BASE}/auth/register`, {
          login:        this.s2.login.trim(),
          password:     this.s2.password,
          personaId:    idPersona,                         // UUID string
          aplicativoId: String(this.s2.aplicativoId),     // UUID string
          rolId:        String(this.s2.rolId),             // UUID string
        })
      );

      this.exito.set(true);
      this.success.emit();

    } catch (e: any) {
      const msg = e?.error?.message ?? e?.error?.mensaje ?? e?.error?.error ?? e?.message ?? '';
      this.error.set(
        Array.isArray(msg) ? msg.join(' · ') :
        typeof msg === 'string' && msg ? msg :
        'Ocurrió un error al crear el registro. Verifica los datos e inténtalo de nuevo.'
      );
    } finally {
      this.guardando.set(false);
    }
  }
}
