import { Component, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from 'primeng/card';
import { UIChart } from 'primeng/chart';
import { Skeleton } from 'primeng/skeleton';
import { AuthService } from '../../core/services/auth.service';
import { HorariosApiService } from '../../core/services/horarios/horarios-api.service';
import { ErpCatalogoService } from '../../core/services/horarios/erp-catalogo.service';

const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DIAS_SEMANA_CORTOS: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb',
};
const DIAS_SEMANA_LARGOS: Record<string, string> = {
  domingo: 'Domingo', lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
  jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado',
};
const JORNADA_LABELS: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };

/** Home específico para usuarios del aplicativo "Horarios" (no Etapa Práctica). */
@Component({
  selector: 'app-horarios-home',
  standalone: true,
  imports: [CommonModule, Card, UIChart, Skeleton],
  templateUrl: './horarios-home.component.html',
  styleUrls: ['./horarios-home.component.css', './home.component.css'],
})
export class HorariosHomeComponent implements OnInit {

  cargando = true;

  fecha = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  readonly esAprendiz   = computed(() => this.auth.cargo() === 'aprendiz');
  readonly esInstructor = computed(() => this.auth.cargo() === 'instructor');
  readonly esAdmin      = computed(() => this.auth.isAdmin());

  // ── Catálogos compartidos ────────────────────────────────────────────────
  private fichasMap       = new Map<string, string>();
  private ambientesMap    = new Map<string, string>();
  private instructoresMap = new Map<string, string>();

  // ── Vista Admin ──────────────────────────────────────────────────────────
  statsHorarios          = { total: 0, activos: 0 };
  enCursoAhora           = 0;
  eventosProximos        = 0;
  porcentajeActivos        = 0;
  porcentajeConAmbiente    = 0;
  porcentajeConInstructor  = 0;

  // ── Vista Instructor ─────────────────────────────────────────────────────
  misHorariosActivos       = 0;
  misHorariosHoy: any[] = [];

  // ── Vista Aprendiz ───────────────────────────────────────────────────────
  miFicha: any = null;
  horarioSemanal: any[] = [];
  clasesHoyCount     = 0;
  instructoresUnicos = 0;
  ambientesUnicos    = 0;
  miProximaClase: any = null;

  // ── Charts ───────────────────────────────────────────────────────────────
  chartDataDias:         any = null;
  chartDataJornada:      any = null;

  chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: { legend: { display: false }, tooltip: { enabled: true } }
  };

  chartOptionsBar = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
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

  constructor(
    public auth:              AuthService,
    private horariosApi:      HorariosApiService,
    private erpCatalogo:      ErpCatalogoService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const [fichas, ambientes, instructores] = await Promise.all([
        this.erpCatalogo.getFichas().catch(() => []),
        this.erpCatalogo.getAmbientes().catch(() => []),
        this.erpCatalogo.getInstructores().catch(() => []),
      ]);
      this.fichasMap       = new Map(fichas.map((f: any) => [f.id, f.codigo]));
      this.ambientesMap    = new Map(ambientes.map((a: any) => [a.id, a.nombre]));
      this.instructoresMap = new Map(instructores.map((i: any) => [i.id, `${i.nombre} ${i.apellido}`.trim()]));

      if (this.esAdmin())           await this.cargarAdmin();
      else if (this.esInstructor()) await this.cargarInstructor();
      else if (this.esAprendiz())   await this.cargarAprendiz();
    } finally {
      this.cargando = false;
    }
  }

  // ── Carga por rol ────────────────────────────────────────────────────────

  private async cargarAdmin(): Promise<void> {
    const [statsH, disponiblesAhora, eventos, horarios] = await Promise.all([
      this.horariosApi.getHorariosStats().catch(() => ({ total: 0, activos: 0 })),
      this.horariosApi.getHorariosDisponiblesAhora().catch(() => []),
      this.horariosApi.getEventos().catch(() => []),
      this.horariosApi.getHorarios().catch(() => []),
    ]);

    this.statsHorarios = statsH;
    this.enCursoAhora  = disponiblesAhora.length;

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    this.eventosProximos = eventos.filter((e: any) => {
      const f = e.fechaInicio ? new Date(e.fechaInicio) : null;
      return !!f && f >= hoy;
    }).length;

    const total = Math.max(horarios.length, 1);
    this.porcentajeActivos       = Math.round((horarios.filter((h: any) => h.activo).length / total) * 100);
    this.porcentajeConAmbiente   = Math.round((horarios.filter((h: any) => h.ambienteId).length / total) * 100);
    this.porcentajeConInstructor = Math.round((horarios.filter((h: any) => h.instructorId).length / total) * 100);

    this.buildChartDias(horarios);
    this.buildChartJornada(horarios);
  }

  private async cargarInstructor(): Promise<void> {
    const id = this.auth.user()?.personaId;
    if (!id) return;

    const horarios = await this.horariosApi.getHorariosByInstructor(id).catch(() => []);

    this.misHorariosActivos = horarios.filter((h: any) => h.activo).length;

    const hoyDia = this.diaActual();
    this.misHorariosHoy = horarios
      .filter((h: any) => h.diaSemana === hoyDia)
      .sort((a: any, b: any) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''));

    this.buildChartJornada(horarios);
  }

  private async cargarAprendiz(): Promise<void> {
    const personaId = this.auth.user()?.personaId;
    if (!personaId) return;

    const matriculas = await this.erpCatalogo.getMatriculasDePersona(personaId).catch(() => []);
    const activa = matriculas.find((m: any) => m.ficha) ?? null;
    if (!activa?.ficha) return;
    this.miFicha = activa.ficha;

    const horarios = await this.horariosApi.getHorariosByFicha(activa.ficha.id).catch(() => []);
    this.horarioSemanal = [...horarios].sort((a: any, b: any) =>
      DIAS_SEMANA.indexOf(a.diaSemana) - DIAS_SEMANA.indexOf(b.diaSemana) ||
      (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''));

    const hoyDia = this.diaActual();
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const clasesHoy = this.horarioSemanal.filter((h: any) => h.diaSemana === hoyDia);
    this.clasesHoyCount = clasesHoy.length;
    this.miProximaClase = clasesHoy.find((h: any) => {
      const [hh, mm] = (h.horaInicio ?? '00:00').split(':').map(Number);
      return (hh * 60 + mm) >= nowMin;
    }) ?? null;

    this.instructoresUnicos = new Set(horarios.map((h: any) => h.instructorId).filter(Boolean)).size;
    this.ambientesUnicos    = new Set(horarios.map((h: any) => h.ambienteId).filter(Boolean)).size;

    this.buildChartJornada(horarios);
  }

  // ── Construcción de charts ───────────────────────────────────────────────

  private buildChartDias(horarios: any[]): void {
    const conteo: Record<string, number> = { lunes: 0, martes: 0, miercoles: 0, jueves: 0, viernes: 0, sabado: 0 };
    horarios.forEach((h: any) => { if (conteo[h.diaSemana] !== undefined) conteo[h.diaSemana]++; });

    this.chartDataDias = {
      labels: DIAS_SEMANA.map(d => DIAS_SEMANA_CORTOS[d]),
      datasets: [{
        label: 'Horarios',
        data: DIAS_SEMANA.map(d => conteo[d]),
        backgroundColor: 'rgba(57,169,0,0.85)',
        borderRadius: 8,
        borderSkipped: false,
      }],
    };
  }

  private buildChartJornada(horarios: any[]): void {
    const conteo: Record<string, number> = { manana: 0, tarde: 0, noche: 0 };
    horarios.forEach((h: any) => { if (conteo[h.jornada] !== undefined) conteo[h.jornada]++; });

    this.chartDataJornada = {
      labels: ['Mañana', 'Tarde', 'Noche'],
      datasets: [{
        data: [conteo['manana'], conteo['tarde'], conteo['noche']],
        backgroundColor: ['#39A900', '#3b82f6', '#a855f7'],
        hoverBackgroundColor: ['#2d8600', '#2563eb', '#9333ea'],
        borderWidth: 0,
      }],
    };
  }

  // ── Helpers de presentación ──────────────────────────────────────────────

  private diaActual(): string {
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    return dias[new Date().getDay()];
  }

  diaLabel(dia: string): string     { return DIAS_SEMANA_LARGOS[dia] ?? dia; }
  jornadaLabel(jornada: string): string { return JORNADA_LABELS[jornada] ?? jornada; }
  fichaCodigo(fichaId: string): string       { return this.fichasMap.get(fichaId) ?? '—'; }
  ambienteNombre(ambienteId: string): string { return this.ambientesMap.get(ambienteId) ?? '—'; }
  instructorNombre(instructorId: string): string { return this.instructoresMap.get(instructorId) ?? '—'; }
}
