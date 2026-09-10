// ─────────────────────────────────────────────────────────────────────────────
// notificaciones-campana.component.ts  (v3 – Centro de Notificaciones)
//
// Campana en el navbar que muestra SOLO las notificaciones del usuario
// autenticado. El backend filtra por sesión/cookie, por lo que cada
// usuario ve únicamente sus propias notificaciones.
//
// TIPO_META cubre los tipos que los backends REALMENTE emiten hoy (auditado
// contra notificacion-admin.http.adapter.ts/notificaciones-erp-bridge.adapter.ts
// en backend-practica-hexagonal y matriculas.service.ts/notificaciones.service.ts
// en backend-erp, 2026-09-10) — la v2 traía `bitacora_subida/aprobada/rechazada`
// y `formato_nuevo/actualizado/eliminado`, que ningún backend crea (dead code
// heredado de antes de la fusión de notificaciones); se retiraron.
//
// Cada tipo trae además `modulo` (materiales/horarios/etapa_practica/general),
// usado para las tabs de filtro y para decidir a qué pantalla lleva el botón
// de acción de cada tarjeta (ver `rutaAccion`, más abajo). Los íconos son SVG
// (trazo, estilo Heroicons outline — mismo lenguaje visual que la campana y
// la "X" de cerrar, que ya eran SVG) en vez de emoji: no dependen de la fuente
// del sistema operativo y quedan siempre alineados con el color del tipo.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Component, Input, OnInit, OnDestroy,
  signal, computed, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService }   from '../../core/services/api.service';
import { NotificacionesRealtimeService } from '../../core/services/realtime/notificaciones-realtime.service';

// Fuente única: tabla `notificaciones` de backend-erp (id uuid, PATCH
// /notificaciones/:id/leer). Hasta la Fase 2 del plan de fusión de
// notificaciones esta campana también consultaba en paralelo la tabla
// `notificacion` de Materiales (backend-epsas-horarios) y las intercalaba
// client-side — desde la Fase 1, Materiales escribe en esta misma tabla vía
// el canal interno del ERP (`notificarPersonas`), así que ese merge quedó
// obsoleto y se retiró.
export interface Notificacion {
  id:        string;
  tipo:      string;
  titulo:    string;
  mensaje:   string;
  data:      Record<string, any> | null;
  leida:     boolean;
  createdAt: string;
}

type ModuloId = 'materiales' | 'horarios' | 'etapa_practica' | 'encuestas' | 'general';

// Rutas SVG trazadas estilo Heroicons outline (viewBox 24x24, stroke). Un
// diccionario chico y reutilizado entre tipos afines es más fácil de
// mantener que un ícono distinto por cada uno de los ~25 tipos.
const ICONOS: Record<string, string> = {
  campana:    'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  cubo:       'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
  chequeo:    'M9 12.75l2.25 2.25 4.5-4.5m6 .75a9 9 0 11-18 0 9 9 0 0118 0z',
  cruz:       'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  alerta:     'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  reloj:      'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  calendario: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  bandeja:    'M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.86m-19.5 0v6a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25v-6m-19.5 0V9a2.25 2.25 0 012.25-2.25h15A2.25 2.25 0 0121.75 9v4.5',
  documento:  'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h9m-9-3.75h9m-9-3.75h1.5M8.25 21h8.25a2.25 2.25 0 002.25-2.25V11.25a9 9 0 00-9-9H8.25a2.25 2.25 0 00-2.25 2.25v15A2.25 2.25 0 008.25 21z',
  clip:       'M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32a1.5 1.5 0 01-2.122-2.12l7.81-7.81',
  usuario:    'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
  usuarios:   'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  refrescar:  'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
  cohete:     'M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448c.019-.104.04-.208.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
  edificio:   'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
  bandera:    'M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5',
  grafico:    'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  prohibido:  'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  chevron:    'M8.25 4.5l7.5 7.5-7.5 7.5',
  tick:       'M4.5 12.75l6 6 9-13.5',
  equis:      'M6 18L18 6M6 6l12 12',
};

interface TipoMeta {
  icono:     string;   // clave de ICONOS
  bgUnread:  string;   // clase bg cuando no leída
  dotColor:  string;   // clase color del dot
  badgeBg:   string;   // bg del badge de tipo
  badgeText: string;
  label:     string;
  modulo:    ModuloId;
}

const MODULOS_META: Record<ModuloId, { label: string; icono: string; color: string }> = {
  materiales:     { label: 'Materiales',     icono: 'cubo',       color: '#0369a1' },
  horarios:       { label: 'Horarios',       icono: 'calendario', color: '#7c3aed' },
  etapa_practica: { label: 'Etapa Práctica', icono: 'documento',  color: '#007832' },
  encuestas:      { label: 'Encuestas',      icono: 'grafico',    color: '#db2777' },
  general:        { label: 'General',        icono: 'campana',   color: '#525252' },
};

const TIPO_META: Record<string, TipoMeta> = {
  // ── Materiales (bodega/inventario, backend-practica-hexagonal) ───────────
  materiales_solicitud_creada: {
    icono: 'bandeja', bgUnread: 'bg-blue-50', dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Nueva solicitud', modulo: 'materiales',
  },
  materiales_solicitud_override_admin: {
    icono: 'alerta', bgUnread: 'bg-amber-50', dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', label: 'Solicitud forzada', modulo: 'materiales',
  },
  materiales_fecha_devolucion_ajustada: {
    icono: 'reloj', bgUnread: 'bg-amber-50', dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', label: 'Fecha ajustada', modulo: 'materiales',
  },
  materiales_solicitud_rechazada: {
    icono: 'cruz', bgUnread: 'bg-red-50', dotColor: 'bg-red-500',
    badgeBg: 'bg-red-100', badgeText: 'text-red-700', label: 'Solicitud rechazada', modulo: 'materiales',
  },
  materiales_solicitud_lista_entrega: {
    icono: 'bandeja', bgUnread: 'bg-cyan-50', dotColor: 'bg-cyan-500',
    badgeBg: 'bg-cyan-100', badgeText: 'text-cyan-700', label: 'Listo para recoger', modulo: 'materiales',
  },
  materiales_stock_bajo: {
    icono: 'alerta', bgUnread: 'bg-amber-50', dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', label: 'Stock bajo', modulo: 'materiales',
  },
  materiales_solicitud_confirmada: {
    icono: 'chequeo', bgUnread: 'bg-green-50', dotColor: 'bg-green-500',
    badgeBg: 'bg-green-100', badgeText: 'text-green-700', label: 'Recepción confirmada', modulo: 'materiales',
  },
  materiales_solicitud_cancelada: {
    icono: 'prohibido', bgUnread: 'bg-gray-100', dotColor: 'bg-gray-400',
    badgeBg: 'bg-gray-200', badgeText: 'text-gray-600', label: 'Solicitud cancelada', modulo: 'materiales',
  },
  materiales_traslado_creado: {
    icono: 'cubo', bgUnread: 'bg-blue-50', dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Nuevo traslado', modulo: 'materiales',
  },
  materiales_traslado_override_admin: {
    icono: 'alerta', bgUnread: 'bg-amber-50', dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', label: 'Traslado forzado', modulo: 'materiales',
  },
  materiales_traslado_aprobado: {
    icono: 'chequeo', bgUnread: 'bg-green-50', dotColor: 'bg-green-500',
    badgeBg: 'bg-green-100', badgeText: 'text-green-700', label: 'Traslado aprobado', modulo: 'materiales',
  },
  materiales_traslado_rechazado: {
    icono: 'cruz', bgUnread: 'bg-red-50', dotColor: 'bg-red-500',
    badgeBg: 'bg-red-100', badgeText: 'text-red-700', label: 'Traslado rechazado', modulo: 'materiales',
  },
  materiales_devolucion_registrada: {
    icono: 'cubo', bgUnread: 'bg-teal-50', dotColor: 'bg-teal-500',
    badgeBg: 'bg-teal-100', badgeText: 'text-teal-700', label: 'Devolución registrada', modulo: 'materiales',
  },
  materiales_novedad_override_admin: {
    icono: 'alerta', bgUnread: 'bg-amber-50', dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', label: 'Novedad forzada', modulo: 'materiales',
  },

  // ── Horarios (backend-practica-hexagonal) ────────────────────────────────
  horario_asignado: {
    icono: 'calendario', bgUnread: 'bg-violet-50', dotColor: 'bg-violet-500',
    badgeBg: 'bg-violet-100', badgeText: 'text-violet-700', label: 'Horario asignado', modulo: 'horarios',
  },
  horario_actualizado: {
    icono: 'refrescar', bgUnread: 'bg-violet-50', dotColor: 'bg-violet-500',
    badgeBg: 'bg-violet-100', badgeText: 'text-violet-700', label: 'Horario actualizado', modulo: 'horarios',
  },
  clase_cancelada: {
    icono: 'prohibido', bgUnread: 'bg-red-50', dotColor: 'bg-red-500',
    badgeBg: 'bg-red-100', badgeText: 'text-red-700', label: 'Clase cancelada', modulo: 'horarios',
  },
  evento_creado: {
    icono: 'calendario', bgUnread: 'bg-indigo-50', dotColor: 'bg-indigo-500',
    badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700', label: 'Evento nuevo', modulo: 'horarios',
  },
  competencia_asignada: {
    icono: 'bandera', bgUnread: 'bg-indigo-50', dotColor: 'bg-indigo-500',
    badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700', label: 'Competencia asignada', modulo: 'horarios',
  },
  horario_no_iniciado: {
    icono: 'reloj', bgUnread: 'bg-amber-50', dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', label: 'Horario sin iniciar', modulo: 'horarios',
  },
  ambiente_disponible: {
    icono: 'edificio', bgUnread: 'bg-green-50', dotColor: 'bg-green-500',
    badgeBg: 'bg-green-100', badgeText: 'text-green-700', label: 'Ambiente disponible', modulo: 'horarios',
  },

  // ── Etapa práctica (bitácoras, seguimientos, encuestas) ──────────────────
  bitacora_estado_cambiado: {
    icono: 'refrescar', bgUnread: 'bg-blue-50', dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Bitácora actualizada', modulo: 'etapa_practica',
  },
  bitacora_pdf_subido: {
    icono: 'clip', bgUnread: 'bg-blue-50', dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Bitácora subida', modulo: 'etapa_practica',
  },
  instructor_asignado: {
    icono: 'usuario', bgUnread: 'bg-purple-50', dotColor: 'bg-purple-500',
    badgeBg: 'bg-purple-100', badgeText: 'text-purple-700', label: 'Instructor asignado', modulo: 'etapa_practica',
  },
  etapa_practica_activada: {
    icono: 'cohete', bgUnread: 'bg-green-50', dotColor: 'bg-green-500',
    badgeBg: 'bg-green-100', badgeText: 'text-green-700', label: 'Etapa práctica activada', modulo: 'etapa_practica',
  },
  observacion_registrada: {
    icono: 'documento', bgUnread: 'bg-orange-50', dotColor: 'bg-orange-500',
    badgeBg: 'bg-orange-100', badgeText: 'text-orange-700', label: 'Nueva observación', modulo: 'etapa_practica',
  },
  seguimiento_estado_cambiado: {
    icono: 'refrescar', bgUnread: 'bg-blue-50', dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Seguimiento actualizado', modulo: 'etapa_practica',
  },
  seguimiento_acta_subida: {
    icono: 'clip', bgUnread: 'bg-blue-50', dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Acta disponible', modulo: 'etapa_practica',
  },
  encuesta_cerrada_tiempo: {
    icono: 'grafico', bgUnread: 'bg-gray-100', dotColor: 'bg-gray-400',
    badgeBg: 'bg-gray-200', badgeText: 'text-gray-600', label: 'Encuesta cerrada', modulo: 'encuestas',
  },
  encuesta_cerrada_completada: {
    icono: 'grafico', bgUnread: 'bg-green-50', dotColor: 'bg-green-500',
    badgeBg: 'bg-green-100', badgeText: 'text-green-700', label: 'Encuesta completada', modulo: 'encuestas',
  },

  // ── General (matrículas / ERP, backend-erp) ──────────────────────────────
  aprendices_habilitados: {
    icono: 'usuarios', bgUnread: 'bg-purple-50', dotColor: 'bg-purple-500',
    badgeBg: 'bg-purple-100', badgeText: 'text-purple-700', label: 'Aprendices habilitados', modulo: 'general',
  },
  resultados_aprobados: {
    icono: 'chequeo', bgUnread: 'bg-green-50', dotColor: 'bg-green-500',
    badgeBg: 'bg-green-100', badgeText: 'text-green-700', label: 'Resultados aprobados', modulo: 'general',
  },
  matricula_estado_cambiado: {
    icono: 'refrescar', bgUnread: 'bg-blue-50', dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Matrícula actualizada', modulo: 'general',
  },
  matricula_ficha_cambiada: {
    icono: 'refrescar', bgUnread: 'bg-orange-50', dotColor: 'bg-orange-500',
    badgeBg: 'bg-orange-100', badgeText: 'text-orange-700', label: 'Cambio de ficha', modulo: 'general',
  },
};

const DEFAULT_META: TipoMeta = {
  icono: 'campana', bgUnread: 'bg-[#007832]/5', dotColor: 'bg-[#007832]',
  badgeBg: 'bg-gray-100', badgeText: 'text-gray-600', label: 'Notificación', modulo: 'general',
};

function getMeta(tipo: string): TipoMeta {
  return TIPO_META[tipo] ?? DEFAULT_META;
}

function iconoPath(clave: string): string {
  return ICONOS[clave] ?? ICONOS['campana'];
}

interface AccionDestino {
  label: string;
  ruta:  string[];
  /** Query params opcionales — hoy solo usado para /admin?tab=... (deep-link a una pestaña puntual). */
  queryParams?: Record<string, string>;
}

// A qué pantalla lleva el botón de acción de cada tarjeta, según el módulo
// del tipo y el cargo del usuario — cada rol tiene sus propias rutas para
// Materiales/Horarios (ver app.routes.ts), así que no hay una única ruta por
// tipo. Nunca ejecuta la acción (aprobar/rechazar) desde acá — solo navega a
// la pantalla real, que ya tiene el contexto completo (stock, líneas, etc.)
// y la lógica de validación.
const RUTA_MATERIALES_ADMIN: Record<string, string> = {
  materiales_traslado_creado:          'materiales/traslados',
  materiales_traslado_override_admin:  'materiales/traslados',
  materiales_traslado_aprobado:        'materiales/traslados',
  materiales_traslado_rechazado:       'materiales/traslados',
  materiales_devolucion_registrada:    'materiales/devoluciones',
  materiales_stock_bajo:               'materiales/existencias',
  materiales_novedad_override_admin:   'materiales/novedades',
};

function rutaAccion(n: Notificacion, cargo: string): AccionDestino | null {
  const tipo = n.tipo;
  const meta = getMeta(tipo);
  const esAdmin      = cargo === 'administrador' || cargo === 'administrador_erp';
  const esInstructor = cargo === 'instructor';
  const esAprendiz   = cargo === 'aprendiz';

  if (meta.modulo === 'materiales') {
    if (esAdmin) {
      const ruta = RUTA_MATERIALES_ADMIN[tipo] ?? 'materiales/solicitudes';
      return { label: 'Ver en Materiales', ruta: [`/${ruta}`] };
    }
    if (esInstructor) {
      const ruta = tipo.startsWith('materiales_traslado')
        ? 'instructor/materiales/traslados'
        : 'instructor/materiales/solicitudes';
      return { label: 'Ver solicitud', ruta: [`/${ruta}`] };
    }
    if (esAprendiz) {
      return { label: 'Ver mi solicitud', ruta: ['/aprendiz/materiales/solicitudes'] };
    }
    return null;
  }

  if (meta.modulo === 'horarios') {
    if (esAdmin)      return { label: 'Ver horarios', ruta: ['/horarios'] };
    if (esInstructor) return { label: 'Ver mis horarios', ruta: ['/mis-horarios'] };
    if (esAprendiz)   return { label: 'Ver mi horario', ruta: ['/aprendiz-mis-horarios'] };
    return null;
  }

  if (meta.modulo === 'encuestas') {
    // Encuestas es su propio aplicativo (ítem propio en el sidebar, no vive
    // bajo "Módulos" junto a Etapa Práctica) — y sus dos únicos tipos
    // (encuesta_cerrada_tiempo/completada) solo se le notifican a admin
    // (notificarAdmins en el backend), nunca a instructor/aprendiz.
    return esAdmin ? { label: 'Ver encuestas', ruta: ['/encuestas'] } : null;
  }

  if (meta.modulo === 'etapa_practica') {
    if (esAdmin || esInstructor) {
      // bitacora_pdf_subido e instructor_asignado (las únicas de este módulo
      // que de verdad llegan a admin/instructor — el resto son para el propio
      // aprendiz, ver comentarios en bitacoras/asignaciones/etapa_practica
      // .service.ts) viajan con el personaId del aprendiz en `data` desde
      // 2026-09-10. Con personaId va a Seguimiento (TableInfoComponent en
      // /seguimiento) — ahí filtra la tabla a ese aprendiz Y le abre de una
      // el modal de seguimientos, que es la herramienta real de gestión.
      // "Historial" (/docs) es de solo lectura/exportar, no de gestionar —
      // sin personaId (dato viejo insertado antes de este cambio) se cae ahí
      // como mejor alternativa genérica.
      const personaId = n.data?.['personaId'];
      return personaId
        ? { label: 'Ver a ese aprendiz', ruta: ['/seguimiento'], queryParams: { persona: personaId } }
        : { label: 'Ver historial', ruta: ['/docs'] };
    }
    if (esAprendiz) {
      return { label: 'Ver mi seguimiento', ruta: ['/seguimiento'] };
    }
    return null;
  }

  // General
  if (tipo === 'aprendices_habilitados') {
    // No hay un ítem de menú dedicado a "Etapa Práctica" — es la pestaña
    // "etapas" dentro del panel /admin (AdminPanelComponent, AdminService.
    // activeTab). Como AdminService solo se provee ahí (no es providedIn:
    // 'root'), no se puede setear el signal desde acá — se pasa por query
    // param y AdminPanelComponent.ngOnInit lo aplica al entrar.
    return esAdmin
      ? { label: 'Ver en Etapas Prácticas', ruta: ['/admin'], queryParams: { tab: 'etapas' } }
      : null;
  }
  if (esAprendiz) {
    return { label: 'Ver mi seguimiento', ruta: ['/seguimiento'] };
  }
  return null;
}

@Component({
  selector:   'app-notificaciones-campana',
  standalone: true,
  imports:    [CommonModule],
  styles: [`
    /* Scroll funcional pero sin barra visible — mismo patrón que .sb-nav en
       sidebar.component.css (scrollbar-width para Firefox, ::-webkit-scrollbar
       para Chrome/Edge/Safari; el "scrollbar-hide" de Tailwind que usaba la
       v2 no está definido en ningún lado del proyecto, era un no-op). */
    .notif-scroll {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .notif-scroll::-webkit-scrollbar { display: none; }
  `],
  template: `
    <div class="relative">

      <!-- ── Botón campana ── -->
      <div class="relative group inline-block">
       <button
        (click)="toggleDropdown()"
        class="relative w-9 h-9 rounded-full flex items-center justify-center
               hover:bg-gray-100 transition-colors focus:outline-none"
      >
        <!-- Icono campana -->
        <svg
          class="w-5 h-5 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0
               00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0
               .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

    @if (unread() > 0) {
      <span
        class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1
               rounded-full bg-red-500 text-white text-[10px] font-bold
               flex items-center justify-center leading-none animate-pulse"
      >
        {{ unread() > 99 ? '99+' : unread() }}
      </span>
    }
  </button>

  <!-- TOOLTIP -->
  <span
    class="absolute top-full mt-2 -translate-x-1/2
           z-[99999] whitespace-nowrap
           rounded-md bg-gray-900 px-3 py-2
           text-xs font-medium text-white
           shadow-lg
           invisible opacity-0
           group-hover:visible group-hover:opacity-100
           transition-opacity duration-200"
  >
    Notificaciones ({{ cargo }})
  </span>
  </div>

      <!-- ── Panel desplegable ──
           En mobile (<640px) el ancho fijo (480px) anclado a right-0 del ícono
           (pegado al borde derecho del navbar) se salía de la pantalla por la
           izquierda — se posiciona "fixed" con márgenes al viewport en vez de
           colgar del ícono; en sm: y superior vuelve al comportamiento original.
           left-4/right-4 (no "inset-x-4") y su contraparte sm:left-auto/sm:right-0
           a propósito: usar la utilidad combinada inset-x-* junto con right-0 en el
           mismo breakpoint hacía que ambas compitieran por la misma propiedad CSS
           ("right") y el panel quedaba mal posicionado en desktop.
           Sin "max-w-full": en desktop el contenedor de posicionamiento de
           "absolute" es el wrapper del ícono (~36px, ver el div .relative de
           arriba), así que max-width:100% lo colapsaba a ese ancho en vez de
           dejar que sm:w-[480px] mandara. -->
      @if (open()) {
        <!-- Caret apuntando a la campana — solo en desktop: en mobile el panel
             es "fixed" centrado por márgenes al viewport, no cuelga del ícono,
             así que una flecha ahí apuntaría a la nada. -->
        <div class="hidden sm:block absolute right-3 top-[38px] w-3.5 h-3.5
                    bg-white/95 border-t border-l border-white/70
                    rotate-45 z-[199]"></div>

        <div class="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-11 w-auto sm:w-[480px]
                    bg-white/95 backdrop-blur-xl border border-white/70 ring-1 ring-black/5 rounded-2xl
                    shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25),0_8px_24px_-8px_rgba(15,23,42,0.15)]
                    z-[200] overflow-hidden flex flex-col"
             style="max-height: 680px;">

          <!-- Cabecera: icono + título + contador + cerrar. El rol/módulos
               vive en el tooltip de la campana y en las tabs de abajo, no acá
               (mezclar "Materiales · Horarios · Etapa práctica — {cargo}" en
               una sola línea gris no aportaba jerarquía).
               flex-shrink-0 en cabecera/utilidades/tabs/pie: el panel es
               flex-col con altura máxima fija — sin esto, cuando las tabs de
               módulo saltaban a una segunda fila, el bloque de la lista de
               abajo (con su propio max-height fijo) se quedaba sin achicarse
               y el conjunto completo superaba los 680px, recortando la
               última tarjeta sin que el scroll pudiera llegar a ella. Con
               flex-1 + min-h-0 en la lista (ver más abajo), la lista es la
               única que cede espacio y su scroll siempre alcanza el final. -->
          <div class="flex-shrink-0 flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <div class="w-11 h-11 rounded-xl bg-[#007832]/10 flex items-center justify-center flex-shrink-0">
              <svg class="w-6 h-6 text-[#007832]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" [attr.d]="iconoPath('campana')" />
              </svg>
            </div>
            <div class="flex-1 min-w-0 flex items-center gap-2">
              <span class="font-bold text-gray-800 text-base">Centro de Notificaciones</span>
              @if (unread() > 0) {
                <span class="text-[11px] font-bold min-w-[20px] h-5 px-1.5 rounded-full
                             bg-[#007832] text-white flex items-center justify-center flex-shrink-0">
                  {{ unread() > 99 ? '99+' : unread() }}
                </span>
              }
            </div>
            <button (click)="open.set(false)"
              class="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="iconoPath('equis')" />
              </svg>
            </button>
          </div>

          @if (notificaciones().length > 0) {
            <!-- Marcar todas leídas / solo no leídas -->
            <div class="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-gray-50">
              <label class="flex items-center gap-1.5 text-xs font-medium text-gray-500 cursor-pointer select-none">
                <input type="checkbox" [checked]="soloNoLeidas()"
                  (change)="soloNoLeidas.set(!soloNoLeidas())"
                  class="w-3.5 h-3.5 rounded border-gray-300 text-[#007832] focus:ring-[#007832]/40" />
                Solo no leídas
              </label>
              @if (unread() > 0) {
                <button (click)="leerTodas()"
                  class="text-xs text-[#007832] hover:underline font-semibold">
                  Marcar todas como leídas
                </button>
              }
            </div>

            <!-- Filtro por módulo — segmented control: track neutro, pestaña
                 activa en blanco elevado con sombra sutil (antes era un chip
                 negro sólido, muy pesado frente al resto de la interfaz).
                 flex-wrap en vez de scroll horizontal: con 5 pestañas (Todas +
                 4 módulos) no siempre entran en 480px, y con la barra de
                 scroll oculta (a pedido) la última pestaña quedaba cortada
                 sin ningún indicio de que había más — así siempre se ven
                 todas, saltando a una segunda fila si hace falta. -->
            <div class="flex-shrink-0 px-5 py-2.5 border-b border-gray-50">
              <div class="flex flex-wrap items-center gap-1 p-1 bg-gray-100 rounded-xl">
                <button (click)="filtroModulo.set('')"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  [class.bg-white]="filtroModulo() === ''"
                  [class.shadow-sm]="filtroModulo() === ''"
                  [class.text-gray-800]="filtroModulo() === ''"
                  [class.text-gray-500]="filtroModulo() !== ''">
                  Todas ({{ notificaciones().length }})
                </button>
                @for (m of modulosPresentes(); track m.id) {
                  <button (click)="filtroModulo.set(filtroModulo() === m.id ? '' : m.id)"
                    class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    [class.bg-white]="filtroModulo() === m.id"
                    [class.shadow-sm]="filtroModulo() === m.id"
                    [class.text-gray-800]="filtroModulo() === m.id"
                    [class.text-gray-500]="filtroModulo() !== m.id">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="iconoPath(m.icono)" />
                    </svg>
                    {{ m.label }} ({{ m.total }})
                  </button>
                }
              </div>
            </div>
          }

          <!-- Lista — fondo gris + tarjetas propias con separación real: antes
               cada fila solo tenía un "border-b" y, al compartir el mismo bg
               pastel cuando dos no-leídas seguidas eran del mismo tipo, se
               veían pegadas como si fueran una sola notificación.
               flex-1 + min-h-0 (no un "max-height" fijo en px): dentro de un
               padre flex-col con altura máxima, esto es lo que hace que ESTA
               sea la única sección que cede/gana espacio según lo que ocupen
               cabecera/utilidades/tabs — sin min-h-0 un hijo flex nunca se
               encoge por debajo de su contenido y el scroll interno no llega
               a mostrar el final de la lista. -->
          <div class="notif-scroll overflow-y-auto bg-gray-50/60 p-3 space-y-2.5 flex-1 min-h-0">
            @if (cargando()) {
              <div class="flex justify-center py-12">
                <div class="w-5 h-5 border-2 border-[#007832]/30 border-t-[#007832]
                            rounded-full animate-spin"></div>
              </div>
            } @else if (error()) {
              <div class="text-center py-14">
                <svg class="w-10 h-10 mx-auto mb-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" [attr.d]="iconoPath('alerta')" />
                </svg>
                <p class="text-sm font-semibold text-gray-700">No se pudieron cargar</p>
                <p class="text-xs text-gray-400 mt-1">
                  Hubo un problema de conexión. Se reintentará automáticamente.
                </p>
              </div>
            } @else if (notificacionesFiltradas().length === 0) {
              <div class="text-center py-14">
                <svg class="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" [attr.d]="iconoPath('campana')" />
                </svg>
                <p class="text-sm font-semibold text-gray-700">Sin notificaciones</p>
                <p class="text-xs text-gray-400 mt-1">
                  {{ filtroModulo() || soloNoLeidas() ? 'No hay notificaciones con este filtro' : 'Todo al día por aquí' }}
                </p>
              </div>
            } @else {
              @for (n of notificacionesFiltradas(); track n.id) {
                <div class="group relative rounded-xl border border-gray-100 px-4 py-3.5 transition-all duration-150"
                  [ngClass]="!n.leida ? getMeta(n.tipo).bgUnread : 'bg-white'">

                  <!-- Micro-acciones al hover: marcar leída / descartar -->
                  <div class="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    @if (!n.leida) {
                      <button (click)="marcarLeidaRapido(n); $event.stopPropagation()"
                        title="Marcar como leída"
                        class="w-6 h-6 rounded-full flex items-center justify-center bg-white border border-gray-200
                               text-gray-400 hover:text-[#007832] hover:border-[#007832]/40 shadow-sm transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="iconoPath('tick')" />
                        </svg>
                      </button>
                    }
                    <button (click)="descartar(n); $event.stopPropagation()"
                      title="Descartar"
                      class="w-6 h-6 rounded-full flex items-center justify-center bg-white border border-gray-200
                             text-gray-400 hover:text-red-600 hover:border-red-200 shadow-sm transition-colors">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="iconoPath('equis')" />
                      </svg>
                    </button>
                  </div>

                  <div class="flex items-start gap-3.5 pr-12">

                    <!-- Ícono del tipo -->
                    <div class="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
                      [ngClass]="!n.leida ? getMeta(n.tipo).badgeBg : 'bg-gray-100'">
                      <svg class="w-5 h-5" [ngClass]="!n.leida ? getMeta(n.tipo).badgeText : 'text-gray-500'"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75"
                          [attr.d]="iconoPath(getMeta(n.tipo).icono)" />
                      </svg>
                    </div>

                    <div class="flex-1 min-w-0 cursor-pointer" (click)="leer(n)">
                      <!-- Eyebrow: módulo + fecha -->
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-[10px] font-bold uppercase tracking-wide"
                          [style.color]="moduloColor(n.tipo)">
                          {{ moduloLabel(n.tipo) }}
                        </span>
                        <span class="text-gray-300">·</span>
                        <span class="text-[11px] text-gray-400">{{ formatDate(n.createdAt) }}</span>
                      </div>

                      <!-- Título + dot no leído -->
                      <div class="flex items-center gap-1.5 mt-1">
                        <p class="text-[15px] font-semibold text-gray-800 leading-snug flex-1 truncate">
                          {{ n.titulo }}
                        </p>
                        @if (!n.leida) {
                          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            [ngClass]="getMeta(n.tipo).dotColor"></span>
                        }
                      </div>

                      <!-- Mensaje (clic expande/colapsa el texto completo) -->
                      <p class="text-[13px] text-gray-500 mt-1 leading-relaxed"
                        [class.line-clamp-3]="expandedId() !== n.id">
                        {{ n.mensaje }}
                      </p>

                      <!-- Chip con el tipo exacto — mismo lenguaje de color que el ícono -->
                      <span class="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        [ngClass]="[getMeta(n.tipo).badgeBg, getMeta(n.tipo).badgeText]">
                        {{ getMeta(n.tipo).label }}
                      </span>

                      <!-- Lista de aprendices (tipo legacy aprendices_habilitados) -->
                      @if (n.tipo === 'aprendices_habilitados' && n.data?.['aprendices']?.length) {
                        <div class="mt-2.5 space-y-1 max-h-28 notif-scroll overflow-y-auto">
                          @for (a of n.data!['aprendices'].slice(0, 8); track a.cedula) {
                            <div class="flex items-center gap-1.5 text-xs text-gray-600">
                              <span class="w-1.5 h-1.5 rounded-full bg-[#39A900] flex-shrink-0"></span>
                              <span class="font-medium">{{ a.nombre }}</span>
                              <span class="text-gray-400">·</span>
                              <span class="text-[#007832] font-semibold">{{ a.avance }}%</span>
                            </div>
                          }
                          @if (n.data!['aprendices'].length > 8) {
                            <p class="text-xs text-gray-400 pl-3">
                              + {{ n.data!['aprendices'].length - 8 }} más…
                            </p>
                          }
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Acción: navega a la pantalla real, nunca ejecuta la acción acá -->
                  @if (accionPara(n); as accion) {
                    <div class="mt-3 ml-[3.25rem]">
                      <button (click)="irA(n, accion); $event.stopPropagation()"
                        class="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200
                               text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                        {{ accion.label }}
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="iconoPath('chevron')" />
                        </svg>
                      </button>
                    </div>
                  }
                </div>
              }
            }
          </div>

          <!-- Footer -->
          @if (notificaciones().length > 0) {
            <div class="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 text-center">
              <p class="text-xs text-gray-400">
                {{ unread() }} sin leer · {{ notificaciones().length }} en total
              </p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class NotificacionesCampanaComponent implements OnInit, OnDestroy {

  /** Cargo del usuario actual (pasado desde el navbar) */
  @Input() cargo: string = '';

  notificaciones = signal<Notificacion[]>([]);
  cargando       = signal(false);
  error          = signal(false);
  open           = signal(false);
  filtroModulo   = signal('');
  soloNoLeidas   = signal(false);
  expandedId     = signal<string | null>(null);

  unread = computed(() => this.notificaciones().filter(n => !n.leida).length);

  modulosPresentes = computed(() => {
    const conteos = new Map<ModuloId, number>();
    for (const n of this.notificaciones()) {
      const modulo = getMeta(n.tipo).modulo;
      conteos.set(modulo, (conteos.get(modulo) ?? 0) + 1);
    }
    return (Object.keys(MODULOS_META) as ModuloId[])
      .filter(id => conteos.has(id))
      .map(id => ({ id, ...MODULOS_META[id], total: conteos.get(id)! }));
  });

  notificacionesFiltradas = computed(() => {
    const modulo = this.filtroModulo();
    const soloNoLeidas = this.soloNoLeidas();
    return this.notificaciones().filter(n => {
      if (modulo && getMeta(n.tipo).modulo !== modulo) return false;
      if (soloNoLeidas && n.leida) return false;
      return true;
    });
  });

  private pollingId?: ReturnType<typeof setInterval>;

  // Referencia guardada para des-registrar exactamente este handler en
  // ngOnDestroy sin cerrar el socket compartido (ver comentario en
  // NotificacionesRealtimeService.off).
  private onNotifNueva = (n: any) => {
    this.notificaciones.update((list) => [n, ...list.filter((x) => x.id !== n.id)]);
  };

  // El backend borra una notificación 5 min después de marcarla leída — este
  // handler la quita de la lista en vivo sin esperar al próximo polling.
  private onNotifEliminada = (payload: { id: string }) => {
    this.notificaciones.update((list) => list.filter((x) => x.id !== payload.id));
  };

  constructor(
    private api: ApiService,
    private realtime: NotificacionesRealtimeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargar();
    // Refresca cada 30 s (pausado si la pestaña está en segundo plano)
    this.pollingId = setInterval(() => {
      if (document.hidden) return;
      this.cargar();
    }, 30_000);

    // Empuje en vivo por WebSocket — el polling de arriba queda solo como
    // respaldo si el socket se cae (reconexión de red, etc).
    this.realtime.onNotificacionNueva(this.onNotifNueva);
    this.realtime.onNotificacionEliminada(this.onNotifEliminada);
  }

  ngOnDestroy(): void {
    if (this.pollingId) clearInterval(this.pollingId);
    this.realtime.off('notificacion:nueva', this.onNotifNueva);
    this.realtime.off('notificacion:eliminada', this.onNotifEliminada);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.open()) return;
    const target = ev.target as HTMLElement;
    if (!target.closest('app-notificaciones-campana')) {
      this.open.set(false);
    }
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const lista = await this.api.listarNotificaciones();
      this.notificaciones.set(lista);
      this.error.set(false);
    } catch (err) {
      console.error('[NotificacionesCampana] No se pudo cargar la lista:', err);
      this.error.set(true);
    } finally {
      this.cargando.set(false);
    }
  }

  toggleDropdown(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.cargar();
  }

  async leer(n: Notificacion): Promise<void> {
    this.expandedId.update(id => id === n.id ? null : n.id);
    if (!n.leida) {
      await this.api.marcarNotificacionLeida(n.id);
      this.notificaciones.update(list =>
        list.map(x => x.id === n.id ? { ...x, leida: true } : x)
      );
    }
  }

  async leerTodas(): Promise<void> {
    await this.api.marcarTodasNotificacionesLeidas();
    this.notificaciones.update(list => list.map(x => ({ ...x, leida: true })));
  }

  /** Botón rápido del hover — marca leída sin expandir/colapsar el mensaje (a diferencia de leer()). */
  marcarLeidaRapido(n: Notificacion): void {
    if (n.leida) return;
    this.api.marcarNotificacionLeida(n.id).catch(err =>
      console.error('[NotificacionesCampana] No se pudo marcar como leída:', err)
    );
    this.notificaciones.update(list =>
      list.map(x => x.id === n.id ? { ...x, leida: true } : x)
    );
  }

  /** Descartar = borrar la fila propia (DELETE /notificaciones/:id). Optimista:
   *  la quita de la vista ya mismo y solo la restaura si el borrado falló. */
  async descartar(n: Notificacion): Promise<void> {
    this.notificaciones.update(list => list.filter(x => x.id !== n.id));
    try {
      await this.api.eliminarNotificacion(n.id);
    } catch (err) {
      console.error('[NotificacionesCampana] No se pudo descartar:', err);
      await this.cargar();
    }
  }

  getMeta(tipo: string): TipoMeta {
    return getMeta(tipo);
  }

  iconoPath(clave: string): string {
    return iconoPath(clave);
  }

  moduloLabel(tipo: string): string {
    return MODULOS_META[getMeta(tipo).modulo].label;
  }

  moduloColor(tipo: string): string {
    return MODULOS_META[getMeta(tipo).modulo].color;
  }

  /** Botón de acción de la tarjeta: null si este tipo/cargo no tiene una pantalla clara a dónde ir. */
  accionPara(n: Notificacion): AccionDestino | null {
    return rutaAccion(n, this.cargo);
  }

  /** Navega a la pantalla real de la acción — nunca aprueba/rechaza desde acá (ver plan). */
  irA(n: Notificacion, accion: AccionDestino): void {
    this.open.set(false);
    if (!n.leida) {
      this.api.marcarNotificacionLeida(n.id).catch(() => {});
      this.notificaciones.update(list =>
        list.map(x => x.id === n.id ? { ...x, leida: true } : x)
      );
    }
    this.router.navigate(accion.ruta, accion.queryParams ? { queryParams: accion.queryParams } : {});
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d    = new Date(iso);
    const now  = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;

    if (diff < 60)            return 'Hace un momento';
    if (diff < 3600)          return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400)         return `Hace ${Math.floor(diff / 3600)} h`;
    if (diff < 86400 * 7)     return `Hace ${Math.floor(diff / 86400)} días`;

    return d.toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }
}
