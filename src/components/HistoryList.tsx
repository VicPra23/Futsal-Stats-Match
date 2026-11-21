/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  FileText,
  Calendar,
  Search,
  Award,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Star,
  Filter,
  Check,
  Trash2,
  MessageSquare,
  Save,
} from "lucide-react";
import { Match, Player } from "../types";
import { exportMatchToPDF } from "../utils/pdfGenerator";
import {
  computeQuintetStats,
  getDisplayRotationEvents,
  getDisambiguatedPlayerLabel,
  formatSecondsMMSS,
} from "../utils/lineupAnalytics";

interface HistoryListProps {
  matches: Match[];
  players: Player[];
  onDeleteMatch?: (id: string) => void;
  onUpdateMatchComment?: (id: string, comment: string) => void;
  activeTeamName?: string;
}

// Season calculator helper
function getMatchSeason(dateStr: string): string {
  if (!dateStr) return "Temporada 2026/2027";
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) return "Temporada 2026/2027";
  // Seasons run from July 1st (month 7) to June 30th (month 6) of the following year
  if (month >= 7) {
    return `Temporada ${year}/${year + 1}`;
  } else {
    return `Temporada ${year - 1}/${year}`;
  }
}

export default function HistoryList({
  matches,
  players,
  onDeleteMatch,
  onUpdateMatchComment,
  activeTeamName,
}: HistoryListProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [commentsState, setCommentsState] = useState<Record<string, string>>(
    {},
  );
  const [savedNotificationId, setSavedNotificationId] = useState<string | null>(
    null,
  );
  const [rotationViewTab, setRotationViewTab] = useState<
    Record<string, "quintets" | "timeline">
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<"ALL" | "W" | "D" | "L">(
    "ALL",
  );
  const [competitionFilter, setCompetitionFilter] = useState<
    "ALL" | "oficial" | "amistoso"
  >("oficial");
  const [seasonFilter, setSeasonFilter] = useState<string>("ALL");
  const [selectedJornadas, setSelectedJornadas] = useState<number[]>([]);
  const [jornadaDropdownOpen, setJornadaDropdownOpen] = useState(false);
  const [pdfNotification, setPdfNotification] = useState<{
    show: boolean;
    name: string;
  } | null>(null);

  const getResultBadgeColors = (res: "W" | "D" | "L") => {
    switch (res) {
      case "W":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "D":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "L":
        return "bg-rose-100 text-rose-800 border-rose-200";
      default:
        return "bg-slate-100 text-slate-800";
    }
  };

  const getResultLabel = (res: "W" | "D" | "L") => {
    switch (res) {
      case "W":
        return "Victoria (V)";
      case "D":
        return "Empate (E)";
      case "L":
        return "Derrota (D)";
    }
  };

  // Convert seconds to beautiful MM:SS
  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Dynamically extract all unique seasons
  const uniqueSeasons = Array.from(
    new Set(matches.map((m) => getMatchSeason(m.date))),
  );
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentRunSeason =
    currentMonth >= 7
      ? `Temporada ${currentYear}/${currentYear + 1}`
      : `Temporada ${currentYear - 1}/${currentYear}`;
  if (!uniqueSeasons.includes(currentRunSeason)) {
    uniqueSeasons.push(currentRunSeason);
  }
  uniqueSeasons.sort((a, b) => b.localeCompare(a));

  // Dynamically extract all unique match days (jornadas)
  const uniqueJornadas = Array.from(
    new Set(
      matches
        .map((m) => m.jornada)
        .filter((j) => j !== undefined && j !== null),
    ),
  ).sort((a, b) => a - b);

  const toggleJornada = (jornada: number) => {
    if (selectedJornadas.includes(jornada)) {
      setSelectedJornadas(selectedJornadas.filter((j) => j !== jornada));
    } else {
      setSelectedJornadas([...selectedJornadas, jornada]);
    }
  };

  const clearJornadas = () => {
    setSelectedJornadas([]);
  };

  // Filter criteria
  const filteredMatches = matches
    .filter((match) => {
      const matchRival = match.rival.toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchText = `vs ${matchRival} jornada ${match.jornada}`;
      const matchesSearch = matchText.includes(query);
      const matchesOutcome =
        outcomeFilter === "ALL" || match.result === outcomeFilter;
      const matchesCompetition =
        competitionFilter === "ALL" || match.matchType === competitionFilter;
      const matchesSeason =
        seasonFilter === "ALL" || getMatchSeason(match.date) === seasonFilter;
      const matchesJornada =
        competitionFilter !== "oficial" ||
        selectedJornadas.length === 0 ||
        selectedJornadas.includes(match.jornada);
      return (
        matchesSearch &&
        matchesOutcome &&
        matchesCompetition &&
        matchesSeason &&
        matchesJornada
      );
    })
    // Sort reverse chronological: most recent match on top
    .sort(
      (a, b) =>
        (b.jornada || 0) - (a.jornada || 0) ||
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

  const handleExportPDF = (e: React.MouseEvent, match: Match) => {
    e.stopPropagation(); // Avoid expanding/collapsing card when clicking button
    const teamPrefix = activeTeamName && activeTeamName.trim() ? activeTeamName.trim() : "FS Talavera";
    const displayName =
      match.matchType === "amistoso"
        ? `${teamPrefix} Amistoso vs ${match.rival}`
        : `${teamPrefix} Jornada ${match.jornada} vs ${match.rival}`;

    setPdfNotification({
      show: true,
      name: displayName,
    });

    setTimeout(() => {
      setPdfNotification(null);
    }, 7500);

    try {
      exportMatchToPDF(match, players, activeTeamName);
    } catch (err) {
      console.error("Error generating PDF report:", err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6" id="history-list-root">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
          Histórico de Jornadas
        </h2>
        <p className="text-sm text-slate-500">
          Consulta los resultados oficiales de la liga, revisa las estadísticas
          individuales de cada convocatoria.
        </p>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 flex flex-col gap-4">
        {/* Search input */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3.5 top-3 text-slate-400"
          />
          <input
            type="text"
            placeholder="Buscar por rival o jornada..."
            value={searchQuery}
            id="history-search-input"
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 transition"
          />
        </div>{" "}
        {/* Filters grid */}
        <div
          className={`grid grid-cols-1 gap-3 ${competitionFilter === "oficial" ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
        >
          {/* Competition Filter */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Competición:
            </span>
            <select
              value={competitionFilter}
              id="history-competition-filter"
              onChange={(e) => {
                const val = e.target.value as any;
                setCompetitionFilter(val);
                if (val !== "oficial") {
                  setSelectedJornadas([]);
                }
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer text-slate-700 font-sans"
            >
              <option value="oficial">Partidos Oficiales</option>
              <option value="amistoso">Partidos Amistosos</option>
              <option value="ALL">Todos los partidos</option>
            </select>
          </div>

          {/* Jornada Multiple Selection Filter - ONLY SHOWN IF 'oficial' IS SELECTED */}
          {competitionFilter === "oficial" && (
            <div className="flex flex-col gap-1 relative">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Jornada:
              </span>

              {/* Dropdown Button */}
              <button
                type="button"
                onClick={() => setJornadaDropdownOpen(!jornadaDropdownOpen)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer text-slate-700 flex justify-between items-center text-left min-h-[34px]"
              >
                <span className="truncate">
                  {selectedJornadas.length === 0
                    ? "Todas las jornadas"
                    : selectedJornadas.length === 1
                      ? `Jornada ${selectedJornadas[0]}`
                      : `${selectedJornadas.length} seleccionadas`}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform ${jornadaDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Click outside overlay closes the dropdown */}
              {jornadaDropdownOpen && (
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setJornadaDropdownOpen(false)}
                />
              )}

              {/* Checkbox List Dropdown */}
              {jornadaDropdownOpen && (
                <div className="absolute top-[100%] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto p-2">
                  {uniqueJornadas.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-2">
                      No hay jornadas
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={clearJornadas}
                        className="w-full text-left text-[11px] text-blue-900 font-bold hover:bg-blue-50 px-2 py-1 rounded transition mb-1"
                      >
                        Restablecer todas
                      </button>
                      {uniqueJornadas.map((jornada) => {
                        const isChecked = selectedJornadas.includes(jornada);
                        return (
                          <label
                            key={jornada}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-medium text-slate-700 select-none"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleJornada(jornada)}
                              className="rounded border-slate-300 text-blue-900 focus:ring-blue-950 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span>Jornada {jornada}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Outcome Filter */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Resultado:
            </span>
            <select
              value={outcomeFilter}
              id="history-outcome-filter"
              onChange={(e) => setOutcomeFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer text-slate-700 font-sans"
            >
              <option value="ALL">Todos los partidos</option>
              <option value="W">Victorias (V)</option>
              <option value="D">Empates (E)</option>
              <option value="L">Derrotas (D)</option>
            </select>
          </div>

          {/* Season Filter */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Temporada:
            </span>
            <select
              value={seasonFilter}
              id="history-season-filter"
              onChange={(e) => setSeasonFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer text-slate-700 font-sans"
            >
              <option value="ALL">Todas</option>
              {uniqueSeasons.map((season) => (
                <option key={season} value={season}>
                  {season}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* MATCHDAY CARDS GRID */}
      {filteredMatches.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border overflow-hidden shadow-sm">
          <Calendar
            size={48}
            className="mx-auto text-slate-300 mb-3 opacity-30"
          />
          <p className="font-semibold text-slate-600">
            No se encontraron jornadas registradas
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Intenta modificar los filtros de búsqueda o registra un partido
            activo en el Live Tracker.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMatches.map((match) => {
            const isExpanded = selectedMatchId === match.id;

            return (
              <div
                key={match.id}
                onClick={() => setSelectedMatchId(isExpanded ? null : match.id)}
                className={`bg-white rounded-2xl border transition duration-150 select-none ${
                  isExpanded
                    ? "border-blue-900 ring-1 ring-blue-900/10 shadow-md"
                    : "border-slate-200 hover:border-slate-300 shadow-sm"
                }`}
              >
                {/* CARD SUMMARY HEADER ROW */}
                <div className="p-4 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer">
                  <div className="flex items-start gap-4">
                    {/* Outcome Badge visual */}
                    <div
                      className={`px-4 py-3 rounded-xl border text-center font-bold shrink-0 select-none flex items-center justify-center min-w-[52px] ${getResultBadgeColors(match.result)}`}
                    >
                      <span className="block text-xl font-black uppercase leading-none">
                        {match.result === "W"
                          ? "V"
                          : match.result === "D"
                            ? "E"
                            : "D"}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                          {match.matchType === "amistoso"
                            ? "Amistoso"
                            : `Jornada ${match.jornada}`}
                        </span>
                        <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          (match.talaveraKit || '1ª Equipación') === '1ª Equipación'
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-pink-100 text-pink-700'
                        }`}>
                          {(match.talaveraKit || '1ª Equipación') === '1ª Equipación' ? '🏠 Local' : '✈️ Visitante'}
                        </span>
                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                          <Calendar size={12} /> {match.date}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 font-display">
                        vs{" "}
                        <span className="text-blue-950 font-extrabold">
                          {match.rival}
                        </span>
                      </h3>
                    </div>
                  </div>

                  {/* SCOREBOARD SINK */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                    <div className="text-right">
                      <p className="text-2xl font-black font-display text-slate-900 tracking-tight select-all">
                        {match.goalsFor}{" "}
                        <span className="text-slate-300 text-lg font-light">
                          {" "}
                          -{" "}
                        </span>{" "}
                        {match.goalsAgainst}
                      </p>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Marcador Final
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleExportPDF(e, match)}
                        id={`btn-export-pdf-${match.id}`}
                        className="inline-flex items-center gap-1.5 bg-blue-50/50 hover:bg-blue-100 text-blue-900 border border-blue-200 hover:border-blue-300 font-semibold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer"
                        title="Exportar informe del partido a PDF"
                      >
                        <FileText size={14} />
                        <span>PDF</span>
                      </button>

                      {/* Delete button option */}
                      {onDeleteMatch && (
                        <div
                          className="relative flex items-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {deletingMatchId === match.id ? (
                            <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1 z-10 shadow-sm animate-fade-in">
                              <span className="text-rose-700 text-[10px] font-bold uppercase tracking-wide">
                                ¿Borrar?
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteMatch(match.id);
                                  setDeletingMatchId(null);
                                }}
                                className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-md transition cursor-pointer"
                              >
                                Sí
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingMatchId(null);
                                }}
                                className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md transition cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingMatchId(match.id);
                              }}
                              className="inline-flex items-center justify-center p-2 text-rose-500 hover:text-rose-700 bg-rose-50/50 hover:bg-rose-100 border border-rose-100 hover:border-rose-200 rounded-xl transition cursor-pointer"
                              title="Borrar partido de la app"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}

                      <div className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition">
                        {isExpanded ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* DETAILED EXPANDED ACCORDION VIEW */}
                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 md:p-6 bg-slate-50/50 rounded-b-2xl animate-fade-in text-slate-800">
                    {/* Team Match Statistics comparison */}
                    {(() => {
                      const shots = match.shotsEvents || [];
                      const localShots = shots.filter((s) => s.team === "local");
                      const onTargetShotsCount = localShots.filter(
                        (s) => s.type === "on_target" || s.type === "goal",
                      ).length;
                      const accuracyVal =
                        localShots.length > 0
                          ? Math.round(
                              (onTargetShotsCount / localShots.length) * 100,
                            )
                          : 0;

                      const s1L_in = shots.filter(s => s.half === 1 && s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
                      const s1L_out = shots.filter(s => s.half === 1 && s.team === 'local' && s.type === 'out').length;
                      const s1L_tot = s1L_in + s1L_out;
                      const s1R_in = shots.filter(s => s.half === 1 && s.team === 'rival' && (s.type === 'on_target' || s.type === 'goal')).length;
                      const s1R_out = shots.filter(s => s.half === 1 && s.team === 'rival' && s.type === 'out').length;
                      const s1R_tot = s1R_in + s1R_out;

                      const s2L_in = shots.filter(s => s.half === 2 && s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
                      const s2L_out = shots.filter(s => s.half === 2 && s.team === 'local' && s.type === 'out').length;
                      const s2L_tot = s2L_in + s2L_out;
                      const s2R_in = shots.filter(s => s.half === 2 && s.team === 'rival' && (s.type === 'on_target' || s.type === 'goal')).length;
                      const s2R_out = shots.filter(s => s.half === 2 && s.team === 'rival' && s.type === 'out').length;
                      const s2R_tot = s2R_in + s2R_out;

                      const totL_in = s1L_in + s2L_in;
                      const totL_out = s1L_out + s2L_out;
                      const totL_tot = totL_in + totL_out;
                      const totR_in = s1R_in + s2R_in;
                      const totR_out = s1R_out + s2R_out;
                      const totR_tot = totR_in + totR_out;

                      const p2 = (n: number) => String(n).padStart(2, '0');

                      return (
                        <div className="space-y-4 mb-6">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200/60 text-center">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                                Goles
                              </span>
                              <span className="text-2xl font-black text-blue-900 block mt-0.5 font-sans">
                                {match.goalsFor}
                              </span>
                            </div>
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200/60 text-center">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                                Goles Encajados
                              </span>
                              <span className="text-2xl font-black text-rose-800 block mt-0.5 font-sans">
                                {match.goalsAgainst}
                              </span>
                            </div>
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200/60 text-center">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                                Tiros Totales
                              </span>
                              <span className="text-2xl font-black text-slate-800 block mt-0.5 font-sans">
                                {match.teamShots}
                              </span>
                            </div>
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200/60 text-center">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                                % Acierto a Puerta
                              </span>
                              <span className="text-2xl font-black text-emerald-600 block mt-0.5 font-sans">
                                {accuracyVal}%
                              </span>
                            </div>
                          </div>

                          {shots.length > 0 && (
                            <div className="bg-white border border-slate-200/80 rounded-xl p-3">
                              <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-100">
                                <span className="text-[10px] font-black text-[#004183] uppercase tracking-wider">
                                  Desglose de Tiros por Parte y Totales
                                </span>
                                <span className="text-[9px] text-slate-400 font-semibold">(Dentro / Fuera / Total)</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11px]">
                                <div className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 flex justify-between items-center">
                                  <span className="font-sans font-bold text-slate-600 text-[10px]">1ª Parte</span>
                                  <div className="flex gap-2.5">
                                    <span className="font-black text-[#004183]" title="Local">L: T:{p2(s1L_in)}/{p2(s1L_out)}/{p2(s1L_tot)}</span>
                                    <span className="text-slate-300">|</span>
                                    <span className="font-black text-rose-600" title="Rival">R: T:{p2(s1R_in)}/{p2(s1R_out)}/{p2(s1R_tot)}</span>
                                  </div>
                                </div>
                                <div className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 flex justify-between items-center">
                                  <span className="font-sans font-bold text-slate-600 text-[10px]">2ª Parte</span>
                                  <div className="flex gap-2.5">
                                    <span className="font-black text-[#004183]" title="Local">L: T:{p2(s2L_in)}/{p2(s2L_out)}/{p2(s2L_tot)}</span>
                                    <span className="text-slate-300">|</span>
                                    <span className="font-black text-rose-600" title="Rival">R: T:{p2(s2R_in)}/{p2(s2R_out)}/{p2(s2R_tot)}</span>
                                  </div>
                                </div>
                                <div className="bg-blue-50/70 px-3 py-2 rounded-lg border border-blue-200/80 flex justify-between items-center">
                                  <span className="font-sans font-black text-[#004183] text-[10px]">TOTAL</span>
                                  <div className="flex gap-2.5">
                                    <span className="font-black text-[#004183]" title="Local">L: T:{p2(totL_in)}/{p2(totL_out)}/{p2(totL_tot)}</span>
                                    <span className="text-blue-200">|</span>
                                    <span className="font-black text-rose-600" title="Rival">R: T:{p2(totR_in)}/{p2(totR_out)}/{p2(totR_tot)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* TABLE OF DETAILED INDIVIDUAL STATS */}
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1">
                      <Star
                        size={12}
                        className="text-yellow-500 fill-yellow-500"
                      />{" "}
                      Estadísticas encuentro
                    </h4>

                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        {(() => {
                          // Filter to only players convocadas for this match
                          const convocadasIds = new Set([
                            ...(match.titulares || []),
                            ...(match.suplentes || []),
                            ...Object.keys(match.stats || {}),
                          ]);

                          const convocadasList = players.filter((p) =>
                            convocadasIds.has(p.id),
                          );

                          // Sort convocadas: Goalkeepers first, then by dorsal number
                          const sortedConvocadas = [...convocadasList].sort(
                            (a, b) => {
                              const aIsGk = a.position === "Portero/a";
                              const bIsGk = b.position === "Portero/a";
                              if (aIsGk && !bIsGk) return -1;
                              if (!aIsGk && bIsGk) return 1;
                              return (
                                (Number(a.number) || 0) -
                                (Number(b.number) || 0)
                              );
                            },
                          );

                          const playersToRender =
                            sortedConvocadas.length > 0
                              ? sortedConvocadas
                              : players.filter((p) => p.isActive);

                          return (
                            <table className="w-full text-left text-[11px] text-slate-700 font-sans table-fixed min-w-0">
                              <thead className="bg-slate-50 text-slate-500 font-bold border-b text-[10px] uppercase tracking-wide">
                                <tr>
                                  <th className="p-2 text-center w-[8%] font-sans">
                                    #
                                  </th>
                                  <th className="p-2 text-left w-[24%] font-sans">
                                    Jugadora
                                  </th>
                                  <th className="p-2 text-center w-[10%] font-sans">
                                    Pos.
                                  </th>
                                  <th className="p-2 text-center w-[14%] font-sans">
                                    Minutos
                                  </th>
                                  <th className="p-2 text-center w-[8%] font-sans">
                                    Goles
                                  </th>
                                  <th className="p-2 text-center w-[8%] font-sans">
                                    Tiros
                                  </th>
                                  <th className="p-2 text-center w-[10%] font-sans">
                                    Paradas
                                  </th>
                                  <th className="p-2 text-center w-[6%] font-sans">
                                    Enc.
                                  </th>
                                  <th className="p-2 text-center w-[6%] font-sans">
                                    Am.
                                  </th>
                                  <th className="p-2 text-center w-[6%] font-sans">
                                    Roja
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-sans">
                                {playersToRender.map((player) => {
                                  const perf = match.stats[player.id] || {
                                    secondsPlayed: 0,
                                    shots: 0,
                                    goals: 0,
                                    yellows: 0,
                                    redCard: false,
                                    saves: 0,
                                    goalsConceded: 0,
                                  };

                                  const isGK = player.position === "Portero/a";

                                  return (
                                    <tr
                                      key={player.id}
                                      className="hover:bg-slate-50/50"
                                    >
                                      <td className="p-2 text-center font-bold text-slate-400 font-sans">
                                        #{player.number}
                                      </td>
                                      <td
                                        className="p-2 font-bold text-slate-800 font-sans truncate"
                                        title={player.name}
                                      >
                                        {player.name}
                                      </td>
                                      <td className="p-2 text-center font-sans">
                                        <span className="text-[9px] font-bold uppercase tracking-wide bg-slate-100 px-1.5 py-0.5 rounded-md text-slate-600 font-sans">
                                          {player.position === "Portero/a"
                                            ? "GK"
                                            : player.position}
                                        </span>
                                      </td>
                                      <td className="p-2 text-center font-medium text-slate-600 font-sans">
                                        {formatTime(perf.secondsPlayed)}
                                      </td>
                                      <td className="p-2 text-center font-bold text-blue-950 font-sans">
                                        {perf.goals > 0
                                          ? `⚽ ${perf.goals}`
                                          : "0"}
                                      </td>
                                      <td className="p-2 text-center font-medium text-slate-700 font-sans">
                                        {perf.shots}
                                      </td>
                                      <td className="p-2 text-center font-medium text-blue-700 font-sans">
                                        {isGK ? perf.saves || 0 : "-"}
                                      </td>
                                      <td className="p-2 text-center font-medium text-rose-600 font-sans">
                                        {isGK ? perf.goalsConceded || 0 : "-"}
                                      </td>
                                      <td className="p-2 text-center font-sans">
                                        {perf.yellows > 0 ? (
                                          <span className="inline-block px-1.5 py-0.5 rounded bg-yellow-400 text-yellow-950 font-bold font-sans">
                                            {perf.yellows}
                                          </span>
                                        ) : (
                                          <span className="text-slate-300">
                                            0
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-2 text-center font-sans">
                                        {perf.redCard ? (
                                          <span className="inline-block px-2 py-0.5 rounded bg-rose-600 text-white font-black text-[10px] font-sans">
                                            1
                                          </span>
                                        ) : (
                                          <span className="text-slate-300">
                                            0
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </div>

                    {/* ROTACIONES Y QUINTETOS EN PISTA */}
                    <div
                      className="mt-6 border-t border-slate-200/60 pt-5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(() => {
                        const hasRotationData = Boolean(
                          match.rotationEvents && match.rotationEvents.length > 0,
                        );
                        const playerMap = new Map(players.map((p) => [p.id, p]));
                        const rotPoolIds = new Set<string>([
                          ...(match.titulares || []),
                          ...(match.suplentes || []),
                          ...(match.rotationEvents || []).flatMap((ev) => [
                            ...ev.onCourtIds,
                            ...(ev.inPlayerId ? [ev.inPlayerId] : []),
                            ...(ev.outPlayerId ? [ev.outPlayerId] : []),
                          ]),
                        ]);
                        const matchPlayerPool = Array.from(rotPoolIds)
                          .map((id) => playerMap.get(id))
                          .filter((p): p is Player => Boolean(p));
                        const labelPool =
                          matchPlayerPool.length > 0 ? matchPlayerPool : players;

                        const formatChipLabel = (pid?: string) => {
                          if (!pid) return "Jugador/a";
                          const p = playerMap.get(pid);
                          return p
                            ? getDisambiguatedPlayerLabel(p, labelPool, true)
                            : `#${pid}`;
                        };

                        if (!hasRotationData) {
                          return (
                            <div className="bg-slate-50 border border-slate-200/70 rounded-xl px-3.5 py-2.5 text-xs text-slate-500">
                              <span className="font-bold text-slate-600">
                                🔄 Rotaciones y Quintetos en Pista:
                              </span>{" "}
                              El registro horario de cambios y rendimiento por
                              quintetos estará disponible para los partidos
                              guardados a partir de esta actualización.
                            </div>
                          );
                        }

                        const quintets = computeQuintetStats(match, players);
                        const rotations = getDisplayRotationEvents(match);
                        const activeRotTab =
                          rotationViewTab[match.id] || "quintets";
                        const fmtT = (i: number, o: number, t: number) =>
                          `T:${String(i).padStart(2, "0")}/${String(o).padStart(2, "0")}/${String(t).padStart(2, "0")}`;

                        return (
                          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                              <h4 className="text-xs font-extrabold text-[#004183] uppercase tracking-wider flex items-center gap-1.5">
                                <span>🔄 Rotaciones y Quintetos en Pista</span>
                              </h4>
                              <div className="inline-flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/70 self-start sm:self-auto">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRotationViewTab((prev) => ({
                                      ...prev,
                                      [match.id]: "quintets",
                                    }))
                                  }
                                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                    activeRotTab === "quintets"
                                      ? "bg-[#004183] text-white shadow-xs"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  Rendimiento por Quintetos ({quintets.length})
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRotationViewTab((prev) => ({
                                      ...prev,
                                      [match.id]: "timeline",
                                    }))
                                  }
                                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                    activeRotTab === "timeline"
                                      ? "bg-[#004183] text-white shadow-xs"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  Cronología de Cambios ({rotations.length})
                                </button>
                              </div>
                            </div>

                            {activeRotTab === "quintets" ? (
                              quintets.length === 0 ? (
                                <p className="text-xs text-slate-400 italic py-2">
                                  No hay tramos de quintetos registrados.
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50/70">
                                        <th className="py-2 px-2.5 font-extrabold">
                                          Quinteto en Pista
                                        </th>
                                        <th className="py-2 px-2 font-extrabold text-center whitespace-nowrap">
                                          Tiempo
                                        </th>
                                        <th className="py-2 px-2 font-extrabold text-center whitespace-nowrap">
                                          Goles (F-C)
                                        </th>
                                        <th className="py-2 px-2 font-extrabold text-center whitespace-nowrap">
                                          +/-
                                        </th>
                                        <th className="py-2 px-2 font-extrabold text-center whitespace-nowrap">
                                          Tiros LCL
                                        </th>
                                        <th className="py-2 px-2 font-extrabold text-center whitespace-nowrap">
                                          Tiros RVL
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {quintets.map((q) => (
                                        <tr
                                          key={q.key}
                                          className="hover:bg-slate-50/70 transition"
                                        >
                                          <td className="py-2 px-2.5">
                                            <div className="flex flex-wrap gap-1">
                                              {q.playerIds.map((pid) => (
                                                <span
                                                  key={pid}
                                                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-[#004183] border border-blue-100 font-bold text-[10.5px]"
                                                >
                                                  {formatChipLabel(pid)}
                                                </span>
                                              ))}
                                            </div>
                                          </td>
                                          <td className="py-2 px-2 text-center font-mono font-bold text-slate-700 whitespace-nowrap">
                                            {formatSecondsMMSS(
                                              q.secondsTogether,
                                            )}
                                          </td>
                                          <td className="py-2 px-2 text-center font-bold text-slate-800 whitespace-nowrap">
                                            {q.goalsFor} - {q.goalsAgainst}
                                          </td>
                                          <td className="py-2 px-2 text-center whitespace-nowrap">
                                            <span
                                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-black font-mono ${
                                                q.plusMinus > 0
                                                  ? "bg-emerald-100 text-emerald-800"
                                                  : q.plusMinus < 0
                                                    ? "bg-rose-100 text-rose-800"
                                                    : "bg-slate-100 text-slate-600"
                                              }`}
                                            >
                                              {q.plusMinus > 0
                                                ? `+${q.plusMinus}`
                                                : q.plusMinus}
                                            </span>
                                          </td>
                                          <td className="py-2 px-2 text-center font-mono text-[11px] font-bold text-blue-900 whitespace-nowrap">
                                            {fmtT(
                                              q.localShotsIn,
                                              q.localShotsOut,
                                              q.localShotsTotal,
                                            )}
                                          </td>
                                          <td className="py-2 px-2 text-center font-mono text-[11px] font-bold text-rose-700 whitespace-nowrap">
                                            {fmtT(
                                              q.rivalShotsIn,
                                              q.rivalShotsOut,
                                              q.rivalShotsTotal,
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[1, 2].map((halfNum) => {
                                  const halfEvents = rotations.filter(
                                    (ev) => ev.half === halfNum,
                                  );
                                  return (
                                    <div
                                      key={halfNum}
                                      className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3 space-y-2"
                                    >
                                      <h5 className="text-[11px] font-black uppercase tracking-wider text-[#004183] border-b border-slate-200 pb-1.5">
                                        {halfNum === 1 ? "1ª Parte" : "2ª Parte"}{" "}
                                        ({halfEvents.length})
                                      </h5>
                                      {halfEvents.length === 0 ? (
                                        <p className="text-[11px] text-slate-400 italic py-1">
                                          Sin movimientos registrados en esta
                                          parte.
                                        </p>
                                      ) : (
                                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                          {halfEvents.map((ev) => {
                                            let actionText = "Quinteto Inicial";
                                            let badgeClass =
                                              "bg-blue-100 text-[#004183]";
                                            if (ev.type === "substitution") {
                                              actionText = `Entra ${formatChipLabel(ev.inPlayerId)} ⬅ Sale ${formatChipLabel(ev.outPlayerId)}`;
                                              badgeClass =
                                                "bg-amber-100 text-amber-900";
                                            } else if (ev.type === "enter") {
                                              actionText = `Entra ${formatChipLabel(ev.inPlayerId)}`;
                                              badgeClass =
                                                "bg-emerald-100 text-emerald-800";
                                            } else if (ev.type === "red_card") {
                                              actionText = `Expulsión (Roja) ${formatChipLabel(ev.outPlayerId)}`;
                                              badgeClass =
                                                "bg-rose-100 text-rose-800";
                                            }
                                            return (
                                              <div
                                                key={ev.id}
                                                className="bg-white border border-slate-200/70 rounded-lg p-2 text-[11px] space-y-1 shadow-3xs"
                                              >
                                                <div className="flex items-start gap-2">
                                                  <span className="font-mono font-black text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-white shrink-0">
                                                    {ev.timeString}
                                                  </span>
                                                  <span
                                                    className={`font-bold text-[10.5px] px-1.5 py-0.5 rounded leading-snug ${badgeClass}`}
                                                  >
                                                    {actionText}
                                                  </span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 leading-snug pl-0.5">
                                                  <span className="font-bold text-slate-600">
                                                    En pista:
                                                  </span>{" "}
                                                  {ev.onCourtIds
                                                    .map(formatChipLabel)
                                                    .join(", ")}
                                                </p>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* OBSERVACIONES Y COMENTARIOS DEL PARTIDO */}
                    <div
                      className="mt-6 border-t border-slate-200/60 pt-5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                        <MessageSquare size={13} className="text-[#004183]" />{" "}
                        Observaciones y Comentarios Tácticos
                      </h4>
                      <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                        Añade notas de rendimiento, aspectos tácticos a mejorar o
                        comentarios generales del partido. Estos comentarios
                        quedarán registrados y se incluirán automáticamente en el
                        PDF exportado.
                      </p>
                      <div className="space-y-3">
                        <textarea
                          value={
                            commentsState[match.id] !== undefined
                              ? commentsState[match.id]
                              : match.comment || ""
                          }
                          onChange={(e) =>
                            setCommentsState((prev) => ({
                              ...prev,
                              [match.id]: e.target.value,
                            }))
                          }
                          placeholder="Escribe tus observaciones tácticas del encuentro aquí..."
                          className="w-full min-h-[90px] p-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#004183] focus:border-[#004183] transition font-sans shadow-3xs"
                          rows={3}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            {savedNotificationId === match.id ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 animate-fade-in">
                                <Check size={14} /> ¡Guardado correctamente!
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (onUpdateMatchComment) {
                                const commentValue =
                                  commentsState[match.id] !== undefined
                                    ? commentsState[match.id]
                                    : match.comment || "";
                                onUpdateMatchComment(match.id, commentValue);
                                setSavedNotificationId(match.id);
                                setTimeout(
                                  () => setSavedNotificationId(null),
                                  2500,
                                );
                              }
                            }}
                            className="inline-flex items-center gap-1.5 bg-[#004183] hover:bg-[#003366] text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer shadow-3xs"
                          >
                            <Save size={13} />
                            <span>Guardar Comentario</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* PDF Floating Toast Notification */}
      {pdfNotification && (
        <div className="fixed bottom-6 right-6 left-6 md:left-auto md:max-w-md bg-slate-900 border border-slate-800 text-white p-4 gap-2 rounded-2xl shadow-2xl z-[99999] flex flex-col font-sans animate-fade-in animate-bounce-up">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400">
              <FileText size={16} className="animate-pulse" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black uppercase text-blue-400 tracking-wider">
                Generando Informe PDF
              </p>
              <p className="text-xs font-medium text-slate-200">
                {pdfNotification.name}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-normal border-t border-slate-800/80 pt-2 mt-1">
            <strong>¿No se inicia la descarga?</strong> Al estar visualizando la
            aplicación dentro de un visor web incrustado (iframe), algunos de
            los navegadores bloquean la descarga directa de archivos.
            <span className="text-blue-200 font-bold block mt-1">
              Solución: Haz clic en el botón de la esquina superior derecha del
              navegador o del visor y selecciona "Abrir en nueva pestaña" para
              realizar descargas sin restricciones.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
