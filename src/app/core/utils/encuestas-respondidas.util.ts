/**
 * Marca en localStorage (por dispositivo/navegador) qué encuestas anónimas
 * ya se respondieron. El backend no guarda personaId en el canal público
 * por link/QR (ver [[respondidas-storage]] en backend-encuestas), así que
 * esta es la única barrera contra reenvíos accidentales desde el mismo
 * dispositivo — no es infalible (se puede borrar el storage o usar modo
 * incógnito), pero cubre el caso normal de "ya respondí, me volvió a
 * aparecer el botón".
 */
const PREFIJO = 'encuesta_respondida:';

export function marcarEncuestaRespondida(token: string): void {
  localStorage.setItem(PREFIJO + token, '1');
}

export function encuestaYaRespondida(token: string): boolean {
  return localStorage.getItem(PREFIJO + token) === '1';
}
