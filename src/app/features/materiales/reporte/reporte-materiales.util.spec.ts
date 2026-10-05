import type { ReporteLote, ReporteMateriales, ReporteUnidad, ResponsableMaterial } from '../data-access/materiales-api.service';
import {
  FILTROS_VACIOS,
  SIN_SITIO,
  agruparPorProducto,
  agruparPorResponsable,
  agruparPorUbicacion,
  describirFiltros,
  devolucionVencida,
  fechaCorta,
  filtrarReporte,
  cantidadConUnidad,
  fraseResumen,
  plural,
  resumir,
} from './reporte-materiales.util';

const resp = (o: Partial<ResponsableMaterial>): ResponsableMaterial => ({
  origen: 'SITIO', nombre: 'Ana López', documento: '111', desde: null, hasta: null, referencia: 'COCINA', id_solicitud: null, ...o,
});

let seq = 0;
const unidad = (o: Partial<ReporteUnidad> = {}): ReporteUnidad => ({
  id_item: `it-${++seq}`, placa_sena: `P-${seq}`, codigo_sku: null, estado: 'DISPONIBLE', id_producto: 'p-martillo',
  producto: 'Martillo', codigo_unspsc: '27111602', marca: null, modelo: null, categoria: 'Herramientas',
  id_sitio: 's-cocina', sitio: 'COCINA', sitio_tipo: 'BODEGA', sitio_responsable: 'Ana López', responsable: resp({}), ...o,
});
const lote = (o: Partial<ReporteLote> = {}): ReporteLote => ({
  id_lote: `l-${++seq}`, codigo_lote: 'L1', id_producto: 'p-leche', producto: 'Leche', codigo_unspsc: '50131700',
  tipo_material: 'PERECEDERO', unidad_medida: 'LITRO', categoria: null, cantidad_disponible: 20, cantidad_inicial: 30,
  cantidad_reservada: 0, fecha_ingreso: '2026-09-01', fecha_vencimiento: '2026-10-20',
  id_sitio: 's-cocina', sitio: 'COCINA', sitio_tipo: 'BODEGA', sitio_responsable: 'Ana López', responsable: resp({}), ...o,
});

const prestada = (nombre: string, doc: string, hasta: string | null = null) =>
  unidad({ estado: 'PRESTADO', responsable: resp({ origen: 'PRESTAMO', nombre, documento: doc, desde: '2026-09-20', hasta, referencia: 'Préstamo por solicitud' }) });
const sinResp = () =>
  unidad({ id_sitio: 's-amb', sitio: 'Ambiente 204', sitio_tipo: 'AMBIENTE', sitio_responsable: null,
    responsable: resp({ origen: 'SIN_RESPONSABLE', nombre: null, documento: null, referencia: 'Ambiente 204' }) });

describe('Reporte de materiales — cálculos', () => {
  const HOY = '2026-10-02';
  const datos = (): ReporteMateriales => ({
    generado: '2026-10-02T12:00:00Z',
    unidades: [unidad(), unidad({ estado: 'DAÑADO' }), prestada('Juan Pérez', '222', '2026-09-30'), prestada('Juan Pérez', '222', '2026-10-15'), sinResp()],
    lotes: [lote()],
  });

  it('resume unidades, préstamos, novedades, sin responsable y vencidas', () => {
    const d = datos();
    const r = resumir(d.unidades, d.lotes, HOY);
    expect(r).toEqual(expect.objectContaining({
      unidades: 5, disponibles: 2, prestadas: 2, novedad: 1, sinResponsable: 1,
      devolucionesVencidas: 1, lotes: 1, productosConsumibles: 1, responsables: 2, ubicaciones: 2,
    }));
  });

  it('agrupa por persona: "Sin responsable" primero, luego por cantidad; cuenta préstamos y vencidas', () => {
    const d = datos();
    const g = agruparPorResponsable(d.unidades, d.lotes, HOY);
    expect(g.map((x) => x.nombre)).toEqual(['Sin responsable asignado', 'Ana López', 'Juan Pérez']);
    const juan = g.find((x) => x.nombre === 'Juan Pérez')!;
    expect(juan).toEqual(expect.objectContaining({ documento: '222', enPrestamo: 2, devolucionesVencidas: 1 }));
    const ana = g.find((x) => x.nombre === 'Ana López')!;
    expect(ana.unidades).toHaveLength(2);
    expect(ana.lotes).toHaveLength(1);
    expect(ana.porEstado).toEqual({ DISPONIBLE: 1, 'DAÑADO': 1 });
    expect(ana.motivos).toEqual(['Encargado de COCINA']);
  });

  it('agrupa por ubicación con el responsable del sitio, lo que está fuera y el resumen por producto', () => {
    const d = datos();
    const g = agruparPorUbicacion(d.unidades, d.lotes);
    const cocina = g.find((x) => x.sitio === 'COCINA')!;
    expect(cocina).toEqual(expect.objectContaining({ responsable: 'Ana López', fueraDelSitio: 2 }));
    expect(cocina.unidades).toHaveLength(4);
    expect(cocina.productos).toEqual([
      { producto: 'Leche', unidades: 0, disponibles: 0, cantidad: 20, unidad: 'LITRO' },
      { producto: 'Martillo', unidades: 4, disponibles: 1, cantidad: 0, unidad: null },
    ]);
    expect(g.find((x) => x.sitio === 'Ambiente 204')!.responsable).toBeNull();
  });

  it('filtra por búsqueda sin tildes, estado, origen y ubicación', () => {
    const d = datos();
    expect(filtrarReporte(d, { ...FILTROS_VACIOS, q: 'juan 222' }).unidades).toHaveLength(2);
    expect(filtrarReporte(d, { ...FILTROS_VACIOS, q: 'LOPEZ' }).unidades).toHaveLength(2);
    expect(filtrarReporte(d, { ...FILTROS_VACIOS, estado: 'PRESTADO' })).toEqual(
      expect.objectContaining({ lotes: [] }),
    );
    expect(filtrarReporte(d, { ...FILTROS_VACIOS, estado: 'LOTE' }).unidades).toEqual([]);
    expect(filtrarReporte(d, { ...FILTROS_VACIOS, estado: 'NOVEDAD' }).unidades.map((u) => u.estado)).toEqual(['DAÑADO']);
    expect(filtrarReporte(d, { ...FILTROS_VACIOS, origen: 'SIN_RESPONSABLE' }).unidades).toHaveLength(1);
    expect(filtrarReporte(d, { ...FILTROS_VACIOS, tipoSitio: 'AMBIENTE' }).unidades).toHaveLength(1);
    const sinSitio = { ...d, unidades: [...d.unidades, unidad({ id_sitio: null, sitio: null })] };
    expect(filtrarReporte(sinSitio, { ...FILTROS_VACIOS, sitio: SIN_SITIO }).unidades).toHaveLength(1);
  });

  it('una devolución está vencida solo si es préstamo/asignación con fecha pasada', () => {
    expect(devolucionVencida(resp({ origen: 'PRESTAMO', hasta: '2026-10-01' }), HOY)).toBe(true);
    expect(devolucionVencida(resp({ origen: 'PRESTAMO', hasta: '2026-10-02' }), HOY)).toBe(false);
    expect(devolucionVencida(resp({ origen: 'SITIO', hasta: '2026-01-01' }), HOY)).toBe(false);
  });

  it('formatea fechas sin corrimiento de zona y describe los filtros', () => {
    expect(fechaCorta('2026-10-01')).toBe('01/10/2026');
    expect(describirFiltros(FILTROS_VACIOS, () => '')).toBe('Todos los materiales');
    expect(describirFiltros({ ...FILTROS_VACIOS, sitio: 's1', estado: 'DAÑADO' }, () => 'COCINA')).toBe('Lugar: COCINA · Estado: Dañado');
  });

  it('agrupa por producto: equipos primero, con estados, lugares y consumo por cantidad', () => {
    const d = datos();
    const g = agruparPorProducto(d.unidades, [...d.lotes, lote({ cantidad_disponible: 5, fecha_vencimiento: null })], HOY);
    expect(g.map((x) => [x.tipo, x.producto])).toEqual([['EQUIPO', 'Martillo'], ['CONSUMO', 'Leche']]);
    const martillo = g[0];
    expect(martillo).toEqual(expect.objectContaining({ total: 5, disponibles: 2, prestados: 2, novedad: 1 }));
    expect(martillo.lugares).toEqual(['COCINA', 'Ambiente 204']);
    const leche = g[1];
    expect(leche).toEqual(expect.objectContaining({ cantidad: 25, unidad: 'LITRO', porVencer: 1, lugares: ['COCINA'] }));
  });

  it('cuenta el reporte en frases sencillas', () => {
    const d = datos();
    const f = fraseResumen(resumir(d.unidades, d.lotes, HOY));
    expect(f.titulo).toBe('Hay 5 equipos y herramientas y 1 material de consumo en 2 lugares, a cargo de 2 personas.');
    expect(f.detalle).toBe('2 están prestados (1 ya debía volver), 1 tiene algún problema (dañado, perdido o en mantenimiento) y 1 no tiene a nadie a cargo.');
    expect(f.todoBien).toBe(false);
    const bien = fraseResumen(resumir([unidad()], [], HOY));
    expect(bien).toEqual({ titulo: 'Hay 1 equipo o herramienta en 1 lugar, a cargo de 1 persona.', detalle: 'Todos los equipos están en su lugar y en buen estado.', todoBien: true });
    expect(fraseResumen(resumir([], [], HOY)).titulo).toBe('No hay materiales para mostrar.');
    expect(plural(1250, 'equipo', 'equipos')).toBe('1.250 equipos');
    expect(cantidadConUnidad(30, 'UNIDAD')).toBe('30 unidades');
    expect(cantidadConUnidad(1, 'METRO')).toBe('1 metro');
    expect(cantidadConUnidad(100, 'METRO')).toBe('100 metros');
    expect(cantidadConUnidad(4, 'KIT')).toBe('4 kits');
  });
});
