import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { AdminService } from '../services/admin.service';
import { PermisosGestionService } from '../../../core/services/permisos-gestion.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import {
  Decision, ModuloUI, Origen, RecursoUI, ServicioCat,
  construirModulos, decisionPara, efectivoDe, fraseServicio, nivelDe, normalizar, origenDe, textoNivel, tieneHuecos,
} from './permisos-catalogo';

type Filtro = 'todos' | 'tiene' | 'distintos';

/** Todo lo que el panel necesita saber de un servicio para una cuenta (o rol), ya con el borrador aplicado. */
interface EstadoServicio {
  efectivo: boolean;
  delRol: boolean;
  origen: Origen;
  /** Cómo estaba guardado antes del borrador. */
  origenAntes: Origen;
  decision: Decision;
  /** Decisión guardada hoy (ya sin excepciones redundantes). */
  decisionGuardada: Decision;
  cambiado: boolean;
}

/**
 * Panel lateral para ver y cambiar los permisos de UNA cuenta (modo `usuario`)
 * o de un rol completo (modo `rol`).
 *
 * Los cambios se acumulan en un borrador (`draft`) y solo se guardan al pulsar
 * «Guardar cambios», todos juntos y en una transacción (`POST /permisos/aplicar-cambios`).
 * El borrador guarda únicamente las diferencias contra lo que hay en el servidor:
 * si alguien deshace un cambio, la entrada desaparece.
 *
 * En modo usuario cada permiso tiene cuatro estados que se ven por separado:
 * del rol, extra personal (excepción que lo añade), bloqueado (excepción que lo
 * quita aunque el rol lo dé) y no lo tiene. Al elegir un resultado, `decisionPara`
 * escoge la decisión mínima: si coincide con lo que ya da el rol no se crea
 * excepción alguna.
 */
@Component({
  selector: 'app-permisos-drawer',
  standalone: true,
  imports: [DialogDirective, LoadingSkeletonComponent],
  template: `
    <div appDialog [dialogGuard]="false" class="pd-fondo">
      <section class="pd-panel">

        <!-- ── Encabezado ── -->
        <header class="pd-head">
          <div class="pd-avatar" aria-hidden="true">{{ iniciales() }}</div>
          <div class="pd-head-texto">
            <h2>{{ titulo() }}</h2>
            <p>{{ subtitulo() }}</p>
          </div>

          @if (modo === 'usuario' && !soloLectura()) {
            <div class="pd-menu-caja">
              <button type="button" class="pd-icono" aria-label="Más acciones" aria-haspopup="menu"
                [attr.aria-expanded]="menu()" (click)="menu.set(!menu())">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
              </button>
              @if (menu()) {
                <div class="pd-menu" role="menu">
                  <button type="button" role="menuitem" [disabled]="excepciones().size === 0 || guardando()" (click)="restablecer()">
                    <strong>Restablecer al rol</strong>
                    <span>Borra sus {{ excepciones().size }} excepciones y vuelve a lo que da su rol.</span>
                  </button>
                  <button type="button" role="menuitem" class="pd-menu-peligro" [disabled]="guardando()" (click)="accesoTotal()">
                    <strong>Dar acceso total…</strong>
                    <span>Marca todos los permisos del sistema (no se aplica hasta que guardes).</span>
                  </button>
                </div>
              }
            </div>
          }

          <button type="button" class="pd-icono" aria-label="Cerrar" (click)="intentarCerrar()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </header>

        @if (cargando()) {
          <div class="pd-carga"><app-loading-skeleton variant="form" [rows]="6" label="Cargando permisos" /></div>
        } @else {

          <!-- ── Resumen ── -->
          <div class="pd-resumen">
            @if (modo === 'usuario') {
              <span class="pd-chip pd-origen-rol"><b>{{ resumen().delRol }}</b> del rol</span>
              <span class="pd-chip pd-origen-extra"><b>{{ resumen().extras }}</b> extras personales</span>
              <span class="pd-chip pd-origen-bloqueado"><b>{{ resumen().bloqueados }}</b> bloqueados</span>
              <span class="pd-chip-nota">{{ resumen().tiene }} de {{ resumen().total }} permisos activos</span>
            } @else {
              <span class="pd-chip pd-origen-rol"><b>{{ resumen().tiene }}</b> de {{ resumen().total }} permisos activos</span>
              <span class="pd-chip-nota">Afecta a {{ personasConRol() }} {{ personasConRol() === 1 ? 'persona' : 'personas' }} con este rol</span>
            }
          </div>

          @if (soloLectura()) {
            <div class="pd-aviso" role="status">🔒 {{ soloLectura() }}</div>
          }

          <div class="pd-cuerpo">

            <!-- ── Módulos ── -->
            <nav class="pd-modulos" aria-label="Módulos">
              @for (m of modulos(); track m.nombre) {
                <button type="button" class="pd-modulo" [class.activo]="!busqueda() && moduloActivo() === m.nombre"
                  (click)="irAModulo(m.nombre)">
                  <span class="pd-modulo-nombre">{{ m.etiqueta }}</span>
                  <span class="pd-modulo-cuenta">
                    @if (conteos().get(m.nombre)?.cambios) { <i class="pd-punto" title="Tiene cambios sin guardar"></i> }
                    {{ conteos().get(m.nombre)?.tiene }}/{{ m.servicios.length }}
                  </span>
                </button>
              }
            </nav>

            <!-- ── Permisos ── -->
            <div class="pd-principal">
              <div class="pd-barra">
                <label class="pd-buscar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                  <input type="search" data-no-dirty placeholder="Buscar un permiso, ej. aprobar traslados"
                    [value]="busqueda()" (input)="busqueda.set($any($event.target).value)" />
                </label>
                <div class="pd-filtros" role="group" aria-label="Filtrar">
                  <button type="button" [class.activo]="filtro() === 'todos'" (click)="filtro.set('todos')">Todos</button>
                  <button type="button" [class.activo]="filtro() === 'tiene'" (click)="filtro.set('tiene')">Los que tiene</button>
                  @if (modo === 'usuario') {
                    <button type="button" [class.activo]="filtro() === 'distintos'" (click)="filtro.set('distintos')">Distintos al rol</button>
                  }
                </div>
              </div>

              @if (modo === 'usuario') {
                <div class="pd-leyenda" aria-hidden="true">
                  <span><i class="pd-pt pd-origen-rol"></i>Del rol</span>
                  <span><i class="pd-pt pd-origen-extra"></i>Extra personal</span>
                  <span><i class="pd-pt pd-origen-bloqueado"></i>Bloqueado para esta cuenta</span>
                </div>
              }

              <div class="pd-lista">
                @for (grupo of vista(); track grupo.modulo.nombre) {
                  <div class="pd-grupo">
                    <div class="pd-grupo-cab">
                      <div>
                        <h3>{{ grupo.modulo.etiqueta }}</h3>
                        @if (grupo.modulo.descripcion) { <p>{{ grupo.modulo.descripcion }}</p> }
                      </div>
                      @if (!soloLectura()) {
                        <div class="pd-grupo-acc">
                          <button type="button" (click)="marcarModulo(grupo.modulo, true)">Marcar todo</button>
                          <button type="button" (click)="marcarModulo(grupo.modulo, false)">Quitar todo</button>
                        </div>
                      }
                    </div>

                    @for (r of grupo.recursos; track r.recurso) {
                      <div class="pd-fila" [class.cambiada]="recursoCambiado(r)">
                        <div class="pd-fila-sup">
                          <div class="pd-fila-nombre">
                            <strong>{{ r.label }}</strong>
                            @if (r.pasos.length) { <small>{{ textoRecurso(r) }}</small> }
                          </div>

                          @if (r.pasos.length) {
                            <div class="pd-escalera" role="radiogroup" [attr.aria-label]="'Nivel de acceso a ' + r.label">
                              <button type="button" role="radio" class="pd-escalon" [attr.aria-checked]="nivelActual(r) === 0"
                                [class.activo]="nivelActual(r) === 0" [class.cero]="true" [disabled]="!!soloLectura()"
                                (click)="elegirNivel(r, 0)">
                                Sin acceso
                                @if (marcaRol(r, 0)) { <span class="pd-marca">rol</span> }
                              </button>
                              @for (paso of r.pasos; track $index) {
                                <button type="button" role="radio" class="pd-escalon" [attr.aria-checked]="nivelActual(r) === $index + 1"
                                  [class.activo]="nivelActual(r) === $index + 1" [disabled]="!!soloLectura()"
                                  [style.--nivel-color]="colorNivel($index)" [title]="titulosPaso(paso.servicios)"
                                  (click)="elegirNivel(r, $index + 1)">
                                  {{ paso.label }}
                                  @if (marcaRol(r, $index + 1)) { <span class="pd-marca">rol</span> }
                                </button>
                              }
                            </div>
                          }
                        </div>

                        @if (huecos(r)) {
                          <p class="pd-hueco">Tiene permisos sueltos que no siguen la escala (por ejemplo, puede eliminar pero no ver). Elige un nivel para ordenarlo.</p>
                        }

                        @if (r.extras.length) {
                          <ul class="pd-extras">
                            @for (ex of r.extras; track ex.servicio.idServicio) {
                              <li>
                                <button type="button" role="switch" class="pd-switch" [attr.aria-checked]="est(ex.servicio.idServicio).efectivo"
                                  [class.on]="est(ex.servicio.idServicio).efectivo" [disabled]="!!soloLectura()"
                                  [attr.aria-label]="ex.label" (click)="alternar(ex.servicio)">
                                  <span class="pd-switch-pista"><span class="pd-switch-bola"></span></span>
                                  <span class="pd-switch-texto">{{ ex.label }}</span>
                                </button>
                                @if (modo === 'usuario' && est(ex.servicio.idServicio).origen !== 'no') {
                                  <span class="pd-etiqueta" [class]="'pd-etiqueta pd-origen-' + est(ex.servicio.idServicio).origen">
                                    {{ textoOrigen(est(ex.servicio.idServicio).origen) }}
                                  </span>
                                }
                              </li>
                            }
                          </ul>
                        }
                      </div>
                    }
                  </div>
                } @empty {
                  <div class="pd-vacio">
                    @if (busqueda()) { Ningún permiso coincide con «{{ busqueda() }}». }
                    @else { No hay permisos para mostrar con este filtro. }
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- ── Barra de guardado ── -->
          <footer class="pd-pie">
            @if (cambios().length) {
              @if (verCambios()) {
                <div class="pd-cambios" role="region" aria-label="Cambios sin guardar">
                  @for (c of cambios(); track c.id) {
                    <div class="pd-cambio">
                      <span class="pd-cambio-nombre">{{ c.label }}</span>
                      <span class="pd-cambio-flujo">
                        <s>{{ c.antes }}</s> → <b>{{ c.despues }}</b>
                      </span>
                    </div>
                  }
                </div>
              }
              <div class="pd-pie-fila">
                <button type="button" class="pd-link" [attr.aria-expanded]="verCambios()" (click)="verCambios.set(!verCambios())">
                  <b>{{ cambios().length }}</b> {{ cambios().length === 1 ? 'cambio sin guardar' : 'cambios sin guardar' }}
                  · {{ verCambios() ? 'ocultar' : 'ver cuáles' }}
                </button>
                <div class="pd-pie-botones">
                  <button type="button" class="pd-btn" [disabled]="guardando()" (click)="descartar()">Descartar</button>
                  <button type="button" class="pd-btn pd-btn-primario" [disabled]="guardando() || !!soloLectura()" (click)="guardar()">
                    {{ guardando() ? 'Guardando…' : 'Guardar cambios' }}
                  </button>
                </div>
              </div>
            } @else {
              <div class="pd-pie-fila">
                <span class="pd-pie-nota">Sin cambios pendientes. Lo que marques se aplica solo al pulsar «Guardar cambios».</span>
                <div class="pd-pie-botones">
                  <button type="button" class="pd-btn" (click)="intentarCerrar()">Cerrar</button>
                </div>
              </div>
            }
          </footer>
        }
      </section>
    </div>
  `,
  styles: [`
    .pd-fondo { position: fixed; inset: 0; z-index: 1090; display: flex; justify-content: flex-end; background: rgba(0,0,0,.5); }
    .pd-panel {
      position: relative; display: flex; flex-direction: column; width: min(1060px, 100vw); height: 100%;
      background: var(--surface); color: var(--text); box-shadow: -12px 0 40px rgba(0,0,0,.2);
    }

    .pd-head { display: flex; align-items: center; gap: 14px; padding: 18px 22px; border-bottom: 1px solid var(--border); }
    .pd-avatar {
      flex: none; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
      background: var(--accent-soft); color: var(--accent-text); font-weight: 800; font-size: 15px;
    }
    .pd-head-texto { flex: 1; min-width: 0; }
    .pd-head-texto h2 { margin: 0; font-size: 18px; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; }
    .pd-head-texto p { margin: 2px 0 0; font-size: 13px; color: var(--text-muted); overflow-wrap: anywhere; }
    .pd-icono {
      flex: none; width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface);
      color: var(--text-2); display: grid; place-items: center; cursor: pointer;
    }
    .pd-icono:hover { background: var(--surface3); }
    .pd-menu-caja { position: relative; }
    .pd-menu {
      position: absolute; right: 0; top: 42px; z-index: 5; width: 300px; padding: 6px; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border-strong); box-shadow: 0 12px 30px rgba(0,0,0,.18);
    }
    .pd-menu button {
      display: block; width: 100%; text-align: left; padding: 9px 10px; border: none; background: none; border-radius: 8px;
      cursor: pointer; font-family: inherit; color: var(--text);
    }
    .pd-menu button:hover:not(:disabled) { background: var(--surface3); }
    .pd-menu button:disabled { opacity: .45; cursor: not-allowed; }
    .pd-menu strong { display: block; font-size: 14px; }
    .pd-menu span { display: block; margin-top: 2px; font-size: 12.5px; color: var(--text-muted); }
    .pd-menu-peligro strong { color: var(--err-text); }

    .pd-carga { padding: 24px; }

    .pd-resumen { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 22px; border-bottom: 1px solid var(--border-soft); background: var(--surface2); }
    .pd-chip { font-size: 13px; padding: 4px 11px; border-radius: 999px; border: 1px solid transparent; }
    .pd-chip b { font-weight: 800; }
    .pd-chip-nota { font-size: 13px; color: var(--text-muted); margin-left: 4px; }

    .pd-origen-rol { background: var(--surface3); color: var(--text-2); border-color: var(--border); }
    .pd-origen-extra { background: var(--ok-bg); color: var(--ok-text); border-color: var(--ok-border); }
    .pd-origen-bloqueado { background: var(--err-bg); color: var(--err-text); border-color: var(--err-border); }
    .pd-origen-no { background: transparent; color: var(--text-faint); }

    .pd-aviso { margin: 12px 22px 0; padding: 10px 14px; border-radius: 10px; font-size: 13.5px; background: var(--warn-bg); color: var(--warn-text); border: 1px solid var(--warn-border); }

    /* La fila del grid debe poder encogerse (minmax(0,1fr)); sin esto crece con el contenido y la lista se desborda sobre la barra de guardado. */
    .pd-cuerpo { flex: 1; min-height: 0; display: grid; grid-template-columns: 236px 1fr; grid-template-rows: minmax(0, 1fr); overflow: hidden; }
    .pd-modulos { overflow-y: auto; padding: 12px 10px; border-right: 1px solid var(--border); background: var(--surface2); display: flex; flex-direction: column; gap: 2px; }
    .pd-modulo {
      display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; text-align: left; padding: 9px 11px;
      border: none; background: none; border-radius: 9px; cursor: pointer; font-family: inherit; color: var(--text-2); font-size: 14px; font-weight: 600;
    }
    .pd-modulo:hover { background: var(--surface3); }
    .pd-modulo.activo { background: var(--accent-soft); color: var(--accent-text); font-weight: 800; }
    .pd-modulo-cuenta { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .pd-punto { width: 8px; height: 8px; border-radius: 50%; background: var(--warn-text); display: inline-block; }

    .pd-principal { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
    .pd-barra { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 12px 22px 8px; }
    .pd-buscar {
      flex: 1 1 260px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1.5px solid var(--border-strong);
      border-radius: 10px; background: var(--surface); color: var(--text-muted);
    }
    .pd-buscar:focus-within { border-color: var(--accent-brand); }
    .pd-buscar input { flex: 1; min-width: 0; border: none; outline: none; background: none; padding: 9px 0; font: inherit; font-size: 14px; color: var(--text); }
    .pd-filtros { display: inline-flex; border: 1.5px solid var(--border-strong); border-radius: 10px; overflow: hidden; }
    .pd-filtros button { border: none; border-right: 1px solid var(--border); background: var(--surface); padding: 8px 13px; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; white-space: nowrap; }
    .pd-filtros button:last-child { border-right: none; }
    .pd-filtros button.activo { background: var(--accent-brand); color: #fff; }
    .pd-leyenda { display: flex; flex-wrap: wrap; gap: 14px; padding: 0 22px 8px; font-size: 12.5px; color: var(--text-muted); }
    .pd-leyenda span { display: inline-flex; align-items: center; gap: 6px; }
    .pd-pt { width: 10px; height: 10px; border-radius: 50%; display: inline-block; border: 1px solid var(--border-strong); }

    .pd-lista { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 22px 18px; }
    .pd-grupo { margin-top: 10px; }
    .pd-grupo-cab { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 6px 0 8px; border-bottom: 1px solid var(--border); }
    .pd-grupo-cab h3 { margin: 0; font-size: 15px; font-weight: 800; }
    .pd-grupo-cab p { margin: 1px 0 0; font-size: 13px; color: var(--text-muted); }
    .pd-grupo-acc { display: flex; gap: 6px; flex: none; }
    .pd-grupo-acc button { border: 1px solid var(--border-strong); background: var(--surface); border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-2); cursor: pointer; }
    .pd-grupo-acc button:hover { background: var(--surface3); }

    .pd-fila { padding: 12px 10px 12px 12px; border-bottom: 1px solid var(--border-soft); border-left: 3px solid transparent; }
    .pd-fila.cambiada { border-left-color: var(--warn-text); background: color-mix(in srgb, var(--warn-bg) 45%, transparent); }
    .pd-fila-sup { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
    .pd-fila-nombre { min-width: 0; flex: 1 1 220px; }
    .pd-fila-nombre strong { display: block; font-size: 14.5px; font-weight: 700; }
    .pd-fila-nombre small { display: block; margin-top: 2px; font-size: 13px; color: var(--text-muted); }
    .pd-hueco { margin: 8px 0 0; font-size: 13px; color: var(--warn-text); }

    .pd-escalera { display: inline-flex; flex: none; border: 1.5px solid var(--border-strong); border-radius: 10px; overflow: hidden; }
    .pd-escalon {
      position: relative; border: none; border-right: 1.5px solid var(--border-strong); background: var(--surface); color: var(--text-muted);
      padding: 8px 14px 8px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .pd-escalera .pd-escalon:last-child { border-right: none; }
    .pd-escalon:hover:not(:disabled):not(.activo) { background: var(--surface3); }
    .pd-escalon.activo { background: var(--nivel-color, var(--accent)); color: #fff; }
    .pd-escalon.cero.activo { background: #6b7280; }
    .pd-escalon:disabled { cursor: not-allowed; opacity: .6; }
    .pd-marca {
      position: absolute; left: 50%; bottom: -1px; transform: translateX(-50%); font-size: 10.5px; font-weight: 800; letter-spacing: .05em;
      text-transform: uppercase; padding: 0 6px; border-radius: 6px 6px 0 0; background: var(--text-2); color: var(--surface);
    }
    .pd-escalon.activo .pd-marca { background: #fff; color: var(--text-2); }

    .pd-extras { list-style: none; margin: 10px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 6px 18px; }
    .pd-extras li { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
    .pd-switch { display: inline-flex; align-items: center; gap: 10px; min-width: 0; border: none; background: none; padding: 4px 0; font: inherit; cursor: pointer; color: var(--text); text-align: left; }
    .pd-switch:disabled { cursor: not-allowed; opacity: .6; }
    .pd-switch-pista { flex: none; width: 36px; height: 20px; border-radius: 999px; background: var(--border-strong); position: relative; transition: background .15s; }
    .pd-switch-bola { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s; }
    .pd-switch.on .pd-switch-pista { background: var(--accent-brand); }
    .pd-switch.on .pd-switch-bola { transform: translateX(16px); }
    .pd-switch-texto { font-size: 13.5px; overflow-wrap: anywhere; }
    .pd-etiqueta { flex: none; font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid transparent; }

    .pd-vacio { padding: 40px 10px; text-align: center; color: var(--text-muted); font-size: 14px; }

    .pd-pie { border-top: 1px solid var(--border); background: var(--surface); padding: 12px 22px; }
    .pd-pie-fila { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .pd-pie-nota { font-size: 13px; color: var(--text-muted); }
    .pd-pie-botones { display: flex; gap: 8px; margin-left: auto; }
    .pd-link { border: none; background: none; padding: 0; font: inherit; font-size: 14px; color: var(--warn-text); cursor: pointer; text-align: left; }
    .pd-link:hover { text-decoration: underline; }
    .pd-btn { border: 1.5px solid var(--border-strong); background: var(--surface); color: var(--text-2); border-radius: 10px; padding: 9px 18px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .pd-btn:hover:not(:disabled) { background: var(--surface3); }
    .pd-btn:disabled { opacity: .55; cursor: not-allowed; }
    .pd-btn-primario { background: var(--accent-brand); border-color: var(--accent-brand); color: #fff; }
    .pd-btn-primario:hover:not(:disabled) { background: var(--accent-brand-dark); }
    .pd-cambios { max-height: 190px; overflow-y: auto; margin-bottom: 10px; border: 1px solid var(--border); border-radius: 10px; }
    .pd-cambio { display: flex; justify-content: space-between; gap: 12px; padding: 7px 12px; font-size: 13.5px; border-bottom: 1px solid var(--border-soft); }
    .pd-cambio:last-child { border-bottom: none; }
    .pd-cambio-flujo { flex: none; color: var(--text-muted); }
    .pd-cambio-flujo s { opacity: .8; }
    .pd-cambio-flujo b { color: var(--text); }

    button:focus-visible, input:focus-visible { outline: 2px solid var(--accent-brand); outline-offset: 2px; }

    @media (max-width: 760px) {
      .pd-cuerpo { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
      .pd-modulos { flex-direction: row; overflow-x: auto; overflow-y: hidden; border-right: none; border-bottom: 1px solid var(--border); }
      .pd-modulo { width: auto; flex: none; white-space: nowrap; }
      .pd-head, .pd-resumen, .pd-pie, .pd-barra, .pd-lista { padding-left: 14px; padding-right: 14px; }
    }
  `],
})
export class PermisosDrawerComponent implements OnInit {
  @Input() modo: 'rol' | 'usuario' = 'usuario';
  @Input() rolFila: any = null;
  @Input() usuarioFila: any = null;

  @Output() cerrar = new EventEmitter<void>();
  /** Se emitió tras guardar o restablecer: el padre puede refrescar lo que dependa de los permisos. */
  @Output() guardado = new EventEmitter<void>();

  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly menu = signal(false);
  readonly verCambios = signal(false);
  private readonly sinRol = signal(false);

  readonly modulos = signal<ModuloUI[]>([]);
  readonly moduloActivo = signal('');
  readonly busqueda = signal('');
  readonly filtro = signal<Filtro>('todos');

  /** Servicios que el rol da (filas rol-wide). */
  private readonly delRol = signal<Set<string>>(new Set());
  /** Excepciones personales de la cuenta: servicioId → activo. */
  readonly excepciones = signal<Map<string, boolean>>(new Map());
  /** Solo las diferencias contra lo guardado. */
  private readonly draft = signal<Map<string, Decision>>(new Map());

  private static readonly PALETA_NIVEL = ['#8FBF77', '#4E9A4E', '#007832'];

  constructor(
    private admin: AdminService,
    private permisosSvc: PermisosGestionService,
    private toast: ToastService,
    private confirmSvc: ConfirmService,
    private auth: AuthService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all((['roles', 'servicios', 'usuarios'] as const).map(m => this.asegurar(m)));
    const modulos = construirModulos(this.admin.rawData()['servicios'] ?? []);
    this.modulos.set(modulos);
    this.moduloActivo.set(modulos[0]?.nombre ?? '');
    await this.cargarEstado();
    this.cargando.set(false);
  }

  private async asegurar(mod: 'roles' | 'servicios' | 'usuarios'): Promise<void> {
    if (!this.admin.rawData()[mod]?.length) await this.admin.cargar(mod);
  }

  // ── Identidad de lo que se edita ───────────────────────────────────────────

  private rolIdObjetivo(): string | undefined {
    if (this.modo === 'rol') return this.rolFila?.idRol;
    const roles: any[] = this.admin.rawData()['roles'] ?? [];
    // `rolId` viene de la credencial (fuente de verdad); el cargo de la persona solo es el último recurso.
    return this.usuarioFila?.rolId
      ?? this.usuarioFila?.rol?.idRol
      ?? roles.find(r => r.nombre === this.usuarioFila?.persona?.cargo)?.idRol;
  }

  private rolNombreObjetivo(): string {
    if (this.modo === 'rol') return this.rolFila?.nombre ?? '';
    const roles: any[] = this.admin.rawData()['roles'] ?? [];
    return this.usuarioFila?.rol?.nombre ?? roles.find(r => r.idRol === this.rolIdObjetivo())?.nombre ?? '';
  }

  readonly titulo = computed(() => {
    if (this.modo === 'rol') return `Rol «${this.rolFila?.nombre ?? ''}»`;
    const p = this.usuarioFila?.persona;
    return [p?.nombre ?? p?.nombreCompleto, p?.apellido].filter(Boolean).join(' ') || 'Cuenta sin nombre';
  });

  readonly subtitulo = computed(() => {
    if (this.modo === 'rol') return 'Lo que se marque aquí vale para todas las cuentas con este rol.';
    const partes = [
      this.usuarioFila?.login ? `Usuario ${this.usuarioFila.login}` : '',
      this.usuarioFila?.aplicativo?.nombre ? `Aplicativo ${this.usuarioFila.aplicativo.nombre}` : '',
      this.rolNombreObjetivo() ? `Rol ${this.rolNombreObjetivo()}` : 'Sin rol reconocido',
    ];
    return partes.filter(Boolean).join(' · ');
  });

  readonly iniciales = computed(() =>
    this.titulo().replace(/[«»]|^Rol /g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join(''),
  );

  readonly personasConRol = computed(() => {
    const idRol = this.rolFila?.idRol;
    return ((this.admin.rawData()['usuarios'] ?? []) as any[]).filter(u => (u.rolId ?? u.rol?.idRol) === idRol).length;
  });

  /** Texto si la pantalla debe quedar en solo lectura (y por qué); vacío si se puede editar. */
  readonly soloLectura = computed(() => {
    if (this.sinRol()) return 'Esta cuenta no tiene un rol reconocido, así que no hay qué heredar ni dónde guardar.';
    if (this.auth.isAdminErp()) return '';
    if (this.rolNombreObjetivo() === 'administrador_erp') return 'Solo un administrador ERP puede cambiar estos permisos.';
    const yo = this.auth.user()?.id;
    if (this.modo === 'usuario' && yo && yo === this.usuarioFila?.idUsuario) return 'No puedes cambiar tus propios permisos.';
    if (this.modo === 'rol' && this.auth.user()?.rolNombre === this.rolNombreObjetivo()) return 'No puedes cambiar los permisos de tu propio rol.';
    return '';
  });

  // ── Carga ──────────────────────────────────────────────────────────────────

  private async cargarEstado(): Promise<void> {
    const rolId = this.rolIdObjetivo();
    if (!rolId) { this.sinRol.set(true); return; }
    try {
      const [filasRol, filasUsuario] = await Promise.all([
        this.permisosSvc.porRol(rolId),
        this.modo === 'usuario' ? this.permisosSvc.porUsuario(this.usuarioFila.idUsuario) : Promise.resolve([]),
      ]);
      this.delRol.set(new Set(filasRol.filter(p => !p.usuarioId).map(p => p.servicioId)));
      // Si por algún dato viejo hubiera dos filas del mismo servicio, una apagada gana (denegar es lo conservador).
      const exc = new Map<string, boolean>();
      for (const p of filasUsuario) exc.set(p.servicioId, (exc.get(p.servicioId) ?? true) && p.activo !== false);
      this.excepciones.set(exc);
      this.draft.set(new Map());
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los permisos');
    }
  }

  // ── Estado de cada permiso (con el borrador aplicado) ──────────────────────

  readonly estados = computed(() => {
    const modoRol = this.modo === 'rol';
    const delRol = this.delRol();
    const exc = this.excepciones();
    const draft = this.draft();
    const out = new Map<string, EstadoServicio>();
    for (const m of this.modulos()) {
      for (const s of m.servicios) {
        const id = s.idServicio;
        const rolTiene = delRol.has(id);
        const efectivoGuardado = modoRol ? rolTiene : (exc.has(id) ? exc.get(id)! : rolTiene);
        const decisionGuardada = decisionPara(efectivoGuardado, rolTiene, modoRol);
        const decision = draft.get(id) ?? decisionGuardada;
        const efectivo = efectivoDe(decision, rolTiene, modoRol);
        out.set(id, {
          efectivo, delRol: rolTiene, decision, decisionGuardada, cambiado: draft.has(id),
          origen: modoRol ? (efectivo ? 'rol' : 'no') : origenDe(efectivo, rolTiene),
          origenAntes: modoRol ? (efectivoGuardado ? 'rol' : 'no') : origenDe(efectivoGuardado, rolTiene),
        });
      }
    }
    return out;
  });

  private static readonly SIN_ESTADO: EstadoServicio = {
    efectivo: false, delRol: false, origen: 'no', origenAntes: 'no', decision: 'heredar', decisionGuardada: 'heredar', cambiado: false,
  };

  est(idServicio: string): EstadoServicio {
    return this.estados().get(idServicio) ?? PermisosDrawerComponent.SIN_ESTADO;
  }

  private readonly activo = (idServicio: string): boolean => this.est(idServicio).efectivo;
  private readonly activoPorRol = (idServicio: string): boolean => this.est(idServicio).delRol;

  readonly resumen = computed(() => {
    let tiene = 0, delRol = 0, extras = 0, bloqueados = 0, total = 0;
    for (const e of this.estados().values()) {
      total++;
      if (e.efectivo) tiene++;
      if (e.origen === 'rol') delRol++;
      else if (e.origen === 'extra') extras++;
      else if (e.origen === 'bloqueado') bloqueados++;
    }
    return { tiene, delRol, extras, bloqueados, total };
  });

  readonly conteos = computed(() => {
    const est = this.estados();
    const out = new Map<string, { tiene: number; cambios: number }>();
    for (const m of this.modulos()) {
      let tiene = 0, cambios = 0;
      for (const s of m.servicios) {
        const e = est.get(s.idServicio);
        if (e?.efectivo) tiene++;
        if (e?.cambiado) cambios++;
      }
      out.set(m.nombre, { tiene, cambios });
    }
    return out;
  });

  // ── Lista visible ──────────────────────────────────────────────────────────

  readonly vista = computed(() => {
    const q = normalizar(this.busqueda().trim());
    const filtro = this.filtro();
    const est = this.estados();
    const modulos = q ? this.modulos() : this.modulos().filter(m => m.nombre === this.moduloActivo());
    return modulos
      .map(modulo => ({ modulo, recursos: modulo.recursos.filter(r => this.coincide(r, modulo, q, filtro, est)) }))
      .filter(g => g.recursos.length > 0);
  });

  private coincide(r: RecursoUI, m: ModuloUI, q: string, filtro: Filtro, est: Map<string, EstadoServicio>): boolean {
    const servicios = [...r.pasos.flatMap(p => p.servicios), ...r.extras.map(x => x.servicio)];
    if (q) {
      const texto = normalizar([m.etiqueta, r.label, ...servicios.map(s => fraseServicio(s.nombre))].join(' '));
      if (!texto.includes(q)) return false;
    }
    if (filtro === 'tiene') return servicios.some(s => est.get(s.idServicio)?.efectivo);
    if (filtro === 'distintos') return servicios.some(s => ['extra', 'bloqueado'].includes(est.get(s.idServicio)?.origen ?? ''));
    return true;
  }

  irAModulo(nombre: string): void {
    this.busqueda.set('');
    this.moduloActivo.set(nombre);
  }

  // ── Escalera ───────────────────────────────────────────────────────────────

  nivelActual(r: RecursoUI): number { return nivelDe(r, this.activo); }
  nivelRol(r: RecursoUI): number { return nivelDe(r, this.activoPorRol); }
  huecos(r: RecursoUI): boolean { return tieneHuecos(r, this.activo); }

  /** Pequeña marca «rol» en el peldaño que da el rol cuando la cuenta está en otro. */
  marcaRol(r: RecursoUI, nivel: number): boolean {
    return this.modo === 'usuario' && this.nivelRol(r) === nivel && this.nivelActual(r) !== nivel;
  }

  colorNivel(indice: number): string {
    return PermisosDrawerComponent.PALETA_NIVEL[Math.min(indice, PermisosDrawerComponent.PALETA_NIVEL.length - 1)];
  }

  titulosPaso(servicios: ServicioCat[]): string {
    return servicios.map(s => fraseServicio(s.nombre)).join(' + ');
  }

  textoRecurso(r: RecursoUI): string {
    const actual = this.nivelActual(r);
    if (this.modo === 'rol') return textoNivel(r, actual);
    const difiere = r.pasos.some(p => p.servicios.some(s => ['extra', 'bloqueado'].includes(this.est(s.idServicio).origen)));
    if (!difiere) return actual === 0 ? 'Sin acceso' : `${textoNivel(r, actual)} · igual que su rol`;
    return `Su rol: ${textoNivel(r, this.nivelRol(r))} · Aquí: ${textoNivel(r, actual)}`;
  }

  recursoCambiado(r: RecursoUI): boolean {
    return [...r.pasos.flatMap(p => p.servicios), ...r.extras.map(x => x.servicio)].some(s => this.est(s.idServicio).cambiado);
  }

  textoOrigen(origen: Origen): string {
    switch (origen) {
      case 'rol': return this.modo === 'rol' ? 'Lo tiene' : 'Del rol';
      case 'extra': return 'Extra personal';
      case 'bloqueado': return 'Bloqueado';
      default: return 'No lo tiene';
    }
  }

  // ── Edición del borrador ───────────────────────────────────────────────────

  /** Pide que cada servicio quede en el resultado `quiere`; el borrador solo conserva lo que difiere de lo guardado. */
  private pedir(pares: [string, boolean][]): void {
    if (this.soloLectura()) return;
    const estados = this.estados();
    const modoRol = this.modo === 'rol';
    this.draft.update(actual => {
      const next = new Map(actual);
      for (const [id, quiere] of pares) {
        const e = estados.get(id);
        if (!e) continue;
        const decision = decisionPara(quiere, e.delRol, modoRol);
        if (decision === e.decisionGuardada) next.delete(id);
        else next.set(id, decision);
      }
      return next;
    });
  }

  elegirNivel(r: RecursoUI, nivel: number): void {
    const pares: [string, boolean][] = [];
    r.pasos.forEach((paso, i) => paso.servicios.forEach(s => pares.push([s.idServicio, i < nivel])));
    this.pedir(pares);
  }

  alternar(servicio: ServicioCat): void {
    this.pedir([[servicio.idServicio, !this.est(servicio.idServicio).efectivo]]);
  }

  marcarModulo(m: ModuloUI, quiere: boolean): void {
    this.pedir(m.servicios.map(s => [s.idServicio, quiere]));
  }

  async accesoTotal(): Promise<void> {
    this.menu.set(false);
    const total = this.resumen().total;
    const ok = await this.confirmSvc.ask(
      `Se van a marcar los ${total} permisos del sistema para ${this.titulo()}, sin importar su rol. `
      + 'Aún no se guarda: podrás revisar la lista de cambios y descartarla.',
      { header: 'Dar acceso total', acceptLabel: 'Marcar todo', danger: true },
    );
    if (!ok) return;
    this.pedir(this.modulos().flatMap(m => m.servicios.map((s): [string, boolean] => [s.idServicio, true])));
  }

  // ── Cambios, guardar y salir ───────────────────────────────────────────────

  readonly cambios = computed(() => {
    const est = this.estados();
    const out: { id: string; label: string; antes: string; despues: string }[] = [];
    for (const m of this.modulos()) {
      for (const s of m.servicios) {
        const e = est.get(s.idServicio);
        if (!e?.cambiado) continue;
        out.push({ id: s.idServicio, label: fraseServicio(s.nombre), antes: this.textoOrigen(e.origenAntes), despues: this.textoOrigen(e.origen) });
      }
    }
    return out;
  });

  descartar(): void {
    this.draft.set(new Map());
    this.verCambios.set(false);
  }

  async guardar(): Promise<void> {
    const rolId = this.rolIdObjetivo();
    const cambios = [...this.draft()].map(([servicioId, estado]) => ({ servicioId, estado }));
    if (!rolId || !cambios.length || this.soloLectura() || this.guardando()) return;

    if (this.modo === 'rol') {
      const quita = cambios.filter(c => c.estado === 'heredar').length;
      const da = cambios.length - quita;
      const ok = await this.confirmSvc.ask(
        `Estos cambios valen para las ${this.personasConRol()} personas con el rol «${this.rolFila?.nombre}»: `
        + `se darán ${da} permisos y se quitarán ${quita}.`,
        { header: 'Guardar permisos del rol', acceptLabel: 'Guardar', danger: quita > 0 },
      );
      if (!ok) return;
    }

    this.guardando.set(true);
    try {
      await this.permisosSvc.aplicarCambios(rolId, cambios, this.modo === 'usuario' ? this.usuarioFila.idUsuario : undefined);
      await this.cargarEstado();
      this.verCambios.set(false);
      this.toast.ok('Cambios guardados', `${cambios.length} permiso(s) actualizados.`);
      this.guardado.emit();
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron guardar los cambios. No se aplicó ninguno.');
    } finally {
      this.guardando.set(false);
    }
  }

  async restablecer(): Promise<void> {
    this.menu.set(false);
    const n = this.excepciones().size;
    const pendientes = this.draft().size;
    const ok = await this.confirmSvc.ask(
      `Se borran las ${n} excepciones personales de ${this.titulo()}: vuelve a tener exactamente lo que da su rol `
      + '(si es encargado de bodega o líder de área, conserva esos permisos).'
      + (pendientes ? ` Los ${pendientes} cambios sin guardar también se descartan.` : ''),
      { header: 'Restablecer al rol', acceptLabel: 'Sí, restablecer', danger: true },
    );
    if (!ok) return;
    this.guardando.set(true);
    try {
      const r = await this.permisosSvc.restablecerUsuario(this.usuarioFila.idUsuario);
      await this.cargarEstado();
      this.toast.ok('Permisos restablecidos', `${r.eliminados} excepción(es) eliminada(s).`);
      this.guardado.emit();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo restablecer');
    } finally {
      this.guardando.set(false);
    }
  }

  async intentarCerrar(): Promise<void> {
    const n = this.draft().size;
    if (n > 0) {
      const salir = await this.confirmSvc.ask(
        `Tienes ${n} ${n === 1 ? 'cambio' : 'cambios'} sin guardar. Si sales ahora se pierden.`,
        { header: 'Cambios sin guardar', acceptLabel: 'Salir sin guardar', rejectLabel: 'Seguir editando', danger: true },
      );
      if (!salir) return;
    }
    this.cerrar.emit();
  }
}
