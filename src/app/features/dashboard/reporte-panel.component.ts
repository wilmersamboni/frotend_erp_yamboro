import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { UIChart } from 'primeng/chart';
import { LucideAngularModule, ArrowLeft, Printer, CircleCheck, Lightbulb } from 'lucide-angular';
import { StatsService, Stats, categorizarEstado } from '../../core/services/stats.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ExportService, ResumenPanel } from '../../core/services/export.service';
import { cargarPracticasPanel } from './panel-datos';

const COLOR = { activa: '#2563eb', certificada: '#16a34a', desertada: '#dc2626', enRiesgo: '#d97706', otros: '#9ca3af' };
const VERDE = '#1f5f0c';

/** Un tramo del resumen ejecutivo: texto normal o cifra resaltada. */
type Tramo = { t: string; b?: boolean };

/**
 * Reporte del panel de inicio para imprimir o guardar como PDF (2026-10-06).
 * Diseñado en HTML + Tailwind con criterio de informe de gestión (franja de
 * encabezado, resumen ejecutivo redactado, cifras con mini barras,
 * distribución en barra 100 %, hallazgos, secciones numeradas y notas
 * metodológicas) y se imprime con el navegador ("Guardar como PDF"): texto
 * real y nítido. Ruta propia fuera del layout (`/reporte-panel`). Con
 * `?imprimir=1` abre el cuadro de impresión solo, cuando ya cargó todo.
 * Cifras: `ExportService.resumenPanel` (las mismas del Excel); la
 * distribución va sobre las ETAPAS, no sobre todos los aprendices del centro.
 */
@Component({
  selector: 'app-reporte-panel',
  standalone: true,
  imports: [DecimalPipe, UIChart, LucideAngularModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="rp-barra">
      <button type="button" (click)="volver()" class="rp-btn rp-btn-sec">
        <lucide-icon [img]="icVolver" [size]="16"></lucide-icon> Volver al panel
      </button>
      <span class="rp-barra-txt">Vista previa · hoja carta · {{ paginasTexto }}</span>
      <button type="button" (click)="imprimir()" [disabled]="cargando()" class="rp-btn rp-btn-pri">
        <lucide-icon [img]="icImprimir" [size]="16"></lucide-icon> Imprimir o guardar PDF
      </button>
    </div>

    <div class="rp-fondo">
      @if (cargando()) {
        <div class="rp-hoja rp-cargando">Preparando el reporte…</div>
      } @else if (r(); as r) {
        <article class="rp-hoja">

          <!-- ══ Encabezado ══ -->
          <header class="rp-banda">
            <div class="rp-banda-logo"><img src="/img/logo.png" alt=""></div>
            <div class="rp-banda-titulo">
              <p class="rp-sobre">Reporte estadístico · Etapa productiva</p>
              <h1>Panel de Control</h1>
              <p class="rp-banda-sub">Estado de la etapa productiva de los aprendices</p>
            </div>
            <dl class="rp-banda-meta">
              <div><dt>Centro</dt><dd>{{ centro }}</dd></div>
              <div><dt>Fecha de corte</dt><dd>{{ fechaCorta }}</dd></div>
              <div><dt>Generado por</dt><dd>{{ autor }}</dd></div>
            </dl>
          </header>

          <!-- ══ Resumen ejecutivo ══ -->
          <section class="rp-resumen">
            <p class="rp-etiqueta">Resumen ejecutivo</p>
            <!-- En una sola línea y sin espacios: si no, Angular mete un espacio antes de cada coma. -->
            <p class="rp-lead">@for (x of resumen(); track $index) {@if (x.b) {<strong>{{ x.t }}</strong>} @else {{{ x.t }}}}</p>
          </section>

          <!-- ══ Cifras ══ -->
          <section class="rp-cifras">
            @for (k of cifras(); track k.etq) {
              <div class="rp-cifra">
                <p class="rp-cifra-etq"><span [style.background]="k.color"></span>{{ k.etq }}</p>
                <p class="rp-cifra-num" [style.color]="k.colorValor || null">{{ k.valor }}</p>
                <div class="rp-mini"><span [style.width.%]="k.barra" [style.background]="k.color"></span></div>
                <p class="rp-cifra-det">{{ k.det }}</p>
              </div>
            }
          </section>

          <!-- ══ Distribución ══ -->
          <section class="rp-bloque rp-junto">
            <div class="rp-bloque-cab">
              <p class="rp-etiqueta">Distribución de las etapas por estado</p>
              <p class="rp-bloque-total">{{ etapas() | number }} {{ etapas() === 1 ? 'etapa' : 'etapas' }}</p>
            </div>
            <div class="rp-barra100">
              @for (d of distribucion(); track d.etq) {
                @if (d.n) { <span [style.width.%]="d.pctExacto" [style.background]="d.color">@if (d.pctExacto >= 9) { {{ d.pct }}% }</span> }
              }
              @if (!etapas()) { <span class="rp-barra100-vacia">Sin etapas registradas</span> }
            </div>
            <div class="rp-leyenda">
              @for (d of distribucion(); track d.etq) {
                <div class="rp-leyenda-item" [class.rp-tenue]="!d.n">
                  <span class="rp-punto" [style.background]="d.color"></span>
                  <span class="rp-leyenda-etq">{{ d.etq }}</span>
                  <span class="rp-leyenda-n">{{ d.n | number }}</span>
                  <span class="rp-leyenda-pct">{{ d.pct }}%</span>
                </div>
              }
            </div>
          </section>

          <!-- ══ Hallazgos ══ -->
          <section class="rp-bloque rp-junto">
            <p class="rp-etiqueta">Hallazgos</p>
            @if (sinHallazgos()) {
              <div class="rp-nota-suave">
                <lucide-icon [img]="icIdea" [size]="16"></lucide-icon>
                Todavía no hay suficientes datos para destacar tendencias. Los hallazgos aparecen cuando hay casos resueltos, deserciones o etapas por vencer.
              </div>
            } @else {
              <div class="rp-hallazgos">
                @for (h of r.hallazgos; track $index; let n = $index) {
                  <div class="rp-hallazgo">
                    <span class="rp-hallazgo-n">{{ n + 1 }}</span>
                    <p>@if (h.fuerte) { <strong>{{ h.fuerte }}</strong> } {{ h.texto }}</p>
                  </div>
                }
              </div>
            }
          </section>

          <!-- ══ 01 Requieren atención ══ -->
          <section class="rp-seccion">
            <div class="rp-seccion-cab">
              <span class="rp-seccion-num">01</span>
              <div>
                <h2>Requieren atención</h2>
                <p>Prácticas que conviene revisar ya: en riesgo, vencidas sin certificar o por terminar con poco avance.</p>
              </div>
              <span class="rp-seccion-cuenta" [class.rp-alerta]="r.atencion.length">{{ r.atencion.length }}</span>
            </div>
            @if (r.atencion.length) {
              <table class="rp-tabla">
                <thead><tr><th class="w-[68px]">Prioridad</th><th>Aprendiz</th><th>Programa · ficha</th><th>Motivo</th><th class="w-[52px] text-right">Avance</th></tr></thead>
                <tbody>
                  @for (a of r.atencion; track $index) {
                    <tr>
                      <td><span class="rp-pildora" [class.rp-pildora-roja]="a.prioridad === 'Alta'" [class.rp-pildora-ambar]="a.prioridad !== 'Alta'">{{ a.prioridad }}</span></td>
                      <td><b>{{ a.nombre }}</b><span class="rp-sub">C.C. {{ a.identificacion }}</span></td>
                      <td>{{ a.programa }}<span class="rp-sub">Ficha {{ a.ficha }}</span></td>
                      <td>{{ a.motivo }}</td>
                      <td class="text-right tabular-nums">{{ a.avance === null ? '—' : a.avance + '%' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <div class="rp-todo-bien">
                <lucide-icon [img]="icOk" [size]="18"></lucide-icon>
                <div><b>Todo en orden.</b> Ninguna práctica está en riesgo, vencida o por terminar con poco avance.</div>
              </div>
            }
          </section>

          <!-- ══ 02 Ritmo ══ -->
          <section class="rp-seccion rp-junto">
            <div class="rp-seccion-cab">
              <span class="rp-seccion-num">02</span>
              <div>
                <h2>Ritmo de la etapa productiva</h2>
                <p>Etapas que inician y que deberían cerrar (según su fecha de fin) cada mes: seis meses atrás y cinco adelante.</p>
              </div>
            </div>
            <div class="rp-ritmo-resumen">
              <span><i style="background: #7bc96f"></i>Inicios en los últimos 6 meses <b>{{ ritmoTotales().inicios }}</b></span>
              <span><i style="background: #94a3b8"></i>Cierres previstos en los próximos 6 meses <b>{{ ritmoTotales().cierres }}</b></span>
            </div>
            <div class="rp-grafica">
              <p-chart type="bar" [data]="ritmo()" [options]="opcionesRitmo" width="710px" height="180px"/>
            </div>
          </section>

          <!-- ══ 03 Por programa ══ -->
          <section class="rp-seccion">
            <div class="rp-seccion-cab">
              <span class="rp-seccion-num">03</span>
              <div>
                <h2>Resultados por programa</h2>
                <p>Cuántos aprendices de cada programa están en etapa productiva y cómo terminan.</p>
              </div>
              <span class="rp-seccion-cuenta">{{ r.porPrograma.length }}</span>
            </div>
            @if (r.porPrograma.length) {
              <table class="rp-tabla">
                <thead><tr><th>Programa</th><th class="text-right">Aprendices</th><th class="text-right">Activas</th><th class="text-right">Certificadas</th><th class="text-right">Desertadas</th><th class="w-[150px]">Tasa de éxito</th></tr></thead>
                <tbody>
                  @for (p of r.porPrograma; track p.programa) {
                    <tr>
                      <td class="font-medium">{{ titulo(p.programa) }}</td>
                      <td class="text-right tabular-nums font-semibold">{{ p.total }}</td>
                      <td class="text-right tabular-nums">{{ p.activas }}</td>
                      <td class="text-right tabular-nums">{{ p.certificadas }}</td>
                      <td class="text-right tabular-nums" [class.rp-rojo]="p.desertadas">{{ p.desertadas }}</td>
                      <td>
                        @if (p.tasa === null) { <span class="rp-gris">Sin casos resueltos</span> }
                        @else {
                          <span class="rp-tasa">
                            <span class="rp-mini rp-mini-fila"><span [style.width.%]="p.tasa" [style.background]="colorTasa(p.tasa)"></span></span>
                            <b [style.color]="colorTasa(p.tasa)">{{ p.tasa }}%</b>
                          </span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="rp-vacio">No hay prácticas registradas.</p> }
          </section>

          <!-- ══ 04 Empresas ══ -->
          <section class="rp-seccion">
            <div class="rp-seccion-cab">
              <span class="rp-seccion-num">04</span>
              <div>
                <h2>{{ r.porEmpresa.length > 10 ? 'Empresas con más aprendices' : 'Empresas' }}</h2>
                <p>{{ r.porEmpresa.length > 10 ? 'Las diez empresas que reciben más aprendices.' : 'Dónde están haciendo su etapa productiva.' }}</p>
              </div>
              <span class="rp-seccion-cuenta">{{ r.porEmpresa.length }}</span>
            </div>
            @if (r.porEmpresa.length) {
              <table class="rp-tabla">
                <thead><tr><th>Empresa</th><th class="w-[190px]">Aprendices</th><th class="text-right">Activas</th><th class="text-right">Certificadas</th><th class="text-right">Desertadas</th></tr></thead>
                <tbody>
                  @for (e of r.porEmpresa.slice(0, 10); track e.empresa) {
                    <tr>
                      <td class="font-medium">{{ e.empresa }}</td>
                      <td>
                        <span class="rp-tasa">
                          <span class="rp-mini rp-mini-fila"><span [style.width.%]="(e.total / maxEmpresa()) * 100" [style.background]="verde"></span></span>
                          <b>{{ e.total }}</b>
                        </span>
                      </td>
                      <td class="text-right tabular-nums">{{ e.activas }}</td>
                      <td class="text-right tabular-nums">{{ e.certificadas }}</td>
                      <td class="text-right tabular-nums" [class.rp-rojo]="e.desertadas">{{ e.desertadas }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="rp-vacio">No hay empresas registradas.</p> }
          </section>

          <!-- ══ 05 Listado ══ -->
          <section class="rp-seccion">
            <div class="rp-seccion-cab">
              <span class="rp-seccion-num">05</span>
              <div>
                <h2>Listado de prácticas</h2>
                <p>Todas las etapas prácticas registradas, en orden alfabético.</p>
              </div>
              <span class="rp-seccion-cuenta">{{ r.practicas.length }}</span>
            </div>
            @if (r.practicas.length) {
              <table class="rp-tabla">
                <thead><tr><th>Aprendiz</th><th>Programa · ficha</th><th>Empresa</th><th>Estado</th><th>Fin</th><th class="w-[110px]">Avance</th></tr></thead>
                <tbody>
                  @for (p of r.practicas; track $index) {
                    <tr>
                      <td><b>{{ titulo(p.nombre) }}</b><span class="rp-sub">C.C. {{ p.identificacion }}</span></td>
                      <td>{{ titulo(p.programa) }}<span class="rp-sub">Ficha {{ p.ficha }}</span></td>
                      <td>{{ p.empresaNombre }}</td>
                      <td><span class="rp-pildora" [style.color]="colorEstado(p.estado)" [style.background]="colorEstado(p.estado) + '1a'">{{ etiqueta(p.estado) }}</span></td>
                      <td class="whitespace-nowrap">{{ fecha(p.fecha_fin) }}</td>
                      <td>
                        <span class="rp-tasa">
                          <span class="rp-mini rp-mini-fila"><span [style.width.%]="p.avance ?? 0" [style.background]="colorAvance(p.avance ?? 0)"></span></span>
                          <span class="tabular-nums">{{ p.avance ?? 0 }}%</span>
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="rp-vacio">No hay prácticas registradas.</p> }
          </section>

          <!-- ══ Notas metodológicas ══ -->
          <section class="rp-notas rp-junto">
            <p class="rp-etiqueta">Notas metodológicas</p>
            <dl>
              <div><dt>En etapa productiva</dt><dd>Etapas con estado activo o en curso.</dd></div>
              <div><dt>En riesgo</dt><dd>Etapas suspendidas o condicionadas.</dd></div>
              <div><dt>Tasa de éxito</dt><dd>Certificadas ÷ (certificadas + desertadas). Las activas aún no cuentan porque no tienen resultado.</dd></div>
              <div><dt>Requieren atención</dt><dd>En riesgo; activas con la fecha de fin vencida; o que terminan en 30 días o menos con menos del 70 % de avance.</dd></div>
              <div><dt>Ritmo</dt><dd>Inicios según la fecha de inicio; cierres previstos según la fecha de fin registrada.</dd></div>
              <div><dt>Porcentajes</dt><dd>Sobre las etapas prácticas registradas, salvo «con etapa práctica», que es sobre todos los aprendices del centro.</dd></div>
            </dl>
          </section>
        </article>
      }
    </div>
  `,
  styles: [`
    @page {
      size: letter;
      margin: 13mm 13mm 15mm;
      @bottom-left { content: "Panel de control · Etapa productiva"; font: 7.5pt Inter, Arial, sans-serif; color: #9ca3af; }
      @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7.5pt Inter, Arial, sans-serif; color: #9ca3af; }
    }
    app-reporte-panel { display: block; }

    /* ── Pantalla: barra + hoja de papel ── */
    .rp-barra { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 18px; background: rgba(255,255,255,.92); backdrop-filter: blur(6px); border-bottom: 1px solid #e5e7eb; }
    .rp-barra-txt { font-size: 13px; color: #6b7280; }
    .rp-btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 15px; border-radius: 10px; font-size: 13px; font-weight: 600; transition: background-color .15s; }
    .rp-btn-sec { border: 1px solid #d1d5db; color: #374151; background: #fff; }
    .rp-btn-sec:hover { background: #f9fafb; }
    .rp-btn-pri { background: #39a900; color: #fff; }
    .rp-btn-pri:hover { background: #2f8c00; }
    .rp-btn-pri:disabled { opacity: .5; }
    .rp-fondo { min-height: 100vh; padding: 32px 16px 56px; background: #d9dde3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .rp-hoja { width: 216mm; max-width: 100%; margin: 0 auto; padding: 13mm; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 18px 40px rgba(0,0,0,.14); color: #111827; font-family: Inter, 'Segoe UI', Arial, sans-serif; font-size: 11px; line-height: 1.45; }
    .rp-cargando { display: flex; align-items: center; justify-content: center; min-height: 60vh; font-size: 13px; color: #6b7280; }

    /* ── Encabezado ── */
    .rp-banda { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding: 18px 20px; border-radius: 12px; color: #fff;
      background: linear-gradient(120deg, #154307 0%, ${VERDE} 55%, #2f7a12 100%); position: relative; overflow: hidden; }
    .rp-banda::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: #39a900; }
    .rp-banda-logo { display: grid; place-items: center; width: 54px; height: 54px; border-radius: 12px; background: #fff; }
    .rp-banda-logo img { width: 40px; height: 40px; object-fit: contain; }
    .rp-sobre { font-size: 9px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #b9e6a6; }
    .rp-banda h1 { margin: 2px 0 1px; font-size: 26px; font-weight: 800; line-height: 1.1; letter-spacing: -.02em; }
    .rp-banda-sub { font-size: 11.5px; color: #dcefd3; }
    .rp-banda-meta { display: grid; gap: 4px; padding-left: 16px; border-left: 1px solid rgba(255,255,255,.25); font-size: 10.5px; }
    .rp-banda-meta div { display: grid; grid-template-columns: 84px auto; gap: 8px; }
    .rp-banda-meta dt { color: #b9e6a6; }
    .rp-banda-meta dd { font-weight: 600; }

    /* ── Resumen ejecutivo ── */
    .rp-etiqueta { font-size: 9px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${VERDE}; }
    .rp-resumen { margin-top: 18px; padding: 0 2px; }
    .rp-lead { margin-top: 6px; font-size: 14px; line-height: 1.55; color: #1f2937; }
    .rp-lead strong { color: #111827; font-weight: 700; }

    /* ── Cifras ── */
    .rp-cifras { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 18px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
    .rp-cifra { padding: 14px 16px 13px; }
    .rp-cifra + .rp-cifra { border-left: 1px solid #e5e7eb; }
    .rp-cifra-etq { display: flex; align-items: center; gap: 6px; font-size: 9.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
    .rp-cifra-etq span { width: 7px; height: 7px; border-radius: 2px; }
    .rp-cifra-num { margin-top: 5px; font-size: 30px; font-weight: 800; line-height: 1; letter-spacing: -.03em; color: #111827; font-variant-numeric: tabular-nums; }
    .rp-mini { display: block; height: 4px; margin-top: 10px; border-radius: 999px; background: #eef0f3; overflow: hidden; }
    .rp-mini > span { display: block; height: 100%; min-width: 3px; border-radius: 999px; }
    .rp-cifra-det { margin-top: 6px; font-size: 10px; color: #6b7280; }

    /* ── Bloques (distribución, hallazgos) ── */
    .rp-bloque { margin-top: 18px; }
    .rp-bloque-cab { display: flex; align-items: baseline; justify-content: space-between; }
    .rp-bloque-total { font-size: 11px; font-weight: 600; color: #374151; }
    .rp-barra100 { display: flex; height: 22px; margin-top: 8px; border-radius: 6px; overflow: hidden; background: #f3f4f6; }
    .rp-barra100 > span { display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff; }
    .rp-barra100-vacia { flex: 1; color: #9ca3af !important; font-weight: 500 !important; }
    .rp-leyenda { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 9px; }
    .rp-leyenda-item { display: grid; grid-template-columns: 9px 1fr; grid-template-rows: auto auto; column-gap: 6px; align-items: center; }
    .rp-leyenda-etq { font-size: 10px; color: #4b5563; }
    .rp-leyenda-n { grid-column: 2; font-size: 13px; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; }
    .rp-leyenda-pct { grid-column: 2; font-size: 9.5px; color: #9ca3af; margin-top: -2px; }
    .rp-punto { width: 9px; height: 9px; border-radius: 2px; }
    .rp-tenue { opacity: .55; }
    .rp-hallazgos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .rp-hallazgo { display: flex; gap: 10px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fafbfa; }
    .rp-hallazgo p { font-size: 11.5px; color: #1f2937; }
    .rp-hallazgo-n { display: grid; place-items: center; flex-shrink: 0; width: 20px; height: 20px; border-radius: 6px; font-size: 10.5px; font-weight: 800; color: #fff; background: ${VERDE}; }
    .rp-nota-suave { display: flex; align-items: flex-start; gap: 9px; margin-top: 8px; padding: 10px 12px; border-radius: 8px; font-size: 11.5px; color: #4b5563; background: #f7f8f6; border: 1px dashed #d1d5db; }
    .rp-nota-suave lucide-icon { color: #d97706; flex-shrink: 0; margin-top: 1px; }

    /* ── Secciones numeradas ── */
    .rp-seccion { margin-top: 24px; }
    .rp-seccion-cab { display: grid; grid-template-columns: auto 1fr auto; align-items: end; gap: 12px; padding-bottom: 8px; margin-bottom: 10px; border-bottom: 2px solid #111827; break-after: avoid; }
    .rp-seccion-num { font-size: 30px; font-weight: 800; line-height: .9; letter-spacing: -.04em; color: #39a900; }
    .rp-seccion-cab h2 { font-size: 15.5px; font-weight: 800; letter-spacing: -.01em; color: #111827; }
    .rp-seccion-cab p { font-size: 10.5px; color: #6b7280; }
    .rp-seccion-cuenta { min-width: 30px; padding: 3px 9px; border-radius: 999px; text-align: center; font-size: 11px; font-weight: 700; color: #374151; background: #f3f4f6; }
    .rp-alerta { color: #b91c1c; background: #fee2e2; }

    .rp-tabla { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    .rp-tabla thead { display: table-header-group; }
    .rp-tabla th { padding: 0 8px 6px; text-align: left; font-size: 8.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #d1d5db; }
    .rp-tabla th.text-right { text-align: right; }
    .rp-tabla td { padding: 7px 8px; vertical-align: top; border-bottom: 1px solid #f0f1f3; color: #1f2937; }
    .rp-tabla tr { break-inside: avoid; }
    .rp-tabla tbody tr:nth-child(even) td { background: #fbfbfc; }
    .rp-sub { display: block; font-size: 9.5px; color: #9ca3af; font-weight: 400; }
    .rp-pildora { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9.5px; font-weight: 700; white-space: nowrap; }
    .rp-pildora-roja { color: #b91c1c; background: #fee2e2; }
    .rp-pildora-ambar { color: #b45309; background: #fef3c7; }
    .rp-tasa { display: flex; align-items: center; gap: 8px; }
    .rp-tasa b, .rp-tasa > span:last-child { width: 32px; text-align: right; font-variant-numeric: tabular-nums; }
    .rp-mini-fila { flex: 1; margin-top: 0; height: 5px; }
    .rp-rojo { color: #dc2626 !important; font-weight: 700; }
    .rp-gris { color: #9ca3af; }
    .rp-vacio { font-size: 11px; font-style: italic; color: #9ca3af; }
    .rp-todo-bien { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 8px; font-size: 11.5px; color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; }
    .rp-todo-bien lucide-icon { color: #16a34a; flex-shrink: 0; }

    .rp-ritmo-resumen { display: flex; gap: 22px; margin-bottom: 6px; font-size: 10.5px; color: #4b5563; }
    .rp-ritmo-resumen span { display: inline-flex; align-items: center; gap: 6px; }
    .rp-ritmo-resumen i { width: 9px; height: 9px; border-radius: 2px; }
    .rp-ritmo-resumen b { color: #111827; }
    .rp-grafica { width: 710px; height: 180px; max-width: 100%; overflow: hidden; }

    /* ── Notas ── */
    .rp-notas { margin-top: 26px; padding: 12px 14px; border-radius: 8px; background: #f7f8f9; }
    .rp-notas dl { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin-top: 7px; }
    .rp-notas div { font-size: 9.5px; color: #4b5563; }
    .rp-notas dt { display: inline; font-weight: 700; color: #1f2937; }
    .rp-notas dt::after { content: ": "; }
    .rp-notas dd { display: inline; }

    .rp-junto { break-inside: avoid; }
    @media print {
      .rp-barra { display: none !important; }
      .rp-fondo { padding: 0; background: #fff; min-height: 0; }
      .rp-hoja { width: auto; padding: 0; box-shadow: none; }
    }
    @media (max-width: 700px) {
      .rp-barra-txt { display: none; }
    }
  `],
})
export class ReportePanelComponent implements OnInit {
  private readonly stats = inject(StatsService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly exportService = inject(ExportService);
  private readonly route = inject(ActivatedRoute);

  readonly icVolver = ArrowLeft;
  readonly icImprimir = Printer;
  readonly icOk = CircleCheck;
  readonly icIdea = Lightbulb;
  readonly verde = '#39a900';
  readonly cargando = signal(true);
  readonly r = signal<ResumenPanel | null>(null);
  private readonly datos = signal<{ stats: Stats; practicas: any[] } | null>(null);

  readonly fechaCorta = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  /** Solo se guarda el slug del centro ("yamboro"): se muestra con mayúscula inicial. */
  readonly centro = (() => { try { const s = localStorage.getItem('tenantSlug') ?? ''; return s ? `Centro ${s.charAt(0).toUpperCase()}${s.slice(1)}` : 'Centro de formación'; } catch { return 'Centro de formación'; } })();
  readonly autor = (() => { try { return JSON.parse(localStorage.getItem('user') ?? '{}').nombre || 'el sistema'; } catch { return 'el sistema'; } })();
  readonly paginasTexto = 'usa «Guardar como PDF» en el cuadro de impresión';

  readonly etapas = computed(() => this.datos()?.practicas.length ?? 0);
  readonly distribucion = computed(() => {
    const d = this.datos();
    if (!d) return [];
    const cuenta = (c: string) => d.practicas.filter((p) => categorizarEstado(p.estado) === c).length;
    const filas = [
      { etq: 'En etapa productiva', n: cuenta('activa'), color: COLOR.activa },
      { etq: 'Certificadas', n: cuenta('certificada'), color: COLOR.certificada },
      { etq: 'Desertadas', n: cuenta('desertada'), color: COLOR.desertada },
      { etq: 'En riesgo', n: cuenta('enRiesgo'), color: COLOR.enRiesgo },
    ];
    filas.push({ etq: 'Otros estados', n: d.practicas.length - filas.reduce((a, f) => a + f.n, 0), color: COLOR.otros });
    const total = Math.max(d.practicas.length, 1);
    return filas.map((f) => ({ ...f, pctExacto: (f.n / total) * 100, pct: Math.round((f.n / total) * 100) }));
  });
  readonly sinHallazgos = computed(() => {
    const h = this.r()?.hallazgos ?? [];
    return !h.length || (h.length === 1 && !h[0].fuerte && h[0].texto.startsWith('Todavía no hay'));
  });
  readonly maxEmpresa = computed(() => Math.max(1, ...(this.r()?.porEmpresa ?? []).map((e) => e.total)));

  readonly cifras = computed(() => {
    const d = this.datos();
    const r = this.r();
    if (!d || !r) return [];
    const et = this.etapas();
    const p = (n: number, de: number) => (de ? (n / de) * 100 : 0);
    const pctTxt = (n: number) => (et ? `${Math.round(p(n, et))} % de las etapas` : 'sin etapas registradas');
    const tasaColor = r.casosResueltos ? this.colorTasa(r.tasaExito) : '#9ca3af';
    return [
      { etq: 'Aprendices', valor: d.stats.aprendices.toLocaleString('es-CO'), barra: p(et, d.stats.aprendices),
        det: `${et.toLocaleString('es-CO')} con etapa práctica (${this.pctTexto(et, d.stats.aprendices)})`, color: '#39a900' },
      { etq: 'En etapa productiva', valor: d.stats.activas.toLocaleString('es-CO'), barra: p(d.stats.activas, et), det: pctTxt(d.stats.activas), color: COLOR.activa },
      { etq: 'Certificadas', valor: d.stats.certificadas.toLocaleString('es-CO'), barra: p(d.stats.certificadas, et), det: pctTxt(d.stats.certificadas), color: COLOR.certificada },
      { etq: 'Tasa de éxito', valor: r.casosResueltos ? `${r.tasaExito}%` : '—', barra: r.casosResueltos ? r.tasaExito : 0,
        det: r.casosResueltos ? `${d.stats.certificadas} de ${r.casosResueltos} casos resueltos` : 'aún no hay casos resueltos', color: tasaColor, colorValor: r.casosResueltos ? tasaColor : '#9ca3af' },
    ];
  });

  /** El reporte contado en un párrafo, con las cifras clave en negrita. */
  readonly resumen = computed<Tramo[]>(() => {
    const d = this.datos();
    const r = this.r();
    if (!d || !r) return [];
    const n = (v: number) => v.toLocaleString('es-CO');
    const s = d.stats;
    const et = this.etapas();
    const t: Tramo[] = [
      { t: 'El centro registra ' }, { t: `${n(s.aprendices)} aprendices`, b: true },
      { t: et ? ', de los cuales ' : '. Aún no hay etapas prácticas registradas.' },
    ];
    if (et) {
      t.push({ t: `${n(et)} ${et === 1 ? 'tiene' : 'tienen'} etapa práctica`, b: true }, { t: ` (${this.pctTexto(et, s.aprendices)}). Hoy hay ` },
        { t: `${n(s.activas)} en etapa productiva`, b: true }, { t: ', ' },
        { t: `${n(s.certificadas)} ${s.certificadas === 1 ? 'certificada' : 'certificadas'}`, b: true }, { t: ' y ' },
        { t: `${n(s.desertadas)} ${s.desertadas === 1 ? 'desertada' : 'desertadas'}`, b: true }, { t: '. ' });
      if (r.casosResueltos) t.push({ t: 'La tasa de éxito es de ' }, { t: `${r.tasaExito} %`, b: true }, { t: ` (${s.certificadas} de ${r.casosResueltos} casos resueltos). ` });
      else t.push({ t: 'Todavía no hay casos resueltos para medir la tasa de éxito. ' });
      if (r.atencion.length) t.push({ t: `${r.atencion.length} ${r.atencion.length === 1 ? 'práctica requiere' : 'prácticas requieren'} atención`, b: true }, { t: ' (sección 01).' });
      else t.push({ t: 'Ninguna práctica requiere atención inmediata.' });
    }
    return t;
  });

  readonly ritmo = computed(() => {
    const r = this.r();
    if (!r) return null;
    const resalte = (base: string, fuerte: string) => r.ritmo.labels.map((_, i) => (i === r.ritmo.actual ? fuerte : base));
    return {
      labels: r.ritmo.labels,
      datasets: [
        { label: 'Inicios', data: r.ritmo.inicios, backgroundColor: resalte('#7bc96f', VERDE), borderRadius: 3, maxBarThickness: 16 },
        { label: 'Cierres previstos', data: r.ritmo.cierres, backgroundColor: resalte('#cbd5e1', '#475569'), borderRadius: 3, maxBarThickness: 16 },
      ],
    };
  });
  readonly ritmoTotales = computed(() => {
    const r = this.r();
    if (!r) return { inicios: 0, cierres: 0 };
    const a = r.ritmo.actual;
    return {
      inicios: r.ritmo.inicios.slice(0, a + 1).reduce((x, y) => x + y, 0),
      cierres: r.ritmo.cierres.slice(a).reduce((x, y) => x + y, 0),
    };
  });

  /** Tamaño fijo y sin animación: Chart.js se encoge al pasar a modo impresión y el navegador imprime lo que haya dibujado. */
  readonly opcionesRitmo = {
    responsive: false, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { grid: { display: false }, border: { color: '#d1d5db' }, ticks: { font: { size: 9.5 }, color: '#6b7280' } },
      y: { beginAtZero: true, suggestedMax: 4, ticks: { precision: 0, font: { size: 9 }, color: '#9ca3af' }, grid: { color: '#f1f3f5' }, border: { display: false } },
    },
  };

  async ngOnInit(): Promise<void> {
    try {
      const [{ stats }, practicas] = await Promise.all([
        firstValueFrom(this.stats.getDashboardData()),
        cargarPracticasPanel(this.api, this.auth),
      ]);
      this.datos.set({ stats, practicas });
      this.r.set(this.exportService.resumenPanel(stats, practicas));
    } finally {
      this.cargando.set(false);
    }
    // Abierto desde el panel: imprime solo cuando ya se dibujó todo.
    if (this.route.snapshot.queryParamMap.get('imprimir') === '1') {
      setTimeout(() => this.imprimir(), 700);
    }
  }

  imprimir(): void {
    window.print();
  }

  volver(): void {
    if (window.opener) window.close();
    else location.assign('/home');
  }

  /** "12 %", "<1 %" cuando hay algo pero redondea a 0. */
  pctTexto(n: number, de: number): string {
    if (!de || !n) return '0 %';
    const p = (n / de) * 100;
    return p < 1 ? '<1 %' : `${Math.round(p)} %`;
  }
  colorTasa(t: number): string {
    return t >= 80 ? '#15803d' : t >= 60 ? '#b45309' : '#b91c1c';
  }
  colorAvance(a: number): string {
    return a >= 70 ? '#16a34a' : a >= 40 ? '#d97706' : '#dc2626';
  }
  colorEstado(e: string): string {
    const c = categorizarEstado(e);
    return c === 'activa' ? COLOR.activa : c === 'certificada' ? COLOR.certificada : c === 'desertada' ? COLOR.desertada : c === 'enRiesgo' ? COLOR.enRiesgo : '#6b7280';
  }
  etiqueta(e?: string | null): string {
    const t = String(e ?? '').trim().replace(/_/g, ' ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '—';
  }
  /** "ANALISIS Y DESARROLLO DE SOFTWARE." → "Analisis y desarrollo de software" (los nombres llegan en mayúsculas sostenidas). */
  titulo(v?: string | null): string {
    const t = String(v ?? '').trim().replace(/\.$/, '');
    if (!t || t === '—') return '—';
    if (t !== t.toUpperCase()) return t;
    const menores = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'para', 'con', 'por']);
    return t.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && menores.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  }
  fecha(v?: string | null): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
    if (!m) return '—';
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
