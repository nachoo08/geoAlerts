/**
 * Mapa.jsx — Motor cartográfico de geoAlerts.
 *
 * Leaflet (librería JavaScript) dibuja el mapa y gestiona zoom, arrastre y capas;
 * OpenStreetMap provee las teselas (imágenes de 256×256 px) de la capa base.
 * Juntos forman el motor cartográfico: Leaflet es el "visor" y OSM el "papel".
 *
 * - Encuadre fijo en la región de cobertura (Buenos Aires y franja costera).
 * - Cada alerta = círculo coloreado por gravedad; las finalizadas, punteadas.
 * - Con sesión de Administrador, un clic captura las coordenadas para el alta
 *   y el popup ofrece cambiar el estado solo si la alerta es de su organismo.
 */
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, Rectangle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { REGION, ETIQUETA_TIPO, puedeGestionar } from '@geoalerts/compartido';

// Corrige las rutas de los íconos por defecto de Leaflet al empaquetar con Vite
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

export const COLOR_GRAVEDAD = { AMARILLO: '#e6b800', NARANJA: '#f07800', ROJO: '#d62828' };
const RADIO_GRAVEDAD = { AMARILLO: 9, NARANJA: 12, ROJO: 15 };

const LIMITES_REGION = [[REGION.latMin, REGION.lngMin], [REGION.latMax, REGION.lngMax]];
// Margen para poder arrastrar un poco fuera de la región sin perderla de vista
const LIMITES_NAVEGACION = [[REGION.latMin - 3, REGION.lngMin - 4], [REGION.latMax + 3, REGION.lngMax + 4]];

/** Escucha el evento "click" del mapa y devuelve las coordenadas al padre. */
function SelectorCoordenadas({ onSeleccion }) {
  useMapEvents({ click: (e) => onSeleccion({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Fecha SQLite UTC ("AAAA-MM-DD HH:MM:SS") → hora local de Buenos Aires. */
function formatearFecha(fechaSqlite) {
  return new Date(fechaSqlite.replace(' ', 'T') + 'Z').toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short',
  });
}

export default function Mapa({ alertas, usuario, onCambiarEstado, puntoSeleccionado, onSeleccionPunto }) {
  return (
    <MapContainer
      bounds={LIMITES_REGION}
      maxBounds={LIMITES_NAVEGACION}
      minZoom={5}
      zoomSnap={0.25}
      className="mapa"
      scrollWheelZoom
    >
      {/* Capa base: teselas de OpenStreetMap (atribución obligatoria por licencia ODbL) */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={18}
      />

      {/* Contorno de la región de cobertura */}
      <Rectangle
        bounds={LIMITES_REGION}
        pathOptions={{ color: '#3fa7d6', weight: 1.5, dashArray: '6 6', fill: false, interactive: false }}
      />

      {alertas.map((a) => (
        <CircleMarker
          key={a.id}
          center={[a.latitud, a.longitud]}
          radius={RADIO_GRAVEDAD[a.nivel_gravedad]}
          pathOptions={{
            color: COLOR_GRAVEDAD[a.nivel_gravedad],
            fillColor: COLOR_GRAVEDAD[a.nivel_gravedad],
            fillOpacity: a.estado === 'ACTIVA' ? 0.55 : 0.15,
            dashArray: a.estado === 'ACTIVA' ? null : '4 4',
          }}
        >
          <Popup>
            <div className="popup">
              <strong>{a.titulo}</strong>
              <div className="popup-meta">
                <span className={`chip chip-${a.nivel_gravedad.toLowerCase()}`}>{a.nivel_gravedad}</span>
                <span>{ETIQUETA_TIPO[a.tipo]}</span>
                <span>· {a.estado === 'ACTIVA' ? 'Activa' : 'Finalizada'}</span>
              </div>
              {a.descripcion && <p>{a.descripcion}</p>}
              <small>
                Fuente: {a.origen_nombre}<br />
                Emitida: {formatearFecha(a.fecha_creacion)}
                {a.fecha_actualizacion && <><br />Actualizada: {formatearFecha(a.fecha_actualizacion)}</>}
              </small>
              {puedeGestionar(usuario, a) && (
                <button
                  className="btn btn-small"
                  onClick={() => onCambiarEstado(a.id, a.estado === 'ACTIVA' ? 'FINALIZADA' : 'ACTIVA')}
                >
                  {a.estado === 'ACTIVA' ? 'Marcar como finalizada' : 'Reactivar'}
                </button>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {usuario && <SelectorCoordenadas onSeleccion={onSeleccionPunto} />}
      {usuario && puntoSeleccionado && <Marker position={[puntoSeleccionado.lat, puntoSeleccionado.lng]} />}
    </MapContainer>
  );
}
