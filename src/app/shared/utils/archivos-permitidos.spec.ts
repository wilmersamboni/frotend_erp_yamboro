import { ACCEPT_DOCUMENTOS, MAX_DOCUMENTO_BYTES, problemaDocumento } from './archivos-permitidos';

function archivo(nombre: string, bytes = 10): File {
  return new File([new Uint8Array(bytes)], nombre);
}

describe('archivos-permitidos', () => {
  it('el selector solo ofrece PDF, Word y Excel modernos', () => {
    expect(ACCEPT_DOCUMENTOS).toBe('.pdf,.docx,.xlsx');
  });

  it('acepta .pdf, .docx y .xlsx (sin importar mayúsculas)', () => {
    expect(problemaDocumento(archivo('acta.pdf'))).toBeNull();
    expect(problemaDocumento(archivo('Bitacora.DOCX'))).toBeNull();
    expect(problemaDocumento(archivo('notas.xlsx'))).toBeNull();
  });

  it('rechaza formatos viejos, imágenes, comprimidos y HTML', () => {
    for (const nombre of ['viejo.doc', 'viejo.xls', 'foto.png', 'cosas.zip', 'pagina.html', 'macro.docm']) {
      expect(problemaDocumento(archivo(nombre))).toMatch(/Solo se aceptan/);
    }
  });

  it('rechaza archivos de más de 10 MB', () => {
    expect(problemaDocumento(archivo('grande.pdf', MAX_DOCUMENTO_BYTES + 1))).toMatch(/10 MB/);
  });
});
