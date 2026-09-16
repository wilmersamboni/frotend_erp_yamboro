import { TuiDay } from '@taiga-ui/cdk';

/**
 * Puente entre un string ISO 'yyyy-MM-dd' (lo que ya usa el resto del código,
 * igual que <input type="date">) y TuiDay (lo que espera <app-date-input>).
 *
 * Cachea por string: sin esto, cada re-render de la plantilla crea un TuiDay
 * NUEVO para la misma fecha lógica y <app-date-input> lo trata como un
 * cambio real, reemitiendo (ngModelChange) y disparando un loop infinito de
 * change detection que congela la pestaña — mismo bug ya corregido una vez
 * en admin-modal.component.ts (ver su comentario en `dateValue`).
 */
export class TuiDayCache {
  private ultimoIso: string | null = null;
  private ultimoDay: TuiDay | null = null;

  get(iso: string | null | undefined): TuiDay | null {
    if (!iso) return null;
    const key = String(iso).substring(0, 10);
    if (key === this.ultimoIso) return this.ultimoDay;
    const [y, m, d] = key.split('-').map(Number);
    this.ultimoDay = new TuiDay(y, m - 1, d);
    this.ultimoIso = key;
    return this.ultimoDay;
  }

  static toIso(day: TuiDay | null): string {
    if (!day) return '';
    const m = String(day.month + 1).padStart(2, '0');
    const d = String(day.day).padStart(2, '0');
    return `${day.year}-${m}-${d}`;
  }

  /** Para límites (`min`/`max`) que solo hace falta calcular una vez, ej. "hoy". */
  static fromIso(iso: string): TuiDay {
    const [y, m, d] = iso.substring(0, 10).split('-').map(Number);
    return new TuiDay(y, m - 1, d);
  }
}
