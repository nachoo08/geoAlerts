# geoAlerts

**Monitoreo, registro y visualización en tiempo real de alertas meteorológicas y marítimas de Buenos Aires y su franja costera.**

Vientos, tormentas, sudestadas y oleaje sobre un mapa interactivo: el público consulta sin registrarse y cada organismo autorizado publica y gestiona **solo sus propias alertas**, que llegan al instante a todos los navegadores abiertos.

![versión](https://img.shields.io/badge/versión-1.0.0-3fa7d6) ![pruebas](https://img.shields.io/badge/pruebas-72%2F72-2e9e5b) ![cobertura](https://img.shields.io/badge/cobertura-96%25-2e9e5b) ![node](https://img.shields.io/badge/node-%E2%89%A520-informational) ![licencia](https://img.shields.io/badge/licencia-MIT-lightgrey)

---

## Documentación del proyecto

| Etapa | Documento | Contenido |
| --- | --- | --- |
| 1 | [Análisis y Factibilidad](docs/01-analisis-factibilidad.md) | Problema y objetivos · alcance geográfico y microclimas · DFD Nivel 0 y 1 · relevamiento · estudio de mercado · factibilidades (FODA cruzado, técnica, económica, legal) · O.L.A. · propuesta y contrato · Gantt, Curva S y riesgos |
| 2 | [Diseño y Arquitectura](docs/02-diseno-arquitectura.md) | Elección tecnológica · DER, modelo relacional, diccionario y 3FN · RF-01 a RF-12 y RNF ISO/IEC 25010 · casos de uso · diagrama de clases · DSS orientado a eventos y glosario HTTP · arquitectura en 3 capas y aislamiento multiempresa · matriz de trazabilidad SQA |
| 3 | [Implementación, Construcción y Testing](docs/03-implementacion-testing.md) | Entorno y estructura · estándares de código, tipado, transacciones y consultas parametrizadas · caja blanca, caja negra y E2E · puesta en producción |
| 4 | [Release, Mantenimiento y Cierre](docs/04-release-mantenimiento.md) | Notas de versión v1.0.0 · UAT y compatibilidad de navegadores · plan de reversión · manuales de Usuario y Administrador · FAQ · plan de mantenimiento · glosario y trabajo futuro |

Historial de cambios: [CHANGELOG.md](CHANGELOG.md).

## Arquitectura

```mermaid
flowchart LR
    subgraph Presentación
        R["React + Vite<br/>Leaflet + OpenStreetMap"]
    end
    subgraph Lógica
        E["Node.js + Express<br/>API REST + eventos SSE"]
    end
    subgraph Datos
        S[("SQLite")]
    end
    C["compartido/<br/>reglas de dominio"]
    R -- "HTTP/JSON" --> E
    E -- "text/event-stream" --> R
    E --> S
    R -.-> C
    E -.-> C
```

## Inicio rápido

Requisitos: **Node.js 20 o superior**.

```bash
npm install            # instala backend, frontend y módulo compartido
npm run dev:backend    # API en http://localhost:3001 (crea la base con datos de prueba)
npm run dev:frontend   # en otra terminal → http://localhost:5173
```

| Usuario | Contraseña | Rol |
| --- | --- | --- |
| `admin` | `admin123` | Superadministrador (todos los organismos) |
| `defensacivil` | `demo123` | Administrador · Defensa Civil CABA (demo) |
| `tigre` | `demo123` | Administrador · Defensa Civil Tigre (demo) |

Los usuarios de demostración no se crean en producción.

### Otros comandos

```bash
npm test               # 72 pruebas de caja blanca y caja negra
npm run test:cobertura # pruebas + informe de cobertura
npm run typecheck      # verificación de tipos TypeScript (strict)
npm run build          # compila el frontend
npm start              # producción (tras npm run build): API + frontend en http://localhost:3001
npm run backup         # respaldo en caliente de la base
```

### Producción con Docker

```bash
cp infra/.env.ejemplo infra/.env   # completar DOMINIO, JWT_SECRET y ADMIN_PASSWORD
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
```

Detalle en la [Etapa 3, sección 3.4](docs/03-implementacion-testing.md#34-puesta-en-producción).

## API REST

| Método | Ruta | Acceso | Respuestas |
| --- | --- | --- | --- |
| GET | `/api/salud` | Público | 200 |
| POST | `/api/login` | Público | 200 · 400 · 401 |
| GET | `/api/alertas?tipo=&gravedad=&estado=` | Público | 200 · 400 |
| GET | `/api/alertas/:id` | Público | 200 · 400 · 404 |
| GET | `/api/origenes` | Público | 200 |
| GET | `/api/eventos` | Público (SSE) | 200 `text/event-stream` |
| POST | `/api/alertas` | Token Bearer | 201 · 400 · 401 · 403 · 500 |
| PATCH | `/api/alertas/:id/estado` | Token Bearer | 200 · 400 · 401 · 403 · 404 |

Glosario completo de códigos en la [Etapa 2, sección 2.4.5](docs/02-diseno-arquitectura.md#245-glosario-de-códigos-de-respuesta-http).

## Estructura

```text
geoAlerts/
├── compartido/   reglas de dominio comunes (región, validación, permisos, tipos)
├── backend/      schema.sql · db.js · auth.js · eventos.js · server.js · tests/
├── frontend/     React + Leaflet (App.jsx, Mapa.jsx, api.js) · e2e/
├── infra/        Dockerfile · docker-compose.yml · Caddyfile
└── docs/         documentación de las Etapas 1 a 4
```

## Aviso

geoAlerts **complementa y no reemplaza** a los canales oficiales de alerta. Los organismos de demostración incluidos en los datos de prueba no representan a entidades reales. Cartografía © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

## Licencia

[MIT](LICENSE).
