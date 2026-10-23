/**
 * Preguntas rápidas que se ofrecen al empezar una conversación con Atlas, según
 * lo que sus herramientas pueden responder a cada rol (`rolesPermitidos` de
 * backend-practica-hexagonal/src/modules/ia/chat-asistente/infrastructure/herramientas):
 * "clases sin iniciar" y "alertas" son solo de administradores, "mi horario" de
 * docentes y aprendices, "solicitudes" de administradores y docentes, y los
 * ambientes libres de todos. Si se agrega una herramienta, revisar esta lista.
 *
 * La usan el chat móvil (/m) y el chat flotante del sistema.
 */
export function sugerenciasAtlas(esAdmin: boolean, cargo: string): string[] {
  if (esAdmin) return ['¿Qué clases no han iniciado hoy?', '¿Hay alertas hoy?', '¿Qué ambientes están libres ahora?'];
  if (cargo === 'instructor') return ['¿Qué horario tengo hoy?', '¿Qué ambientes están libres ahora?', '¿Tengo solicitudes de material pendientes?'];
  return ['¿Qué horario tengo hoy?', '¿Qué ambientes están libres ahora?'];
}
