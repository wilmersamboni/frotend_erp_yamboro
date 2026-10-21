import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { AdminService } from '../services/admin.service';
import { PermisosGestionService } from '../../../core/services/permisos-gestion.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import {
  Decision, ModuloUI, Origen, PasoEscalera, RecursoUI, ServicioCat,
  aplicaAlRol, construirModulos, decisionPara, efectivoDe, fraseServicio, nivelDe, normalizar, origenDe, textoNivel, tieneHuecos,
} from './permisos-catalogo';

type Filtro = 'todos' | 'tiene' | 'distintos';

/** Todo lo que el panel necesita saber de un servicio para una cuenta (o rol), ya con el borrador aplicado. */
interface EstadoServicio {
  efectivo: boolean;
  /** Lo que el rol le da DE VERDAD a esta cuenta (descontando los módulos de otro aplicativo). */
  delRol: boolean;
  /** El rol lo guarda, pero es de un módulo de otro aplicativo: no vale para esta cuenta. */
  otroAplicativo: boolean;
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
                    <span>Borra sus {{ excepciones().size }} excepciones.</span>
                  </button>
                  <button type="button" role="menuitem" class="pd-menu-peligro" [disabled]="guardando()" (click)="accesoTotal()">
                    <strong>Dar acceso total…</strong>
                    <span>Marca todo; se aplica al guardar.</span>
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

          <!-- ── Resumen: una línea; las etiquetas solo aparecen si hay algo que avisar ── -->
          <div class="pd-resumen">
            <span><b>{{ resumen().tiene }}</b> de {{ resumen().total }} permisos activos</span>
            @if (modo === 'usuario') {
              @if (resumen().extras > 0) { <span class="pd-tag pd-tag-extra">{{ resumen().extras }} {{ resumen().extras === 1 ? 'extra' : 'extras' }}</span> }
              @if (resumen().bloqueados > 0) { <span class="pd-tag pd-tag-bloq">{{ resumen().bloqueados }} {{ resumen().bloqueados === 1 ? 'bloqueado' : 'bloqueados' }}</span> }
            } @else {
              <span class="pd-sep">·</span>
              <span>afecta a {{ personasConRol() }} {{ personasConRol() === 1 ? 'persona' : 'personas' }}</span>
            }
          </div>

          @if (soloLectura()) {
            <div class="pd-aviso" role="status">{{ soloLectura() }}</div>
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
                  <input type="search" data-no-dirty placeholder="Buscar un permiso"
                    [value]="busqueda()" (input)="busqueda.set($any($event.target).value)" />
                </label>
                <div class="pd-filtros" role="group" aria-label="Filtrar">
                  <button type="button" [class.activo]="filtro() === 'todos'" (click)="filtro.set('todos')">Todos</button>
                  <button type="button" [class.activo]="filtro() === 'tiene'" (click)="filtro.set('tiene')">Activos</button>
                  @if (modo === 'usuario') {
                    <button type="button" [class.activo]="filtro() === 'distintos'" (click)="filtro.set('distintos')">Distintos al rol</button>
                  }
                </div>
              </div>

              <div class="pd-lista">
                @if (vista().length) {
                  <!-- Encabezado fijo: las mismas tres columnas en todas las filas. -->
                  <div class="pd-cabecera" aria-hidden="true">
                    <div class="pd-cols">
                      @for (h of COLUMNAS; track h.texto) { <span class="pd-cab" [title]="h.ayuda">{{ h.texto }}</span> }
                    </div>
                  </div>
                }

                @for (grupo of vista(); track grupo.modulo.nombre) {
                  <div class="pd-grupo">
                    <div class="pd-grupo-cab">
                      <h3>{{ grupo.modulo.etiqueta }}</h3>
                      @if (!soloLectura()) {
                        <div class="pd-grupo-acc">
                          <button type="button" (click)="marcarModulo(grupo.modulo, true)">Marcar todo</button>
                          <span aria-hidden="true">·</span>
                          <button type="button" (click)="marcarModulo(grupo.modulo, false)">Quitar todo</button>
                        </div>
                      }
                    </div>

                    @if (modo === 'usuario' && modulosAjenos().has(grupo.modulo.nombre)) {
                      <p class="pd-ajeno">
                        Esta cuenta es del aplicativo «{{ aplicativoNombre() }}»: los permisos de este módulo no vienen con su rol.
                        Marca solo los que quieras darle.
                      </p>
                    }

                    @for (r of grupo.recursos; track r.recurso) {
                      <div class="pd-fila" [class.cambiada]="recursoCambiado(r)">
                        <div class="pd-fila-sup">
                          <div class="pd-fila-nombre">
                            <strong>{{ r.label }}</strong>
                            @if (notaRol(r)) { <small class="pd-nota">{{ notaRol(r) }}</small> }
                          </div>

                          @if (r.pasos.length) {
                            <div class="pd-cols" role="group" [attr.aria-label]="'Nivel de acceso a ' + r.label">
                              @for (c of celdas(r); track c.col) {
                                @if (c.paso) {
                                  <button type="button" role="checkbox" class="pd-check" [class.on]="nivelActual(r) >= c.nivel"
                                    [attr.aria-checked]="nivelActual(r) >= c.nivel" [disabled]="!!soloLectura()"
                                    [attr.aria-label]="c.paso.label + ' · ' + r.label" [title]="tituloNivel(r, c.nivel)"
                                    (click)="alternarColumna(r, c.nivel)">
                                    <span class="pd-caja">
                                      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                    </span>
                                    @if (c.especial) { <span class="pd-cel-txt">{{ c.paso.label }}</span> }
                                  </button>
                                } @else {
                                  <span class="pd-check pd-check-vacia" aria-hidden="true"></span>
                                }
                              }
                            </div>
                          }
                        </div>

                        @if (huecos(r)) {
                          <p class="pd-hueco">Tiene permisos sueltos que no siguen el orden (por ejemplo, puede eliminar pero no ver). Marca una casilla para ordenarlo.</p>
                        }

                        @if (r.extras.length) {
                          <ul class="pd-extras">
                            @for (ex of r.extras; track ex.servicio.idServicio) {
                              <li>
                                <button type="button" role="checkbox" class="pd-check pd-check-linea" [class.on]="est(ex.servicio.idServicio).efectivo"
                                  [attr.aria-checked]="est(ex.servicio.idServicio).efectivo" [disabled]="!!soloLectura()"
                                  (click)="alternar(ex.servicio)">
                                  <span class="pd-caja">
                                    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                  </span>
                                  <span class="pd-extra-txt">{{ ex.label }}</span>
                                </button>
                                @if (modo === 'usuario' && est(ex.servicio.idServicio).origen === 'extra') { <span class="pd-tag pd-tag-extra">Extra</span> }
                                @if (modo === 'usuario' && est(ex.servicio.idServicio).origen === 'bloqueado') { <span class="pd-tag pd-tag-bloq">Bloqueado</span> }
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
                      <span>{{ c.label }}</span>
                      <span class="pd-cambio-flujo"><s>{{ c.antes }}</s> → <b>{{ c.despues }}</b></span>
                    </div>
                  }
                </div>
              }
              <div class="pd-pie-fila">
                <button type="button" class="pd-link" [attr.aria-expanded]="verCambios()" (click)="verCambios.set(!verCambios())">
                  <b>{{ cambios().length }}</b> {{ cambios().length === 1 ? 'cambio sin guardar' : 'cambios sin guardar' }}
                  · {{ verCambios() ? 'ocultar' : 'ver' }}
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
                <span class="pd-pie-nota">Sin cambios pendientes</span>
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
    .pd-fondo { position: fixed; inset: 0; z-index: 1090; display: flex; justify-content: flex-end; background: rgba(0,0,0,.45); }
    .pd-panel {
      position: relative; display: flex; flex-direction: column; width: min(980px, 100vw); height: 100%;
      background: var(--surface); color: var(--text); box-shadow: -12px 0 40px rgba(0,0,0,.18);
    }

    /* Encabezado */
    .pd-head { display: flex; align-items: center; gap: 14px; padding: 18px 24px; border-bottom: 1px solid var(--border); }
    .pd-avatar {
      flex: none; width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center;
      background: var(--accent-soft); color: var(--accent-text); font-weight: 800; font-size: 15px;
    }
    .pd-head-texto { flex: 1; min-width: 0; }
    .pd-head-texto h2 { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
    .pd-head-texto p { margin: 2px 0 0; font-size: 13px; color: var(--text-muted); overflow-wrap: anywhere; }
    .pd-icono {
      flex: none; width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface);
      color: var(--text-2); display: grid; place-items: center; cursor: pointer;
    }
    .pd-icono:hover { background: var(--surface3); }
    .pd-menu-caja { position: relative; }
    .pd-menu {
      position: absolute; right: 0; top: 42px; z-index: 5; width: 250px; padding: 6px; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border-strong); box-shadow: 0 12px 30px rgba(0,0,0,.16);
    }
    .pd-menu button { display: block; width: 100%; text-align: left; padding: 9px 10px; border: none; background: none; border-radius: 8px; cursor: pointer; font-family: inherit; color: var(--text); }
    .pd-menu button:hover:not(:disabled) { background: var(--surface3); }
    .pd-menu button:disabled { opacity: .45; cursor: not-allowed; }
    .pd-menu strong { display: block; font-size: 14px; font-weight: 600; }
    .pd-menu span { display: block; margin-top: 1px; font-size: 12.5px; color: var(--text-muted); }
    .pd-menu-peligro strong { color: var(--err-text); }

    .pd-carga { padding: 24px; }

    /* Resumen y etiquetas: todo gris salvo lo excepcional */
    .pd-resumen { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 24px; border-bottom: 1px solid var(--border); font-size: 13.5px; color: var(--text-muted); }
    .pd-resumen b { color: var(--text); font-weight: 700; }
    .pd-sep { color: var(--border-strong); }
    .pd-tag { font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 999px; }
    .pd-tag-extra { background: var(--accent-soft); color: var(--accent-text); }
    .pd-tag-bloq { background: var(--err-bg); color: var(--err-text); }
    .pd-aviso { margin: 12px 24px 0; padding: 9px 14px; border-radius: 10px; font-size: 13.5px; background: var(--surface2); color: var(--text-2); border: 1px solid var(--border); }

    /* Cuerpo */
    /* La fila del grid debe poder encogerse (minmax(0,1fr)); sin esto la lista se desborda sobre la barra de guardado. */
    .pd-cuerpo { flex: 1; min-height: 0; display: grid; grid-template-columns: 210px 1fr; grid-template-rows: minmax(0, 1fr); overflow: hidden; }
    .pd-modulos { overflow-y: auto; padding: 12px 10px; border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 1px; }
    .pd-modulo {
      display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; text-align: left; padding: 8px 12px;
      border: none; background: none; border-radius: 8px; cursor: pointer; font-family: inherit; color: var(--text-2); font-size: 14px;
    }
    .pd-modulo:hover { background: var(--surface2); }
    .pd-modulo.activo { background: var(--surface3); color: var(--text); font-weight: 700; }
    .pd-modulo-cuenta { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-faint); font-variant-numeric: tabular-nums; }
    .pd-punto { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-brand); display: inline-block; }

    .pd-principal { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
    .pd-barra { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 12px 24px 6px; }
    .pd-buscar {
      flex: 1 1 220px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--border-strong);
      border-radius: 10px; background: var(--surface); color: var(--text-faint);
    }
    .pd-buscar:focus-within { border-color: var(--accent-brand); }
    .pd-buscar input { flex: 1; min-width: 0; border: none; outline: none; background: none; padding: 9px 0; font: inherit; font-size: 14px; color: var(--text); }
    .pd-filtros { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface3); }
    .pd-filtros button { border: none; background: none; padding: 6px 12px; border-radius: 8px; font: inherit; font-size: 13px; color: var(--text-muted); cursor: pointer; white-space: nowrap; }
    .pd-filtros button.activo { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.08); }

    /* Lista */
    .pd-lista { flex: 1; min-height: 0; overflow-y: auto; padding: 0 24px 18px; }
    .pd-cols { display: grid; grid-template-columns: repeat(3, var(--pd-col, 92px)); flex: none; }
    .pd-cabecera { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; padding: 8px 0 6px; background: var(--surface); border-bottom: 1px solid var(--border); }
    .pd-cab { text-align: center; font-size: 12.5px; font-weight: 600; color: var(--text-muted); cursor: help; }

    .pd-grupo-cab { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 20px 0 6px; }
    .pd-grupo-cab h3 { margin: 0; font-size: 15px; font-weight: 700; }
    .pd-grupo-acc { display: flex; gap: 6px; color: var(--text-faint); font-size: 13px; }
    .pd-grupo-acc button { border: none; background: none; padding: 0; font: inherit; font-size: 13px; color: var(--text-muted); cursor: pointer; }
    .pd-grupo-acc button:hover { color: var(--accent-text); text-decoration: underline; }

    .pd-ajeno { margin: 0 0 6px; padding: 8px 12px; border-radius: 8px; background: var(--surface2); color: var(--text-muted); font-size: 13px; }

    .pd-fila { padding: 11px 0; border-top: 1px solid var(--border-soft); }
    .pd-fila.cambiada { box-shadow: inset 3px 0 0 var(--accent-brand); padding-left: 12px; margin-left: -12px; }
    .pd-fila-sup { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    .pd-fila-nombre { min-width: 0; flex: 1; }
    .pd-fila-nombre strong { font-size: 14.5px; font-weight: 600; }
    .pd-nota { display: block; margin-top: 1px; font-size: 12.5px; color: var(--text-muted); }
    .pd-hueco { margin: 6px 0 0; font-size: 12.5px; color: var(--warn-text); }

    /* Casillas: el clásico de las tablas de permisos. Marcar un nivel marca también los de abajo. */
    .pd-check {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-height: 38px;
      border: none; background: none; padding: 0; font: inherit; cursor: pointer; color: var(--text-muted);
    }
    .pd-check:disabled { cursor: not-allowed; opacity: .55; }
    .pd-caja {
      width: 20px; height: 20px; border-radius: 6px; box-sizing: border-box; display: grid; place-items: center;
      border: 1.5px solid var(--border-strong); background: var(--surface); color: #fff; transition: background .1s, border-color .1s;
    }
    .pd-caja svg { opacity: 0; }
    .pd-check:hover:not(:disabled) .pd-caja { border-color: var(--accent-brand); }
    .pd-check.on .pd-caja { background: var(--accent-brand); border-color: var(--accent-brand); }
    .pd-check.on .pd-caja svg { opacity: 1; }
    .pd-check-vacia { cursor: default; }
    .pd-cel-txt { font-size: 11px; line-height: 1.1; color: var(--text-faint); text-align: center; }

    .pd-extras { list-style: none; margin: 4px 0 0; padding: 0; }
    .pd-extras li { display: flex; align-items: center; gap: 8px; }
    .pd-check-linea { flex-direction: row; justify-content: flex-start; gap: 10px; min-height: 32px; color: var(--text-2); text-align: left; }
    .pd-extra-txt { font-size: 13.5px; }

    .pd-vacio { padding: 40px 10px; text-align: center; color: var(--text-muted); font-size: 14px; }

    /* Pie */
    .pd-pie { border-top: 1px solid var(--border); background: var(--surface); padding: 12px 24px; }
    .pd-pie-fila { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .pd-pie-nota { font-size: 13px; color: var(--text-faint); }
    .pd-pie-botones { display: flex; gap: 8px; margin-left: auto; }
    .pd-link { border: none; background: none; padding: 0; font: inherit; font-size: 14px; color: var(--text-2); cursor: pointer; text-align: left; }
    .pd-link:hover { text-decoration: underline; }
    .pd-btn { border: 1px solid var(--border-strong); background: var(--surface); color: var(--text-2); border-radius: 10px; padding: 9px 18px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .pd-btn:hover:not(:disabled) { background: var(--surface3); }
    .pd-btn:disabled { opacity: .55; cursor: not-allowed; }
    .pd-btn-primario { background: var(--accent-brand); border-color: var(--accent-brand); color: #fff; }
    .pd-btn-primario:hover:not(:disabled) { background: var(--accent-brand-dark); }
    .pd-cambios { max-height: 180px; overflow-y: auto; margin-bottom: 10px; border: 1px solid var(--border); border-radius: 10px; }
    .pd-cambio { display: flex; justify-content: space-between; gap: 12px; padding: 7px 12px; font-size: 13.5px; border-bottom: 1px solid var(--border-soft); }
    .pd-cambio:last-child { border-bottom: none; }
    .pd-cambio-flujo { flex: none; color: var(--text-muted); }
    .pd-cambio-flujo s { opacity: .75; }
    .pd-cambio-flujo b { color: var(--text); font-weight: 600; }

    button:focus-visible, input:focus-visible { outline: 2px solid var(--accent-brand); outline-offset: 2px; }

    @media (max-width: 760px) {
      .pd-cuerpo { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
      .pd-modulos { flex-direction: row; overflow-x: auto; overflow-y: hidden; border-right: none; border-bottom: 1px solid var(--border); }
      .pd-modulo { width: auto; flex: none; white-space: nowrap; }
      .pd-head, .pd-resumen, .pd-pie, .pd-barra, .pd-lista { padding-left: 14px; padding-right: 14px; }
      .pd-cols { --pd-col: 64px; }
      .pd-cab { font-size: 11.5px; }
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
  /** servicioId → aplicativo del módulo al que pertenece. */
  private readonly aplicativoPorServicio = new Map<string, string | null>();
  /** Excepciones personales de la cuenta: servicioId → activo. */
  readonly excepciones = signal<Map<string, boolean>>(new Map());
  /** Solo las diferencias contra lo guardado. */
  private readonly draft = signal<Map<string, Decision>>(new Map());

  /** Columnas de la matriz: marcar una casilla marca también las de su izquierda. */
  readonly COLUMNAS = [
    { texto: 'Ver', ayuda: 'Solo consultar. No cambia nada.' },
    { texto: 'Modificar', ayuda: 'Ver y además crear o editar.' },
    { texto: 'Eliminar', ayuda: 'Todo lo anterior y además eliminar (o administrar).' },
  ];

  constructor(
    private admin: AdminService,
    private permisosSvc: PermisosGestionService,
    private toast: ToastService,
    private confirmSvc: ConfirmService,
    private auth: AuthService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all((['roles', 'servicios', 'usuarios'] as const).map(m => this.asegurar(m)));
    const servicios: any[] = this.admin.rawData()['servicios'] ?? [];
    for (const s of servicios) {
      this.aplicativoPorServicio.set(s.idServicio, s.modulo?.aplicativoId ?? s.modulo?.aplicativo?.idAplicativo ?? null);
    }
    const modulos = construirModulos(servicios);
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

  /** Aplicativo al que pertenece la cuenta (de él depende qué módulos le valen por su rol). */
  private aplicativoCuenta(): string | null {
    return this.usuarioFila?.aplicativoId ?? this.usuarioFila?.aplicativo?.idAplicativo ?? null;
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
    const rolNombre = this.rolNombreObjetivo();
    const aplicativoCuenta = this.aplicativoCuenta();
    const out = new Map<string, EstadoServicio>();
    for (const m of this.modulos()) {
      for (const s of m.servicios) {
        const id = s.idServicio;
        // El rol guarda permisos de todos los módulos; a una cuenta solo le valen los de su aplicativo.
        const rolGuarda = delRol.has(id);
        const aplica = modoRol || aplicaAlRol(rolNombre, s.nombre, this.aplicativoPorServicio.get(id), aplicativoCuenta);
        const rolTiene = rolGuarda && aplica;
        const efectivoGuardado = modoRol ? rolTiene : (exc.has(id) ? exc.get(id)! : rolTiene);
        const decisionGuardada = decisionPara(efectivoGuardado, rolTiene, modoRol);
        const decision = draft.get(id) ?? decisionGuardada;
        const efectivo = efectivoDe(decision, rolTiene, modoRol);
        out.set(id, {
          efectivo, delRol: rolTiene, otroAplicativo: rolGuarda && !aplica, decision, decisionGuardada, cambiado: draft.has(id),
          origen: modoRol ? (efectivo ? 'rol' : 'no') : origenDe(efectivo, rolTiene),
          origenAntes: modoRol ? (efectivoGuardado ? 'rol' : 'no') : origenDe(efectivoGuardado, rolTiene),
        });
      }
    }
    return out;
  });

  private static readonly SIN_ESTADO: EstadoServicio = {
    efectivo: false, delRol: false, otroAplicativo: false, origen: 'no', origenAntes: 'no', decision: 'heredar', decisionGuardada: 'heredar', cambiado: false,
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

  /** Módulos con permisos que el rol guarda pero que no valen para esta cuenta por ser de otro aplicativo. */
  readonly modulosAjenos = computed(() => {
    const est = this.estados();
    return new Set(this.modulos().filter(m => m.servicios.some(s => est.get(s.idServicio)?.otroAplicativo)).map(m => m.nombre));
  });

  readonly aplicativoNombre = computed(() => this.usuarioFila?.aplicativo?.nombre ?? 'de la cuenta');

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

  /** Qué nivel de cada recurso va en cada una de las tres columnas (Ver, Modificar, Control total); `paso` es null si no existe. */
  private readonly celdasPorRecurso = computed(() => {
    const out = new Map<string, { col: number; nivel: number; paso: PasoEscalera | null; especial: boolean }[]>();
    for (const m of this.modulos()) {
      for (const r of m.recursos) {
        out.set(r.recurso, [0, 1, 2].map(col => {
          const i = r.pasos.findIndex(p => p.posicion === col);
          const paso = i === -1 ? null : r.pasos[i];
          return { col, nivel: i + 1, paso, especial: !!paso?.especial };
        }));
      }
    }
    return out;
  });

  celdas(r: RecursoUI) {
    return this.celdasPorRecurso().get(r.recurso) ?? [];
  }

  /** Lo que significa elegir ese nivel, en una frase: «Ver, editar y eliminar · Catálogo de productos». */
  tituloNivel(r: RecursoUI, nivel: number): string {
    return `${textoNivel(r, nivel)} · ${r.label}`;
  }

  /** Solo en una cuenta cuyo acceso difiere del que da su rol: «Su rol: ver y modificar». Si es igual, no se dice nada. */
  notaRol(r: RecursoUI): string {
    if (this.modo !== 'usuario' || !r.pasos.length) return '';
    const difiere = r.pasos.some(p => p.servicios.some(s => ['extra', 'bloqueado'].includes(this.est(s.idServicio).origen)));
    return difiere ? `Su rol: ${textoNivel(r, this.nivelRol(r)).toLowerCase()}` : '';
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

  /** Marcar una casilla da ese nivel (y los de abajo); desmarcarla lo quita (y los de arriba). */
  alternarColumna(r: RecursoUI, nivel: number): void {
    this.elegirNivel(r, this.nivelActual(r) >= nivel ? nivel - 1 : nivel);
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
