# Plan de reestructuración del frontend

## Completado

1. Se adoptó `features/<dominio>/data-access` para Materiales, Horarios y
   Encuestas.
2. Se extrajeron las rutas de esos tres dominios de `app.routes.ts`.
3. Se añadieron fachadas temporales para no romper imports existentes.

## Siguientes entregas

1. Migrar las importaciones restantes de Horarios para no usar la fachada de
   compatibilidad de `core`.
2. Mover pantallas y modales de Materiales a
   `features/materiales/{pages,ui,models}` y consolidar variantes por rol.
3. Mover Encuestas a `features/surveys/{pages,ui,models}`.
4. Separar el actual `features/admin` en administración del tenant, Horarios,
   Encuestas y Materiales; el superadministrador será administración de
   plataforma.
5. Dividir `layout/` entre los shells de tenant y plataforma y retirar las
   fachadas cuando ya no tengan consumidores.

## Criterio de salida

- Ningún cliente HTTP de negocio permanece realmente en `core/services`.
- Ninguna feature importa internamente otra feature.
- La aplicación conserva URLs, guards y navegación durante todo el cambio.
- Cada entrega termina con `npm run build`.
