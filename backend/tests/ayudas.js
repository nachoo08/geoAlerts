// @ts-check
/**
 * Utilidades de prueba: levanta la API sobre una base SQLite EN MEMORIA
 * (cada archivo de prueba corre en su propio proceso → base aislada y limpia).
 */
import { once } from 'node:events';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'secreto-de-prueba';
process.env.NODE_ENV = 'test';

const { crearApp } = await import('../server.js');

/** @typedef {{ base: string, cerrar: () => Promise<void> }} Servidor */

/** @returns {Promise<Servidor>} */
export async function iniciarServidor() {
  const servidor = crearApp().listen(0);
  await once(servidor, 'listening');
  const direccion = /** @type {import('node:net').AddressInfo} */ (servidor.address());
  return {
    base: `http://127.0.0.1:${direccion.port}/api`,
    cerrar: async () => {
      servidor.closeAllConnections();
      servidor.close();
      await once(servidor, 'close');
    },
  };
}

/**
 * @param {string} url
 * @param {{ method?: string, body?: unknown, token?: string, crudo?: string }} [opciones]
 */
export async function pedir(url, { method = 'GET', body, token, crudo } = {}) {
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method, headers, body: crudo ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const datos = await res.json().catch(() => null);
  return { estado: res.status, datos };
}

/** @param {string} base @param {string} username @param {string} password */
export async function login(base, username, password) {
  const { datos } = await pedir(`${base}/login`, { method: 'POST', body: { username, password } });
  return /** @type {string} */ (datos.token);
}

/** Alerta válida de referencia (centro de CABA). */
export const ALERTA_VALIDA = Object.freeze({
  titulo: 'Prueba',
  tipo: 'VIENTO',
  nivel_gravedad: 'AMARILLO',
  latitud: -34.6,
  longitud: -58.4,
});
