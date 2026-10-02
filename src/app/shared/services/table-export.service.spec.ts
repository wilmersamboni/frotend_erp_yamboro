import { TableExportService, ExportColumn } from './table-export.service';

interface Fila {
  nombre: string;
  cantidad: number | null;
}

const columnas: ExportColumn<Fila>[] = [
  { label: 'Producto', value: (f) => f.nombre },
  { label: 'Cantidad', value: (f) => f.cantidad },
];
const filas: Fila[] = [
  { nombre: 'Abono', cantidad: 12 },
  { nombre: 'Guantes', cantidad: null },
];

// exceljs y jspdf se importan recién dentro de excel()/pdf(): estas pruebas son
// las que confirman que esa carga bajo demanda sigue produciendo el archivo.
// El tiempo de espera es largo porque la primera importación de cada librería
// (más de 1 MB entre las dos) tarda varios segundos en el entorno de pruebas.
describe('TableExportService', () => {
  it('excel(): genera un .xlsx real con las filas que recibe', async () => {
    const servicio = new TableExportService();
    const descargar = vi.spyOn(servicio as any, 'download').mockImplementation(() => undefined);

    await servicio.excel('existencias', 'Existencias', columnas, filas);

    expect(descargar).toHaveBeenCalledTimes(1);
    const [blob, nombre] = descargar.mock.calls[0] as [Blob, string];
    expect(nombre).toBe('existencias.xlsx');
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(blob.size).toBeGreaterThan(1000);
  }, 60_000);

  it('pdf(): arma la tabla y guarda el archivo con el nombre pedido', async () => {
    const servicio = new TableExportService();
    const guardar = vi.spyOn(servicio as any, 'savePdf').mockImplementation(() => undefined);

    await servicio.pdf('kardex', 'Kardex', columnas, filas);

    expect(guardar).toHaveBeenCalledTimes(1);
    const [documento, nombre] = guardar.mock.calls[0] as [{ output(tipo: string): ArrayBuffer }, string];
    expect(nombre).toBe('kardex.pdf');
    expect(documento.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  }, 60_000);
});
