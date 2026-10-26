-- =====================================================================
--  geoAlerts — Esquema de base de datos (SQLite 3)
--  Normalizado hasta 3FN. Coordenadas WGS84 en columnas REAL.
--  Región de cobertura: Buenos Aires y franja costera
--    latitud  entre -41.2 y -33.0
--    longitud entre -63.5 y -56.5
--  (mismos valores que REGION en compartido/dominio.js: mantener sincronizados)
-- =====================================================================

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS ALERTA;
DROP TABLE IF EXISTS USUARIO;
DROP TABLE IF EXISTS ORIGEN_DATO;

-- ---------------------------------------------------------------------
-- ORIGEN_DATO: fuente de una alerta. Las fuentes CARGA_MANUAL representan
-- a cada organismo operador (unidad de aislamiento multiempresa).
-- ---------------------------------------------------------------------
CREATE TABLE ORIGEN_DATO (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre       TEXT    NOT NULL UNIQUE,
    tipo_fuente  TEXT    NOT NULL CHECK (tipo_fuente IN ('API_EXTERNA', 'CARGA_MANUAL'))
);

-- ---------------------------------------------------------------------
-- USUARIO: administradores con acceso autenticado.
-- ADMINISTRADOR pertenece a un organismo (id_origen obligatorio).
-- SUPERADMIN es global (id_origen nulo).
-- El Usuario público es anónimo y no se persiste.
-- ---------------------------------------------------------------------
CREATE TABLE USUARIO (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username       TEXT    NOT NULL UNIQUE,
    password_hash  TEXT    NOT NULL,
    rol            TEXT    NOT NULL CHECK (rol IN ('ADMINISTRADOR', 'SUPERADMIN')),
    id_origen      INTEGER REFERENCES ORIGEN_DATO(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CHECK ((rol = 'SUPERADMIN'    AND id_origen IS NULL) OR
           (rol = 'ADMINISTRADOR' AND id_origen IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- ALERTA: evento meteorológico/marítimo geolocalizado en la región.
-- ---------------------------------------------------------------------
CREATE TABLE ALERTA (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo              TEXT    NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 120),
    tipo                TEXT    NOT NULL CHECK (tipo IN ('VIENTO', 'TORMENTA', 'SUDESTADA', 'OLEAJE')),
    nivel_gravedad      TEXT    NOT NULL CHECK (nivel_gravedad IN ('AMARILLO', 'NARANJA', 'ROJO')),
    descripcion         TEXT    CHECK (descripcion IS NULL OR length(descripcion) <= 1000),
    latitud             REAL    NOT NULL CHECK (latitud  BETWEEN -41.2 AND -33.0),
    longitud            REAL    NOT NULL CHECK (longitud BETWEEN -63.5 AND -56.5),
    fecha_creacion      TEXT    NOT NULL DEFAULT (datetime('now')),
    fecha_actualizacion TEXT,
    estado              TEXT    NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'FINALIZADA')),
    id_origen           INTEGER NOT NULL REFERENCES ORIGEN_DATO(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Índices para los filtros del mapa y búsquedas por zona / organismo
CREATE INDEX idx_alerta_tipo      ON ALERTA(tipo);
CREATE INDEX idx_alerta_gravedad  ON ALERTA(nivel_gravedad);
CREATE INDEX idx_alerta_estado    ON ALERTA(estado);
CREATE INDEX idx_alerta_origen    ON ALERTA(id_origen);
CREATE INDEX idx_alerta_coords    ON ALERTA(latitud, longitud);

-- =====================================================================
--  SEED DATA — datos de prueba centrados en Buenos Aires
--  (nombres de organismos marcados "demo": no representan a entidades reales)
-- =====================================================================
INSERT INTO ORIGEN_DATO (id, nombre, tipo_fuente) VALUES
    (1, 'Defensa Civil CABA (demo)',        'CARGA_MANUAL'),
    (2, 'Defensa Civil Tigre (demo)',       'CARGA_MANUAL'),
    (3, 'SMN - Datos abiertos',             'API_EXTERNA'),
    (4, 'Open-Meteo Marine API',            'API_EXTERNA');

-- Los usuarios se crean en db.js (las contraseñas se guardan con hash bcrypt).

INSERT INTO ALERTA (titulo, tipo, nivel_gravedad, descripcion, latitud, longitud, estado, id_origen) VALUES
    ('Sudestada en el Río de la Plata', 'SUDESTADA', 'NARANJA',
     'Crecida estimada de 3,2 m en el puerto de Buenos Aires. Precaución en la costanera y zonas ribereñas.',
     -34.6083, -58.3637, 'ACTIVA', 3),
    ('Crecida en el Delta del Paraná', 'SUDESTADA', 'AMARILLO',
     'Repunte del río en islas del Delta. Se recomienda a isleños asegurar embarcaciones.',
     -34.4264, -58.5796, 'ACTIVA', 2),
    ('Anegamientos en Palermo', 'TORMENTA', 'ROJO',
     'Lluvia intensa con acumulados superiores a 60 mm en pocas horas. Evitar circular por bajo nivel.',
     -34.5781, -58.4265, 'ACTIVA', 1),
    ('Ráfagas en la ribera de Quilmes', 'VIENTO', 'AMARILLO',
     'Vientos del sudeste con ráfagas de hasta 70 km/h.',
     -34.7206, -58.2546, 'ACTIVA', 1),
    ('Tormentas fuertes en La Plata', 'TORMENTA', 'NARANJA',
     'Tormentas con actividad eléctrica y posible caída de granizo.',
     -34.9214, -57.9545, 'ACTIVA', 3),
    ('Oleaje fuerte en Mar del Plata', 'OLEAJE', 'NARANJA',
     'Olas de 3 a 4 m. Se desaconseja la navegación de embarcaciones menores.',
     -38.0055, -57.5426, 'ACTIVA', 4),
    ('Mar de fondo en San Clemente del Tuyú', 'OLEAJE', 'AMARILLO',
     'Oleaje de 2 a 3 m en la costa atlántica norte.',
     -36.3569, -56.7235, 'ACTIVA', 4),
    ('Viento fuerte en Bahía Blanca', 'VIENTO', 'AMARILLO',
     'Vientos del oeste con ráfagas de hasta 80 km/h.',
     -38.7183, -62.2663, 'ACTIVA', 3),
    ('Ráfagas en Necochea', 'VIENTO', 'AMARILLO',
     'Evento finalizado. Se conserva en el historial.',
     -38.5545, -58.7396, 'FINALIZADA', 3);
