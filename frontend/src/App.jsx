/**
 * App.jsx — Componente raíz de geoAlerts (Capa de Presentación).
 *
 * Programación orientada a eventos en el cliente:
 *  - Eventos de interfaz (change, submit, click) disparan los casos de uso.
 *  - Eventos del servidor (SSE) refrescan alertas y condiciones actuales sin
 *    que el usuario recargue la página.
 *
 * Actores:
 *  - Usuario (público): ver mapa, filtrar, ver detalle, recibir actualizaciones.
 *  - Administrador: iniciar/cerrar sesión, cargar alertas y gestionar su estado
 *    (solo las de su organismo; el SUPERADMIN gestiona todas).
 */
import { useCallback, useEffect, useState } from 'react';
import Mapa, { COLOR_GRAVEDAD } from './Mapa.jsx';
import PanelAlerta from './PanelAlerta.jsx';
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

function describirClima(codigo) {
  if (codigo === 0) return 'Despejado';
  if ([1, 2].includes(codigo)) return 'Parcialmente nublado';
  if (codigo === 3) return 'Nublado';
  if ([45, 48].includes(codigo)) return 'Niebla';
  if ([51, 53, 55, 56, 57].includes(codigo)) return 'Llovizna';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(codigo)) return 'Lluvia';
  if ([71, 73, 75, 77, 85, 86].includes(codigo)) return 'Nieve';
  if ([95, 96, 99].includes(codigo)) return 'Tormenta';
  return 'Condiciones actuales';
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
  const [condiciones, setCondiciones] = useState(null);
  const [controlesAbiertos, setControlesAbiertos] = useState(false);
  
  // Estados para manejar el zoom automático en el mapa
  const [alertaSeleccionada, setAlertaSeleccionada] = useState(null);

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

  // Cada vez que cambian los filtros, limpiamos la selección individual para que el mapa ajuste los límites (fitBounds) de los resultados filtrados
  useEffect(() => {
    setAlertaSeleccionada(null);
  }, [filtros]);

  // ----- CU-04: suscripción a eventos en tiempo real (SSE) -----
  useEffect(() => {
    const fuente = api.suscribirEventos();
    fuente.onopen = () => setEnVivo(true);
    fuente.onerror = () => setEnVivo(false); // EventSource reintenta solo
    const alEvento = () => cargarAlertas();
    const alActualizarCondiciones = (evento) => {
      try {
        setCondiciones(JSON.parse(evento.data));
      } catch {
        setError('No se pudieron interpretar las condiciones meteorológicas recibidas.');
      }
    };
    fuente.addEventListener(EVENTOS.ALERTA_CREADA, alEvento);
    fuente.addEventListener(EVENTOS.ALERTA_ACTUALIZADA, alEvento);
    fuente.addEventListener(EVENTOS.CONDICIONES_ACTUALIZADAS, alActualizarCondiciones);
    return () => fuente.close(); // cancelar suscripción al desmontar
  }, [cargarAlertas]);

  useEffect(() => {
    api.obtenerCondiciones()
      .then(({ condiciones: actuales }) => setCondiciones(actuales))
      .catch((e) => setError(`No se pudieron cargar las condiciones actuales: ${e.message}`));
  }, []);

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
      setControlesAbiertos(true);
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

  function seleccionarAlerta(alerta) {
    setAlertaSeleccionada(alerta);
    setControlesAbiertos(false);
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

  const alertaDetalle = alertas.find((a) => a.id === alertaSeleccionada?.id) ?? alertaSeleccionada;

  return (
    <div className="app-shell">
      <header className="barra-superior">
        <div className="marca">
          <span className="marca-simbolo" aria-hidden="true">g</span>
          <div>
            <h1>geo<span>Alerts</span></h1>
            <p>{REGION.nombre}</p>
          </div>
        </div>
        <p className={`estado-vivo ${enVivo ? 'on' : ''}`}>
          <span className="punto" /> {enVivo ? 'En vivo' : 'Reconectando'}
        </p>
      </header>

      <section className="ticker" aria-live="polite" aria-label="Condiciones meteorológicas actuales">
        <span className="ticker-punto" />
        {condiciones ? (
          <>
            <span className="ticker-etiqueta">Ahora · {condiciones.ubicacion}</span>
            <span className="ticker-condicion">{describirClima(condiciones.weather_code)}</span>
            <strong>{condiciones.temperature_2m}°C</strong>
            <span className="ticker-viento">Viento {condiciones.wind_speed_10m} km/h</span>
            <time dateTime={condiciones.consultado_en}>
              Actualizado {new Date(condiciones.consultado_en).toLocaleTimeString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit',
              })}
            </time>
          </>
        ) : (
          <span className="ticker-espera">Consultando condiciones actuales…</span>
        )}
        <span className="ticker-fuente">Open‑Meteo</span>
      </section>

      <div className={`layout ${alertaDetalle ? 'con-detalle' : ''}`}>
        <aside className={`control-dock ${controlesAbiertos ? 'abierto' : ''}`} aria-label="Controles del mapa">
          <button
            className="control-dock-toggle"
            type="button"
            aria-expanded={controlesAbiertos}
            onClick={() => setControlesAbiertos((abierto) => !abierto)}
          >
            <span className="dock-toggle-icono" aria-hidden="true">⌁</span>
            <span className="dock-toggle-titulo">Explorar el mapa</span>
            <span className="dock-toggle-resumen">{alertas.length} alertas · filtros y herramientas</span>
            <span className={`dock-chevron ${controlesAbiertos ? 'abierto' : ''}`} aria-hidden="true">⌃</span>
          </button>

          <div className="control-dock-contenido" hidden={!controlesAbiertos}>
            <div className="control-dock-grid">
              <section className="dock-filtros">
                <h2>Filtrar alertas</h2>
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

              <section className="dock-cuenta">
                {error && <div className="aviso aviso-error" role="alert" onClick={() => setError('')}>{error}</div>}
                {mensaje && <div className="aviso aviso-ok" role="status">{mensaje}</div>}
                {!usuario ? (
                  <>
                    <h2>Acceso administradores</h2>
                    <form onSubmit={iniciarSesion}>
                      <input aria-label="Usuario" placeholder="Usuario" autoComplete="username" value={credenciales.username}
                        onChange={(e) => setCredenciales({ ...credenciales, username: e.target.value })} required />
                      <input aria-label="Contraseña" type="password" placeholder="Contraseña" autoComplete="current-password"
                        value={credenciales.password}
                        onChange={(e) => setCredenciales({ ...credenciales, password: e.target.value })} required />
                      <button className="btn">Ingresar</button>
                    </form>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </section>

              {alertas.length > 0 && (
                <section className="lista-alertas-panel">
                  <h2>Alertas en vista</h2>
                  <ul className="lista-alertas">
                    {alertas.map((a) => (
                      <li key={a.id}>
                        <button
                          className={`item-alerta ${alertaDetalle?.id === a.id ? 'seleccionada' : ''}`}
                          onClick={() => seleccionarAlerta(a)}
                        >
                          <span className="item-alerta-punto" style={{ background: COLOR_GRAVEDAD[a.nivel_gravedad] }} />
                          <span className="item-alerta-titulo">{a.titulo}</span>
                          <span className={`chip chip-${a.nivel_gravedad.toLowerCase()}`}>{a.nivel_gravedad}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <p className="descargo">geoAlerts complementa y no reemplaza a los canales oficiales de alerta.</p>
          </div>
        </aside>

      <main className="contenedor-mapa">
        <Mapa
          alertas={alertas}
          usuario={usuario}
          puntoSeleccionado={punto}
          onSeleccionPunto={seleccionarPunto}
          alertaSeleccionada={alertaDetalle}
          onSeleccionAlerta={seleccionarAlerta}
        />
      </main>
      <PanelAlerta
        alerta={alertaDetalle}
        usuario={usuario}
        onCerrar={() => setAlertaSeleccionada(null)}
        onCambiarEstado={cambiarEstado}
      />
      </div>
    </div>
  );
}