import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { X, Navigation, MapPin, Layers, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

// Fix for default marker icons in Leaflet with React
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface ProjectMapProps {
  isOpen: boolean;
  onClose: () => void;
  project?: {
    name: string;
    location: string;
    latitude?: number | string;
    longitude?: number | string;
    pois?: any[];
  } | null;
  projects?: any[];
  onSelectLocation?: (lat: number, lng: number) => void;
  isSelectionMode?: boolean;
}

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

function MapEvents({ onSelect }: { onSelect?: (lat: number, lng: number) => void }) {
  const map = useMap();
  
  React.useEffect(() => {
    if (!onSelect) return;
    
    const handleClick = (e: L.LeafletMouseEvent) => {
      onSelect(e.latlng.lat, e.latlng.lng);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, onSelect]);

  return null;
}

export default function ProjectMap({ isOpen, onClose, project, projects, onSelectLocation, isSelectionMode }: ProjectMapProps) {
  if (!isOpen) return null;

  const [mapType, setMapType] = React.useState<'standard' | 'satellite' | 'terrain'>('standard');
  const [isViewMenuOpen, setIsViewMenuOpen] = React.useState(false);
  const [selectedPos, setSelectedPos] = React.useState<[number, number] | null>(null);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const isGlobal = useMemo(() => !!projects, [projects]);
  
  const displayProjects = useMemo(() => 
    isGlobal ? projects : (project ? [project] : []), 
    [isGlobal, projects, project]
  );

  const mapCenter = useMemo(() => {
    const defaultCenter: [number, number] = [14.6349, -90.5069];
    const isGlobalVal = !!projects;
    
    if (project) {
      const lat = typeof project.latitude === 'string' ? parseFloat(project.latitude) : project.latitude;
      const lng = typeof project.longitude === 'string' ? parseFloat(project.longitude) : project.longitude;
      if (lat && lng) return { center: [lat, lng] as [number, number], zoom: 15 };
    } else if (isGlobalVal && projects && projects.length > 0) {
      const firstWithCoords = projects.find(p => p.latitude && p.longitude);
      if (firstWithCoords) {
        const lat = typeof firstWithCoords.latitude === 'string' ? parseFloat(firstWithCoords.latitude) : firstWithCoords.latitude;
        const lng = typeof firstWithCoords.longitude === 'string' ? parseFloat(firstWithCoords.longitude) : firstWithCoords.longitude;
        if (lat && lng) return { center: [lat, lng] as [number, number], zoom: 12 };
      }
    }
    return { center: defaultCenter, zoom: isGlobalVal ? 12 : 15 };
  }, [project, projects]);

  const pois = useMemo(() => project?.pois || [], [project?.pois]);
  const center = mapCenter.center;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-5xl h-[80vh] bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col"
          >
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-primary text-white rounded-xl sm:rounded-2xl shadow-lg shadow-primary-shadow">
                  <MapPin size={18} className="sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                    {isSelectionMode ? 'Seleccionar Ubicación' : (isGlobal ? 'Mapa de Obras' : project?.name)}
                  </h2>
                  <p className="text-[8px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    {isSelectionMode ? 'Haz clic en el mapa para marcar las coordenadas' : (isGlobal ? `${projects.length} Proyectos Registrados` : project?.location)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm",
                      isViewMenuOpen 
                        ? "bg-primary text-white border-primary" 
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                    )}
                  >
                    <Layers size={14} />
                    Vistas
                  </button>

                  <AnimatePresence>
                    {isViewMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 p-2 z-[1001]"
                      >
                        <div className="space-y-1">
                          {[
                            { id: 'standard', label: 'Estándar', icon: MapPin },
                            { id: 'satellite', label: 'Satélite', icon: Layers },
                            { id: 'terrain', label: 'Relieve', icon: Navigation }
                          ].map((type) => (
                            <button
                              key={type.id}
                              onClick={() => {
                                setMapType(type.id as any);
                                setIsViewMenuOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                mapType === type.id 
                                  ? "bg-primary/10 text-primary" 
                                  : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <type.icon size={14} />
                                {type.label}
                              </div>
                              {mapType === type.id && <Check size={14} />}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 sm:p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl sm:rounded-2xl transition-colors text-slate-400 hover:text-rose-500"
                >
                  <X size={18} className="sm:w-6 sm:h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 relative z-0">
              <MapContainer 
                center={mapCenter.center} 
                zoom={mapCenter.zoom} 
                className="h-full w-full"
                scrollWheelZoom={true}
              >
                {isSelectionMode && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-emerald-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl flex items-center gap-3 animate-bounce border-2 border-white/20 backdrop-blur-md">
                    <MapPin size={16} />
                    Haz clic en el mapa para marcar la ubicación
                  </div>
                )}
                {mapType === 'standard' ? (
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                ) : mapType === 'satellite' ? (
                  <TileLayer
                    attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                ) : (
                  <TileLayer
                    attribution='&copy; <a href="https://www.opentopomap.org/copyright">OpenTopoMap</a> contributors'
                    url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  />
                )}
                
                {isSelectionMode && selectedPos && (
                  <Marker position={selectedPos}>
                    <Popup>
                      <p className="font-bold text-slate-900">Ubicación Seleccionada</p>
                    </Popup>
                  </Marker>
                )}

                {!isSelectionMode && displayProjects.map((p, idx) => {
                  const pLat = typeof p.latitude === 'string' ? parseFloat(p.latitude) : p.latitude;
                  const pLng = typeof p.longitude === 'string' ? parseFloat(p.longitude) : p.longitude;
                  
                  if (!pLat || !pLng) return null;

                  return (
                    <Marker key={p.id || idx} position={[pLat, pLng]}>
                      <Popup>
                        <div className="p-2 min-w-[150px]">
                          <p className="font-bold text-slate-900 mb-1">{p.name}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">{p.location}</p>
                          <div className="flex flex-col gap-2">
                            <a 
                              href={`https://www.google.com/maps/dir/?api=1&destination=${pLat},${pLng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                            >
                              <Navigation size={10} />
                              Cómo llegar
                            </a>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {/* Render POIs for single project view */}
                {!isGlobal && pois.map((poi: any, idx: number) => (
                  <Marker 
                    key={`poi-${idx}`} 
                    position={[poi.lat, poi.lng]}
                    icon={L.divIcon({
                      className: 'custom-div-icon',
                      html: `<div style="background-color: #2563eb; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
                      iconSize: [12, 12],
                      iconAnchor: [6, 6]
                    })}
                  >
                    <Popup>
                      <div className="p-2 min-w-[120px]">
                        <p className="font-bold text-slate-900 text-xs">{poi.name}</p>
                        <p className="text-[10px] text-slate-500 mt-1">{poi.comment}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
                
                <ChangeView center={mapCenter.center} zoom={mapCenter.zoom} />
                {isSelectionMode && (
                  <MapEvents onSelect={(lat, lng) => {
                    setSelectedPos([lat, lng]);
                  }} />
                )}
              </MapContainer>

              {!isGlobal && !isSelectionMode && (!project?.latitude || !project?.longitude) && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-amber-500 text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-xl flex items-center gap-2">
                  <Navigation size={14} className="animate-pulse" />
                  Ubicación aproximada (Coordenadas no registradas)
                </div>
              )}
            </div>

            {!isGlobal && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Latitud</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {isSelectionMode ? (selectedPos ? selectedPos[0].toFixed(6) : '---') : center[0].toFixed(6)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Longitud</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {isSelectionMode ? (selectedPos ? selectedPos[1].toFixed(6) : '---') : center[1].toFixed(6)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isSelectionMode ? (
                    <button
                      onClick={() => {
                        if (selectedPos && onSelectLocation) {
                          onSelectLocation(selectedPos[0], selectedPos[1]);
                          onClose();
                        } else {
                          toast.error('Por favor selecciona un punto en el mapa');
                        }
                      }}
                      className="flex items-center gap-2 px-8 py-3 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                    >
                      <Check size={14} />
                      Confirmar Ubicación
                    </button>
                  ) : (
                    <button
                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${center[0]},${center[1]}`, '_blank')}
                      className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
                    >
                      <Navigation size={14} />
                      Abrir en Google Maps
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
