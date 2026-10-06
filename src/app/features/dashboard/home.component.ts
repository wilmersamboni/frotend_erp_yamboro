import { Component, OnInit, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from 'primeng/card';
import { UIChart } from 'primeng/chart';
import { ProgressBar } from 'primeng/progressbar';
import { SplitButton } from 'primeng/splitbutton';
import { MenuItem } from 'primeng/api';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { StatsService, Stats, DonaStats, categorizarEstado } from '../../core/services/stats.service';
import { ApiService } from '../../core/services/api.service';
import { ExportService } from '../../core/services/export.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { HorariosHomeComponent } from './horarios-home.component';
import { cargarPracticasPanel } from './panel-datos';
import { RouterLink } from '@angular/router';
import {
  ArrowRight, Building2, CalendarClock, ChevronDown, ChevronRight, ClipboardList, Download, FileText, LucideAngularModule,
  LucideIconData, Minus, Search, TrendingDown, TrendingUp,
} from 'lucide-angular';
import { log } from '../../core/utils/log';

/**
 * Paleta del tema "Spotify" de tweakcn (2026-10-05), SOLO para este panel:
 * el resto del sistema conserva su tema. Los tokens CSS van en `.spotify`
 * (home.component.css); Chart.js pinta en canvas y no entiende var(), así que
 * las gráficas usan estos mismos valores directamente.
 */
const SP = {
  verde: '#1db954', negro: '#191414', azul: '#2d46b9', rojo: '#e91429', ambar: '#f59b23', morado: '#8d67ab',
  grisClaro: '#b3b3b3', gris: '#535353',
};

interface KpiPanel {
  key: string;
  label: string;
  valor: number;
  /** Lo que se ve: sube de 0 a `valor` al cargar. */
  mostrado: number;
  color: string;
  pill: string;
  tendencia: 'up' | 'down' | 'flat';
  titular: string;
  detalle: string;
  spark: any;
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, Card, UIChart, ProgressBar, SplitButton, Skeleton, Tag, HorariosHomeComponent, LucideAngularModule, RouterLink],
  templateUrl: './home.component.html',
  // El tema Spotify del panel va aparte: cada hoja tiene su propio presupuesto de 16 kB.
  styleUrls: ['./home.component.css', './home-spotify.css']
})
export class HomeComponent implements OnInit {

  /**
   * Solo aplica a ADMIN: si su cuenta pertenece exclusivamente al aplicativo
   * "Horarios" (no "Etapa Práctica"), ve el home de Horarios en vez de este
   * dashboard. administrador_erp sigue viendo este dashboard general
   * (perteneceAplicativo('Etapa Práctica') es true para él).
   *
   * Aprendiz e instructor NO usan este criterio — para ellos el home se
   * decide por datos reales (¿tiene etapa práctica?) o siempre muestran
   * ambos módulos combinados, ver aprendizTieneEtapa() y la plantilla.
   */
  readonly esHorariosOnly = computed(() =>
    !this.auth.perteneceAplicativo('Etapa Práctica') && this.auth.perteneceAplicativo('Horarios')
  );

  /**
   * Solo aplica a APRENDIZ: null mientras no se sabe aún, true/false una vez
   * cargadas sus prácticas. Decide si ve el dashboard de Etapa Práctica o el
   * home de Horarios (su horario de clase) — automático, sin que el aprendiz
   * tenga que elegir.
   */
  readonly aprendizTieneEtapa = signal<boolean | null>(null);

  cargando        = true;
  exportando      = false;
  practicas: any[] = [];

  /** Referencias a los charts en pantalla, para capturarlos como imagen (PNG) y
   *  embeberlos tal cual en el PDF/Excel exportado — en vez de repetir los
   *  datos solo como tabla. */
  @ViewChild('chartEstadosRef')    chartEstadosRef?:    UIChart;
  @ViewChild('chartEvolucionRef')  chartEvolucionRef?:  UIChart;

  readonly exportMenuItems: MenuItem[] = [
    { label: 'Reporte para imprimir / PDF', icon: 'pi pi-print',      command: () => this.abrirReporte() },
    { label: 'PDF (formato anterior)',      icon: 'pi pi-file-pdf',   command: () => this.exportarPDF()  },
    { label: 'Exportar Excel',              icon: 'pi pi-file-excel', command: () => this.exportarExcel() },
  ];

  /** Reporte en HTML (`/reporte-panel`) en otra pestaña; abre la impresión solo ("Guardar como PDF"). */
  abrirReporte(): void {
    window.open('/reporte-panel?imprimir=1', '_blank');
  }

  /** Práctica personal del aprendiz */
  miPractica: any = null;

  fecha = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  stats: Stats = { aprendices: 0, activas: 0, certificadas: 0, desertadas: 0, enRiesgo: 0 };
  etapaActiva: DonaStats      = { total: 0, porcentaje: 0 };
  etapaCertificada: DonaStats = { total: 0, porcentaje: 0 };

  // ── Chart data ──────────────────────────────────────────────────────────
  chartDataEstadosGauge: any = null;
  chartDataPersonal:     any = null;
  chartDataEvolucion:    any = null;
  chartDataComparativo:  any = null;

  // ── Panel estilo Spotify (2026-10-05) ───────────────────────────────────
  readonly icSube = TrendingUp;
  readonly icBaja = TrendingDown;
  readonly icPlano = Minus;
  readonly icAbajo = ChevronDown;
  readonly icDerecha = ChevronRight;
  readonly icIr = ArrowRight;
  readonly icCalendario = CalendarClock;
  readonly icEdificio = Building2;
  chartDataBarras: any = null;
  hayAnioAnterior = false;
  terminanPronto: Array<{ nombre: string; empresaNombre: string; dias: number }> = [];
  topEmpresas: Array<{ nombre: string; total: number }> = [];
  readonly comparacion = signal<{ pct: number | null; tendencia: 'up' | 'down' | 'flat'; texto: string }>({ pct: null, tendencia: 'flat', texto: '' });

  /** Acciones rápidas: solo las que esta persona puede abrir. */
  readonly acciones = computed(() => {
    const lista: { titulo: string; detalle: string; icono: LucideIconData; ruta?: string; accion?: () => void }[] = [
      { titulo: 'Seguimiento de etapas', detalle: 'Bitácoras, visitas y avance de cada aprendiz.', icono: ClipboardList, ruta: '/seguimiento' },
    ];
    if (this.esAdmin() || this.auth.tieneServicio('practica.historial.ver')) {
      lista.push({ titulo: 'Buscar aprendiz por cédula', detalle: 'Todo su historial en un solo lugar.', icono: Search, ruta: '/docs' });
    }
    lista.push({ titulo: 'Formatos', detalle: 'Plantillas oficiales para descargar.', icono: FileText, ruta: '/format' });
    lista.push({ titulo: 'Reporte para imprimir', detalle: 'Este panel en hoja carta, o guárdalo como PDF.', icono: Download, accion: () => this.abrirReporte() });
    return lista;
  });
  readonly anioActual = new Date().getFullYear();
  readonly rangos = [
    { meses: 12, label: 'Últimos 12 meses', corto: '12 meses' },
    { meses: 6, label: 'Últimos 6 meses', corto: '6 meses' },
    { meses: 3, label: 'Últimos 3 meses', corto: '3 meses' },
  ];
  readonly rango = signal(12);
  readonly totalRango = signal({ iniciadas: 0, certificadas: 0 });
  kpis: KpiPanel[] = [];
  totalEtapas = 0;
  private readonly oscuro = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  /** Negro de Spotify en claro; en oscuro no se vería, va gris claro. */
  private readonly colorSecundario = this.oscuro ? SP.grisClaro : SP.negro;

  private readonly tooltip = {
    backgroundColor: this.oscuro ? '#282828' : '#ffffff',
    titleColor: this.oscuro ? '#ffffff' : '#121212',
    bodyColor: this.oscuro ? '#b3b3b3' : '#535353',
    borderColor: this.oscuro ? '#3e3e3e' : '#ebebeb',
    borderWidth: 1,
    padding: 10,
    cornerRadius: 10,
    boxPadding: 4,
    usePointStyle: true,
    titleFont: { weight: 'bold' as const },
  };

  private readonly ejes = {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { font: { size: 11 }, color: this.oscuro ? '#b3b3b3' : '#6a6a6a' },
    },
    y: {
      grid: { color: this.oscuro ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)' },
      border: { display: false },
      ticks: { precision: 0, font: { size: 11 }, color: this.oscuro ? '#b3b3b3' : '#6a6a6a' },
      beginAtZero: true,
      suggestedMax: 4,
    },
  };

  chartOptionsArea: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 900, easing: 'easeOutQuart' },
    transitions: { resize: { animation: { duration: 0 } } },
    plugins: { legend: { display: false }, tooltip: this.tooltip },
    scales: this.ejes,
    elements: { line: { tension: 0.42, borderWidth: 2 }, point: { radius: 0, hoverRadius: 5 } },
  };

  chartOptionsDona: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '58%',
    animation: { animateRotate: true, duration: 900 },
    transitions: { resize: { animation: { duration: 0 } } },
    layout: { padding: 6 },
    plugins: { legend: { display: false }, tooltip: { ...this.tooltip, callbacks: { label: (c: any) => ` ${c.label}: ${c.parsed}` } } },
  };

  chartOptionsBarras: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 900, easing: 'easeOutQuart' },
    transitions: { resize: { animation: { duration: 0 } } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 8, boxHeight: 8, padding: 14, color: this.oscuro ? '#b3b3b3' : '#535353', font: { size: 11.5 } } },
      tooltip: { ...this.tooltip, filter: (i: any) => i.parsed.y > 0 },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: this.oscuro ? '#b3b3b3' : '#6a6a6a' } },
      y: { stacked: true, display: false, beginAtZero: true, suggestedMax: 3 },
    },
    datasets: { bar: { barThickness: 12, borderRadius: 6, borderSkipped: false } },
  };

  chartOptionsComparativo: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 900, easing: 'easeOutQuart' },
    transitions: { resize: { animation: { duration: 0 } } },
    plugins: { legend: { display: false }, tooltip: this.tooltip },
    scales: this.ejes,
    layout: { padding: { top: 22 } },
    elements: { line: { tension: 0.42, borderWidth: 2.5 }, point: { radius: 4, hoverRadius: 6, borderWidth: 2 } },
  };

  // ── Plugins de dibujo propios (sin dependencias nuevas) ──────────────────
  /** Línea vertical punteada donde está el mouse, como en el ejemplo. */
  readonly pluginGuia = {
    id: 'spGuia',
    afterDatasetsDraw: (chart: any) => {
      const act = chart.tooltip?.getActiveElements?.() ?? [];
      if (!act.length) return;
      const { ctx, chartArea } = chart;
      const x = act[0].element.x;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = this.oscuro ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.18)';
      ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
      ctx.restore();
    },
  };

  /** Porcentaje escrito sobre cada porción de la dona (las de menos de 6% no, para no amontonar). */
  readonly pluginPorcentajes = {
    id: 'spPorcentajes',
    afterDatasetsDraw: (chart: any) => {
      const ds = chart.data.datasets[0];
      const total = (ds?.data ?? []).reduce((a: number, b: number) => a + b, 0);
      if (!total) return;
      const { ctx } = chart;
      ctx.save();
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      chart.getDatasetMeta(0).data.forEach((arc: any, i: number) => {
        const v = ds.data[i];
        if (!v || v / total < 0.06) return;
        const { x, y } = arc.tooltipPosition();
        const color = ds.backgroundColor[i];
        ctx.fillStyle = color === SP.ambar || color === SP.grisClaro ? '#000' : '#fff';
        ctx.fillText(`${Math.round((v / total) * 100)}%`, x, y);
      });
      ctx.restore();
    },
  };

  /** Valor escrito encima de cada punto de la serie de este año. */
  readonly pluginValores = {
    id: 'spValores',
    afterDatasetsDraw: (chart: any) => {
      const { ctx } = chart;
      const ds = chart.data.datasets[0];
      ctx.save();
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.oscuro ? '#ffffff' : '#121212';
      chart.getDatasetMeta(0).data.forEach((p: any, i: number) => {
        const v = ds.data[i];
        if (!v || p.skip) return; // los ceros solo ensucian
        ctx.fillText(String(v), p.x, p.y - 10);
      });
      ctx.restore();
    },
  };

  /** Riel gris detrás de cada barra (como las barras finas del ejemplo). */
  readonly pluginPista = {
    id: 'spPista',
    beforeDatasetsDraw: (chart: any) => {
      const { ctx, chartArea } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.fillStyle = this.oscuro ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)';
      for (const bar of meta.data) {
        const w = 12;
        const x = bar.x - w / 2;
        const h = chartArea.bottom - chartArea.top;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, chartArea.top, w, h, 6); else ctx.rect(x, chartArea.top, w, h);
        ctx.fill();
      }
      ctx.restore();
    },
  };

  readonly sparkOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 900, easing: 'easeOutQuart' },
    transitions: { resize: { animation: { duration: 0 } } },
    layout: { padding: { top: 6, bottom: 4, left: 4, right: 6 } },
    plugins: { legend: { display: false }, tooltip: { ...this.tooltip, displayColors: false } },
    scales: { x: { display: false }, y: { display: false, beginAtZero: true, suggestedMax: 1 } },
    elements: { line: { tension: 0.4, borderWidth: 2 }, point: { radius: 2.5, hoverRadius: 4, borderWidth: 1.5 } },
  };

  /** Desglose por estado para el gauge "Distribución por Estado" — icono + conteo + %. */
  estadosResumen: Array<{
    key: string; label: string; total: number; porcentaje: number;
    icon: string; color: string; bg: string;
  }> = [];

  chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: { legend: { display: false }, tooltip: { enabled: true } }
  };

  chartOptionsGauge = {
    responsive: true,
    maintainAspectRatio: false,
    rotation: -90,
    circumference: 180,
    cutout: '75%',
    plugins: { legend: { display: false }, tooltip: { enabled: true } }
  };

  chartOptionsLine = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 12, family: 'Inter' }, color: '#94a3b8' }
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, .18)' },  // tenue en claro y en oscuro
        border: { display: false },
        ticks: { stepSize: 1, font: { size: 12, family: 'Inter' }, color: '#94a3b8' },
        beginAtZero: true
      }
    }
  };

  readonly cargo        = computed(() => this.auth.cargo());
  readonly esAprendiz   = computed(() => this.cargo() === 'aprendiz');
  readonly esInstructor = computed(() => this.cargo() === 'instructor');
  readonly esAdmin      = computed(() => this.auth.isAdmin());

  /**
   * Las gráficas de este dashboard son todas datos de Etapa Práctica — antes
   * se mostraban a cualquiera con el cargo correcto, sin mirar el sistema de
   * permisos dinámico (a diferencia del sidebar/rutas, ya migrados). Si le
   * revocan este servicio a alguien, ahora las gráficas desaparecen en vez
   * de quedar vacías/rotas.
   */
  readonly tieneAccesoPractica = computed(() => this.auth.tieneServicio('practica.etapas.ver'));

  getInitials(nombre: string): string {
    if (!nombre || nombre === '—') return '?';
    return nombre.split(' ').filter(n => n.length > 0).slice(0, 2)
      .map(n => n[0].toUpperCase()).join('');
  }

  estadoClass(estado: string): string {
    const e = (estado ?? '').toLowerCase().trim();
    if (['activo', 'activa', 'en_curso', 'en curso', 'inactivo'].includes(e)) return 'badge-success';
    if (['certificado', 'certificada', 'por certificar'].includes(e))         return 'badge-info';
    if (['desercion', 'desertado', 'desertada', 'deserción'].includes(e))     return 'badge-danger';
    if (['suspendido', 'suspendida'].includes(e))                              return 'badge-warning';
    if (e === 'condicionado')                                                  return 'badge-condicionado';
    if (e === 'cancelado')                                                     return 'badge-cancelado';
    if (['retiro voluntario', 'retiro_voluntario'].includes(e))               return 'badge-retiro';
    return 'badge-secondary';
  }

  // ── Severity para p-tag de estado ───────────────────────────────────────
  estadoSeverity(estado: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const e = (estado ?? '').toLowerCase().trim();
    if (['activo', 'activa', 'en_curso', 'en curso', 'inactivo'].includes(e)) return 'success';
    if (['certificado', 'certificada', 'por certificar'].includes(e))         return 'info';
    if (['desercion', 'desertado', 'desertada', 'cancelado'].includes(e))     return 'danger';
    if (['suspendido', 'suspendida', 'condicionado',
         'retiro voluntario', 'retiro_voluntario'].includes(e))               return 'warn';
    return 'secondary';
  }

  /**
   * Gauge "Distribución por Estado": reutiliza las mismas cifras que ya
   * alimentan las tarjetas KPI de arriba (ver StatsService/categorizarEstado),
   * así que no hace falta esperar a `practicas` ni recalcular nada distinto.
   * "En riesgo" (suspendidas/condicionadas) se muestra aparte por ser el
   * segmento más accionable; "Otros" es el remanente real (inactivo, por
   * certificar, sin estado, etc.) — antes ambos se mezclaban en un solo
   * cajón "Otros estados".
   */
  private buildCharts(): void {
    const activo      = this.stats.activas;
    const certificado = this.stats.certificadas;
    const desertado   = this.stats.desertadas;
    const enRiesgo    = this.stats.enRiesgo;
    // "Otros" ahora es de verdad un remanente (inactivo, por certificar, sin
    // estado, etc.) — antes 'suspendido'/'condicionado' quedaban escondidos
    // acá también, mezclados con casos ya cerrados sin ninguna distinción.
    // La dona cuenta ETAPAS. Antes "Otros" era aprendices − etapas, así que
    // los miles de aprendices sin etapa aparecían como "Otros estados".
    const otros = Math.max(0, this.practicas.length - activo - certificado - desertado - enRiesgo);
    this.totalEtapas = activo + certificado + desertado + enRiesgo + otros;
    const total = Math.max(this.totalEtapas, 1);

    const items = [
      { key: 'activo',      label: 'Activas',        total: activo,      icon: 'pi-clipboard',            color: SP.verde,  bg: 'var(--info-bg)' },
      { key: 'certificado', label: 'Certificadas',    total: certificado, icon: 'pi-check-circle',         color: SP.morado, bg: 'var(--violet-bg)' },
      { key: 'desertado',   label: 'Desertadas',      total: desertado,   icon: 'pi-times-circle',         color: SP.rojo,   bg: 'var(--warn-bg)' },
      { key: 'enRiesgo',    label: 'En riesgo',       total: enRiesgo,    icon: 'pi-exclamation-triangle', color: SP.ambar,  bg: 'var(--warn-bg)' },
      { key: 'otros',       label: 'Otros estados',   total: otros,       icon: 'pi-ellipsis-h',           color: this.colorSecundario, bg: 'var(--surface3)' },
    ];

    this.estadosResumen = items.map(it => ({
      ...it,
      porcentaje: Math.round((it.total / total) * 100),
    }));

    this.chartDataEstadosGauge = {
      labels: items.map(i => i.label),
      datasets: [{
        data: items.map(i => i.total),
        backgroundColor: items.map(i => i.color),
        hoverBackgroundColor: items.map(i => i.color),
        borderWidth: 3,
        borderColor: this.oscuro ? '#181818' : '#ffffff',
        borderRadius: 6,
        hoverOffset: 6,
      }]
    };
  }

  /** "2026-10" del mes de una fecha "AAAA-MM-DD…" (sin pasar por Date: evita el corrimiento de zona). */
  private claveMes(f: string | null | undefined): string | null {
    const m = /^(\d{4})-(\d{2})/.exec(f ?? '');
    return m ? `${m[1]}-${m[2]}` : null;
  }

  /** Los últimos `n` meses terminando en el actual: claves "AAAA-MM" y etiquetas "Oct" / "Oct 25". */
  private ultimosMeses(n: number): { claves: string[]; etiquetas: string[] } {
    const hoy = new Date();
    const claves: string[] = [];
    const etiquetas: string[] = [];
    for (let k = n - 1; k >= 0; k--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - k, 1);
      claves.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      etiquetas.push(d.getFullYear() === hoy.getFullYear() ? MESES[d.getMonth()] : `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`);
    }
    return { claves, etiquetas };
  }

  /** Cuántas etapas iniciaron en cada mes de `claves`, opcionalmente solo de una categoría. */
  private conteoPorMes(claves: string[], categoria?: string): number[] {
    const idx = new Map(claves.map((c, i) => [c, i]));
    const out = new Array(claves.length).fill(0);
    for (const p of this.practicas) {
      const i = idx.get(this.claveMes(p.fecha_inicio) ?? '');
      if (i === undefined) continue;
      if (categoria && categorizarEstado(p.estado) !== categoria) continue;
      out[i]++;
    }
    return out;
  }

  /** Relleno en degradado (de `alfa` arriba a casi transparente abajo), como el área del ejemplo. */
  private degradado(color: string, alfa = 0.5) {
    return (ctx: any) => {
      const { chart } = ctx;
      const area = chart?.chartArea;
      if (!area) return this.conAlfa(color, alfa / 3);
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, this.conAlfa(color, alfa));
      g.addColorStop(1, this.conAlfa(color, 0.02));
      return g;
    };
  }

  private conAlfa(hex: string, a: number): string {
    return hex + Math.round(a * 255).toString(16).padStart(2, '0');
  }

  cambiarRango(meses: number): void {
    this.rango.set(meses);
    this.buildChartEvolucion();
  }

  textoRango(): string {
    return this.rangos.find((r) => r.meses === this.rango())?.label.toLowerCase() ?? '';
  }

  /**
   * Etapas iniciadas por mes (con año, no solo el mes como antes, que juntaba
   * octubre de 2025 con octubre de 2026) y, de ellas, las ya certificadas.
   * No hay histórico de estados en el backend: "certificadas" es el estado
   * ACTUAL de las que iniciaron ese mes.
   */
  private buildChartEvolucion(): void {
    const { claves, etiquetas } = this.ultimosMeses(this.rango());
    const iniciadas = this.conteoPorMes(claves);
    const certificadas = this.conteoPorMes(claves, 'certificada');
    const suma = (v: number[]) => v.reduce((a, b) => a + b, 0);
    this.totalRango.set({ iniciadas: suma(iniciadas), certificadas: suma(certificadas) });
    // Mismo largo de ventana, justo antes: ¿se están iniciando más o menos etapas?
    const n = this.rango();
    const anteriores = this.ultimosMeses(n * 2).claves.slice(0, n);
    const antes = suma(this.conteoPorMes(anteriores));
    const ahora = suma(iniciadas);
    const periodo = `los ${n} meses anteriores`;
    if (!antes && !ahora) this.comparacion.set({ pct: null, tendencia: 'flat', texto: 'Sin etapas iniciadas en este periodo ni en el anterior' });
    else if (!antes) this.comparacion.set({ pct: null, tendencia: 'up', texto: `${ahora} ${ahora === 1 ? 'etapa iniciada' : 'etapas iniciadas'}; en ${periodo} no hubo` });
    else {
      const pct = Math.round(((ahora - antes) / antes) * 100);
      this.comparacion.set({
        pct: Math.abs(pct), tendencia: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
        texto: pct === 0 ? `Igual que ${periodo}` : `${Math.abs(pct)}% ${pct > 0 ? 'más' : 'menos'} etapas iniciadas que en ${periodo}`,
      });
    }
    this.chartDataEvolucion = {
      labels: etiquetas,
      datasets: [
        { label: 'Iniciadas', data: iniciadas, borderColor: SP.verde, backgroundColor: this.degradado(SP.verde, 0.55), fill: 'origin', pointBackgroundColor: SP.verde },
        { label: 'Certificadas', data: certificadas, borderColor: this.colorSecundario, backgroundColor: this.degradado(this.colorSecundario, 0.45), fill: 'origin', pointBackgroundColor: this.colorSecundario },
      ],
    };
  }

  /** Últimos 8 meses: de las etapas que iniciaron cada mes, en qué estado están hoy. */
  private buildChartBarras(): void {
    const { claves, etiquetas } = this.ultimosMeses(8);
    const serie = (cat: string, label: string, color: string) => ({
      // 0 → null: una barra en 0 con bordes redondeados dibuja una rayita.
      label, data: this.conteoPorMes(claves, cat).map((v) => v || null), backgroundColor: color, hoverBackgroundColor: color, stack: 'e',
    });
    this.chartDataBarras = {
      labels: etiquetas,
      datasets: [
        serie('activa', 'Activas', SP.verde),
        serie('certificada', 'Certificadas', SP.morado),
        serie('enRiesgo', 'En riesgo', SP.ambar),
        serie('desertada', 'Desertadas', SP.rojo),
      ],
    };
  }

  /** "Terminan pronto" y "Empresas con más aprendices", de las mismas prácticas ya cargadas. */
  private buildListas(): void {
    const hoy = new Date();
    const hoyUtc = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    this.terminanPronto = this.practicas
      .filter((p) => categorizarEstado(p.estado) === 'activa' && /^\d{4}-\d{2}-\d{2}/.test(p.fecha_fin ?? ''))
      .map((p) => {
        const [a, m, d] = p.fecha_fin.slice(0, 10).split('-').map(Number);
        return { nombre: p.nombre, empresaNombre: p.empresaNombre, dias: Math.round((Date.UTC(a, m - 1, d) - hoyUtc) / 86_400_000) };
      })
      .filter((p) => p.dias >= 0 && p.dias <= 30)
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 5);
    const porEmpresa = new Map<string, number>();
    for (const p of this.practicas) {
      if (!p.empresaNombre || p.empresaNombre === '—') continue;
      porEmpresa.set(p.empresaNombre, (porEmpresa.get(p.empresaNombre) ?? 0) + 1);
    }
    this.topEmpresas = [...porEmpresa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
      .map(([nombre, total]) => ({ nombre, total }));
  }

  /** Mes a mes: etapas iniciadas este año contra el año pasado. */
  private buildChartComparativo(): void {
    const anio = this.anioActual;
    const clavesDe = (a: number) => MESES.map((_, i) => `${a}-${String(i + 1).padStart(2, '0')}`);
    const hoyMes = new Date().getMonth();
    const actual = this.conteoPorMes(clavesDe(anio)).map((v, i) => (i <= hoyMes ? v : null));
    const anterior = this.conteoPorMes(clavesDe(anio - 1));
    // Sin datos del año pasado la comparación no dice nada y repite la gráfica grande: se oculta.
    this.hayAnioAnterior = anterior.some((v) => v > 0);
    const fondoPunto = this.oscuro ? '#181818' : '#ffffff';
    this.chartDataComparativo = {
      labels: MESES,
      datasets: [
        { label: String(anio), data: actual, borderColor: SP.verde, backgroundColor: SP.verde, pointBackgroundColor: fondoPunto, pointBorderColor: SP.verde, spanGaps: false },
        { label: String(anio - 1), data: anterior, borderColor: this.conAlfa(SP.verde, 0.45), backgroundColor: this.conAlfa(SP.verde, 0.45), pointBackgroundColor: this.conAlfa(SP.verde, 0.45), pointBorderColor: 'transparent', pointRadius: 3 },
      ],
    };
  }

  textoComparativo(): string {
    const hoyMes = new Date().getMonth();
    const claves = (a: number) => MESES.slice(0, hoyMes + 1).map((_, i) => `${a}-${String(i + 1).padStart(2, '0')}`);
    const este = this.conteoPorMes(claves(this.anioActual)).reduce((a, b) => a + b, 0);
    const pasado = this.conteoPorMes(claves(this.anioActual - 1)).reduce((a, b) => a + b, 0);
    if (!este && !pasado) return 'Etapas prácticas iniciadas por mes';
    if (!pasado) return `${este} ${este === 1 ? 'etapa iniciada' : 'etapas iniciadas'} en lo que va del año (el año pasado no hubo)`;
    const dif = Math.round(((este - pasado) / pasado) * 100);
    return dif === 0
      ? 'Mismo ritmo de inicio que el año pasado a esta altura'
      : `${Math.abs(dif)}% ${dif > 0 ? 'más' : 'menos'} etapas iniciadas que el año pasado a esta altura`;
  }

  /** "12%", "<1%" cuando hay algo pero redondea a 0, "0%". */
  private pct(n: number, total: number): string {
    if (!total || !n) return '0%';
    const p = (n / total) * 100;
    return p < 1 ? '<1%' : `${Math.round(p)}%`;
  }

  private spark(datos: number[], color: string, etiquetas: string[]) {
    return {
      labels: etiquetas,
      datasets: [{
        data: datos, borderColor: color, backgroundColor: this.degradado(color, 0.18), fill: 'origin',
        pointBackgroundColor: this.oscuro ? '#181818' : '#ffffff', pointBorderColor: color,
      }],
    };
  }

  /** Tarjetas de arriba: cifra, píldora, titular, detalle y mini-gráfica de los últimos 6 meses (datos reales). */
  private buildKpis(): void {
    const s = this.stats;
    const total = s.aprendices;
    const { claves, etiquetas } = this.ultimosMeses(6);
    const iniciadas = this.conteoPorMes(claves);
    const nuevosMes = iniciadas[iniciadas.length - 1];
    const conEtapa = this.practicas.length;
    // Los % de las etapas van sobre las ETAPAS, no sobre todos los aprendices
    // del centro (casi ninguno está en etapa práctica: siempre salía "<1%").
    const etapas = Math.max(conEtapa, s.activas + s.certificadas + s.desertadas + s.enRiesgo);
    const azul = this.oscuro ? '#509bf5' : SP.azul;
    const prev = new Map(this.kpis.map((k) => [k.key, k.mostrado]));
    const hay = this.practicas.length > 0;

    this.kpis = [
      {
        key: 'aprendices', label: this.esInstructor() ? 'Mis aprendices' : 'Total aprendices', valor: total, mostrado: 0,
        color: SP.verde, pill: `${this.pct(conEtapa, total)} con etapa`, tendencia: nuevosMes ? 'up' : 'flat',
        titular: nuevosMes ? `${nuevosMes} iniciaron etapa este mes` : 'Sin inicios de etapa este mes',
        detalle: this.esInstructor() ? 'Aprendices de tus fichas' : 'Aprendices registrados en el centro',
        spark: hay ? this.spark(iniciadas, SP.verde, etiquetas) : null,
      },
      {
        key: 'activas', label: 'Etapas activas', valor: s.activas, mostrado: 0,
        color: azul, pill: this.pct(s.activas, etapas), tendencia: s.activas ? 'up' : 'flat',
        titular: s.activas ? 'En empresa ahora' : 'Ninguna en curso',
        detalle: `${this.pct(s.activas, etapas)} de las etapas prácticas`,
        spark: hay ? this.spark(this.conteoPorMes(claves, 'activa'), azul, etiquetas) : null,
      },
      {
        key: 'desertadas', label: 'Etapas desertadas', valor: s.desertadas, mostrado: 0,
        color: SP.rojo, pill: this.pct(s.desertadas, etapas), tendencia: s.desertadas ? 'down' : 'flat',
        titular: s.desertadas ? 'Requiere atención' : 'Sin deserciones',
        detalle: `${this.pct(s.desertadas, etapas)} de las etapas prácticas`,
        spark: hay ? this.spark(this.conteoPorMes(claves, 'desertada'), SP.rojo, etiquetas) : null,
      },
      {
        key: 'certificadas', label: 'Etapas certificadas', valor: s.certificadas, mostrado: 0,
        color: SP.morado, pill: this.pct(s.certificadas, etapas), tendencia: s.certificadas ? 'up' : 'flat',
        titular: s.certificadas ? 'Terminaron con éxito' : 'Aún sin certificaciones',
        detalle: `${this.pct(s.certificadas, etapas)} de las etapas prácticas`,
        spark: hay ? this.spark(this.conteoPorMes(claves, 'certificada'), SP.morado, etiquetas) : null,
      },
    ];
    this.animarCifras(prev);
  }

  /** Las cifras suben desde lo que se veía (0 la primera vez) hasta su valor: el panel se siente vivo. */
  private animarCifras(desde: Map<string, number>): void {
    const reducir = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const inicio = performance.now();
    const dur = 900;
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      for (const k of this.kpis) {
        const a = desde.get(k.key) ?? 0;
        k.mostrado = reducir ? k.valor : Math.round(a + (k.valor - a) * e);
      }
      if (t < 1 && !reducir) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  /** Chart.js pinta en canvas y no entiende var(): se lee el token ya
   *  resuelto (ThemeService lo emite como hex) para que siga al color de acento. */
  private tokenColor(nombre: string, respaldo: string): string {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : respaldo;
  }

  private buildChartPersonal(): void {
    const avance = this.miPractica?.avance ?? 0;
    this.chartDataPersonal = {
      labels: ['Completado', 'Pendiente'],
      datasets: [{
        data: [avance, 100 - avance],
        backgroundColor: [this.tokenColor('--accent-brand', '#39A900'), this.tokenColor('--border', '#e2e8f0')],
        hoverBackgroundColor: [this.tokenColor('--accent-brand-dark', '#2d8600'), this.tokenColor('--border-strong', '#d1d5db')],
        borderWidth: 0
      }]
    };
  }

  constructor(
    private statsService:  StatsService,
    private apiService:    ApiService,
    private exportService: ExportService,
    private auth:          AuthService,
    private toast:         ToastService,
  ) {}

  ngOnInit(): void {
    // Este gate por aplicativo SOLO aplica a admin (ver doc de esHorariosOnly).
    // Aprendiz e instructor siempre intentan cargar sus datos de Etapa
    // Práctica: el aprendiz los necesita para decidir qué vista mostrar, y
    // el instructor los necesita para su home combinado. Las llamadas HTTP
    // ya devuelven [] silenciosamente si el rol no tiene permiso (ver
    // ApiService.listarPracticas/listarTodasMatriculas), así que no hay
    // riesgo de mostrar un error por esto.
    if (this.esAdmin() && !this.auth.perteneceAplicativo('Etapa Práctica')) {
      this.cargando = false;
      return;
    }

    this.statsService.getDashboardData().subscribe({
      next: ({ stats, etapaActiva, etapaCertificada }) => {
        this.stats            = stats;
        this.etapaActiva      = etapaActiva;
        this.etapaCertificada = etapaCertificada;
        this.cargando         = false;
        this.buildCharts();
        this.buildKpis();
      },
      error: () => { this.cargando = false; }
    });

    cargarPracticasPanel(this.apiService, this.auth).then((practicas) => {
      this.practicas = practicas;

      if (this.esAprendiz()) {
        this.aprendizTieneEtapa.set(this.practicas.length > 0);
        if (this.practicas.length > 0) {
          this.miPractica = this.practicas[0];
          this.buildChartPersonal();
        }
      } else {
        this.buildChartEvolucion();
        this.buildChartComparativo();
        this.buildChartBarras();
        this.buildListas();
        this.buildCharts();
        this.buildKpis();
      }

    }).catch((err) => {
      log.error('Error cargando datos para home:', err);
      if (this.esAprendiz()) {
        // Para el aprendiz, no poder determinar su etapa no es un error
        // visible — simplemente se le muestra el home de Horarios.
        this.aprendizTieneEtapa.set(false);
      } else {
        this.toast.httpError(err, 'No se pudieron cargar los datos del panel.');
      }
    });
  }

  // Reemplaza el método capturarGraficos existente por este:
private capturarGraficos() {
  // ── Evolución mensual: datos crudos para gráficos NATIVOS de Excel ──
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const actPorMes = new Array(12).fill(0);
  const certPorMes = new Array(12).fill(0);

  this.practicas.forEach(p => {
    if (!p.fecha_inicio) return;
    const m = new Date(p.fecha_inicio).getMonth();
    if (isNaN(m)) return;
    const cat = categorizarEstado(p.estado);
    if (cat === 'activa') actPorMes[m]++;
    else if (cat === 'certificada') certPorMes[m]++;
  });

  let aA = 0, aC = 0;

  return {
    imgEstados:    this.chartEstadosRef?.getBase64Image(),
    imgEvolucion:  this.chartEvolucionRef?.getBase64Image(),
    estadosResumen: this.estadosResumen,
    evolucionMensual: {
      labels:       meses,
      activas:      actPorMes.map(v => aA += v),
      certificadas: certPorMes.map(v => aC += v),
    },
  };
}

  /**
   * exportarPDF es async: antes no se esperaba, así que el aviso "PDF generado"
   * salía antes de terminar y un fallo nunca llegaba al catch.
   */
  async exportarPDF(): Promise<void> {
    if (this.exportando) return;
    this.exportando = true;
    try {
      await this.exportService.exportarPDF(
        this.stats, this.etapaActiva, this.etapaCertificada, this.practicas,
        this.capturarGraficos()
      );
      this.toast.ok('PDF generado', 'El reporte fue exportado correctamente.');
    } catch (e) {
      console.error('[panel] exportar PDF falló', e);
      this.toast.error('Error', 'No se pudo generar el PDF.');
    } finally {
      this.exportando = false;
    }
  }

  async exportarExcel(): Promise<void> {
    if (this.exportando) return;
    this.exportando = true;
    try {
      await this.exportService.exportarExcel(
        this.stats, this.etapaActiva, this.etapaCertificada, this.practicas,
        this.capturarGraficos()
      );
      this.toast.ok('Excel generado', 'El reporte fue exportado correctamente.');
    } catch (e) {
      console.error('[panel] exportar Excel falló', e);
      this.toast.error('Error', 'No se pudo generar el archivo Excel.');
    } finally {
      this.exportando = false;
    }
  }
}
