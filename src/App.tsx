/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, History, Trophy, Users, ShieldAlert, Award, Calendar, Share2, Download, Upload, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';
import LZString from 'lz-string';
import {
  Player,
  Match,
  LiveMatchState,
  Team,
  Season,
  DEFAULT_TEAM_ID,
  DEFAULT_SEASON_ID,
} from './types';
import PlayerManager from './components/PlayerManager';
import LiveTracker from './components/LiveTracker';
import HistoryList from './components/HistoryList';
import StatsDashboard from './components/StatsDashboard';
import TeamManagementPanel, { ParsedExcelPlayerRow } from './components/TeamManagementPanel';
import ReloadPrompt from './components/ReloadPrompt';

const DEFAULT_PLAYERS: Player[] = [];

const DEFAULT_TEAMS: Team[] = [
  { id: DEFAULT_TEAM_ID, name: 'FS Talavera', category: 'Equipo principal' }
];

const DEFAULT_SEASONS: Season[] = [
  { id: DEFAULT_SEASON_ID, name: '2026/27', isActive: true }
];

const generateId = (prefix: string): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const normalizeNameForMatch = (value: string): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const getDraftScopeKey = (teamId?: string, seasonId?: string): string =>
  `${teamId || DEFAULT_TEAM_ID}::${seasonId || DEFAULT_SEASON_ID}`;

const sanitizeMatch = (m: any): Match => ({
  ...m,
  teamId: m?.teamId || DEFAULT_TEAM_ID,
  seasonId: m?.seasonId || DEFAULT_SEASON_ID,
  shotsEvents: Array.isArray(m?.shotsEvents) ? m.shotsEvents : [],
  titulares: Array.isArray(m?.titulares) ? m.titulares : [],
  suplentes: Array.isArray(m?.suplentes) ? m.suplentes : [],
  rotationEvents: Array.isArray(m?.rotationEvents) ? m.rotationEvents : [],
  rivalColor: m?.rivalColor || '#dc2626',
  talaveraKit: m?.talaveraKit || '1ª Equipación',
  localFouls1stHalf: m?.localFouls1stHalf ?? 0,
  rivalFouls1stHalf: m?.rivalFouls1stHalf ?? 0,
  localFouls2ndHalf: m?.localFouls2ndHalf ?? 0,
  rivalFouls2ndHalf: m?.rivalFouls2ndHalf ?? 0,
  stats: m?.stats && typeof m.stats === 'object' ? m.stats : {},
});

const isMeaningfulLiveDraft = (draft: LiveMatchState | null | undefined): draft is LiveMatchState => {
  if (!draft) return false;
  const hasScore = (draft.goalsFor || 0) > 0 || (draft.goalsAgainst || 0) > 0;
  const hasEvents =
    (draft.shotsEvents?.length || 0) > 0 ||
    (draft.rotationEvents?.length || 0) > 0 ||
    (draft.penaltyTimers?.length || 0) > 0;
  const hasProgress =
    !draft.isPreMatch ||
    draft.half === 2 ||
    (draft.localFouls1stHalf || 0) > 0 ||
    (draft.rivalFouls1stHalf || 0) > 0 ||
    (draft.localFouls2ndHalf || 0) > 0 ||
    (draft.rivalFouls2ndHalf || 0) > 0 ||
    (draft.teamShotsUnattributed || 0) > 0 ||
    (draft.teamYellowsStaff || 0) > 0;
  const hasPlayerMinutes = Object.values(draft.playersState || {}).some(
    ps =>
      (ps.secondsPlayed || 0) > 0 ||
      (ps.secondsPlayed1st || 0) > 0 ||
      (ps.shots || 0) > 0 ||
      (ps.goals || 0) > 0 ||
      (ps.yellows || 0) > 0 ||
      ps.redCard ||
      (ps.saves || 0) > 0 ||
      (ps.goalsConceded || 0) > 0
  );
  const hasRivalText = Boolean(draft.rival && draft.rival.trim() !== '');
  return hasScore || hasEvents || hasProgress || hasPlayerMinutes || hasRivalText;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'live' | 'history' | 'stats' | 'players'>('live');

  // Multi-Team & Multi-Season state
  const [teams, setTeams] = useState<Team[]>(() => {
    const saved = localStorage.getItem('fst_teams_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse teams list.', e);
      }
    }
    return DEFAULT_TEAMS;
  });

  const [seasons, setSeasons] = useState<Season[]>(() => {
    const saved = localStorage.getItem('fst_seasons_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse seasons list.', e);
      }
    }
    return DEFAULT_SEASONS;
  });

  const [selectedTeamId, setSelectedTeamId] = useState<string>(() => {
    const saved = localStorage.getItem('fst_selected_team_v2');
    if (saved) {
      const found = teams.find(t => t.id === saved && !t.isArchived);
      if (found) return found.id;
    }
    const firstActive = teams.find(t => !t.isArchived);
    return firstActive ? firstActive.id : (teams[0]?.id || DEFAULT_TEAM_ID);
  });

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(() => {
    const saved = localStorage.getItem('fst_selected_season_v2');
    if (saved && seasons.some(s => s.id === saved)) {
      return saved;
    }
    const activeSeason = seasons.find(s => s.isActive);
    return activeSeason ? activeSeason.id : (seasons[0]?.id || DEFAULT_SEASON_ID);
  });

  // Roster Pool state
  const [players, setPlayers] = useState<Player[]>(() => {
    const saved = localStorage.getItem('futsal_players_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
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
          return parsed.map(sanitizeMatch);
        }
      } catch (e) {
        console.error('Failed to parse matches history.', e);
      }
    }
    return [];
  });

  // Live Drafts scoped by Team & Season (migrating legacy v2/v1 drafts if v3 does not exist)
  const [liveDraftsByScope, setLiveDraftsByScope] = useState<Record<string, LiveMatchState | null>>(() => {
    const savedV3 = localStorage.getItem('futsal_live_drafts_v3');
    if (savedV3) {
      try {
        const parsed = JSON.parse(savedV3);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to load live drafts v3.', e);
      }
    }
    const savedV2 = localStorage.getItem('futsal_live_drafts_v2');
    if (savedV2) {
      try {
        const parsed = JSON.parse(savedV2) as Record<string, LiveMatchState | null>;
        if (parsed && typeof parsed === 'object') {
          const migrated: Record<string, LiveMatchState | null> = {};
          Object.entries(parsed).forEach(([teamKey, draft]) => {
            if (isMeaningfulLiveDraft(draft)) {
              const scopeKey = getDraftScopeKey(draft.teamId || teamKey, draft.seasonId || DEFAULT_SEASON_ID);
              migrated[scopeKey] = draft;
            }
          });
          return migrated;
        }
      } catch (e) {
        console.error('Failed to migrate live drafts v2.', e);
      }
    }
    const savedLegacy = localStorage.getItem('futsal_live_draft_v1');
    if (savedLegacy) {
      try {
        const parsed = JSON.parse(savedLegacy) as LiveMatchState;
        if (isMeaningfulLiveDraft(parsed)) {
          return { [getDraftScopeKey(parsed.teamId, parsed.seasonId)]: parsed };
        }
      } catch (e) {
        console.error('Failed to migrate legacy live draft.', e);
      }
    }
    return {};
  });

  const activeDraftScopeKey = getDraftScopeKey(selectedTeamId, selectedSeasonId);
  const activeLiveDraft = liveDraftsByScope[activeDraftScopeKey] || null;
  const hasRealLiveDraft = isMeaningfulLiveDraft(activeLiveDraft);

  // Persist Teams, Seasons, Active Context, Drafts & Players to localStorage
  useEffect(() => {
    localStorage.setItem('fst_teams_v2', JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    localStorage.setItem('fst_seasons_v2', JSON.stringify(seasons));
  }, [seasons]);

  useEffect(() => {
    localStorage.setItem('fst_selected_team_v2', selectedTeamId);
  }, [selectedTeamId]);

  useEffect(() => {
    localStorage.setItem('fst_selected_season_v2', selectedSeasonId);
  }, [selectedSeasonId]);

  useEffect(() => {
    localStorage.setItem('futsal_live_drafts_v3', JSON.stringify(liveDraftsByScope));
  }, [liveDraftsByScope]);

  // Ensure selectedTeamId never points to a missing or archived team
  useEffect(() => {
    const nonArchived = teams.filter(t => !t.isArchived);
    if (nonArchived.length > 0 && !nonArchived.some(t => t.id === selectedTeamId)) {
      setSelectedTeamId(nonArchived[0].id);
    }
  }, [teams, selectedTeamId]);

  // Ensure selectedSeasonId never points to a missing season
  useEffect(() => {
    if (seasons.length > 0 && !seasons.some(s => s.id === selectedSeasonId)) {
      const activeS = seasons.find(s => s.isActive) || seasons[0];
      setSelectedSeasonId(activeS.id);
    }
  }, [seasons, selectedSeasonId]);

  // Filtered global lists by active Team & Season
  const activeTeams = useMemo(() => teams.filter(t => !t.isArchived), [teams]);
  const activeTeam = useMemo(
    () => activeTeams.find(t => t.id === selectedTeamId) || activeTeams[0] || teams[0],
    [activeTeams, teams, selectedTeamId]
  );
  const activeTeamSeasonPlayers = useMemo(
    () =>
      players.filter(
        p =>
          (p.teamId || DEFAULT_TEAM_ID) === selectedTeamId &&
          (p.seasonId || DEFAULT_SEASON_ID) === selectedSeasonId
      ),
    [players, selectedTeamId, selectedSeasonId]
  );
  const activeTeamAllPlayers = useMemo(
    () => players.filter(p => (p.teamId || DEFAULT_TEAM_ID) === selectedTeamId),
    [players, selectedTeamId]
  );
  const activeTeamMatches = useMemo(
    () => matches.filter(m => (m.teamId || DEFAULT_TEAM_ID) === selectedTeamId),
    [matches, selectedTeamId]
  );
  const activeTeamSeasonMatches = useMemo(
    () =>
      activeTeamMatches.filter(
        m => (m.seasonId || DEFAULT_SEASON_ID) === selectedSeasonId
      ),
    [activeTeamMatches, selectedSeasonId]
  );

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

    let cancelled = false;
    const optimizeAll = async () => {
      const compressedMap = new Map<string, string>();
      await Promise.all(
        players.map(async (p) => {
          if (p.photo && p.photo.length > 25000) {
            // High-resolution camera photo imported, optimize to standard high-clarity 180px
            const compressed = await compressBase64Image(p.photo, 180, 0.82);
            if (compressed !== p.photo) {
              compressedMap.set(p.id, compressed);
            }
          }
        })
      );

      if (!cancelled && compressedMap.size > 0) {
        setPlayers(prev =>
          prev.map(p => (compressedMap.has(p.id) ? { ...p, photo: compressedMap.get(p.id)! } : p))
        );
      }
    };

    optimizeAll();
    return () => {
      cancelled = true;
    };
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
      id: generateId('p'),
      isActive: true,
      teamId: newPlayer.teamId || selectedTeamId,
      seasonId: newPlayer.seasonId || selectedSeasonId,
      status: newPlayer.status || 'activo'
    };
    setPlayers(prev => [...prev, player]);
  }, [selectedTeamId, selectedSeasonId]);

  const handleEditPlayer = useCallback((updatedPlayer: Player) => {
    setPlayers(prev =>
      prev.map(p =>
        p.id === updatedPlayer.id
          ? {
              ...updatedPlayer,
              teamId: updatedPlayer.teamId || p.teamId || selectedTeamId,
              seasonId: updatedPlayer.seasonId || p.seasonId || selectedSeasonId
            }
          : p
      )
    );
  }, [selectedTeamId, selectedSeasonId]);

  const handleDeletePlayer = useCallback((id: string) => {
    // Soft remove players to preserve history records, or update state
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, isActive: false } : p));
  }, []);

  // Archive & Save live match
  const handleSaveMatch = useCallback((newMatch: Omit<Match, 'id'>) => {
    const targetTeamId = newMatch.teamId || selectedTeamId;
    const targetSeasonId = newMatch.seasonId || selectedSeasonId;
    const match: Match = sanitizeMatch({
      ...newMatch,
      id: generateId('m'),
      teamId: targetTeamId,
      seasonId: targetSeasonId
    });
    const scopeKey = getDraftScopeKey(targetTeamId, targetSeasonId);
    setMatches(prev => [...prev, match]);
    setLiveDraftsByScope(prev => ({
      ...prev,
      [scopeKey]: null
    }));
    localStorage.removeItem('futsal_live_draft_v1');
    
    // Auto navigate to Jornadas to review the summary
    setActiveTab('history');
  }, [selectedTeamId, selectedSeasonId]);

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

  // Auto-backup live match in progress (isolated per team + season)
  const handleSaveLiveDraft = useCallback((state: LiveMatchState) => {
    const targetTeamId = state.teamId || selectedTeamId;
    const targetSeasonId = state.seasonId || selectedSeasonId;
    const stampedState: LiveMatchState = {
      ...state,
      teamId: targetTeamId,
      seasonId: targetSeasonId
    };
    const scopeKey = getDraftScopeKey(targetTeamId, targetSeasonId);
    if (!isMeaningfulLiveDraft(stampedState)) {
      setLiveDraftsByScope(prev => {
        if (!prev[scopeKey]) return prev;
        return { ...prev, [scopeKey]: null };
      });
      return;
    }
    setLiveDraftsByScope(prev => ({
      ...prev,
      [scopeKey]: stampedState
    }));
    localStorage.setItem('futsal_live_draft_v1', JSON.stringify(stampedState));
  }, [selectedTeamId, selectedSeasonId]);

  const handleClearLiveDraft = useCallback(() => {
    const scopeKey = getDraftScopeKey(selectedTeamId, selectedSeasonId);
    setLiveDraftsByScope(prev => ({
      ...prev,
      [scopeKey]: null
    }));
    localStorage.removeItem('futsal_live_draft_v1');
  }, [selectedTeamId, selectedSeasonId]);

  // Team & Season CRUD callbacks
  const handleCreateTeam = useCallback((name: string, category: string): string => {
    const newId = generateId('team');
    setTeams(prev => [...prev, { id: newId, name, category: category || undefined }]);
    return newId;
  }, []);

  const handleUpdateTeam = useCallback((id: string, name: string, category: string) => {
    setTeams(prev =>
      prev.map(t => (t.id === id ? { ...t, name, category: category || undefined } : t))
    );
  }, []);

  const handleDuplicateTeam = useCallback((sourceTeamId: string, newName: string, category: string) => {
    const newTeamId = generateId('team');
    setTeams(prev => [...prev, { id: newTeamId, name: newName, category: category || undefined }]);
    const sourceSquad = players.filter(
      p =>
        (p.teamId || DEFAULT_TEAM_ID) === sourceTeamId &&
        (p.seasonId || DEFAULT_SEASON_ID) === selectedSeasonId &&
        p.isActive
    );
    if (sourceSquad.length > 0) {
      const cloned = sourceSquad.map(p => ({
        ...p,
        id: generateId('p'),
        teamId: newTeamId,
        seasonId: selectedSeasonId
      }));
      setPlayers(prev => [...prev, ...cloned]);
    }
    setSelectedTeamId(newTeamId);
  }, [players, selectedSeasonId]);

  const handleArchiveTeam = useCallback((id: string) => {
    setTeams(prev => prev.map(t => (t.id === id ? { ...t, isArchived: true } : t)));
    if (id === selectedTeamId) {
      const nextActive = teams.find(t => t.id !== id && !t.isArchived);
      if (nextActive) {
        setSelectedTeamId(nextActive.id);
      }
    }
  }, [selectedTeamId, teams]);

  const handleCreateSeason = useCallback((name: string, copyCurrentSquad: boolean): string => {
    const newSeasonId = generateId('season');
    setSeasons(prev => [...prev, { id: newSeasonId, name }]);
    if (copyCurrentSquad) {
      const sourceSquad = players.filter(
        p =>
          (p.teamId || DEFAULT_TEAM_ID) === selectedTeamId &&
          (p.seasonId || DEFAULT_SEASON_ID) === selectedSeasonId &&
          p.isActive
      );
      if (sourceSquad.length > 0) {
        const cloned = sourceSquad.map(p => ({
          ...p,
          id: generateId('p'),
          teamId: selectedTeamId,
          seasonId: newSeasonId
        }));
        setPlayers(prev => [...prev, ...cloned]);
      }
    }
    return newSeasonId;
  }, [players, selectedTeamId, selectedSeasonId]);

  const handleBulkImportExcel = useCallback((rows: ParsedExcelPlayerRow[]) => {
    if (rows.length === 0) return;

    const nextTeams = teams.map(t => ({ ...t }));
    const nextSeasons = seasons.map(s => ({ ...s }));
    const createdPlayers: Player[] = [];
    let lastTeamId = selectedTeamId;
    let lastSeasonId = selectedSeasonId;

    rows.forEach(row => {
      const normTeam = normalizeNameForMatch(row.teamName);
      let teamObj =
        nextTeams.find(t => !t.isArchived && normalizeNameForMatch(t.name) === normTeam) ||
        nextTeams.find(t => normalizeNameForMatch(t.name) === normTeam);

      if (!teamObj) {
        teamObj = {
          id: generateId('team'),
          name: row.teamName.trim(),
          category: row.category.trim() || undefined
        };
        nextTeams.push(teamObj);
      } else {
        if (teamObj.isArchived) {
          teamObj.isArchived = false;
        }
        if (row.category.trim() && !teamObj.category) {
          teamObj.category = row.category.trim();
        }
      }

      const normSeason = normalizeNameForMatch(row.seasonName);
      let seasonObj = nextSeasons.find(s => normalizeNameForMatch(s.name) === normSeason);
      if (!seasonObj) {
        seasonObj = {
          id: generateId('season'),
          name: row.seasonName.trim()
        };
        nextSeasons.push(seasonObj);
      }

      createdPlayers.push({
        id: generateId('p'),
        name: row.name,
        alias: row.alias || row.name.split(/\s+/)[0],
        number: row.number,
        position: row.position,
        isActive: row.status !== 'baja',
        birthDate: row.birthDate || '',
        dominantLeg: row.dominantLeg,
        gender: row.gender,
        teamId: teamObj.id,
        seasonId: seasonObj.id,
        captain: row.captain,
        status: row.status
      });

      lastTeamId = teamObj.id;
      lastSeasonId = seasonObj.id;
    });

    setTeams(nextTeams);
    setSeasons(nextSeasons);
    setPlayers(prev => [...prev, ...createdPlayers]);
    setSelectedTeamId(lastTeamId);
    setSelectedSeasonId(lastSeasonId);
  }, [teams, seasons, selectedTeamId, selectedSeasonId]);

  // --- SYNCHRONIZATION AND SHARE LOGIC ---
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    teams?: Team[];
    seasons?: Season[];
    players?: Player[];
    matches?: Match[];
    liveDraft?: LiveMatchState | null;
    liveDraftsByScope?: Record<string, LiveMatchState | null>;
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
    const cleanScopedDrafts = Object.fromEntries(
      (Object.entries(liveDraftsByScope) as Array<[string, LiveMatchState | null]>).filter(([, draft]) =>
        isMeaningfulLiveDraft(draft)
      )
    );
    return {
      teams: teams || DEFAULT_TEAMS,
      seasons: seasons || DEFAULT_SEASONS,
      players: finalPlayers,
      matches: options.excludeMatches ? [] : (matches || []),
      liveDraft: options.excludeLive ? null : (hasRealLiveDraft ? activeLiveDraft : null),
      liveDraftsByScope: options.excludeLive ? {} : cleanScopedDrafts
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
                setQrWarning('Código QR optimizado. Se han omitido las fotos automáticamente para reducir el tamaño.');
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
  }, [showSyncModal, syncTab, teams, seasons, players, matches, activeLiveDraft, liveDraftsByScope, shareExcludePhotos, shareExcludeMatches, shareExcludeLive]);

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
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed && (parsed.players || parsed.matches || parsed.teams || parsed.liveDraft || parsed.liveDraftsByScope)) {
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
      if (parsed && (parsed.players || parsed.matches || parsed.teams || parsed.liveDraft || parsed.liveDraftsByScope)) {
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
      if (pendingImport.teams && pendingImport.teams.length > 0) {
        setTeams(pendingImport.teams);
        const firstActiveTeam = pendingImport.teams.find(t => !t.isArchived) || pendingImport.teams[0];
        if (firstActiveTeam) setSelectedTeamId(firstActiveTeam.id);
      }
      if (pendingImport.seasons && pendingImport.seasons.length > 0) {
        setSeasons(pendingImport.seasons);
        const activeS = pendingImport.seasons.find(s => s.isActive) || pendingImport.seasons[0];
        if (activeS) setSelectedSeasonId(activeS.id);
      }
      if (pendingImport.players) setPlayers(pendingImport.players);
      if (pendingImport.matches) setMatches(pendingImport.matches.map(sanitizeMatch));

      const nextDrafts: Record<string, LiveMatchState | null> = {};
      if (pendingImport.liveDraftsByScope && typeof pendingImport.liveDraftsByScope === 'object') {
        (Object.values(pendingImport.liveDraftsByScope) as Array<LiveMatchState | null>).forEach(d => {
          if (isMeaningfulLiveDraft(d)) {
            const key = getDraftScopeKey(d.teamId, d.seasonId);
            nextDrafts[key] = d;
          }
        });
      }
      if (isMeaningfulLiveDraft(pendingImport.liveDraft)) {
        const key = getDraftScopeKey(pendingImport.liveDraft.teamId, pendingImport.liveDraft.seasonId);
        nextDrafts[key] = pendingImport.liveDraft;
      }
      setLiveDraftsByScope(nextDrafts);
      if (isMeaningfulLiveDraft(pendingImport.liveDraft)) {
        localStorage.setItem('futsal_live_draft_v1', JSON.stringify(pendingImport.liveDraft));
      } else {
        localStorage.removeItem('futsal_live_draft_v1');
      }
    } else {
      // Build deterministic team & season ID mappings when homonyms match existing entries
      const teamIdMap = new Map<string, string>();
      if (pendingImport.teams && pendingImport.teams.length > 0) {
        const mergedTeams = [...(teams || [])];
        pendingImport.teams.forEach(newT => {
          const existing = mergedTeams.find(
            t =>
              t.id === newT.id ||
              (!t.isArchived && !newT.isArchived && normalizeNameForMatch(t.name) === normalizeNameForMatch(newT.name)) ||
              (t.isArchived === newT.isArchived && normalizeNameForMatch(t.name) === normalizeNameForMatch(newT.name))
          );
          if (existing) {
            teamIdMap.set(newT.id, existing.id);
          } else {
            mergedTeams.push(newT);
            teamIdMap.set(newT.id, newT.id);
          }
        });
        setTeams(mergedTeams);
      }

      const seasonIdMap = new Map<string, string>();
      if (pendingImport.seasons && pendingImport.seasons.length > 0) {
        const mergedSeasons = [...(seasons || [])];
        pendingImport.seasons.forEach(newS => {
          const existing = mergedSeasons.find(
            s => s.id === newS.id || normalizeNameForMatch(s.name) === normalizeNameForMatch(newS.name)
          );
          if (existing) {
            seasonIdMap.set(newS.id, existing.id);
          } else {
            mergedSeasons.push(newS);
            seasonIdMap.set(newS.id, newS.id);
          }
        });
        setSeasons(mergedSeasons);
      }

      const mapTeamId = (id?: string) => (id ? (teamIdMap.get(id) || id) : DEFAULT_TEAM_ID);
      const mapSeasonId = (id?: string) => (id ? (seasonIdMap.get(id) || id) : DEFAULT_SEASON_ID);

      if (pendingImport.players) {
        setPlayers(prev => {
          const merged = [...(prev || [])];
          pendingImport.players!.forEach(newP => {
            const remapped: Player = {
              ...newP,
              teamId: mapTeamId(newP.teamId),
              seasonId: mapSeasonId(newP.seasonId)
            };
            const remTeamId = remapped.teamId || DEFAULT_TEAM_ID;
            const remSeasonId = remapped.seasonId || DEFAULT_SEASON_ID;
            const exists = merged.find(p => {
              const pTeamId = p.teamId || DEFAULT_TEAM_ID;
              const pSeasonId = p.seasonId || DEFAULT_SEASON_ID;
              const sameScope = pTeamId === remTeamId && pSeasonId === remSeasonId;
              return (
                p.id === remapped.id ||
                (sameScope &&
                  normalizeNameForMatch(p.name) === normalizeNameForMatch(remapped.name) &&
                  p.number === remapped.number) ||
                // Two active players in the SAME team & season cannot share a dorsal number
                (sameScope && p.isActive && remapped.isActive && p.number === remapped.number)
              );
            });
            if (!exists) {
              merged.push(remapped);
            }
          });
          return merged;
        });
      }

      if (pendingImport.matches) {
        setMatches(prev => {
          const merged = [...(prev || [])];
          pendingImport.matches!.forEach(rawM => {
            const remapped = sanitizeMatch({
              ...rawM,
              teamId: mapTeamId(rawM.teamId),
              seasonId: mapSeasonId(rawM.seasonId)
            });
            const exists = merged.find(m => m.id === remapped.id);
            if (!exists) {
              merged.push(remapped);
            }
          });
          return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });
      }

      const importedDrafts: LiveMatchState[] = [];
      if (pendingImport.liveDraftsByScope && typeof pendingImport.liveDraftsByScope === 'object') {
        (Object.values(pendingImport.liveDraftsByScope) as Array<LiveMatchState | null>).forEach(d => {
          if (isMeaningfulLiveDraft(d)) importedDrafts.push(d);
        });
      }
      if (isMeaningfulLiveDraft(pendingImport.liveDraft)) {
        importedDrafts.push(pendingImport.liveDraft);
      }
      if (importedDrafts.length > 0) {
        setLiveDraftsByScope(prev => {
          const next = { ...prev };
          importedDrafts.forEach(d => {
            const mappedDraft: LiveMatchState = {
              ...d,
              teamId: mapTeamId(d.teamId),
              seasonId: mapSeasonId(d.seasonId)
            };
            const scopeKey = getDraftScopeKey(mappedDraft.teamId, mappedDraft.seasonId);
            if (!next[scopeKey]) {
              next[scopeKey] = mappedDraft;
            }
          });
          return next;
        });
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
        if (parsed && (parsed.players || parsed.matches || parsed.teams)) {
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
          <div className="flex items-center gap-2 min-w-0">
            {/* Club Shield Emblem Visual representation wrapper */}
            <div className="relative w-8 h-8 bg-white rounded-full border border-[#FFD700] flex items-center justify-center shadow-xs shrink-0 p-0.5">
              <img
                referrerPolicy="no-referrer"
                src="./logo.png"
                alt="FS Talavera"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-black tracking-tight text-white truncate">
                FS TALAVERA <span className="text-[#FFD700]">STATS MANAGER</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Quick Active Team Switcher Pill */}
            <div className="inline-flex items-center gap-1 bg-[#003163] border border-blue-700/60 rounded-lg px-2 py-1 text-[10.5px] font-extrabold text-white shadow-xs">
              <Users size={12} className="text-[#FFD700] shrink-0" />
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                aria-label="Selector rápido de equipo activo"
                className="bg-transparent text-white font-extrabold focus:outline-none cursor-pointer max-w-[100px] sm:max-w-[160px] truncate"
              >
                {activeTeams.map(t => (
                  <option key={t.id} value={t.id} className="bg-[#004183] text-white">
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Active Season Switcher Pill (shown when multiple seasons exist) */}
            {seasons.length > 1 && (
              <div className="inline-flex items-center gap-1 bg-[#003163] border border-blue-700/60 rounded-lg px-2 py-1 text-[10.5px] font-extrabold text-white shadow-xs">
                <Calendar size={12} className="text-[#FFD700] shrink-0" />
                <select
                  value={selectedSeasonId}
                  onChange={(e) => setSelectedSeasonId(e.target.value)}
                  aria-label="Selector rápido de temporada activa"
                  className="bg-transparent text-white font-extrabold focus:outline-none cursor-pointer max-w-[78px] sm:max-w-[115px] truncate"
                >
                  {seasons.map(s => (
                    <option key={s.id} value={s.id} className="bg-[#004183] text-white">
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sync Button on the Right */}
            <button
              onClick={() => setShowSyncModal(true)}
              className="bg-[#003163] hover:bg-blue-800 text-white border border-blue-700/50 hover:border-blue-600 transition duration-150 rounded-lg px-2.5 py-1 flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
              title="Sincronizar y compartir datos"
            >
              <Share2 size={13} className="text-[#FFD700] shrink-0" />
              <span className="text-[10.5px] font-black uppercase tracking-wider hidden sm:inline">Sincronizar</span>
            </button>
          </div>
        </div>
      </header>

      {/* CORE FRAME LAYOUT CONTENT */}
      <main className="flex-1 overflow-y-auto pb-24" id="main-render-slot">
        {activeTab === 'live' && (
          <div key={`${selectedTeamId}-${selectedSeasonId}`}>
            <LiveTracker
              players={activeTeamSeasonPlayers}
              onSaveMatch={handleSaveMatch}
              initialLiveState={activeLiveDraft}
              onSaveLiveDraft={handleSaveLiveDraft}
              onClearLiveDraft={handleClearLiveDraft}
              activeTeamId={selectedTeamId}
              activeSeasonId={selectedSeasonId}
              activeTeamName={activeTeam?.name}
            />
          </div>
        )}

        {activeTab === 'history' && (
          <div key={`${selectedTeamId}-${selectedSeasonId}`}>
            <HistoryList
              matches={activeTeamSeasonMatches}
              players={activeTeamSeasonPlayers}
              allTeamPlayers={activeTeamAllPlayers}
              onDeleteMatch={handleDeleteMatch}
              onUpdateMatchComment={handleUpdateMatchComment}
              activeTeamName={activeTeam?.name}
            />
          </div>
        )}

        {activeTab === 'stats' && (
          <div key={`${selectedTeamId}-${selectedSeasonId}`}>
            <StatsDashboard
              matches={activeTeamSeasonMatches}
              players={activeTeamSeasonPlayers}
              allTeamPlayers={activeTeamAllPlayers}
              activeTeamName={activeTeam?.name}
            />
          </div>
        )}

        {activeTab === 'players' && (
          <div>
            <TeamManagementPanel
              teams={teams}
              seasons={seasons}
              selectedTeamId={selectedTeamId}
              selectedSeasonId={selectedSeasonId}
              activePlayers={activeTeamSeasonPlayers}
              allPlayers={players}
              onSelectTeam={setSelectedTeamId}
              onSelectSeason={setSelectedSeasonId}
              onCreateTeam={handleCreateTeam}
              onUpdateTeam={handleUpdateTeam}
              onDuplicateTeam={handleDuplicateTeam}
              onArchiveTeam={handleArchiveTeam}
              onCreateSeason={handleCreateSeason}
              onBulkImportExcel={handleBulkImportExcel}
            />
            <div key={`${selectedTeamId}-${selectedSeasonId}`}>
              <PlayerManager
                players={activeTeamSeasonPlayers}
                matches={activeTeamSeasonMatches}
                onAddPlayer={handleAddPlayer}
                onEditPlayer={handleEditPlayer}
                onDeletePlayer={handleDeletePlayer}
                activeTeamName={activeTeam?.name}
              />
            </div>
          </div>
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
              {hasRealLiveDraft && (
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
                  {pendingImport.players?.length || 0} jugadores/as
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
      <ReloadPrompt />
    </div>
  );
}
