import { Injectable, computed, inject, signal } from '@angular/core';
import { from, of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { TenantAdminService } from './tenant-admin.service';

export type EstadoConexion = 'verificando' | 'ok' | 'falla';

/**
 * Comprobación de conexión de los centros (usa `GET admin/tenants/:id/verificar`, que ya
 * existía). Guarda el último resultado por centro mientras la página esté abierta, para que
 * la lista, el detalle y el dashboard muestren lo mismo sin repetir la consulta.
 */
@Injectable({ providedIn: 'root' })
export class TenantSaludService {
  private readonly api = inject(TenantAdminService);
  readonly estados = signal<Record<string, EstadoConexion>>({});
  readonly hayRevision = computed(() => Object.keys(this.estados()).length > 0);
  readonly ultimaRevision = signal<Record<string, number>>({});

  estado(id: string): EstadoConexion | undefined { return this.estados()[id]; }

  private poner(id: string, e: EstadoConexion): void {
    this.estados.update(m => ({ ...m, [id]: e }));
    if (e !== 'verificando') this.ultimaRevision.update(m => ({ ...m, [id]: Date.now() }));
  }

  /** Revisa varios centros de a 4 a la vez, para no abrir una conexión a la base por cada uno al mismo tiempo. */
  verificar(ids: string[], alTerminar?: (ok: number, falla: number) => void): void {
    if (!ids.length) { alTerminar?.(0, 0); return; }
    ids.forEach(id => this.poner(id, 'verificando'));
    let ok = 0, falla = 0, pendientes = ids.length;
    from(ids).pipe(
      mergeMap(id => this.api.verificarConexion(id).pipe(
        map(r => ({ id, bien: !!r.erpDb })),
        catchError(() => of({ id, bien: false })),
      ), 4),
    ).subscribe(({ id, bien }) => {
      this.poner(id, bien ? 'ok' : 'falla');
      bien ? ok++ : falla++;
      if (--pendientes === 0) alTerminar?.(ok, falla);
    });
  }
}
