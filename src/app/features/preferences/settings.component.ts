import { Component, OnInit, signal, inject, computed, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService, TEMAS, MODOS, ModoTema } from '../../core/services/theme.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { environment } from '../../../environments/environment';

type Tab = 'perfil' | 'password' | 'apariencia' | 'notificaciones' | 'sistema';

interface CategoriaNotificacion {
  id: string;
  label: string;
  descripcion: string;
}

interface MiAcceso {
  idAcceso: string;
  fechaIngreso: string | null;
  fechaSalida: string | null;
  estado: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet],
  template: `
    <div class="settings-wrap">

      <!-- ── Encabezado ─────────────────────────────────────────── -->
      <div class="settings-header">
        <!-- Clic en la foto = verla en grande (si hay); la camarita = cambiarla.
             Antes el clic en la foto siempre abría el selector de archivos,
             así que no había forma de solo mirarla. -->
        <div class="settings-avatar-wrap">
          <button type="button" class="settings-avatar-btn"
                  [title]="fotoUrl() ? 'Ver foto de perfil' : 'Subir foto de perfil'"
                  [disabled]="subiendoFoto()"
                  (click)="fotoUrl() ? verFoto.set(true) : fotoInput.click()">
            @if (fotoUrl()) {
              <img [src]="fotoUrl()" alt="" class="settings-avatar-img" />
            } @else {
              <div class="settings-avatar">{{ iniciales() }}</div>
            }
            <span class="settings-avatar-overlay">
              @if (subiendoFoto()) {
                <div class="spinner" style="width:18px;height:18px;border-width:3px;"></div>
              } @else if (fotoUrl()) {
                <!-- ojo: ver -->
                <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              } @else {
                <ng-container [ngTemplateOutlet]="camaraIcon"></ng-container>
              }
            </span>
          </button>
          <button type="button" class="settings-avatar-cam" title="Cambiar foto de perfil"
                  [disabled]="subiendoFoto()" (click)="fotoInput.click()">
            <ng-container [ngTemplateOutlet]="camaraIcon"></ng-container>
          </button>
        </div>
        <input #fotoInput type="file" accept="image/jpeg,image/png,image/webp" style="display:none" (change)="onFotoSeleccionada($event)" />

        <ng-template #camaraIcon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </ng-template>
        <div>
          <h1 class="settings-name">{{ user()?.nombre ?? 'Usuario' }}</h1>
          <span class="settings-badge" [class]="'badge-' + (user()?.cargo ?? '')">
            {{ user()?.cargo ?? '' }}
          </span>
        </div>
      </div>

      <div class="settings-body">

        <!-- ── Sidebar ─────────────────────────────────────────── -->
        <nav class="settings-nav">
          <button (click)="tab.set('perfil')"     [class.active]="tab() === 'perfil'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Perfil
          </button>

          <button (click)="tab.set('password')"   [class.active]="tab() === 'password'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2
                       0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Contraseña
          </button>

          <button (click)="tab.set('apariencia')" [class.active]="tab() === 'apariencia'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0
                       0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0
                       012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Apariencia
          </button>

          <button (click)="abrirNotificaciones()" [class.active]="tab() === 'notificaciones'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Notificaciones
          </button>

          <button (click)="abrirSistema()" [class.active]="tab() === 'sistema'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65
                       1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65
                       0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65
                       1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6
                       9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0
                       001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51
                       1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0
                       00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Sistema
          </button>
        </nav>

        <!-- ── Panel ───────────────────────────────────────────── -->
        <div class="settings-panel">

          <!-- ════════ PERFIL ════════ -->
          @if (tab() === 'perfil') {
            <div class="panel-section">
              <h2 class="panel-title">Información Personal</h2>
              <p class="panel-sub">Actualiza tus datos de perfil</p>

              @if (cargandoPerfil()) {
                <div class="spinner-wrap"><div class="spinner"></div></div>
              } @else {
                <div class="form-grid">
                  <div class="form-field">
                    <label>Nombre completo</label>
                    <input type="text" [(ngModel)]="perfil.nombre" placeholder="Tu nombre" />
                  </div>
                  <div class="form-field">
                    <label>Correo electrónico</label>
                    <input type="email" [(ngModel)]="perfil.correo" placeholder="correo@ejemplo.com" />
                  </div>
                  <div class="form-field">
                    <label>Teléfono</label>
                    <input type="tel" [ngModel]="perfil.telefono"  
                    (ngModelChange)="cambiarTelefono($event)"
                    placeholder="3001234567" />
                  </div>
                  <div class="form-field">
                    <label>Dirección</label>
                    <input type="text" [(ngModel)]="perfil.direccion" placeholder="Calle 123 # 45-67" />
                  </div>
                  <div class="form-field">
                    <label>Login (usuario)</label>
                    <input type="text" [value]="user()?.login ?? ''" disabled class="disabled" />
                  </div>
                  <div class="form-field">
                    <label>Cargo</label>
                    <input type="text" [value]="user()?.cargo ?? ''" disabled class="disabled" />
                  </div>
                </div>

                <div class="panel-footer">
                  <button class="btn-primary" (click)="guardarPerfil()" [disabled]="saving()">
                    {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
                  </button>
                </div>
              }
            </div>
          }

          <!-- ════════ CONTRASEÑA ════════ -->
          @if (tab() === 'password') {
            <div class="panel-section">
              <h2 class="panel-title">Cambiar Contraseña</h2>
              <p class="panel-sub">Por seguridad, ingresa tu contraseña actual</p>

              <!-- Ícono de ojo abierto/cerrado — antes copiado 3 veces, uno por
                   campo; ahora un solo template reutilizado con ngTemplateOutlet. -->
              <ng-template #eyeIcon let-abierto>
                @if (abierto) {
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                } @else {
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                }
              </ng-template>

              <div class="form-grid" style="max-width:480px">
                <div class="form-field" style="grid-column:1/-1">
                  <label>Contraseña actual</label>
                  <div class="input-eye">
                    <input [type]="showPwd.actual ? 'text' : 'password'"
                      [(ngModel)]="pwd.actual" placeholder="••••••••" />
                    <button type="button" (click)="showPwd.actual = !showPwd.actual" [attr.aria-label]="showPwd.actual ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                      <ng-container [ngTemplateOutlet]="eyeIcon" [ngTemplateOutletContext]="{ $implicit: showPwd.actual }"></ng-container>
                    </button>
                  </div>
                </div>
                <div class="form-field" style="grid-column:1/-1">
                  <label>Nueva contraseña</label>
                  <div class="input-eye">
                    <input [type]="showPwd.nueva ? 'text' : 'password'"
                      [(ngModel)]="pwd.nueva" placeholder="Mín. 8 caracteres" />
                    <button type="button" (click)="showPwd.nueva = !showPwd.nueva" [attr.aria-label]="showPwd.nueva ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                      <ng-container [ngTemplateOutlet]="eyeIcon" [ngTemplateOutletContext]="{ $implicit: showPwd.nueva }"></ng-container>
                    </button>
                  </div>
                </div>
                <div class="form-field" style="grid-column:1/-1">
                  <label>Confirmar nueva contraseña</label>
                  <div class="input-eye">
                    <input [type]="showPwd.confirma ? 'text' : 'password'"
                      [(ngModel)]="pwd.confirma" placeholder="Repite la contraseña"
                      [class.input-err]="pwd.confirma && !passwordsCoinciden()" />
                    <button type="button" (click)="showPwd.confirma = !showPwd.confirma" [attr.aria-label]="showPwd.confirma ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                      <ng-container [ngTemplateOutlet]="eyeIcon" [ngTemplateOutletContext]="{ $implicit: showPwd.confirma }"></ng-container>
                    </button>
                  </div>
                  <!-- Validación en vivo — antes solo se avisaba al hacer clic en "Actualizar". -->
                  @if (pwd.confirma) {
                    @if (passwordsCoinciden()) {
                      <p class="match-ok"><span>✓</span> Las contraseñas coinciden</p>
                    } @else {
                      <p class="match-err"><span>✕</span> Las contraseñas no coinciden</p>
                    }
                  }
                </div>
              </div>

              <!-- Indicador de fortaleza -->
              @if (pwd.nueva) {
                <div class="strength-wrap">
                  <div class="strength-bar">
                    @for (s of [1,2,3,4]; track s) {
                      <div class="strength-seg" [class.filled]="s <= pwdStrength()"></div>
                    }
                  </div>
                  <span class="strength-label" [class]="'s' + pwdStrength()">
                    {{ ['', 'Débil', 'Regular', 'Buena', 'Fuerte'][pwdStrength()] }}
                  </span>
                </div>
              }

              <div class="panel-footer">
                <button class="btn-primary" (click)="cambiarPassword()" [disabled]="saving() || !formPasswordValido()">
                  {{ saving() ? 'Actualizando…' : 'Actualizar contraseña' }}
                </button>
              </div>
            </div>
          }

          <!-- ════════ APARIENCIA ════════ -->
          @if (tab() === 'apariencia') {
            <div class="panel-section">
              <h2 class="panel-title">Apariencia</h2>
              <p class="panel-sub">Personaliza la interfaz a tu gusto</p>

              <!-- Modo claro / oscuro -->
              <div class="pref-row">
                <div>
                  <p class="pref-label">Modo</p>
                  <p class="pref-desc">Automático sigue la configuración de tu sistema operativo</p>
                </div>
                <div class="modo-seg" role="radiogroup" aria-label="Modo de color">
                  @for (m of modos; track m.id) {
                    <button type="button" role="radio" [attr.aria-checked]="modoActual() === m.id"
                            [class.active]="modoActual() === m.id" (click)="setModo(m.id)">
                      {{ m.label }}
                    </button>
                  }
                </div>
              </div>

              <hr class="divider" />

              <!-- Color de acento -->
              <div>
                <p class="pref-label" style="margin-bottom:12px">Color de acento</p>
                <div class="color-grid">
                  @for (t of temas; track t.id) {
                    <button class="color-chip"
                      [style.background]="t.color"
                      [class.selected]="temaActual() === t.id"
                      (click)="setTema(t.id)"
                      [title]="t.label">
                      @if (temaActual() === t.id) {
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                          <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      }
                    </button>
                  }
                </div>
              </div>

              <hr class="divider" />

              <!-- Tamaño de fuente -->
              <div class="pref-row">
                <div>
                  <p class="pref-label">Tamaño de fuente</p>
                  <p class="pref-desc">Ajusta el tamaño del texto en la app</p>
                </div>
                <div class="font-size-btns">
                  <button (click)="setFontSize('small')"  [class.active]="fontSize() === 'small'">A</button>
                  <button (click)="setFontSize('normal')" [class.active]="fontSize() === 'normal'" style="font-size:16px">A</button>
                  <button (click)="setFontSize('large')"  [class.active]="fontSize() === 'large'"  style="font-size:20px">A</button>
                </div>
              </div>

            </div>
          }

          <!-- ════════ NOTIFICACIONES ════════ -->
          @if (tab() === 'notificaciones') {
            <div class="panel-section">
              <h2 class="panel-title">Notificaciones</h2>
              <p class="panel-sub">Elige qué avisos quieres seguir recibiendo dentro de la app</p>

              @if (cargandoNotif()) {
                <div class="spinner-wrap"><div class="spinner"></div></div>
              } @else {
                <div class="notif-list">
                  @for (cat of categoriasNotif(); track cat.id) {
                    <div class="notif-row">
                      <div>
                        <p class="pref-label">{{ cat.label }}</p>
                        <p class="pref-desc">{{ cat.descripcion }}</p>
                      </div>
                      <button type="button" class="switch" role="switch"
                              [attr.aria-checked]="!categoriasApagadas().has(cat.id)"
                              [class.on]="!categoriasApagadas().has(cat.id)"
                              [disabled]="guardandoNotifId() === cat.id"
                              (click)="toggleCategoriaNotif(cat.id)">
                        <span class="switch-thumb"></span>
                      </button>
                    </div>
                  }
                  @if (categoriasNotif().length === 0) {
                    <p class="pref-desc">No hay categorías de notificación configuradas.</p>
                  }
                </div>
              }
            </div>
          }

          <!-- ════════ SISTEMA ════════ -->
          @if (tab() === 'sistema') {
            <div class="panel-section">
              <h2 class="panel-title">Sistema</h2>
              <p class="panel-sub">Información de tu cuenta y sesiones recientes</p>

              <!-- Igual que el encabezado, para que la foto también se vea reflejada acá -->
              <div class="sys-profile">
                @if (fotoUrl()) {
                  <button type="button" class="sys-profile-img-btn" title="Ver foto de perfil" (click)="verFoto.set(true)">
                    <img [src]="fotoUrl()" alt="" class="sys-profile-img" />
                  </button>
                } @else {
                  <div class="sys-profile-avatar">{{ iniciales() }}</div>
                }
                <div>
                  <p class="sys-profile-name">{{ user()?.nombre ?? 'Usuario' }}</p>
                  <p class="sys-profile-sub">{{ user()?.correo || user()?.login || '—' }}</p>
                </div>
              </div>

              <div class="sys-grid">
                <div class="sys-card">
                  <span class="sys-icon">🏫</span>
                  <div>
                    <p class="sys-label">Aplicativo</p>
                    <p class="sys-value">{{ user()?.aplicativoNombre || '—' }}</p>
                  </div>
                </div>
                <div class="sys-card">
                  <span class="sys-icon">🛡️</span>
                  <div>
                    <p class="sys-label">Rol</p>
                    <p class="sys-value">{{ user()?.rolNombre || user()?.cargo || '—' }}</p>
                  </div>
                </div>
                <div class="sys-card">
                  <span class="sys-icon">👤</span>
                  <div>
                    <p class="sys-label">Usuario (login)</p>
                    <p class="sys-value">{{ user()?.login || '—' }}</p>
                  </div>
                </div>
                <div class="sys-card">
                  <span class="sys-icon">🕒</span>
                  <div>
                    <p class="sys-label">Última conexión</p>
                    <p class="sys-value">{{ ultimaConexion() }}</p>
                  </div>
                </div>
              </div>

              <hr class="divider" />

              <p class="pref-label" style="margin-bottom:10px;">Conexiones recientes</p>
              @if (cargandoAccesos()) {
                <div class="spinner-wrap"><div class="spinner"></div></div>
              } @else if (misAccesos().length === 0) {
                <p class="pref-desc">Sin historial de conexiones todavía.</p>
              } @else {
                <div class="accesos-tbl-wrap">
                  <table class="accesos-tbl">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Ingreso</th>
                        <th>Salida</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (a of misAccesos(); track a.idAcceso) {
                        <tr>
                          <td>{{ formatFechaCorta(a.fechaIngreso) }}</td>
                          <td>{{ formatHora(a.fechaIngreso) }}</td>
                          <td>{{ a.fechaSalida ? formatHora(a.fechaSalida) : '—' }}</td>
                          <td>
                            <span class="acceso-pill" [class.activo]="a.estado === 'activo'">
                              <span class="acceso-dot" [class.activo]="a.estado === 'activo'"></span>
                              {{ a.estado === 'activo' ? 'Activa' : 'Cerrada' }}
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          }

        </div>
      </div>

      <!-- ── Visor de la foto de perfil en grande ── -->
      @if (verFoto() && fotoUrl()) {
        <div class="foto-visor" (click)="verFoto.set(false)" role="dialog" aria-modal="true" aria-label="Foto de perfil">
          <div class="foto-visor-card" (click)="$event.stopPropagation()">
            <button type="button" class="foto-visor-cerrar" title="Cerrar" (click)="verFoto.set(false)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <img [src]="fotoUrl()" alt="Foto de perfil" class="foto-visor-img" />
            <p class="foto-visor-nombre">{{ user()?.nombre ?? 'Usuario' }}</p>
            <div class="foto-visor-acciones">
              <button type="button" class="btn-danger foto-visor-quitar" [disabled]="subiendoFoto()" (click)="quitarFoto()">
                Quitar foto
              </button>
              <button type="button" class="btn-secundario" (click)="verFoto.set(false)">Cerrar</button>
              <button type="button" class="btn-primary" [disabled]="subiendoFoto()"
                      (click)="verFoto.set(false); fotoInput.click()">
                Cambiar foto
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  private auth   = inject(AuthService);
  private http   = inject(HttpClient);
  private theme  = inject(ThemeService);
  private apiSvc = inject(ApiService);
  private toast  = inject(ToastService);
  private confirm = inject(ConfirmService);

  tab            = signal<Tab>('perfil');
  saving         = signal(false);
  cargandoPerfil = signal(false);

  readonly user     = this.auth.user;
  readonly esAdmin  = computed(() => this.auth.isAdmin());
  readonly iniciales = computed(() =>
    (this.user()?.nombre ?? 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  );
  cambiarTelefono(valor: string | number | null): void {
  this.perfil.telefono =
    valor === '' || valor === null
      ? null
      : Number(valor);
}

  // Datos de perfil
perfil: {
  nombre: string;
  correo: string;
  telefono: number | null;
  direccion: string;
  fotoPerfil: string | null;
} = {
  nombre: '',
  correo: '',
  telefono: null,
  direccion: '',
  fotoPerfil: null,
};

  // Foto de perfil
  subiendoFoto = signal(false);
  /** Visor en grande — se abre al hacer clic en la foto (cambiarla es el botón de la cámara). */
  verFoto = signal(false);

  @HostListener('document:keydown.escape')
  cerrarVisorConEscape(): void {
    if (this.verFoto()) this.verFoto.set(false);
  }
  /**
   * Sale SIEMPRE del usuario de sesión (una señal): antes leía también
   * `this.perfil.fotoPerfil`, un objeto normal que computed() no escucha,
   * así que la foto cargada desde el servidor nunca redibujaba el avatar y
   * tras volver a iniciar sesión se veían las iniciales. cargarPerfil() y
   * onFotoSeleccionada() mantienen la sesión al día (actualizarUser).
   */
  readonly fotoUrl = computed(() => {
    const ruta = this.user()?.fotoPerfil;
    return ruta ? `${environment.apiUrl}/${ruta}` : null;
  });

  // Cambio de contraseña
  pwd       = { actual: '', nueva: '', confirma: '' };
  showPwd   = { actual: false, nueva: false, confirma: false };

  passwordsCoinciden(): boolean {
    return this.pwd.nueva === this.pwd.confirma;
  }

  formPasswordValido(): boolean {
    return !!this.pwd.actual && this.pwd.nueva.length >= 8 && this.passwordsCoinciden();
  }

  // Fortaleza de contraseña (1-4)
  pwdStrength = computed(() => {
    const p = this.pwd.nueva;
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8)            score++;
    if (/[A-Z]/.test(p))          score++;
    if (/[0-9]/.test(p))          score++;
    if (/[^A-Za-z0-9]/.test(p))   score++;
    return score as 0|1|2|3|4;
  });

  // Apariencia
  temaActual = signal(localStorage.getItem('tema') ?? 'verde');
  fontSize   = signal(localStorage.getItem('fontSize') ?? 'normal');
  modoActual = signal<ModoTema>(this.theme.modo());
  readonly temas = TEMAS;
  readonly modos = MODOS;

  ngOnInit(): void {
    this.cargarPerfil();
    this.theme.apply();   // restaura color y fuente guardados
  }

  // ── Perfil ────────────────────────────────────────────────────────────
  async cargarPerfil(): Promise<void> {
    const personaId = this.user()?.personaId;
    if (!personaId) {
      this.perfil.nombre = this.user()?.nombre ?? '';
      return;
    }
    this.cargandoPerfil.set(true);
    try {
      const data: any = await firstValueFrom(
        this.http.get(`/api/personas/${personaId}`)
      );
      this.perfil = {
        nombre:     data.nombre     ?? '',
        correo:     data.correo     ?? '',
        telefono:   data.telefono != null ? Number(data.telefono) : null,
        direccion:  data.direccion  ?? '',
        fotoPerfil: data.fotoPerfil ?? null,
      };
      // Sincroniza la sesión con la foto real del servidor: corrige de paso
      // el navbar de quien inició sesión antes de que el login trajera la foto.
      if ((this.user()?.fotoPerfil ?? null) !== this.perfil.fotoPerfil) {
        this.auth.actualizarUser({ fotoPerfil: this.perfil.fotoPerfil });
      }
    } catch { this.perfil.nombre = this.user()?.nombre ?? ''; }
    finally { this.cargandoPerfil.set(false); }
  }

  async guardarPerfil(): Promise<void> {
    const personaId = this.user()?.personaId;
    if (!personaId) return;
    this.saving.set(true);
    try {
      // Autoservicio (PATCH /personas/mi-perfil) — nunca /personas/:id: ese
      // endpoint exige `personas.gestionar`, que instructor/aprendiz NUNCA
      // tienen por defecto, así que "Guardar cambios" les daba 403 (bug real,
      // corregido junto con esto). mi-perfil solo acepta estos 4 campos —
      // mismo motivo que antes para no mandar el objeto completo (TOCTOU,
      // auditoría 2026-09-16): el backend mergea parcial.
      await firstValueFrom(
        this.http.patch(`/api/personas/mi-perfil`, {
          nombre:    this.perfil.nombre,
          correo:    this.perfil.correo,
          telefono:  this.perfil.telefono,
          direccion: this.perfil.direccion,
        })
      );
      this.auth.actualizarUser({ nombre: this.perfil.nombre });
      this.toast.ok('Perfil actualizado', 'Los cambios fueron guardados correctamente.');
    } catch (e: any) {
      this.toast.httpError(e, 'Error al guardar el perfil.');
    } finally { this.saving.set(false); }
  }

  /** Quita la foto de perfil: vuelven las iniciales en Ajustes y en el navbar. */
  async quitarFoto(): Promise<void> {
    const ok = await this.confirm.ask('Se volverán a mostrar tus iniciales en lugar de la foto.', {
      header: '¿Quitar foto de perfil?', acceptLabel: 'Quitar foto',
    });
    if (!ok) return;
    this.subiendoFoto.set(true);
    try {
      await firstValueFrom(this.http.delete('/api/personas/mi-perfil/foto'));
      this.perfil.fotoPerfil = null;
      this.auth.actualizarUser({ fotoPerfil: null });
      this.verFoto.set(false);
      this.toast.ok('Foto eliminada', 'Ahora se muestran tus iniciales.');
    } catch (e) {
      this.toast.httpError(e, 'No se pudo quitar la foto.');
    } finally { this.subiendoFoto.set(false); }
  }

  /** Sube/reemplaza la foto de perfil — valida en el cliente lo mismo que ya valida el backend (mimetype/tamaño), para no esperar el 400. */
  async onFotoSeleccionada(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo más tarde
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.toast.warn('Formato no permitido', 'Solo se aceptan imágenes JPG, PNG o WEBP.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      this.toast.warn('Imagen muy grande', 'El tamaño máximo es 3 MB.');
      return;
    }

    this.subiendoFoto.set(true);
    try {
      const form = new FormData();
      form.append('foto', file);
      const resp: any = await firstValueFrom(
        this.http.post('/api/personas/mi-perfil/foto', form)
      );
      this.perfil.fotoPerfil = resp.fotoPerfil ?? null;
      this.auth.actualizarUser({ fotoPerfil: resp.fotoPerfil ?? null });
      this.toast.ok('Foto actualizada', 'Tu foto de perfil se guardó correctamente.');
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo subir la foto.');
    } finally { this.subiendoFoto.set(false); }
  }

  // ── Contraseña ───────────────────────────────────────────────────────
  async cambiarPassword(): Promise<void> {
    if (!this.pwd.actual || !this.pwd.nueva || !this.pwd.confirma) {
      this.toast.warn('Campos requeridos', 'Completa todos los campos.'); return;
    }
    if (this.pwd.nueva !== this.pwd.confirma) {
      this.toast.warn('Contraseñas distintas', 'Las contraseñas nuevas no coinciden.'); return;
    }
    if (this.pwd.nueva.length < 8) {
      this.toast.warn('Contraseña corta', 'La nueva contraseña debe tener al menos 8 caracteres.'); return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.patch('/api/auth/cambiar-password', {
          passwordActual: this.pwd.actual,
          passwordNuevo:  this.pwd.nueva,
        })
      );
      this.toast.ok('Contraseña actualizada', 'Tu contraseña fue cambiada correctamente.');
      this.pwd = { actual: '', nueva: '', confirma: '' };
    } catch (e: any) {
      this.toast.error('Error', e?.error?.message ?? 'La contraseña actual es incorrecta.');
    } finally { this.saving.set(false); }
  }

  // ── Apariencia ───────────────────────────────────────────────────────
  setTema(id: string): void {
    this.temaActual.set(id);
    localStorage.setItem('tema', id);
    this.theme.apply();
  }

  setFontSize(size: string): void {
    this.fontSize.set(size);
    localStorage.setItem('fontSize', size);
    this.theme.apply();
  }

  setModo(modo: ModoTema): void {
    this.modoActual.set(modo);
    localStorage.setItem('modo', modo);
    this.theme.apply();
  }

  // ── Notificaciones ───────────────────────────────────────────────────
  cargandoNotif    = signal(false);
  categoriasNotif  = signal<CategoriaNotificacion[]>([]);
  categoriasApagadas = signal<Set<string>>(new Set());
  /** id de la categoría que se está guardando ahora mismo — deshabilita solo ESE switch, no toda la pestaña. */
  guardandoNotifId = signal<string | null>(null);
  private notifCargadas = false;

  /** Cambia a la pestaña y carga los datos la primera vez que se visita — evita pedirlos si el usuario nunca abre esta pestaña. */
  abrirNotificaciones(): void {
    this.tab.set('notificaciones');
    if (!this.notifCargadas) { this.notifCargadas = true; this.cargarNotificaciones(); }
  }

  private async cargarNotificaciones(): Promise<void> {
    this.cargandoNotif.set(true);
    try {
      const [categorias, prefs] = await Promise.all([
        firstValueFrom(this.http.get<CategoriaNotificacion[]>('/api/notificaciones/categorias')),
        firstValueFrom(this.http.get<{ categoriasDesactivadas: string[] }>('/api/notificaciones/preferencias')),
      ]);
      this.categoriasNotif.set(categorias ?? []);
      this.categoriasApagadas.set(new Set(prefs?.categoriasDesactivadas ?? []));
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudieron cargar tus preferencias de notificaciones.');
    } finally { this.cargandoNotif.set(false); }
  }

  async toggleCategoriaNotif(id: string): Promise<void> {
    const actuales = this.categoriasApagadas();
    const nuevas = new Set(actuales);
    nuevas.has(id) ? nuevas.delete(id) : nuevas.add(id);

    // Optimista: refleja el switch de inmediato y revierte si el guardado falla.
    this.categoriasApagadas.set(nuevas);
    this.guardandoNotifId.set(id);
    try {
      await firstValueFrom(
        this.http.put('/api/notificaciones/preferencias', { categoriasDesactivadas: [...nuevas] })
      );
    } catch (e: any) {
      this.categoriasApagadas.set(actuales);
      this.toast.httpError(e, 'No se pudo guardar el cambio.');
    } finally { this.guardandoNotifId.set(null); }
  }

  // ── Sistema ──────────────────────────────────────────────────────────
  cargandoAccesos = signal(false);
  misAccesos      = signal<MiAcceso[]>([]);
  private sistemaCargado = false;

  readonly ultimaConexion = computed(() => {
    const activa = this.misAccesos().find(a => a.estado === 'activo') ?? this.misAccesos()[0];
    return activa?.fechaIngreso ? this.formatFecha(activa.fechaIngreso) : 'Esta sesión';
  });

  abrirSistema(): void {
    this.tab.set('sistema');
    if (!this.sistemaCargado) { this.sistemaCargado = true; this.cargarAccesos(); }
  }

  private async cargarAccesos(): Promise<void> {
    this.cargandoAccesos.set(true);
    try {
      const accesos = await firstValueFrom(this.http.get<MiAcceso[]>('/api/accesos/mis-accesos'));
      this.misAccesos.set(accesos ?? []);
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo cargar tu historial de conexiones.');
    } finally { this.cargandoAccesos.set(false); }
  }

  formatFecha(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /** "28 sep 2026" — solo la fecha, para la columna "Fecha" de la tabla de conexiones. */
  formatFechaCorta(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /** "2:35 p. m." — solo la hora, para las columnas "Ingreso"/"Salida". */
  formatHora(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
}
