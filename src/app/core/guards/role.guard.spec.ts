import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { roleGuard } from './role.guard';
import { miBodegaGuard } from './mi-bodega.guard';
import { productosGuard } from './productos.guard';
import { AuthService } from '../services/auth.service';
import { AprendizContextService } from '../services/aprendiz-context.service';
import { MaterialesApiService } from '../../features/materiales/data-access/materiales-api.service';

/** Lo que devuelve el Router falso cuando un guard redirige. */
const redirige = (ruta: string) => ({ redirigeA: ruta });

function preparar(opciones: {
  cargo: string;
  servicios?: string[];
  tieneEtapa?: boolean | null;
  bodegasACargo?: unknown[] | 'falla';
}) {
  const esAdmin = opciones.cargo === 'administrador' || opciones.cargo === 'administrador_erp';
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: {
          cargo: () => opciones.cargo,
          isAdmin: () => esAdmin,
          hasRole: (roles: string[]) => roles.includes(opciones.cargo),
          tieneServicio: (nombre: string) => (opciones.servicios ?? []).includes(nombre),
        },
      },
      { provide: Router, useValue: { createUrlTree: (comandos: string[]) => redirige(comandos.join('')) } },
      {
        provide: AprendizContextService,
        useValue: { cargar: () => Promise.resolve(), tieneEtapa: () => opciones.tieneEtapa ?? null },
      },
      {
        provide: MaterialesApiService,
        useValue: {
          sitiosACargo: () =>
            opciones.bodegasACargo === 'falla'
              ? Promise.reject(new Error('sin red'))
              : Promise.resolve(opciones.bodegasACargo ?? []),
        },
      },
    ],
  });
}

const entrar = (data: Record<string, unknown>) =>
  TestBed.runInInjectionContext(() => roleGuard({ data } as any, {} as any));

describe('roleGuard', () => {
  it('ruta sin restricciones: pasa cualquiera', async () => {
    preparar({ cargo: 'aprendiz' });
    expect(await entrar({})).toBe(true);
  });

  it('`roles`: pasa el cargo listado y redirige al resto', async () => {
    preparar({ cargo: 'administrador' });
    expect(await entrar({ roles: ['administrador', 'administrador_erp'] })).toBe(true);

    TestBed.resetTestingModule();
    preparar({ cargo: 'instructor' });
    expect(await entrar({ roles: ['administrador', 'administrador_erp'] })).toEqual(redirige('/'));
  });

  it('`servicios` es una vía alternativa (OR) al cargo', async () => {
    preparar({ cargo: 'instructor', servicios: ['encuestas.gestionar'] });
    expect(await entrar({ roles: ['administrador'], servicios: ['encuestas.gestionar'] })).toBe(true);

    TestBed.resetTestingModule();
    preparar({ cargo: 'instructor', servicios: [] });
    expect(await entrar({ roles: ['administrador'], servicios: ['encuestas.gestionar'] })).toEqual(redirige('/'));
  });

  it('`serviciosRequeridos` es un AND: sin el servicio no entra ni siquiera un administrador', async () => {
    preparar({ cargo: 'administrador', servicios: [] });
    expect(await entrar({ serviciosRequeridos: ['materiales.traslados.ver'] })).toEqual(redirige('/'));

    TestBed.resetTestingModule();
    preparar({ cargo: 'aprendiz', servicios: ['materiales.traslados.ver'] });
    expect(await entrar({ serviciosRequeridos: ['materiales.traslados.ver'] })).toBe(true);
  });

  it('`serviciosRequeridos` exige TODOS los servicios listados', async () => {
    preparar({ cargo: 'instructor', servicios: ['a.ver'] });
    expect(await entrar({ serviciosRequeridos: ['a.ver', 'b.ver'] })).toEqual(redirige('/'));
  });

  it('`soloAprendizConEtapa`: el aprendiz sin etapa práctica no entra; el instructor no se ve afectado', async () => {
    preparar({ cargo: 'aprendiz', tieneEtapa: false });
    expect(await entrar({ soloAprendizConEtapa: true })).toEqual(redirige('/'));

    TestBed.resetTestingModule();
    preparar({ cargo: 'aprendiz', tieneEtapa: true });
    expect(await entrar({ soloAprendizConEtapa: true })).toBe(true);

    TestBed.resetTestingModule();
    preparar({ cargo: 'instructor', tieneEtapa: false });
    expect(await entrar({ soloAprendizConEtapa: true })).toBe(true);
  });
});

describe('miBodegaGuard', () => {
  const entrarMiBodega = () => TestBed.runInInjectionContext(() => miBodegaGuard({} as any, {} as any));

  it('pasa quien es responsable de al menos una bodega', async () => {
    preparar({ cargo: 'aprendiz', bodegasACargo: [{ id_sitio: 's1' }] });
    expect(await entrarMiBodega()).toBe(true);
  });

  it('redirige a quien no administra ninguna, y también si no se pudo consultar', async () => {
    preparar({ cargo: 'instructor', bodegasACargo: [] });
    expect(await entrarMiBodega()).toEqual(redirige('/'));

    TestBed.resetTestingModule();
    preparar({ cargo: 'instructor', bodegasACargo: 'falla' });
    expect(await entrarMiBodega()).toEqual(redirige('/'));
  });

  it('el administrador nunca entra a "Mi Bodega" (tiene la consola de todas las bodegas)', async () => {
    preparar({ cargo: 'administrador', bodegasACargo: [{ id_sitio: 's1' }] });
    expect(await entrarMiBodega()).toEqual(redirige('/'));
  });
});

describe('productosGuard', () => {
  const entrarProductos = () => TestBed.runInInjectionContext(() => productosGuard({} as any, {} as any));

  it('manda a "Mi Bodega" a quien administra una bodega', async () => {
    preparar({ cargo: 'instructor', bodegasACargo: [{ id_sitio: 's1' }] });
    expect(await entrarProductos()).toEqual(redirige('/mi-bodega'));
  });

  it('deja pasar al administrador, a quien no administra ninguna, y si no se pudo consultar', async () => {
    preparar({ cargo: 'administrador', bodegasACargo: [{ id_sitio: 's1' }] });
    expect(await entrarProductos()).toBe(true);

    TestBed.resetTestingModule();
    preparar({ cargo: 'aprendiz', bodegasACargo: [] });
    expect(await entrarProductos()).toBe(true);

    TestBed.resetTestingModule();
    preparar({ cargo: 'aprendiz', bodegasACargo: 'falla' });
    expect(await entrarProductos()).toBe(true);
  });
});
