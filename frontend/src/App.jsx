/**
 * App.jsx — Componente raíz de geoAlerts (Capa de Presentación).
 *
 * Programación orientada a eventos en el cliente:
 *  - Eventos de interfaz (change, submit, click) disparan los casos de uso.
 *  - Eventos del servidor (SSE "alerta:creada" / "alerta:actualizada") refrescan
 *    el mapa en tiempo real, sin que el Usuario recargue la página.
 *
 * Actores:
 *  - Usuario (público): ver mapa, filtrar, ver detalle, recibir actualizaciones.
 *  - Administrador: iniciar/cerrar sesión, cargar alertas y gestionar su estado
 *    (solo las de su organismo; el SUPERADMIN gestiona todas).
 */
import { useCallback, useEffect, useState } from 'react';
import Mapa, { COLOR_GRAVEDAD } from './Mapa.jsx';
import { api } from './api.js';
import {
  EVENTOS, REGION, TIPOS_ALERTA, NIVELES_GRAVEDAD, ETIQUETA_TIPO, TITULO_MAX,
  dentroDeRegion, validarAlerta,
} from '@geoalerts/compartido';

const REFRESCO_RESPALDO_MS = 60_000; // por si el canal SSE se corta
const ALERTA_VACIA = { titulo: '', tipo: 'VIENTO', nivel_gravedad: 'AMARILLO', descripcion: '', id_origen: '' };
const CLAVE_SESION = 'geoalerts_sesion';

function leerSesion() {
  try {
    const guardada = sessionStorage.getItem(CLAVE_SESION);
    return guardada ? JSON.parse(guardada) : null;
  } catch {
    return null;
  }
}

function capitalizar(texto) {
  return texto.charAt(0) + texto.slice(1).toLowerCase();
}

export default function App() {
  const [alertas, setAlertas] = useState([]);
  const [filtros, setFiltros] = useState({ tipo: '', gravedad: '', estado: 'ACTIVA' });
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enVivo, setEnVivo] = useState(false);
  const [sesion, setSesion] = useState(leerSesion);
  const [credenciales, setCredenciales] = useState({ username: '', password: '' });
  const [nueva, setNueva] = useState(ALERTA_VACIA);
  const [punto, setPunto] = useState(null);
  const [origenesManuales, setOrigenesManuales] = useState([]);

  const usuario = sesion?.usuario ?? null;

  // ----- CU-01 / CU-02: consultar alertas con filtros -----
  const cargarAlertas = useCallback(async () => {
    try {
      setAlertas(await api.listarAlertas(filtros));
      setError('');
    } catch (e) {
      setError(`No se pudieron cargar las alertas: ${e.message}`);
    }
  }, [filtros]);

  useEffect(() => {
    cargarAlertas();
    const id = setInterval(cargarAlertas, REFRESCO_RESPALDO_MS);
    return () => clearInterval(id);
  }, [cargarAlertas]);

  // ----- CU-04: suscripción a eventos en tiempo real (SSE) -----
  useEffect(() => {
    const fuente = api.suscribirEventos();
    fuente.onopen = () => setEnVivo(true);
    fuente.onerror = () => setEnVivo(false); // EventSource reintenta solo
    const alEvento = () => cargarAlertas();
    fuente.addEventListener(EVENTOS.ALERTA_CREADA, alEvento);
    fuente.addEventListener(EVENTOS.ALERTA_ACTUALIZADA, alEvento);
    return () => fuente.close(); // cancelar suscripción al desmontar
  }, [cargarAlertas]);

  // El SUPERADMIN elige a nombre de qué organismo publica
  useEffect(() => {
    if (usuario?.rol !== 'SUPERADMIN') return;
    api.listarOrigenes()
      .then((lista) => setOrigenesManuales(lista.filter((o) => o.tipo_fuente === 'CARGA_MANUAL')))
      .catch(() => setOrigenesManuales([]));
  }, [usuario?.rol]);

  function mostrarMensaje(texto) {
    setMensaje(texto);
    setTimeout(() => setMensaje(''), 4000);
  }

  // ----- CU-05: iniciar sesión -----
  async function iniciarSesion(e) {
    e.preventDefault();
    try {
      const datos = await api.login(credenciales.username, credenciales.password);
      setSesion(datos);
      try { sessionStorage.setItem(CLAVE_SESION, JSON.stringify(datos)); } catch { /* modo privado */ }
      setCredenciales({ username: '', password: '' });
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  // ----- CU-06: cerrar sesión -----
  function cerrarSesion() {
    setSesion(null);
    setPunto(null);
    setNueva(ALERTA_VACIA);
    try { sessionStorage.removeItem(CLAVE_SESION); } catch { /* sin almacenamiento */ }
  }

  /** Errores 401 (sesión vencida) cierran la sesión automáticamente. */
  function manejarErrorEscritura(err) {
    if (err.estado === 401) {
      cerrarSesion();
      setError('La sesión venció. Volvé a iniciar sesión.');
    } else {
      setError(err.message);
    }
  }

  function seleccionarPunto(p) {
    if (!dentroDeRegion(p.lat, p.lng)) {
      setError(`La ubicación debe estar dentro de la región de cobertura (${REGION.nombre}).`);
      return;
    }
    setError('');
    setPunto(p);
  }

  // ----- CU-07: cargar alerta manual -----
  async function guardarAlerta(e) {
    e.preventDefault();
    if (!punto) {
      setError('Hacé clic en el mapa para indicar la ubicación de la alerta.');
      return;
    }
    const datos = { ...nueva, latitud: punto.lat, longitud: punto.lng };
    if (!datos.id_origen) delete datos.id_origen;
    const errores = validarAlerta(datos); // misma regla que el servidor
    if (errores.length) {
      setError(errores.join('; '));
      return;
    }
    try {
      await api.crearAlerta(datos, sesion.token);
      setNueva(ALERTA_VACIA);
      setPunto(null);
      mostrarMensaje('Alerta publicada correctamente.');
      // El mapa se actualiza al recibir el evento SSE "alerta:creada"
    } catch (err) {
      manejarErrorEscritura(err);
    }
  }

  // ----- CU-08: gestionar estado -----
  async function cambiarEstado(id, estado) {
    try {
      await api.cambiarEstado(id, estado, sesion.token);
      mostrarMensaje(estado === 'FINALIZADA' ? 'Alerta finalizada.' : 'Alerta reactivada.');
    } catch (err) {
      manejarErrorEscritura(err);
    }
  }

  return (
    <div className="layout">
      <aside className="panel">
        <header>
          <h1>geo<span>Alerts</span></h1>
          <p className="subtitulo">Alertas meteorológicas y marítimas · {REGION.nombre}</p>
          <p className={`estado-vivo ${enVivo ? 'on' : ''}`}>
            <span className="punto" /> {enVivo ? 'Actualización en vivo' : 'Reconectando…'}
          </p>
        </header>

        {/* CU-02: Filtrar alertas */}
        <section>
          <h2>Filtros</h2>
          <label>Tipo
            <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
              <option value="">Todos</option>
              {TIPOS_ALERTA.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
            </select>
          </label>
          <label>Gravedad
            <select value={filtros.gravedad} onChange={(e) => setFiltros({ ...filtros, gravedad: e.target.value })}>
              <option value="">Todas</option>
              {NIVELES_GRAVEDAD.map((g) => <option key={g} value={g}>{capitalizar(g)}</option>)}
            </select>
          </label>
          <label>Estado
            <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
              <option value="ACTIVA">Activas</option>
              <option value="FINALIZADA">Finalizadas (historial)</option>
              <option value="">Todas</option>
            </select>
          </label>
          <p className="contador">{alertas.length} alerta(s) en el mapa</p>
          <ul className="leyenda">
            {Object.entries(COLOR_GRAVEDAD).map(([nivel, color]) => (
              <li key={nivel}><span style={{ background: color }} />{capitalizar(nivel)}</li>
            ))}
          </ul>
        </section>

        {error && <div className="aviso aviso-error" role="alert" onClick={() => setError('')}>{error}</div>}
        {mensaje && <div className="aviso aviso-ok" role="status">{mensaje}</div>}

        {!usuario ? (
          <section>
            <h2>Acceso administradores</h2>
            <form onSubmit={iniciarSesion}>
              <input aria-label="Usuario" placeholder="Usuario" autoComplete="username" value={credenciales.username}
                onChange={(e) => setCredenciales({ ...credenciales, username: e.target.value })} required />
              <input aria-label="Contraseña" type="password" placeholder="Contraseña" autoComplete="current-password"
                value={credenciales.password}
                onChange={(e) => setCredenciales({ ...credenciales, password: e.target.value })} required />
              <button className="btn">Ingresar</button>
            </form>
          </section>
        ) : (
          <section>
            <h2>Nueva alerta</h2>
            <p className="sesion">
              <b>{usuario.username}</b> · {usuario.rol === 'SUPERADMIN' ? 'Superadministrador' : usuario.origen_nombre}
              <button className="link" onClick={cerrarSesion}>Salir</button>
            </p>
            <form onSubmit={guardarAlerta}>
              <input aria-label="Título" placeholder="Título" value={nueva.titulo} maxLength={TITULO_MAX}
                onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })} required />
              <select aria-label="Tipo" value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })}>
                {TIPOS_ALERTA.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
              </select>
              <select aria-label="Gravedad" value={nueva.nivel_gravedad}
                onChange={(e) => setNueva({ ...nueva, nivel_gravedad: e.target.value })}>
                {NIVELES_GRAVEDAD.map((g) => <option key={g} value={g}>{capitalizar(g)}</option>)}
              </select>
              {usuario.rol === 'SUPERADMIN' && (
                <select aria-label="Organismo" value={nueva.id_origen}
                  onChange={(e) => setNueva({ ...nueva, id_origen: e.target.value })}>
                  <option value="">Organismo por defecto</option>
                  {origenesManuales.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              )}
              <textarea aria-label="Descripción" placeholder="Descripción" rows={3} value={nueva.descripcion}
                onChange={(e) => setNueva({ ...nueva, descripcion: e.target.value })} />
              <p className="coords">
                {punto ? `Ubicación: ${punto.lat.toFixed(4)}, ${punto.lng.toFixed(4)}` : 'Hacé clic en el mapa para ubicar la alerta'}
              </p>
              <button className="btn">Publicar alerta</button>
            </form>
          </section>
        )}

        <p className="descargo">
          geoAlerts complementa y no reemplaza a los canales oficiales de alerta.
        </p>
      </aside>

      <main className="contenedor-mapa">
        <Mapa
          alertas={alertas}
          usuario={usuario}
          onCambiarEstado={cambiarEstado}
          puntoSeleccionado={punto}
          onSeleccionPunto={seleccionarPunto}
        />
      </main>
    </div>
  );
}
