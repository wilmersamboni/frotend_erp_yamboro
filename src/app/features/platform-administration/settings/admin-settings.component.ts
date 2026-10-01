import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminAuthService } from '../../../core/admin-auth/admin-auth.service';
import { AdminToastService } from '../../../core/admin-auth/admin-toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { CorreoAdminService, ConfiguracionCorreo } from '../../../core/services/admin/correo-admin.service';
import { DatePipe } from '@angular/common';
import { ThemeService, TEMAS, MODOS, ModoTema } from '../../../core/services/theme.service';
import { avisarCambiosSinGuardar } from '../../../core/services/unsaved-changes.service';

type Tab = 'perfil' | 'password' | 'apariencia' | 'correo' | 'sistema';

/**
 * Configuración del panel de plataforma. Misma estructura y mismos estilos que
 * Ajustes de la app (`SettingsComponent`): encabezado con avatar, menú de
 * secciones a la izquierda y panel a la derecha.
 */
@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [FormsModule, DatePipe],
  styleUrl: '../../preferences/settings.component.css',
  template: `
    <div class="settings-wrap">

      <div class="settings-header">
        <div class="settings-avatar">{{ iniciales() }}</div>
        <div>
          <h1 class="settings-name">{{ nombre() }}</h1>
          <span class="settings-badge badge-administrador">Administrador root</span>
        </div>
      </div>

      <div class="settings-body">

        <nav class="settings-nav" aria-label="Secciones de configuración">
          <button type="button" (click)="tab.set('perfil')" [class.active]="tab() === 'perfil'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Perfil
          </button>
          <button type="button" (click)="tab.set('password')" [class.active]="tab() === 'password'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Contraseña
          </button>
          <button type="button" (click)="tab.set('apariencia')" [class.active]="tab() === 'apariencia'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Apariencia
          </button>
          <button type="button" (click)="abrirCorreo()" [class.active]="tab() === 'correo'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Correo
          </button>
          <button type="button" (click)="tab.set('sistema')" [class.active]="tab() === 'sistema'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke-linecap="round"/>
            </svg>
            Sistema
          </button>
        </nav>

        <div class="settings-panel">

          @if (tab() === 'perfil') {
            <div class="panel-section">
              <h2 class="panel-title">Información de la cuenta</h2>
              <p class="panel-sub">Datos con los que ingresas al panel de plataforma</p>
              <div class="form-grid">
                <div class="form-field">
                  <label for="as-correo">Correo</label>
                  <input id="as-correo" type="text" [value]="authService.currentUser()?.correo ?? ''" disabled class="disabled" />
                </div>
                <div class="form-field">
                  <label for="as-rol">Rol</label>
                  <input id="as-rol" type="text" value="Administrador root" disabled class="disabled" />
                </div>
              </div>
              <p class="pref-desc" style="margin-top:12px">Para cambiar el correo o el rol, pide a otro administrador root que edite tu usuario en Usuarios Root.</p>
            </div>
          }

          @if (tab() === 'password') {
            <div class="panel-section">
              <h2 class="panel-title">Cambiar contraseña</h2>
              <p class="panel-sub">Por seguridad, ingresa tu contraseña actual</p>

              <div class="form-grid" style="max-width:480px">
                @for (c of campos; track c.clave) {
                  <div class="form-field" style="grid-column:1/-1">
                    <label [for]="'as-' + c.clave">{{ c.label }}</label>
                    <div class="input-eye">
                      <input [id]="'as-' + c.clave" [type]="ver[c.clave] ? 'text' : 'password'"
                        [(ngModel)]="pwd[c.clave]" [name]="c.clave" [placeholder]="c.placeholder" autocomplete="off"
                        [class.input-err]="c.clave === 'confirma' && pwd.confirma && !coinciden()" />
                      <button type="button" (click)="ver[c.clave] = !ver[c.clave]"
                        [attr.aria-label]="ver[c.clave] ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                        @if (ver[c.clave]) {
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        } @else {
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        }
                      </button>
                    </div>
                    @if (c.clave === 'confirma' && pwd.confirma) {
                      @if (coinciden()) {
                        <p class="match-ok"><span>✓</span> Las contraseñas coinciden</p>
                      } @else {
                        <p class="match-err"><span>✕</span> Las contraseñas no coinciden</p>
                      }
                    }
                  </div>
                }
              </div>

              @if (pwd.nueva) {
                <div class="strength-wrap">
                  <div class="strength-bar" [class]="'s' + fuerza()">
                    @for (s of [1,2,3,4]; track s) {
                      <div class="strength-seg" [class.filled]="s <= fuerza()"></div>
                    }
                  </div>
                  <span class="strength-label" [class]="'s' + fuerza()">{{ ['', 'Débil', 'Regular', 'Buena', 'Fuerte'][fuerza()] }}</span>
                </div>
              }

              <div class="panel-footer">
                <button type="button" class="btn-primary" (click)="cambiarPassword()" [disabled]="guardando() || !formValido()">
                  {{ guardando() ? 'Actualizando…' : 'Actualizar contraseña' }}
                </button>
              </div>
            </div>
          }

          @if (tab() === 'apariencia') {
            <div class="panel-section">
              <h2 class="panel-title">Apariencia</h2>
              <p class="panel-sub">Personaliza la interfaz a tu gusto</p>

              <div class="pref-row">
                <div>
                  <p class="pref-label">Modo</p>
                  <p class="pref-desc">Automático sigue la configuración de tu sistema operativo</p>
                </div>
                <div class="modo-seg" role="radiogroup" aria-label="Modo de color">
                  @for (m of modos; track m.id) {
                    <button type="button" role="radio" [attr.aria-checked]="modoActual() === m.id"
                      [class.active]="modoActual() === m.id" (click)="setModo(m.id)">{{ m.label }}</button>
                  }
                </div>
              </div>

              <hr class="divider" />

              <div>
                <p class="pref-label" style="margin-bottom:12px">Color de acento</p>
                <div class="color-grid">
                  @for (t of temas; track t.id) {
                    <button type="button" class="color-chip" [style.background]="t.color"
                      [class.selected]="temaActual() === t.id" (click)="setTema(t.id)"
                      [title]="t.label" [attr.aria-label]="'Color ' + t.label">
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

              <div class="pref-row">
                <div>
                  <p class="pref-label">Tamaño de fuente</p>
                  <p class="pref-desc">Ajusta el tamaño del texto en la app</p>
                </div>
                <div class="font-size-btns">
                  <button type="button" (click)="setFontSize('small')"  [class.active]="fontSize() === 'small'" aria-label="Texto pequeño">A</button>
                  <button type="button" (click)="setFontSize('normal')" [class.active]="fontSize() === 'normal'" aria-label="Texto normal" style="font-size:16px">A</button>
                  <button type="button" (click)="setFontSize('large')"  [class.active]="fontSize() === 'large'" aria-label="Texto grande" style="font-size:20px">A</button>
                </div>
              </div>
            </div>
          }

          @if (tab() === 'correo') {
            <div class="panel-section">
              <h2 class="panel-title">Correo saliente</h2>
              <p class="panel-sub">
                Con esto la plataforma envía correos, como el código para que los usuarios de cada centro recuperen su contraseña.
                Se usa <strong>Brevo</strong>: crea la clave de API en brevo.com (SMTP &amp; API, API Keys) y verifica ahí el correo remitente.
              </p>

              @if (cargandoCorreo()) {
                <div class="spinner-wrap"><div class="spinner"></div></div>
              } @else {
                <div class="pref-row" style="margin-bottom:18px">
                  <div>
                    <p class="pref-label">Envío de correos</p>
                    <p class="pref-desc">
                      @if (correo.activo) { Activo: los usuarios pueden recuperar su contraseña por correo. }
                      @else { Desactivado: el login les indica que contacten al administrador de su centro. }
                    </p>
                  </div>
                  <button type="button" class="switch" [class.on]="correo.activo" role="switch" [attr.aria-checked]="correo.activo"
                    aria-label="Activar el envío de correos" (click)="correo.activo = !correo.activo">
                    <span class="switch-thumb"></span>
                  </button>
                </div>

                <div class="form-grid">
                  <div class="form-field" style="grid-column:1/-1">
                    <label for="co-key">Clave de API de Brevo</label>
                    <div class="input-eye">
                      <input id="co-key" [type]="verClave ? 'text' : 'password'" [(ngModel)]="correo.apiKey" name="apiKey" autocomplete="off"
                        [placeholder]="correoCfg()?.claveGuardada ? 'Guardada (termina en ' + correoCfg()?.claveFinal + '). Escribe otra solo para cambiarla' : 'xkeysib-...'" />
                      <button type="button" (click)="verClave = !verClave" [attr.aria-label]="verClave ? 'Ocultar clave' : 'Mostrar clave'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                    </div>
                    <p class="pref-desc" style="margin-top:6px">Se guarda cifrada y nunca se vuelve a mostrar.</p>
                  </div>
                  <div class="form-field">
                    <label for="co-rem">Correo remitente</label>
                    <input id="co-rem" type="email" [(ngModel)]="correo.remitenteCorreo" name="remitente" placeholder="notificaciones@tucentro.com" />
                  </div>
                  <div class="form-field">
                    <label for="co-nom">Nombre del remitente</label>
                    <input id="co-nom" type="text" [(ngModel)]="correo.remitenteNombre" name="remitenteNombre" placeholder="EPSAS" />
                  </div>
                </div>

                @if (correoCfg()?.actualizadoEn) {
                  <p class="pref-desc" style="margin-top:10px">
                    Última modificación: {{ correoCfg()?.actualizadoEn | date: 'medium' }}@if (correoCfg()?.actualizadoPor) { por {{ correoCfg()?.actualizadoPor }} }
                  </p>
                }

                <div class="panel-footer">
                  <button type="button" class="btn-primary" (click)="guardarCorreo()" [disabled]="guardandoCorreo()">
                    {{ guardandoCorreo() ? 'Guardando…' : 'Guardar' }}
                  </button>
                </div>

                <hr class="divider" />

                <p class="pref-label">Enviar un correo de prueba</p>
                <p class="pref-desc" style="margin-bottom:12px">Usa lo que está guardado, aunque el envío esté desactivado. Guarda primero si cambiaste algo.</p>
                <div class="flex flex-wrap gap-2 items-center">
                  <div class="form-field" style="flex:1;min-width:14rem">
                    <input type="email" [(ngModel)]="destinoPrueba" name="destinoPrueba" placeholder="tu-correo@ejemplo.com" aria-label="Correo de destino para la prueba" />
                  </div>
                  <button type="button" class="btn-secundario" (click)="probarCorreo()" [disabled]="probandoCorreo() || !destinoPrueba || !correoCfg()?.claveGuardada">
                    {{ probandoCorreo() ? 'Enviando…' : 'Enviar prueba' }}
                  </button>
                </div>
                @if (resultadoPrueba(); as rp) {
                  <p class="msg" [class.msg-ok]="rp.ok" [class.msg-err]="!rp.ok">{{ rp.texto }}</p>
                }
              }
            </div>
          }

          @if (tab() === 'sistema') {
            <div class="panel-section">
              <h2 class="panel-title">Sistema</h2>
              <p class="panel-sub">Información del panel y de tu sesión</p>
              <div class="sys-grid">
                <div class="sys-card"><div><p class="sys-label">Versión</p><p class="sys-value">1.0.0</p></div></div>
                <div class="sys-card"><div><p class="sys-label">Sesión</p><p class="sys-value">Administrador root</p></div></div>
              </div>
              <div class="panel-footer" style="justify-content:flex-start">
                <button type="button" class="btn-danger" (click)="cerrarSesion()">Cerrar sesión</button>
              </div>
            </div>
          }

        </div>
      </div>
    </div>
  `,
})
export class AdminSettingsComponent {
  readonly authService = inject(AdminAuthService);
  private readonly toast   = inject(AdminToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly theme   = inject(ThemeService);
  private readonly correoApi = inject(CorreoAdminService);
  private readonly _avisoCambios = avisarCambiosSinGuardar(() => !!(this.pwd.actual || this.pwd.nueva || this.pwd.confirma));

  readonly tab = signal<Tab>('perfil');

  // ── Correo saliente (Brevo) ──
  readonly correoCfg = signal<ConfiguracionCorreo | null>(null);
  readonly cargandoCorreo = signal(false);
  readonly guardandoCorreo = signal(false);
  readonly probandoCorreo = signal(false);
  readonly resultadoPrueba = signal<{ ok: boolean; texto: string } | null>(null);
  correo = { apiKey: '', remitenteCorreo: '', remitenteNombre: '', activo: false };
  verClave = false;
  destinoPrueba = '';
  readonly guardando = signal(false);

  readonly temas = TEMAS;
  readonly modos = MODOS;
  readonly temaActual = signal(localStorage.getItem('tema') ?? 'verde');
  readonly modoActual = signal<ModoTema>(this.theme.modo());
  readonly fontSize   = signal(localStorage.getItem('fontSize') ?? 'normal');

  readonly campos: { clave: 'actual' | 'nueva' | 'confirma'; label: string; placeholder: string }[] = [
    { clave: 'actual',   label: 'Contraseña actual',         placeholder: '••••••••' },
    { clave: 'nueva',    label: 'Nueva contraseña',          placeholder: 'Mín. 8 caracteres' },
    { clave: 'confirma', label: 'Confirmar nueva contraseña', placeholder: 'Repite la contraseña' },
  ];
  pwd = { actual: '', nueva: '', confirma: '' };
  ver: Record<string, boolean> = { actual: false, nueva: false, confirma: false };

  async abrirCorreo(): Promise<void> {
    this.tab.set('correo');
    if (this.correoCfg()) return;
    this.cargandoCorreo.set(true);
    try {
      this.aplicarCorreo(await this.correoApi.obtener());
      this.destinoPrueba = this.authService.currentUser()?.correo ?? '';
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar la configuración de correo.');
    } finally {
      this.cargandoCorreo.set(false);
    }
  }

  private aplicarCorreo(c: ConfiguracionCorreo): void {
    this.correoCfg.set(c);
    this.correo = { apiKey: '', remitenteCorreo: c.remitenteCorreo ?? '', remitenteNombre: c.remitenteNombre ?? '', activo: c.activo };
  }

  async guardarCorreo(): Promise<void> {
    this.guardandoCorreo.set(true);
    try {
      const { apiKey, ...resto } = this.correo;
      this.aplicarCorreo(await this.correoApi.guardar(apiKey.trim() ? { apiKey: apiKey.trim(), ...resto } : resto));
      this.toast.success('Configuración de correo guardada.');
    } catch (e) {
      this.toast.httpError(e, 'No se pudo guardar la configuración de correo.');
    } finally {
      this.guardandoCorreo.set(false);
    }
  }

  async probarCorreo(): Promise<void> {
    this.probandoCorreo.set(true);
    this.resultadoPrueba.set(null);
    try {
      const r = await this.correoApi.probar(this.destinoPrueba.trim());
      this.resultadoPrueba.set({ ok: true, texto: r.mensaje + ' Revisa la bandeja de entrada y la carpeta de spam.' });
    } catch (e: any) {
      const m = e?.error?.message;
      this.resultadoPrueba.set({ ok: false, texto: (Array.isArray(m) ? m.join('. ') : m) || 'No se pudo enviar el correo de prueba.' });
    } finally {
      this.probandoCorreo.set(false);
    }
  }

  nombre(): string {
    return (this.authService.currentUser()?.correo ?? 'Administrador').split('@')[0];
  }

  iniciales(): string {
    return this.nombre().slice(0, 2).toUpperCase();
  }

  coinciden(): boolean { return this.pwd.nueva === this.pwd.confirma; }

  fuerza(): 0 | 1 | 2 | 3 | 4 {
    const p = this.pwd.nueva;
    if (!p) return 0;
    let n = 0;
    if (p.length >= 8) n++;
    if (/[A-Z]/.test(p)) n++;
    if (/[0-9]/.test(p)) n++;
    if (/[^A-Za-z0-9]/.test(p)) n++;
    return n as 0 | 1 | 2 | 3 | 4;
  }

  formValido(): boolean {
    return !!this.pwd.actual && this.pwd.nueva.length >= 8 && this.coinciden() && !!this.pwd.confirma;
  }

  async cambiarPassword(): Promise<void> {
    if (!this.formValido()) return;
    this.guardando.set(true);
    try {
      await this.authService.cambiarPassword(this.pwd.actual, this.pwd.nueva);
      this.toast.success('Contraseña actualizada correctamente.');
      this.pwd = { actual: '', nueva: '', confirma: '' };
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo actualizar la contraseña.');
    } finally {
      this.guardando.set(false);
    }
  }

  setTema(id: string): void {
    this.temaActual.set(id);
    localStorage.setItem('tema', id);
    this.theme.apply();
  }

  setModo(modo: ModoTema): void {
    this.modoActual.set(modo);
    localStorage.setItem('modo', modo);
    this.theme.apply();
  }

  setFontSize(size: string): void {
    this.fontSize.set(size);
    localStorage.setItem('fontSize', size);
    this.theme.apply();
  }

  async cerrarSesion(): Promise<void> {
    const ok = await this.confirm.ask('Se cerrará tu sesión y volverás a la pantalla de ingreso.', {
      header: 'Cerrar sesión', acceptLabel: 'Cerrar sesión', danger: false,
    });
    if (ok) this.authService.logout();
  }
}
