// @ts-check
/**
 * PRUEBAS DE CAJA NEGRA
 * Se prueba la API por sus entradas y salidas, sin mirar el código interno.
 * Técnicas: partición de clases de equivalencia (PE) y análisis de valores límite (VL).
 * Los identificadores CN-xx se referencian en la Matriz de Trazabilidad (docs/02).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarServidor, pedir, login, ALERTA_VALIDA } from './ayudas.js';

/** @type {import('./ayudas.js').Servidor} */
let srv;
/** @type {string} */
let tokenAdmin;

before(async () => {
  srv = await iniciarServidor();
  tokenAdmin = await login(srv.base, 'admin', 'admin123');
});
after(() => srv.cerrar());

/** @param {Record<string, unknown>} cambios */
const crear = (cambios) =>
  pedir(`${srv.base}/alertas`, { method: 'POST', token: tokenAdmin, body: { ...ALERTA_VALIDA, ...cambios } });

describe('CN-01 Latitud — valores límite de la región (-41.2 a -33.0)', () => {
  const casos = [
    { lat: -41.2001, esperado: 400, clase: 'inválida: justo bajo el mínimo' },
    { lat: -41.2, esperado: 201, clase: 'válida: mínimo exacto' },
    { lat: -41.1999, esperado: 201, clase: 'válida: justo sobre el mínimo' },
    { lat: -37.1, esperado: 201, clase: 'válida: valor nominal' },
    { lat: -33.0001, esperado: 201, clase: 'válida: justo bajo el máximo' },
    { lat: -33.0, esperado: 201, clase: 'válida: máximo exacto' },
    { lat: -32.9999, esperado: 400, clase: 'inválida: justo sobre el máximo' },
  ];
  for (const c of casos) {
    test(`latitud ${c.lat} → ${c.esperado} (${c.clase})`, async () => {
      assert.equal((await crear({ latitud: c.lat })).estado, c.esperado);
    });
  }
});

describe('CN-02 Longitud — valores límite de la región (-63.5 a -56.5)', () => {
  const casos = [
    { lng: -63.5001, esperado: 400 },
    { lng: -63.5, esperado: 201 },
    { lng: -60.0, esperado: 201 },
    { lng: -56.5, esperado: 201 },
    { lng: -56.4999, esperado: 400 },
  ];
  for (const c of casos) {
    test(`longitud ${c.lng} → ${c.esperado}`, async () => {
      assert.equal((await crear({ longitud: c.lng })).estado, c.esperado);
    });
  }
});

describe('CN-03 Coordenadas — clases inválidas', () => {
  test('ciudad fuera de la región (Posadas, Misiones) → 400', async () => {
    const r = await crear({ latitud: -27.3671, longitud: -55.8961 });
    assert.equal(r.estado, 400);
    assert.match(r.datos.detalles.join(' '), /fuera de la región/);
  });
  test('latitud no numérica → 400', async () => assert.equal((await crear({ latitud: 'abc' })).estado, 400));
  test('latitud ausente → 400', async () => assert.equal((await crear({ latitud: undefined })).estado, 400));
  test('latitud vacía → 400', async () => assert.equal((await crear({ latitud: '' })).estado, 400));
  test('latitud como texto numérico "-34.6" → 201 (se normaliza)', async () =>
    assert.equal((await crear({ latitud: '-34.6' })).estado, 201));
});

describe('CN-04 Título — longitud 1 a 120', () => {
  test('vacío → 400', async () => assert.equal((await crear({ titulo: '' })).estado, 400));
  test('solo espacios → 400', async () => assert.equal((await crear({ titulo: '   ' })).estado, 400));
  test('1 carácter → 201', async () => assert.equal((await crear({ titulo: 'A' })).estado, 201));
  test('120 caracteres → 201', async () => assert.equal((await crear({ titulo: 'x'.repeat(120) })).estado, 201));
  test('121 caracteres → 400', async () => assert.equal((await crear({ titulo: 'x'.repeat(121) })).estado, 400));
  test('tipo de dato incorrecto (número) → 400', async () => assert.equal((await crear({ titulo: 123 })).estado, 400));
});

describe('CN-05 Tipo y gravedad — dominios cerrados', () => {
  for (const tipo of ['VIENTO', 'TORMENTA', 'SUDESTADA', 'OLEAJE']) {
    test(`tipo ${tipo} → 201`, async () => assert.equal((await crear({ tipo })).estado, 201));
  }
  test('tipo NIEVE → 400', async () => assert.equal((await crear({ tipo: 'NIEVE' })).estado, 400));
  test('tipo en minúsculas "viento" → 400', async () => assert.equal((await crear({ tipo: 'viento' })).estado, 400));
  for (const nivel_gravedad of ['AMARILLO', 'NARANJA', 'ROJO']) {
    test(`gravedad ${nivel_gravedad} → 201`, async () => assert.equal((await crear({ nivel_gravedad })).estado, 201));
  }
  test('gravedad VERDE → 400', async () => assert.equal((await crear({ nivel_gravedad: 'VERDE' })).estado, 400));
});

describe('CN-06 Descripción — 0 a 1000 caracteres', () => {
  test('1000 caracteres → 201', async () => assert.equal((await crear({ descripcion: 'd'.repeat(1000) })).estado, 201));
  test('1001 caracteres → 400', async () => assert.equal((await crear({ descripcion: 'd'.repeat(1001) })).estado, 400));
});

describe('CN-07 Login', () => {
  test('credenciales correctas → 200 con token', async () => {
    const r = await pedir(`${srv.base}/login`, { method: 'POST', body: { username: 'admin', password: 'admin123' } });
    assert.equal(r.estado, 200);
    assert.ok(r.datos.token);
    assert.equal(r.datos.usuario.password_hash, undefined, 'nunca debe devolver el hash');
  });
  test('contraseña incorrecta → 401', async () => {
    const r = await pedir(`${srv.base}/login`, { method: 'POST', body: { username: 'admin', password: 'x' } });
    assert.equal(r.estado, 401);
  });
  test('usuario inexistente → 401 con el mismo mensaje', async () => {
    const r = await pedir(`${srv.base}/login`, { method: 'POST', body: { username: 'nadie', password: 'x' } });
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error, 'Credenciales incorrectas');
  });
  test('campos vacíos → 400', async () => {
    const r = await pedir(`${srv.base}/login`, { method: 'POST', body: { username: '', password: '' } });
    assert.equal(r.estado, 400);
  });
  test('JSON malformado → 400', async () => {
    const r = await pedir(`${srv.base}/login`, { method: 'POST', crudo: '{"username": ' });
    assert.equal(r.estado, 400);
  });
});

describe('CN-08 Consulta pública de alertas', () => {
  test('listado sin filtros → 200 con las 9 alertas iniciales o más', async () => {
    const r = await pedir(`${srv.base}/alertas`);
    assert.equal(r.estado, 200);
    assert.ok(r.datos.length >= 9);
  });
  test('filtro válido gravedad=ROJO → 200 y todas rojas', async () => {
    const r = await pedir(`${srv.base}/alertas?gravedad=ROJO`);
    assert.equal(r.estado, 200);
    assert.ok(r.datos.every((/** @type {{nivel_gravedad:string}} */ a) => a.nivel_gravedad === 'ROJO'));
  });
  test('filtro estado=FINALIZADA (historial) → 200 y solo finalizadas', async () => {
    const r = await pedir(`${srv.base}/alertas?estado=FINALIZADA`);
    assert.equal(r.estado, 200);
    assert.ok(r.datos.length >= 1);
    assert.ok(r.datos.every((/** @type {{estado:string}} */ a) => a.estado === 'FINALIZADA'));
  });
  test('filtros combinados tipo=OLEAJE&gravedad=NARANJA → 200 y cumplen ambos', async () => {
    const r = await pedir(`${srv.base}/alertas?tipo=OLEAJE&gravedad=NARANJA`);
    assert.equal(r.estado, 200);
    assert.ok(r.datos.every((/** @type {{tipo:string,nivel_gravedad:string}} */ a) =>
      a.tipo === 'OLEAJE' && a.nivel_gravedad === 'NARANJA'));
  });
  test('filtro inválido tipo=NIEVE → 400', async () =>
    assert.equal((await pedir(`${srv.base}/alertas?tipo=NIEVE`)).estado, 400));
  test('detalle de alerta existente → 200', async () =>
    assert.equal((await pedir(`${srv.base}/alertas/1`)).estado, 200));
  test('detalle de alerta inexistente → 404', async () =>
    assert.equal((await pedir(`${srv.base}/alertas/99999`)).estado, 404));
  test('id no numérico → 400', async () =>
    assert.equal((await pedir(`${srv.base}/alertas/abc`)).estado, 400));
  test('id cero (límite inferior inválido) → 400', async () =>
    assert.equal((await pedir(`${srv.base}/alertas/0`)).estado, 400));
  test('ruta inexistente → 404', async () =>
    assert.equal((await pedir(`${srv.base}/no-existe`)).estado, 404));
});

describe('CN-09 Cambio de estado', () => {
  test('estado válido FINALIZADA → 200', async () => {
    const r = await pedir(`${srv.base}/alertas/2/estado`, { method: 'PATCH', token: tokenAdmin, body: { estado: 'FINALIZADA' } });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.estado, 'FINALIZADA');
    assert.ok(r.datos.fecha_actualizacion);
  });
  test('estado fuera de dominio → 400', async () => {
    const r = await pedir(`${srv.base}/alertas/2/estado`, { method: 'PATCH', token: tokenAdmin, body: { estado: 'BORRADA' } });
    assert.equal(r.estado, 400);
  });
  test('alerta inexistente → 404', async () => {
    const r = await pedir(`${srv.base}/alertas/99999/estado`, { method: 'PATCH', token: tokenAdmin, body: { estado: 'ACTIVA' } });
    assert.equal(r.estado, 404);
  });
});
