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
 *   y los marcadores abren el panel de detalle lateral.
 */
import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Rectangle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { REGION } from '@geoalerts/compartido';

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

/** Componente interno para manejar los zooms automáticos y ajustes de límites */
function ControlZoomAutomatico({ alertaSeleccionada, alertas }) {
  const map = useMap();

  useEffect(() => {
    // 1. Si el usuario hizo clic en una alerta específica de la lista
    if (alertaSeleccionada) {
      map.flyTo([alertaSeleccionada.latitud, alertaSeleccionada.longitud], 14, {
        duration: 1.5
      });
    } 
    // 2. Si no hay una seleccionada pero hay alertas visibles, ajusta la vista a los límites de las filtradas
    else if (alertas && alertas.length > 0) {
      const puntos = alertas.map(a => [a.latitud, a.longitud]);
      const bounds = L.latLngBounds(puntos);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
    const timer = window.setTimeout(() => map.invalidateSize({ pan: false }), 350);
    return () => window.clearTimeout(timer);
  }, [alertaSeleccionada, alertas, map]);

  return null;
}

export default function Mapa({
  alertas, usuario, puntoSeleccionado, onSeleccionPunto, alertaSeleccionada, onSeleccionAlerta,
}) {
  return (
    <MapContainer
      bounds={LIMITES_REGION}
      maxBounds={LIMITES_NAVEGACION}
      minZoom={5}
      zoomSnap={0.25}
      className="mapa"
      scrollWheelZoom
    >
      {/* Control para hacer zoom automático al filtrar o seleccionar */}
      <ControlZoomAutomatico alertaSeleccionada={alertaSeleccionada} alertas={alertas} />

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
            weight: alertaSeleccionada?.id === a.id ? 4 : 2,
          }}
          eventHandlers={{
            click: (evento) => {
              evento.originalEvent.stopPropagation();
              onSeleccionAlerta(a);
            },
          }}
        />
      ))}

      {usuario && <SelectorCoordenadas onSeleccion={onSeleccionPunto} />}
      {usuario && puntoSeleccionado && <Marker position={[puntoSeleccionado.lat, puntoSeleccionado.lng]} />}
    </MapContainer>
  );
}