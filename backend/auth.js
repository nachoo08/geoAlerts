// @ts-check
/**
 * geoAlerts — Autenticación y autorización
 * ----------------------------------------
 * - Contraseñas: hash bcrypt (10 rondas), nunca en texto plano.
 * - Sesión: JSON Web Token firmado con HS256, vigencia de 8 h.
 * - Autorización por organismo: ver puedeGestionar() en compartido/dominio.js.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { buscarUsuario } from './db.js';

/** @typedef {import('@geoalerts/compartido').UsuarioSesion} UsuarioSesion */

const PRODUCCION = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (PRODUCCION ? '' : 'secreto-solo-para-desarrollo');
if (!JWT_SECRET) throw new Error('En producción la variable JWT_SECRET es obligatoria');
export const JWT_EXPIRA = '8h';

// Hash ficticio: si el usuario no existe igual se ejecuta bcrypt, para que el tiempo
// de respuesta no revele qué nombres de usuario son válidos (ataque de temporización).
const HASH_FICTICIO = bcrypt.hashSync('usuario-inexistente', 10);

/**
 * Verifica usuario y contraseña. Devuelve los datos de sesión o null.
 * @param {string} username
 * @param {string} password
 * @returns {UsuarioSesion|null}
 */
export function verificarCredenciales(username, password) {
  const usuario = buscarUsuario(username);
  const ok = bcrypt.compareSync(password, usuario ? usuario.password_hash : HASH_FICTICIO);
  if (!usuario || !ok) return null;
  const { password_hash: _omitido, ...sesion } = usuario;
  return sesion;
}

/** @param {UsuarioSesion} usuario */
export function firmarToken(usuario) {
  const { id, username, rol, id_origen } = usuario;
  return jwt.sign({ id, username, rol, id_origen }, JWT_SECRET, { expiresIn: JWT_EXPIRA });
}

/**
 * Middleware: exige "Authorization: Bearer <token>". Si es válido deja el usuario
 * en res.locals.usuario y continúa; si no, corta la cadena con 401 Unauthorized.
 * @type {import('express').RequestHandler}
 */
export function requiereAuth(req, res, next) {
  const [esquema, token] = (req.headers.authorization || '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Token de acceso requerido' });
    return;
  }
  try {
    const datos = /** @type {jwt.JwtPayload & UsuarioSesion} */ (jwt.verify(token, JWT_SECRET));
    /** @type {UsuarioSesion} */
    const usuario = { id: datos.id, username: datos.username, rol: datos.rol, id_origen: datos.id_origen ?? null };
    res.locals.usuario = usuario;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o vencido' });
  }
}
