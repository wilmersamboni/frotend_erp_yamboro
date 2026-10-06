import { SidebarComponent } from './sidebar.component';
import { MATERIALS_ROUTES } from '../../features/materiales/materiales.routes';
import { PANTALLAS_MATERIALES } from '../../features/materiales/materiales-acceso';

/** Lo que trae cada cargo de fábrica (MATERIALES_INSTRUCTOR / MATERIALES_APRENDIZ en backend-erp). */
const BASE_INSTRUCTOR = [
  'materiales.productos.ver', 'materiales.existencias.ver', 'materiales.solicitudes.ver',
  'materiales.solicitudes.crear', 'materiales.devoluciones.ver', 'materiales.actas.ver',
];
/** Lo que suma el bundle de encargado de bodega, en lo que a pantallas se refiere. */
const BUNDLE_ENCARGADO = [
  'materiales.items.ver', 'materiales.lotes.ver', 'materiales.categorias.ver', 'materiales.kardex.ver',
  'materiales.traslados.ver', 'materiales.novedades.ver', 'materiales.asignaciones.ver',
];
const TODOS = PANTALLAS_MATERIALES.flatMap((p) => ('servicio' in p.acceso ? [p.acceso.servicio] : []));

function menuMateriales(opciones: {
  cargo: string;
  servicios: string[];
  aplicativo?: string;
  responsableBodega?: boolean;
}): string[] {
  const esAdmin = opciones.cargo === 'administrador' || opciones.cargo === 'administrador_erp';
  const auth = {
    cargo: () => opciones.cargo,
    isAdmin: () => esAdmin,
    tieneServicio: (nombre: string) => opciones.servicios.includes(nombre),
    perteneceAplicativo: (nombre: string) => opciones.cargo === 'administrador_erp' || opciones.aplicativo === nombre,
  };
  const sidebar = new SidebarComponent(
    auth as any,
    { bypassSecurityTrustHtml: (html: string) => html } as any,
    { tieneEtapa: () => null } as any,
    {} as any,
    { url: '/home' } as any,
    { sitiosACargo: () => Promise.resolve([]) } as any,
  );
  sidebar.esResponsableBodega.set(!!opciones.responsableBodega);
  return sidebar.visibleGroups.find((g) => g.id === 'materiales')?.links.map((l) => l.label) ?? [];
}

describe('Sidebar: menú de Materiales según permisos efectivos', () => {
  it('instructor común: solo las pantallas de los servicios que trae de fábrica', () => {
    // Sin "Reporte de materiales": tiene existencias.ver pero no gestiona ninguna bodega ni área.
    expect(menuMateriales({ cargo: 'instructor', servicios: BASE_INSTRUCTOR })).toEqual([
      'Solicitudes', 'Salidas', 'Devoluciones', 'Vencimientos', 'Existencias', 'Productos', 'Actas',
    ]);
  });

  it('aprendiz encargado de bodega: ve las pantallas que le da el bundle (antes no tenía link de Traslados, Novedades, Kardex ni Categorías)', () => {
    const menu = menuMateriales({
      cargo: 'aprendiz',
      servicios: [...BASE_INSTRUCTOR, ...BUNDLE_ENCARGADO],
      responsableBodega: true,
    });

    expect(menu).toEqual(expect.arrayContaining(['Mi Bodega', 'Traslados', 'Novedades', 'Kardex', 'Categorías', 'Asignaciones', 'Ítems', 'Lotes']));
    // El reporte (nombres y cédulas de terceros) es para quien gestiona: el encargado sí lo ve.
    expect(menu).toContain('Reporte de materiales');
    // "Mi Bodega" ya cubre el catálogo de productos; "Bodegas" es la consola del administrador.
    expect(menu).not.toContain('Productos');
    expect(menu).not.toContain('Bodegas');
  });

  it('quitarle un servicio a alguien le quita el link, sea cual sea su cargo', () => {
    const sinSolicitudes = BASE_INSTRUCTOR.filter((s) => s !== 'materiales.solicitudes.ver');

    for (const cargo of ['instructor', 'aprendiz', 'administrador']) {
      const menu = menuMateriales({ cargo, servicios: sinSolicitudes, aplicativo: 'Materiales' });
      expect(menu).not.toContain('Solicitudes');
      expect(menu).not.toContain('Vencimientos');
      expect(menu).toContain('Existencias');
    }
  });

  it('administrador de Materiales: todo el menú, con "Bodegas" y sin "Mi Bodega"', () => {
    const menu = menuMateriales({ cargo: 'administrador', servicios: TODOS, aplicativo: 'Materiales', responsableBodega: true });

    expect(menu).toEqual(
      PANTALLAS_MATERIALES.filter((p) => p.enMenu !== false && p.id !== 'mi-bodega').map((p) => p.label),
    );
  });

  it('administrador de otro aplicativo, sin servicios de Materiales: no ve el grupo', () => {
    expect(menuMateriales({ cargo: 'administrador', servicios: [], aplicativo: 'Horarios' })).toEqual([]);
  });

  it('sin ningún servicio de Materiales no aparece el grupo', () => {
    expect(menuMateriales({ cargo: 'aprendiz', servicios: [] })).toEqual([]);
  });
});

describe('Rutas de Materiales: misma regla que el menú', () => {
  const ruta = (path: string) => MATERIALS_ROUTES.find((r) => r.path === path);

  it('cada pantalla tiene su ruta, con el servicio que declara la tabla', () => {
    for (const pantalla of PANTALLAS_MATERIALES) {
      const r = ruta(pantalla.path);
      expect(r, pantalla.id).toBeDefined();
      if (pantalla.acceso.tipo === 'servicio') {
        expect(r?.data?.['serviciosRequeridos'], pantalla.id).toEqual([pantalla.acceso.servicio]);
      }
    }
  });

  it('conserva los casos especiales', () => {
    expect(ruta('materiales/bodegas')?.data).toEqual({ roles: ['administrador', 'administrador_erp'], todasLasBodegas: true });
    expect(ruta('materiales/asignaciones')?.data).toEqual({
      roles: ['administrador', 'administrador_erp'],
      servicios: ['materiales.asignaciones.ver'],
    });
    expect(ruta('materiales/productos')?.canActivate).toHaveLength(2);
    expect(ruta('mi-bodega')?.canActivate).toHaveLength(1);
  });
});
