import { ETIQUETA_TIPO, puedeGestionar } from '@geoalerts/compartido';

const ICONO_TIPO = {
  VIENTO: '↝',
  OLEAJE: '≋',
  TORMENTA: 'ϟ',
  SUDESTADA: '☂',
};

function formatearFecha(fecha) {
  if (!fecha) return '—';
  const normalizada = fecha.includes('T') ? fecha : `${fecha.replace(' ', 'T')}Z`;
  return new Date(normalizada).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function PanelAlerta({ alerta, usuario, onCerrar, onCambiarEstado }) {
  if (!alerta) return null;

  return (
    <aside className="detalle-alerta" aria-label="Detalle de alerta">
      <div className="detalle-cabecera">
        <span className={`detalle-icono icono-${alerta.tipo.toLowerCase()}`} aria-hidden="true">
          {ICONO_TIPO[alerta.tipo]}
        </span>
        <button className="cerrar-detalle" type="button" onClick={onCerrar} aria-label="Cerrar detalle">
          ×
        </button>
      </div>
      <p className="detalle-tipo">{ETIQUETA_TIPO[alerta.tipo]}</p>
      <h2 className="detalle-titulo">{alerta.titulo}</h2>
      <div className="detalle-etiquetas">
        <span className={`chip chip-${alerta.nivel_gravedad.toLowerCase()}`}>{alerta.nivel_gravedad}</span>
        <span className={`estado-alerta ${alerta.estado === 'ACTIVA' ? 'activa' : ''}`}>
          <span />{alerta.estado === 'ACTIVA' ? 'Activa' : 'Finalizada'}
        </span>
      </div>

      <section className="detalle-seccion">
        <h3>Situación</h3>
        <p className="detalle-descripcion">{alerta.descripcion || 'Sin descripción disponible.'}</p>
      </section>

      <section className="detalle-seccion">
        <h3>Origen y registro</h3>
        <dl className="detalle-datos">
          <div><dt>Organismo</dt><dd>{alerta.origen_nombre || 'Fuente no especificada'}</dd></div>
          <div><dt>Emitida</dt><dd>{formatearFecha(alerta.fecha_creacion)}</dd></div>
          <div><dt>Actualizada</dt><dd>{formatearFecha(alerta.fecha_actualizacion)}</dd></div>
        </dl>
      </section>

      {puedeGestionar(usuario, alerta) && (
        <button
          className="btn btn-estado"
          type="button"
          onClick={() => onCambiarEstado(alerta.id, alerta.estado === 'ACTIVA' ? 'FINALIZADA' : 'ACTIVA')}
        >
          {alerta.estado === 'ACTIVA' ? 'Marcar como finalizada' : 'Reactivar alerta'}
        </button>
      )}
    </aside>
  );
}
