import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Shield,
  Users,
  Plus,
  Edit3,
  Copy,
  Archive,
  Calendar,
  Download,
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  Settings2,
} from 'lucide-react';
import {
  DEFAULT_SEASON_ID,
  DEFAULT_TEAM_ID,
  Player,
  PositionType,
  Season,
  Team,
} from '../types';

export interface ParsedExcelPlayerRow {
  rowIndex: number;
  teamName: string;
  category: string;
  seasonName: string;
  name: string;
  alias: string;
  number: string;
  position: PositionType;
  birthDate: string;
  dominantLeg: 'Diestra' | 'Zurda' | 'Ambidiestra';
  gender: 'M' | 'F';
  captain: boolean;
  status: 'activo' | 'baja' | 'lesionado' | 'sancionado';
  errors: string[];
}

interface TeamManagementPanelProps {
  teams: Team[];
  seasons: Season[];
  selectedTeamId: string;
  selectedSeasonId: string;
  activePlayers: Player[];
  allPlayers: Player[];
  onSelectTeam: (id: string) => void;
  onSelectSeason: (id: string) => void;
  onCreateTeam: (name: string, category: string) => string;
  onUpdateTeam: (id: string, name: string, category: string) => void;
  onDuplicateTeam: (sourceTeamId: string, newName: string, category: string) => void;
  onArchiveTeam: (id: string) => void;
  onCreateSeason: (name: string, copyCurrentSquad: boolean) => string;
  onBulkImportExcel: (rows: ParsedExcelPlayerRow[]) => void;
}

type ModalMode =
  | 'create_team'
  | 'edit_team'
  | 'duplicate_team'
  | 'archive_team'
  | 'create_season'
  | null;

const normalizeKey = (raw: string): string =>
  String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeCompare = (raw: string): string =>
  String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const parsePositionValue = (raw: unknown): PositionType | null => {
  const norm = normalizeCompare(String(raw || ''));
  if (!norm) return null;
  if (norm.includes('porter') || norm === 'gk' || norm === 'por' || norm.includes('arquero')) {
    return 'Portero/a';
  }
  if (norm.includes('cierr') || norm === 'fixo' || norm === 'cie') {
    return 'Cierre';
  }
  if (norm === 'ala' || norm === 'alas' || norm.startsWith('ala ') || norm.startsWith('alas ') || norm.includes('extrem')) {
    return 'Ala';
  }
  if (norm.includes('pivot') || norm === 'piv') {
    return 'Pívot';
  }
  if (norm.includes('univ') || norm.includes('poliv')) {
    return 'Universal';
  }
  return null;
};

const parseDominantLegValue = (raw: unknown): 'Diestra' | 'Zurda' | 'Ambidiestra' => {
  const norm = normalizeCompare(String(raw || ''));
  if (norm.includes('zurd') || norm.includes('izquierd') || norm === 'z') {
    return 'Zurda';
  }
  if (norm.includes('ambi') || norm.includes('ambas') || norm === 'a') {
    return 'Ambidiestra';
  }
  return 'Diestra';
};

const parseGenderValue = (raw: unknown): 'M' | 'F' => {
  const norm = normalizeCompare(String(raw || ''));
  if (
    norm === 'm' ||
    norm === 'h' ||
    norm === 'hombre' ||
    norm === 'masculino' ||
    norm === 'chico' ||
    norm === 'varon'
  ) {
    return 'M';
  }
  return 'F';
};

const parseCaptainValue = (raw: unknown): boolean => {
  const norm = normalizeCompare(String(raw || ''));
  return ['si', 'true', '1', 'x', 'c', 'cap', 'capitan', 'capitana'].includes(norm);
};

const parseStatusValue = (
  raw: unknown
): 'activo' | 'baja' | 'lesionado' | 'sancionado' => {
  const norm = normalizeCompare(String(raw || ''));
  if (norm.includes('baja')) return 'baja';
  if (norm.includes('lesion')) return 'lesionado';
  if (norm.includes('sancion')) return 'sancionado';
  return 'activo';
};

const buildValidIsoDate = (y: number, m: number, d: number): string | null => {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1940 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const parseBirthDateValue = (raw: unknown): { value: string; valid: boolean } => {
  if (raw === null || raw === undefined || raw === '') return { value: '', valid: true };

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 1000) {
    try {
      const parsed = XLSX.SSF.parse_date_code(raw);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const iso = buildValidIsoDate(parsed.y, parsed.m, parsed.d);
        return iso ? { value: iso, valid: true } : { value: '', valid: false };
      }
    } catch {
      return { value: '', valid: false };
    }
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const iso = buildValidIsoDate(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
    return iso ? { value: iso, valid: true } : { value: '', valid: false };
  }

  const str = String(raw).trim();
  if (!str) return { value: '', valid: true };

  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const iso = buildValidIsoDate(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10),
      parseInt(isoMatch[3], 10)
    );
    return iso ? { value: iso, valid: true } : { value: '', valid: false };
  }

  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const iso = buildValidIsoDate(
      parseInt(dmyMatch[3], 10),
      parseInt(dmyMatch[2], 10),
      parseInt(dmyMatch[1], 10)
    );
    return iso ? { value: iso, valid: true } : { value: '', valid: false };
  }

  return { value: '', valid: false };
};

const getCell = (row: Record<string, unknown>, aliases: string[]): unknown => {
  const normalizedEntries = Object.entries(row).map(([k, v]) => [normalizeKey(k), v] as const);
  for (const alias of aliases) {
    const found = normalizedEntries.find(([k]) => k === alias);
    if (found && String(found[1] ?? '').trim() !== '') {
      return found[1];
    }
  }
  return '';
};

export default function TeamManagementPanel({
  teams,
  seasons,
  selectedTeamId,
  selectedSeasonId,
  activePlayers,
  allPlayers,
  onSelectTeam,
  onSelectSeason,
  onCreateTeam,
  onUpdateTeam,
  onDuplicateTeam,
  onArchiveTeam,
  onCreateSeason,
  onBulkImportExcel,
}: TeamManagementPanelProps) {
  const activeTeams = teams.filter((t) => !t.isArchived);
  const currentTeam =
    activeTeams.find((t) => t.id === selectedTeamId) ||
    teams.find((t) => t.id === selectedTeamId) ||
    activeTeams[0] ||
    teams[0];
  const currentSeason =
    seasons.find((s) => s.id === selectedSeasonId) || seasons[0];

  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [inputName, setInputName] = useState('');
  const [inputCategory, setInputCategory] = useState('');
  const [copySquadChecked, setCopySquadChecked] = useState(true);
  const [modalError, setModalError] = useState('');

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [excelRowsPreview, setExcelRowsPreview] = useState<ParsedExcelPlayerRow[] | null>(null);
  const [excelParseError, setExcelParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manageMenuRef = useRef<HTMLDivElement>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const squadActive = activePlayers.filter((p) => p.isActive);
  const goalkeepersCount = squadActive.filter((p) => p.position === 'Portero/a').length;
  const outfieldCount = squadActive.length - goalkeepersCount;

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!manageMenuOpen) return;
    const handlePointerDown = (ev: MouseEvent) => {
      if (manageMenuRef.current && !manageMenuRef.current.contains(ev.target as Node)) {
        setManageMenuOpen(false);
      }
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setManageMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [manageMenuOpen]);

  const showTempFeedback = (msg: string) => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    setFeedbackMessage(msg);
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedbackMessage(null);
      feedbackTimerRef.current = null;
    }, 4500);
  };

  const openModal = (mode: ModalMode) => {
    setManageMenuOpen(false);
    setModalError('');
    setModalMode(mode);

    if (mode === 'create_team') {
      setInputName('');
      setInputCategory('');
    } else if (mode === 'edit_team') {
      setInputName(currentTeam?.name || '');
      setInputCategory(currentTeam?.category || '');
    } else if (mode === 'duplicate_team') {
      setInputName(currentTeam ? `${currentTeam.name} B` : '');
      setInputCategory(currentTeam?.category || '');
    } else if (mode === 'create_season') {
      setInputName('');
      setCopySquadChecked(true);
    }
  };

  const handleConfirmModal = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (modalMode === 'create_team') {
      const trimmed = inputName.trim();
      if (!trimmed) {
        setModalError('El nombre del equipo es obligatorio.');
        return;
      }
      if (activeTeams.some((t) => normalizeCompare(t.name) === normalizeCompare(trimmed))) {
        setModalError('Ya existe un equipo activo con ese nombre.');
        return;
      }
      const newId = onCreateTeam(trimmed, inputCategory.trim());
      onSelectTeam(newId);
      setModalMode(null);
      showTempFeedback(`Equipo "${trimmed}" creado.`);
    } else if (modalMode === 'edit_team' && currentTeam) {
      const trimmed = inputName.trim();
      if (!trimmed) {
        setModalError('El nombre del equipo es obligatorio.');
        return;
      }
      if (
        activeTeams.some(
          (t) => t.id !== currentTeam.id && normalizeCompare(t.name) === normalizeCompare(trimmed)
        )
      ) {
        setModalError('Ya existe otro equipo activo con ese nombre.');
        return;
      }
      onUpdateTeam(currentTeam.id, trimmed, inputCategory.trim());
      setModalMode(null);
      showTempFeedback(`Equipo actualizado a "${trimmed}".`);
    } else if (modalMode === 'duplicate_team' && currentTeam) {
      const trimmed = inputName.trim();
      if (!trimmed) {
        setModalError('Indica un nombre para el nuevo equipo duplicado.');
        return;
      }
      if (activeTeams.some((t) => normalizeCompare(t.name) === normalizeCompare(trimmed))) {
        setModalError('Ya existe un equipo activo con ese nombre.');
        return;
      }
      onDuplicateTeam(currentTeam.id, trimmed, inputCategory.trim());
      setModalMode(null);
      showTempFeedback(`Equipo "${trimmed}" duplicado con su plantilla.`);
    } else if (modalMode === 'archive_team' && currentTeam) {
      if (activeTeams.length <= 1) {
        setModalError('No puedes archivar el único equipo activo.');
        return;
      }
      onArchiveTeam(currentTeam.id);
      setModalMode(null);
      showTempFeedback(`Equipo "${currentTeam.name}" archivado.`);
    } else if (modalMode === 'create_season') {
      const trimmed = inputName.trim();
      if (!trimmed) {
        setModalError('El nombre de la temporada es obligatorio (ej. 2027/28).');
        return;
      }
      if (seasons.some((s) => normalizeCompare(s.name) === normalizeCompare(trimmed))) {
        setModalError('Ya existe una temporada con ese nombre.');
        return;
      }
      const newId = onCreateSeason(trimmed, copySquadChecked);
      onSelectSeason(newId);
      setModalMode(null);
      showTempFeedback(`Temporada "${trimmed}" creada.`);
    }
  };

  const handleDownloadTemplate = () => {
    const teamLabel = currentTeam?.name || 'FS Talavera';
    const catLabel = currentTeam?.category || 'Senior';
    const seasonLabel = currentSeason?.name || '2026/27';

    const sampleRows = [
      {
        EQUIPO: teamLabel,
        CATEGORIA: catLabel,
        TEMPORADA: seasonLabel,
        NOMBRE: 'Lucía Gómez Pérez',
        ALIAS: 'Lucía G.',
        DORSAL: 1,
        POSICION: 'Portero/a',
        FECHA_NACIMIENTO: '2002-05-14',
        PIERNA: 'Diestra',
        GENERO: 'F',
        CAPITAN: 'SI',
        ESTADO: 'activo',
      },
      {
        EQUIPO: teamLabel,
        CATEGORIA: catLabel,
        TEMPORADA: seasonLabel,
        NOMBRE: 'Carmen Ruiz Serrano',
        ALIAS: 'Carmen',
        DORSAL: 10,
        POSICION: 'Ala',
        FECHA_NACIMIENTO: '2003-09-22',
        PIERNA: 'Zurda',
        GENERO: 'F',
        CAPITAN: 'NO',
        ESTADO: 'activo',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla');
    XLSX.writeFile(workbook, 'FS_TALAVERA_IMPORTAR_EQUIPO_COMPLETO.xlsx');
    showTempFeedback('Plantilla Excel descargada correctamente.');
  };

  const handleExportCurrentSquad = () => {
    const teamLabel = currentTeam?.name || 'FS Talavera';
    const catLabel = currentTeam?.category || '';
    const seasonLabel = currentSeason?.name || '2026/27';

    const exportRows = squadActive.map((p) => ({
      EQUIPO: teamLabel,
      CATEGORIA: catLabel,
      TEMPORADA: seasonLabel,
      NOMBRE: p.name,
      ALIAS: p.alias || p.name,
      DORSAL: Number(p.number) || p.number,
      POSICION: p.position,
      FECHA_NACIMIENTO: p.birthDate || '',
      PIERNA: p.dominantLeg || 'Diestra',
      GENERO: p.gender || 'F',
      CAPITAN: p.captain ? 'SI' : 'NO',
      ESTADO: p.status || 'activo',
    }));

    const safeTeam = teamLabel.replace(/[^a-zA-Z0-9_-]+/g, '_');
    const safeSeason = seasonLabel.replace(/[^a-zA-Z0-9_-]+/g, '_');

    const worksheet =
      exportRows.length > 0
        ? XLSX.utils.json_to_sheet(exportRows)
        : XLSX.utils.aoa_to_sheet([
            [
              'EQUIPO',
              'CATEGORIA',
              'TEMPORADA',
              'NOMBRE',
              'ALIAS',
              'DORSAL',
              'POSICION',
              'FECHA_NACIMIENTO',
              'PIERNA',
              'GENERO',
              'CAPITAN',
              'ESTADO',
            ],
          ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla');
    XLSX.writeFile(workbook, `FS_TALAVERA_${safeTeam}_${safeSeason}.xlsx`);
    showTempFeedback(
      exportRows.length > 0
        ? `Exportados ${exportRows.length} jugadores/as a Excel.`
        : 'Plantilla sin jugadores/as activos/as: se descargó la cabecera Excel.'
    );
  };

  const handleExcelFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelParseError(null);

    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const workbook = isCsv
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setExcelParseError('El archivo no contiene ninguna hoja válida.');
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils
        .sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
        })
        .filter((row) =>
          Object.values(row).some((val) => String(val ?? '').trim() !== '')
        );

      if (rawRows.length === 0) {
        setExcelParseError('La hoja de cálculo está vacía.');
        return;
      }

      const teamMap = new Map(
        teams.map((t) => [t.id, t])
      );
      const seasonMap = new Map(
        seasons.map((s) => [s.id, s])
      );

      // Build existing active dorsal lookup per normalized (teamName, seasonName), skipping archived teams
      const existingDorsals = new Set<string>();
      allPlayers
        .filter((p) => p.isActive)
        .forEach((p) => {
          const teamObj = teamMap.get(p.teamId || DEFAULT_TEAM_ID);
          if (teamObj?.isArchived) return;
          const tName = teamObj?.name || 'FS Talavera';
          const sName =
            seasonMap.get(p.seasonId || DEFAULT_SEASON_ID)?.name || '2026/27';
          const rawPNum = String(p.number).trim();
          const normPNum = /^\d+$/.test(rawPNum) ? String(parseInt(rawPNum, 10)) : rawPNum;
          existingDorsals.add(
            `${normalizeCompare(tName)}||${normalizeCompare(sName)}||${normPNum}`
          );
        });

      const seenInFile = new Set<string>();
      const fallbackTeamName = currentTeam?.name || 'FS Talavera';
      const fallbackCategory = currentTeam?.category || '';
      const fallbackSeasonName = currentSeason?.name || '2026/27';

      const parsedRows: ParsedExcelPlayerRow[] = rawRows.map((row, index) => {
        const errors: string[] = [];

        const rawTeam = String(
          getCell(row, ['equipo', 'team', 'club']) || ''
        ).trim();
        const teamName = rawTeam || fallbackTeamName;

        const rawCategory = String(
          getCell(row, ['categoria', 'category', 'division']) || ''
        ).trim();
        const category = rawCategory || (rawTeam ? '' : fallbackCategory);

        const rawSeason = String(
          getCell(row, ['temporada', 'season', 'curso']) || ''
        ).trim();
        const seasonName = rawSeason || fallbackSeasonName;

        const name = String(
          getCell(row, ['nombre', 'nombre_completo', 'jugador', 'jugadora', 'name']) || ''
        ).trim();
        if (!name) {
          errors.push('Falta NOMBRE');
        }

        const rawAlias = String(
          getCell(row, ['alias', 'apodo', 'nombre_deportivo']) || ''
        ).trim();
        const alias = rawAlias || (name ? name.split(/\s+/)[0] : '');

        const rawNumber = String(
          getCell(row, ['dorsal', 'numero', 'n', 'num', 'number']) ?? ''
        ).trim();
        const parsedNumber = /^\d+$/.test(rawNumber) ? parseInt(rawNumber, 10) : NaN;
        const numberValid = Number.isInteger(parsedNumber) && parsedNumber >= 1 && parsedNumber <= 99;
        const normalizedNumber = numberValid ? String(parsedNumber) : rawNumber;
        if (!numberValid) {
          errors.push('DORSAL inválido (debe ser un entero entre 1 y 99)');
        }

        const rawPos = getCell(row, ['posicion', 'puesto', 'demarcacion', 'position']);
        const parsedPos = parsePositionValue(rawPos);
        if (!parsedPos) {
          errors.push(
            rawPos ? `Posición no reconocida (${String(rawPos)})` : 'Falta POSICION'
          );
        }

        const birthDateParsed = parseBirthDateValue(
          getCell(row, ['fecha_nacimiento', 'nacimiento', 'fecha_nac', 'fnac', 'birthdate'])
        );
        if (!birthDateParsed.valid) {
          errors.push('FECHA_NACIMIENTO inválida o inexistente');
        }
        const birthDate = birthDateParsed.value;
        const dominantLeg = parseDominantLegValue(
          getCell(row, ['pierna', 'pierna_dominante', 'pie', 'dominantleg'])
        );
        const gender = parseGenderValue(
          getCell(row, ['genero', 'sexo', 'gender'])
        );
        const captain = parseCaptainValue(
          getCell(row, ['capitan', 'capitana', 'captain'])
        );
        const status = parseStatusValue(
          getCell(row, ['estado', 'situacion', 'status'])
        );

        if (numberValid && status !== 'baja') {
          const scopeKey = `${normalizeCompare(teamName)}||${normalizeCompare(seasonName)}||${normalizedNumber}`;
          if (seenInFile.has(scopeKey)) {
            errors.push(`Dorsal #${normalizedNumber} duplicado en el Excel (${teamName} · ${seasonName})`);
          } else {
            if (existingDorsals.has(scopeKey)) {
              errors.push(`Dorsal #${normalizedNumber} ya existe en ${teamName} (${seasonName})`);
            } else if (errors.length === 0) {
              seenInFile.add(scopeKey);
            }
          }
        }

        return {
          rowIndex: index + 2,
          teamName,
          category,
          seasonName,
          name,
          alias,
          number: normalizedNumber,
          position: parsedPos || 'Ala',
          birthDate,
          dominantLeg,
          gender,
          captain,
          status,
          errors,
        };
      });

      setExcelRowsPreview(parsedRows);
    } catch (err) {
      console.error('Excel parse error:', err);
      setExcelParseError('No se pudo leer el archivo Excel. Comprueba el formato (.xlsx/.xls/.csv).');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const validPreviewRows = (excelRowsPreview || []).filter((r) => r.errors.length === 0);
  const errorPreviewRows = (excelRowsPreview || []).filter((r) => r.errors.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 pt-6 pb-2">
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-4">
        {/* Header & Context Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#004183] text-[#FFD700] flex items-center justify-center shadow-xs shrink-0">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight font-display">
                  Gestión deportiva
                </h2>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-[#004183] border border-blue-100">
                  Club · Equipos · Temporadas
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Equipo activo:{' '}
                <span className="font-bold text-[#004183]">
                  {currentTeam?.name || 'FS Talavera'}
                </span>
                {currentTeam?.category ? ` (${currentTeam.category})` : ''} ·{' '}
                <span className="font-bold text-slate-700">
                  {currentSeason?.name || '2026/27'}
                </span>
              </p>
            </div>
          </div>

          {/* Team & Season Selectors + Dropdown Menu */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Users size={13} className="text-[#004183] shrink-0" />
              <select
                value={selectedTeamId}
                onChange={(e) => onSelectTeam(e.target.value)}
                aria-label="Equipo activo"
                className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none cursor-pointer"
              >
                {activeTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.category ? ` (${t.category})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Calendar size={13} className="text-[#004183] shrink-0" />
              <select
                value={selectedSeasonId}
                onChange={(e) => onSelectSeason(e.target.value)}
                aria-label="Temporada activa"
                className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none cursor-pointer"
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Action menu */}
            <div className="relative" ref={manageMenuRef}>
              <button
                type="button"
                onClick={() => setManageMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 bg-[#004183] hover:bg-blue-900 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition cursor-pointer"
              >
                <Settings2 size={14} />
                <span>Gestionar</span>
                <ChevronDown size={13} />
              </button>

              {manageMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 z-40 text-xs">
                  <button
                    type="button"
                    onClick={() => openModal('create_team')}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 font-bold text-slate-700 cursor-pointer"
                  >
                    <Plus size={14} className="text-emerald-600" />
                    Nuevo Equipo
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal('edit_team')}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 font-bold text-slate-700 cursor-pointer"
                  >
                    <Edit3 size={14} className="text-[#004183]" />
                    Editar Equipo Actual
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal('duplicate_team')}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 font-bold text-slate-700 cursor-pointer"
                  >
                    <Copy size={14} className="text-amber-600" />
                    Duplicar Equipo
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal('create_season')}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 font-bold text-slate-700 border-t border-slate-100 mt-1 pt-2 cursor-pointer"
                  >
                    <Calendar size={14} className="text-indigo-600" />
                    Nueva Temporada
                  </button>
                  <button
                    type="button"
                    disabled={activeTeams.length <= 1}
                    onClick={() => openModal('archive_team')}
                    className="w-full px-3.5 py-2 text-left hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 font-bold text-rose-600 border-t border-slate-100 mt-1 pt-2 cursor-pointer"
                  >
                    <Archive size={14} />
                    Archivar Equipo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom row: 3 KPIs + Excel actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="grid grid-cols-3 gap-2 sm:w-auto">
            <div className="bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-1.5 text-center">
              <span className="block text-[9px] font-black uppercase text-slate-400">
                Plantilla
              </span>
              <span className="font-mono font-black text-sm text-[#004183]">
                {squadActive.length}
              </span>
            </div>
            <div className="bg-rose-50/60 border border-rose-200/60 rounded-xl px-3 py-1.5 text-center">
              <span className="block text-[9px] font-black uppercase text-rose-500">
                Porteros/as
              </span>
              <span className="font-mono font-black text-sm text-rose-700">
                {goalkeepersCount}
              </span>
            </div>
            <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl px-3 py-1.5 text-center">
              <span className="block text-[9px] font-black uppercase text-emerald-600">
                Campo
              </span>
              <span className="font-mono font-black text-sm text-emerald-800">
                {outfieldCount}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold px-3 py-2 rounded-xl transition cursor-pointer"
            >
              <FileSpreadsheet size={14} className="text-emerald-700" />
              <span>Plantilla Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportCurrentSquad}
              className="inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-[#004183] border border-blue-200 text-[11px] font-bold px-3 py-2 rounded-xl transition cursor-pointer"
            >
              <Download size={14} />
              <span>Exportar Equipo</span>
            </button>

            <label className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black px-3.5 py-2 rounded-xl shadow-xs transition cursor-pointer">
              <Upload size={14} />
              <span>Importar Excel</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelFileSelected}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Inline Status Banners */}
        {feedbackMessage && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-3.5 py-2 rounded-xl animate-fade-in">
            <CheckCircle size={15} className="shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {excelParseError && (
          <div className="flex items-center justify-between gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-3.5 py-2 rounded-xl animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{excelParseError}</span>
            </div>
            <button
              type="button"
              onClick={() => setExcelParseError(null)}
              className="text-rose-500 hover:text-rose-800 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* REACT MODAL FOR TEAM / SEASON ACTIONS (NO window.prompt) */}
      {modalMode && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <form
            onSubmit={handleConfirmModal}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base font-display">
                {modalMode === 'create_team' && 'Nuevo Equipo'}
                {modalMode === 'edit_team' && 'Editar Equipo Activo'}
                {modalMode === 'duplicate_team' && 'Duplicar Equipo y Plantilla'}
                {modalMode === 'archive_team' && 'Archivar Equipo'}
                {modalMode === 'create_season' && 'Nueva Temporada'}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {modalMode === 'archive_team' ? (
              <div className="space-y-2 text-xs text-slate-600">
                <p>
                  ¿Seguro que deseas archivar el equipo{' '}
                  <strong className="text-slate-900">{currentTeam?.name}</strong>?
                </p>
                <p className="text-[11px] text-slate-500">
                  Dejará de mostrarse en el selector principal sin eliminar su histórico guardado.
                </p>
              </div>
            ) : modalMode === 'create_season' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Nombre de la Temporada *
                  </label>
                  <input
                    type="text"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    placeholder="Ej. 2027/28"
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#004183]"
                  />
                </div>
                <label className="flex items-start gap-2.5 p-3 bg-blue-50/60 border border-blue-100 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copySquadChecked}
                    onChange={(e) => setCopySquadChecked(e.target.checked)}
                    className="mt-0.5 text-[#004183]"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Copiar la plantilla actual ({squadActive.length} activos) de{' '}
                    <strong>{currentTeam?.name}</strong> a la nueva temporada
                  </span>
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Nombre del Equipo *
                  </label>
                  <input
                    type="text"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    placeholder="Ej. Juvenil DH Femenino"
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#004183]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Categoría / Competición
                  </label>
                  <input
                    type="text"
                    value={inputCategory}
                    onChange={(e) => setInputCategory(e.target.value)}
                    placeholder="Ej. Juvenil División de Honor"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#004183]"
                  />
                </div>
              </div>
            )}

            {modalError && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl font-bold">
                {modalError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`px-4 py-2 rounded-xl text-xs font-black text-white shadow-xs cursor-pointer ${
                  modalMode === 'archive_team'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#004183] hover:bg-blue-900'
                }`}
              >
                {modalMode === 'archive_team' ? 'Confirmar Archivo' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EXCEL IMPORT PREVIEW MODAL */}
      {excelRowsPreview && (
        <div className="fixed inset-0 z-[120] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[88vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-base font-display flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-emerald-600" />
                  Previsualización de Importación Excel
                </h3>
                <p className="text-xs text-slate-500">
                  Los equipos o temporadas que no existan se crearán automáticamente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExcelRowsPreview(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 my-3 text-center">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
                <span className="block text-[9px] uppercase font-black text-slate-400">
                  Detectados
                </span>
                <span className="font-mono font-black text-sm text-slate-800">
                  {excelRowsPreview.length}
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
                <span className="block text-[9px] uppercase font-black text-emerald-600">
                  Válidos
                </span>
                <span className="font-mono font-black text-sm text-emerald-700">
                  {validPreviewRows.length}
                </span>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-2">
                <span className="block text-[9px] uppercase font-black text-rose-500">
                  Con errores
                </span>
                <span className="font-mono font-black text-sm text-rose-700">
                  {errorPreviewRows.length}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 text-xs">
              {excelRowsPreview.map((row) => {
                const hasErr = row.errors.length > 0;
                return (
                  <div
                    key={`${row.rowIndex}-${row.name}-${row.number}`}
                    className={`px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 ${
                      hasErr ? 'bg-rose-50/70' : 'bg-white'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-slate-400">
                          Fila {row.rowIndex}
                        </span>
                        <span className="font-mono font-black text-[#004183]">
                          #{row.number || '?'}
                        </span>
                        <span className="font-extrabold text-slate-800">
                          {row.name || '(Sin nombre)'}
                        </span>
                        {row.captain && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black">
                            ©
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-500">
                          · {row.position} · {row.teamName} ({row.seasonName})
                        </span>
                      </div>
                      {hasErr && (
                        <p className="text-[11px] font-bold text-rose-600 mt-0.5">
                          ⚠ {row.errors.join(' · ')}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full self-start sm:self-center shrink-0 ${
                        hasErr
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {hasErr ? 'Error' : 'Válido'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2.5 pt-4">
              <button
                type="button"
                onClick={() => setExcelRowsPreview(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={validPreviewRows.length === 0}
                onClick={() => {
                  onBulkImportExcel(validPreviewRows);
                  setExcelRowsPreview(null);
                  showTempFeedback(
                    `Importados ${validPreviewRows.length} jugadores/as desde Excel.`
                  );
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wide shadow-sm cursor-pointer"
              >
                IMPORTAR {validPreviewRows.length} JUGADORES/AS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
