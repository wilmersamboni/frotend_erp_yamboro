import { Component, OnInit, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from 'primeng/card';
import { UIChart } from 'primeng/chart';
import { ProgressBar } from 'primeng/progressbar';
import { Button } from 'primeng/button';
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

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, Card, UIChart, ProgressBar, Button, SplitButton, Skeleton, Tag, HorariosHomeComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
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
    { label: 'Exportar PDF',   icon: 'pi pi-file-pdf',   command: () => this.exportarPDF()   },
    { label: 'Exportar Excel', icon: 'pi pi-file-excel', command: () => this.exportarExcel() },
  ];

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
        ticks: { font: { size: 11, family: 'Inter' }, color: '#94a3b8' }
      },
      y: {
        grid: { color: '#f1f5f9' },
        border: { display: false },
        ticks: { stepSize: 1, font: { size: 11, family: 'Inter' }, color: '#94a3b8' },
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
    const total       = Math.max(this.stats.aprendices, 1);
    const activo      = this.stats.activas;
    const certificado = this.stats.certificadas;
    const desertado   = this.stats.desertadas;
    const enRiesgo    = this.stats.enRiesgo;
    // "Otros" ahora es de verdad un remanente (inactivo, por certificar, sin
    // estado, etc.) — antes 'suspendido'/'condicionado' quedaban escondidos
    // acá también, mezclados con casos ya cerrados sin ninguna distinción.
    const otros = Math.max(0, this.stats.aprendices - activo - certificado - desertado - enRiesgo);

    const items = [
      { key: 'activo',      label: 'Activas',        total: activo,      icon: 'pi-clipboard',            color: '#3b82f6', bg: '#eff6ff' },
      { key: 'certificado', label: 'Certificadas',    total: certificado, icon: 'pi-check-circle',         color: '#a855f7', bg: '#faf5ff' },
      { key: 'desertado',   label: 'Desertadas',      total: desertado,   icon: 'pi-times-circle',         color: '#f97316', bg: '#fff7ed' },
      { key: 'enRiesgo',    label: 'En riesgo',       total: enRiesgo,    icon: 'pi-exclamation-triangle', color: '#f59e0b', bg: '#fffbeb' },
      { key: 'otros',       label: 'Otros estados',   total: otros,       icon: 'pi-ellipsis-h',           color: '#64748b', bg: '#f1f5f9' },
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
        borderWidth: 0,
      }]
    };
  }

  /**
   * No hay tabla de histórico/snapshots mensuales en el backend, así que la
   * "evolución" se aproxima agrupando las etapas por el mes de su
   * fecha_inicio y acumulando el conteo mes a mes según su estado ACTUAL
   * (activa o certificada) — no es un histórico día a día real.
   */
  private buildChartEvolucion(): void {
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const activasPorMes      = new Array(12).fill(0);
    const certificadasPorMes = new Array(12).fill(0);

    this.practicas.forEach(p => {
      if (!p.fecha_inicio) return;
      const mes = new Date(p.fecha_inicio).getMonth();
      if (isNaN(mes)) return;

      // Antes esta lista de estados no coincidía con la de StatsService
      // ('inactivo' contaba como "activa" acá pero no en la tarjeta KPI) —
      // la tarjeta "Etapas Activas" y el punto final de esta misma línea
      // terminaban mostrando números distintos para lo mismo.
      const cat = categorizarEstado(p.estado);
      if (cat === 'activa') activasPorMes[mes]++;
      else if (cat === 'certificada') certificadasPorMes[mes]++;
    });

    let accActiva = 0;
    let accCert   = 0;
    const activasAcum      = activasPorMes.map(v => (accActiva += v));
    const certificadasAcum = certificadasPorMes.map(v => (accCert += v));

    this.chartDataEvolucion = {
      labels: meses,
      datasets: [
        {
          label: 'Etapas Activas',
          data: activasAcum,
          borderColor: '#39A900',
          backgroundColor: 'rgba(57,169,0,0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#39A900',
        },
        {
          label: 'Etapas Certificadas',
          data: certificadasAcum,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#2563eb',
        },
      ]
    };
  }

  private buildChartPersonal(): void {
    const avance = this.miPractica?.avance ?? 0;
    this.chartDataPersonal = {
      labels: ['Completado', 'Pendiente'],
      datasets: [{
        data: [avance, 100 - avance],
        backgroundColor: ['#39A900', '#e2e8f0'],
        hoverBackgroundColor: ['#2d8600', '#d1d5db'],
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
      },
      error: () => { this.cargando = false; }
    });

    const puedeVerEmpresas = this.auth.hasRole(['administrador', 'instructor']);

    Promise.all([
      this.apiService.listarPracticas(),
      puedeVerEmpresas ? this.apiService.listarEmpresas() : Promise.resolve([]),
      this.apiService.listarTodasMatriculas(),
    ]).then(([practicas, empresas, matriculas]: [any[], any[], any[]]) => {

      const empresaMap = new Map<string, string>(
        empresas.map((e: any) => [
          e.id,
          e.nombre ?? e.razon_social ?? e.nombreEmpresa ?? e.name ?? e.id
        ])
      );

      const matriculaMap = new Map<string, any>(
        matriculas.map((m: any) => [m.idMatricula ?? m.id, m])
      );

      this.practicas = practicas.map((p: any) => {
        const matricula = matriculaMap.get(p.matriculaId);
        const persona   = matricula?.persona;
        const curso     = matricula?.curso;

        return {
          ...p,
          empresaNombre:  empresaMap.get(p.empresa?.id) ?? p.empresa?.nombre ?? '—',
          nombre:         persona
            ? `${persona.nombres ?? persona.nombre ?? ''} ${persona.apellidos ?? persona.apellido ?? ''}`.trim()
            : '—',
          identificacion: persona?.cedula        ?? persona?.documento      ?? '—',
          ficha:          curso?.codigo          ?? curso?.numeroFicha      ?? curso?.ficha ?? '—',
          programa:       curso?.programa?.nombre ?? curso?.nombrePrograma  ?? '—',
        };
      });

      if (this.esAprendiz()) {
        this.aprendizTieneEtapa.set(this.practicas.length > 0);
        if (this.practicas.length > 0) {
          this.miPractica = this.practicas[0];
          this.buildChartPersonal();
        }
      } else {
        this.buildChartEvolucion();
      }

    }).catch((err) => {
      console.error('Error cargando datos para home:', err);
      if (this.esAprendiz()) {
        // Para el aprendiz, no poder determinar su etapa no es un error
        // visible — simplemente se le muestra el home de Horarios.
        this.aprendizTieneEtapa.set(false);
      } else {
        this.toast.error('Error', 'No se pudieron cargar los datos del panel.');
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

  exportarPDF(): void {
    this.exportando = true;
    setTimeout(() => {
      try {
        this.exportService.exportarPDF(
          this.stats, this.etapaActiva, this.etapaCertificada, this.practicas,
          this.capturarGraficos()
        );
        this.toast.ok('PDF generado', 'El reporte fue exportado correctamente.');
      } catch {
        this.toast.error('Error', 'No se pudo generar el PDF.');
      } finally {
        this.exportando = false;
      }
    }, 100);
  }

  exportarExcel(): void {
    this.exportando = true;
    this.exportService.exportarExcel(
      this.stats, this.etapaActiva, this.etapaCertificada, this.practicas,
      this.capturarGraficos()
    ).then(() => {
      this.exportando = false;
      this.toast.ok('Excel generado', 'El reporte fue exportado correctamente.');
    }).catch(() => {
      this.exportando = false;
      this.toast.error('Error', 'No se pudo generar el archivo Excel.');
    });
  }
}
