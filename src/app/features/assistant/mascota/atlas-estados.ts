/**
 * Estados de Atlas, la mascota del chat, y la lógica que NO depende de WebGL
 * (para poder probarla sin navegador): los parámetros de cada estado y la
 * máquina que decide cuál está activo.
 *
 * - `reposo` y `pensando` son estados de fondo: duran hasta que alguien cambia.
 * - `saludo`, `feliz` y `error` son transitorios: duran un rato y vuelven al de
 *   fondo. Un transitorio nuevo reemplaza al anterior.
 */
export type EstadoAtlas = 'saludo' | 'reposo' | 'pensando' | 'feliz' | 'error';
export type EstadoBase = 'reposo' | 'pensando';
export type EstadoTransitorio = 'saludo' | 'feliz' | 'error';

/** A dónde tiende cada rasgo de la mascota en un estado (la escena lo suaviza con damp). */
export interface ParametrosEstado {
  /** Escala vertical de los ojos: 1 normales, <1 entrecerrados (feliz). */
  ojoAbierto: number;
  /** Inclinación de los ojos en radianes (espejada en el izquierdo): + alegres, − tristes. */
  ojoInclinacion: number;
  /** Escala vertical de la boca: >0 sonrisa, <0 ceño. */
  sonrisa: number;
  /** 0 = sin boca, 1 = boca completa. */
  bocaVisible: number;
  /** Intensidad base de la bombilla de la antena. */
  brilloAntena: number;
  /** Frecuencia del pulso de la bombilla (rad/s). */
  pulsoAntena: number;
  /** 0 = sin órbitas, 1 = tres puntos girando alrededor de la cabeza. */
  orbita: number;
  /** Cabeza levantada al pensar (radianes de pitch, negativo = hacia arriba). */
  miradaArriba: number;
  /** Color de ojos y antena. */
  tono: 'verde' | 'ambar';
}

export const PARAMETROS: Record<EstadoAtlas, ParametrosEstado> = {
  saludo: { ojoAbierto: 1, ojoInclinacion: 0.18, sonrisa: 1, bocaVisible: 1, brilloAntena: 1.6, pulsoAntena: 5, orbita: 0, miradaArriba: 0, tono: 'verde' },
  reposo: { ojoAbierto: 1, ojoInclinacion: 0, sonrisa: 0.55, bocaVisible: 1, brilloAntena: 0.9, pulsoAntena: 2.2, orbita: 0, miradaArriba: 0, tono: 'verde' },
  pensando: { ojoAbierto: 0.85, ojoInclinacion: -0.05, sonrisa: 0.2, bocaVisible: 0.4, brilloAntena: 1.5, pulsoAntena: 9, orbita: 1, miradaArriba: -0.22, tono: 'verde' },
  feliz: { ojoAbierto: 0.34, ojoInclinacion: 0.32, sonrisa: 1.25, bocaVisible: 1, brilloAntena: 2, pulsoAntena: 7, orbita: 0, miradaArriba: 0, tono: 'verde' },
  error: { ojoAbierto: 0.7, ojoInclinacion: -0.32, sonrisa: -0.7, bocaVisible: 1, brilloAntena: 1.3, pulsoAntena: 11, orbita: 0, miradaArriba: 0.1, tono: 'ambar' },
};

/** Segundos que dura cada estado transitorio. */
export const DURACION_TRANSITORIO: Record<EstadoTransitorio, number> = {
  saludo: 1.9,
  feliz: 1.8,
  error: 2.6,
};

/**
 * Decide qué estado está activo. El tiempo lo pone quien la usa (segundos de la
 * escena, o del reloj en el respaldo CSS), así que es determinista y probable.
 */
export class MaquinaEstado {
  private base: EstadoBase = 'reposo';
  private transitorio: EstadoTransitorio | null = null;
  private hasta = 0;

  /** Empezar a pensar corta el transitorio en curso (el usuario acaba de hacer algo nuevo, p. ej. escribir durante el saludo). */
  pensar(activo: boolean): void {
    this.base = activo ? 'pensando' : 'reposo';
    if (activo) this.transitorio = null;
  }

  disparar(estado: EstadoTransitorio, ahora: number): void {
    this.transitorio = estado;
    this.hasta = ahora + DURACION_TRANSITORIO[estado];
  }

  actual(ahora: number): EstadoAtlas {
    if (this.transitorio && ahora >= this.hasta) this.transitorio = null;
    return this.transitorio ?? this.base;
  }
}

/** Salida suave con un pequeño rebote al final (para la entrada de la mascota). */
export function salidaConRebote(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = Math.min(1, Math.max(0, t));
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** ¿Este navegador puede dibujar WebGL? Sin crear un contexto si ni siquiera existe la API (p. ej. en las pruebas). */
export function webglDisponible(): boolean {
  if (typeof window === 'undefined' || typeof (window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext === 'undefined') {
    return false;
  }
  try {
    const lienzo = document.createElement('canvas');
    return !!(lienzo.getContext('webgl2') ?? lienzo.getContext('webgl'));
  } catch {
    return false;
  }
}
