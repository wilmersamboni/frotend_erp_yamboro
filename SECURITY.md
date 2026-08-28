# Requisitos de seguridad — frontend-erp

Documento vivo. Si un cambio de código contradice algo de aquí, gana el
código y hay que actualizar este archivo — no al revés.

## Secretos

`.env` en este repo es un archivo heredado de un backend anterior; ningún
código de Angular lo lee (Angular no ejecuta `.env` en el navegador). Nunca
debió commitearse — se hizo una vez (commit `6ff2e4f`, contenía
`DB_PASSWORD` y `JWT_SECRET`) y quedó en el historial de git. Verificado
(2026-08-04, comparación de hash SHA-256, sin exponer los valores en
texto): esos dos valores **no coinciden** con `DB_PASSWORD`/`JWT_SECRET`
activos en ningún `.env` real del stack — las credenciales cambiaron desde
entonces por el ciclo normal de rotación, así que lo que queda en el
historial ya no es explotable. Sigue siendo higiene pendiente purgarlo del
historial (`git filter-repo`, requiere force-push coordinado con el
equipo), pero ya no es una urgencia de seguridad activa. `.env` está en
`.gitignore` para que no se repita.

## Autenticación en el cliente

El interceptor HTTP de Angular envía el tenant vía cabecera `x-tenant`
(tomada de `localStorage`) en cada request — es la única forma de
resolución de tenant que usa este despliegue (no hay subdominios). La
cookie de sesión la pone el backend como `httpOnly`; el frontend no debe
leer ni manipular el JWT directamente, solo reenviar lo que el navegador
ya adjunta.

## Dependencias

`npm audit --production --audit-level=high` corre en cada PR vía CI.

`xlsx` ya no es dependencia del proyecto: `excel-parser.service.ts`
(módulo de migración de datos) se reescribió sobre `exceljs`, que ya se
usaba en `export.service.ts`. La reescritura se validó con fixtures
propios (`excel-parser.service.spec.ts`) construidos para reproducir
exactamente la forma de hoja que el parser espera — no había ningún
archivo de prueba real disponible, así que la equivalencia se probó
contra datos sintéticos, no contra un caso real de migración. Antes de
la primera migración real con el código nuevo, conviene correrla una vez
en paralelo con un archivo real y comparar el resultado a mano.

Vulnerabilidad conocida sin corregir (nueva, no relacionada con lo
anterior): `@angular/common`/`@angular/compiler`/`@angular/core` y
paquetes que dependen de ellos tienen avisos de seguridad (XSS, DoS)
para el rango `21.0.0-next.0 - 21.2.18`. Existe `21.2.19` con el fix,
pero el árbol de peer dependencies (`@angular/cdk`, `primeng`,
`@taiga-ui/*`) no resuelve limpio al intentar subir solo los paquetes
`@angular/*` — necesita una actualización coordinada de todo ese grupo,
no un bump aislado. Pendiente, requiere su propia sesión de trabajo.

## Servicios externos

Esta aplicación llama, desde el navegador del usuario final, a servicios de
terceros: un webhook de chat en `danin8n.duckdns.org`, mapas de
OpenStreetMap, y un worker de PDF servido desde `cdnjs`. Cualquier cambio
de Content-Security-Policy debe tenerlos en cuenta, y cualquier decisión de
quitarlos/reemplazarlos debe documentarse aquí.
