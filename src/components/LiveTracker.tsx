/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Save, Flame, User, AlertTriangle, Shield, Check, Plus, Minus, Users, Undo2, Trash2 } from 'lucide-react';
import { Player, PlayerPerformance, LiveMatchState, LivePlayerState, Match, PositionType, ShotEvent, RotationEvent, GOAL_TYPES, GoalType } from '../types';
import { exportMatchToPDF } from '../utils/pdfGenerator';
import { consolidateRotationEvents, getDisambiguatedPlayerLabel } from '../utils/lineupAnalytics';

interface LiveTrackerProps {
  players: Player[];
  onSaveMatch: (match: Omit<Match, 'id'>) => void;
  initialLiveState?: LiveMatchState | null;
  onSaveLiveDraft?: (state: LiveMatchState) => void;
  onClearLiveDraft?: () => void;
  activeTeamId?: string;
  activeSeasonId?: string;
  activeTeamName?: string;
}

export default function LiveTracker({
  players,
  onSaveMatch,
  initialLiveState,
  onSaveLiveDraft,
  onClearLiveDraft,
  activeTeamId,
  activeSeasonId,
  activeTeamName
}: LiveTrackerProps) {
  
  // Create state initializer
  const createDefaultLiveState = (): LiveMatchState => {
    const playersState: Record<string, LivePlayerState> = {};
    players.forEach(p => {
      playersState[p.id] = {
        playerId: p.id,
        isOnCourt: false,
        shots: 0,
        goals: 0,
        yellows: 0,
        redCard: false,
        secondsPlayed: 0,
        currentShiftSeconds: 0,
        timerStartTimestamp: null,
        saves: 0,
        goalsConceded: 0
      };
    });

    return {
      rival: '',
      matchType: 'oficial',
      jornada: 1,
      date: new Date().toISOString().split('T')[0],
      goalsFor: 0,
      goalsAgainst: 0,
      teamShotsUnattributed: 0,
      teamYellowsStaff: 0,
      playersState,
      matchStartTime: null,
      overallSeconds: 1200, // 20 minutes countdown
      half: 1,
      rivalColor: '#dc2626', // Default red color
      talaveraKit: '1ª Equipación',
      localFouls1stHalf: 0,
      rivalFouls1stHalf: 0,
      localFouls2ndHalf: 0,
      rivalFouls2ndHalf: 0,
      shotsEvents: [],
      titulares: [],
      initialTitulares: [],
      suplentes: [],
      activeGoalkeeperId: '',
      isPreMatch: true, // Draft selection lobby
      periodDurationMinutes: 20,
      attackDirection: 'derecha',
      timeout1stHalfCalled: false,
      timeout2ndHalfCalled: false,
      localTimeout1stHalfCalled: false,
      localTimeout2ndHalfCalled: false,
      rivalTimeout1stHalfCalled: false,
      rivalTimeout2ndHalfCalled: false,
      penaltyTimers: [],
      teamId: activeTeamId,
      seasonId: activeSeasonId,
      rotationEvents: []
    };
  };

  const [matchState, setMatchState] = useState<LiveMatchState>(() => {
    if (initialLiveState) {
      // Deep copy playersState to avoid mutating parent draft state in-place
      const clonedPlayersState: Record<string, LivePlayerState> = {};
      if (initialLiveState.playersState) {
        Object.entries(initialLiveState.playersState).forEach(([pid, ps]) => {
          clonedPlayersState[pid] = {
            ...ps,
            shots: ps.shots ?? 0,
            goals: ps.goals ?? 0,
            yellows: ps.yellows ?? 0,
            redCard: ps.redCard ?? false,
            secondsPlayed: ps.secondsPlayed ?? 0,
            currentShiftSeconds: ps.currentShiftSeconds ?? 0,
            saves: ps.saves ?? 0,
            goalsConceded: ps.goalsConceded ?? 0
          };
        });
      }

      const cloned: LiveMatchState = {
        ...initialLiveState,
        rival: initialLiveState.rival || '',
        matchType: initialLiveState.matchType || 'oficial',
        jornada: initialLiveState.jornada || ((initialLiveState.matchType || 'oficial') === 'oficial' ? 1 : undefined),
        date: initialLiveState.date || new Date().toISOString().split('T')[0],
        goalsFor: initialLiveState.goalsFor ?? 0,
        goalsAgainst: initialLiveState.goalsAgainst ?? 0,
        teamShotsUnattributed: initialLiveState.teamShotsUnattributed ?? 0,
        teamYellowsStaff: initialLiveState.teamYellowsStaff ?? 0,
        playersState: clonedPlayersState,
        matchStartTime: initialLiveState.matchStartTime ?? null,
        overallSeconds: initialLiveState.overallSeconds ?? 1200,
        half: initialLiveState.half || 1,
        rivalColor: initialLiveState.rivalColor || '#dc2626',
        talaveraKit: initialLiveState.talaveraKit || '1ª Equipación',
        localFouls1stHalf: initialLiveState.localFouls1stHalf ?? 0,
        rivalFouls1stHalf: initialLiveState.rivalFouls1stHalf ?? 0,
        localFouls2ndHalf: initialLiveState.localFouls2ndHalf ?? 0,
        rivalFouls2ndHalf: initialLiveState.rivalFouls2ndHalf ?? 0,
        shotsEvents: initialLiveState.shotsEvents || [],
        titulares: initialLiveState.titulares || [],
        initialTitulares: initialLiveState.initialTitulares || (initialLiveState.titulares ? [...initialLiveState.titulares] : []),
        suplentes: (initialLiveState.suplentes || []).filter(id => !(initialLiveState.titulares || []).includes(id)),
        activeGoalkeeperId: initialLiveState.activeGoalkeeperId || '',
        isPreMatch: initialLiveState.isPreMatch ?? true,
        periodDurationMinutes: initialLiveState.periodDurationMinutes ?? 20,
        attackDirection: initialLiveState.attackDirection || 'derecha',
        timeout1stHalfCalled: initialLiveState.timeout1stHalfCalled ?? false,
        timeout2ndHalfCalled: initialLiveState.timeout2ndHalfCalled ?? false,
        localTimeout1stHalfCalled: initialLiveState.localTimeout1stHalfCalled ?? false,
        localTimeout2ndHalfCalled: initialLiveState.localTimeout2ndHalfCalled ?? false,
        rivalTimeout1stHalfCalled: initialLiveState.rivalTimeout1stHalfCalled ?? false,
        rivalTimeout2ndHalfCalled: initialLiveState.rivalTimeout2ndHalfCalled ?? false,
        penaltyTimers: initialLiveState.penaltyTimers || [],
        teamId: initialLiveState.teamId || activeTeamId,
        seasonId: initialLiveState.seasonId || activeSeasonId,
        rotationEvents: initialLiveState.rotationEvents || []
      };

      if (cloned.isPreMatch) {
        const eligibleIds = new Set(
          players
            .filter(p => p.isActive && p.status !== 'baja' && p.status !== 'lesionado' && p.status !== 'sancionado')
            .map(p => p.id)
        );
        cloned.titulares = cloned.titulares.map(id => (id && eligibleIds.has(id) ? id : ''));
        if (cloned.titulares.every(id => !id)) {
          cloned.titulares = [];
        }
        cloned.suplentes = cloned.suplentes.filter(id => eligibleIds.has(id) && !cloned.titulares.includes(id));
      }

      players.forEach(p => {
        if (!cloned.playersState[p.id]) {
          cloned.playersState[p.id] = {
            playerId: p.id,
            isOnCourt: false,
            shots: 0,
            goals: 0,
            yellows: 0,
            redCard: false,
            secondsPlayed: 0,
            currentShiftSeconds: 0,
            timerStartTimestamp: null,
            saves: 0,
            goalsConceded: 0
          };
        }
      });
      return cloned;
    }
    return createDefaultLiveState();
  });

  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Tactical Click Map state helpers
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [clickCoords, setClickCoords] = useState<{ x: number; y: number } | null>(null);
  const [shotStep, setShotStep] = useState<'team_select' | 'player_select' | 'result_local' | 'result_rival' | 'goal_type' | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const activeGoalkeeperId = matchState.activeGoalkeeperId || '';

  const [subInPlayerId, setSubInPlayerId] = useState<string | null>(null);
  const [showFirstHalfSummaryModal, setShowFirstHalfSummaryModal] = useState(false);
  const [secondHalfStarters, setSecondHalfStarters] = useState<string[]>([]);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [editingLocalScore, setEditingLocalScore] = useState(false);
  const [editingRivalScore, setEditingRivalScore] = useState(false);

  const isNaturalGoalkeeper = (p: Player) =>
    p.position === 'Portero/a' || Boolean(p.position?.toLowerCase().includes('porter'));

  const pickBestGoalkeeper = (
    candidateIds: string[],
    playersList: Player[],
    playersStateMap?: Record<string, LivePlayerState>
  ): string => {
    const eligibleIds = candidateIds.filter(id => {
      if (!id) return false;
      if (!playersStateMap) return true;
      const ps = playersStateMap[id];
      return Boolean(ps && ps.isOnCourt && !ps.redCard && (ps.yellows ?? 0) < 2);
    });
    if (eligibleIds.length === 0) return '';

    const firstPlayer = playersList.find(p => p.id === eligibleIds[0]);
    if (firstPlayer && isNaturalGoalkeeper(firstPlayer)) {
      return firstPlayer.id;
    }

    const naturalGKId = eligibleIds.find(id => {
      const p = playersList.find(pl => pl.id === id);
      return Boolean(p && isNaturalGoalkeeper(p));
    });

    return naturalGKId || eligibleIds[0];
  };

  // Ensure any player added or synced while LiveTracker stays mounted has initialized LivePlayerState
  useEffect(() => {
    setMatchState(prev => {
      const missing = players.filter(p => !prev.playersState[p.id]);
      if (missing.length === 0) return prev;
      const nextPlayersState = { ...prev.playersState };
      missing.forEach(p => {
        nextPlayersState[p.id] = {
          playerId: p.id,
          isOnCourt: false,
          shots: 0,
          goals: 0,
          yellows: 0,
          redCard: false,
          secondsPlayed: 0,
          currentShiftSeconds: 0,
          timerStartTimestamp: null,
          saves: 0,
          goalsConceded: 0
        };
      });
      return {
        ...prev,
        playersState: nextPlayersState
      };
    });
  }, [players]);

  // Sincronizar el borrador del Live Match usando ref solo cuando hay datos reales de partido
  const onSaveLiveDraftRef = useRef(onSaveLiveDraft);
  useEffect(() => {
    onSaveLiveDraftRef.current = onSaveLiveDraft;
  }, [onSaveLiveDraft]);

  useEffect(() => {
    const hasMeaningfulState =
      !matchState.isPreMatch ||
      matchState.rival.trim() !== '' ||
      matchState.titulares.some(Boolean) ||
      matchState.suplentes.length > 0 ||
      matchState.shotsEvents.length > 0;
    if (hasMeaningfulState && onSaveLiveDraftRef.current) {
      onSaveLiveDraftRef.current(matchState);
    }
  }, [matchState]);

  // Recover/repair active goalkeeper only if empty, off court, or expelled
  useEffect(() => {
    if (matchState.isPreMatch) return;
    const currentGK = matchState.activeGoalkeeperId;
    const currentGKState = currentGK ? matchState.playersState[currentGK] : undefined;
    const isCurrentValid = Boolean(
      currentGK &&
      currentGKState?.isOnCourt &&
      !currentGKState.redCard &&
      (currentGKState.yellows ?? 0) < 2
    );
    if (!isCurrentValid) {
      const onCourtIds = Object.keys(matchState.playersState).filter(
        pid =>
          matchState.playersState[pid]?.isOnCourt &&
          !matchState.playersState[pid]?.redCard &&
          (matchState.playersState[pid]?.yellows ?? 0) < 2
      );
      if (onCourtIds.length > 0) {
        const orderedCandidates = [
          ...(matchState.titulares || []).filter(id => onCourtIds.includes(id)),
          ...onCourtIds
        ];
        const fallbackGK = pickBestGoalkeeper(orderedCandidates, players, matchState.playersState);
        if (fallbackGK && fallbackGK !== currentGK) {
          setMatchState(prev => ({
            ...prev,
            activeGoalkeeperId: fallbackGK
          }));
        }
      }
    }
  }, [matchState.isPreMatch, matchState.activeGoalkeeperId, matchState.playersState, matchState.titulares, players]);

  // Stop timer and notify cleanly outside state updater when clock reaches 00:00
  useEffect(() => {
    if (!matchState.isPreMatch && isTimerRunning && matchState.overallSeconds <= 0) {
      setIsTimerRunning(false);
      alert(`¡Final del juego de la ${matchState.half}ª Parte! Por favor, revisa las estadísticas o avanza a la siguiente sección.`);
    }
  }, [isTimerRunning, matchState.overallSeconds, matchState.half, matchState.isPreMatch]);

  // Ticking countdown clock (pure state updater for React StrictMode safety)
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setMatchState(prev => {
          if (prev.overallSeconds <= 0) {
            return prev;
          }

          const updatedPlayers = { ...prev.playersState };
          Object.keys(updatedPlayers).forEach(pid => {
            const ps = updatedPlayers[pid];
            if (ps.isOnCourt && !ps.redCard) {
              updatedPlayers[pid] = {
                ...ps,
                secondsPlayed: ps.secondsPlayed + 1,
                currentShiftSeconds: (ps.currentShiftSeconds ?? 0) + 1
              };
            }
          });

          // Tick down any active penalty timers
          const updatedPenalties = (prev.penaltyTimers || [])
            .map(p => ({
              ...p,
              secondsRemaining: p.secondsRemaining - 1
            }))
            .filter(p => p.secondsRemaining > 0);

          return {
            ...prev,
            overallSeconds: Math.max(0, prev.overallSeconds - 1),
            playersState: updatedPlayers,
            penaltyTimers: updatedPenalties
          };
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning]);

  const firstHalfCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!showFirstHalfSummaryModal || !firstHalfCanvasRef.current) return;
    const canvas = firstHalfCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Draw solid slate background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    const m = 15;
    const cw = w - 2 * m;
    const ch = h - 2 * m;

    // Boundary lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(m, m, cw, ch);

    // Center line
    ctx.beginPath();
    ctx.moveTo(w / 2, m);
    ctx.lineTo(w / 2, h - m);
    ctx.stroke();

    // Center circle
    const centerRadius = cw * (3 / 40);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, centerRadius, 0, 2 * Math.PI);
    ctx.stroke();

    // Semi circles
    const penaltyRadius = cw * (6 / 40);
    ctx.beginPath();
    ctx.arc(m, h / 2, penaltyRadius, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w - m, h / 2, penaltyRadius, Math.PI / 2, 3 * Math.PI / 2);
    ctx.stroke();

    // Draw goals
    const isTalaveraAttackingRight = matchState.attackDirection !== 'izquierda';
    const leftGoalColor = isTalaveraAttackingRight ? '#004183' : (matchState.rivalColor || '#ff0505');
    const rightGoalColor = isTalaveraAttackingRight ? (matchState.rivalColor || '#ff0505') : '#004183';

    ctx.fillStyle = leftGoalColor;
    ctx.fillRect(m - 5, h / 2 - 15, 5, 30);
    ctx.fillStyle = rightGoalColor;
    ctx.fillRect(w - m, h / 2 - 15, 5, 30);

    // Outlines for goals
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(m - 5, h / 2 - 15, 5, 30);
    ctx.strokeRect(w - m, h / 2 - 15, 5, 30);

    // Top Shot Telemetry in 1st Half Heat Map: T:XX/XX/XX (Dentro / Fuera / Total)
    const firstHalfShotsForTelemetry = matchState.shotsEvents.filter(s => s.half === 1);
    const fhLocalIn = firstHalfShotsForTelemetry.filter(s => s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
    const fhLocalOut = firstHalfShotsForTelemetry.filter(s => s.team === 'local' && s.type === 'out').length;
    const fhLocalTot = fhLocalIn + fhLocalOut;

    const fhRivalIn = firstHalfShotsForTelemetry.filter(s => s.team === 'rival' && (s.type === 'on_target' || s.type === 'goal')).length;
    const fhRivalOut = firstHalfShotsForTelemetry.filter(s => s.team === 'rival' && s.type === 'out').length;
    const fhRivalTot = fhRivalIn + fhRivalOut;

    const padFh = (n: number) => String(n).padStart(2, '0');
    ctx.font = 'bold 8.5px monospace';
    ctx.textBaseline = 'middle';

    ctx.textAlign = 'left';
    ctx.fillStyle = matchState.talaveraKit === '1ª Equipación' ? '#38bdf8' : '#ec4899';
    ctx.fillText(`LOCAL T:${padFh(fhLocalIn)}/${padFh(fhLocalOut)}/${padFh(fhLocalTot)}`, m + 2, 7.5);

    ctx.textAlign = 'right';
    ctx.fillStyle = matchState.rivalColor || '#ff0505';
    ctx.fillText(`RIVAL T:${padFh(fhRivalIn)}/${padFh(fhRivalOut)}/${padFh(fhRivalTot)}`, w - m - 2, 7.5);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = 'bold 7px sans-serif';
    ctx.fillText(`(D / F / Tot)`, w / 2, 7.5);

    // Draw attack direction indicator on bottom of court
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([3, 3]);

    const arrowY = h - 16;
    ctx.beginPath();
    if (isTalaveraAttackingRight) {
      // Arrow pointing right
      ctx.moveTo(w / 2 - 70, arrowY);
      ctx.lineTo(w / 2 + 70, arrowY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(w / 2 + 70, arrowY);
      ctx.lineTo(w / 2 + 64, arrowY - 3);
      ctx.lineTo(w / 2 + 64, arrowY + 3);
      ctx.closePath();
      ctx.fill();
    } else {
      // Arrow pointing left
      ctx.moveTo(w / 2 + 70, arrowY);
      ctx.lineTo(w / 2 - 70, arrowY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(w / 2 - 70, arrowY);
      ctx.lineTo(w / 2 - 64, arrowY - 3);
      ctx.lineTo(w / 2 - 64, arrowY + 3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = 'bold 8.5px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`ATAQUE FS TALAVERA ${isTalaveraAttackingRight ? '➡️' : '⬅️'}`, w / 2, arrowY - 8);
    ctx.setLineDash([]); // Reset line dash

    // Plot 1st half shots only
    const firstHalfShots = matchState.shotsEvents.filter(s => s.half === 1);
    firstHalfShots.forEach(shot => {
      const sx = m + (shot.x * cw) / 100;
      const sy = m + (shot.y * ch) / 100;
      const isLocal = shot.team === 'local';
      const markerColor = isLocal
        ? (matchState.talaveraKit === '1ª Equipación' ? '#38bdf8' : '#ec4899')
        : (matchState.rivalColor || '#ef4444');

      ctx.strokeStyle = markerColor;
      ctx.fillStyle = markerColor;

      if (shot.type === 'out') {
        ctx.beginPath();
        ctx.lineWidth = 2.0;
        ctx.moveTo(sx - 4, sy - 4);
        ctx.lineTo(sx + 4, sy + 4);
        ctx.moveTo(sx + 4, sy - 4);
        ctx.lineTo(sx - 4, sy + 4);
        ctx.stroke();
      } else if (shot.type === 'on_target') {
        ctx.beginPath();
        ctx.lineWidth = 2.0;
        ctx.arc(sx, sy, 5, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (shot.type === 'goal') {
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, 2 * Math.PI);
        ctx.fillStyle = markerColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shot.playerNumber ? `${shot.playerNumber}` : '⚽', sx, sy + 0.5);
      }
    });

  }, [showFirstHalfSummaryModal, matchState.shotsEvents, matchState.attackDirection, matchState.rivalColor, matchState.talaveraKit]);

  // Redraw Interactive Court Pitch on Canvas API when updates trigger
  useEffect(() => {
    if (matchState.isPreMatch) return;
    drawPitch();
  }, [matchState.isPreMatch, matchState.rival, matchState.shotsEvents, matchState.half, matchState.rivalColor, matchState.talaveraKit, matchState.attackDirection, clickCoords]);

  // Draw Core Athletic Futsal Court Programmatically
  const drawPitch = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background color (Slate Sports court aesthetic look)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Court Boundary margins
    const m = 20;
    const cw = w - 2 * m;
    const ch = h - 2 * m;

    // Border line
    ctx.strokeStyle = '#38bdf8'; // neon central lines
    ctx.lineWidth = 2.5;
    ctx.strokeRect(m, m, cw, ch);

    // Center Line
    ctx.beginPath();
    ctx.moveTo(w / 2, m);
    ctx.lineTo(w / 2, h - m);
    ctx.stroke();

    // Center Circle (6m diameter, i.e., 3m radius scaled. Futsal 40x20, so r is (3/40)*cw)
    const centerRadius = cw * (3 / 40);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, centerRadius, 0, 2 * Math.PI);
    ctx.stroke();

    // Center Point
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 3, 0, 2 * Math.PI);
    ctx.fill();

    // Semi-circles Area (Futsal 6m penalty area)
    const penaltyRadius = cw * (6 / 40);
    
    // Left Penalty Area
    ctx.beginPath();
    ctx.arc(m, h / 2, penaltyRadius, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    // Right Penalty Area
    ctx.beginPath();
    ctx.arc(w - m, h / 2, penaltyRadius, Math.PI / 2, 3 * Math.PI / 2);
    ctx.stroke();

    // Penalty spots (10m double-penalty spot & 6m spot)
    const spot6mLeft = m + cw * (6 / 40);
    const spot6mRight = w - m - cw * (6 / 40);
    const spot10mLeft = m + cw * (10 / 40);
    const spot10mRight = w - m - cw * (10 / 40);

    // Draw little points for penalty spots
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(spot6mLeft, h / 2, 2.2, 0, 2 * Math.PI);
    ctx.arc(spot6mRight, h / 2, 2.2, 0, 2 * Math.PI);
    ctx.arc(spot10mLeft, h / 2, 1.8, 0, 2 * Math.PI);
    ctx.arc(spot10mRight, h / 2, 1.8, 0, 2 * Math.PI);
    ctx.fill();

    const isTalaveraAttackingRight = matchState.attackDirection !== 'izquierda';

    const leftGoalColor = isTalaveraAttackingRight ? '#004183' : (matchState.rivalColor || '#ff0000');
    const rightGoalColor = isTalaveraAttackingRight ? (matchState.rivalColor || '#ff0000') : '#004183';

    // Draw solid goals indicator
    ctx.fillStyle = leftGoalColor;
    ctx.fillRect(m - 7, h / 2 - 25, 7, 50);
    ctx.fillStyle = rightGoalColor;
    ctx.fillRect(w - m, h / 2 - 25, 7, 50);

    // Goal outlines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(m - 7, h / 2 - 25, 7, 50);
    ctx.strokeRect(w - m, h / 2 - 25, 7, 50);

    // Top Shot Telemetry in Main Heat Map: T:XX/XX/XX (Dentro / Fuera / Total) for the active half
    const currentHalfShotsForTelemetry = matchState.shotsEvents.filter(s => s.half === matchState.half);
    const localIn = currentHalfShotsForTelemetry.filter(s => s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
    const localOut = currentHalfShotsForTelemetry.filter(s => s.team === 'local' && s.type === 'out').length;
    const localTot = localIn + localOut;

    const rivalIn = currentHalfShotsForTelemetry.filter(s => s.team === 'rival' && (s.type === 'on_target' || s.type === 'goal')).length;
    const rivalOut = currentHalfShotsForTelemetry.filter(s => s.team === 'rival' && s.type === 'out').length;
    const rivalTot = rivalIn + rivalOut;

    const padShot = (n: number) => String(n).padStart(2, '0');
    const localColor = matchState.talaveraKit === '1ª Equipación' ? '#38bdf8' : '#ec4899';
    const rivalColor = matchState.rivalColor || '#ef4444';

    const localShotText = `LOCAL T:${padShot(localIn)}/${padShot(localOut)}/${padShot(localTot)}`;
    const rivalShotText = `${(matchState.rival || 'RIVAL').toUpperCase()} T:${padShot(rivalIn)}/${padShot(rivalOut)}/${padShot(rivalTot)}`;

    ctx.font = 'bold 11px monospace';
    ctx.textBaseline = 'middle';

    ctx.textAlign = 'left';
    ctx.fillStyle = localColor;
    ctx.fillText(localShotText, m + 2, 10);

    ctx.textAlign = 'right';
    ctx.fillStyle = rivalColor;
    ctx.fillText(rivalShotText, w - m - 2, 10);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText(`(Dentro / Fuera / Total)`, w / 2, 10);

    // Draw attack direction indicator on bottom of court (subtle elegant overlay overlaying nothing)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);

    const arrowY = h - 22;
    ctx.beginPath();
    if (isTalaveraAttackingRight) {
      // Arrow pointing right
      ctx.moveTo(w / 2 - 80, arrowY);
      ctx.lineTo(w / 2 + 80, arrowY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(w / 2 + 80, arrowY);
      ctx.lineTo(w / 2 + 73, arrowY - 4);
      ctx.lineTo(w / 2 + 73, arrowY + 4);
      ctx.closePath();
      ctx.fill();
    } else {
      // Arrow pointing left
      ctx.moveTo(w / 2 + 80, arrowY);
      ctx.lineTo(w / 2 - 80, arrowY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(w / 2 - 80, arrowY);
      ctx.lineTo(w / 2 - 73, arrowY - 4);
      ctx.lineTo(w / 2 - 73, arrowY + 4);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`ATAQUE FS TALAVERA ${isTalaveraAttackingRight ? '➡️' : '⬅️'}`, w / 2, arrowY - 8);

    // Now, render SHOT markers
    const currentHalfShots = matchState.shotsEvents.filter(s => s.half === matchState.half);

    currentHalfShots.forEach(shot => {
      // Map percentages back to canvas dimensions including margins
      const sx = m + (shot.x * cw) / 100;
      const sy = m + (shot.y * ch) / 100;

      const isLocal = shot.team === 'local';
      const markerColor = isLocal
        ? (matchState.talaveraKit === '1ª Equipación' ? '#38bdf8' : '#ec4899')
        : (matchState.rivalColor || '#ef4444');

      ctx.strokeStyle = markerColor;
      ctx.fillStyle = markerColor;

      if (shot.type === 'out') {
        // Draw elegant 'X'
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.moveTo(sx - 6, sy - 6);
        ctx.lineTo(sx + 6, sy + 6);
        ctx.moveTo(sx + 6, sy - 6);
        ctx.lineTo(sx - 6, sy + 6);
        ctx.stroke();

        if (isLocal && shot.playerNumber) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`#${shot.playerNumber}`, sx + 8, sy);
        }
      } else if (shot.type === 'on_target') {
        // Draw neat Circle 'O'
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.arc(sx, sy, 7, 0, 2 * Math.PI);
        ctx.stroke();

        if (isLocal && shot.playerNumber) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`#${shot.playerNumber}`, sx + 10, sy);
        }
      } else if (shot.type === 'goal') {
        // Draw solid double concentric circle
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, 2 * Math.PI);
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = '#ffffff'; // White ring border
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, 2 * Math.PI);
        ctx.fillStyle = markerColor;
        ctx.fill();

        // Write player number inside for locals or soccer ball symbol
        ctx.fillStyle = isLocal 
          ? (matchState.talaveraKit === '1ª Equipación' ? '#004183' : '#ffffff')
          : '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = shot.playerNumber ? `${shot.playerNumber}` : '⚽';
        ctx.fillText(text, sx, sy + 0.5);

        if (isLocal && shot.playerNumber) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`#${shot.playerNumber}`, sx + 13, sy);
        }

        // Draw small micro text label with exact time
        ctx.fillStyle = '#ffffff';
        ctx.font = '7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(shot.timeString, sx, sy + 15);
      }
    });

    if (clickCoords) {
      const sx = m + (clickCoords.x * cw) / 100;
      const sy = m + (clickCoords.y * ch) / 100;

      // Draw beautiful target reticle/crosshair of high visibility
      ctx.strokeStyle = '#f43f5e'; // Bright crimson-rose
      ctx.lineWidth = 1.8;

      // Concentric circles
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, 2 * Math.PI);
      ctx.stroke();

      // Crosshairs (+ sign)
      ctx.beginPath();
      ctx.moveTo(sx - 18, sy);
      ctx.lineTo(sx + 18, sy);
      ctx.moveTo(sx, sy - 18);
      ctx.lineTo(sx, sy + 18);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  // Canvas Click event coordinator
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (matchState.overallSeconds <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Scale pointer coordinates from CSS pixels to logical canvas pixels before subtracting m = 20
    const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const m = 20;
    const cw = canvas.width - 2 * m;
    const ch = canvas.height - 2 * m;

    const pctX = ((canvasX - m) / cw) * 100;
    const pctY = ((canvasY - m) / ch) * 100;

    // Protection to restrict inside field boundaries
    if (pctX < 0 || pctX > 100 || pctY < 0 || pctY > 100) return;

    setClickCoords({ x: pctX, y: pctY });
    setShotStep('team_select');
    setSelectedSubjectId(null);
  };

  // Convert seconds remaining to display format
  const displayChronometer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Adjust chronometer manually for referees sync in seconds
  const handleAdjustTimer = (secDelta: number) => {
    setMatchState(prev => {
      const maxSecs = (prev.periodDurationMinutes ?? 20) * 60;
      const nextSeconds = Math.max(0, Math.min(maxSecs, prev.overallSeconds + secDelta));
      const appliedDelta = nextSeconds - prev.overallSeconds; // Positive if remaining increased, negative if decreased

      const updatedPlayers = { ...prev.playersState };
      Object.keys(updatedPlayers).forEach(pid => {
        const ps = updatedPlayers[pid];
        if (ps.isOnCourt && !ps.redCard) {
          const adjustment = -appliedDelta;
          const prevShift = ps.currentShiftSeconds ?? 0;
          const clampedAdjustment = adjustment < 0 ? Math.max(adjustment, -prevShift) : adjustment;
          updatedPlayers[pid] = {
            ...ps,
            secondsPlayed: Math.max(0, ps.secondsPlayed + clampedAdjustment),
            currentShiftSeconds: Math.max(0, prevShift + clampedAdjustment)
          };
        }
      });

      const updatedPenalties = (prev.penaltyTimers || [])
        .map(pt => ({
          ...pt,
          secondsRemaining: Math.max(0, pt.secondsRemaining + appliedDelta)
        }))
        .filter(pt => pt.secondsRemaining > 0);

      return {
        ...prev,
        overallSeconds: nextSeconds,
        playersState: updatedPlayers,
        penaltyTimers: updatedPenalties
      };
    });
  };

  // Pre-match squad builder setup actions
  const handleStartMatch = () => {
    if (!matchState.rival.trim()) {
      alert('Por favor, indica primero el nombre del Rival.');
      return;
    }
    if (matchState.matchType === 'oficial' && (!matchState.jornada || matchState.jornada <= 0)) {
      alert('Por favor, introduce una Jornada de liga válida para los partidos oficiales.');
      return;
    }

    const eligibleIds = new Set(
      players
        .filter(p => p.isActive && p.status !== 'baja' && p.status !== 'lesionado' && p.status !== 'sancionado')
        .map(p => p.id)
    );
    const validTitulares = matchState.titulares.filter(id => Boolean(id && eligibleMapHas(eligibleIds, id)));

    if (validTitulares.length !== 5 || new Set(validTitulares).size !== 5) {
      alert('Debes convocar exactamente a 5 "Titulares" válidos y disponibles como quinteto inicial en cancha.');
      return;
    }
    const validSuplentes = matchState.suplentes.filter(id => eligibleIds.has(id) && !validTitulares.includes(id));
    if (matchState.matchType === 'oficial' && validSuplentes.length > 9) {
      alert('El número reglamentario máximo de "Suplentes" es de 9 jugadores/as.');
      return;
    }

    function eligibleMapHas(setIds: Set<string>, id: string) {
      return setIds.has(id);
    }

    // Initialize court state
    setMatchState(prev => {
      const startIds = prev.titulares.filter(id => Boolean(id && eligibleIds.has(id)));
      const cleanSuplentes = prev.suplentes.filter(id => eligibleIds.has(id) && !startIds.includes(id));

      const updatedPlayers: Record<string, LivePlayerState> = {};
      const allIds = new Set([...players.map(p => p.id), ...startIds, ...cleanSuplentes]);
      allIds.forEach(pId => {
        updatedPlayers[pId] = {
          playerId: pId,
          isOnCourt: startIds.includes(pId),
          shots: 0,
          goals: 0,
          yellows: 0,
          redCard: false,
          secondsPlayed: 0,
          secondsPlayed1st: 0,
          currentShiftSeconds: 0,
          timerStartTimestamp: null,
          saves: 0,
          goalsConceded: 0
        };
      });

      const initSecs = (prev.periodDurationMinutes ?? 20) * 60;
      const nowTs = Date.now();
      const initialRot: RotationEvent = {
        id: `rot-${nowTs}-h1`,
        half: 1,
        timeString: displayChronometer(initSecs),
        secondsRemaining: initSecs,
        type: 'initial_lineup',
        onCourtIds: startIds,
        timestamp: nowTs
      };

      const initialGK = pickBestGoalkeeper(startIds, players);

      return {
        ...prev,
        titulares: startIds,
        initialTitulares: startIds,
        suplentes: cleanSuplentes,
        activeGoalkeeperId: initialGK,
        playersState: updatedPlayers,
        isPreMatch: false,
        overallSeconds: initSecs,
        half: 1,
        localFouls1stHalf: 0,
        rivalFouls1stHalf: 0,
        shotsEvents: [],
        rotationEvents: [initialRot]
      };
    });
  };

  const handleSetSecondHalfStarter = (idx: number, playerId: string) => {
    setSecondHalfStarters(prev => {
      const updated = [...prev];
      updated[idx] = playerId;
      return updated;
    });
  };

  const handleStartSecondHalfFinal = (selectedStarters: string[]) => {
    const durationMin = matchState.periodDurationMinutes ?? 20;
    const newAttackDir = matchState.attackDirection === 'izquierda' ? 'derecha' : 'izquierda';

    setMatchState(prev => {
      const nowTs = Date.now();
      const currentOnCourt1st = Object.keys(prev.playersState).filter(pid => prev.playersState[pid]?.isOnCourt);
      const endHalf1Event: RotationEvent = {
        id: `rot-${nowTs}-end1`,
        half: 1,
        timeString: displayChronometer(prev.overallSeconds),
        secondsRemaining: prev.overallSeconds,
        type: 'half_end',
        onCourtIds: currentOnCourt1st,
        timestamp: nowTs
      };

      const cleanSelected = selectedStarters.filter(
        id => Boolean(id && !prev.playersState[id]?.redCard && (prev.playersState[id]?.yellows ?? 0) < 2)
      );
      const updatedPlayersState = { ...prev.playersState };

      // All players in the match get updated isOnCourt based on whether they are in cleanSelected
      Object.keys(updatedPlayersState).forEach(pId => {
        const isExp = updatedPlayersState[pId].redCard || updatedPlayersState[pId].yellows >= 2;
        updatedPlayersState[pId] = {
          ...updatedPlayersState[pId],
          secondsPlayed1st: updatedPlayersState[pId].secondsPlayed || 0, // Store 1st half seconds played
          secondsPlayed: 0, // Restart time tracking from 0 for 2nd half control
          currentShiftSeconds: 0,
          isOnCourt: cleanSelected.includes(pId) && !isExp
        };
      });

      const newGKId = pickBestGoalkeeper(cleanSelected, players, updatedPlayersState);

      const startHalf2Secs = durationMin * 60;
      const startHalf2Event: RotationEvent = {
        id: `rot-${nowTs + 1}-h2`,
        half: 2,
        timeString: displayChronometer(startHalf2Secs),
        secondsRemaining: startHalf2Secs,
        type: 'initial_lineup',
        onCourtIds: cleanSelected,
        timestamp: nowTs + 1
      };

      // Recompute the bench for the 2nd half: everyone previously called up
      // (starters + subs from the 1st half) who is NOT a starter now goes to the bench
      const previousConvocatedIds = new Set([...(prev.titulares || []), ...(prev.suplentes || [])]);
      const updatedSuplentes = Array.from(previousConvocatedIds).filter(id => !cleanSelected.includes(id));

      return {
        ...prev,
        half: 2,
        attackDirection: newAttackDir,
        titulares: cleanSelected,
        suplentes: updatedSuplentes,
        activeGoalkeeperId: newGKId,
        overallSeconds: startHalf2Secs,
        playersState: updatedPlayersState,
        rotationEvents: consolidateRotationEvents(
          [...(prev.rotationEvents || []), endHalf1Event, startHalf2Event],
          prev.shotsEvents
        )
      };
    });

    setIsTimerRunning(false);
    setShowFirstHalfSummaryModal(false);
  };

  // Substitutions / Rotation coordination
  const handleToggleSwapPlayer = (id: string) => {
    const ps = matchState.playersState[id];
    if (!ps || ps.isOnCourt || ps.redCard || ps.yellows >= 2) return;

    const hasActivePenalty = (matchState.penaltyTimers || []).some(pt => pt.secondsRemaining > 0);
    if (hasActivePenalty) {
      alert("No se puede introducir ninguna jugadora mientras esté activo el tiempo de expulsión (2 min).");
      return;
    }

    const onCourtIds = Object.entries(matchState.playersState)
      .filter(([_, value]) => (value as LivePlayerState).isOnCourt)
      .map(([pId]) => pId);

    const enteringPlayer = players.find(p => p.id === id);
    const isEnteringGK = Boolean(enteringPlayer && isNaturalGoalkeeper(enteringPlayer));

    if (onCourtIds.length >= 5) {
      setSubInPlayerId(id);
    } else {
      setMatchState(prev => {
        const prevPs = prev.playersState[id];
        if (!prevPs || prevPs.isOnCourt || prevPs.redCard || prevPs.yellows >= 2) return prev;
        if ((prev.penaltyTimers || []).some(pt => pt.secondsRemaining > 0)) return prev;

        const prevOnCourtIds = Object.keys(prev.playersState).filter(pid => prev.playersState[pid]?.isOnCourt);
        if (prevOnCourtIds.length >= 5) return prev;

        let updatedTitulares = [...(prev.titulares || [])];
        let updatedSuplentes = (prev.suplentes || []).filter(sId => sId !== id);
        const inactiveIndex = updatedTitulares.findIndex(tId => !prev.playersState[tId]?.isOnCourt);
        if (inactiveIndex !== -1) {
          const replacedId = updatedTitulares[inactiveIndex];
          updatedTitulares[inactiveIndex] = id;
          if (replacedId && replacedId !== id && !updatedSuplentes.includes(replacedId)) {
            updatedSuplentes = [...updatedSuplentes, replacedId];
          }
        } else if (updatedTitulares.length < 5 && !updatedTitulares.includes(id)) {
          updatedTitulares.push(id);
        }

        const updatedPlayersState = {
          ...prev.playersState,
          [id]: {
            ...prevPs,
            isOnCourt: true,
            currentShiftSeconds: 0
          }
        };
        const nextOnCourtIds = Object.keys(updatedPlayersState).filter(pid => updatedPlayersState[pid]?.isOnCourt);
        const prevGK = prev.activeGoalkeeperId;
        const prevGKValid = Boolean(prevGK && updatedPlayersState[prevGK]?.isOnCourt && !updatedPlayersState[prevGK]?.redCard);
        const prevGKPlayer = prevGK ? players.find(p => p.id === prevGK) : undefined;
        const prevGKIsNatural = Boolean(prevGKValid && prevGKPlayer && isNaturalGoalkeeper(prevGKPlayer));

        let nextGK = prevGK || '';
        if (!prevGKValid || (isEnteringGK && !prevGKIsNatural)) {
          nextGK = id;
        }

        const nowTs = Date.now();
        const enterEvent: RotationEvent = {
          id: `rot-${nowTs}-ent`,
          half: prev.half,
          timeString: displayChronometer(prev.overallSeconds),
          secondsRemaining: prev.overallSeconds,
          type: 'enter',
          inPlayerId: id,
          onCourtIds: nextOnCourtIds,
          timestamp: nowTs
        };

        return {
          ...prev,
          titulares: updatedTitulares,
          suplentes: updatedSuplentes,
          activeGoalkeeperId: nextGK,
          playersState: updatedPlayersState,
          rotationEvents: consolidateRotationEvents(
            [...(prev.rotationEvents || []), enterEvent],
            prev.shotsEvents
          )
        };
      });
    }
  };

  // Execute substitution after choosing who goes out
  const handleExecuteSubstitution = (exitingPlayerId: string) => {
    const enteringId = subInPlayerId;
    if (!enteringId) return;

    const enteringPlayer = players.find(p => p.id === enteringId);
    const isEnteringGK = Boolean(enteringPlayer && isNaturalGoalkeeper(enteringPlayer));

    setMatchState(prev => {
      if (!prev.playersState[exitingPlayerId]?.isOnCourt || !prev.playersState[enteringId]) {
        return prev;
      }

      const updated = { ...prev.playersState };
      updated[exitingPlayerId] = {
        ...updated[exitingPlayerId],
        isOnCourt: false,
        currentShiftSeconds: 0
      };
      updated[enteringId] = {
        ...updated[enteringId],
        isOnCourt: true,
        currentShiftSeconds: 0
      };

      const prevGK = prev.activeGoalkeeperId;
      const prevGKPlayer = prevGK ? players.find(p => p.id === prevGK) : undefined;
      const prevGKIsNaturalOnCourt = Boolean(
        prevGK &&
        prevGK !== exitingPlayerId &&
        updated[prevGK]?.isOnCourt &&
        prevGKPlayer &&
        isNaturalGoalkeeper(prevGKPlayer)
      );

      let nextActiveGK = prevGK || '';
      if (prevGK === exitingPlayerId || !nextActiveGK || !updated[nextActiveGK]?.isOnCourt || (isEnteringGK && !prevGKIsNaturalOnCourt)) {
        nextActiveGK = enteringId;
      }

      // Replace exiting player in titulares array, or append if missing
      let updatedTitulares = (prev.titulares || []).map(id => (id === exitingPlayerId ? enteringId : id));
      if (!updatedTitulares.includes(enteringId)) {
        updatedTitulares = [...updatedTitulares, enteringId];
      }

      const updatedSuplentes = (prev.suplentes || []).filter(id => id !== enteringId);
      if (exitingPlayerId && !updatedSuplentes.includes(exitingPlayerId)) {
        updatedSuplentes.push(exitingPlayerId);
      }

      const nextOnCourtIds = Object.keys(updated).filter(pid => updated[pid]?.isOnCourt);
      const nowTs = Date.now();
      const subEvent: RotationEvent = {
        id: `rot-${nowTs}-sub`,
        half: prev.half,
        timeString: displayChronometer(prev.overallSeconds),
        secondsRemaining: prev.overallSeconds,
        type: 'substitution',
        inPlayerId: enteringId,
        outPlayerId: exitingPlayerId,
        onCourtIds: nextOnCourtIds,
        timestamp: nowTs
      };

      return {
        ...prev,
        titulares: updatedTitulares,
        suplentes: updatedSuplentes,
        activeGoalkeeperId: nextActiveGK,
        playersState: updated,
        rotationEvents: consolidateRotationEvents(
          [...(prev.rotationEvents || []), subEvent],
          prev.shotsEvents
        )
      };
    });

    setSubInPlayerId(null);
  };

  // Record Shot directly
  const handleRecordShot = (
    team: 'local' | 'rival',
    type: 'out' | 'on_target' | 'goal',
    localPlayerId?: string,
    goalType?: GoalType
  ) => {
    if (!clickCoords) return;

    const coords = clickCoords;
    const pObj = localPlayerId ? players.find(p => p.id === localPlayerId) : undefined;
    const shotTs = Date.now();

    setMatchState(prev => {
      const currentOnCourtIds = Object.keys(prev.playersState).filter(pid => prev.playersState[pid]?.isOnCourt);
      const goalieId = prev.activeGoalkeeperId || (prev.titulares && prev.titulares[0]);

      const event: ShotEvent = {
        id: `s-${shotTs}`,
        x: coords.x,
        y: coords.y,
        team,
        type,
        goalType,
        playerId: localPlayerId,
        playerNumber: pObj?.number,
        goalkeeperId: team === 'rival' ? goalieId : undefined,
        timestamp: shotTs,
        timeString: displayChronometer(prev.overallSeconds),
        half: prev.half,
        onCourtIds: currentOnCourtIds
      };

      const updatedStats = { ...prev.playersState };
      let newGoalsFor = prev.goalsFor;
      let newGoalsAgainst = prev.goalsAgainst;

      // Update Local Player stats if attributed
      if (team === 'local' && localPlayerId && updatedStats[localPlayerId]) {
        const ps = updatedStats[localPlayerId];
        updatedStats[localPlayerId] = {
          ...ps,
          shots: ps.shots + 1,
          goals: type === 'goal' ? ps.goals + 1 : ps.goals
        };
        if (type === 'goal') {
          newGoalsFor += 1;
        }
      } else if (team === 'local' && type === 'goal') {
        // unattributed local goal
        newGoalsFor += 1;
      }

      // Update Goalkeeper stats on Rival action
      if (team === 'rival') {
        if (type === 'goal') {
          newGoalsAgainst += 1;
          // Conceded to goalie
          if (goalieId && updatedStats[goalieId]) {
            const gk = updatedStats[goalieId];
            updatedStats[goalieId] = {
              ...gk,
              goalsConceded: (gk.goalsConceded || 0) + 1
            };
          }
        } else if (type === 'on_target') {
          // Saved by goalie (parada)
          if (goalieId && updatedStats[goalieId]) {
            const gk = updatedStats[goalieId];
            updatedStats[goalieId] = {
              ...gk,
              saves: (gk.saves || 0) + 1
            };
          }
        }
      }

      return {
        ...prev,
        goalsFor: newGoalsFor,
        goalsAgainst: newGoalsAgainst,
        shotsEvents: [...prev.shotsEvents, event],
        playersState: updatedStats
      };
    });

    // Clear coordinates dialogue pop-over
    setClickCoords(null);
    setShotStep(null);
  };

  // Undo last recorded shot event (only within active half, atomic inside setMatchState)
  const handleUndoLastShotVal = () => {
    setMatchState(prev => {
      if (prev.shotsEvents.length === 0) return prev;
      const lastShot = prev.shotsEvents[prev.shotsEvents.length - 1];
      if (!lastShot || lastShot.half !== prev.half) return prev;

      const nextList = prev.shotsEvents.slice(0, -1);
      const removed = lastShot;
      const updatedStats = { ...prev.playersState };
      let newGoalsFor = prev.goalsFor;
      let newGoalsAgainst = prev.goalsAgainst;

      if (removed.team === 'local' && removed.playerId && updatedStats[removed.playerId]) {
        const ps = updatedStats[removed.playerId];
        updatedStats[removed.playerId] = {
          ...ps,
          shots: Math.max(0, ps.shots - 1),
          goals: removed.type === 'goal' ? Math.max(0, ps.goals - 1) : ps.goals
        };
        if (removed.type === 'goal') {
          newGoalsFor = Math.max(0, newGoalsFor - 1);
        }
      } else if (removed.team === 'local' && removed.type === 'goal') {
        newGoalsFor = Math.max(0, newGoalsFor - 1);
      }

      // Rollback Goalkeeper stats against exact recorded goalkeeperId (with fallback)
      if (removed.team === 'rival') {
        const gkId = removed.goalkeeperId || prev.activeGoalkeeperId || (prev.titulares && prev.titulares[0]);
        if (removed.type === 'goal') {
          newGoalsAgainst = Math.max(0, newGoalsAgainst - 1);
          if (gkId && updatedStats[gkId]) {
            const gk = updatedStats[gkId];
            updatedStats[gkId] = {
              ...gk,
              goalsConceded: Math.max(0, (gk.goalsConceded || 0) - 1)
            };
          }
        } else if (removed.type === 'on_target') {
          if (gkId && updatedStats[gkId]) {
            const gk = updatedStats[gkId];
            updatedStats[gkId] = {
              ...gk,
              saves: Math.max(0, (gk.saves || 0) - 1)
            };
          }
        }
      }

      return {
        ...prev,
        goalsFor: newGoalsFor,
        goalsAgainst: newGoalsAgainst,
        shotsEvents: nextList,
        playersState: updatedStats
      };
    });
  };

  // Manual Adjust direct scores
  const handleAdjustFouls = (team: 'local' | 'rival', diff: number) => {
    setMatchState(prev => {
      const is1st = prev.half === 1;
      if (team === 'local') {
        if (is1st) {
          return { ...prev, localFouls1stHalf: Math.max(0, Math.min(6, prev.localFouls1stHalf + diff)) };
        } else {
          return { ...prev, localFouls2ndHalf: Math.max(0, Math.min(6, prev.localFouls2ndHalf + diff)) };
        }
      } else {
        if (is1st) {
          return { ...prev, rivalFouls1stHalf: Math.max(0, Math.min(6, prev.rivalFouls1stHalf + diff)) };
        } else {
          return { ...prev, rivalFouls2ndHalf: Math.max(0, Math.min(6, prev.rivalFouls2ndHalf + diff)) };
        }
      }
    });
  };

  // Multi-yellow / direct red coordination
  const handlePlayerYellow = (pId: string, inc: number) => {
    setMatchState(prev => {
      const ps = prev.playersState[pId];
      if (!ps) return prev;

      const val = Math.max(0, Math.min(2, ps.yellows + inc));
      let isRed = ps.redCard;

      if (val === 2) {
        isRed = true;
      } else if (inc < 0 && ps.yellows === 2 && val < 2) {
        // Only clear redCard if expulsion came from double yellow
        isRed = false;
      }

      const wasOnCourt = ps.isOnCourt;
      const wasRed = ps.redCard;
      const isNewlyRed = isRed && !wasRed;

      let nextPenaltyTimers = [...(prev.penaltyTimers || [])];
      if (isNewlyRed && wasOnCourt) {
        const playerInfo = players.find(p => p.id === pId);
        const playerAlias = playerInfo ? (playerInfo.alias || playerInfo.name) : 'Jugador/a';
        const playerNumber = playerInfo ? playerInfo.number : '';
        nextPenaltyTimers.push({
          id: pId + '_' + Date.now(),
          playerId: pId,
          playerAlias,
          playerNumber,
          secondsRemaining: 120
        });
      } else if (!isRed) {
        nextPenaltyTimers = nextPenaltyTimers.filter(pt => pt.playerId !== pId);
      }

      const nextPlayersState = {
        ...prev.playersState,
        [pId]: {
          ...ps,
          yellows: val,
          redCard: isRed,
          isOnCourt: isRed ? false : ps.isOnCourt
        }
      };

      const nextOnCourtIds = Object.keys(nextPlayersState).filter(pid => nextPlayersState[pid]?.isOnCourt);
      let nextActiveGK = prev.activeGoalkeeperId || '';
      if (isRed && nextActiveGK === pId) {
        nextActiveGK = pickBestGoalkeeper(nextOnCourtIds, players, nextPlayersState);
      }

      let nextRotationEvents = prev.rotationEvents || [];
      if (isNewlyRed && wasOnCourt) {
        const nowTs = Date.now();
        nextRotationEvents = consolidateRotationEvents(
          [
            ...nextRotationEvents,
            {
              id: `rot-${nowTs}-red`,
              half: prev.half,
              timeString: displayChronometer(prev.overallSeconds),
              secondsRemaining: prev.overallSeconds,
              type: 'red_card',
              outPlayerId: pId,
              onCourtIds: nextOnCourtIds,
              timestamp: nowTs
            }
          ],
          prev.shotsEvents
        );
      }

      return {
        ...prev,
        activeGoalkeeperId: nextActiveGK,
        penaltyTimers: nextPenaltyTimers,
        playersState: nextPlayersState,
        rotationEvents: nextRotationEvents
      };
    });
  };

  // Direct Red toggler
  const handlePlayerDirectRed = (pId: string) => {
    setMatchState(prev => {
      const ps = prev.playersState[pId];
      if (!ps) return prev;
      const isRedNow = !ps.redCard;

      let nextPenaltyTimers = [...(prev.penaltyTimers || [])];
      if (isRedNow && ps.isOnCourt && !ps.redCard) {
        const playerInfo = players.find(p => p.id === pId);
        const playerAlias = playerInfo ? (playerInfo.alias || playerInfo.name) : 'Jugador/a';
        const playerNumber = playerInfo ? playerInfo.number : '';
        nextPenaltyTimers.push({
          id: pId + '_' + Date.now(),
          playerId: pId,
          playerAlias,
          playerNumber,
          secondsRemaining: 120
        });
      } else if (!isRedNow) {
        nextPenaltyTimers = nextPenaltyTimers.filter(pt => pt.playerId !== pId);
      }

      const nextPlayersState = {
        ...prev.playersState,
        [pId]: {
          ...ps,
          yellows: !isRedNow && ps.yellows >= 2 ? 1 : ps.yellows,
          redCard: isRedNow,
          isOnCourt: isRedNow ? false : ps.isOnCourt
        }
      };

      const nextOnCourtIds = Object.keys(nextPlayersState).filter(pid => nextPlayersState[pid]?.isOnCourt);
      let nextActiveGK = prev.activeGoalkeeperId || '';
      if (isRedNow && nextActiveGK === pId) {
        nextActiveGK = pickBestGoalkeeper(nextOnCourtIds, players, nextPlayersState);
      }

      let nextRotationEvents = prev.rotationEvents || [];
      if (isRedNow && ps.isOnCourt && !ps.redCard) {
        const nowTs = Date.now();
        nextRotationEvents = consolidateRotationEvents(
          [
            ...nextRotationEvents,
            {
              id: `rot-${nowTs}-red`,
              half: prev.half,
              timeString: displayChronometer(prev.overallSeconds),
              secondsRemaining: prev.overallSeconds,
              type: 'red_card',
              outPlayerId: pId,
              onCourtIds: nextOnCourtIds,
              timestamp: nowTs
            }
          ],
          prev.shotsEvents
        );
      }

      return {
        ...prev,
        activeGoalkeeperId: nextActiveGK,
        penaltyTimers: nextPenaltyTimers,
        playersState: nextPlayersState,
        rotationEvents: nextRotationEvents
      };
    });
  };

  // Undo accidental expulsion from the bench card
  const handleUndoExpulsion = (pId: string) => {
    setMatchState(prev => {
      const ps = prev.playersState[pId];
      if (!ps || (!ps.redCard && ps.yellows < 2)) return prev;

      const nextPlayersState = {
        ...prev.playersState,
        [pId]: {
          ...ps,
          redCard: false,
          yellows: ps.yellows >= 2 ? 1 : ps.yellows
        }
      };

      const nextPenaltyTimers = (prev.penaltyTimers || []).filter(pt => pt.playerId !== pId);

      // Remove matching red_card rotation event in current half if it is the last event for that half
      const existingRots = [...(prev.rotationEvents || [])];
      let removeIdx = -1;
      for (let i = existingRots.length - 1; i >= 0; i--) {
        const ev = existingRots[i];
        if (ev.half === prev.half && ev.type === 'red_card' && (ev.outPlayerId === pId || (ev.outPlayerIds || []).includes(pId))) {
          const hasLaterInHalf = existingRots.slice(i + 1).some(later => later.half === prev.half);
          if (!hasLaterInHalf) {
            removeIdx = i;
          }
          break;
        }
      }
      const nextRotationEvents =
        removeIdx !== -1
          ? consolidateRotationEvents(existingRots.filter((_, idx) => idx !== removeIdx), prev.shotsEvents)
          : existingRots;

      return {
        ...prev,
        penaltyTimers: nextPenaltyTimers,
        playersState: nextPlayersState,
        rotationEvents: nextRotationEvents
      };
    });
  };

  const resetLiveSessionState = () => {
    setIsTimerRunning(false);
    setMatchState(createDefaultLiveState());
    setClickCoords(null);
    setShotStep(null);
    setSelectedSubjectId(null);
    setSubInPlayerId(null);
    setSecondHalfStarters([]);
    setShowFirstHalfSummaryModal(false);
    setShowResetModal(false);
    setShowFinishModal(false);
    setEditingLocalScore(false);
    setEditingRivalScore(false);
  };

  // Advance half-time: pause timer and open summary modal
  const handleAdvanceToSecondHalf = () => {
    setIsTimerRunning(false);
    const nonExpelledStarters = (matchState.titulares || []).filter(id => {
      const ps = matchState.playersState[id];
      return Boolean(id && ps && !ps.redCard && ps.yellows < 2);
    });
    const activePenalties = (matchState.penaltyTimers || []).filter(pt => pt.secondsRemaining > 0).length;
    const requiredCount = Math.max(1, 5 - activePenalties);
    const padded = [...nonExpelledStarters.slice(0, requiredCount)];
    while (padded.length < 5) padded.push('');
    setSecondHalfStarters(padded);
    setShowFirstHalfSummaryModal(true);
  };

  // Archive and output entire results
  const handleFinishMatchArchive = () => {
    setIsTimerRunning(false);
    setShowFinishModal(true);
  };

  const confirmFinishMatchArchive = () => {
    // Extract statistics — only for players actually called up to this match
    const convocadasIds = new Set([
      ...(matchState.initialTitulares || []),
      ...(matchState.titulares || []),
      ...(matchState.suplentes || [])
    ]);

    const finalStats: Record<string, PlayerPerformance> = {};
    let totalPlayerShots = 0;
    let totalPlayerYellows = 0;

    players.filter(p => convocadasIds.has(p.id)).forEach(p => {
      const live = matchState.playersState[p.id] || {
        secondsPlayed: 0,
        secondsPlayed1st: 0,
        shots: 0,
        goals: 0,
        yellows: 0,
        redCard: false,
        saves: 0,
        goalsConceded: 0
      };

      const totalSecondsPlayed = (live.secondsPlayed1st || 0) + (live.secondsPlayed || 0);

      finalStats[p.id] = {
        secondsPlayed: totalSecondsPlayed,
        secondsPlayed1st: live.secondsPlayed1st || 0,
        secondsPlayed2nd: live.secondsPlayed || 0,
        shots: live.shots,
        goals: live.goals,
        yellows: live.yellows,
        redCard: live.redCard,
        saves: live.saves,
        goalsConceded: live.goalsConceded
      };

      totalPlayerShots += live.shots;
      totalPlayerYellows += live.yellows;
    });

    let winDrawLoss: 'W' | 'D' | 'L' = 'D';
    if (matchState.goalsFor > matchState.goalsAgainst) {
      winDrawLoss = 'W';
    } else if (matchState.goalsFor < matchState.goalsAgainst) {
      winDrawLoss = 'L';
    }

    const endTs = Date.now();
    const currentEndOnCourt = Object.keys(matchState.playersState).filter(
      pid => matchState.playersState[pid]?.isOnCourt
    );
    const endMatchRotEvent: RotationEvent = {
      id: `rot-${endTs}-end${matchState.half}`,
      half: matchState.half,
      timeString: displayChronometer(matchState.overallSeconds),
      secondsRemaining: matchState.overallSeconds,
      type: 'half_end',
      onCourtIds: currentEndOnCourt,
      timestamp: endTs
    };
    const finalRotationEvents = consolidateRotationEvents(
      [...(matchState.rotationEvents || []), endMatchRotEvent],
      matchState.shotsEvents
    );

    const startingFive =
      matchState.initialTitulares && matchState.initialTitulares.length === 5
        ? matchState.initialTitulares
        : matchState.titulares;

    const outputMatch: Omit<Match, 'id'> = {
      rival: matchState.rival.trim(),
      date: matchState.date,
      matchType: matchState.matchType,
      jornada: matchState.matchType === 'oficial' ? (Number(matchState.jornada) || 1) : undefined,
      goalsFor: matchState.goalsFor,
      goalsAgainst: matchState.goalsAgainst,
      result: winDrawLoss,
      teamShots: totalPlayerShots + matchState.teamShotsUnattributed,
      teamYellows: totalPlayerYellows + matchState.teamYellowsStaff,
      stats: finalStats,
      rivalColor: matchState.rivalColor,
      talaveraKit: matchState.talaveraKit,
      localFouls1stHalf: matchState.localFouls1stHalf,
      rivalFouls1stHalf: matchState.rivalFouls1stHalf,
      localFouls2ndHalf: matchState.localFouls2ndHalf,
      rivalFouls2ndHalf: matchState.rivalFouls2ndHalf,
      shotsEvents: matchState.shotsEvents,
      titulares: startingFive,
      suplentes: Array.from(convocadasIds).filter(id => !startingFive.includes(id)),
      teamId: activeTeamId,
      seasonId: activeSeasonId,
      periodDurationMinutes: matchState.periodDurationMinutes ?? 20,
      rotationEvents: finalRotationEvents
    };

    // Save match first so any PDF generation failure never loses the archived match
    onSaveMatch(outputMatch);
    try {
      exportMatchToPDF({ ...outputMatch, id: 'temp-id' }, players, activeTeamName);
    } catch (pdfErr) {
      console.error('Error generating match PDF:', pdfErr);
    }

    resetLiveSessionState();
  };

  // Quick helper lists
  const currentFoulsLocal = matchState.half === 1 ? matchState.localFouls1stHalf : matchState.localFouls2ndHalf;
  const currentFoulsRival = matchState.half === 1 ? matchState.rivalFouls1stHalf : matchState.rivalFouls2ndHalf;

  const isTalaveraAttackingRight = matchState.attackDirection !== 'izquierda';

  const convocatedIds = [...new Set([...(matchState.titulares || []), ...(matchState.suplentes || [])])].filter(Boolean);
  const convocatedRoster = players.filter(p => convocatedIds.includes(p.id));
  const onCourtPlayers = players
    .filter(p => p.isActive && convocatedIds.includes(p.id) && matchState.playersState[p.id]?.isOnCourt)
    .sort((a, b) => {
      const aIsActiveGK = a.id === activeGoalkeeperId;
      const bIsActiveGK = b.id === activeGoalkeeperId;
      if (aIsActiveGK && !bIsActiveGK) return -1;
      if (!aIsActiveGK && bIsActiveGK) return 1;

      const aIsNaturalGK = isNaturalGoalkeeper(a);
      const bIsNaturalGK = isNaturalGoalkeeper(b);
      if (aIsNaturalGK && !bIsNaturalGK) return -1;
      if (!aIsNaturalGK && bIsNaturalGK) return 1;

      return (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0);
    });
  const benchTeam = players
    .filter(p => !matchState.playersState[p.id]?.isOnCourt && p.isActive && convocatedIds.includes(p.id))
    .sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));

  // -------------------------------------------------------------
  // VIEW INTERFACE 1: CONVOCATORIA AND PARAMETERS PRE-PARTIDO
  // -------------------------------------------------------------
  if (matchState.isPreMatch) {
    const availablePlayers = players
      .filter(p => p.isActive && p.status !== 'baja')
      .sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
    const isPlayerUnavailable = (p: Player) => p.status === 'lesionado' || p.status === 'sancionado';
    
    // Starters list handlers
    const handleSetStarter = (index: number, playerId: string) => {
      setMatchState(prev => {
        const nextTitulares = [...prev.titulares];
        while (nextTitulares.length < 5) {
          nextTitulares.push('');
        }
        nextTitulares[index] = playerId;
        const nextSuplentes = playerId ? prev.suplentes.filter(id => id !== playerId) : prev.suplentes;
        return { ...prev, titulares: nextTitulares, suplentes: nextSuplentes };
      });
    };

    // Adds a player to suplentes roster list
    const handleAddSuplente = (playerId: string) => {
      const targetPlayer = players.find(p => p.id === playerId);
      if (!targetPlayer || targetPlayer.status === 'baja' || isPlayerUnavailable(targetPlayer)) return;
      if (matchState.suplentes.includes(playerId)) return;
      if (matchState.matchType === 'oficial' && matchState.suplentes.length >= 9) {
        alert('Solo puedes añadir un máximo de 9 suplentes en partidos oficiales.');
        return;
      }
      setMatchState(prev => {
        if (prev.suplentes.includes(playerId)) return prev;
        if (prev.matchType === 'oficial' && prev.suplentes.length >= 9) return prev;
        const nextStarters = prev.titulares.map(t => t === playerId ? '' : t);
        return {
          ...prev,
          titulares: nextStarters,
          suplentes: [...prev.suplentes, playerId]
        };
      });
    };

    const handleRemoveSuplente = (playerId: string) => {
      setMatchState(prev => ({
        ...prev,
        suplentes: prev.suplentes.filter(id => id !== playerId)
      }));
    };

    return (
      <div className="max-w-4xl mx-auto px-4 py-8" id="prematch-tracker-lobby">
        <div className="bg-white border border-slate-200 shadow-xl rounded-3xl p-6 md:p-8 space-y-8">
          
          {/* Main design banner header */}
          <div className="border-b border-slate-100 pb-5 text-center">
            <span className="bg-[#004183] text-white font-black text-[10px] uppercase px-2.5 py-1 rounded-md tracking-wider">
              FS TALAVERA OFICIAL
            </span>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-2 font-display">
              CONVOCATORIA Y PARÁMETROS PRE-PARTIDO
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              Completa los datos del partido, selecciona la convocatoria para el encuentro
            </p>
          </div>

          {/* BLOCK 1: Rival and Uniform Customizations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
            {/* Column 1: Rival Identity, Color & Uniform Selection */}
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Nombre del Equipo Rival
                </label>
                <input
                  type="text"
                  placeholder="Escribe el nombre del rival..."
                  value={matchState.rival}
                  onChange={e => setMatchState({ ...matchState, rival: e.target.value })}
                  id="squad-rival-input"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-[#004183] placeholder-slate-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Color del Rival
                </label>
                <div className="flex items-center gap-3 bg-white p-2 border border-slate-200 rounded-xl">
                  <input
                    type="color"
                    value={matchState.rivalColor}
                    onChange={e => setMatchState({ ...matchState, rivalColor: e.target.value })}
                    className="w-7 h-7 rounded-full cursor-pointer border border-slate-200 p-0 overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-full"
                  />
                  <div className="text-xs">
                    <p className="font-bold text-slate-700">Rival</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Equipación FS Talavera · ¿Local o Visitante?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setMatchState({ ...matchState, talaveraKit: '1ª Equipación' })}
                    className={`p-2 rounded-xl border text-xs font-extrabold transition cursor-pointer select-none text-center ${
                      matchState.talaveraKit === '1ª Equipación'
                        ? 'bg-[#38bdf8] text-slate-950 border-[#38bdf8] shadow-md ring-2 ring-[#38bdf8]/40'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-base">🏠</span>
                    <span className="block font-extrabold">Local</span>
                    <span className="block text-[10px] font-bold mt-0.5 uppercase tracking-wide">1ª Equipación · Azul</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchState({ ...matchState, talaveraKit: '2ª Equipación' })}
                    className={`p-2 rounded-xl border text-xs font-extrabold transition cursor-pointer select-none text-center ${
                      matchState.talaveraKit === '2ª Equipación'
                        ? 'bg-[#ec4899] text-white border-[#ec4899] shadow-md ring-2 ring-[#ec4899]/40'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-base">✈️</span>
                    <span className="block font-extrabold">Visitante</span>
                    <span className="block text-[10px] font-bold mt-0.5 uppercase tracking-wide">2ª Equipación · Rosa</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Column 2: Date and Match parameters */}
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Fecha</label>
                <input
                  type="date"
                  value={matchState.date}
                  onChange={e => setMatchState({ ...matchState, date: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-xs font-semibold text-center"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Tipo de Encuentro
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMatchState({ ...matchState, matchType: 'oficial', jornada: 1, periodDurationMinutes: 20, overallSeconds: 1200 })}
                      className={`px-4 py-2.5 rounded-xl border text-[11px] font-bold transition select-none cursor-pointer text-center ${
                        matchState.matchType === 'oficial'
                          ? 'bg-[#004183] text-white border-[#004183] shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      🏆 Oficial
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatchState({ ...matchState, matchType: 'amistoso', jornada: undefined })}
                      className={`px-4 py-2.5 rounded-xl border text-[11px] font-bold transition select-none cursor-pointer text-center ${
                        matchState.matchType === 'amistoso'
                          ? 'bg-[#FFD700] text-[#004183] border-[#FFD700] shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      🤝 Amistoso
                    </button>
                  </div>
                </div>

                {matchState.matchType === 'oficial' && (
                  <div className="col-span-1 animate-fade-in">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 text-center">
                      Jornada
                    </label>
                    <input
                      key="input-jornada-oficial"
                      type="number"
                      min="1"
                      value={matchState.jornada !== undefined ? matchState.jornada : ''}
                      onChange={e => setMatchState({ ...matchState, jornada: parseInt(e.target.value) || undefined })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2.5 text-slate-800 font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-[#004183]"
                    />
                  </div>
                )}

                {matchState.matchType === 'amistoso' && (
                  <div className="col-span-1 animate-fade-in">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 text-center">
                      Parte (Mins)
                    </label>
                    <div className="flex items-center justify-center gap-1 bg-white border border-slate-200 rounded-xl p-1 h-[42px]">
                      <button
                        type="button"
                        onClick={() => {
                          const current = matchState.periodDurationMinutes ?? 20;
                          if (current > 1) {
                            setMatchState({
                              ...matchState,
                              periodDurationMinutes: current - 1,
                              overallSeconds: (current - 1) * 60
                            });
                          }
                        }}
                        className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold rounded-lg text-xs select-none cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={matchState.periodDurationMinutes ?? ''}
                        onChange={e => {
                          if (e.target.value === '') {
                            setMatchState({ ...matchState, periodDurationMinutes: undefined });
                            return;
                          }
                          const raw = parseInt(e.target.value, 10);
                          if (!Number.isNaN(raw)) {
                            const clamped = Math.max(1, Math.min(120, raw));
                            setMatchState({
                              ...matchState,
                              periodDurationMinutes: clamped,
                              overallSeconds: clamped * 60
                            });
                          }
                        }}
                        onBlur={() => {
                          if (!matchState.periodDurationMinutes || matchState.periodDurationMinutes < 1) {
                            setMatchState(prev => ({
                              ...prev,
                              periodDurationMinutes: 20,
                              overallSeconds: 1200
                            }));
                          }
                        }}
                        className="w-9 bg-transparent border-none text-slate-800 font-mono font-bold text-center focus:outline-none text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const current = matchState.periodDurationMinutes ?? 20;
                          if (current < 120) {
                            setMatchState({
                              ...matchState,
                              periodDurationMinutes: current + 1,
                              overallSeconds: (current + 1) * 60
                            });
                          }
                        }}
                        className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold rounded-lg text-xs select-none cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#004183] mb-2">
                  Dirección Inicial del Ataque (1ª Parte)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMatchState({ ...matchState, attackDirection: 'derecha' })}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold transition cursor-pointer select-none text-center flex flex-col items-center justify-center ${
                      (matchState.attackDirection || 'derecha') === 'derecha'
                        ? 'bg-[#004183] text-white border-[#004183] shadow-md'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-extrabold">Atacar a Derecha ➡️</span>
                    <span className="block text-[9px] font-medium opacity-80 mt-0.5">(Rival defiende derecha)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchState({ ...matchState, attackDirection: 'izquierda' })}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold transition cursor-pointer select-none text-center flex flex-col items-center justify-center ${
                      matchState.attackDirection === 'izquierda'
                        ? 'bg-[#004183] text-white border-[#004183] shadow-md'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-extrabold">⬅️ Atacar a Izquierda</span>
                    <span className="block text-[9px] font-medium opacity-80 mt-0.5">(Rival defiende izquierda)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* BLOCK 2: Titulares selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-extrabold text-[#004183] uppercase tracking-wider flex items-center gap-2 font-display">
                <img
                  referrerPolicy="no-referrer"
                  src="https://api.clupik.com/clubs/10590/images/navbar.png"
                  alt="FS Talavera"
                  className="w-5 h-5 object-contain"
                />
                Quinteto Titular
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[0, 1, 2, 3, 4].map(idx => {
                const currentId = matchState.titulares[idx];
                const starter = players.find(p => p.id === currentId);
                return (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex flex-col justify-between space-y-2 shadow-xs">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block text-center border-b border-slate-100 pb-0.5">
                      {idx === 0 
                        ? `Titular 1 (${starter?.gender === 'M' ? 'Portero' : starter?.gender === 'F' ? 'Portera' : 'Portero/a'} 🧤)` 
                        : `Titular ${idx + 1}`}
                    </span>
                    
                    {/* Visual Player Mini-Thumbnail Circular */}
                    <div className="flex items-center justify-center py-0.5">
                      {starter?.photo ? (
                        <div className="relative">
                          <img
                            referrerPolicy="no-referrer"
                            src={starter.photo}
                            alt={starter.name}
                            className="w-11 h-11 rounded-full object-cover border-2 border-slate-200 shadow"
                          />
                          <span className="absolute -bottom-1 -right-1 bg-yellow-400 text-blue-950 font-mono text-[8.5px] font-bold px-1.5 py-0.5 rounded-full border border-white leading-none shadow">
                            {starter.number}
                          </span>
                        </div>
                      ) : starter ? (
                        <div className="relative w-11 h-11 rounded-full bg-blue-950 text-yellow-400 font-mono flex items-center justify-center font-bold text-xs border-2 border-slate-200 uppercase select-none shadow">
                          {(starter.alias || starter.name).substring(0, 2)}
                          <span className="absolute -bottom-1 -right-1 bg-yellow-400 text-blue-950 font-mono text-[8.5px] font-bold px-1.5 py-0.5 rounded-full border border-white leading-none shadow">
                            {starter.number}
                          </span>
                        </div>
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 animate-pulse">
                          <User size={16} />
                        </div>
                      )}
                    </div>

                    <select
                      value={currentId || ''}
                      onChange={e => handleSetStarter(idx, e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-1 text-[11px] text-slate-700 font-bold focus:outline-none focus:ring-2 focus:ring-[#004183] cursor-pointer"
                    >
                      <option value="">-- Elegir --</option>
                      {availablePlayers.map(p => {
                        const isUnavailable = isPlayerUnavailable(p);
                        const isChosenElsewhere = matchState.titulares.includes(p.id) && matchState.titulares[idx] !== p.id;
                        const statusSuffix = p.status === 'lesionado' ? ' · Lesionado/a' : p.status === 'sancionado' ? ' · Sancionado/a' : '';
                        return (
                          <option key={p.id} value={p.id} disabled={isChosenElsewhere || isUnavailable}>
                            #{p.number} - {getDisambiguatedPlayerLabel(p, availablePlayers, false)} ({p.position === 'Portero/a' ? (p.gender === 'M' ? 'Portero' : 'Portera') : p.position}{statusSuffix})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* BLOCK 3: Suplentes builder max 9 */}
          <div className="space-y-4">
            <h3 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1 border-b border-slate-100 pb-2 font-display">
              <Users size={16} /> Jugadores/as Suplentes {matchState.matchType === 'oficial' ? `(Máx. 9 seleccionados: ${matchState.suplentes.length} / 9)` : `(${matchState.suplentes.length} seleccionados)`}
            </h3>

            {/* Quick click pool button list with visual thumbnails */}
            <div className="flex flex-wrap gap-3 text-xs">
              {availablePlayers.map(p => {
                const isStarter = matchState.titulares.includes(p.id);
                const isSuplente = matchState.suplentes.includes(p.id);
                const isStarterOnlyNoSub = isStarter && !isSuplente;
                const isUnavailable = isPlayerUnavailable(p);
                const isDisabledBtn = isStarterOnlyNoSub || (isUnavailable && !isSuplente);
                
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (isStarterOnlyNoSub) return;
                      if (isStarter && isSuplente) {
                        handleRemoveSuplente(p.id);
                        return;
                      }
                      if (isSuplente) {
                        handleRemoveSuplente(p.id);
                      } else if (!isUnavailable) {
                        handleAddSuplente(p.id);
                      }
                    }}
                    disabled={isDisabledBtn}
                    className={`p-1.5 pr-3 rounded-xl border font-bold transition flex items-center gap-2 select-none ${
                      isDisabledBtn
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-65'
                        : isSuplente
                        ? 'bg-yellow-400 text-blue-950 border-yellow-400 shadow ring-2 ring-yellow-400 cursor-pointer'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    {p.photo ? (
                      <img referrerPolicy="no-referrer" src={p.photo} className="w-7 h-7 rounded-full object-cover border border-slate-200" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-blue-950 text-yellow-400 text-[10px] font-bold flex items-center justify-center uppercase select-none border">
                        {(p.alias || p.name).substring(0, 2)}
                      </div>
                    )}
                    <div className="flex flex-col text-left leading-none shrink-0">
                      <span className="text-[9px] text-slate-400 font-mono">#{p.number}</span>
                      <span className="text-xs">{getDisambiguatedPlayerLabel(p, availablePlayers, false)}</span>
                    </div>
                    {isStarterOnlyNoSub && <span className="text-[8px] uppercase font-normal text-slate-400">(Titular)</span>}
                    {!isStarterOnlyNoSub && isUnavailable && (
                      <span className="text-[8px] uppercase font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">
                        {p.status === 'lesionado' ? 'Lesionado/a' : 'Sancionado/a'}
                      </span>
                    )}
                    {isSuplente && <span className="text-[9px] rounded-full bg-yellow-600/30 px-1 hover:bg-yellow-600/40 text-blue-950">✕</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* VERIFY / SUBMIT */}
          <div className="pt-6 border-t border-slate-100 flex flex-col items-center justify-center space-y-3">
            {/* Dynamic visual badge explaining blocking */}
            {(!matchState.rival.trim() || (matchState.matchType === 'oficial' && (!matchState.jornada || matchState.jornada <= 0)) || matchState.titulares.filter(id => Boolean(id && availablePlayers.some(ap => ap.id === id && !isPlayerUnavailable(ap)))).length !== 5 || (matchState.matchType === 'oficial' && matchState.suplentes.length > 9)) && (
              <p className="text-xs font-semibold text-rose-500 bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl flex items-center gap-1">
                ⚠️ Completa el Nombre del Rival, {matchState.matchType === 'oficial' ? 'la Jornada, ' : ''}selecciona exactamente 5 Titulares disponibles{matchState.matchType === 'oficial' ? ' y un máximo de 9 Suplentes' : ''} para comenzar el partido.
              </p>
            )}
            <button
               onClick={handleStartMatch}
              disabled={!matchState.rival.trim() || (matchState.matchType === 'oficial' && (!matchState.jornada || matchState.jornada <= 0)) || matchState.titulares.filter(id => Boolean(id && availablePlayers.some(ap => ap.id === id && !isPlayerUnavailable(ap)))).length !== 5 || (matchState.matchType === 'oficial' && matchState.suplentes.length > 9)}
              id="btn-prematch-start"
              className={`font-black text-sm uppercase px-12 py-5 rounded-2xl transition cursor-pointer shadow-lg tracking-wider space-y-1 border-b-4 ${
                (!matchState.rival.trim() || (matchState.matchType === 'oficial' && (!matchState.jornada || matchState.jornada <= 0)) || matchState.titulares.filter(id => Boolean(id && availablePlayers.some(ap => ap.id === id && !isPlayerUnavailable(ap)))).length !== 5 || (matchState.matchType === 'oficial' && matchState.suplentes.length > 9))
                  ? 'bg-slate-300 text-slate-500 border-slate-400 cursor-not-allowed opacity-50'
                  : 'bg-[#004183] text-white hover:bg-[#002f61] border-yellow-500 hover:scale-[1.01]'
              }`}
            >
              Empezar Partido ⏱️
            </button>
          </div>

        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW INTERFACE 2: THE ACTIVE GAME TRACKING MAIN ROOM
  // -------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6" id="live-tracker-game-room">
      
      {/* 1. SCOREBOARD TIMER FOUL BAR HEADER CARD */}
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-3.5 md:p-4 shadow-xl relative overflow-hidden">
        {/* Glow accent matching current kit */}
        <div className={`absolute right-0 top-0 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-10 ${
          matchState.talaveraKit === '1ª Equipación' ? 'bg-blue-600' : 'bg-yellow-500'
        }`}></div>

        <div className="flex flex-col gap-2.5">
          
          {/* Metadata Display in single compact line */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pb-2 border-b border-slate-800/85 text-xs">
            <span className="bg-yellow-500 text-[#004183] font-black text-[10px] uppercase px-2.5 py-0.5 rounded-md tracking-wider shrink-0">
               {matchState.half}ª PARTE
            </span>
            <span className="text-xs text-slate-400 font-bold tracking-widest bg-slate-850/60 px-2 py-0.5 rounded shrink-0">
              {matchState.talaveraKit === '1ª Equipación' ? 'Local' : 'Visitante'}
            </span>
            <span className="text-slate-600 font-bold">•</span>
            <div className="text-base font-black text-white flex items-center gap-1 font-display">
              vs <span className="text-[#FFD700] font-bold font-sans">{matchState.rival}</span>
            </div>
            <span className="text-slate-600 font-bold">•</span>
            <span className="text-slate-300 font-semibold bg-slate-850/40 px-2.5 py-0.5 rounded">
              {matchState.matchType === 'amistoso' ? 'Amistoso' : `Jornada ${matchState.jornada}`}
            </span>
            <span className="text-slate-600 font-bold">•</span>
            <span className="text-xs text-slate-400 font-mono bg-slate-850/40 px-2.5 py-0.5 rounded">
              {matchState.date}
            </span>
          </div>

          {/* MAIN SCOREBOARD CENTER PIECE (Unified with compact fouls) */}
          <div className="flex flex-col md:flex-row items-center justify-around bg-slate-950/50 border border-slate-850 rounded-xl p-3 gap-3 md:gap-0">
            
            {/* HOME TEAM: FS Talavera */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-[#FFD700] tracking-widest">FS TALAVERA</span>
              {editingLocalScore ? (
                <input
                  type="number"
                  min="0"
                  value={matchState.goalsFor}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setMatchState(prev => ({ ...prev, goalsFor: Math.max(0, val) }));
                  }}
                  onBlur={() => setEditingLocalScore(false)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') setEditingLocalScore(false);
                  }}
                  autoFocus
                  className="w-16 text-center text-4xl font-black bg-slate-900 text-yellow-500 border border-[#004183] mt-1 mb-2 rounded-lg py-1.5 focus:ring-2 focus:ring-[#FFD700]"
                />
              ) : (
                <div
                  onClick={() => setEditingLocalScore(true)}
                  className="text-5xl font-black font-display my-1 cursor-pointer hover:text-yellow-400 select-none transition"
                  title="Haz clic para editar manualmente"
                >
                  {matchState.goalsFor}
                </div>
              )}
              
              {/* direct score overrides */}
              <div className="flex gap-1">
                <button
                  onClick={() => setMatchState(prev => ({ ...prev, goalsFor: Math.max(0, prev.goalsFor - 1) }))}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-xs cursor-pointer"
                >-</button>
                <button
                  onClick={() => setMatchState(prev => ({ ...prev, goalsFor: prev.goalsFor + 1 }))}
                  className="w-6 h-6 rounded bg-[#004183] hover:bg-[#002f61] flex items-center justify-center text-xs font-bold cursor-pointer"
                >+</button>
              </div>

              {/* INTEGRATED COMPACT FOULS & T.M. */}
              <div className="flex items-center gap-1.5 mt-2.5">
                {/* FALTAS ACUMULADAS */}
                <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/80 rounded-lg px-2 py-0.5" title="Faltas acumuladas local">
                  <span className="text-[8.5px] uppercase font-bold text-slate-400">Faltas:</span>
                  <span className={`text-[11px] font-mono font-extrabold ${currentFoulsLocal >= 5 ? 'text-rose-500 animate-pulse' : 'text-[#38bdf8]'}`}>
                    {currentFoulsLocal}
                  </span>
                  <span className="text-[8px] text-slate-500">/6</span>
                  <div className="flex gap-0.5 ml-1 border-l border-slate-800/80 pl-1">
                    <button
                      onClick={() => handleAdjustFouls('local', -1)}
                      type="button"
                      className="w-3.5 h-3.5 bg-slate-800 hover:bg-slate-750 text-[10px] font-bold rounded flex items-center justify-center text-white cursor-pointer select-none"
                    >-</button>
                    <button
                      onClick={() => handleAdjustFouls('local', 1)}
                      type="button"
                      className="w-3.5 h-3.5 bg-[#38bdf8] hover:bg-[#0284c7] text-[10px] font-bold rounded flex items-center justify-center text-slate-950 cursor-pointer select-none"
                    >+</button>
                  </div>
                </div>

                {/* TIEMPO MUERTO (T.M.) */}
                <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/80 rounded-lg px-2 py-0.5" title="Tiempo Muerto Local">
                  <span className="text-[8.5px] uppercase font-bold text-slate-400">T.M.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMatchState(prev => {
                        const is1st = prev.half === 1;
                        if (is1st) {
                          return { ...prev, localTimeout1stHalfCalled: !prev.localTimeout1stHalfCalled };
                        } else {
                          return { ...prev, localTimeout2ndHalfCalled: !prev.localTimeout2ndHalfCalled };
                        }
                      });
                    }}
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition focus:outline-none cursor-pointer select-none leading-none ${
                      (matchState.half === 1 ? matchState.localTimeout1stHalfCalled : matchState.localTimeout2ndHalfCalled)
                        ? 'bg-[#FFD700] border-[#FFD700] text-slate-950 font-black text-[9px]'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-transparent'
                    }`}
                    title="Marcar Tiempo Muerto Local"
                  >
                    {(matchState.half === 1 ? matchState.localTimeout1stHalfCalled : matchState.localTimeout2ndHalfCalled) ? '✓' : ''}
                  </button>
                </div>
              </div>
            </div>

            {/* CHRONOMETER SYSTEM CONTROLS COUNT DOWN */}
            <div className="flex flex-col items-center px-4 border-x border-slate-800/80">
              <div className="flex flex-col items-center mb-1.5 space-y-1">
                <span className="text-[10px] font-black tracking-widest bg-[#004183] text-[#FFD700] px-3 py-1 rounded-full uppercase leading-none select-none">
                  {matchState.half}ª PARTE ⏱️
                </span>
              </div>

              <span className="text-3xl font-mono font-bold text-yellow-400 tabular-nums tracking-widest">
                {displayChronometer(matchState.overallSeconds)}
              </span>

              {/* Start / Pause buttons */}
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  disabled={!isTimerRunning && matchState.overallSeconds <= 0}
                  id="btn-play-pause-tracking"
                  className={`flex items-center gap-1 text-[10px] font-black px-3 py-1.5 rounded-lg transition select-none ${
                    !isTimerRunning && matchState.overallSeconds <= 0
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : isTimerRunning
                        ? 'bg-amber-600 cursor-pointer'
                        : 'bg-emerald-600 cursor-pointer'
                  }`}
                >
                  {isTimerRunning ? <Pause size={10} /> : <Play size={10} />}
                  {isTimerRunning ? 'PAUSA' : 'CORRER'}
                </button>

                {/* Adjust sync minutes and seconds */}
                <button
                  onClick={() => handleAdjustTimer(60)}
                  className="bg-slate-800 text-[9px] px-1.5 rounded cursor-pointer"
                  title="Sumar 1m"
                >+1m</button>
                <button
                  onClick={() => handleAdjustTimer(-60)}
                  className="bg-slate-800 text-[9px] px-1.5 rounded cursor-pointer"
                  title="Restar 1m"
                >-1m</button>
                <button
                  onClick={() => handleAdjustTimer(1)}
                  className="bg-slate-800 text-[9px] px-1.5 rounded cursor-pointer"
                  title="Sumar 1s"
                >+1s</button>
                <button
                  onClick={() => handleAdjustTimer(-1)}
                  className="bg-slate-800 text-[9px] px-1.5 rounded cursor-pointer"
                  title="Restar 1s"
                >-1s</button>
              </div>
            </div>

            {/* RIVAL TEAM */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold text-slate-400 tracking-widest truncate max-w-[95px]">
                {(matchState.rival || 'RIVAL').toUpperCase()}
              </span>
              {editingRivalScore ? (
                <input
                  type="number"
                  min="0"
                  value={matchState.goalsAgainst}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setMatchState(prev => ({ ...prev, goalsAgainst: Math.max(0, val) }));
                  }}
                  onBlur={() => setEditingRivalScore(false)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') setEditingRivalScore(false);
                  }}
                  autoFocus
                  className="w-16 text-center text-4xl font-black bg-slate-900 text-yellow-500 border border-[#475569] mt-1 mb-2 rounded-lg py-1.5 focus:ring-2 focus:ring-[#FFD700]"
                />
              ) : (
                <div
                  onClick={() => setEditingRivalScore(true)}
                  className="text-5xl font-black font-display my-1 cursor-pointer hover:text-rose-400 select-none transition"
                  title="Haz clic para editar manualmente"
                >
                  {matchState.goalsAgainst}
                </div>
              )}
              
              <div className="flex gap-1">
                <button
                  onClick={() => setMatchState(prev => {
                    const next = Math.max(0, prev.goalsAgainst - 1);
                    return { ...prev, goalsAgainst: next };
                  })}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-750 flex items-center justify-center text-xs cursor-pointer"
                >-</button>
                <button
                  onClick={() => setMatchState(prev => {
                    const next = prev.goalsAgainst + 1;
                    return { ...prev, goalsAgainst: next };
                  })}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-750 flex items-center justify-center text-xs font-bold cursor-pointer"
                >+</button>
              </div>

              {/* INTEGRATED COMPACT FOULS & T.M. */}
              <div className="flex items-center gap-1.5 mt-2.5">
                {/* FALTAS ACUMULADAS */}
                <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/80 rounded-lg px-2 py-0.5" title="Faltas acumuladas rival">
                  <span className="text-[8.5px] uppercase font-bold text-slate-400">Faltas:</span>
                  <span className={`text-[11px] font-mono font-extrabold ${currentFoulsRival >= 5 ? 'text-rose-500 animate-pulse' : 'text-slate-300'}`}>
                    {currentFoulsRival}
                  </span>
                  <span className="text-[8px] text-slate-500">/6</span>
                  <div className="flex gap-0.5 ml-1 border-l border-slate-800/80 pl-1">
                    <button
                      onClick={() => handleAdjustFouls('rival', -1)}
                      type="button"
                      className="w-3.5 h-3.5 bg-slate-800 hover:bg-slate-750 text-[10px] font-bold rounded flex items-center justify-center text-white cursor-pointer select-none"
                    >-</button>
                    <button
                      onClick={() => handleAdjustFouls('rival', 1)}
                      type="button"
                      className="w-3.5 h-3.5 bg-rose-600 hover:bg-rose-500 text-[10px] font-bold rounded flex items-center justify-center text-white cursor-pointer select-none"
                    >+</button>
                  </div>
                </div>

                {/* TIEMPO MUERTO (T.M.) */}
                <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/80 rounded-lg px-2 py-0.5" title="Tiempo Muerto Rival">
                  <span className="text-[8.5px] uppercase font-bold text-slate-400">T.M.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMatchState(prev => {
                        const is1st = prev.half === 1;
                        if (is1st) {
                          return { ...prev, rivalTimeout1stHalfCalled: !prev.rivalTimeout1stHalfCalled };
                        } else {
                          return { ...prev, rivalTimeout2ndHalfCalled: !prev.rivalTimeout2ndHalfCalled };
                        }
                      });
                    }}
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition focus:outline-none cursor-pointer select-none leading-none ${
                      (matchState.half === 1 ? matchState.rivalTimeout1stHalfCalled : matchState.rivalTimeout2ndHalfCalled)
                        ? 'bg-[#FFD700] border-[#FFD700] text-slate-950 font-black text-[9px]'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-transparent'
                    }`}
                    title="Marcar Tiempo Muerto Rival"
                  >
                    {(matchState.half === 1 ? matchState.rivalTimeout1stHalfCalled : matchState.rivalTimeout2ndHalfCalled) ? '✓' : ''}
                  </button>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* 1.1 RULES BONUS WARNING BLOCKS */}
        {(currentFoulsLocal >= 5 || currentFoulsRival >= 5) && (
          <div className="mt-3 bg-rose-950/50 border border-rose-800 p-3 rounded-2xl flex items-center justify-center gap-2.5 text-center text-white text-xs font-extrabold animate-pulse">
            <AlertTriangle size={15} className="text-yellow-400" />
            <span>
              {currentFoulsLocal >= 5 && '¡BONUS LOCAL ACTIVO! Faltas al límite. El próximo tiro rival dispondrá de doble penalty.'}
              {currentFoulsLocal >= 5 && currentFoulsRival >= 5 && ' | '}
              {currentFoulsRival >= 5 && '¡RIVAL EN BONUS! Posibilidad directa de doble penalty a nuestro favor ante su siguiente falta.'}
            </span>
          </div>
        )}
      </div>

      {/* CORE ACTIVE WORKSPACE LAYOUT COLLATERAL */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* INTERACTIVE SHOT COURT MAP BOARD COLUMN LEFT */}
        {(() => {
          const currentHalfShots = matchState.shotsEvents.filter(s => s.half === matchState.half);
          const cLocalIn = currentHalfShots.filter(s => s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
          const cLocalOut = currentHalfShots.filter(s => s.team === 'local' && s.type === 'out').length;
          const cLocalTot = cLocalIn + cLocalOut;

          const cRivalIn = currentHalfShots.filter(s => s.team === 'rival' && (s.type === 'on_target' || s.type === 'goal')).length;
          const cRivalOut = currentHalfShots.filter(s => s.team === 'rival' && s.type === 'out').length;
          const cRivalTot = cRivalIn + cRivalOut;

          const padVal = (n: number) => String(n).padStart(2, '0');

          return (
            <div className="xl:col-span-8 bg-white border border-slate-200 rounded-3xl p-4 shadow-sm relative space-y-4">
              <div className="flex flex-wrap justify-between items-center bg-slate-50 p-2.5 rounded-2xl border border-slate-100 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold text-[#004183] uppercase tracking-wider flex items-center gap-1">
                    <Play className="fill-[#004183] text-[#004183]" size={12} />
                    <span>Mapa de Calor</span>
                  </span>
                </div>

                {/* Scoreboard Telemetry Pill T:XX/XX/XX (Parte Actual) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-xl shadow-2xs font-mono">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: matchState.talaveraKit === '1ª Equipación' ? '#0284c7' : '#db2777' }}></span>
                    <span className="text-[10px] font-bold text-slate-500">LCL:</span>
                    <span className="text-xs font-black text-[#004183] tracking-wide">
                      T:{padVal(cLocalIn)}/{padVal(cLocalOut)}/{padVal(cLocalTot)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-xl shadow-2xs font-mono">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: matchState.rivalColor || '#ef4444' }}></span>
                    <span className="text-[10px] font-bold text-slate-500">RVL:</span>
                    <span className="text-xs font-black text-rose-600 tracking-wide">
                      T:{padVal(cRivalIn)}/{padVal(cRivalOut)}/{padVal(cRivalTot)}
                    </span>
                  </div>

                  <span className="text-[9px] text-slate-400 font-semibold hidden md:inline select-none">
                    (Dentro / Fuera / Total)
                  </span>
                </div>

                <div>
                  {matchState.shotsEvents.some(s => s.half === matchState.half) && (
                    <button
                      onClick={handleUndoLastShotVal}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold px-2.5 py-1 rounded-lg text-[9px] transition uppercase flex items-center gap-1 select-none cursor-pointer"
                    >
                      <Undo2 size={10} /> Deshacer último
                    </button>
                  )}
                </div>
              </div>

          <div className="relative flex justify-center items-center w-full">
            {/* Interactive Sports Court Canvas */}
            <canvas
              ref={canvasRef}
              width={760}
              height={380}
              onClick={handleCanvasClick}
              className={`w-full rounded-2xl border border-slate-300 shadow-inner max-w-full transition-all ${
                matchState.overallSeconds <= 0 ? 'cursor-not-allowed grayscale-[15%] opacity-90' : 'cursor-crosshair'
              }`}
            />

            {/* Locked Visual Overlay if overallSeconds is zero */}
            {matchState.overallSeconds <= 0 && (
              <div className="absolute inset-0 bg-slate-950/25 backdrop-blur-[0.5px] rounded-2xl flex flex-col items-center justify-center text-white p-4 text-center z-10 pointer-events-none select-none animate-fade-in">
                <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl px-3.5 py-1.5 flex items-center gap-2 shadow-xl shrink-0">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-100">
                    Tiempo cumplido • Registro de tiros bloqueado
                  </p>
                </div>
              </div>
            )}

            {/* Click Coordinates Dialogue overlay popover replaced with professional compact Mini-Modal Flotante style contextual tooltip popover */}
            {clickCoords && (
              <div
                className={`absolute z-50 bg-white border border-[#004183] text-slate-800 rounded-3xl p-3 shadow-2xl ${
                  shotStep === 'goal_type' ? 'w-[350px] sm:w-[390px] max-w-[96vw]' : 'w-64 max-w-[280px]'
                } animate-fade-in text-[11px] border-t-4 border-t-[#FFD700] flex flex-col gap-2 max-h-[90vh] overflow-y-auto`}
                style={
                  shotStep === 'goal_type'
                    ? {
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                      }
                    : {
                        left: clickCoords.x > 50 ? 'auto' : `calc(${clickCoords.x}% + 14px)`,
                        right: clickCoords.x > 50 ? `calc(${100 - clickCoords.x}% + 14px)` : 'auto',
                        top: clickCoords.y > 50 ? 'auto' : `calc(${clickCoords.y}% + 14px)`,
                        bottom: clickCoords.y > 50 ? `calc(${100 - clickCoords.y}% + 14px)` : 'auto',
                      }
                }
              >
                {/* Close small cross */}
                <button
                  type="button"
                  onClick={() => {
                    setClickCoords(null);
                    setSelectedSubjectId(null);
                    setShotStep(null);
                  }}
                  className="absolute -top-2 -right-2 text-slate-400 hover:text-slate-800 font-extrabold text-[10px] w-6 h-6 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center shadow transition cursor-pointer select-none z-10"
                >
                  ✕
                </button>

                {shotStep === 'goal_type' ? (
                  <>
                    <div className="text-center pb-1.5 border-b border-emerald-100 flex flex-col items-center justify-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">⚽</span>
                        <span className="font-black text-[11px] text-emerald-800 uppercase tracking-wider">
                          REGISTRAR GOL
                        </span>
                      </div>
                      <span className="text-[9px] font-bold text-slate-600 mt-0.5">
                        {selectedSubjectId === 'rival' ? (
                          <span className="text-rose-600 font-extrabold">Anotado por: RIVAL</span>
                        ) : (
                          <span className="text-[#004183] font-extrabold">
                            Anotado por: {(() => { const sp = players.find(pl => pl.id === selectedSubjectId); return sp ? getDisambiguatedPlayerLabel(sp, convocatedRoster, true) : ''; })()}
                          </span>
                        )}
                      </span>
                    </div>

                    <p className="text-[8.5px] font-black uppercase text-slate-500 tracking-wider text-center">
                      Tipo de Gol:
                    </p>

                    <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-0.5 custom-scrollbar">
                      {GOAL_TYPES.map(gt => (
                        <button
                          key={gt}
                          type="button"
                          onClick={() => {
                            if (selectedSubjectId === 'rival') {
                              handleRecordShot('rival', 'goal', undefined, gt);
                            } else {
                              handleRecordShot('local', 'goal', selectedSubjectId || undefined, gt);
                            }
                          }}
                          className="py-2 px-1 font-bold rounded-xl text-[8.5px] border transition text-center leading-tight hover:shadow-xs active:scale-95 cursor-pointer select-none flex items-center justify-center min-h-[35px] bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-950 border-emerald-200/90 shadow-xs"
                        >
                          {gt}
                        </button>
                      ))}
                    </div>

                    <button 
                      type="button" 
                      onClick={() => setShotStep('team_select')} 
                      className="py-1 text-slate-400 hover:text-slate-700 text-[9px] font-bold underline text-center cursor-pointer"
                    >
                      ← Cambiar autor o resultado
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-center pb-1 border-b border-slate-100 flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 bg-[#FFD700] rounded-full"></span>
                      <span className="font-black text-[10px] text-[#004183] uppercase tracking-wider">REGISTRO RÁPIDO DE TIRO</span>
                    </div>

                    {/* ROW 1: 6 SMALL BUTTONS (5 ON COURT PLAYERS + 1 [RIVAL]) */}
                    <div>
                      <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider mb-1">
                        1. Autor del Tiro (Toca uno)
                      </p>
                      <div className="grid grid-cols-6 gap-1 select-none">
                        {onCourtPlayers.map(p => {
                          const isSelected = selectedSubjectId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedSubjectId(p.id)}
                              className={`relative p-1 rounded-xl flex flex-col items-center justify-center transition border ${
                                isSelected
                                  ? 'border-[#004183] bg-blue-50/50 ring-2 ring-[#004183]/15'
                                  : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50/70'
                              }`}
                              title={getDisambiguatedPlayerLabel(p, convocatedRoster, true)}
                            >
                              <div className="w-7 h-7 rounded-full overflow-hidden relative shrink-0 bg-slate-100 border border-slate-200">
                                {p.photo ? (
                                  <img referrerPolicy="no-referrer" src={p.photo} alt={getDisambiguatedPlayerLabel(p, convocatedRoster, false)} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-[#004183] text-[#FFD700] font-black text-[8px] flex items-center justify-center">
                                    {(p.alias || p.name).substring(0, 2)}
                                  </div>
                                )}
                              </div>
                              <span className={`text-[8px] font-mono font-black mt-0.5 leading-none px-1 rounded-full ${
                                isSelected ? 'bg-[#004183] text-white' : 'text-slate-500 bg-slate-100'
                              }`}>
                                #{p.number}
                              </span>
                            </button>
                          );
                        })}

                        {/* [RIVAL] BUTTON */}
                        <button
                          type="button"
                          onClick={() => setSelectedSubjectId('rival')}
                          className={`p-1 rounded-xl flex flex-col items-center justify-center transition border ${
                            selectedSubjectId === 'rival'
                              ? 'border-rose-500 bg-rose-50 ring-2 ring-rose-500/20'
                              : 'border-slate-100 hover:border-rose-300 hover:bg-rose-50/20'
                          }`}
                          title="Tiro del Rival"
                        >
                          <div className="w-7 h-7 rounded-full bg-rose-500 text-white font-black text-[12px] flex items-center justify-center border border-rose-600 select-none">
                            R
                          </div>
                          <span className={`text-[8px] font-black mt-0.5 leading-none px-1 rounded-full ${
                            selectedSubjectId === 'rival' ? 'bg-rose-600 text-white' : 'text-rose-600 bg-rose-50'
                          }`}>
                            RIVAL
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* ROW 2: 3 COLORFUL OUTCOME ACTION BUTTONS */}
                    <div className="border-t border-slate-50 pt-1.5">
                      <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider mb-1">
                        2. Resultado (Guarda y cierra al pulsar)
                      </p>
                      <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                        {/* [FUERA] - Gris/Rojo */}
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedSubjectId) {
                              alert('Por favor, selecciona primero el autor del tiro (fila superior)');
                              return;
                            }
                            if (selectedSubjectId === 'rival') {
                              handleRecordShot('rival', 'out');
                            } else {
                              handleRecordShot('local', 'out', selectedSubjectId);
                            }
                          }}
                          className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl uppercase text-[9px] tracking-wide border border-slate-200 transition hover:shadow-xs active:scale-95 flex flex-col items-center justify-center select-none cursor-pointer"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mb-1"></span>
                          <span>FUERA</span>
                        </button>

                        {/* [A PUERTA / DENTRO] - Azul */}
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedSubjectId) {
                              alert('Por favor, selecciona primero el autor del tiro (fila superior)');
                              return;
                            }
                            if (selectedSubjectId === 'rival') {
                              handleRecordShot('rival', 'on_target');
                            } else {
                              handleRecordShot('local', 'on_target', selectedSubjectId);
                            }
                          }}
                          className="py-2.5 bg-blue-50 hover:bg-blue-100 text-[#004183] font-black rounded-xl uppercase text-[9px] tracking-wide border border-blue-200 transition hover:shadow-xs active:scale-95 flex flex-col items-center justify-center select-none cursor-pointer"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#004183] mb-1"></span>
                          <span>DENTRO</span>
                        </button>

                        {/* [GOL] - Verde Vivo */}
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedSubjectId) {
                              alert('Por favor, selecciona primero el autor del tiro (fila superior)');
                              return;
                            }
                            setShotStep('goal_type');
                          }}
                          className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl uppercase text-[9px] tracking-widest transition shadow-sm active:scale-95 flex flex-col items-center justify-center select-none cursor-pointer border-b-2 border-emerald-800"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-white mb-1 animate-ping"></span>
                          <span>GOL</span>
                        </button>
                      </div>
                    </div>

                    {selectedSubjectId ? (
                      <p className="text-[8px] text-[#004183] font-bold text-center leading-tight bg-blue-50/50 p-1 rounded-md border border-blue-200/20 animate-pulse">
                        Acción enfocada en: {
                          selectedSubjectId === 'rival'
                            ? 'ATAQUE RIVAL'
                            : `JUGADOR/A LOCAL #${players.find(pl => pl.id === selectedSubjectId)?.number}`
                        }
                      </p>
                    ) : (
                      <p className="text-[8px] text-amber-600 font-bold text-center leading-tight bg-amber-50/50 p-1 rounded border border-yellow-105/30">
                        Paso 1: Toca un/a jugador/a arriba. Paso 2: Toca el resultado.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
          );
        })()}

        {/* ON-COURT METRIC TILES COMPONENT RIGHT SIDE COLUMN XL */}
        <div className="xl:col-span-4 space-y-4">
          <div className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
            <span className="text-[10px] font-extrabold text-[#004183] uppercase tracking-wider flex items-center gap-1">
              <Users size={12} />
              <span>Quinteto en campo ({onCourtPlayers.length} / 5)</span>
            </span>
          </div>

          {(matchState.penaltyTimers || []).map(pt => (
            <div key={pt.id} className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-2.5 flex items-center justify-between shadow-sm animate-pulse">
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <span className="bg-rose-600 text-white rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider shrink-0">
                  EXPULSIÓN
                </span>
                <span className="text-rose-950 font-extrabold text-[11px]">
                  #{pt.playerNumber} {pt.playerAlias}
                </span>
              </div>
              <div className="flex items-center gap-1 text-slate-900 bg-white/80 border border-rose-100 px-2 py-0.5 rounded-md font-mono text-xs font-black shrink-0">
                ⏱️ {Math.floor(pt.secondsRemaining / 60)}:{(pt.secondsRemaining % 60) < 10 ? '0' : ''}{pt.secondsRemaining % 60}
              </div>
            </div>
          ))}

          {onCourtPlayers.length === 0 ? (
            <div className="bg-slate-50 py-10 text-center rounded-2xl border-2 border-dashed border-slate-200">
              <p className="text-slate-400 text-xs">No hay jugadores/as activos/as en pista.</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Selecciónalas del banquillo inferior.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {onCourtPlayers.map(p => {
                const live = matchState.playersState[p.id];
                if (!live) return null;

                const isPortera = p.id === activeGoalkeeperId;

                return (
                  <div
                    key={p.id}
                    className={`bg-white border rounded-xl p-2 shadow-xs transition relative flex items-center justify-between gap-1.5 ${
                      live.redCard ? 'border-l-4 border-l-rose-500 bg-rose-50/10' : 'border-l-4 border-l-[#004183]'
                    }`}
                  >
                    {/* Left: Player ID, photo, name and position */}
                    <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                      <div className="relative shrink-0 select-none">
                        <div className="w-7 h-7 rounded-full overflow-hidden border border-slate-200 shadow-2xs">
                          {p.photo ? (
                            <img referrerPolicy="no-referrer" src={p.photo} alt={p.alias || p.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-blue-950 text-yellow-500 font-bold font-mono text-[9px] flex items-center justify-center uppercase">
                              {(p.alias || p.name).substring(0, 2)}
                            </div>
                          )}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 bg-yellow-400 text-blue-950 font-mono text-[6.5px] font-black px-0.5 rounded-full border border-white leading-none shadow z-10">
                          {p.number}
                        </span>
                      </div>

                      <div className="min-w-0 max-w-[80px] sm:max-w-[100px]">
                        <p className="font-extrabold text-slate-700 text-[10px] truncate leading-tight" title={getDisambiguatedPlayerLabel(p, convocatedRoster, false)}>
                          {getDisambiguatedPlayerLabel(p, convocatedRoster, false)}
                        </p>
                        <button
                          type="button"
                          onClick={() => setMatchState(prev => ({ ...prev, activeGoalkeeperId: p.id }))}
                          title={isPortera ? 'Portero/a activo/a en pista' : 'Pulsa para designar como portero/a / portero-jugador en pista'}
                          className={`text-[7.5px] uppercase leading-none font-black block truncate text-left cursor-pointer transition ${
                            isPortera ? 'text-amber-700' : 'text-slate-400 hover:text-[#004183]'
                          }`}
                        >
                          {p.position === 'Portero/a' ? (p.gender === 'M' ? 'Portero' : 'Portera') : p.position} {isPortera && '🧤'}
                        </button>
                      </div>
                    </div>

                    {/* Middle: STATS MATRIX CONTROLS ON THE SAME LINE */}
                    {live.redCard ? (
                      <div className="flex-1 bg-rose-50 text-rose-800 border-rose-100 border text-center font-bold text-[8px] py-0.5 px-1.5 rounded flex items-center justify-center gap-0.5 min-w-0">
                        <AlertTriangle size={9} className="shrink-0" />
                        <span className="truncate">EXPULSADO</span>
                        <button onClick={() => handleUndoExpulsion(p.id)} className="underline ml-auto font-normal text-[7.5px] shrink-0">Reset</button>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center gap-1 min-w-0 px-1 border-l border-r border-slate-100/50">
                        
                        {/* shots */}
                        <div className="bg-slate-50 border border-slate-100 rounded py-0.5 px-1 flex flex-col justify-center items-center min-w-[28px] shrink-0">
                          <span className="text-[6.5px] text-slate-400 uppercase font-black leading-none">Tiros</span>
                          <span className="text-[10px] font-black text-slate-800 font-mono mt-0.5 leading-none">{live.shots}</span>
                        </div>

                        {/* goals */}
                        <div className="bg-emerald-50/50 border border-emerald-100 rounded py-0.5 px-1 flex flex-col justify-center items-center min-w-[28px] shrink-0">
                          <span className="text-[6.5px] text-emerald-800 uppercase font-black leading-none">Goles</span>
                          <span className="text-[10px] font-black text-emerald-950 font-mono mt-0.5 leading-none">{live.goals}</span>
                        </div>

                        {/* Saves & Conceded only if Goalkeeper position / active goalkeeper */}
                        <div className="bg-blue-50/50 border border-blue-100 rounded py-0.5 px-1 flex flex-col justify-center items-center min-w-[28px] shrink-0">
                          <span className="text-[6.5px] text-blue-700 uppercase font-black leading-none">Saves</span>
                          <span className={`text-[10px] font-black font-mono mt-0.5 leading-none ${p.id === activeGoalkeeperId ? 'text-blue-900' : 'text-slate-300'}`}>
                            {p.id === activeGoalkeeperId ? live.saves : '-'}
                          </span>
                        </div>

                        {/* cards */}
                        <div className="bg-amber-50/50 border border-amber-100 rounded py-0.5 px-1 flex flex-col justify-between items-center min-w-[42px] shrink-0">
                          <div className="flex items-center justify-center gap-0.5">
                            <div className={`w-1.5 h-2.5 rounded-sm border ${live.yellows >= 1 ? 'bg-yellow-400 border-yellow-500' : 'bg-slate-200 border-slate-300'}`}></div>
                            <div className={`w-1.5 h-2.5 rounded-sm border ${live.yellows >= 2 ? 'bg-rose-500 border-rose-600' : 'bg-slate-200 border-slate-300'}`}></div>
                          </div>
                          <div className="flex gap-0.5 justify-center w-full mt-0.5">
                            <button onClick={() => handlePlayerYellow(p.id, -1)} className="bg-white border text-[6px] px-0.5 rounded leading-none font-bold">-</button>
                            <button onClick={() => handlePlayerYellow(p.id, 1)} className="bg-amber-400 text-white font-bold text-[6px] px-0.5 rounded hover:bg-amber-500 leading-none" title="Amarilla">🟨</button>
                            <button onClick={() => handlePlayerDirectRed(p.id)} className="bg-rose-600 text-white font-bold text-[6px] px-0.5 rounded hover:bg-rose-700 leading-none" title="Roja directa">🔴</button>
                          </div>
                        </div>

                      </div>
                    )}

                    {/* Right: Chronometer and Adjust Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Adjust time manually (to the left) */}
                      <div className="flex flex-col items-end gap-0.5">
                        {/* Minutes adjustment row */}
                        <div className="flex gap-1 text-[7px] text-slate-450 font-black leading-none uppercase">
                          <button onClick={() => {
                            setMatchState(prev => {
                              const s = prev.playersState[p.id];
                              const newTot = Math.max(0, s.secondsPlayed - 60);
                              const newShift = Math.max(0, (s.currentShiftSeconds ?? s.secondsPlayed) - 60);
                              return { ...prev, playersState: { ...prev.playersState, [p.id]: { ...s, secondsPlayed: newTot, currentShiftSeconds: newShift } } };
                            });
                          }} className="hover:text-[#004183] cursor-pointer select-none" title="Restar 1 minuto">-1m</button>
                          <span className="opacity-50">|</span>
                          <button onClick={() => {
                            setMatchState(prev => {
                              const s = prev.playersState[p.id];
                              const newTot = s.secondsPlayed + 60;
                              const newShift = (s.currentShiftSeconds ?? s.secondsPlayed) + 60;
                              return { ...prev, playersState: { ...prev.playersState, [p.id]: { ...s, secondsPlayed: newTot, currentShiftSeconds: newShift } } };
                            });
                          }} className="hover:text-[#004183] cursor-pointer select-none" title="Sumar 1 minuto">+1m</button>
                        </div>
                        {/* Seconds adjustment row */}
                        <div className="flex gap-1 text-[6.5px] text-slate-400 font-bold leading-none uppercase">
                          <button onClick={() => {
                            setMatchState(prev => {
                              const s = prev.playersState[p.id];
                              const newTot = Math.max(0, s.secondsPlayed - 10);
                              const newShift = Math.max(0, (s.currentShiftSeconds ?? s.secondsPlayed) - 10);
                              return { ...prev, playersState: { ...prev.playersState, [p.id]: { ...s, secondsPlayed: newTot, currentShiftSeconds: newShift } } };
                            });
                          }} className="hover:text-[#004183] cursor-pointer select-none" title="Restar 10 segundos">-10s</button>
                          <span className="opacity-50">|</span>
                          <button onClick={() => {
                            setMatchState(prev => {
                              const s = prev.playersState[p.id];
                              const newTot = s.secondsPlayed + 10;
                              const newShift = (s.currentShiftSeconds ?? s.secondsPlayed) + 10;
                              return { ...prev, playersState: { ...prev.playersState, [p.id]: { ...s, secondsPlayed: newTot, currentShiftSeconds: newShift } } };
                            });
                          }} className="hover:text-[#004183] cursor-pointer select-none" title="Sumar 10 segundos">+10s</button>
                        </div>
                      </div>

                      {/* Display Chronometer: Turno actual en pista + Total acumulado */}
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-[10.5px] font-black text-slate-800 bg-slate-50 px-1 py-0.5 border border-slate-200/50 rounded leading-none" title="Tiempo de este turno en pista (desde que entró)">
                          {displayChronometer(live.currentShiftSeconds ?? live.secondsPlayed)}
                        </span>
                        <span className="text-[7.5px] text-slate-400 font-bold font-mono mt-0.5" title="Total jugado en esta parte">
                          Tot: {displayChronometer(live.secondsPlayed)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SQUAD BENCH ROTATIONS COLUMNS */}
          <div className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Users size={12} />
              <span>Banquillo ({benchTeam.length})</span>
            </span>
          </div>

          {benchTeam.length === 0 ? (
            <div className="bg-slate-50 p-4 text-center rounded-2xl border border-slate-200 text-[#004183] text-[10px] font-bold">
              Todos/as los/as jugadores/as activos/as en cancha.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-[350px] pr-0.5 pb-1">
              {benchTeam.map(p => {
                const live = matchState.playersState[p.id];
                if (!live) return null;

                const hasYellows = live.yellows > 0;
                const isExpelled = live.redCard || live.yellows >= 2;

                return (
                  <div
                    key={p.id}
                    className={`bg-white border rounded-xl p-2 shadow-xs transition-all relative flex flex-col justify-between hover:bg-slate-50/55 ${
                      isExpelled 
                        ? 'border-rose-300 bg-rose-50/30' 
                        : hasYellows 
                          ? 'border-amber-300 bg-amber-50/15' 
                          : 'border-slate-200'
                    }`}
                  >
                    {/* Top Right: Cumulative time played & cards */}
                    <div className="absolute top-1 right-1 flex items-center gap-1">
                      {live.secondsPlayed > 0 && (
                        <span className="text-[7.5px] text-slate-600 font-bold font-mono bg-slate-100/90 px-1 py-0.5 rounded leading-none border border-slate-200/40" title="Tiempo total jugado en esta parte">
                          {displayChronometer(live.secondsPlayed)}
                        </span>
                      )}
                      {live.yellows > 0 && (
                        <div className="w-1.5 h-2.5 bg-yellow-400 rounded-2xs border border-yellow-500 shadow-2xs block" title={`${live.yellows} ${live.yellows === 1 ? 'Tarjeta Amarilla' : 'Tarjetas Amarillas'}`}></div>
                      )}
                      {live.yellows > 1 && (
                        <div className="w-1.5 h-2.5 bg-yellow-400 rounded-2xs border border-yellow-500 shadow-2xs block" title="Doble Amarilla"></div>
                      )}
                      {live.redCard && (
                        <div className="w-1.5 h-2.5 bg-rose-600 rounded-2xs border border-rose-700 shadow-2xs block" title="Tarjeta Roja"></div>
                      )}
                    </div>

                    {/* Horizontal Player info row */}
                    <div className="flex items-center gap-1.5 w-full mt-2 mb-1.5">
                      {/* Avatar / Photo */}
                      <div className="relative w-7 h-7 select-none shrink-0">
                        {p.photo ? (
                          <img referrerPolicy="no-referrer" src={p.photo} alt={p.alias || p.name} className="w-7 h-7 rounded-full object-cover border border-slate-200" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-mono flex items-center justify-center font-bold text-[10px] uppercase border border-slate-200">
                            {(p.alias || p.name).substring(0, 2)}
                          </div>
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5 bg-yellow-400 text-blue-950 font-mono text-[7px] font-black px-0.5 rounded-full border border-white leading-none shadow">
                          {p.number}
                        </span>
                      </div>

                      {/* Player Name / Alias & Position */}
                      <div className="min-w-0 flex-1 text-left">
                        <p className="font-bold text-slate-700 text-[9.5px] leading-tight truncate" title={getDisambiguatedPlayerLabel(p, convocatedRoster, false)}>
                          {getDisambiguatedPlayerLabel(p, convocatedRoster, false)}
                        </p>
                        <p className="text-[7px] text-slate-400 uppercase font-black tracking-tight truncate">
                          {p.position === 'Portero/a' ? (p.gender === 'M' ? 'Portero' : 'Portera') : p.position}
                        </p>
                      </div>
                    </div>

                    {/* Action Button */}
                    {subInPlayerId === p.id ? (
                      <div className="w-full mt-1 pt-1 border-t border-slate-100 flex flex-col gap-1 text-[8px] animate-fade-in">
                        <p className="font-extrabold text-blue-900 text-[6.5px] uppercase tracking-wider text-center">¿Cambiar por quién?</p>
                        <div className="flex flex-col gap-0.5 max-h-[110px] overflow-y-auto">
                          {onCourtPlayers.map(oc => {
                            const ocState = matchState.playersState[oc.id];
                            const shiftSecs = ocState ? (ocState.currentShiftSeconds ?? ocState.secondsPlayed) : 0;
                            const ocIsGK = oc.id === activeGoalkeeperId;
                            return (
                              <button
                                key={oc.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExecuteSubstitution(oc.id);
                                }}
                                className={`w-full text-left py-0.5 px-1 hover:bg-blue-600 hover:text-white hover:border-blue-600 rounded border text-[7.5px] font-bold transition truncate flex justify-between items-center cursor-pointer ${
                                  ocIsGK
                                    ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                                    : 'bg-slate-50 border-slate-200'
                                }`}
                                title={`Sustituir a ${ocIsGK ? '🧤 ' : ''}${getDisambiguatedPlayerLabel(oc, convocatedRoster, true)}`}
                              >
                                <span className="truncate mr-1">{ocIsGK ? '🧤 ' : ''}{getDisambiguatedPlayerLabel(oc, convocatedRoster, true)}</span>
                                <span className="shrink-0 text-[6.5px] opacity-75 font-mono">
                                  {displayChronometer(shiftSecs)} (Tot {displayChronometer(ocState?.secondsPlayed || 0)})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSubInPlayerId(null);
                          }}
                          className="w-full text-center py-0.5 text-rose-600 hover:text-rose-800 font-extrabold text-[7px] uppercase transition cursor-pointer mt-0.5 border-t border-slate-50 pt-1"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : isExpelled ? (
                      <div className="w-full py-0.5 px-1 rounded-md text-[7.5px] text-center font-black uppercase bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-between gap-1">
                        <span className="truncate">Expulsado/a</span>
                        <button
                          type="button"
                          onClick={() => handleUndoExpulsion(p.id)}
                          className="underline font-bold text-rose-800 hover:text-rose-950 shrink-0 cursor-pointer"
                          title="Deshacer expulsión"
                        >
                          Deshacer
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleToggleSwapPlayer(p.id)}
                        className="w-full py-0.5 px-1.5 rounded-md text-[8px] text-center font-black uppercase transition-all flex items-center justify-center gap-0.5 bg-[#004183] text-white hover:bg-blue-900 cursor-pointer shadow-xs"
                        title="Introducir en pista"
                      >
                        <span>Pista</span> <span className="text-[6.5px]">▲</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* FOOTER ACTIONS ROOM: PASS HALFS AND ARCHIVE GAME */}
      <div className="p-2.5 px-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-4 shadow-xs">
        {/* Quick reset options */}
        <button
          onClick={() => setShowResetModal(true)}
          className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold px-3 py-1.5 rounded-lg text-[10px] transition uppercase select-none cursor-pointer border border-rose-100 shadow-2xs shrink-0"
        >
          Resetear Datos 🔄
        </button>

        {/* Half time toggle vs final matching */}
        {matchState.half === 1 ? (
          <button
            onClick={handleAdvanceToSecondHalf}
            className={`font-black px-4 py-1.5 rounded-lg text-[10px] transition uppercase shadow-xs tracking-wider cursor-pointer shrink-0 ${
              matchState.overallSeconds === 0
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 ring-2 ring-amber-300 animate-pulse'
                : 'bg-[#FFD700] text-[#004183] hover:bg-[#ffe035]'
            }`}
          >
            {matchState.overallSeconds === 0 ? '2ª Parte' : 'Finalizar 1ª Parte ⏸️'}
          </button>
        ) : (
          <button
            onClick={handleFinishMatchArchive}
            id="btn-finish-and-archive-sc"
            className={`font-black px-4 py-1.5 rounded-lg text-[10px] transition uppercase shadow-xs tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
              matchState.overallSeconds === 0
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300 animate-pulse'
                : 'bg-[#004183] text-white hover:bg-blue-900 border-b border-yellow-500'
            }`}
          >
            <Save size={11} className={matchState.overallSeconds === 0 ? "text-white" : "text-[#FFD700]"} />
            {matchState.overallSeconds === 0 ? 'Finalizar y Guardar (PDF) 🏁' : 'Finalizar Partido 🏁'}
          </button>
        )}
      </div>



      {/* MODAL 2: SECURE SYSTEM RESET CONFIRMATION */}
      {showResetModal && (
        <div className="fixed inset-0 min-h-screen bg-slate-950/80 backdrop-blur-sm z-[9999] p-4 flex items-center justify-center animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <span className="text-3xl font-black">⚠️</span>
            </div>
            
            <h3 className="text-xl font-black text-slate-900 font-display">
              ¿Confirmas el reset completo?
            </h3>
            <p className="text-slate-500 text-sm mt-2 mb-6">
              Esta acción es irreversible. Se reiniciará el marcador, el cronómetro general, todos los mapas de tiros programados, las sustituciones, y las estadísticas de minutos de toda la plantilla para esta sesión de partido.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                type="button"
                className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  resetLiveSessionState();
                  if (onClearLiveDraft) onClearLiveDraft();
                  setShowResetModal(false);
                }}
                type="button"
                className="py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-md shadow-rose-600/10"
              >
                Sí, Resetear Todo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA CONFIRMAR FINALIZACIÓN DE PARTIDO */}
      {showFinishModal && (() => {
        const s1L_in = matchState.shotsEvents.filter(s => s.half === 1 && s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
        const s1L_out = matchState.shotsEvents.filter(s => s.half === 1 && s.team === 'local' && s.type === 'out').length;
        const s1L_tot = s1L_in + s1L_out;
        const s1R_in = matchState.shotsEvents.filter(s => s.half === 1 && s.team === 'rival' && (s.type === 'on_target' || s.type === 'goal')).length;
        const s1R_out = matchState.shotsEvents.filter(s => s.half === 1 && s.team === 'rival' && s.type === 'out').length;
        const s1R_tot = s1R_in + s1R_out;

        const s2L_in = matchState.shotsEvents.filter(s => s.half === 2 && s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
        const s2L_out = matchState.shotsEvents.filter(s => s.half === 2 && s.team === 'local' && s.type === 'out').length;
        const s2L_tot = s2L_in + s2L_out;
        const s2R_in = matchState.shotsEvents.filter(s => s.half === 2 && s.team === 'rival' && (s.type === 'on_target' || s.type === 'goal')).length;
        const s2R_out = matchState.shotsEvents.filter(s => s.half === 2 && s.team === 'rival' && s.type === 'out').length;
        const s2R_tot = s2R_in + s2R_out;

        const totL_in = s1L_in + s2L_in;
        const totL_out = s1L_out + s2L_out;
        const totL_tot = totL_in + totL_out;
        const totR_in = s1R_in + s2R_in;
        const totR_out = s1R_out + s2R_out;
        const totR_tot = totR_in + totR_out;

        const s1L_goals = matchState.shotsEvents.filter(s => s.half === 1 && s.team === 'local' && s.type === 'goal').length;
        const s1R_goals = matchState.shotsEvents.filter(s => s.half === 1 && s.team === 'rival' && s.type === 'goal').length;
        const s2L_goals = matchState.shotsEvents.filter(s => s.half === 2 && s.team === 'local' && s.type === 'goal').length;
        const s2R_goals = matchState.shotsEvents.filter(s => s.half === 2 && s.team === 'rival' && s.type === 'goal').length;

        const p2 = (n: number) => String(n).padStart(2, '0');

        return (
          <div className="fixed inset-0 min-h-screen bg-slate-950/80 backdrop-blur-sm z-[9999] p-4 flex items-center justify-center animate-fade-in">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 text-center">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-100">
                <span className="text-2xl font-black">🏁</span>
              </div>
              
              <h3 className="text-xl font-black text-slate-900 font-display">
                ¿Finalizar Partido?
              </h3>
              <p className="text-slate-500 text-xs mt-1.5 mb-4">
                Encuentro contra <strong>{matchState.rival}</strong> ({matchState.goalsFor} - {matchState.goalsAgainst}). Se generará automáticamente el informe PDF y se archivarán las estadísticas.
              </p>

              {/* Resumen de Tiros y Goles por Parte y Totales */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-5 text-left">
                <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-slate-200/80">
                  <span className="text-[10px] font-black text-[#004183] uppercase tracking-wider">Resumen del Encuentro</span>
                  <span className="text-[9px] text-slate-400 font-semibold">(Dentro / Fuera / Total)</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px] font-bold text-slate-500 uppercase pb-1">
                  <span>Periodo (Goles)</span>
                  <span className="text-center text-[#004183]">Local</span>
                  <span className="text-center text-rose-600">Rival</span>
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="grid grid-cols-3 gap-1 items-center bg-white px-2 py-1 rounded-lg border border-slate-100">
                    <span className="font-sans font-bold text-slate-700 text-[10px]">1ª P. ({s1L_goals}-{s1R_goals})</span>
                    <span className="text-center font-black text-[#004183]">T:{p2(s1L_in)}/{p2(s1L_out)}/{p2(s1L_tot)}</span>
                    <span className="text-center font-black text-rose-600">T:{p2(s1R_in)}/{p2(s1R_out)}/{p2(s1R_tot)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 items-center bg-white px-2 py-1 rounded-lg border border-slate-100">
                    <span className="font-sans font-bold text-slate-700 text-[10px]">2ª P. ({s2L_goals}-{s2R_goals})</span>
                    <span className="text-center font-black text-[#004183]">T:{p2(s2L_in)}/{p2(s2L_out)}/{p2(s2L_tot)}</span>
                    <span className="text-center font-black text-rose-600">T:{p2(s2R_in)}/{p2(s2R_out)}/{p2(s2R_tot)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 items-center bg-blue-50/80 px-2 py-1.5 rounded-lg border border-blue-200">
                    <span className="font-sans font-black text-[#004183] text-[10px]">TOTAL ({matchState.goalsFor}-{matchState.goalsAgainst})</span>
                    <span className="text-center font-black text-[#004183]">T:{p2(totL_in)}/{p2(totL_out)}/{p2(totL_tot)}</span>
                    <span className="text-center font-black text-rose-600">T:{p2(totR_in)}/{p2(totR_out)}/{p2(totR_tot)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => setShowFinishModal(false)}
                  type="button"
                  className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Volver al Juego
                </button>
                <button
                  onClick={confirmFinishMatchArchive}
                  type="button"
                  className="py-3 px-4 bg-[#004183] hover:bg-blue-900 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-md shadow-blue-900/10"
                >
                  Sí, Finalizar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 3: FIRST HALF SUMMARY & SECOND HALF LINEUP SELECTION */}
      {showFirstHalfSummaryModal && (() => {
        // Calculations
        const convocatedIds = [...new Set([...matchState.titulares, ...matchState.suplentes])].filter(Boolean);
        const convocatedPlayers = players
          .filter(p => convocatedIds.includes(p.id))
          .sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));

        const firstHalfShots = matchState.shotsEvents.filter(s => s.half === 1);
        const firstHalfTirosDentro = firstHalfShots.filter(s => s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
        const firstHalfTirosFuera = firstHalfShots.filter(s => s.team === 'local' && s.type === 'out').length;
        const firstHalfTotalTiros = firstHalfTirosDentro + firstHalfTirosFuera;
        const firstHalfPct = firstHalfTotalTiros > 0 ? Math.round((firstHalfTirosDentro / firstHalfTotalTiros) * 100) : 0;

        const firstHalfRivalDentro = firstHalfShots.filter(s => s.team === 'rival' && (s.type === 'on_target' || s.type === 'goal')).length;
        const firstHalfRivalFuera = firstHalfShots.filter(s => s.team === 'rival' && s.type === 'out').length;
        const firstHalfRivalTotal = firstHalfRivalDentro + firstHalfRivalFuera;
        const firstHalfRivalPct = firstHalfRivalTotal > 0 ? Math.round((firstHalfRivalDentro / firstHalfRivalTotal) * 100) : 0;

        const firstHalfGoalsLocal = firstHalfShots.filter(s => s.team === 'local' && s.type === 'goal').length;
        const firstHalfGoalsRival = firstHalfShots.filter(s => s.team === 'rival' && s.type === 'goal').length;

        // Custom ordered list of goals to display chronological scorers with the score at that exact moment
        let runningLocalGoals = 0;
        let runningRivalGoals = 0;
        const firstHalfGoalsSequence = firstHalfShots
          .filter(s => s.type === 'goal')
          .map((s, idx) => {
            if (s.team === 'local') {
              runningLocalGoals++;
            } else {
              runningRivalGoals++;
            }
            let scorerName = '';
            if (s.team === 'local') {
              const p = players.find(pObj => pObj.id === s.playerId);
              scorerName = p ? getDisambiguatedPlayerLabel(p, convocatedPlayers, false) : `Jugadora #${s.playerNumber || ''}`;
            } else {
              scorerName = `Rival`;
            }
            return {
              id: s.id || String(idx),
              scorer: scorerName,
              team: s.team,
              time: s.timeString || '00:00',
              score: `${runningLocalGoals} - ${runningRivalGoals}`
            };
          });

        // Check if current 2nd half starters selection matches required starters without expelled or duplicate players
        const activePenaltyCount = (matchState.penaltyTimers || []).filter(pt => pt.secondsRemaining > 0).length;
        const requiredStarters = Math.max(1, 5 - activePenaltyCount);
        const activeSlots = secondHalfStarters.slice(0, requiredStarters).filter(Boolean);
        const validUniqueActiveSlots = new Set(
          activeSlots.filter(id => !matchState.playersState[id]?.redCard)
        );
        const isValidLineup = activeSlots.length === requiredStarters && validUniqueActiveSlots.size === requiredStarters;

        return (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[9999] p-4 overflow-y-auto flex justify-center items-start animate-fade-in">
            <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 flex flex-col my-auto md:my-8">
              
              {/* Header */}
              <div className="text-center pb-4 border-b border-slate-100">
                <span className="bg-[#004183] text-white font-extrabold text-[10px] uppercase tracking-widest px-3 py-1 rounded">
                  Descanso
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-2 font-display uppercase tracking-tight">
                  Resumen de la Primera Parte & Quinteto de la Segunda Parte
                </h3>
              </div>

              {/* Grid content */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                
                {/* Column Left: Visual Pitch Map & Team Summary Stats */}
                <div className="space-y-4">
                  <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800">
                    <p className="text-[10px] font-black uppercase text-[#FFD700] tracking-wider mb-1 text-center">
                      Mapa de Calor de Tiros - 1ª Parte
                    </p>
                    <div className="flex justify-center items-center gap-2.5 text-xs font-mono mb-2 text-center flex-wrap">
                      <span className="text-sky-300 font-bold">
                        LOCAL T:{String(firstHalfTirosDentro).padStart(2, '0')}/{String(firstHalfTirosFuera).padStart(2, '0')}/{String(firstHalfTotalTiros).padStart(2, '0')}
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-rose-400 font-bold">
                        RIVAL T:{String(firstHalfRivalDentro).padStart(2, '0')}/{String(firstHalfRivalFuera).padStart(2, '0')}/{String(firstHalfRivalTotal).padStart(2, '0')}
                      </span>
                      <span className="text-[9px] text-slate-400 font-sans hidden sm:inline">(Dentro / Fuera / Total)</span>
                    </div>
                    <div className="flex justify-center">
                      <canvas
                        ref={firstHalfCanvasRef}
                        width={380}
                        height={240}
                        className="rounded-lg border border-slate-800 shadow"
                      />
                    </div>
                  </div>

                  {/* Scoreboard and indicators grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-[#004183]/5 rounded-2xl p-3 text-center border border-[#004183]/10 flex flex-col justify-center">
                      <p className="text-[9px] uppercase text-slate-400 font-bold">Resultado 1ªP</p>
                      <p className="text-2xl font-black text-[#004183] mt-1 font-mono">
                        {firstHalfGoalsLocal} - {firstHalfGoalsRival}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-0.5 font-bold">({matchState.rival})</p>
                    </div>

                    <div className="bg-emerald-50/50 rounded-2xl p-3 text-center border border-emerald-100 flex flex-col justify-center">
                      <p className="text-[9px] uppercase text-emerald-800 font-bold">Acierto a Puerta (Local)</p>
                      <p className="text-2xl font-black text-emerald-900 mt-1 font-mono">
                        {firstHalfPct}%
                      </p>
                      <p className="text-[9px] text-emerald-700 mt-0.5 font-bold">
                        {firstHalfTirosDentro} de {firstHalfTotalTiros} Tiros
                      </p>
                    </div>

                    {/* Left Bottom: Goleadores Chronological list */}
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center flex flex-col min-h-[110px]">
                      <p className="text-[9px] uppercase text-[#004183] font-extrabold tracking-wider border-b border-slate-200/65 pb-1 mb-1.5 shrink-0">⚽ Goleadores</p>
                      <div className="flex-1 overflow-y-auto max-h-[85px] space-y-1 pr-0.5">
                        {firstHalfGoalsSequence.length > 0 ? (
                          firstHalfGoalsSequence.map((g, idx) => (
                            <div key={g.id || idx} className="flex justify-between items-center text-[9.5px] font-semibold text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-1">
                              <span className="truncate max-w-[85px] font-black">{g.scorer}</span>
                              <span className="text-slate-500 font-mono shrink-0">{g.time}'</span>
                              <span className="bg-[#004183] text-white font-bold px-1.5 py-0.2 rounded-[4px] text-[8.5px] font-mono shrink-0">{g.score}</span>
                            </div>
                          ))
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <p className="text-[9.5px] text-slate-400 italic">Sin goles registrados</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Bottom: Acierto Rival stats indicator */}
                    <div className="bg-rose-50/40 border border-rose-100 rounded-2xl p-3 text-center flex flex-col justify-center min-h-[110px]">
                      <p className="text-[9px] uppercase text-rose-800 font-black tracking-wider">Acierto A Puerta Rival</p>
                      <p className="text-2xl font-black text-rose-900 mt-1 font-mono">
                        {firstHalfRivalPct}%
                      </p>
                      <p className="text-[9px] text-rose-700 mt-0.5 font-bold">
                        {firstHalfRivalDentro} de {firstHalfRivalTotal} Tiros
                      </p>
                    </div>
                  </div>
                </div>

                {/* Column Right: Player Stats Table & Second Half Team setup */}
                <div className="space-y-4 flex flex-col justify-between">
                  {/* Table of player stats */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2">
                    <p className="text-[10px] font-black uppercase text-[#004183] tracking-widest mb-1 pb-1 border-b border-slate-200/60">
                      Estadísticas de Jugadoras (1ª Parte)
                    </p>
                    
                    <div className="space-y-1.5">
                      {convocatedPlayers.map(p => {
                        const s = matchState.playersState[p.id];
                        if (!s) return null;
                        const mins = Math.floor(s.secondsPlayed / 60);

                        return (
                          <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-1.5 bg-white/70 hover:bg-white border border-slate-200/50 rounded-xl transition shadow-3xs">
                            {/* Player info */}
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-[#004183] text-[#FFD700] flex items-center justify-center font-black text-[9px] font-mono shrink-0">
                                {p.number}
                              </span>
                              <span className="font-extrabold text-[#004183] text-[11px] truncate max-w-[120px]" title={getDisambiguatedPlayerLabel(p, convocatedPlayers, false)}>
                                {getDisambiguatedPlayerLabel(p, convocatedPlayers, false)}
                              </span>
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight bg-slate-100 px-1 py-0.2 rounded shrink-0">
                                {p.position === 'Portero/a' ? (p.gender === 'M' ? 'Portero' : 'Portera') : p.position}
                              </span>
                            </div>

                            {/* Player Stats Badges */}
                            <div className="flex flex-wrap items-center gap-1 font-sans">
                              {/* Minutes played */}
                              <span className="inline-flex items-center bg-slate-100 text-slate-700 border border-slate-200/30 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold font-mono shrink-0" title="Minutos">
                                ⏱️ {mins}'
                              </span>

                              {/* Shots */}
                              <span className="inline-flex items-center bg-blue-50 text-blue-800 border border-blue-100/60 rounded-md px-1.5 py-0.5 text-[9.5px] font-black font-mono shrink-0" title="Tiros">
                                🎯 {s.shots}
                              </span>

                              {/* Goals */}
                              <span className="inline-flex items-center bg-emerald-50 text-emerald-800 border border-emerald-100/60 rounded-md px-1.5 py-0.5 text-[9.5px] font-black font-mono shrink-0" title="Goles">
                                ⚽ {s.goals}
                              </span>

                              {/* Cards badge if any exist */}
                              {(s.yellows > 0 || s.redCard) && (
                                <div className="flex items-center gap-1 shrink-0">
                                  {s.yellows > 0 && (
                                    <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-800 border border-amber-200/60 rounded-md px-1 py-0.5 text-[9px] font-black shrink-0" title={`${s.yellows} ${s.yellows === 1 ? 'Tarjeta Amarilla' : 'Tarjetas Amarillas'}`}>
                                      <span className="w-1.5 h-2.5 bg-amber-400 border border-amber-500 rounded-2xs inline-block"></span>
                                      <span className="font-mono">{s.yellows}</span>
                                    </span>
                                  )}
                                  {s.redCard && (
                                    <span className="inline-flex items-center gap-0.5 bg-rose-50 text-rose-800 border border-rose-200/60 rounded-md px-1 py-0.5 text-[9px] font-black shrink-0 animate-pulse" title="Expulsada / Roja">
                                      <span className="w-1.5 h-2.5 bg-rose-500 border border-rose-600 rounded-2xs inline-block"></span>
                                      <span className="text-[7.5px] tracking-tight">EXP.</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>

              {/* 5-column Quinteto 2ª Parte selector */}
              <div className="mt-5 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-200/60 pb-2">
                  <p className="text-[11px] font-black uppercase text-[#004183] tracking-wider flex items-center gap-1.5">
                    📋 Seleccionar Quinteto 2ª Parte
                  </p>
                  <p className="text-[9.5px] text-slate-500 font-bold">
                    {activePenaltyCount > 0
                      ? `Elige ${requiredStarters} jugadores/as distintos/as (sanción temporal activa: -${activePenaltyCount} en pista)`
                      : 'Elige exactamente 5 jugadores/as distintos/as para iniciar la segunda parte'}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[0, 1, 2, 3, 4].map(idx => {
                    const isSlotDisabledByPenalty = idx >= requiredStarters;
                    const currentVal = isSlotDisabledByPenalty ? '' : (secondHalfStarters[idx] || '');
                    
                    return (
                      <div key={idx} className={`flex flex-col gap-1 p-2 border rounded-xl shadow-3xs ${isSlotDisabledByPenalty ? 'bg-rose-50/70 border-rose-200 opacity-75' : 'bg-white border-slate-200'}`}>
                        <span className="text-[8.5px] uppercase text-slate-400 font-extrabold tracking-wider">
                          {isSlotDisabledByPenalty ? `Puesto ${idx + 1} (Sanción)` : `Puesto ${idx + 1}`}
                        </span>
                        <select
                          value={currentVal}
                          disabled={isSlotDisabledByPenalty}
                          onChange={e => handleSetSecondHalfStarter(idx, e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-1 focus:ring-[#004183] font-bold text-slate-800 text-[11px] cursor-pointer disabled:cursor-not-allowed"
                        >
                          <option value="">{isSlotDisabledByPenalty ? 'Reducido por sanción' : 'Elegir...'}</option>
                          {convocatedPlayers.map(p => {
                            const isExpelledPlayer = !!matchState.playersState[p.id]?.redCard;
                            const isTakenElsewhere = secondHalfStarters.slice(0, requiredStarters).includes(p.id) && secondHalfStarters[idx] !== p.id;
                            return (
                              <option key={p.id} value={p.id} disabled={isExpelledPlayer || isTakenElsewhere}>
                                #{p.number} - {getDisambiguatedPlayerLabel(p, convocatedPlayers, false)}{isExpelledPlayer ? ' (Expulsado/a)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom bar */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-center md:text-left">
                  {!isValidLineup ? (
                    <p className="text-rose-600 font-black text-xs uppercase animate-pulse">
                      ❌ Debes elegir exactamente {requiredStarters} {requiredStarters === 1 ? 'jugador/a distinto/a' : 'jugadores/as distintos/as'} activos/as para iniciar la 2ª Parte.
                    </p>
                  ) : (
                    <p className="text-emerald-600 font-extrabold text-xs uppercase flex items-center gap-1">
                      ✓ ¡Alineación cargada con éxito!
                    </p>
                  )}
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                  <button
                    type="button"
                    onClick={() => setShowFirstHalfSummaryModal(false)}
                    className="flex-1 md:flex-none uppercase text-xs font-extrabold text-slate-500 py-3 px-6 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition cursor-pointer text-center select-none"
                  >
                    CERRAR
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartSecondHalfFinal(secondHalfStarters.slice(0, requiredStarters))}
                    disabled={!isValidLineup}
                    className={`flex-1 md:flex-none uppercase text-xs font-black py-3 px-6 rounded-xl transition shadow-md cursor-pointer text-center select-none flex items-center justify-center gap-1.5 ${
                      isValidLineup 
                        ? 'bg-[#004183] text-white hover:bg-blue-950 border border-[#004183] shadow-md shadow-blue-900/10' 
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    }`}
                  >
                    <span>Empezar 2ª Parte</span>
                    <span className="text-[#FFD700]">▶</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
