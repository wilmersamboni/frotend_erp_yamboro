import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService, TEMAS } from '../../core/services/theme.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

type Tab = 'perfil' | 'password' | 'apariencia';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="settings-wrap">

      <!-- ── Encabezado ─────────────────────────────────────────── -->
      <div class="settings-header">
        <div class="settings-avatar">{{ iniciales() }}</div>
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
                    <input type="tel" [(ngModel)]="perfil.telefono" placeholder="3001234567" />
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

              <div class="form-grid" style="max-width:480px">
                <div class="form-field" style="grid-column:1/-1">
                  <label>Contraseña actual</label>
                  <div class="input-eye">
                    <input [type]="showPwd.actual ? 'text' : 'password'"
                      [(ngModel)]="pwd.actual" placeholder="••••••••" />
                    <button type="button" (click)="showPwd.actual = !showPwd.actual">
                      {{ showPwd.actual ? '🙈' : '👁️' }}
                    </button>
                  </div>
                </div>
                <div class="form-field" style="grid-column:1/-1">
                  <label>Nueva contraseña</label>
                  <div class="input-eye">
                    <input [type]="showPwd.nueva ? 'text' : 'password'"
                      [(ngModel)]="pwd.nueva" placeholder="Mín. 8 caracteres" />
                    <button type="button" (click)="showPwd.nueva = !showPwd.nueva">
                      {{ showPwd.nueva ? '🙈' : '👁️' }}
                    </button>
                  </div>
                </div>
                <div class="form-field" style="grid-column:1/-1">
                  <label>Confirmar nueva contraseña</label>
                  <div class="input-eye">
                    <input [type]="showPwd.confirma ? 'text' : 'password'"
                      [(ngModel)]="pwd.confirma" placeholder="Repite la contraseña" />
                    <button type="button" (click)="showPwd.confirma = !showPwd.confirma">
                      {{ showPwd.confirma ? '🙈' : '👁️' }}
                    </button>
                  </div>
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
                <button class="btn-primary" (click)="cambiarPassword()" [disabled]="saving()">
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

        </div>
      </div>
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

  tab            = signal<Tab>('perfil');
  saving         = signal(false);
  cargandoPerfil = signal(false);

  readonly user     = this.auth.user;
  readonly esAdmin  = computed(() => this.auth.isAdmin());
  readonly iniciales = computed(() =>
    (this.user()?.nombre ?? 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  );

  // Datos de perfil
  perfil = { nombre: '', correo: '', telefono: '', direccion: '' };

  // Cambio de contraseña
  pwd       = { actual: '', nueva: '', confirma: '' };
  showPwd   = { actual: false, nueva: false, confirma: false };

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
  readonly temas = TEMAS;

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
        nombre:    data.nombre    ?? '',
        correo:    data.correo    ?? '',
        telefono:  String(data.telefono  ?? ''),
        direccion: data.direccion ?? '',
      };
    } catch { this.perfil.nombre = this.user()?.nombre ?? ''; }
    finally { this.cargandoPerfil.set(false); }
  }

  async guardarPerfil(): Promise<void> {
    const personaId = this.user()?.personaId;
    if (!personaId) return;
    this.saving.set(true); //this.perfilMsg.set('');
    try {
      // Cargamos el registro completo para no pisar campos no editables
      const actual: any = await firstValueFrom(
        this.http.get(`/api/personas/${personaId}`)
      );
      await firstValueFrom(
        this.http.put(`/api/personas/${personaId}`, {
          nombre:       this.perfil.nombre,
          correo:       this.perfil.correo,
          telefono:     this.perfil.telefono,
          direccion:    this.perfil.direccion,
          genero:       actual.genero,
          municipioId:  actual.municipioId,
          cargo:        actual.cargo,
          estado:       actual.estado,
        })
      );
      this.auth.actualizarUser({ nombre: this.perfil.nombre });
      this.toast.ok('Perfil actualizado', 'Los cambios fueron guardados correctamente.');
    } catch (e: any) {
      this.toast.httpError(e, 'Error al guardar el perfil.');
    } finally { this.saving.set(false); }
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

  // ── Sistema ──────────────────────────────────────────────────────────
}
