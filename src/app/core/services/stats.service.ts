import { Injectable } from '@angular/core';
import { Observable, forkJoin, map, from } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export type EstadoCategoria = 'activa' | 'certificada' | 'desertada' | 'enRiesgo' | 'otra';

/**
 * Clasificación única de estados de etapa práctica. Antes cada consumidor
 * (StatsService, el gráfico de evolución en vivo de home.component.ts, y de
 * nuevo la versión que arma para el PDF/Excel exportado) tenía su propia
 * lista de estados por categoría, y no coincidían entre sí — p.ej.
 * 'inactivo' contaba como "activa" en el gráfico de evolución pero no en
 * las tarjetas KPI, así que la tarjeta "Etapas Activas" y la línea de
 * evolución del mismo reporte terminaban mostrando números distintos para
 * lo mismo. Todo el mundo debe importar esta función en vez de mantener su
 * propia copia de la lista de estados.
 *
 * 'suspendido'/'condicionado' se tratan como categoría propia ("en riesgo")
 * en vez de mezclarse en un cajón de "otros" — son los estados más
 * accionables para un coordinador (requieren seguimiento), a diferencia de
 * 'cancelado'/'retiro voluntario' (casos ya cerrados, se cuentan como
 * desertada) o 'inactivo'/'por certificar' (quedan en "otra").
 */
export function categorizarEstado(estado: string | null | undefined): EstadoCategoria {
  const e = (estado ?? '').toLowerCase().trim();
  if (['activo', 'activa', 'en_curso', 'en curso'].includes(e)) return 'activa';
  if (['certificado', 'certificada', 'completada', 'completado'].includes(e)) return 'certificada';
  if ([
    'desercion', 'deserción', 'desertada', 'desertado',
    'retirado', 'retirada', 'retiro voluntario', 'cancelado',
  ].includes(e)) return 'desertada';
  if (['suspendido', 'suspendida', 'condicionado', 'condicionada'].includes(e)) return 'enRiesgo';
  return 'otra';
}

export interface Stats {
  aprendices:   number;
  activas:      number;
  certificadas: number;
  desertadas:   number;
  /** Suspendidas o condicionadas — requieren seguimiento del coordinador. */
  enRiesgo:     number;
}

export interface DonaStats {
  total: number;
  porcentaje: number;
}

export interface DashboardData {
  stats: Stats;
  etapaActiva: DonaStats;
  etapaCertificada: DonaStats;
}

@Injectable({ providedIn: 'root' })
export class StatsService {

  constructor(private apiService: ApiService, private auth: AuthService) {}

  // Mantener por compatibilidad
  getStats(): Observable<Stats> {
    return this.getDashboardData().pipe(map(d => d.stats));
  }

  getDashboardData(): Observable<DashboardData> {
    return forkJoin({
      aprendices: from(this.apiService.listarAprendices()),
      practicas:  from(this.apiService.listarPracticas()),
    }).pipe(
      map(({ aprendices, practicas }) => {

        // Para instructor, "Mis Aprendices" debe contar SOLO los suyos:
        // listarAprendices() trae todo el centro sin filtrar, pero
        // listarPracticas() ya viene limitado por RLS a las etapas
        // asignadas a este instructor — contamos matrículas únicas ahí.
        const esInstructor = this.auth.cargo() === 'instructor';
        const totalAprendices = esInstructor
          ? new Set(practicas.map((p: any) => p.matriculaId)).size
          : aprendices.length;

        const activas      = practicas.filter((p: any) => categorizarEstado(p.estado) === 'activa');
        const certificadas = practicas.filter((p: any) => categorizarEstado(p.estado) === 'certificada');
        const desertadas   = practicas.filter((p: any) => categorizarEstado(p.estado) === 'desertada');
        const enRiesgo     = practicas.filter((p: any) => categorizarEstado(p.estado) === 'enRiesgo');

        const stats: Stats = {
          aprendices:   totalAprendices,
          activas:      activas.length,
          certificadas: certificadas.length,
          desertadas:   desertadas.length,
          enRiesgo:     enRiesgo.length,
        };

        const base = totalAprendices || 1;

        const etapaActiva: DonaStats = {
          total: activas.length,
          porcentaje: Math.round((activas.length / base) * 100)
        };

        const etapaCertificada: DonaStats = {
          total: certificadas.length,
          porcentaje: Math.round((certificadas.length / base) * 100)
        };

        return { stats, etapaActiva, etapaCertificada };
      })
    );
  }
}
