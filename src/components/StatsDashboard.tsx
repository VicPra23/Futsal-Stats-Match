/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Trophy, Clock, Target, AlertTriangle, Users, TrendingUp, Sparkles, 
  CheckCircle, Shield, FileText, UserCheck, ArrowRight, Table, Calendar, BarChart2
} from 'lucide-react';
import { Match, Player } from '../types';
import { exportTeamReportToPDF, exportPlayerComparisonsToPDF } from '../utils/pdfGenerator';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, CartesianGrid 
} from 'recharts';

interface StatsDashboardProps {
  matches: Match[];
  players: Player[];
}

// Colors for Pie Chart and Bar Charts
const COLORS = ['#004183', '#FFD700', '#10b981', '#0ea5e9', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'];

const CustomShotsTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (data.name === 'Tiros') {
      const dentro = payload.find((p: any) => p.dataKey === 'Dentro');
      const fuera = payload.find((p: any) => p.dataKey === 'Fuera');
      return (
        <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-md text-[11px] font-sans">
          <p className="font-bold text-slate-800 mb-1">{data.name}</p>
          {dentro && (
            <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Dentro: {dentro.value}</span>
            </div>
          )}
          {fuera && (
            <div className="flex items-center gap-1.5 text-amber-500 font-semibold mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span>Fuera: {fuera.value}</span>
            </div>
          )}
        </div>
      );
    } else if (data.name === 'Goles') {
      const goles = payload.find((p: any) => p.dataKey === 'Goles');
      return (
        <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-md text-[11px] font-sans">
          <p className="font-bold text-slate-800 mb-1">{data.name}</p>
          {goles && (
            <div className="flex items-center gap-1.5 text-blue-900 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-900"></span>
              <span>Goles: {goles.value}</span>
            </div>
          )}
        </div>
      );
    }
  }
  return null;
};

// Season calculator helper
export function getMatchSeason(dateStr: string): string {
  if (!dateStr) return 'Temporada 2026/2027';
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10); // 1-12
  if (isNaN(year) || isNaN(month)) return 'Temporada 2026/2027';
  // Sports seasons run from July 1st (month 7) to June 30th (month 6) of the following year
  if (month >= 7) {
    return `Temporada ${year}/${year + 1}`;
  } else {
    return `Temporada ${year - 1}/${year}`;
  }
}

export default function StatsDashboard({ matches, players }: StatsDashboardProps) {
  // Extract all unique seasons from existing matches
  const uniqueSeasons = Array.from(new Set(matches.map(m => getMatchSeason(m.date))));
  
  // Calculate active current season dynamically
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentRunSeason = currentMonth >= 7 ? `Temporada ${currentYear}/${currentYear + 1}` : `Temporada ${currentYear - 1}/${currentYear}`;
  
  if (!uniqueSeasons.includes(currentRunSeason)) {
    uniqueSeasons.push(currentRunSeason);
  }
  
  // Sort seasons in descending order
  uniqueSeasons.sort((a, b) => b.localeCompare(a));

  // States
  const [selectedSeason, setSelectedSeason] = useState<string>(currentRunSeason);
  const [matchTypeFilter, setMatchTypeFilter] = useState<'all' | 'oficial' | 'amistoso'>('all');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [pdfNotification, setPdfNotification] = useState<{ show: boolean; name: string } | null>(null);

  const handleExportTeamReport = () => {
    const seasonLabel = selectedSeason === 'all' ? 'Todas las Temporadas' : selectedSeason;
    const typeLabel = matchTypeFilter === 'all' ? 'Todos los partidos' : matchTypeFilter === 'oficial' ? 'Partidos Oficiales' : 'Partidos Amistosos';
    setPdfNotification({
      show: true,
      name: `Reporte de Temporada - Recopilación (${seasonLabel} - ${typeLabel})`
    });
    setTimeout(() => setPdfNotification(null), 7500);
    exportTeamReportToPDF(filteredMatches, players, selectedSeason, matchTypeFilter);
  };

  const handleExportComparisons = () => {
    const selectedObjects = players.filter(p => selectedPlayerIds.includes(p.id));
    setPdfNotification({
      show: true,
      name: `Comparativa de Rendimiento (${selectedObjects.length} jugadora(s) seleccionadas)`
    });
    setTimeout(() => setPdfNotification(null), 7500);
    exportPlayerComparisonsToPDF(selectedObjects, filteredMatches);
  };

  // Filtered list of matches
  const seasonFilteredMatches = matches.filter(m => {
    if (selectedSeason === 'all') return true;
    return getMatchSeason(m.date) === selectedSeason;
  });

  const filteredMatches = seasonFilteredMatches.filter(m => {
    if (matchTypeFilter === 'all') return true;
    return m.matchType === matchTypeFilter;
  });

  // Aggregate global team/match data
  const totalMatches = filteredMatches.length;
  const wins = filteredMatches.filter(m => m.result === 'W').length;
  const draws = filteredMatches.filter(m => m.result === 'D').length;
  const losses = filteredMatches.filter(m => m.result === 'L').length;

  const totalGoalsFor = filteredMatches.reduce((acc, m) => acc + m.goalsFor, 0);
  const totalGoalsAgainst = filteredMatches.reduce((acc, m) => acc + m.goalsAgainst, 0);
  const totalTeamShots = filteredMatches.reduce((acc, m) => acc + m.teamShots, 0);
  const totalTeamYellows = filteredMatches.reduce((acc, m) => acc + m.teamYellows, 0);

  // Compute individual aggregated historical performance for ALL players based on filtered matches
  const playerStatsList = players.map(player => {
    let secondsPlayed = 0;
    let shots = 0;
    let goals = 0;
    let yellows = 0;
    let redCards = 0;
    let saves = 0;
    let goalsConceded = 0;
    let matchesParticipated = 0;

    filteredMatches.forEach(match => {
      const perf = match.stats[player.id];
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
      player,
      secondsPlayed,
      shots,
      goals,
      yellows,
      redCards,
      saves,
      goalsConceded,
      matchesParticipated
    };
  });

  // Recharts Data 1: Distribución de goles por jugadora (solo activas y con goles > 0)
  const goalsByPlayerData = playerStatsList
    .filter(p => p.player.isActive && p.goals > 0)
    .map(p => ({
      name: p.player.alias || p.player.name,
      goles: p.goals
    }))
    .sort((a, b) => b.goles - a.goles);

  // Recharts Data 2: Minutos jugados por jugadora (en minutos de juego acumulados)
  const minutesByPlayerData = playerStatsList
    .filter(p => p.player.isActive && p.secondsPlayed > 0)
    .map(p => ({
      name: p.player.alias || p.player.name,
      minutos: Math.round(p.secondsPlayed / 60)
    }))
    .sort((a, b) => b.minutos - a.minutos);

  // Recharts Data 3: Rendimiento de tiros global del equipo
  const totalShotsOnTarget = filteredMatches.reduce((acc, m) => {
    if (m.shotsEvents && m.shotsEvents.length > 0) {
      return acc + m.shotsEvents.filter(s => s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
    }
    return acc + m.goalsFor;
  }, 0);

  const totalShotsOut = filteredMatches.reduce((acc, m) => {
    if (m.shotsEvents && m.shotsEvents.length > 0) {
      return acc + m.shotsEvents.filter(s => s.team === 'local' && s.type === 'out').length;
    }
    return acc + Math.max(0, m.teamShots - m.goalsFor);
  }, 0);

  const horizontalShotsChartData = [
    {
      name: 'Tiros',
      'Dentro': totalShotsOnTarget,
      'Fuera': totalShotsOut,
      'Goles': 0
    },
    {
      name: 'Goles',
      'Dentro': 0,
      'Fuera': 0,
      'Goles': totalGoalsFor
    }
  ];

  // Filter and sort rankings for leaderboard presentation
  const topScorersList = [...playerStatsList]
    .filter(p => p.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.shots - a.shots);

  const topMinutesList = [...playerStatsList]
    .filter(p => p.secondsPlayed > 0)
    .sort((a, b) => b.secondsPlayed - a.secondsPlayed);

  const topShotsList = [...playerStatsList]
    .filter(p => p.shots > 0)
    .sort((a, b) => b.shots - a.shots);

  const topCardsList = [...playerStatsList]
    .filter(p => p.yellows > 0 || p.redCards > 0)
    .sort((a, b) => (b.yellows + b.redCards * 2) - (a.yellows + a.redCards * 2));

  // Toggle selection for comparison module
  const handleToggleComparePlayer = (playerId: string) => {
    setSelectedPlayerIds(prev => {
      if (prev.includes(playerId)) {
        return prev.filter(id => id !== playerId);
      } else {
        return [...prev, playerId];
      }
    });
  };

  // Helper format for minutes
  const displayMinsOnly = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')} min`;
  };

  // Select corresponding player objects for active comparison
  const comparedPlayerStats = playerStatsList.filter(ps => selectedPlayerIds.includes(ps.player.id));

  return (
    <div className="max-w-6xl mx-auto px-4 py-6" id="stats-dashboard-root">
      {/* HEADER SECTION WITH ACTION EXPORT */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-6 bg-[#004183] rounded-full"></span>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
              Análisis de Temporada
            </h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Rendimiento de tiros, distribución de goles, reparto de minutos y comparador táctico con filtros globales.
          </p>
        </div>
        
        {totalMatches > 0 && (
          <button
            onClick={handleExportTeamReport}
            id="btn-export-team-report-pdf"
            className="bg-[#004183] text-white hover:bg-[#002f61] font-extrabold px-5 py-3 rounded-xl text-xs tracking-wider transition uppercase flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 border-b-2 border-yellow-500"
          >
            <FileText size={16} className="text-[#FFD700]" />
            Exportar Informe de Temporada (PDF)
          </button>
        )}
      </div>

      {matches.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border shadow-sm">
          <Trophy size={48} className="mx-auto text-slate-300 mb-3 opacity-35" />
          <h3 className="text-lg font-bold text-slate-700">Aún no hay estadísticas registradas</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            Los datos de temporada aparecerán aquí automáticamente una vez se finalice y guarde el primer partido con el Live Tracker.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* GENERAL FILTER BAR (SEASON DISPLAY & MATCH TYPE DUAL FILTER) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            {/* Filter 1: Season Dropdown */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-slate-700 text-xs font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5 shrink-0">
                <Calendar size={14} className="text-[#004183]" />
                Filtrar Temporada:
              </span>
              <select
                value={selectedSeason}
                onChange={e => setSelectedSeason(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 focus:border-[#004183] rounded-xl px-3 py-2 text-xs font-bold text-[#004183] focus:outline-none focus:ring-1 focus:ring-[#004183] transition cursor-pointer"
              >
                <option value="all">🏆 Todas las Temporadas</option>
                {uniqueSeasons.map(seasonString => (
                  <option key={seasonString} value={seasonString}>
                    📅 {seasonString}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 2: Match Type Buttons */}
            <div className="flex flex-wrap items-center justify-start md:justify-end gap-2 text-right">
              <span className="text-slate-500 text-[11px] font-bold mr-1 block sm:inline">Tipo de Encuentro:</span>
              {(['all', 'oficial', 'amistoso'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setMatchTypeFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase transition cursor-pointer ${
                    matchTypeFilter === f
                      ? 'bg-[#004183] text-white border-b-2 border-yellow-400 shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {f === 'all' ? 'Todos' : f === 'oficial' ? 'Oficiales' : 'Amistosos'}
                </button>
              ))}
            </div>

            <div className="md:col-span-2 border-t border-slate-50 pt-3 flex justify-between items-center text-[10px] text-slate-400 font-mono">
              <span>Filtro activo: <strong className="text-[#004183]">{selectedSeason === 'all' ? 'Histórico Completo' : selectedSeason} (Partidos {matchTypeFilter === 'all' ? 'Todos' : matchTypeFilter})</strong></span>
              <span>Visualizando <strong className="text-blue-900 font-bold">{totalMatches}</strong> de <strong className="font-bold">{matches.length}</strong> partidos en el historial</span>
            </div>
          </div>

          {totalMatches === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
              <Trophy size={40} className="mx-auto text-slate-300 mb-2 opacity-40" />
              <h4 className="text-sm font-bold text-slate-700 font-display">Sin partidos registrados para este filtro</h4>
              <p className="text-xs text-slate-450 mt-1">
                No figura ningún récord que cumpla los criterios de <span className="font-bold text-[#004183]">{selectedSeason === 'all' ? 'Cualquier Temporada' : selectedSeason}</span> de tipo <span className="font-bold text-[#004183] uppercase">{matchTypeFilter === 'all' ? 'Todos' : matchTypeFilter === 'oficial' ? 'Oficial' : 'Amistoso'}</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* SECTION A: BENTO GRID CORNER */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* RECORD CARD */}
                <div className="bg-gradient-to-br from-[#004183] to-[#002750] text-white rounded-3xl p-6 shadow-md relative overflow-hidden flex flex-col justify-between min-h-[160px] border-l-4 border-yellow-400">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Trophy size={80} className="text-[#FFD700]" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-extrabold text-[#FFD700]">Balance del Club</span>
                    <p className="text-4xl font-black font-display mt-2">
                      {wins}V <span className="text-yellow-400 font-light">-</span> {draws}E <span className="text-yellow-400 font-light">-</span> {losses}D
                    </p>
                  </div>
                  <div className="flex justify-between items-center text-xs text-blue-100 pt-4 border-t border-white/10 mt-4">
                    <span>Porcentaje de Victorias:</span>
                    <span className="font-mono font-bold text-[#FFD700] bg-[#001f40] px-2 py-0.5 rounded">
                      {totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0}%
                    </span>
                  </div>
                </div>

                {/* BALANCE GOALS */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[160px]">
                  <div>
                    <span className="text-xs uppercase tracking-widest font-bold text-slate-400 block">Balance Goleador</span>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-4xl font-extrabold text-slate-900 font-display">{totalGoalsFor}</span>
                      <span className="text-slate-300 text-lg">/</span>
                      <span className="text-2xl font-bold text-slate-500">{totalGoalsAgainst}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Goles del Club vs Goles Recibidos</p>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500 pt-4 border-t border-slate-100 mt-4">
                    <span>Diferencia General:</span>
                    <span className={`font-bold font-mono px-2 py-0.5 rounded ${totalGoalsFor - totalGoalsAgainst >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {totalGoalsFor - totalGoalsAgainst > 0 ? '+' : ''}{totalGoalsFor - totalGoalsAgainst} goles
                    </span>
                  </div>
                </div>

                {/* AVERAGES AND SHOTS */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[160px]">
                  <div>
                    <span className="text-xs uppercase tracking-widest font-bold text-slate-400 block">Tiros</span>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Totales</span>
                        <span className="text-base font-bold text-slate-800 font-mono">{totalTeamShots}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-emerald-600 uppercase tracking-wider block">Dentro</span>
                        <span className="text-base font-bold text-emerald-600 font-mono">🎯 {totalShotsOnTarget}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-amber-600 uppercase tracking-wider block">Fuera</span>
                        <span className="text-base font-bold text-amber-600 font-mono">❌ {totalShotsOut}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-100 mt-4 text-xs text-slate-500 font-sans">
                    <span>Tiros para marcar 1 gol:</span>
                    <span className="font-mono font-bold text-[#004183] bg-blue-50 px-2 py-0.5 rounded">
                      {totalGoalsFor > 0 ? (totalTeamShots / totalGoalsFor).toFixed(1) : '0'} de media
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION B: CHARTS AND VISUALS FOR SEASON STATS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="visual-season-analytics-container">
                
                {/* Visual Chart 1: Goals Distribution */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 md:w-2.5 h-5 bg-[#004183] rounded-full"></span>
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      Distribución de Goles
                    </h4>
                  </div>
                  <div className="h-56 flex items-center justify-center">
                    {goalsByPlayerData.length === 0 ? (
                      <div className="text-center text-slate-400 p-4">
                        <Trophy size={28} className="mx-auto text-slate-300 mb-1 opacity-50" />
                        <p className="text-[11px] font-bold">Sin goles registrados</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">Ningún/a jugador/a ha marcado goles en los partidos filtrados.</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={goalsByPlayerData}
                            dataKey="goles"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={35}
                            outerRadius={65}
                            paddingAngle={3}
                            label={({ name, goles }) => `${name.substring(0, 7)} (${goles})`}
                          >
                            {goalsByPlayerData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`${value} goles`, 'Goles']} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Visual Chart 2: Minutes Played */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 md:w-2.5 h-5 bg-yellow-500 rounded-full"></span>
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      Minutos Jugados
                    </h4>
                  </div>
                  <div className="overflow-y-auto" style={{ height: `${Math.min(450, Math.max(220, minutesByPlayerData.length * 28))}px` }}>
                    {minutesByPlayerData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-center text-slate-400 p-4">
                        <div>
                          <Clock size={28} className="mx-auto text-slate-300 mb-1 opacity-50" />
                          <p className="text-[11px] font-bold">Sin minutos registrados</p>
                          <p className="text-[9px] mt-0.5">Los minutos jugados se acumularán con el Live Tracker.</p>
                        </div>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={minutesByPlayerData} layout="vertical" margin={{ top: 10, right: 15, left: -5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                          <XAxis type="number" stroke="#94a3b8" fontSize={9} fontFamily="var(--font-sans)" />
                          <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={9} fontFamily="var(--font-sans)" width={75} tickLine={false} interval={0} />
                          <Tooltip formatter={(value) => [`${value} min`, 'Minutos de Juego']} />
                          <Bar dataKey="minutos" fill="#004183" radius={[0, 4, 4, 0]} maxBarSize={15} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Visual Chart 3: Shots Breakdown */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 md:w-2.5 h-5 bg-emerald-500 rounded-full"></span>
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      Rendimiento de Tiros
                    </h4>
                  </div>
                  <div className="h-56">
                    {totalTeamShots === 0 ? (
                      <div className="h-full flex items-center justify-center text-center text-slate-400 p-4">
                        <div>
                          <Target size={28} className="mx-auto text-slate-300 mb-1 opacity-50" />
                          <p className="text-[11px] font-bold">Sin volumen de tiros</p>
                          <p className="text-[9px] mt-0.5">Se computarán las finalizaciones tácticas del club local.</p>
                        </div>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={horizontalShotsChartData} layout="vertical" margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f5f9" />
                          <XAxis type="number" stroke="#94a3b8" fontSize={9} fontFamily="var(--font-sans)" />
                          <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} fontFamily="var(--font-sans)" fontWeight="bold" width={55} tickLine={false} interval={0} />
                          <Tooltip content={<CustomShotsTooltip />} />
                          <Legend wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '10px', marginTop: '10px' }} />
                          <Bar dataKey="Dentro" stackId="tiros" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={20} />
                          <Bar dataKey="Fuera" stackId="tiros" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={20} />
                          <Bar dataKey="Goles" fill="#004183" radius={[0, 4, 4, 0]} maxBarSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION C: DYNAMIC PLAYER COMPARATOR MODULE (CHALLENGER MODULE) */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm" id="player-comparison-module">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5 font-display">
                      <UserCheck className="text-[#004183]" size={20} />
                      <span>Comparativa de Jugadoras ({selectedSeason === 'all' ? 'Completo' : selectedSeason})</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Selecciona jugadoras para generar una matriz comparativa cruzada enfocada en esta temporada.
                    </p>
                  </div>
                  
                  {selectedPlayerIds.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedPlayerIds([])}
                        className="text-xs text-slate-500 hover:text-slate-700 bg-slate-100 font-bold px-3 py-1.5 rounded-lg transition"
                      >
                        Limpiar Selección
                      </button>
                      <button
                        onClick={handleExportComparisons}
                        className="bg-[#FFD700] text-[#004183] border border-[#004183]/10 hover:bg-[#ffe13d] font-bold px-4 py-1.5 rounded-lg text-xs transition uppercase flex items-center gap-1 shadow-sm"
                      >
                        <FileText size={14} /> Exportar Comparativa (PDF)
                      </button>
                    </div>
                  )}
                </div>

                {/* List pool of players with checkbox badges */}
                <div className="flex flex-wrap gap-2.5 bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
                  {players
                    .filter(p => p.isActive)
                    .sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0))
                    .map(player => {
                    const isChecked = selectedPlayerIds.includes(player.id);
                    return (
                      <button
                        key={player.id}
                        onClick={() => handleToggleComparePlayer(player.id)}
                        className={`flex items-center gap-2 p-1.5 pr-3 rounded-xl border text-xs font-semibold cursor-pointer transition active:scale-95 ${
                          isChecked
                            ? 'bg-[#004183] text-white border-[#004183] shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {player.photo ? (
                          <img referrerPolicy="no-referrer" src={player.photo} className="w-6 h-6 rounded-full object-cover border border-slate-200" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-blue-900 text-yellow-400 text-[9px] font-bold flex items-center justify-center uppercase select-none border">
                            {(player.alias || player.name).substring(0, 2)}
                          </div>
                        )}
                        <span className="font-mono text-[11px] font-bold">#{player.number}</span>
                        <span>{player.alias || player.name}</span>
                        <span className="text-[9px] uppercase opacity-70">({player.position})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Comparison Matrix Table */}
                {selectedPlayerIds.length === 0 ? (
                  <div className="bg-slate-100/40 p-10 text-center rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center">
                    <Table className="text-slate-300 mb-2" size={32} />
                    <p className="text-xs font-medium text-slate-500">
                      Ninguna jugadora seleccionada para comparar.
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Haz clic en las jugadoras de la lista para abrir la matriz de comparación métrica.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                    <table className="w-full text-left min-w-[650px] border-collapse bg-white">
                      <thead>
                        <tr className="bg-[#004183] text-white text-xs uppercase font-bold tracking-wider divide-x divide-[#002f61]">
                          <th className="py-3 px-4">Métrica de Temporada</th>
                          {comparedPlayerStats.map(ps => (
                            <th key={ps.player.id} className="py-3 px-4 text-center">
                              <div className="flex flex-col items-center justify-center gap-1">
                                {ps.player.photo ? (
                                  <img referrerPolicy="no-referrer" src={ps.player.photo} className="w-10 h-10 rounded-full object-cover border-2 border-yellow-400" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-blue-950 text-yellow-400 font-bold font-mono text-xs flex items-center justify-center uppercase select-none border-2 border-yellow-400">
                                    {(ps.player.alias || ps.player.name).substring(0, 2)}
                                  </div>
                                )}
                                <div className="text-[11px] leading-tight font-display">
                                  <span className="text-yellow-300 font-mono mr-1">#{ps.player.number}</span>
                                  <span>{ps.player.alias || ps.player.name}</span>
                                </div>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-200">
                        {/* Position */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50">Posición Oficial</td>
                          {comparedPlayerStats.map(ps => (
                            <td key={ps.player.id} className="py-3 px-4 text-center text-slate-600 font-bold uppercase">{ps.player.position}</td>
                          ))}
                        </tr>
                        {/* Matches participated */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50">Partidos Jugados (Minutados)</td>
                          {comparedPlayerStats.map(ps => (
                            <td key={ps.player.id} className="py-3 px-4 text-center font-mono text-slate-900 font-bold">
                              {ps.matchesParticipated} {ps.matchesParticipated === 1 ? 'partido' : 'partidos'}
                            </td>
                          ))}
                        </tr>
                        {/* Time Played */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50">Tiempo Acumulado</td>
                          {comparedPlayerStats.map(ps => (
                            <td key={ps.player.id} className="py-3 px-4 text-center font-mono text-slate-900 font-bold">
                              {displayMinsOnly(ps.secondsPlayed)}
                            </td>
                          ))}
                        </tr>
                        {/* Average minutes */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50">Promedio Minutos por Juego</td>
                          {comparedPlayerStats.map(ps => {
                            const avgSec = ps.matchesParticipated > 0 ? Math.floor(ps.secondsPlayed / ps.matchesParticipated) : 0;
                            return (
                              <td key={ps.player.id} className="py-3 px-4 text-center font-mono text-blue-900">
                                {Math.floor(avgSec / 60)}:{(avgSec % 60).toString().padStart(2, '0')} min
                              </td>
                            );
                          })}
                        </tr>
                        {/* Goals */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50">Goles Marcados</td>
                          {comparedPlayerStats.map(ps => (
                            <td key={ps.player.id} className="py-4 px-4 text-center text-emerald-700 font-extrabold text-sm">⚽ {ps.goals}</td>
                          ))}
                        </tr>
                        {/* Shots */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50">Tiros Realizados</td>
                          {comparedPlayerStats.map(ps => (
                            <td key={ps.player.id} className="py-3 px-4 text-center font-mono text-slate-900">{ps.shots} tiros</td>
                          ))}
                        </tr>
                        {/* Shooting efficiency */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50">Efectividad de Tiro</td>
                          {comparedPlayerStats.map(ps => {
                            const pct = ps.shots > 0 ? Math.round((ps.goals / ps.shots) * 100) : 0;
                            return (
                              <td key={ps.player.id} className="py-3 px-4 text-center">
                                <span className={`px-2.5 py-0.5 rounded-full font-bold font-mono text-xs ${pct >= 40 ? 'bg-emerald-100 text-emerald-800' : pct >= 15 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                                  {pct}%
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                        {/* Saves */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50">Paradas (Portero/a)</td>
                          {comparedPlayerStats.map(ps => {
                            const isGK = ps.player.position === 'Portero/a';
                            return (
                              <td key={ps.player.id} className="py-3 px-4 text-center font-bold font-mono text-indigo-700">
                                {isGK ? `${ps.saves} paradas` : '-'}
                              </td>
                            );
                          })}
                        </tr>
                        {/* Conceded */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50">Goles Encajados</td>
                          {comparedPlayerStats.map(ps => {
                            const isGK = ps.player.position === 'Portero/a';
                            return (
                              <td key={ps.player.id} className="py-3 px-4 text-center font-bold font-mono text-rose-600">
                                {isGK ? `${ps.goalsConceded} goles` : '-'}
                              </td>
                            );
                          })}
                        </tr>
                        {/* Cards */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50">Historial Amonestaciones</td>
                          {comparedPlayerStats.map(ps => (
                            <td key={ps.player.id} className="py-3 px-4 text-center">
                              <div className="flex justify-center gap-1.5 font-mono">
                                {ps.yellows > 0 && (
                                  <span className="bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                                    🟨 {ps.yellows}
                                  </span>
                                )}
                                {ps.redCards > 0 && (
                                  <span className="bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded font-bold">
                                    🟥 {ps.redCards}
                                  </span>
                                )}
                                {ps.yellows === 0 && ps.redCards === 0 && (
                                  <span className="text-emerald-600 text-[10px]">Limpio</span>
                                )}
                              </div>
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SECTION D: SQUAD LEADERBOARDS AND RANKINGS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* GOALSCORERS RANKING */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm" id="widget-scorers-ranking">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2 font-display">
                    <Trophy size={18} className="text-yellow-500" />
                    <span>Goleadoras</span>
                  </h3>

                  {topScorersList.length === 0 ? (
                    <p className="text-slate-400 text-sm py-4 text-center">No se han registrado goles para este filtro.</p>
                  ) : (
                    <div className="space-y-3">
                      {topScorersList.slice(0, 5).map((stat, idx) => {
                        const maxGoals = topScorersList[0]?.goals || 1;
                        const percentWidth = Math.max(12, Math.round((stat.goals / maxGoals) * 100));

                        return (
                          <div key={stat.player.id} className="space-y-1">
                            <div className="flex justify-between items-center text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-400 font-mono text-xs w-4">#{idx + 1}</span>
                                
                                {stat.player.photo ? (
                                  <img referrerPolicy="no-referrer" src={stat.player.photo} className="w-5.5 h-5.5 rounded-full object-cover border border-slate-200 shadow-xs" />
                                ) : (
                                  <div className="w-5.5 h-5.5 rounded-full bg-blue-900 border text-yellow-400 font-bold font-mono text-[8px] flex items-center justify-center uppercase select-none shrink-0 shadow-xs">
                                    {stat.player.name.substring(0, 2)}
                                  </div>
                                )}

                                <span className="font-bold text-[#004183] font-mono text-[10px] ml-0.5">
                                  #{stat.player.number}
                                </span>
                                <span className="font-semibold text-slate-800">{stat.player.name}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">{stat.player.position}</span>
                              </div>
                              <span className="font-bold text-indigo-900 font-mono">{stat.goals} Goles</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-700 to-[#004183] rounded-full transition-all"
                                style={{ width: `${percentWidth}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* PLAYING TIME / ROTATIONS RANKING */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm" id="widget-minutes-ranking">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2 font-display">
                    <Clock size={18} className="text-blue-500" />
                    <span>Minutos Jugados</span>
                  </h3>

                  {topMinutesList.length === 0 ? (
                    <p className="text-slate-400 text-sm py-4 text-center">No hay registros de tiempo acumulado.</p>
                  ) : (
                    <div className="space-y-3">
                      {topMinutesList.slice(0, 5).map((stat, idx) => {
                        const maxSecs = topMinutesList[0]?.secondsPlayed || 1;
                        const percentWidth = Math.max(12, Math.round((stat.secondsPlayed / maxSecs) * 100));

                        return (
                          <div key={stat.player.id} className="space-y-1">
                            <div className="flex justify-between items-center text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-400 font-mono text-xs w-4">#{idx + 1}</span>
                                
                                {stat.player.photo ? (
                                  <img referrerPolicy="no-referrer" src={stat.player.photo} className="w-5.5 h-5.5 rounded-full object-cover border border-slate-200 shadow-xs" />
                                ) : (
                                  <div className="w-5.5 h-5.5 rounded-full bg-blue-900 border text-yellow-400 font-bold font-mono text-[8px] flex items-center justify-center uppercase select-none shrink-0 shadow-xs">
                                    {stat.player.name.substring(0, 2)}
                                  </div>
                                )}

                                <span className="font-bold text-slate-700 font-mono text-[10px] ml-0.5">
                                  #{stat.player.number}
                                </span>
                                <span className="font-semibold text-slate-800">{stat.player.name}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">{stat.player.position}</span>
                              </div>
                              <span className="font-mono text-slate-600 text-xs font-semibold">{displayMinsOnly(stat.secondsPlayed)}</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#004183] rounded-full transition-all"
                                style={{ width: `${percentWidth}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SHOTS TAKEN LEADERBOARD */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm" id="widget-shots-ranking">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2 font-display">
                    <Target size={18} className="text-[#FFD700]" />
                    <span>Clasificación por Tiros</span>
                  </h3>

                  {topShotsList.length === 0 ? (
                    <p className="text-slate-400 text-sm py-4 text-center">No se han registrado tiros.</p>
                  ) : (
                    <div className="space-y-3">
                      {topShotsList.slice(0, 5).map((stat, idx) => {
                        const maxShots = topShotsList[0]?.shots || 1;
                        const percentWidth = Math.max(12, Math.round((stat.shots / maxShots) * 100));

                        return (
                          <div key={stat.player.id} className="space-y-1">
                            <div className="flex justify-between items-center text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-400 font-mono text-xs w-4">#{idx + 1}</span>
                                
                                {stat.player.photo ? (
                                  <img referrerPolicy="no-referrer" src={stat.player.photo} className="w-5.5 h-5.5 rounded-full object-cover border border-slate-200 shadow-xs" />
                                ) : (
                                  <div className="w-5.5 h-5.5 rounded-full bg-blue-900 border text-yellow-400 font-bold font-mono text-[8px] flex items-center justify-center uppercase select-none shrink-0 shadow-xs">
                                    {stat.player.name.substring(0, 2)}
                                  </div>
                                )}

                                <span className="font-bold text-slate-700 font-mono text-[10px] mx-0.5">
                                  #{stat.player.number}
                                </span>
                                <span className="font-semibold text-slate-800">{stat.player.name}</span>
                                <span className="text-[10px] text-slate-500 uppercase">({stat.player.position})</span>
                              </div>
                              <span className="font-bold font-mono text-slate-700">{stat.shots} tiros</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-yellow-500 to-[#FFD700] rounded-full transition-all"
                                style={{ width: `${percentWidth}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* DISCIPLINE / CARDS LIST */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm" id="widget-discipline-ranking">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2 font-display">
                    <AlertTriangle size={18} className="text-amber-500" />
                    <span>Amonestaciones</span>
                  </h3>

                  {topCardsList.length === 0 ? (
                    <p className="text-emerald-600 text-sm py-4 text-center flex items-center justify-center gap-1.5 font-medium">
                      <CheckCircle size={16} /> ¡Rendimiento disciplinario impecable en esta selección!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {topCardsList.slice(0, 5).map((stat, idx) => {
                        return (
                          <div key={stat.player.id} className="flex justify-between items-center text-sm bg-slate-50 px-3.5 py-2.5 border border-slate-100 rounded-xl">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-400 font-mono text-xs">#{idx + 1}</span>
                              <span className="font-bold text-slate-800">{stat.player.name}</span>
                            </div>
                            <div className="flex items-center gap-3 font-mono text-xs">
                              {stat.yellows > 0 && (
                                <span className="inline-flex items-center font-bold bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md">
                                  🟨 {stat.yellows} {stat.yellows === 1 ? 'Amarilla' : 'Amarillas'}
                                </span>
                              )}
                              {stat.redCards > 0 && (
                                <span className="inline-flex items-center font-bold bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-md">
                                  🟥 {stat.redCards} {stat.redCards === 1 ? 'Roja' : 'Rojas'}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}
        </div>
      )}

      {/* PDF Floating Toast Notification */}
      {pdfNotification && (
        <div className="fixed bottom-6 right-6 left-6 md:left-auto md:max-w-md bg-slate-900 border border-slate-800 text-white p-4.5 rounded-2xl shadow-2xl z-[99999] animate-bounce-up flex flex-col gap-2 font-sans">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400">
              <FileText size={16} className="animate-pulse" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black uppercase text-blue-400 tracking-wider">Generando Informe PDF</p>
              <p className="text-xs font-medium text-slate-200">{pdfNotification.name}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-normal border-t border-slate-800/80 pt-2 mt-1">
            <strong>¿No se inicia la descarga?</strong> Al estar visualizando la aplicación dentro del visor web integrado (iframe), algunos navegadores bloquean la descarga directa de archivos.
            <span className="text-blue-400 font-bold block mt-1">Solución: Haz clic en el botón de la esquina superior derecha y selecciona "Abrir en nueva pestaña" para realizar descargas sin restricciones.</span>
          </p>
        </div>
      )}
    </div>
  );
}
