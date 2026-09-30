/**
 * Copia un texto al portapapeles. `navigator.clipboard` solo existe en páginas seguras (https o
 * localhost); en la red local sin certificado de confianza puede faltar, y entonces se usa el
 * método antiguo con un campo temporal. Devuelve si se pudo copiar.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* cae al método antiguo */ }
  try {
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand('copy');
    campo.remove();
    return ok;
  } catch {
    return false;
  }
}
