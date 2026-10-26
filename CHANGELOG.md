# Changelog

Todos los cambios relevantes de geoAlerts se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Planificado

- Ingesta automática de alertas del SMN y de oleaje de Open-Meteo (v1.1).
- Gestión de organismos y administradores desde la interfaz (v1.1).
- Limitador de intentos de inicio de sesión (v1.0.x).

## [1.0.0] — 2026-10-26

Primera versión pública (MVP).

### Agregado

- Mapa interactivo con Leaflet y OpenStreetMap encuadrado en Buenos Aires y su franja costera.
- Alertas de viento, tormenta, sudestada y oleaje en niveles amarillo, naranja y rojo.
- Filtros por tipo, gravedad y estado (historial de finalizadas).
- Actualización en tiempo real mediante Server-Sent Events (`/api/eventos`).
- Autenticación de administradores con bcrypt y JWT (8 h).
- Alta manual con ubicación desde el mapa y validación de región en cliente, API y base de datos.
- Cambio de estado de alertas (activa ↔ finalizada) con fecha de actualización.
- Aislamiento multiempresa por organismo y rol de superadministrador.
- Módulo `compartido` con las reglas de dominio comunes a backend y frontend.
- Verificación de tipos estricta con TypeScript (`checkJs`).
- 72 pruebas automatizadas de caja blanca y caja negra y una prueba E2E con Playwright.
- Imagen Docker, Docker Compose con Caddy (HTTPS) y script de respaldo en caliente.
- Documentación de las Etapas 1 a 4 en Markdown.

### Cambiado respecto del prototipo de la Etapa 2

- El rol "Ciudadano" pasa a llamarse **Usuario**; el rol "Operador" se reemplaza por **Administrador** de un organismo y se agrega el **Superadministrador**.
- Los errores de validación devuelven **400 Bad Request** (antes 422) y los accesos a datos de otro organismo **403 Forbidden**.
- El alcance pasa de nacional a la región de Buenos Aires y su franja costera.
- El backend se reorganiza en módulos ES (`db.js`, `auth.js`, `eventos.js`, `server.js`).

[Sin publicar]: https://github.com/<organizacion>/geoAlerts/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/<organizacion>/geoAlerts/releases/tag/v1.0.0
