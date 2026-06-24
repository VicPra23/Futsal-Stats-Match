/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, Trash2, Edit2, Check, X, ShieldAlert, Award, UserPlus, Upload, Camera, 
  User, Calendar, Footprints, Star, Clock, Target, AlertTriangle, Shield, Table, TrendingUp, HelpCircle, FileText
} from 'lucide-react';
import { Player, PositionType, Match } from '../types';
import { exportPlayerDossierToPDF } from '../utils/pdfGenerator';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, CartesianGrid 
} from 'recharts';

interface PlayerManagerProps {
  players: Player[];
  matches?: Match[];
  onAddPlayer: (player: Omit<Player, 'id' | 'isActive'>) => void;
  onEditPlayer: (player: Player) => void;
  onDeletePlayer: (id: string) => void;
}

// Colors for Pie Chart
const COLORS = ['#004183', '#FFD700', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'];

// Helper to render customized footprint icon depending on dominant leg
const renderDominantLegIcon = (leg: 'Diestra' | 'Zurda' | 'Ambidiestra', size: number = 12) => {
  // Use discrete fixed sizes (12, 16) for bulletproof subpixel anti-aliasing and pixel alignment
  const renderSize = size >= 14 ? 16 : 12;
  const widthClass = renderSize === 16 ? "w-2" : "w-1.5";
  const heightClass = renderSize === 16 ? "h-4" : "h-3";
  const offsetClass = renderSize === 16 ? "-left-2" : "-left-1.5";
  
  if (leg === 'Zurda') {
    return (
      <span className={`inline-flex items-center justify-center shrink-0 ${widthClass} ${heightClass} overflow-hidden relative`} title="Pierna Izquierda (Zurda)">
        <Footprints size={renderSize} className="absolute left-0 top-0 text-indigo-600 max-w-none" />
      </span>
    );
  } else if (leg === 'Diestra') {
    return (
      <span className={`inline-flex items-center justify-center shrink-0 ${widthClass} ${heightClass} overflow-hidden relative`} title="Pierna Derecha (Diestra)">
        <Footprints size={renderSize} className={`absolute ${offsetClass} top-0 text-emerald-600 max-w-none`} />
      </span>
    );
  } else {
    const doubleWidthClass = renderSize === 16 ? "w-4" : "w-3";
    return (
      <span className={`inline-flex items-center justify-center shrink-0 ${doubleWidthClass} ${heightClass}`} title="Ambidiestra (Ambas piernas)">
        <Footprints size={renderSize} className="text-violet-600" />
      </span>
    );
  }
};

// Helper to format date to DD/MM/AAAA
const formatToSpanishDate = (dateStr: string) => {
  if (!dateStr) return 'No definida';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

// Helper to adapt position label based on player's gender
export const getPlayerPositionLabel = (pos: PositionType, gender?: 'M' | 'F') => {
  if (pos === 'Portero/a') {
    return gender === 'M' ? 'Portero' : gender === 'F' ? 'Portera' : 'Portero/a';
  }
  return pos;
};

export default function PlayerManager({
  players,
  matches = [],
  onAddPlayer,
  onEditPlayer,
  onDeletePlayer
}: PlayerManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for new player
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState<PositionType | ''>('');
  const [birthDate, setBirthDate] = useState('');
  const [dominantLeg, setDominantLeg] = useState<'Diestra' | 'Zurda' | 'Ambidiestra' | ''>('');
  const [photo, setPhoto] = useState<string>('');
  const [gender, setGender] = useState<'M' | 'F'>('F'); // Default to female
  const [dragActive, setDragActive] = useState(false);
  
  // Zoom & Translation Offsets for Crop Tool
  const [zoom, setZoom] = useState<number>(1.2);
  const [offsetY, setOffsetY] = useState<number>(-15); // Default slightly up to center face
  const [offsetX, setOffsetX] = useState<number>(0);
  const [rawPhoto, setRawPhoto] = useState<string>(''); // original high-res image

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Form State for edit player
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editPosition, setEditPosition] = useState<PositionType>('Ala');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editDominantLeg, setEditDominantLeg] = useState<'Diestra' | 'Zurda' | 'Ambidiestra'>('Diestra');
  const [editPhoto, setEditPhoto] = useState<string>('');
  const [editGender, setEditGender] = useState<'M' | 'F'>('F');
  const [editDragActive, setEditDragActive] = useState(false);

  // Edit Zoom & Translation Offsets
  const [editZoom, setEditZoom] = useState<number>(1.2);
  const [editOffsetY, setEditOffsetY] = useState<number>(-15);
  const [editOffsetX, setEditOffsetX] = useState<number>(0);
  const [editRawPhoto, setEditRawPhoto] = useState<string>('');

  const [error, setError] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Player statistics calculations
  const getPlayerStats = (playerId: string) => {
    let secondsPlayed = 0;
    let shots = 0;
    let goals = 0;
    let yellows = 0;
    let redCards = 0;
    let saves = 0;
    let goalsConceded = 0;
    let matchesParticipated = 0;

    matches.forEach(match => {
      const perf = match.stats[playerId];
      if (perf) {
        if (perf.secondsPlayed > 0) {
          matchesParticipated += 1;
        }
        secondsPlayed += perf.secondsPlayed || 0;
        shots += perf.shots || 0;
        goals += perf.goals || 0;
        yellows += perf.yellows || 0;
        if (perf.redCard) {
          redCards += 1;
        }
        saves += perf.saves || 0;
        goalsConceded += perf.goalsConceded || 0;
      }
    });

    return {
      secondsPlayed,
      shots,
      goals,
      yellows,
      redCards,
      saves,
      goalsConceded,
      matchesParticipated
    };
  };

  // Team-wide aggregated stats
  const totalLocalShots = matches.reduce((acc, match) => {
    return acc + match.shotsEvents.filter(s => s.team === 'local').length;
  }, 0);

  const totalLocalGoals = matches.reduce((acc, match) => {
    return acc + match.shotsEvents.filter(s => s.team === 'local' && s.type === 'goal').length;
  }, 0);

  const totalLocalOnTarget = matches.reduce((acc, match) => {
    return acc + match.shotsEvents.filter(s => s.team === 'local' && s.type === 'on_target').length + match.goalsFor;
  }, 0);

  // Recharts: Distribution of Goals per Athlete
  const goalsByPlayerData = players
    .filter(p => p.isActive)
    .map(p => {
      const stats = getPlayerStats(p.id);
      return {
        name: p.alias || p.name,
        goles: stats.goals
      };
    })
    .filter(data => data.goles > 0);

  // Recharts: Team Shots Global Performance Breakdown
  const globalShotsChartData = [
    { name: 'Tiros Totales', cantidad: totalLocalShots, color: '#004183' },
    { name: 'A Puerta', cantidad: totalLocalOnTarget, color: '#0ea5e9' },
    { name: 'Goles', cantidad: totalLocalGoals, color: '#10b981' }
  ];

  // Age calculation helper
  const calculateAge = (dateStr: string): number => {
    if (!dateStr) return 0;
    const today = new Date();
    const birth = new Date(dateStr);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  // Convert seconds to beautiful text format
  const formatTimePlayed = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')} min`;
  };

  // Helper to draw cropped/zoomed image onto standard-sized canvas
  const generateCroppedImage = (
    base64Src: string,
    z: number,
    ox: number,
    oy: number,
    callback: (croppedBase64: string) => void
  ) => {
    if (!base64Src) return;
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const size = 180; // High clarity & performance focused 180px square size for perfect messaging sharing
          canvas.width = size;
          canvas.height = size;

          const imgRatio = img.width / img.height;
          let sw, sh, sx, sy;
          if (imgRatio > 1) {
            sh = img.height;
            sw = img.height;
            sx = (img.width - sw) / 2;
            sy = 0;
          } else {
            sw = img.width;
            sh = img.width;
            sx = 0;
            sy = (img.height - sh) / 2;
          }

          const zoomedSw = sw / z;
          const zoomedSh = sh / z;

          const centerX = sx + sw / 2;
          const centerY = sy + sh / 2;

          // Align slide offset from percentage (-100 to 100) to actual source pixels
          const shiftX = (ox / 100) * sw;
          const shiftY = (oy / 100) * sh;

          const finalCenterX = centerX + shiftX;
          const finalCenterY = centerY + shiftY;

          let finalSx = finalCenterX - zoomedSw / 2;
          let finalSy = finalCenterY - zoomedSh / 2;

          // Clamp within image bounds
          if (finalSx < 0) finalSx = 0;
          if (finalSy < 0) finalSy = 0;
          if (finalSx + zoomedSw > img.width) finalSx = img.width - zoomedSw;
          if (finalSy + zoomedSh > img.height) finalSy = img.height - zoomedSh;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, finalSx, finalSy, zoomedSw, zoomedSh, 0, 0, size, size);

          const croppedBase64 = canvas.toDataURL('image/jpeg', 0.82);
          callback(croppedBase64);
        }
      } catch (err) {
        console.error('Error in real-time canvas crop:', err);
      }
    };
    img.src = base64Src;
  };

  // Real-time updates for cropping tools
  useEffect(() => {
    if (rawPhoto) {
      generateCroppedImage(rawPhoto, zoom, offsetX, offsetY, (croppedBase64) => {
        setPhoto(croppedBase64);
      });
    }
  }, [rawPhoto, zoom, offsetX, offsetY]);

  useEffect(() => {
    if (editRawPhoto) {
      generateCroppedImage(editRawPhoto, editZoom, editOffsetX, editOffsetY, (croppedBase64) => {
        setEditPhoto(croppedBase64);
      });
    }
  }, [editRawPhoto, editZoom, editOffsetX, editOffsetY]);

  // Process and crop image to a nice square base64
  const processImageFile = (file: File, callback: (base64: string) => void) => {
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecciona un archivo de imagen válido.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        callback(e.target.result as string);
      }
    };
    reader.onerror = () => {
      setError('Error al procesar la imagen seleccionada.');
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent, type: 'new' | 'edit') => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      if (type === 'new') setDragActive(true);
      else setEditDragActive(true);
    } else if (e.type === 'dragleave') {
      if (type === 'new') setDragActive(false);
      else setEditDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent, type: 'new' | 'edit') => {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'new') {
      setDragActive(false);
    } else {
      setEditDragActive(false);
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processImageFile(file, (base64) => {
        if (type === 'new') {
          setRawPhoto(base64);
          setZoom(1.2);
          setOffsetY(-15);
          setOffsetX(0);
        } else {
          setEditRawPhoto(base64);
          setEditZoom(1.2);
          setEditOffsetY(-15);
          setEditOffsetX(0);
        }
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'new' | 'edit') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      processImageFile(file, (base64) => {
        if (type === 'new') {
          setRawPhoto(base64);
          setZoom(1.2);
          setOffsetY(-15);
          setOffsetX(0);
        } else {
          setEditRawPhoto(base64);
          setEditZoom(1.2);
          setEditOffsetY(-15);
          setEditOffsetX(0);
        }
      });
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('El Nombre Completo es obligatorio.');
      return;
    }
    if (!number.trim() || isNaN(Number(number))) {
      setError('El Dorsal es obligatorio y debe ser un número válido.');
      return;
    }
    if (!position) {
      setError('La Posición Natural es obligatoria.');
      return;
    }
    if (!dominantLeg) {
      setError('La Pierna Dominante es obligatoria.');
      return;
    }

    // Check taken dorsal
    const numExists = players.some(p => p.number === number.trim() && p.isActive);
    if (numExists) {
      setError(`El dorsal #${number} ya está asignado a otro/a jugador/a activo/a.`);
      return;
    }

    onAddPlayer({
      name: name.trim(),
      alias: alias.trim() ? alias.trim() : name.trim().split(' ')[0],
      number: number.trim(),
      position: position as PositionType,
      birthDate: birthDate || '',
      dominantLeg: dominantLeg as 'Diestra' | 'Zurda' | 'Ambidiestra',
      photo: photo || undefined,
      gender: gender
    });

    // Reset Form State
    setName('');
    setAlias('');
    setNumber('');
    setPosition('');
    setBirthDate('');
    setDominantLeg('');
    setPhoto('');
    setGender('F');
    setRawPhoto('');
    setZoom(1.2);
    setOffsetY(-15);
    setOffsetX(0);
    setShowForm(false);
  };

  const handleStartEdit = (e: React.MouseEvent, player: Player) => {
    e.stopPropagation(); // Avoid opening profile modal when clicking edit
    setEditingId(player.id);
    setEditName(player.name);
    setEditAlias(player.alias || player.name.split(' ')[0]);
    setEditNumber(player.number);
    setEditPosition(player.position);
    setEditBirthDate(player.birthDate || '');
    setEditDominantLeg(player.dominantLeg || 'Diestra');
    setEditPhoto(player.photo || '');
    setEditRawPhoto(player.photo || '');
    setEditZoom(1.0); // No extra zoom on load of already cropped image
    setEditOffsetY(0);
    setEditOffsetX(0);
    setEditGender(player.gender || 'F');
    setError('');
  };

  const handleSaveEdit = (id: string) => {
    setError('');

    if (!editName.trim()) {
      setError('El Nombre Completo es obligatorio.');
      return;
    }
    if (!editNumber.trim() || isNaN(Number(editNumber))) {
      setError('El Dorsal es obligatorio y debe ser un número válido.');
      return;
    }

    // Check taken dorsal (excluding current)
    const numExists = players.some(p => p.id !== id && p.number === editNumber.trim() && p.isActive);
    if (numExists) {
      setError(`El dorsal #${editNumber} ya está en uso.`);
      return;
    }

    const finalAlias = editAlias.trim() ? editAlias.trim() : editName.trim().split(' ')[0];

    onEditPlayer({
      id,
      name: editName.trim(),
      alias: finalAlias,
      number: editNumber.trim(),
      position: editPosition,
      birthDate: editBirthDate || '',
      dominantLeg: editDominantLeg || 'Diestra',
      isActive: true,
      photo: editPhoto || undefined,
      gender: editGender
    });

    setEditingId(null);
    setEditPhoto('');
    setEditRawPhoto('');
    setEditZoom(1.0);
    setEditOffsetY(0);
    setEditOffsetX(0);
    setError('');
    
    // Update selected details if currently viewing this player
    if (selectedPlayer?.id === id) {
      setSelectedPlayer({
        id,
        name: editName.trim(),
        alias: finalAlias,
        number: editNumber.trim(),
        position: editPosition,
        birthDate: editBirthDate || '',
        dominantLeg: editDominantLeg || 'Diestra',
        isActive: true,
        photo: editPhoto || undefined,
        gender: editGender
      });
    }
  };

  const getPositionBadgeClass = (pos: PositionType) => {
    switch (pos) {
      case 'Portero/a': return 'bg-rose-50 text-rose-700 border-rose-200/80';
      case 'Cierre': return 'bg-indigo-50 text-indigo-700 border-indigo-200/80';
      case 'Ala': return 'bg-amber-50 text-amber-700 border-amber-200/80';
      case 'Pívot': return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
      case 'Universal': return 'bg-purple-50 text-purple-700 border-purple-200/80';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  // Filter player list based on search query
  const filteredPlayers = players.filter(p => {
    if (!p.isActive) return false;
    const query = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      (p.alias || '').toLowerCase().includes(query) ||
      p.number.includes(query) ||
      p.position.toLowerCase().includes(query)
    );
  }).sort((a, b) => {
    const numA = parseInt(a.number, 10);
    const numB = parseInt(b.number, 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.number.localeCompare(b.number);
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6" id="player-manager-root">
      
      {/* SQUAD FILTER BAR AND TITLE */}
      <div className="flex flex-col gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm mb-6" id="squad-header-block">
        <div className="flex items-center gap-2.5 bg-slate-50/50 p-2 rounded-2xl w-fit border border-slate-100 pr-4">
          <div className="relative w-9 h-9 bg-white rounded-full border border-[#FFD700] flex items-center justify-center p-1 shrink-0 shadow-sm">
            <img
              referrerPolicy="no-referrer"
              src="https://api.clupik.com/clubs/10590/images/navbar.png"
              alt="FS Talavera Femenino"
              className="w-full h-full object-contain"
            />
          </div>
          <h2 className="text-xl font-black text-slate-950 tracking-tight">
            Plantilla oficial
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Buscar por Nombre, Posición, Dorsal..."
              value={searchQuery}
              id="player-search-input"
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 transition"
            />
          </div>
          {/* DOSSIER COMPLETO DE PLANTILLA PDF */}
          <button
            type="button"
            onClick={() => exportPlayerDossierToPDF(players.filter(p => p.isActive), matches || [])}
            disabled={players.length === 0}
            id="btn-export-all-player-dossiers-pdf"
            className="inline-flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition border border-slate-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            <FileText size={14} className="text-[#004183]" />
            Dossier Fichas PDF
          </button>

          <button
            onClick={() => {
              if (!showForm) {
                setName('');
                setAlias('');
                setNumber('');
                setPosition('');
                setBirthDate('');
                setDominantLeg('');
                setPhoto('');
                setError(null);
              }
              setShowForm(!showForm);
            }}
            id="btn-toggle-player-add"
            className="inline-flex items-center justify-center gap-1.5 bg-[#004183] hover:bg-blue-900 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-sm border-b-2 border-yellow-400 cursor-pointer w-full sm:w-auto"
          >
            {showForm ? <X size={14} /> : <UserPlus size={14} />}
            {showForm ? 'Cerrar Registro' : 'Nuevo/a Jugador/a'}
          </button>
        </div>
      </div>
      {/* 2. REGISTRATION FORM WITH STRICTION OF 7 INPUTS */}
      {showForm && (
        <form onSubmit={handleAddSubmit} id="player-advanced-registration-form" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md mb-8 animate-fade-in">
          <div className="flex justify-between items-center mb-4 border-b border-slate-50 pb-3">
            <h3 className="text-sm font-black uppercase text-[#004183] tracking-widest flex items-center gap-1.5">
              <UserPlus size={16} /> REGISTRO DE NUEVO/A JUGADOR/A
            </h3>
            <span className="text-[10px] bg-[#004183]/10 text-[#004183] border border-slate-200 font-black px-2.5 py-0.5 rounded-full select-none">
              Campos mínimos obligatorio
            </span>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
            {/* INPUT 1: Profile picture thumbnail drag-and-drop crop */}
            <div className="flex flex-col items-center justify-center p-4 border border-slate-100 rounded-2xl bg-slate-50/50">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 w-full text-center">
                1. Foto de Perfil
              </label>
              
              <div
                onDragEnter={(e) => handleDrag(e, 'new')}
                onDragOver={(e) => handleDrag(e, 'new')}
                onDragLeave={(e) => handleDrag(e, 'new')}
                onDrop={(e) => handleDrop(e, 'new')}
                onClick={() => fileInputRef.current?.click()}
                className={`w-28 h-28 rounded-full border-2 border-dashed flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group transition duration-150 ${
                  dragActive ? 'border-yellow-405 bg-yellow-50' : 'border-slate-300 bg-white hover:bg-slate-50 hover:border-[#004183]'
                }`}
              >
                {photo ? (
                  <>
                    <img referrerPolicy="no-referrer" src={photo} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-blue-950/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-155">
                      <Camera size={20} className="text-yellow-400" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-3 text-center select-none">
                    <Upload size={20} className="text-slate-400 group-hover:text-blue-900 transition mb-1 animate-pulse" />
                    <span className="text-[9px] font-bold text-slate-400 leading-tight">Suelte o presione</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, 'new')}
                  className="hidden"
                />
              </div>
              
              {photo && (
                <div className="flex flex-col items-center mt-2 w-full">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPhoto(''); setRawPhoto(''); }}
                    className="text-[10px] text-rose-500 hover:text-rose-600 font-bold underline cursor-pointer"
                  >
                    Quitar foto
                  </button>

                  {rawPhoto && (
                    <div className="mt-3 w-full bg-white p-2.5 rounded-xl border border-slate-200/70 space-y-2.5">
                      <div className="flex items-center justify-between text-[8px] font-black text-[#004183] uppercase tracking-wider">
                        <span>⚙️ Ajustar Centrado / Cara</span>
                        <button
                          type="button"
                          onClick={() => {
                            setZoom(1.2);
                            setOffsetY(-15);
                            setOffsetX(0);
                          }}
                          className="text-[7.5px] text-slate-400 hover:text-slate-600 font-bold uppercase underline"
                        >
                          Reset
                        </button>
                      </div>

                      {/* ZOOM SLIDER */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between items-center text-[7px] text-slate-500 font-bold uppercase">
                          <span>Zoom / Acercar:</span>
                          <span className="font-mono text-[8px] font-bold text-[#004183]">{zoom.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="3.5"
                          step="0.05"
                          value={zoom}
                          onChange={(e) => setZoom(parseFloat(e.target.value))}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#004183]"
                        />
                      </div>

                      {/* VERTICAL OFFSET SLIDER */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between items-center text-[7px] text-slate-500 font-bold uppercase">
                          <span>Subir / Bajar Cara:</span>
                          <span className="font-mono text-[8px] font-bold text-[#004183]">{offsetY}%</span>
                        </div>
                        <input
                          type="range"
                          min="-75"
                          max="75"
                          step="1"
                          value={offsetY}
                          onChange={(e) => setOffsetY(parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#004183]"
                        />
                      </div>

                      {/* HORIZONTAL OFFSET SLIDER */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between items-center text-[7px] text-slate-500 font-bold uppercase">
                          <span>Mover Lateral:</span>
                          <span className="font-mono text-[8px] font-bold text-[#004183]">{offsetX}%</span>
                        </div>
                        <input
                          type="range"
                          min="-75"
                          max="75"
                          step="1"
                          value={offsetX}
                          onChange={(e) => setOffsetX(parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#004183]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
 
            {/* Inputs 2 to 7 */}
            <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              
              {/* INPUT 2: Nombre Completo */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  2. Nombre Completo *
                </label>
                <input
                  type="text"
                  value={name}
                  id="reg-player-fullname"
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#004183] transition font-medium"
                />
              </div>
 
              {/* INPUT 3: Nombre Deportivo / Alias */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  3. Nombre Deportivo/Alias
                </label>
                <input
                  type="text"
                  value={alias}
                  id="reg-player-deporname"
                  onChange={e => setAlias(e.target.value)}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#004183] transition font-bold text-[#004183]"
                />
                <p className="text-[9px] text-slate-400 mt-1">Este alias se imprimirá en los listados del partido.</p>
              </div>
 
              {/* INPUT 4: Dorsal */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  4. Dorsal *
                </label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={number}
                  id="reg-player-dorsal"
                  onChange={e => setNumber(e.target.value)}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#004183] transition font-mono font-bold"
                />
              </div>
 
              {/* INPUT 5: Fecha de Nacimiento */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  5. Fecha de Nacimiento
                </label>
                <input
                  type="date"
                  value={birthDate}
                  id="reg-player-birthdate"
                  onChange={e => setBirthDate(e.target.value)}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#004183] transition font-mono cursor-pointer"
                />
                {birthDate && (
                  <p className="text-[10px] text-[#004183] font-bold mt-1">
                    Edad calculada: {calculateAge(birthDate)} años
                  </p>
                )}
              </div>
  
              {/* INPUT 6: Pierna Dominante */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
                  <span>6. Pierna Dominante</span>
                  {dominantLeg && (
                    <span className="flex items-center gap-1 bg-[#004183]/5 text-[#004183] border border-[#004183]/10 px-2 py-0.5 rounded-full text-[9px] font-black">
                      Visual: <span className="inline-flex items-center ml-1">{renderDominantLegIcon(dominantLeg as any, 14)}</span>
                    </span>
                  )}
                </label>
                <select
                  value={dominantLeg}
                  id="reg-player-leg"
                  onChange={e => setDominantLeg(e.target.value as any)}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#004183] transition cursor-pointer font-semibold"
                >
                  <option value="" disabled hidden></option>
                  <option value="Diestra">Diestra</option>
                  <option value="Zurda">Zurda</option>
                  <option value="Ambidiestra">Ambidiestra</option>
                </select>
              </div>
  
              {/* INPUT 7: Posición Natural * */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  7. Posición Natural *
                </label>
                <select
                  value={position}
                  id="reg-player-pos"
                  onChange={e => setPosition(e.target.value as PositionType)}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#004183] transition cursor-pointer font-semibold"
                >
                  <option value="" disabled hidden></option>
                  <option value="Portero/a">Portero/a</option>
                  <option value="Cierre">Cierre</option>
                  <option value="Ala">Ala</option>
                  <option value="Pívot">Pívot</option>
                  <option value="Universal">Universal</option>
                </select>
              </div>
 
              {/* INPUT 8: Sexo / Género */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  8. Sexo / Género *
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGender('F')}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border text-[11px] font-black transition cursor-pointer ${
                      gender === 'F'
                        ? 'bg-rose-50 border-rose-400 text-rose-700 ring-2 ring-rose-100'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <span>Mujer ♀</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('M')}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border text-[11px] font-black transition cursor-pointer ${
                      gender === 'M'
                        ? 'bg-blue-50 border-blue-400 text-[#004183] ring-2 ring-blue-100'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <span>Hombre ♂</span>
                  </button>
                </div>
              </div>
 
            </div>
          </div>
 
          {error && (
            <div className="mt-4 flex items-center gap-2 text-rose-600 bg-rose-50 px-4 py-2.5 rounded-xl text-xs border border-rose-100 font-bold">
              <ShieldAlert size={15} />
              <span>{error}</span>
            </div>
          )}
 
          <div className="mt-5 flex justify-end gap-3 border-t border-slate-50 pt-4">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError('');
                setPhoto('');
              }}
              className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold text-xs uppercase cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="btn-register-confirm"
              className="bg-[#004183] hover:bg-blue-900 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition border-b-2 border-yellow-400 cursor-pointer"
            >
              Confirmar
            </button>
          </div>
        </form>
      )}

      {/* SQUAD LIST SHOWCASE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
          Jugadores/as ({filteredPlayers.length})
        </h3>
      </div>

      {/* SQUAD METRICS SUMMARY CARD */}
      {players.filter(p => p.isActive).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6 bg-white p-5 rounded-3xl border border-slate-100 shadow-xs" id="squad-metrics-summary-card">
          {/* COLUMN 1: POSITIONS */}
          <div className="flex flex-col space-y-2.5 border-r-0 md:border-r border-slate-100 md:pr-5">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 tracking-wider">
              <Shield size={13} className="text-[#004183]" />
              <span>Por Posición</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(() => {
                const activeSquad = players.filter(p => p.isActive);
                const porteras = activeSquad.filter(p => p.position === 'Portero/a').length;
                const cierres = activeSquad.filter(p => p.position === 'Cierre').length;
                const alas = activeSquad.filter(p => p.position === 'Ala').length;
                const pivots = activeSquad.filter(p => p.position === 'Pívot').length;
                const universales = activeSquad.filter(p => p.position === 'Universal').length;
                
                return (
                  <>
                    <div className="flex items-center justify-between bg-rose-50/50 px-2.5 py-1.5 rounded-xl border border-rose-100/50">
                      <span className="text-rose-700 font-bold text-[11px]">Porteras</span>
                      <span className="bg-rose-100 text-rose-800 font-black px-1.5 py-0.5 rounded text-[10px]">{porteras}</span>
                    </div>
                    <div className="flex items-center justify-between bg-indigo-50/50 px-2.5 py-1.5 rounded-xl border border-indigo-100/50">
                      <span className="text-indigo-700 font-bold text-[11px]">Cierres</span>
                      <span className="bg-indigo-100 text-indigo-800 font-black px-1.5 py-0.5 rounded text-[10px]">{cierres}</span>
                    </div>
                    <div className="flex items-center justify-between bg-amber-50/50 px-2.5 py-1.5 rounded-xl border border-amber-100/50">
                      <span className="text-amber-700 font-bold text-[11px]">Alas</span>
                      <span className="bg-amber-100 text-amber-800 font-black px-1.5 py-0.5 rounded text-[10px]">{alas}</span>
                    </div>
                    <div className="flex items-center justify-between bg-emerald-50/50 px-2.5 py-1.5 rounded-xl border border-emerald-100/50">
                      <span className="text-emerald-700 font-bold text-[11px]">Pívots</span>
                      <span className="bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded text-[10px]">{pivots}</span>
                    </div>
                    {universales > 0 && (
                      <div className="flex items-center justify-between bg-purple-50/50 px-2.5 py-1.5 rounded-xl border border-purple-100/50 col-span-2">
                        <span className="text-purple-700 font-bold text-[11px]">Universales</span>
                        <span className="bg-purple-100 text-purple-800 font-black px-1.5 py-0.5 rounded text-[10px]">{universales}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* COLUMN 2: DOMINANT LEG */}
          <div className="flex flex-col space-y-2.5 border-r-0 md:border-r border-slate-100 md:px-5">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 tracking-wider">
              <Footprints size={13} className="text-amber-500" />
              <span>Pie Dominante</span>
            </div>
            {(() => {
              const activeSquad = players.filter(p => p.isActive);
              const diestra = activeSquad.filter(p => p.dominantLeg === 'Diestra' || !p.dominantLeg).length;
              const zurda = activeSquad.filter(p => p.dominantLeg === 'Zurda').length;
              const ambidiestra = activeSquad.filter(p => p.dominantLeg === 'Ambidiestra').length;
              const total = activeSquad.length;

              const pctDiestra = total > 0 ? Math.round((diestra / total) * 100) : 0;
              const pctZurda = total > 0 ? Math.round((zurda / total) * 100) : 0;
              const pctAmbi = total > 0 ? Math.round((ambidiestra / total) * 100) : 0;

              return (
                <div className="flex-1 flex flex-col justify-center space-y-2 bg-slate-50/40 p-2.5 rounded-2xl border border-slate-100">
                  {/* Diestra */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold text-slate-700">
                      <span>Diestras</span>
                      <span className="font-mono text-[10px]">{diestra} ({pctDiestra}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#004183] h-full rounded-full" style={{ width: `${pctDiestra}%` }} />
                    </div>
                  </div>
                  {/* Zurda */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold text-slate-700">
                      <span>Zurdas</span>
                      <span className="font-mono text-[10px]">{zurda} ({pctZurda}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pctZurda}%` }} />
                    </div>
                  </div>
                  {/* Ambidiestra */}
                  {ambidiestra > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold text-slate-700">
                        <span>Ambidiestras</span>
                        <span className="font-mono text-[10px]">{ambidiestra} ({pctAmbi}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pctAmbi}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* COLUMN 3: SQUAD AVERAGE AGE */}
          <div className="flex flex-col space-y-2.5 md:pl-5 justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 tracking-wider">
              <Calendar size={13} className="text-indigo-600" />
              <span>Media de Edad</span>
            </div>
            {(() => {
              const activeSquad = players.filter(p => p.isActive);
              const ages = activeSquad
                .map(p => {
                  if (!p.birthDate) return null;
                  const birth = new Date(p.birthDate);
                  const now = new Date();
                  if (isNaN(birth.getTime())) return null;
                  let age = now.getFullYear() - birth.getFullYear();
                  const m = now.getMonth() - birth.getMonth();
                  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
                    age--;
                  }
                  return age;
                })
                .filter((age): age is number => age !== null);

              const averageAge = ages.length > 0 
                ? (ages.reduce((sum, age) => sum + age, 0) / ages.length).toFixed(1)
                : null;
              
              const youngest = ages.length > 0 ? Math.min(...ages) : null;
              const oldest = ages.length > 0 ? Math.max(...ages) : null;

              return (
                <div className="flex-1 flex items-center justify-between gap-3 bg-[#004183]/5 p-3 rounded-2xl border border-[#004183]/10">
                  <div className="flex flex-col">
                    <span className="text-[28px] font-black text-[#004183] leading-none">
                      {averageAge ? `${averageAge}` : '--'}
                    </span>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide mt-1">
                      Años de promedio
                    </span>
                  </div>
                  {ages.length > 0 && (
                    <div className="flex flex-col text-[10px] font-bold text-slate-600 space-y-1 bg-white px-2.5 py-1.5 rounded-xl border border-slate-100 shadow-3xs">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-400 uppercase text-[8px] font-extrabold">Más Joven:</span>
                        <span className="font-mono text-[#004183]">{youngest} años</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-400 uppercase text-[8px] font-extrabold">Más Veterana:</span>
                        <span className="font-mono text-[#004183]">{oldest} años</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {filteredPlayers.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border shadow-sm">
          <Award size={48} className="mx-auto mb-3 text-slate-300 opacity-40 animate-pulse" />
          <p className="font-bold text-slate-600">Ningún/a jugador/a registrado/a coincide con tus filtros</p>
          <p className="text-xs text-slate-400 mt-1">Registra nuevos/as jugadores/as con el panel superior.</p>
        </div>
      ) : (
        <div className="space-y-8" id="player-grid-display">
          {(() => {
            const positions: (PositionType | 'Other')[] = ['Portero/a', 'Cierre', 'Ala', 'Pívot', 'Universal'];
            
            // Collect any legacy/unspecified positions just in case
            const hasOther = filteredPlayers.some(p => !['Portero/a', 'Cierre', 'Ala', 'Pívot', 'Universal'].includes(p.position));
            const activePositions = hasOther ? [...positions, 'Other' as const] : positions;

            return activePositions.map(pos => {
              const playersInPosition = pos === 'Other' 
                ? filteredPlayers.filter(p => !['Portero/a', 'Cierre', 'Ala', 'Pívot', 'Universal'].includes(p.position))
                : filteredPlayers.filter(p => p.position === pos);

              if (playersInPosition.length === 0) return null;

              // Sort players from left to right by their shirt/dorsal number numerically
              const sortedPlayers = [...playersInPosition].sort((a, b) => {
                const numA = parseInt(a.number, 10) || 0;
                const numB = parseInt(b.number, 10) || 0;
                return numA - numB;
              });

              const label = pos === 'Other' ? 'Otras Posiciones' : pos;
              const dotColorClass = 
                pos === 'Portero/a' ? 'bg-rose-500' :
                pos === 'Cierre' ? 'bg-indigo-500' :
                pos === 'Ala' ? 'bg-amber-500' :
                pos === 'Pívot' ? 'bg-emerald-500' :
                pos === 'Universal' ? 'bg-purple-500' :
                'bg-slate-450';

              return (
                <div key={pos} className="space-y-3 pt-2">
                  {/* Position Section Header */}
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <span className={`w-2.5 h-2.5 rounded-full ${dotColorClass} shrink-0`}></span>
                    <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      {label}
                      <span className="text-[10px] font-bold text-slate-450 font-mono">({sortedPlayers.length})</span>
                    </h4>
                  </div>

                  {/* Griilla de Jugadores de esta sección */}
                  <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                    {sortedPlayers.map(player => {
                      const isEditing = editingId === player.id;
                      const stats = getPlayerStats(player.id);

                      return (
                        <div 
                          key={player.id}
                          onClick={() => !isEditing && setSelectedPlayer(player)}
                          className={`bg-white rounded-3xl border p-4 transition duration-155 flex flex-col justify-between relative group ${
                            isEditing 
                              ? 'border-blue-900 shadow-md ring-1 ring-blue-900/10' 
                              : 'border-slate-100 hover:border-[#004183]/50 shadow-sm hover:shadow-md cursor-pointer hover:-translate-y-0.5'
                          }`}
                        >
                          {isEditing ? (
                            /* INLINE EDIT MODE FORM */
                            <div className="space-y-3 p-1" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                <span className="text-[10px] font-black text-[#004183] uppercase tracking-wider">Editar Ficha</span>
                                <span className="text-[10px] font-mono font-bold text-slate-400">ID: {player.id.substring(0,6)}</span>
                              </div>

                              <div className="space-y-2.5">
                                {/* Photo upload field for inline editing */}
                                <div className="flex flex-col items-center justify-center p-2.5 border border-slate-100 rounded-xl bg-slate-50/50">
                                  <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1 w-full text-center">
                                    Foto de Perfil (Touch/Drag)
                                  </label>
                                  <div
                                    onDragEnter={(e) => handleDrag(e, 'edit')}
                                    onDragOver={(e) => handleDrag(e, 'edit')}
                                    onDragLeave={(e) => handleDrag(e, 'edit')}
                                    onDrop={(e) => handleDrop(e, 'edit')}
                                    onClick={() => editFileInputRef.current?.click()}
                                    className={`w-16 h-16 rounded-full border-2 border-dashed flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group transition duration-150 ${
                                      editDragActive ? 'border-yellow-400 bg-yellow-50' : 'border-slate-300 bg-white hover:bg-slate-50'
                                    }`}
                                  >
                                    {editPhoto ? (
                                      <>
                                        <img referrerPolicy="no-referrer" src={editPhoto} alt="Review" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-blue-950/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                          <Camera size={14} className="text-[#FFD700]" />
                                        </div>
                                      </>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center p-1 text-center select-none">
                                        <Upload size={14} className="text-slate-400 mb-0.5 animate-pulse" />
                                        <span className="text-[7px] text-slate-400 leading-tight">Subir</span>
                                      </div>
                                    )}
                                    <input
                                      ref={editFileInputRef}
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => handleFileChange(e, 'edit')}
                                      className="hidden"
                                    />
                                  </div>
                                  {editPhoto && (
                                    <div className="flex flex-col items-center mt-1 w-full">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setEditPhoto(''); setEditRawPhoto(''); }}
                                        className="text-[8px] text-rose-500 hover:text-rose-600 font-bold underline cursor-pointer"
                                      >
                                        Quitar foto
                                      </button>

                                      {editRawPhoto && (
                                        <div className="mt-2.5 w-full bg-white p-2 rounded-lg border border-slate-200/70 space-y-2">
                                          <div className="flex items-center justify-between text-[7px] font-black text-[#004183] uppercase tracking-wider font-bold">
                                            <span>⚙️ Ajustar Centrado</span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditZoom(1.0);
                                                setEditOffsetY(0);
                                                setEditOffsetX(0);
                                              }}
                                              className="text-[6.5px] text-slate-400 hover:text-slate-600 font-bold uppercase underline"
                                            >
                                              Reset
                                            </button>
                                          </div>

                                          {/* ZOOM SLIDER */}
                                          <div className="space-y-0.5">
                                            <div className="flex justify-between items-center text-[6px] text-slate-500 font-bold uppercase">
                                              <span>Zoom:</span>
                                              <span className="font-mono text-[7px] font-bold text-[#004183]">{editZoom.toFixed(1)}x</span>
                                            </div>
                                            <input
                                              type="range"
                                              min="1.0"
                                              max="3.5"
                                              step="0.05"
                                              value={editZoom}
                                              onChange={(e) => setEditZoom(parseFloat(e.target.value))}
                                              className="w-full h-0.5 bg-slate-200 rounded appearance-none cursor-pointer accent-[#004183]"
                                            />
                                          </div>

                                          {/* VERTICAL OFFSET SLIDER */}
                                          <div className="space-y-0.5">
                                            <div className="flex justify-between items-center text-[6px] text-slate-500 font-bold uppercase">
                                              <span>Centrar Alto:</span>
                                              <span className="font-mono text-[7px] font-bold text-[#004183]">{editOffsetY}%</span>
                                            </div>
                                            <input
                                              type="range"
                                              min="-75"
                                              max="75"
                                              step="1"
                                              value={editOffsetY}
                                              onChange={(e) => setEditOffsetY(parseInt(e.target.value))}
                                              className="w-full h-0.5 bg-slate-200 rounded appearance-none cursor-pointer accent-[#004183]"
                                            />
                                          </div>

                                          {/* HORIZONTAL OFFSET SLIDER */}
                                          <div className="space-y-0.5">
                                            <div className="flex justify-between items-center text-[6px] text-slate-500 font-bold uppercase">
                                              <span>Centrar Ancho:</span>
                                              <span className="font-mono text-[7px] font-bold text-[#004183]">{editOffsetX}%</span>
                                            </div>
                                            <input
                                              type="range"
                                              min="-75"
                                              max="75"
                                              step="1"
                                              value={editOffsetX}
                                              onChange={(e) => setEditOffsetX(parseInt(e.target.value))}
                                              className="w-full h-0.5 bg-slate-200 rounded appearance-none cursor-pointer accent-[#004183]"
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Name */}
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-400">Nombre Completo</label>
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs w-full font-medium"
                                  />
                                </div>

                                {/* Alias */}
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-400">Nombre Deportivo/Alias</label>
                                  <input
                                    type="text"
                                    value={editAlias}
                                    onChange={e => setEditAlias(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs w-full font-bold text-[#004183]"
                                  />
                                </div>

                                {/* Number */}
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-400">Dorsal</label>
                                  <input
                                    type="number"
                                    value={editNumber}
                                    onChange={e => setEditNumber(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs w-full font-mono font-bold"
                                  />
                                </div>

                                {/* Birthdate */}
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-400">Fecha Nacimiento</label>
                                  <input
                                    type="date"
                                    value={editBirthDate}
                                    onChange={e => setEditBirthDate(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs w-full font-mono cursor-pointer"
                                  />
                                </div>

                                {/* Leg */}
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-400 flex items-center justify-between">
                                    <span>Pierna Dominante</span>
                                    {editDominantLeg && (
                                      <span className="inline-flex items-center">
                                        {renderDominantLegIcon(editDominantLeg as any, 12)}
                                      </span>
                                    )}
                                  </label>
                                  <select
                                    value={editDominantLeg}
                                    onChange={e => setEditDominantLeg(e.target.value as any)}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs w-full cursor-pointer font-semibold"
                                  >
                                    <option value="Diestra">Diestra</option>
                                    <option value="Zurda">Zurda</option>
                                    <option value="Ambidiestra">Ambidiestra</option>
                                  </select>
                                </div>

                                {/* Position */}
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-400">Posición Natural</label>
                                  <select
                                    value={editPosition}
                                    onChange={e => setEditPosition(e.target.value as PositionType)}
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs w-full cursor-pointer font-semibold mb-2"
                                  >
                                    <option value="Portero/a">Portero/a</option>
                                    <option value="Cierre">Cierre</option>
                                    <option value="Ala">Ala</option>
                                    <option value="Pívot">Pívot</option>
                                    <option value="Universal">Universal</option>
                                  </select>
                                </div>

                                {/* Sexo / Género */}
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-400">Sexo / Género</label>
                                  <div className="flex gap-2.5 mt-1">
                                    <button
                                      type="button"
                                      onClick={() => setEditGender('F')}
                                      className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg border text-[10px] font-black transition cursor-pointer ${
                                        editGender === 'F'
                                          ? 'bg-rose-50 border-rose-400 text-rose-700 ring-2 ring-rose-100'
                                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                      }`}
                                    >
                                      <span>Mujer ♀</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditGender('M')}
                                      className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg border text-[10px] font-black transition cursor-pointer ${
                                        editGender === 'M'
                                          ? 'bg-blue-50 border-blue-400 text-[#004183] ring-2 ring-blue-100'
                                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                      }`}
                                    >
                                      <span>Hombre ♂</span>
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {error && (
                                <p className="text-[9px] text-rose-500 font-bold bg-rose-50 p-1.5 rounded border border-rose-100">{error}</p>
                              )}

                              <div className="flex justify-end gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase cursor-pointer"
                                >
                                  X Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(player.id)}
                                  className="py-1 px-3.5 bg-[#004183] text-white rounded-lg text-[10px] font-bold uppercase cursor-pointer"
                                >
                                  ✓ Guardar
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* CARD MAIN RENDER */
                            <>
                              <div>
                                {/* Card Header stats thumbnail */}
                                <div className="flex items-center gap-2.5">
                                  <div className="relative w-12 h-12 select-none shrink-0 border border-slate-100 rounded-full">
                                    {player.photo ? (
                                      <img
                                        referrerPolicy="no-referrer"
                                        src={player.photo}
                                        alt={player.name}
                                        className="w-11 h-11 rounded-full object-cover border border-slate-100 group-hover:border-[#004183]/30 transition mx-auto mt-0.5"
                                      />
                                    ) : (
                                      <div className="w-11 h-11 rounded-full bg-[#004183] text-yellow-400 font-mono flex items-center justify-center font-black text-sm border-2 border-[#FFD700] uppercase select-none mx-auto mt-0.5">
                                        {player.name.substring(0, 2)}
                                      </div>
                                    )}
                                    <span className="absolute -bottom-1 -right-1 bg-[#FFD700] text-[#004183] font-mono text-[9px] font-black px-1.5 py-0.5 rounded-full border border-white leading-none shadow">
                                      #{player.number}
                                    </span>
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                      <h4 className="font-black text-slate-800 text-xs sm:text-sm group-hover:text-[#004183] transition truncate">
                                        {player.alias || player.name}
                                      </h4>
                                    </div>
                                    <p className="text-[10px] text-slate-400 truncate font-semibold">{player.name}</p>
                                  </div>
                                </div>

                                {/* Card Badges details */}
                                <div className="mt-3.5 flex items-center gap-1 w-full flex-nowrap overflow-x-auto select-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] shrink-0">
                                  <span className={`text-[7.5px] sm:text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${getPositionBadgeClass(player.position)}`}>
                                    {getPlayerPositionLabel(player.position, player.gender)}
                                  </span>
                                  
                                  <span className={`text-[7.5px] sm:text-[9px] font-bold px-1.2 py-0.5 rounded border shrink-0 ${player.gender === 'M' ? 'bg-blue-50/60 border-blue-100 text-blue-700' : 'bg-rose-50/60 border-rose-100 text-rose-750'}`}>
                                    {player.gender === 'M' ? '♂' : '♀'}
                                  </span>
                                  
                                  {player.dominantLeg && (
                                    <span className="bg-slate-50 border border-slate-200 text-slate-600 text-[7.5px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                                      {renderDominantLegIcon(player.dominantLeg, 9)}
                                      <span>{player.dominantLeg}</span>
                                    </span>
                                  )}

                                  {player.birthDate && (
                                    <span className="bg-blue-50/50 border border-blue-200 text-blue-800 text-[7.5px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">
                                      {calculateAge(player.birthDate)} años
                                    </span>
                                  )}
                                </div>

                                {/* Brief team record indicators inside card */}
                                <div className="mt-3 grid grid-cols-3 gap-1 bg-slate-50/80 p-1.5 border border-slate-100 rounded-xl text-center">
                                  <div>
                                    <span className="text-[7px] uppercase tracking-wider text-slate-400 block font-bold leading-none mb-0.5">Partidos</span>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-800 font-mono">{stats.matchesParticipated}</span>
                                  </div>
                                  <div>
                                    <span className="text-[7px] uppercase tracking-wider text-slate-400 block font-bold leading-none mb-0.5">Goles</span>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-emerald-600 font-mono">⚽{stats.goals}</span>
                                  </div>
                                  <div>
                                    <span className="text-[7px] uppercase tracking-wider text-slate-400 block font-bold leading-none mb-0.5">Minutos</span>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-indigo-900 font-mono">
                                      ⏱️{Math.round(stats.secondsPlayed / 60)}'
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Card Actions bottom bar */}
                              <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                                <span></span>
                                {confirmingDeleteId === player.id ? (
                                  <div className="flex gap-1.5 items-center bg-rose-50 px-2 py-1.5 rounded-xl border border-rose-100 shadow-sm animate-fade-in">
                                    <span className="text-[10px] text-rose-700 font-black tracking-wide mr-1.5">¿Dar de baja?</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onDeletePlayer(player.id);
                                        setConfirmingDeleteId(null);
                                      }}
                                      className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-[10px] uppercase px-2.5 py-1 rounded-lg transition cursor-pointer shadow-sm"
                                    >
                                      Sí
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmingDeleteId(null)}
                                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-[10px] uppercase px-2.5 py-1 rounded-lg transition cursor-pointer"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={(e) => handleStartEdit(e, player)}
                                      title="Editar Ficha"
                                      className="p-1.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-500 rounded-lg transition cursor-pointer"
                                    >
                                      <Edit2 size={11} />
                                    </button>
                                    <button
                                      onClick={() => setConfirmingDeleteId(player.id)}
                                      title="Dar de Baja"
                                      className="p-1.5 border border-rose-100 hover:border-rose-300 hover:bg-rose-50 text-rose-500 rounded-lg transition cursor-pointer"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* 5. VISTA DE PERFIL COMPLETO - PLAYER PROFILE BIG MODAL */}
      {selectedPlayer && (() => {
        const stats = getPlayerStats(selectedPlayer.id);
        const age = calculateAge(selectedPlayer.birthDate);
        const isGK = selectedPlayer.position === 'Portero/a';
        
        // Custom interactive visual performance breakdown for chart (Player Shots vs Goals)
        const playerChartData = [
          { name: 'Tiros Totales', cantidad: stats.shots, color: '#004183' },
          { name: 'Goles anotados', cantidad: stats.goals, color: '#10b981' }
        ];

        return (
          <div className="fixed inset-0 min-h-screen bg-slate-950/80 backdrop-blur-sm z-[9999] p-4 flex items-center justify-center animate-fade-in text-slate-800" id="player-profile-modal">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 flex flex-col relative max-h-[90vh] overflow-y-auto">
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 font-extrabold text-sm w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer select-none"
              >
                ✕
              </button>

              {/* Profile Header Brand */}
              <div className="text-center sm:text-left flex flex-col sm:flex-row items-center gap-4 border-b border-slate-100 pb-4 mb-5">
                <div className="relative w-22 h-22 shrink-0 select-none">
                  <div className="w-22 h-22 rounded-full overflow-hidden border-4 border-[#004183] bg-slate-100 shadow-md">
                    {selectedPlayer.photo ? (
                      <img referrerPolicy="no-referrer" src={selectedPlayer.photo} alt={selectedPlayer.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#004183] text-yellow-300 font-extrabold flex items-center justify-center text-2xl uppercase">
                        {selectedPlayer.name.substring(0,2)}
                      </div>
                    )}
                  </div>
                  <span className="absolute -bottom-1.5 -right-1.5 bg-[#FFD700] text-[#004183] font-mono leading-none border-2 border-white rounded-full w-7 h-7 flex items-center justify-center font-black text-[11px] shadow-md">
                    #{selectedPlayer.number}
                  </span>
                </div>
                <div className="text-center sm:text-left flex-1">
                  <span className="bg-[#004183]/10 text-[#004183] font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-full select-none">
                    FS TALAVERA FEMENINO
                  </span>
                  <h3 className="text-xl font-black text-slate-900 leading-tight mt-1">
                    {selectedPlayer.name}
                  </h3>
                  <p className="text-xs text-slate-450 mt-0.5">
                    Nombre Deportivo: <span className="font-extrabold text-[#004183]">{selectedPlayer.alias || selectedPlayer.name}</span>
                  </p>
                </div>
                
                {/* PDF EXPORT FOR THIS SINGLE PLAYER */}
                <div className="mt-3 sm:mt-0 select-none shrink-0">
                  <button
                    type="button"
                    onClick={() => exportPlayerDossierToPDF([selectedPlayer], matches || [])}
                    className="inline-flex items-center gap-1.5 bg-[#004183] hover:bg-blue-900 text-white font-extrabold px-3.5 py-2.5 rounded-xl text-[10px] uppercase tracking-wider transition border-b-2 border-yellow-400 shadow-sm cursor-pointer"
                  >
                    <FileText size={13} />
                    Ficha PDF
                  </button>
                </div>
              </div>

              {/* Grid content */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                
                {/* 1. Extended Ficha info card (Edad, Pierna, etc.) */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">
                    I. Datos Técnicos & Ficha Extendida
                  </h4>

                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-semibold">Posición Natural:</span>
                      <span className={`font-black uppercase text-[10px] border px-2 py-0.5 rounded ${getPositionBadgeClass(selectedPlayer.position)}`}>
                        {getPlayerPositionLabel(selectedPlayer.position, selectedPlayer.gender)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-semibold">Sexo / Género:</span>
                      <span className="text-slate-850 font-bold flex items-center gap-1 text-[11px]">
                        {selectedPlayer.gender === 'M' ? (
                          <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">Hombre ♂</span>
                        ) : (
                          <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">Mujer ♀</span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-semibold">Pierna Dominante:</span>
                      <span className="text-slate-800 font-bold flex items-center gap-1.5">
                        {renderDominantLegIcon(selectedPlayer.dominantLeg || 'Diestra', 14)}
                        <span>{selectedPlayer.dominantLeg || 'Diestra'}</span>
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-semibold">Fecha Nacimiento:</span>
                      <span className="text-slate-800 font-mono font-bold flex items-center gap-1">
                        <Calendar size={13} className="text-slate-450" /> {formatToSpanishDate(selectedPlayer.birthDate)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-semibold">Edad Actual:</span>
                      <span className="text-slate-800 font-bold bg-white border border-slate-200 rounded-md px-2 py-0.5 font-mono">
                        {age ? `${age} años` : '-'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-semibold">Número Camiseta:</span>
                      <span className="text-[#004183] font-black font-mono bg-[#FFD700]/20 px-2 py-0.5 rounded-full">
                        #{selectedPlayer.number}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Statistics Column (Requested order: Season Accumulation, Goalkeeper Performance, and Shots vs Goals) */}
                <div className="space-y-5">
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">
                      II. Estadísticas de Temporada
                    </h4>

                    {/* Season Accumulation Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Partidos Jugados</span>
                        <span className="text-lg font-black font-mono block mt-1 text-[#004183]">
                          {stats.matchesParticipated}
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tiempo en Pista</span>
                        <span className="text-lg font-black font-mono block mt-1 text-slate-800">
                          {formatTimePlayed(stats.secondsPlayed)}
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Goles Marcados</span>
                        <span className="text-lg font-black font-mono block mt-1 text-emerald-600">
                          ⚽ {stats.goals}
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tiros Realizados</span>
                        <span className="text-lg font-black font-mono block mt-1 text-amber-600">
                          🎯 {stats.shots}
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Efectividad %</span>
                        <span className="text-lg font-black font-mono block mt-1 text-slate-900">
                          {stats.shots > 0 ? `${Math.round((stats.goals / stats.shots) * 100)}%` : '0%'}
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sanciones</span>
                        <span className="text-xs font-bold font-mono block mt-1.5 text-slate-800">
                          🟨 {stats.yellows} &nbsp;&nbsp; 🔴 {stats.redCards}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* GK specific statistics */}
                  {isGK && (
                    <div className="bg-amber-55/35 border border-amber-200 rounded-2xl p-4 text-center">
                      <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block mb-2">
                        {`🧤 Rendimiento de ${selectedPlayer.gender === 'M' ? 'Portero' : 'Portera'}`}
                      </span>
                      <div className="flex justify-around">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Paradas</p>
                          <p className="text-base font-black text-[#004183] font-mono">{stats.saves}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Goles Recibidos</p>
                          <p className="text-base font-black text-rose-600 font-mono">
                            {stats.goalsConceded > 0 ? `-${stats.goalsConceded}` : '0'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* RECHARTS INDIVIDUAL PERFORMANCE VISUALIZER */}
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2">
                      III. Relación Tiros vs Goles
                    </h4>
                    <div className="h-28 bg-slate-50 border border-slate-100 p-2.5 rounded-2xl flex items-center justify-center">
                      {stats.shots === 0 ? (
                        <p className="text-[10px] text-slate-400">Ningún tiro realizado en esta temporada.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={playerChartData} layout="vertical" margin={{ top: 5, right: 10, left: 15, bottom: 5 }}>
                            <XAxis type="number" stroke="#94a3b8" fontSize={9} hide />
                            <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={9} tickLine={false} width={70} />
                            <Tooltip formatter={(value) => [value, 'Cantidad']} />
                            <Bar dataKey="cantidad" layout="vertical" radius={4}>
                              {playerChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Close footer button */}
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="mt-6 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-black rounded-2xl uppercase text-[11px] tracking-widest transition cursor-pointer"
              >
                Cerrar Perfil Detallado
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
