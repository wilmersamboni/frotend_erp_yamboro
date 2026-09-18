# Arquitectura del frontend

La aplicación se organiza por **dominio funcional**. Un dominio es dueño de
sus rutas, clientes HTTP, modelos, componentes internos y páginas. Los roles
(`administrador`, `instructor`, `aprendiz`) definen acceso y variantes, no un
dominio nuevo.

```
src/app/
  core/       infraestructura global: autenticación, HTTP, tenant, guards,
              tiempo real transversal y estado global de UI
  layout/     shell visual actual; migrará después a shells explícitos
  shared/     UI, tipos y utilidades sin reglas de un dominio
  features/
    schedules/  rutas y data-access de Horarios
    surveys/    rutas y data-access de Encuestas
    materiales/ data-access y rutas de Materiales
```

## Convenciones

- `data-access/`: cliente HTTP, adaptadores y canales en tiempo real exclusivos
  de un dominio.
- `pages/`: componentes de ruta; puede contener variantes por rol cuando la UI
  realmente sea diferente.
- `ui/`: componentes internos del dominio.
- `models/`: contratos y tipos exclusivos del dominio.
- `*.routes.ts`: único lugar donde un dominio declara rutas y guards.

`core/` no acepta nuevos clientes HTTP de negocio. Las fachadas restantes en
`core/services/{materiales,horarios,encuestas}` son compatibilidad temporal.

| Dominio | Rutas | Data access | Páginas |
|---|---:|---:|---:|
| Horarios | listo | listo | listo |
| Encuestas | listo | listo | pendiente de traslado físico |
| Materiales | listo | listo | pendiente de traslado físico |
