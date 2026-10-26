// @ts-check
/**
 * geoAlerts — Capa de Datos
 * -------------------------
 * Conexión al archivo SQLite, inicialización del esquema y repositorio de consultas.
 *
 * Sobre el "pool" de conexiones: better-sqlite3 es un driver SÍNCRONO y SQLite
 * admite un único escritor a la vez, por lo que un pool de N conexiones no aporta
 * rendimiento y sí riesgo de bloqueos (SQLITE_BUSY). El patrón recomendado es una
 * conexión única por proceso (singleton) reutilizada por todas las peticiones, con
 * sentencias PREPARADAS y CACHEADAS: cumple el rol del pool (reutilizar recursos
 * costosos) y garantiza consultas parametrizadas (sin concatenar entradas del
 * usuario en el SQL → inmune a inyección SQL).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

/**
 * @typedef {import('@geoalerts/compartido').Alerta} Alerta
 * @typedef {import('@geoalerts/compartido').OrigenDato} OrigenDato
 * @typedef {import('@geoalerts/compartido').UsuarioSesion} UsuarioSesion
 * @typedef {UsuarioSesion & { password_hash: string }} UsuarioConHash
 * @typedef {{ tipo?: string, gravedad?: string, estado?: string }} FiltrosAlerta
 * @typedef {{ titulo: string, tipo: string, nivel_gravedad: string, descripcion: string|null,
 *             latitud: number, longitud: number, id_origen: number }} NuevaAlerta
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'geoalerts.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const EN_MEMORIA = DB_PATH === ':memory:';
const PRODUCCION = process.env.NODE_ENV === 'production';

const esNueva = EN_MEMORIA || !fs.existsSync(DB_PATH);

/** Conexión única del proceso (singleton). */
export const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');      // integridad referencial (SQLite la trae apagada)
db.pragma('busy_timeout = 5000');    // espera hasta 5 s si otro proceso escribe
if (!EN_MEMORIA) db.pragma('journal_mode = WAL'); // lectores no bloquean al escritor

if (esNueva) inicializar();

/** Crea las tablas, carga los datos de prueba y los usuarios iniciales. */
function inicializar() {
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  const claveAdmin = process.env.ADMIN_PASSWORD || (PRODUCCION ? '' : 'admin123');
  if (!claveAdmin) throw new Error('En producción la variable ADMIN_PASSWORD es obligatoria');

  /** @type {Array<[string, string, string, number|null]>} */
  const usuarios = [[process.env.ADMIN_USER || 'admin', claveAdmin, 'SUPERADMIN', null]];
  if (!PRODUCCION) {
    // Administradores de demostración, uno por organismo (aislamiento multiempresa)
    usuarios.push(['defensacivil', 'demo123', 'ADMINISTRADOR', 1]);
    usuarios.push(['tigre', 'demo123', 'ADMINISTRADOR', 2]);
  }
  const insertar = db.prepare(
    'INSERT INTO USUARIO (username, password_hash, rol, id_origen) VALUES (?, ?, ?, ?)'
  );
  db.transaction(() => {
    for (const [usuario, clave, rol, origen] of usuarios) {
      insertar.run(usuario, bcrypt.hashSync(clave, 10), rol, origen);
    }
  })();
  if (!EN_MEMORIA) console.log(`[db] Base creada en ${DB_PATH}`);
}

// ---------------------------------------------------------------------
// Sentencias preparadas (se compilan una vez y se reutilizan)
// ---------------------------------------------------------------------
const SELECT_ALERTA = `
  SELECT a.id, a.titulo, a.tipo, a.nivel_gravedad, a.descripcion, a.latitud, a.longitud,
         a.fecha_creacion, a.fecha_actualizacion, a.estado, a.id_origen,
         o.nombre AS origen_nombre, o.tipo_fuente
  FROM ALERTA a
  JOIN ORIGEN_DATO o ON o.id = a.id_origen`;

const sql = {
  alertaPorId: db.prepare(`${SELECT_ALERTA} WHERE a.id = ?`),
  insertarAlerta: db.prepare(`
    INSERT INTO ALERTA (titulo, tipo, nivel_gravedad, descripcion, latitud, longitud, id_origen)
    VALUES (@titulo, @tipo, @nivel_gravedad, @descripcion, @latitud, @longitud, @id_origen)`),
  // Defensa en profundidad: además del control en la capa de lógica, el UPDATE
  // solo afecta filas del organismo permitido (NULL = sin restricción, SUPERADMIN).
  actualizarEstado: db.prepare(`
    UPDATE ALERTA SET estado = @estado, fecha_actualizacion = datetime('now')
    WHERE id = @id AND (@id_origen IS NULL OR id_origen = @id_origen)`),
  usuarioPorUsername: db.prepare(`
    SELECT u.id, u.username, u.password_hash, u.rol, u.id_origen, o.nombre AS origen_nombre
    FROM USUARIO u LEFT JOIN ORIGEN_DATO o ON o.id = u.id_origen
    WHERE u.username = ?`),
  origenes: db.prepare('SELECT id, nombre, tipo_fuente FROM ORIGEN_DATO ORDER BY id'),
  origenPorId: db.prepare('SELECT id, nombre, tipo_fuente FROM ORIGEN_DATO WHERE id = ?'),
  primerOrigenManual: db.prepare(
    "SELECT id, nombre, tipo_fuente FROM ORIGEN_DATO WHERE tipo_fuente = 'CARGA_MANUAL' ORDER BY id LIMIT 1"),
};

// ---------------------------------------------------------------------
// Repositorio
// ---------------------------------------------------------------------

/**
 * Lista alertas aplicando filtros opcionales. Las columnas vienen de una lista
 * blanca fija y los valores viajan como parámetros "?" (nunca concatenados).
 * @param {FiltrosAlerta} filtros
 * @returns {Alerta[]}
 */
export function listarAlertas(filtros = {}) {
  /** @type {Array<[string, string|undefined]>} */
  const columnas = [
    ['a.tipo', filtros.tipo],
    ['a.nivel_gravedad', filtros.gravedad],
    ['a.estado', filtros.estado],
  ];
  const activas = columnas.filter(([, valor]) => valor);
  const where = activas.length ? ` WHERE ${activas.map(([col]) => `${col} = ?`).join(' AND ')}` : '';
  const stmt = db.prepare(`${SELECT_ALERTA}${where} ORDER BY a.fecha_creacion DESC, a.id DESC`);
  return /** @type {Alerta[]} */ (stmt.all(...activas.map(([, valor]) => valor)));
}

/** @param {number} id @returns {Alerta|undefined} */
export function obtenerAlerta(id) {
  return /** @type {Alerta|undefined} */ (sql.alertaPorId.get(id));
}

/**
 * Inserta una alerta y la relee con su origen dentro de UNA transacción:
 * si cualquier paso falla, SQLite revierte todo (ROLLBACK) y no queda nada a medias.
 * @type {(datos: NuevaAlerta) => Alerta}
 */
export const crearAlerta = db.transaction((datos) => {
  const info = sql.insertarAlerta.run(datos);
  return /** @type {Alerta} */ (sql.alertaPorId.get(info.lastInsertRowid));
});

/**
 * Cambia el estado de una alerta en una transacción.
 * @type {(id: number, estado: string, idOrigenPermitido: number|null) => Alerta|undefined}
 */
export const actualizarEstado = db.transaction((id, estado, idOrigenPermitido) => {
  const info = sql.actualizarEstado.run({ id, estado, id_origen: idOrigenPermitido });
  if (info.changes === 0) return undefined;
  return /** @type {Alerta} */ (sql.alertaPorId.get(id));
});

/** @param {string} username @returns {UsuarioConHash|undefined} */
export function buscarUsuario(username) {
  return /** @type {UsuarioConHash|undefined} */ (sql.usuarioPorUsername.get(username));
}

/** @returns {OrigenDato[]} */
export function listarOrigenes() {
  return /** @type {OrigenDato[]} */ (sql.origenes.all());
}

/** @param {number} id @returns {OrigenDato|undefined} */
export function obtenerOrigen(id) {
  return /** @type {OrigenDato|undefined} */ (sql.origenPorId.get(id));
}

/** @returns {OrigenDato|undefined} */
export function origenManualPorDefecto() {
  return /** @type {OrigenDato|undefined} */ (sql.primerOrigenManual.get());
}

/** Cierra la conexión (apagado ordenado del servidor). */
export function cerrar() {
  if (db.open) db.close();
}
