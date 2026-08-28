import { Component, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <!-- Fondo exterior oscuro — idéntico al login -->
    <div class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style="background:#020d05;">

      <!-- Partículas flotantes de fondo -->
      @for (p of particles; track p.id) {
        <div class="absolute rounded-full pointer-events-none" [style]="p.style"></div>
      }

      <!-- Tarjeta principal -->
      <div class="w-full max-w-4xl flex rounded-3xl overflow-hidden relative fp-card"
        style="min-height:520px; box-shadow:0 32px 80px rgba(0,0,0,.7);">

        <!-- ══════════════ PANEL IZQUIERDO ══════════════ -->
        <div class="relative flex flex-col fp-left" style="width:52%;background:#041a0c;overflow:hidden;">

          <!-- Estrellas -->
          @for (s of stars; track s.id) {
            <div class="absolute rounded-full pointer-events-none" [style]="s.style"></div>
          }

          <!-- Resplandor central -->
          <div class="absolute pointer-events-none"
            style="width:320px;height:320px;border-radius:50%;
                   background:radial-gradient(circle,rgba(57,169,0,.18) 0%,transparent 70%);
                   top:50%;left:50%;transform:translate(-50%,-50%);"></div>

          <!-- Blob divisor blanco -->
          <svg class="absolute right-0 top-0 h-full pointer-events-none"
            style="width:72px;z-index:3;" viewBox="0 0 72 520"
            preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M72,0 C52,90 14,130 36,210 C58,290 16,340 26,420 C36,470 58,490 72,520 L72,0 Z"
              fill="white"/>
          </svg>

          <!-- Contenido izquierdo -->
          <div class="relative flex flex-col h-full p-9" style="z-index:2;">

            <!-- Logo / Marca -->
            <div class="flex items-center gap-3 mb-auto">
              <div class="flex items-center justify-center rounded-xl flex-shrink-0"
                style="width:36px;height:36px;background:#39A900;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="white" stroke-width="2.2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div>
                <div class="font-bold tracking-widest text-white" style="font-size:16px;">EPSAS</div>
                <div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:1px;">
                  Sistema de Prácticas · SENA
                </div>
              </div>
            </div>

            <!-- Ilustración SVG — candado con sobre/clave -->
            <div class="flex items-center justify-center fp-illustration" style="flex:1;padding:12px 0;">
              <svg width="240" height="240" viewBox="0 0 260 260"
                xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
                <defs>
                  <radialGradient id="fglow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#39A900" stop-opacity="0.25"/>
                    <stop offset="100%" stop-color="#39A900" stop-opacity="0"/>
                  </radialGradient>
                </defs>

                <!-- Resplandor base -->
                <circle cx="130" cy="135" r="95" fill="url(#fglow)"/>

                <!-- Sombra base -->
                <ellipse cx="130" cy="200" rx="70" ry="10" fill="rgba(57,169,0,.08)"/>

                <!-- Cuerpo del candado -->
                <rect x="88" y="130" width="84" height="68" rx="10"
                  fill="rgba(57,169,0,.18)" stroke="rgba(57,169,0,.7)" stroke-width="2"/>

                <!-- Arco del candado -->
                <path d="M104,130 L104,108 Q104,82 130,82 Q156,82 156,108 L156,130"
                  fill="none" stroke="rgba(57,169,0,.65)" stroke-width="8"
                  stroke-linecap="round"/>

                <!-- Ojo del candado -->
                <circle cx="130" cy="158" r="10"
                  fill="rgba(255,255,255,.08)" stroke="rgba(57,169,0,.8)" stroke-width="2"/>
                <rect x="127" y="158" width="6" height="12" rx="3"
                  fill="rgba(57,169,0,.7)"/>

                <!-- Sobre / email — arriba izquierda -->
                <rect x="38" y="80" width="52" height="38" rx="5"
                  fill="rgba(57,169,0,.12)" stroke="rgba(57,169,0,.45)" stroke-width="1.5"/>
                <path d="M38,85 L64,104 L90,85"
                  fill="none" stroke="rgba(57,169,0,.5)" stroke-width="1.5"/>

                <!-- Estrella / destellos -->
                <circle cx="196" cy="90" r="16" fill="none"
                  stroke="rgba(255,255,255,.1)" stroke-width="1"/>
                <circle cx="196" cy="90" r="9" fill="rgba(255,255,255,.04)"
                  stroke="rgba(255,255,255,.18)" stroke-width="1"/>
                <text x="196" y="95" text-anchor="middle"
                  fill="rgba(57,169,0,.85)" font-size="12" font-weight="bold"
                  font-family="sans-serif">&#x2605;</text>

                <!-- Líneas punteadas de conexión -->
                <path d="M90,99 Q106,108 106,130"
                  stroke="rgba(57,169,0,.25)" stroke-width="1"
                  fill="none" stroke-dasharray="3,3"/>
                <path d="M180,100 Q168,110 162,128"
                  stroke="rgba(255,255,255,.12)" stroke-width="1"
                  fill="none" stroke-dasharray="3,3"/>

                <!-- Puntos decorativos -->
                <circle cx="55" cy="150" r="4" fill="rgba(57,169,0,.55)"/>
                <circle cx="208" cy="130" r="3" fill="rgba(255,255,255,.25)"/>
                <circle cx="185" cy="165" r="2.5" fill="rgba(57,169,0,.4)"/>
                <circle cx="72" cy="172" r="3" fill="rgba(255,255,255,.14)"/>
                <circle cx="42" cy="125" r="2" fill="rgba(57,169,0,.3)"/>
                <circle cx="218" cy="108" r="2" fill="rgba(57,169,0,.25)"/>
              </svg>
            </div>

            <!-- Mensaje contextual -->
            <div class="text-center mt-auto">
              <p style="color:rgba(255,255,255,.7);font-size:14px;font-weight:600;
                         letter-spacing:.3px;margin-bottom:4px;">
                Recupera tu acceso
              </p>
              <p style="color:rgba(255,255,255,.3);font-size:11px;">
                Te guiamos paso a paso para restablecer tu contraseña
              </p>
            </div>

            <!-- Volver al login -->
            <a routerLink="/"
              style="display:flex;align-items:center;gap:6px;margin-top:20px;
                     color:rgba(255,255,255,.35);font-size:11px;text-decoration:none;
                     transition:color .2s;"
              (mouseenter)="$any($event.target).style.color='rgba(255,255,255,.7)'"
              (mouseleave)="$any($event.target).style.color='rgba(255,255,255,.35)'">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Volver al inicio de sesión
            </a>

            <!-- Footer -->
            <div class="mt-4" style="color:rgba(255,255,255,.2);font-size:10px;">
              © {{ year }} SENA · Centro Yamboró · Todos los derechos reservados
            </div>
          </div>
        </div>

        <!-- ══════════════ PANEL DERECHO ══════════════ -->
        <div class="flex flex-col justify-center bg-white px-10 py-10" style="flex:1;">

          <!-- Indicador de pasos -->
          <div class="flex items-center gap-2 mb-7">
            @for (n of [1,2,3]; track n) {
              <div class="flex items-center gap-2">
                <div style="width:26px;height:26px;border-radius:50%;display:flex;
                             align-items:center;justify-content:center;font-size:11px;
                             font-weight:700;transition:all .3s;"
                  [style.background]="step() >= n ? '#39A900' : '#f0f0f0'"
                  [style.color]="step() >= n ? 'white' : '#b0b0b0'">
                  @if (step() > n) {
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="white" stroke-width="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  } @else {
                    {{ n }}
                  }
                </div>
                @if (n < 3) {
                  <div style="width:28px;height:2px;border-radius:1px;transition:background .3s;"
                    [style.background]="step() > n ? '#39A900' : '#e8e8e8'"></div>
                }
              </div>
            }
          </div>

          <!-- Título dinámico -->
          <h2 style="font-size:24px;font-weight:700;color:#071a0a;margin-bottom:8px;">
            @if (step() === 1) { Recuperar contraseña }
            @if (step() === 2) { Verificar código }
            @if (step() === 3) { Nueva contraseña }
          </h2>
          <p style="font-size:13px;color:#8fa896;margin-bottom:24px;line-height:1.5;">
            @if (step() === 1) { Ingresa tu correo y te enviaremos un código de verificación. }
            @if (step() === 2) { Revisa tu bandeja de entrada e ingresa el código recibido. }
            @if (step() === 3) { Elige una contraseña segura para tu cuenta. }
          </p>

          <!-- Alerta éxito -->
          @if (mensaje()) {
            <div class="mb-5 p-3 rounded-xl text-sm"
              style="background:#f0fdf4;border:1.5px solid #bbf7d0;color:#15803d;">
              {{ mensaje() }}
            </div>
          }

          <!-- Alerta error -->
          @if (error()) {
            <div class="mb-5 p-3 rounded-xl text-sm"
              style="background:#fef2f2;border:1.5px solid #fecaca;color:#dc2626;">
              {{ error() }}
            </div>
          }

          <!-- ── Paso 1: Correo ── -->
          @if (step() === 1) {
            <div class="space-y-4">
              <div>
                <label style="display:block;font-size:11px;font-weight:700;
                               color:#2d4a33;margin-bottom:6px;letter-spacing:.5px;
                               text-transform:uppercase;">
                  Correo electrónico
                </label>
                <div class="relative">
                  <span class="absolute" style="left:13px;top:50%;transform:translateY(-50%);
                                color:#8fa896;pointer-events:none;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="M2 7l10 7 10-7"/>
                    </svg>
                  </span>
                  <input type="email" [(ngModel)]="correo"
                    placeholder="correo@ejemplo.com"
                    style="width:100%;padding:11px 12px 11px 38px;
                           border:1.5px solid #e2ece5;border-radius:12px;
                           font-size:13px;color:#071a0a;background:#f5faf6;
                           outline:none;transition:border-color .2s,background .2s;"
                    (focus)="onFocus($event)" (blur)="onBlur($event)"/>
                </div>
              </div>

              <button (click)="solicitarCodigo()" [disabled]="loading()"
                style="width:100%;padding:13px;border-radius:13px;border:none;
                       background:linear-gradient(135deg,#2a7a00,#39A900);
                       color:white;font-size:14px;font-weight:700;
                       cursor:pointer;display:flex;align-items:center;
                       justify-content:center;gap:8px;
                       transition:opacity .2s,transform .1s;"
                [style.opacity]="loading() ? '0.65' : '1'"
                [style.cursor]="loading() ? 'not-allowed' : 'pointer'">
                @if (loading()) {
                  <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="white" stroke-width="3" opacity=".3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="white" stroke-width="3"
                      stroke-linecap="round"/>
                  </svg>
                  Enviando...
                } @else {
                  Enviar código
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="white" stroke-width="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                }
              </button>
            </div>
          }

          <!-- ── Paso 2: Código ── -->
          @if (step() === 2) {
            <div class="space-y-4">
              <div>
                <label style="display:block;font-size:11px;font-weight:700;
                               color:#2d4a33;margin-bottom:6px;letter-spacing:.5px;
                               text-transform:uppercase;">
                  Código de verificación
                </label>
                <div class="relative">
                  <span class="absolute" style="left:13px;top:50%;transform:translateY(-50%);
                                color:#8fa896;pointer-events:none;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2">
                      <path d="M9 12l2 2 4-4"/>
                      <rect x="3" y="4" width="18" height="16" rx="2"/>
                    </svg>
                  </span>
                  <input type="text" [(ngModel)]="codigo"
                    placeholder="Ej: 123456"
                    style="width:100%;padding:11px 12px 11px 38px;
                           border:1.5px solid #e2ece5;border-radius:12px;
                           font-size:13px;color:#071a0a;background:#f5faf6;
                           outline:none;transition:border-color .2s,background .2s;
                           letter-spacing:3px;"
                    (focus)="onFocus($event)" (blur)="onBlur($event)"/>
                </div>
                <p style="font-size:11px;color:#8fa896;margin-top:6px;">
                  Código enviado a <strong style="color:#2d4a33;">{{ correo }}</strong>
                </p>
              </div>

              <button (click)="verificarCodigo()" [disabled]="loading()"
                style="width:100%;padding:13px;border-radius:13px;border:none;
                       background:linear-gradient(135deg,#2a7a00,#39A900);
                       color:white;font-size:14px;font-weight:700;
                       cursor:pointer;display:flex;align-items:center;
                       justify-content:center;gap:8px;
                       transition:opacity .2s;"
                [style.opacity]="loading() ? '0.65' : '1'"
                [style.cursor]="loading() ? 'not-allowed' : 'pointer'">
                @if (loading()) {
                  <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="white" stroke-width="3" opacity=".3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="white" stroke-width="3"
                      stroke-linecap="round"/>
                  </svg>
                  Verificando...
                } @else {
                  Verificar código
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="white" stroke-width="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                }
              </button>

              <button type="button" (click)="volverPaso()"
                style="width:100%;padding:11px;border-radius:13px;
                       border:1.5px solid #e2ece5;background:transparent;
                       color:#8fa896;font-size:13px;font-weight:600;
                       cursor:pointer;transition:border-color .2s,color .2s;"
                (mouseenter)="$any($event.target).style.borderColor='#39A900';$any($event.target).style.color='#39A900'"
                (mouseleave)="$any($event.target).style.borderColor='#e2ece5';$any($event.target).style.color='#8fa896'">
                Cambiar correo
              </button>
            </div>
          }

          <!-- ── Paso 3: Nueva contraseña ── -->
          @if (step() === 3) {
            <div class="space-y-4">
              <div>
                <label style="display:block;font-size:11px;font-weight:700;
                               color:#2d4a33;margin-bottom:6px;letter-spacing:.5px;
                               text-transform:uppercase;">
                  Nueva contraseña
                </label>
                <div class="relative">
                  <span class="absolute" style="left:13px;top:50%;transform:translateY(-50%);
                                color:#8fa896;pointer-events:none;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                  <input [type]="showPass() ? 'text' : 'password'"
                    [(ngModel)]="nuevaPassword"
                    placeholder="••••••••"
                    style="width:100%;padding:11px 40px 11px 38px;
                           border:1.5px solid #e2ece5;border-radius:12px;
                           font-size:13px;color:#071a0a;background:#f5faf6;
                           outline:none;transition:border-color .2s,background .2s;"
                    (focus)="onFocus($event)" (blur)="onBlur($event)"/>
                  <button type="button" (click)="showPass.set(!showPass())"
                    style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                           color:#8fa896;background:none;border:none;cursor:pointer;padding:0;
                           display:flex;align-items:center;">
                    @if (showPass()) {
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8
                                 a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8
                                 a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    } @else {
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    }
                  </button>
                </div>
              </div>

              <button (click)="cambiarPassword()" [disabled]="loading()"
                style="width:100%;padding:13px;border-radius:13px;border:none;
                       background:linear-gradient(135deg,#2a7a00,#39A900);
                       color:white;font-size:14px;font-weight:700;
                       cursor:pointer;display:flex;align-items:center;
                       justify-content:center;gap:8px;
                       transition:opacity .2s;"
                [style.opacity]="loading() ? '0.65' : '1'"
                [style.cursor]="loading() ? 'not-allowed' : 'pointer'">
                @if (loading()) {
                  <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="white" stroke-width="3" opacity=".3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="white" stroke-width="3"
                      stroke-linecap="round"/>
                  </svg>
                  Guardando...
                } @else {
                  Cambiar contraseña
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="white" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                }
              </button>
            </div>
          }

          <!-- Copyright -->
          <p style="font-size:10px;color:#b8c9bb;text-align:center;margin-top:24px;">
            EPSAS · Etapas Prácticas · Centro Yamboró
          </p>
        </div>

      </div>
    </div>
  `,
  styles: [`
    /* En mobile no hay espacio para el panel izquierdo al 52%: se apila
       arriba del formulario y se oculta solo la ilustración grande (el
       logo, el mensaje y el link "Volver al inicio de sesión" quedan
       visibles — es la única forma de volver al login en esta pantalla). */
    @media (max-width: 760px) {
      .fp-card { flex-direction: column; min-height: 0; }
      .fp-left { width: 100% !important; }
      .fp-illustration { display: none !important; }
    }
  `],
})
export class ForgotPasswordComponent implements OnInit {
  step    = signal(1);
  loading = signal(false);
  error   = signal<string | null>(null);
  mensaje = signal<string | null>(null);
  showPass = signal(false);

  correo        = '';
  codigo        = '';
  nuevaPassword = '';

  year = new Date().getFullYear();

  stars:     { id: number; style: string }[] = [];
  particles: { id: number; style: string }[] = [];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.stars = Array.from({ length: 45 }, (_, i) => {
      const size  = Math.random() * 2.5 + 0.8;
      const delay = (Math.random() * 4).toFixed(1);
      const dur   = (2 + Math.random() * 3).toFixed(1);
      return {
        id: i,
        style: `width:${size}px;height:${size}px;
                top:${(Math.random() * 100).toFixed(1)}%;
                left:${(Math.random() * 82).toFixed(1)}%;
                background:rgba(255,255,255,${(0.2 + Math.random() * 0.6).toFixed(2)});
                animation:twinkle ${dur}s ${delay}s infinite alternate;`,
      };
    });

    this.particles = Array.from({ length: 6 }, (_, i) => {
      const size  = 40 + Math.random() * 120;
      const delay = (Math.random() * 5).toFixed(1);
      return {
        id: i,
        style: `width:${size}px;height:${size}px;
                top:${(Math.random() * 100).toFixed(1)}%;
                left:${(Math.random() * 100).toFixed(1)}%;
                background:rgba(57,169,0,${(0.04 + Math.random() * 0.06).toFixed(2)});
                animation:floatP ${(5 + Math.random() * 6).toFixed(1)}s ${delay}s infinite ease-in-out alternate;`,
      };
    });
  }

  onFocus(e: Event): void {
    const el = e.target as HTMLInputElement;
    el.style.borderColor = '#39A900';
    el.style.background  = '#fff';
  }

  onBlur(e: Event): void {
    const el = e.target as HTMLInputElement;
    el.style.borderColor = '#e2ece5';
    el.style.background  = '#f5faf6';
  }

  volverPaso(): void {
    this.error.set(null);
    this.mensaje.set(null);
    this.step.set(this.step() - 1);
  }

  async solicitarCodigo(): Promise<void> {
    if (!this.correo.trim()) { this.error.set('Ingresa tu correo electrónico.'); return; }
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.api.solicitarRecuperacion(this.correo);
      this.mensaje.set('Código enviado a tu correo.');
      this.step.set(2);
    } catch { this.error.set('No se pudo enviar el código. Verifica tu correo.'); }
    finally  { this.loading.set(false); }
  }

  verificarCodigo(): void {
    if (!this.codigo.trim()) { this.error.set('Ingresa el código de 6 dígitos recibido en tu correo.'); return; }
    if (!/^\d{6}$/.test(this.codigo.trim())) { this.error.set('El código debe tener exactamente 6 dígitos numéricos.'); return; }
    this.error.set(null);
    this.mensaje.set('Código ingresado. Ahora elige tu nueva contraseña.');
    this.step.set(3);
  }

  async cambiarPassword(): Promise<void> {
    if (!this.nuevaPassword.trim()) { this.error.set('Ingresa la nueva contraseña.'); return; }
    if (this.nuevaPassword.trim().length < 6) { this.error.set('La contraseña debe tener al menos 6 caracteres.'); return; }
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.api.restablecerPassword(this.correo, this.codigo.trim(), this.nuevaPassword.trim());
      this.mensaje.set('Contraseña actualizada correctamente. Ya puedes iniciar sesión.');
      this.step.set(1);
      this.correo = ''; this.codigo = ''; this.nuevaPassword = '';
    } catch (err: any) {
      const msg = err?.error?.message ?? 'No se pudo cambiar la contraseña. El código puede ser incorrecto o haber expirado.';
      this.error.set(msg);
    }
    finally  { this.loading.set(false); }
  }
}
