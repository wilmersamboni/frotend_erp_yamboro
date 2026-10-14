/**
 * Tipos de archivo que acepta el backend en los campos de documentos (plan
 * de seguridad 2026-10, H1): PDF, Word y Excel modernos. Debe coincidir con
 * `backend-practica-hexagonal/src/common/uploads/politica-archivos.ts`, que
 * además valida el contenido real — esto solo da un mensaje claro antes de
 * subir.
 */
export const EXTENSIONES_DOCUMENTO = ['.pdf', '.docx', '.xlsx'];
export const ACCEPT_DOCUMENTOS = EXTENSIONES_DOCUMENTO.join(',');
export const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024;

/** Mensaje de por qué el archivo no se puede subir, o null si está bien. */
export function problemaDocumento(file: File): string | null {
  const nombre = file.name.toLowerCase();
  if (!EXTENSIONES_DOCUMENTO.some((ext) => nombre.endsWith(ext))) {
    return 'Solo se aceptan archivos PDF, Word (.docx) o Excel (.xlsx).';
  }
  if (file.size > MAX_DOCUMENTO_BYTES) {
    return 'El archivo supera el máximo de 10 MB.';
  }
  return null;
}
