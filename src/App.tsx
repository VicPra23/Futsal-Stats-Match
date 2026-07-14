/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Play, History, Trophy, Users, ShieldAlert, Award, Calendar, Share2, Download, Upload, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';
import LZString from 'lz-string';
import { Player, Match, LiveMatchState } from './types';
import PlayerManager from './components/PlayerManager';
import LiveTracker from './components/LiveTracker';
import HistoryList from './components/HistoryList';
import StatsDashboard from './components/StatsDashboard';

const DEFAULT_PLAYERS: Player[] = [];

export default function App() {
  const [activeTab, setActiveTab] = useState<'live' | 'history' | 'stats' | 'players'>('live');

  // Roster Pool state
  const [players, setPlayers] = useState<Player[]>(() => {
    const saved = localStorage.getItem('futsal_players_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Automatic clean-up of squad players as requested:
          // 1. Remove/deactivate players with numbers "5", "7", "8"
          // 2. Resolve duplicate number "10" (keep Alba Flores, deactivate others)
          // 3. Resolve duplicate number "4" (keep the first active one, deactivate duplicates)
          const step1 = parsed.map((p: any) => {
            const updated = { ...p };
            const num = (updated.number || '').toString().trim();
            // Deactivate 5, 7, 8 natural numbers
            if (num === '5' || num === '7' || num === '8') {
              updated.isActive = false;
            }
            return updated;
          });

          let hasAlbaFlores10 = false;
          // Let's check first if Alba Flores exists and is active on number 10
          step1.forEach((p: any) => {
            const num = (p.number || '').toString().trim();
            const nameLower = (p.name || '').toLowerCase();
            if (num === '10' && (nameLower.includes('alba') || nameLower.includes('flores')) && p.isActive) {
              hasAlbaFlores10 = true;
            }
          });

          let seenActive10 = false;
          let seenActive4 = false;

          const finalSanitized = step1.map((p: any) => {
            if (!p.isActive) return p;

            const num = (p.number || '').toString().trim();
            const nameLower = (p.name || '').toLowerCase();

            // De-duplicate #10
            if (num === '10') {
              const isAlba = nameLower.includes('alba') || nameLower.includes('flores');
              if (isAlba) {
                seenActive10 = true;
                return p;
              } else {
                // If Alba Flores is in squad, deactivate any other player registered with #10
                if (hasAlbaFlores10) {
                  return { ...p, isActive: false };
                } else if (!seenActive10) {
                  // Fallback: keep the first 10 if there is no Alba Flores
                  seenActive10 = true;
                  return p;
                } else {
                  return { ...p, isActive: false };
                }
              }
            }

            // De-duplicate #4
            if (num === '4') {
              if (!seenActive4) {
                seenActive4 = true;
                return p;
              } else {
                return { ...p, isActive: false };
              }
            }

            return p;
          });

          return finalSanitized;
        }
      } catch (e) {
        console.error('Failed to parse players pool, resetting to defaults.', e);
      }
    }
    return DEFAULT_PLAYERS;
  });

  // Historical Matches state
  const [matches, setMatches] = useState<Match[]>(() => {
    const saved = localStorage.getItem('futsal_matches_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((m: any) => ({
            ...m,
            shotsEvents: m.shotsEvents || [],
            titulares: m.titulares || [],
            suplentes: m.suplentes || [],
            rivalColor: m.rivalColor || '#dc2626',
            talaveraKit: m.talaveraKit || '1ª Equipación',
            localFouls1stHalf: m.localFouls1stHalf ?? 0,
            rivalFouls1stHalf: m.rivalFouls1stHalf ?? 0,
            localFouls2ndHalf: m.localFouls2ndHalf ?? 0,
            rivalFouls2ndHalf: m.rivalFouls2ndHalf ?? 0,
          }));
        }
      } catch (e) {
        console.error('Failed to parse matches history.', e);
      }
    }
    return [];
  });

  // Current Live Draft state
  const [liveDraft, setLiveDraft] = useState<LiveMatchState | null>(() => {
    const saved = localStorage.getItem('futsal_live_draft_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load live draft.', e);
      }
    }
    return null;
  });

  // Synchronize Roster state to localStorage
  useEffect(() => {
    localStorage.setItem('futsal_players_v1', JSON.stringify(players));
  }, [players]);

  // Helper to optimize base64 images to small JPEGs
  const compressBase64Image = (base64Str: string, size: number, quality: number): Promise<string> => {
    return new Promise((resolve) => {
      if (!base64Str || !base64Str.startsWith('data:image/')) {
        resolve(base64Str);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = size;
            canvas.height = size;
            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
            const compressed = canvas.toDataURL('image/jpeg', quality);
            resolve(compressed);
          } else {
            resolve(base64Str);
          }
        } catch (err) {
          console.error('Error compressing image:', err);
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        resolve(base64Str);
      };
      img.src = base64Str;
    });
  };

  // Automatically optimize legacy high-resolution base64 images down to ultra-compact photos
  useEffect(() => {
    if (players.length === 0) return;
    
    const needsOptimization = players.some(p => p.photo && p.photo.length > 25000);
    if (!needsOptimization) return;

    const optimizeAll = async () => {
      const updatedPlayers = await Promise.all(
        players.map(async (p) => {
          if (p.photo && p.photo.length > 25000) {
            // High-resolution camera photo imported, optimize to standard high-clarity 180px
            const compressed = await compressBase64Image(p.photo, 180, 0.82);
            return { ...p, photo: compressed };
          }
          return p;
        })
      );
      
      // Prevent infinite loop if nothing actually changed
      const hasChanges = updatedPlayers.some((p, i) => p.photo !== players[i].photo);
      if (hasChanges) {
        setPlayers(updatedPlayers);
      }
    };

    optimizeAll();
  }, [players]);

  // Synchronize Matches state to localStorage
  useEffect(() => {
    localStorage.setItem('futsal_matches_v1', JSON.stringify(matches));
  }, [matches]);

  // --- BUSINESS CALLBACKS ---

  // Squad manipulation
  const handleAddPlayer = useCallback((newPlayer: Omit<Player, 'id' | 'isActive'>) => {
    const player: Player = {
      ...newPlayer,
      id: `p-${Date.now()}`,
      isActive: true
    };
    setPlayers(prev => [...prev, player]);
  }, []);

  const handleEditPlayer = useCallback((updatedPlayer: Player) => {
    setPlayers(prev => prev.map(p => p.id === updatedPlayer.id ? updatedPlayer : p));
  }, []);

  const handleDeletePlayer = useCallback((id: string) => {
    // Soft remove players to preserve history records, or update state
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, isActive: false } : p));
  }, []);

  // Archive & Save live match
  const handleSaveMatch = useCallback((newMatch: Omit<Match, 'id'>) => {
    const match: Match = {
      ...newMatch,
      id: `m-${Date.now()}`
    };
    setMatches(prev => [...prev, match]);
    setLiveDraft(null);
    localStorage.removeItem('futsal_live_draft_v1');
    
    // Auto navigate to Jornadas to review the summary
    setActiveTab('history');
  }, []);

  // Delete a match entirely
  const handleDeleteMatch = useCallback((id: string) => {
    setMatches(prev => prev.filter(m => m.id !== id));
  }, []);

  // Update match comment
  const handleUpdateMatchComment = useCallback((id: string, comment: string) => {
    setMatches(prev =>
      prev.map(m => (m.id === id ? { ...m, comment } : m))
    );
  }, []);

  // Auto-backup live match in progress
  const handleSaveLiveDraft = useCallback((state: LiveMatchState) => {
    setLiveDraft(state);
    localStorage.setItem('futsal_live_draft_v1', JSON.stringify(state));
  }, []);

  // --- SYNCHRONIZATION AND SHARE LOGIC ---
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    players?: Player[];
    matches?: Match[];
    liveDraft?: LiveMatchState | null;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [importType, setImportType] = useState<'merge' | 'replace'>('merge');
  const [syncTab, setSyncTab] = useState<'qr' | 'code' | 'json'>('qr');
  const [shareExcludePhotos, setShareExcludePhotos] = useState<boolean>(false);
  const [shareExcludeMatches, setShareExcludeMatches] = useState<boolean>(false);
  const [shareExcludeLive, setShareExcludeLive] = useState<boolean>(false);

  // Safe unicode base64 helper functions
  const utf8_to_b64 = (str: string) => {
    try {
      return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode(parseInt(p1, 16));
      }));
    } catch (e) {
      console.error('Base64 encoding error', e);
      return '';
    }
  };

  const b64_to_utf8 = (str: string) => {
    try {
      return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (e) {
      console.error('Base64 decoding error', e);
      return '';
    }
  };

  const getPackageData = (options: { excludePhotos?: boolean; excludeMatches?: boolean; excludeLive?: boolean } = {}) => {
    let finalPlayers = players || [];
    if (options.excludePhotos) {
      finalPlayers = finalPlayers.map(p => ({
        ...p,
        photo: ''
      }));
    }
    return {
      players: finalPlayers,
      matches: options.excludeMatches ? [] : (matches || []),
      liveDraft: options.excludeLive ? null : (liveDraft || null)
    };
  };

  const generateShareUrl = (options: { excludePhotos?: boolean; excludeMatches?: boolean; excludeLive?: boolean } = {}) => {
    const dataStr = JSON.stringify(getPackageData(options));
    try {
      const compressed = LZString.compressToEncodedURIComponent(dataStr);
      const origin = window.location.origin + window.location.pathname;
      return `${origin}?import=lz:${compressed}`;
    } catch (e) {
      console.error('Error compressing with LZString, falling back to base64', e);
      const encodedData = utf8_to_b64(dataStr);
      const origin = window.location.origin + window.location.pathname;
      return `${origin}?import=${encodeURIComponent(encodedData)}`;
    }
  };

  const getShareString = (options: { excludePhotos?: boolean; excludeMatches?: boolean; excludeLive?: boolean } = {}) => {
    const dataStr = JSON.stringify(getPackageData(options));
    try {
      const compressed = LZString.compressToEncodedURIComponent(dataStr);
      return 'lz:' + compressed;
    } catch (e) {
      console.error('Error compressing code, using base64 fallback', e);
      return utf8_to_b64(dataStr);
    }
  };

  const decodeImportString = (input: string): string => {
    const trimmed = input.trim();
    if (trimmed.startsWith('lz:')) {
      try {
        const decompressed = LZString.decompressFromEncodedURIComponent(trimmed.slice(3));
        if (decompressed) return decompressed;
      } catch (e) {
        console.error('LZString decompression error', e);
      }
    }
    return b64_to_utf8(trimmed);
  };

  const [qrUrl, setQrUrl] = useState<string>('');
  const [qrError, setQrError] = useState<string>('');
  const [qrWarning, setQrWarning] = useState<string>('');

  useEffect(() => {
    if (showSyncModal && syncTab === 'qr') {
      const tryGenerate = (exPhotos: boolean, exMatches: boolean, exLive: boolean) => {
        try {
          const shareUrl = generateShareUrl({
            excludePhotos: exPhotos,
            excludeMatches: exMatches,
            excludeLive: exLive
          });
          QRCode.toDataURL(shareUrl, { errorCorrectionLevel: 'L', margin: 2, width: 250 }, (err, url) => {
            if (err) {
              if (!exPhotos) {
                setShareExcludePhotos(true);
                tryGenerate(true, exMatches, exLive);
              } else if (!exMatches) {
                setShareExcludeMatches(true);
                tryGenerate(true, true, exLive);
              } else if (!exLive) {
                setShareExcludeLive(true);
                tryGenerate(true, true, true);
              } else {
                console.log('QR Limit Notice:', err.message || err);
                setQrError('Los datos seleccionados son demasiado grandes para crear un código QR. Por favor, utiliza la pestaña "Código" o "Backup JSON" para sincronizar.');
                setQrUrl('');
                setQrWarning('');
              }
            } else {
              setQrUrl(url);
              setQrError('');
              if (exPhotos && exMatches) {
                setQrWarning('Código QR súper optimizado. Se han omitido fotos e historial de encuentros de forma automática para ajustar la capacidad del QR.');
              } else if (exPhotos) {
                setQrWarning('Código QR optimizado. Se han omitido las fotos de las jugadoras automáticamente para reducir el tamaño.');
              } else {
                setQrWarning('Código QR completo generado con éxito.');
              }
            }
          });
        } catch (e: any) {
          console.log('QR Catch Notice:', e.message || e);
          if (!exPhotos) {
            setShareExcludePhotos(true);
            tryGenerate(true, exMatches, exLive);
          } else if (!exMatches) {
            setShareExcludeMatches(true);
            tryGenerate(true, true, exLive);
          } else {
            setQrError('Error al generar el código QR con las opciones seleccionadas.');
            setQrUrl('');
            setQrWarning('');
          }
        }
      };

      tryGenerate(shareExcludePhotos, shareExcludeMatches, shareExcludeLive);
    }
  }, [showSyncModal, syncTab, players, matches, liveDraft, shareExcludePhotos, shareExcludeMatches, shareExcludeLive]);

  const exportToJsonFile = () => {
    const dataStr = JSON.stringify(getPackageData(), null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fs_talavera_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed && (parsed.players || parsed.matches)) {
          setPendingImport(parsed);
          setShowImportModal(true);
          setShowSyncModal(false);
        } else {
          alert('El archivo no contiene un formato de datos de FS Talavera válido.');
        }
      } catch (err) {
        alert('Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleManualImport = () => {
    if (!manualCode.trim()) return;
    try {
      const decodedStr = decodeImportString(manualCode.trim());
      const parsed = JSON.parse(decodedStr);
      if (parsed && (parsed.players || parsed.matches)) {
        setPendingImport(parsed);
        setShowImportModal(true);
        setShowSyncModal(false);
        setManualCode('');
      } else {
        alert('El código ingresado no contiene datos válidos.');
      }
    } catch (e) {
      alert('Código de sincronización inválido o corrupto.');
    }
  };

  const executeImport = () => {
    if (!pendingImport) return;

    if (importType === 'replace') {
      if (pendingImport.players) setPlayers(pendingImport.players);
      if (pendingImport.matches) setMatches(pendingImport.matches);
      if (pendingImport.liveDraft !== undefined) {
        setLiveDraft(pendingImport.liveDraft);
        if (pendingImport.liveDraft) {
          localStorage.setItem('futsal_live_draft_v1', JSON.stringify(pendingImport.liveDraft));
        } else {
          localStorage.removeItem('futsal_live_draft_v1');
        }
      }
    } else {
      // Merge
      if (pendingImport.players) {
        setPlayers(prev => {
          const merged = [...(prev || [])];
          pendingImport.players!.forEach(newP => {
            const exists = merged.find(p => p.id === newP.id || (p.name.toLowerCase() === newP.name.toLowerCase() && p.number === newP.number));
            if (!exists) {
              merged.push(newP);
            }
          });
          return merged;
        });
      }

      if (pendingImport.matches) {
        setMatches(prev => {
          const merged = [...(prev || [])];
          pendingImport.matches!.forEach(newM => {
            const exists = merged.find(m => m.id === newM.id);
            if (!exists) {
              merged.push(newM);
            }
          });
          return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });
      }

      if (pendingImport.liveDraft && !liveDraft) {
        setLiveDraft(pendingImport.liveDraft);
        localStorage.setItem('futsal_live_draft_v1', JSON.stringify(pendingImport.liveDraft));
      }
    }

    setPendingImport(null);
    setShowImportModal(false);
    alert('¡Sincronización completada con éxito!');
  };

  // URL query payload import on startup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const importParam = params.get('import');
    if (importParam) {
      try {
        const decodedStr = decodeImportString(importParam);
        const parsed = JSON.parse(decodedStr);
        if (parsed && (parsed.players || parsed.matches)) {
          setPendingImport(parsed);
          setShowImportModal(true);
        }
      } catch (err) {
        console.error('URL query parameter parsing error', err);
      }
      // Remove query param from browser navigation bar
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  return (
    <div className="h-screen max-h-screen bg-slate-50 flex flex-col font-sans selection:bg-[#004183] selection:text-white overflow-hidden" id="main-app-container">
      {/* HEADER SECTION WITH SPORTS BRANDING - FS TALAVERA COOPERATIVE */}
      <header className="bg-[#004183] text-white shadow-md relative overflow-hidden shrink-0" id="header-brand">
        {/* Gold Accent top bar strip */}
        <div className="absolute top-0 left-0 w-full h-1 bg-[#FFD700]"></div>
        
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            {/* Club Shield Emblem Visual representation wrapper */}
            <div className="relative w-8 h-8 bg-white rounded-full border border-[#FFD700] flex items-center justify-center shadow-xs shrink-0 p-0.5">
              <img
                referrerPolicy="no-referrer"
                src="./logo.png"
                alt="FS Talavera Femenino"
                className="w-full h-full object-contain"
              />
            </div>

            <div>
              <h1 className="text-sm md:text-base font-black tracking-tight text-white">
                FS TALAVERA <span className="text-[#FFD700]">STATS MANAGER</span>
              </h1>
            </div>
          </div>

          {/* Sync Button on the Right */}
          <button
            onClick={() => setShowSyncModal(true)}
            className="bg-[#003163] hover:bg-blue-800 text-white border border-blue-700/50 hover:border-blue-600 transition duration-150 rounded-lg px-2.5 py-1 flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
            title="Sincronizar y compartir datos"
          >
            <Share2 size={13} className="text-[#FFD700] shrink-0" />
            <span className="text-[10.5px] font-black uppercase tracking-wider">Sincronizar</span>
          </button>
        </div>
      </header>

      {/* CORE FRAME LAYOUT CONTENT */}
      <main className="flex-1 overflow-y-auto pb-24" id="main-render-slot">
        {activeTab === 'live' && (
          <LiveTracker
            players={players}
            onSaveMatch={handleSaveMatch}
            initialLiveState={liveDraft}
            onSaveLiveDraft={handleSaveLiveDraft}
          />
        )}

        {activeTab === 'history' && (
          <HistoryList
            matches={matches}
            players={players}
            onDeleteMatch={handleDeleteMatch}
            onUpdateMatchComment={handleUpdateMatchComment}
          />
        )}

        {activeTab === 'stats' && (
          <StatsDashboard
            matches={matches}
            players={players}
          />
        )}

        {activeTab === 'players' && (
          <PlayerManager
            players={players}
            matches={matches}
            onAddPlayer={handleAddPlayer}
            onEditPlayer={handleEditPlayer}
            onDeletePlayer={handleDeletePlayer}
          />
        )}
      </main>

      {/* BOTTOM FLOATING TACTILE COUCH NAVIGATION (MOBILE INTEGRATED) */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-4 py-2 z-50 shrink-0"
        id="couch-main-nav"
      >
        <div className="max-w-md mx-auto flex items-center justify-between">
          {/* TAB LIVE */}
          <button
            onClick={() => setActiveTab('live')}
            id="tab-btn-live"
            className={`flex flex-col items-center flex-1 py-1.5 rounded-xl transition duration-100 cursor-pointer ${
              activeTab === 'live' ? 'text-blue-900 font-extrabold bg-blue-50/50' : 'text-slate-400 hover:text-slate-600 font-medium'
            }`}
          >
            <div className="relative">
              <Play size={20} className={activeTab === 'live' ? 'fill-blue-900 text-blue-900' : ''} />
              {liveDraft && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-500 border border-white rounded-full"></span>
              )}
            </div>
            <span className="text-[10px] mt-1 uppercase tracking-wider">LIVE Tracker</span>
          </button>

          {/* TAB JORNADAS */}
          <button
            onClick={() => setActiveTab('history')}
            id="tab-btn-history"
            className={`flex flex-col items-center flex-1 py-1.5 rounded-xl transition duration-100 cursor-pointer ${
              activeTab === 'history' ? 'text-blue-900 font-extrabold bg-blue-50/50' : 'text-slate-400 hover:text-slate-600 font-medium'
            }`}
          >
            <History size={20} />
            <span className="text-[10px] mt-1 uppercase tracking-wider">Jornadas</span>
          </button>

          {/* TAB TEMPORADA PANEL */}
          <button
            onClick={() => setActiveTab('stats')}
            id="tab-btn-stats"
            className={`flex flex-col items-center flex-1 py-1.5 rounded-xl transition duration-100 cursor-pointer ${
              activeTab === 'stats' ? 'text-blue-900 font-extrabold bg-blue-50/50' : 'text-slate-400 hover:text-slate-600 font-medium'
            }`}
          >
            <Trophy size={20} />
            <span className="text-[10px] mt-1 uppercase tracking-wider">Temporada</span>
          </button>

          {/* TAB PLANTILLA MANAGEMENT */}
          <button
            onClick={() => setActiveTab('players')}
            id="tab-btn-players"
            className={`flex flex-col items-center flex-1 py-1.5 rounded-xl transition duration-100 cursor-pointer ${
              activeTab === 'players' ? 'text-blue-900 font-extrabold bg-blue-50/50' : 'text-slate-400 hover:text-slate-600 font-medium'
            }`}
          >
            <Users size={20} />
            <span className="text-[10px] mt-1 uppercase tracking-wider">PLANTILLA</span>
          </button>
        </div>
      </nav>

      {/* MODAL SYNC: SINCRONIZAR Y COMPARTIR */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] p-4 flex items-center justify-center animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 flex flex-col gap-4 text-slate-800 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowSyncModal(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 bg-slate-50 w-7 h-7 rounded-full border border-slate-200/50 flex items-center justify-center shadow-xs cursor-pointer select-none text-xs font-black"
            >
              ✕
            </button>

            <div className="text-center pb-2 border-b border-slate-100">
              <span className="bg-blue-100 text-blue-900 font-extrabold text-[9px] uppercase px-2 py-0.5 rounded-md tracking-wider">
                Sincronización Total
              </span>
              <h3 className="font-black text-slate-900 text-base mt-1 uppercase font-display">
                Compartir Datos Futsal
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                Transfiere tu plantilla, histórico de partidos y directo a otros dispositivos sin perder nada.
              </p>
            </div>

            {/* TAB SELECTORS */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-[10px] font-black uppercase text-center shrink-0">
              <button
                onClick={() => setSyncTab('qr')}
                className={`py-1.5 rounded-lg cursor-pointer transition ${syncTab === 'qr' ? 'bg-white shadow-xs text-[#004183]' : 'text-slate-500 hover:text-slate-800'}`}
              >
                1. QR / Link
              </button>
              <button
                onClick={() => setSyncTab('code')}
                className={`py-1.5 rounded-lg cursor-pointer transition ${syncTab === 'code' ? 'bg-white shadow-xs text-[#004183]' : 'text-slate-500 hover:text-slate-800'}`}
              >
                2. Código
              </button>
              <button
                onClick={() => setSyncTab('json')}
                className={`py-1.5 rounded-lg cursor-pointer transition ${syncTab === 'json' ? 'bg-white shadow-xs text-[#004183]' : 'text-slate-500 hover:text-slate-800'}`}
              >
                3. Backup JSON
              </button>
            </div>

            {/* CONFIGURACIÓN Y OPTIMIZACIÓN DE TAMAÑO PARA MENSAJERÍA */}
            <div className="bg-slate-50 border border-slate-200/70 p-2.5 rounded-2xl flex flex-col gap-2 text-[10px] text-left">
              <span className="font-extrabold text-[#004183] uppercase tracking-wider flex items-center gap-1">
                ⚙️ Optimizar para WhatsApp / Mensajería
              </span>
              
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={shareExcludePhotos}
                    onChange={(e) => setShareExcludePhotos(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#004183] focus:ring-[#004183] h-3.5 w-3.5"
                  />
                  <div>
                    <p className="font-bold text-slate-800">Omitir fotos de jugadoras <span className="text-green-600 font-black">(Recomendado ⭐)</span></p>
                    <p className="text-[8.5px] text-slate-400 leading-tight font-medium">Las fotos base64 pesan mucho. Al quitarlas, el enlace se reduce un 98%.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={shareExcludeMatches}
                    onChange={(e) => setShareExcludeMatches(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#004183] focus:ring-[#004183] h-3.5 w-3.5"
                  />
                  <div>
                    <p className="font-bold text-slate-800">Omitir historial de partidos</p>
                    <p className="text-[8.5px] text-slate-400 leading-tight font-medium">Comparte solo la lista de jugadoras y el directo activo.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={shareExcludeLive}
                    onChange={(e) => setShareExcludeLive(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#004183] focus:ring-[#004183] h-3.5 w-3.5"
                  />
                  <div>
                    <p className="font-bold text-slate-800">Omitir partido en directo</p>
                    <p className="text-[8.5px] text-slate-400 leading-tight font-medium">No transfiere el partido en curso.</p>
                  </div>
                </label>
              </div>

              {/* Character counting indicator */}
              <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center text-[9px] font-mono">
                <span className="text-slate-500 font-bold uppercase">Longitud Enlace:</span>
                {(() => {
                  const shareStr = getShareString({
                    excludePhotos: shareExcludePhotos,
                    excludeMatches: shareExcludeMatches,
                    excludeLive: shareExcludeLive
                  });
                  const isUltraShort = shareStr.length < 2000;
                  const isShort = shareStr.length >= 2000 && shareStr.length < 8000;
                  return (
                    <span className={`font-bold uppercase ${isUltraShort ? 'text-green-600 font-bold' : isShort ? 'text-amber-600' : 'text-rose-600 animate-pulse'}`}>
                      {shareStr.length} chars ({isUltraShort ? 'Excelente WhatsApp ✅' : isShort ? 'Aceptable ⚠️' : 'Muy Largo ❌'})
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* TAB 1: QR & LINK */}
            {syncTab === 'qr' && (
              <div className="flex flex-col items-center gap-3 animate-fade-in">
                {qrError ? (
                  <div className="bg-red-50 text-red-700 text-[11px] p-3 rounded-xl border border-red-200 text-center font-medium max-w-[260px] leading-relaxed">
                    {qrError}
                  </div>
                ) : qrUrl ? (
                  <div className="bg-white p-2 border border-slate-200 rounded-2xl shadow-xs shrink-0 flex items-center justify-center">
                    <img
                      referrerPolicy="no-referrer"
                      src={qrUrl}
                      alt="Sincronizar QR"
                      className="w-32 h-32 md:w-36 md:h-36 object-contain animate-fade-in"
                    />
                  </div>
                ) : (
                  <div className="w-32 h-32 md:w-36 md:h-36 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-2xl shadow-xs shrink-0">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-[#004183] animate-pulse">Generando QR...</div>
                  </div>
                )}
                {qrWarning && !qrError && (
                  <div className="bg-amber-50 text-amber-800 text-[9.5px] p-2 rounded-xl border border-amber-200 text-center font-semibold max-w-[260px] leading-relaxed">
                    {qrWarning}
                  </div>
                )}
                <div className="text-center">
                  <p className="text-[10.5px] text-slate-500 leading-tight">
                    {qrError ? 'Prueba la sincronización manual' : 'Escanea este código QR con la cámara de otro dispositivo o copia el enlace optimizado.'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generateShareUrl({
                      excludePhotos: shareExcludePhotos,
                      excludeMatches: shareExcludeMatches,
                      excludeLive: shareExcludeLive
                    }));
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="bg-[#004183] hover:bg-blue-900 text-white font-extrabold px-3 py-2 rounded-xl text-xs uppercase tracking-wide transition cursor-pointer flex items-center justify-center gap-1.5 w-full shadow-md shadow-blue-900/15"
                >
                  {copiedLink ? <Check size={12} className="text-green-300" /> : <Share2 size={12} className="text-yellow-400" />}
                  {copiedLink ? '¡Enlace Copiado!' : 'Copiar Enlace Optimizado'}
                </button>
              </div>
            )}

            {/* TAB 2: MANUAL TEXT CODE */}
            {syncTab === 'code' && (
              <div className="flex flex-col gap-3 animate-fade-in text-[10.5px]">
                <div className="flex flex-col gap-1">
                  <label className="font-extrabold uppercase text-slate-500 text-[9px] text-left">Tu Código de Sincronización:</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={getShareString({
                        excludePhotos: shareExcludePhotos,
                        excludeMatches: shareExcludeMatches,
                        excludeLive: shareExcludeLive
                      })}
                      className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[9px] truncate text-slate-600 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(getShareString({
                          excludePhotos: shareExcludePhotos,
                          excludeMatches: shareExcludeMatches,
                          excludeLive: shareExcludeLive
                        }));
                        alert('¡Código copiado al portapapeles!');
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl border border-slate-200 cursor-pointer flex items-center justify-center shrink-0"
                      title="Copiar Código"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 flex flex-col gap-1.5">
                  <label className="font-extrabold uppercase text-slate-500 text-[9px] text-left">Importar desde otro dispositivo:</label>
                  <textarea
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Pega el código de sincronización que copiaste para sincronizar..."
                    className="w-full h-16 p-2 text-[9px] bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 resize-none"
                  />
                  <button
                    onClick={handleManualImport}
                    disabled={!manualCode.trim()}
                    className="bg-[#004183] hover:bg-blue-900 text-white font-extrabold px-3 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Importar Código
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: BACKUP FILE JSON */}
            {syncTab === 'json' && (
              <div className="flex flex-col gap-3.5 animate-fade-in">
                <div className="flex flex-col gap-1.5">
                  <div className="text-center font-bold text-slate-500 text-[10px] uppercase">Exportar (Backup)</div>
                  <button
                    onClick={exportToJsonFile}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-wide transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10"
                  >
                    <Download size={13} /> Descargar .json
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-3 flex flex-col gap-1.5">
                  <div className="text-center font-bold text-slate-500 text-[10px] uppercase">Importar Backup</div>
                  <div className="border border-dashed border-slate-200 hover:border-[#004183]/50 rounded-xl p-3 text-center cursor-pointer transition relative bg-slate-50/50">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Upload size={18} className="text-slate-400 mx-auto mb-1" />
                    <p className="text-[10.5px] font-black text-[#004183] uppercase tracking-wide">Seleccionar archivo</p>
                    <p className="text-[8.5px] text-slate-400 mt-0.5">Arrastra o haz clic para subir tu copia .json</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL IMPORT CONFIRM WIZARD */}
      {showImportModal && pendingImport && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[10000] p-4 flex items-center justify-center animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 flex flex-col gap-4 text-slate-800 text-center">
            <div className="w-12 h-12 bg-blue-50 text-[#004183] rounded-full border border-blue-100 flex items-center justify-center mx-auto shadow-xs">
              <Share2 size={20} className="text-[#004183] animate-pulse" />
            </div>

            <div>
              <h3 className="font-black text-slate-900 text-base uppercase font-display">
                Sincronizar Datos Incorporados
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Se detectaron datos de compartición de otra sesión del Stats Manager.
              </p>
            </div>

            {/* Resume detail block */}
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 border border-slate-200 rounded-xl text-[10.5px] text-left">
              <div className="flex flex-col">
                <span className="text-slate-400 text-[9px] font-extrabold uppercase leading-none">Plantilla</span>
                <span className="font-black text-slate-800 mt-0.5">
                  {pendingImport.players?.length || 0} jugadoras
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-slate-400 text-[9px] font-extrabold uppercase leading-none">Partidos</span>
                <span className="font-black text-slate-800 mt-0.5">
                  {pendingImport.matches?.length || 0} registrados
                </span>
              </div>
              <div className="flex flex-col col-span-2 border-t border-slate-200 pt-1.5 mt-0.5">
                <span className="text-slate-400 text-[9px] font-extrabold uppercase leading-none">Partido Activo (Directo)</span>
                <span className="font-black text-slate-800 mt-0.5">
                  {pendingImport.liveDraft ? `Sí (${pendingImport.liveDraft.rival})` : 'No'}
                </span>
              </div>
            </div>

            {/* Radio / Choice list */}
            <div className="flex flex-col gap-2 text-[10.5px]">
              <button
                type="button"
                onClick={() => setImportType('merge')}
                className={`p-2.5 rounded-xl border text-left transition flex items-center gap-1.5 cursor-pointer ${
                  importType === 'merge'
                    ? 'border-[#004183] bg-blue-50/40 text-blue-950 font-black'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${importType === 'merge' ? 'border-[#004183] text-[#004183]' : 'border-slate-300'}`}>
                  {importType === 'merge' && <div className="w-1.5 h-1.5 bg-[#004183] rounded-full" />}
                </div>
                <div>
                  <p className="font-black">Combinar Datos (Recomendado) 🤝</p>
                  <p className="text-[9px] text-slate-500 font-medium">Agrega elementos sin sobrescribir o borrar lo tuyo.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setImportType('replace')}
                className={`p-2.5 rounded-xl border text-left transition flex items-center gap-1.5 cursor-pointer ${
                  importType === 'replace'
                    ? 'border-rose-500 bg-rose-50/40 text-rose-950 font-black'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${importType === 'replace' ? 'border-rose-500 text-rose-500' : 'border-slate-300'}`}>
                  {importType === 'replace' && <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />}
                </div>
                <div>
                  <p className="font-black">Sustituir Todo (⚠️ Peligro)</p>
                  <p className="text-[9px] text-slate-500 font-medium">Reemplaza completamente tus datos locales por los cargados.</p>
                </div>
              </button>
            </div>

            {/* Import Dialog actions */}
            <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] font-black uppercase tracking-wider">
              <button
                type="button"
                onClick={() => {
                  setPendingImport(null);
                  setShowImportModal(false);
                }}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeImport}
                className={`py-2 px-3 rounded-xl cursor-pointer text-white shadow-md ${
                  importType === 'replace' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/10' : 'bg-[#004183] hover:bg-blue-900 shadow-blue-900/10'
                }`}
              >
                Sincronizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
