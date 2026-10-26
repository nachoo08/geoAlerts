// @ts-check
/**
 * geoAlerts — Módulo compartido de dominio
 * ----------------------------------------
 * Lo importan tanto el backend (Node.js) como el frontend (React/Vite), de modo
 * que las reglas de negocio (dominios válidos, región geográfica, validación y
 * permisos) se definen UNA sola vez y no pueden divergir entre capas.
 */

/** Tipos de fenómeno admitidos. */
export const TIPOS_ALERTA = /** @type {const} */ (['VIENTO', 'TORMENTA', 'SUDESTADA', 'OLEAJE']);
/** Niveles de gravedad (misma escala de colores que el sistema de alerta temprana oficial). */
export const NIVELES_GRAVEDAD = /** @type {const} */ (['AMARILLO', 'NARANJA', 'ROJO']);
/** Ciclo de vida de una alerta. */
export const ESTADOS_ALERTA = /** @type {const} */ (['ACTIVA', 'FINALIZADA']);
/** Clases de fuente de datos. */
export const TIPOS_FUENTE = /** @type {const} */ (['API_EXTERNA', 'CARGA_MANUAL']);
/** Roles con acceso autenticado (el Usuario público es anónimo). */
export const ROLES = /** @type {const} */ (['ADMINISTRADOR', 'SUPERADMIN']);

export const TITULO_MAX = 120;
export const DESCRIPCION_MAX = 1000;

/**
 * Región de cobertura: provincia de Buenos Aires, CABA y su franja costera
 * (Río de la Plata y litoral atlántico). Es un rectángulo envolvente (bounding
 * box) en WGS84; el ajuste fino a un polígono requiere PostGIS (trabajo futuro).
 * IMPORTANTE: los mismos límites están replicados en el CHECK de schema.sql.
 */
export const REGION = Object.freeze({
  nombre: 'Buenos Aires y franja costera',
  latMin: -41.2,
  latMax: -33.0,
  lngMin: -63.5,
  lngMax: -56.5,
});

/** Nombres de los eventos de dominio que viajan por el bus y por SSE. */
export const EVENTOS = Object.freeze({
  ALERTA_CREADA: 'alerta:creada',
  ALERTA_ACTUALIZADA: 'alerta:actualizada',
});

export const ETIQUETA_TIPO = Object.freeze({
  VIENTO: 'Viento', TORMENTA: 'Tormenta', SUDESTADA: 'Sudestada', OLEAJE: 'Oleaje',
});

/**
 * @typedef {typeof TIPOS_ALERTA[number]} TipoAlerta
 * @typedef {typeof NIVELES_GRAVEDAD[number]} NivelGravedad
 * @typedef {typeof ESTADOS_ALERTA[number]} EstadoAlerta
 * @typedef {typeof TIPOS_FUENTE[number]} TipoFuente
 * @typedef {typeof ROLES[number]} Rol
 *
 * @typedef {Object} OrigenDato
 * @property {number} id
 * @property {string} nombre
 * @property {TipoFuente} tipo_fuente
 *
 * @typedef {Object} Alerta
 * @property {number} id
 * @property {string} titulo
 * @property {TipoAlerta} tipo
 * @property {NivelGravedad} nivel_gravedad
 * @property {string|null} descripcion
 * @property {number} latitud
 * @property {number} longitud
 * @property {string} fecha_creacion
 * @property {string|null} fecha_actualizacion
 * @property {EstadoAlerta} estado
 * @property {number} id_origen
 * @property {string} [origen_nombre]
 * @property {TipoFuente} [tipo_fuente]
 *
 * @typedef {Object} UsuarioSesion  Datos del usuario autenticado (sin contraseña).
 * @property {number} id
 * @property {string} username
 * @property {Rol} rol
 * @property {number|null} id_origen  Organismo al que pertenece (null = SUPERADMIN).
 * @property {string|null} [origen_nombre]
 *
 * @typedef {Object} DatosAlerta  Cuerpo recibido para dar de alta una alerta.
 * @property {unknown} [titulo]
 * @property {unknown} [tipo]
 * @property {unknown} [nivel_gravedad]
 * @property {unknown} [descripcion]
 * @property {unknown} [latitud]
 * @property {unknown} [longitud]
 * @property {unknown} [id_origen]
 */

/**
 * Indica si `valor` pertenece a la lista cerrada `lista`.
 * @param {readonly string[]} lista
 * @param {unknown} valor
 * @returns {boolean}
 */
export function esValorDe(lista, valor) {
  return typeof valor === 'string' && lista.includes(valor);
}

/**
 * Convierte a número finito; devuelve NaN si el valor está vacío o no es numérico.
 * @param {unknown} valor
 */
export function aNumero(valor) {
  if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean') return NaN;
  const n = Number(valor);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * ¿El punto cae dentro de la región de cobertura? (límites inclusive)
 * @param {number} lat
 * @param {number} lng
 */
export function dentroDeRegion(lat, lng) {
  return lat >= REGION.latMin && lat <= REGION.latMax && lng >= REGION.lngMin && lng <= REGION.lngMax;
}

/**
 * Valida los datos de una alerta. Devuelve la lista de errores (vacía = válida).
 * @param {DatosAlerta} datos
 * @returns {string[]}
 */
export function validarAlerta(datos) {
  const errores = [];
  const titulo = typeof datos.titulo === 'string' ? datos.titulo.trim() : '';
  if (!titulo) errores.push('El título es obligatorio');
  else if (titulo.length > TITULO_MAX) errores.push(`El título admite hasta ${TITULO_MAX} caracteres`);

  if (!esValorDe(TIPOS_ALERTA, datos.tipo)) errores.push(`Tipo inválido (${TIPOS_ALERTA.join(', ')})`);
  if (!esValorDe(NIVELES_GRAVEDAD, datos.nivel_gravedad)) errores.push(`Gravedad inválida (${NIVELES_GRAVEDAD.join(', ')})`);

  if (datos.descripcion !== undefined && datos.descripcion !== null) {
    if (typeof datos.descripcion !== 'string') errores.push('La descripción debe ser texto');
    else if (datos.descripcion.length > DESCRIPCION_MAX) errores.push(`La descripción admite hasta ${DESCRIPCION_MAX} caracteres`);
  }

  const lat = aNumero(datos.latitud);
  const lng = aNumero(datos.longitud);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    errores.push('Latitud y longitud son obligatorias y numéricas');
  } else if (!dentroDeRegion(lat, lng)) {
    errores.push(`La ubicación está fuera de la región de cobertura (${REGION.nombre})`);
  }
  return errores;
}

/**
 * Regla de aislamiento por organismo (multiempresa): un ADMINISTRADOR solo gestiona
 * las alertas de su propio organismo; el SUPERADMIN gestiona todas.
 * @param {Pick<UsuarioSesion, 'rol' | 'id_origen'> | null | undefined} usuario
 * @param {Pick<Alerta, 'id_origen'>} alerta
 */
export function puedeGestionar(usuario, alerta) {
  if (!usuario) return false;
  if (usuario.rol === 'SUPERADMIN') return true;
  return usuario.id_origen !== null && usuario.id_origen === alerta.id_origen;
}
