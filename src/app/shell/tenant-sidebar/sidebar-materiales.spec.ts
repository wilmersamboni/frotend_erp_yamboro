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
  /** Lo que respondería `GET materiales/ingresos/acceso` (admin ERP, líder o permiso personal). */
  gestorIngresos?: boolean;
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
  sidebar.esGestorIngresos.set(!!opciones.gestorIngresos);
  return sidebar.visibleGroups.find((g) => g.id === 'materiales')?.links.map((l) => l.label) ?? [];
}

describe('Sidebar: menú de Materiales según permisos efectivos', () => {
  it('instructor común: solo las pantallas de los servicios que trae de fábrica', () => {
    // Sin "Reporte de materiales": tiene existencias.ver pero no gestiona ninguna bodega ni área.
    // Nombres de todos los días (2026-10-05); Inicio y Escanear placa los ve todo el que usa Materiales.
    expect(menuMateriales({ cargo: 'instructor', servicios: BASE_INSTRUCTOR })).toEqual([
      'Inicio', 'Escanear placa', 'Pedidos y préstamos', 'Devoluciones', 'Fechas por vencer', '¿Qué hay y dónde?', 'Catálogo de productos', 'Actas',
    ]);
  });

  it('aprendiz encargado de bodega: ve las pantallas que le da el bundle (antes no tenía link de Traslados, Novedades, Kardex ni Categorías)', () => {
    const menu = menuMateriales({
      cargo: 'aprendiz',
      servicios: [...BASE_INSTRUCTOR, ...BUNDLE_ENCARGADO],
      responsableBodega: true,
    });

    expect(menu).toEqual(expect.arrayContaining(['Inicio', 'Mi Bodega', 'Mover entre bodegas', 'Daños y problemas', 'Historial de movimientos', 'Categorías', 'Entregas a fichas', 'Equipos con placa', 'Material que se gasta']));
    // El reporte (nombres y cédulas de terceros) es para quien gestiona: el encargado sí lo ve.
    expect(menu).toContain('Reporte de materiales');
    // "Mi Bodega" ya cubre el catálogo de productos; "Bodegas" es la consola del administrador.
    expect(menu).not.toContain('Catálogo de productos');
    expect(menu).not.toContain('Bodegas');
  });

  it('quitarle un servicio a alguien le quita el link, sea cual sea su cargo', () => {
    const sinSolicitudes = BASE_INSTRUCTOR.filter((s) => s !== 'materiales.solicitudes.ver');

    for (const cargo of ['instructor', 'aprendiz', 'administrador']) {
      const menu = menuMateriales({ cargo, servicios: sinSolicitudes, aplicativo: 'Materiales' });
      expect(menu).not.toContain('Pedidos y préstamos');
      expect(menu).not.toContain('Fechas por vencer');
      expect(menu).toContain('¿Qué hay y dónde?');
    }
  });

  it('Inicio y Escanear placa: los ve quien tenga cualquier servicio de entrada, y nadie más', () => {
    expect(menuMateriales({ cargo: 'aprendiz', servicios: ['materiales.solicitudes.crear'] })).toEqual(['Inicio', 'Escanear placa']);
    expect(menuMateriales({ cargo: 'aprendiz', servicios: ['materiales.actas.ver'] })).not.toContain('Inicio');
  });

  it('administrador ERP: todo el menú, con "Bodegas" y sin "Mi Bodega"', () => {
    const menu = menuMateriales({
      cargo: 'administrador_erp', servicios: TODOS, aplicativo: 'Materiales', responsableBodega: true, gestorIngresos: true,
    });

    expect(menu).toEqual(
      PANTALLAS_MATERIALES.filter((p) => p.enMenu !== false && p.id !== 'mi-bodega').map((p) => p.label),
    );
  });

  it('Llegada de material y Proveedores: solo si el backend dice que gestiona ingresos (2026-10-06)', () => {
    // Encargado de bodega (o administrador común) sin el permiso personal: no los ve.
    const sinPermiso = menuMateriales({ cargo: 'administrador', servicios: TODOS, aplicativo: 'Materiales', responsableBodega: true });
    expect(sinPermiso).not.toContain('Llegada de material');
    expect(sinPermiso).not.toContain('Proveedores');

    // Instructor con la excepción personal `materiales.ingresos.gestionar`.
    const conPermiso = menuMateriales({ cargo: 'instructor', servicios: BASE_INSTRUCTOR, gestorIngresos: true });
    expect(conPermiso).toContain('Llegada de material');
    expect(conPermiso).toContain('Proveedores');
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
      if (pantalla.acceso.tipo === 'cualquiera') {
        expect(r?.data?.['servicios'], pantalla.id).toEqual(pantalla.acceso.servicios);
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
