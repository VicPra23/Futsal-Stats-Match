/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PositionType = 'Portero/a' | 'Cierre' | 'Ala' | 'Pívot' | 'Universal';

export const DEFAULT_TEAM_ID = 'team-fs-talavera';
export const DEFAULT_SEASON_ID = 'season-2026-27';

export interface Team {
  id: string;
  name: string;
  category?: string;
  isArchived?: boolean;
}

export interface Season {
  id: string;
  name: string;
  isActive?: boolean;
}

export type RotationEventType = 'initial_lineup' | 'substitution' | 'enter' | 'red_card' | 'half_end';

export interface RotationEvent {
  id: string;
  half: 1 | 2;
  timeString: string; // "MM:SS" restante en el reloj
  secondsRemaining: number; // segundos restantes (e.g. 1200 -> 0)
  type: RotationEventType;
  inPlayerId?: string;
  outPlayerId?: string;
  inPlayerIds?: string[];
  outPlayerIds?: string[];
  onCourtIds: string[]; // snapshot exacto de IDs en pista tras el evento
  timestamp: number; // Date.now() para desempate en el mismo segundo
}

export interface Player {
  id: string;
  name: string; // Nombre Completo
  alias: string; // Nombre Deportivo/Alias (Este se usará en partido)
  number: string; // Dorsal (e.g. "10")
  position: PositionType;
  isActive: boolean; // For squad management
  photo?: string; // compressed face thumbnail base64
  birthDate: string; // Fecha de nacimiento
  dominantLeg: 'Diestra' | 'Zurda' | 'Ambidiestra'; // Pierna dominante
  gender?: 'M' | 'F'; // Sexo: 'M' (Hombre ♂) o 'F' (Mujer ♀)
  teamId?: string;
  seasonId?: string;
  captain?: boolean;
  status?: 'activo' | 'baja' | 'lesionado' | 'sancionado';
}

export interface PlayerPerformance {
  secondsPlayed: number; // Stored in total seconds, renders as MM:SS This represents total time
  secondsPlayed1st?: number; // Seconds played in 1st half
  secondsPlayed2nd?: number; // Seconds played in 2nd half
  shots: number;
  goals: number; // Goal events
  yellows: number; // 0, 1, or 2 (maximum 2 yellows turns red)
  redCard: boolean; // Direct or double yellow red card
  saves: number; // Number of saves (Paradas)
  goalsConceded: number; // Goles encajados as a goalkeeper
}

export const GOAL_TYPES = [
  'ABP Banda',
  'ABP Corner',
  'ABP Falta directa',
  'ABP Falta indirecta',
  'Salida de presión',
  'Ataque posicional',
  '5vs4',
  '4vs3',
  '4vs5',
  '3vs5',
  'Robo',
  'Transición',
  'Penalti',
  'Doble Penalti',
  'Perdida',
] as const;

export type GoalType = typeof GOAL_TYPES[number] | string;

export interface ShotEvent {
  id: string;
  x: number; // percentage coordinate 0 to 100 on canvas width
  y: number; // percentage coordinate 0 to 100 on canvas height
  team: 'local' | 'rival';
  type: 'out' | 'on_target' | 'goal';
  goalType?: GoalType;
  playerId?: string; // string ID of the player if local
  playerNumber?: string; // Dorsal of player
  goalkeeperId?: string; // string ID of the active goalkeeper when rival shot occurred
  timestamp?: number; // Exact creation timestamp to disambiguate same-second events
  timeString: string; // "MM:SS" of the match
  half: 1 | 2;
  onCourtIds?: string[];
}

export interface Match {
  id: string;
  rival: string;
  date: string; // YYYY-MM-DD
  matchType: 'amistoso' | 'oficial';
  jornada?: number;
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L'; // Win, Draw, Loss
  teamShots: number; // Includes individual shots + unattributed team shots
  teamYellows: number; // Includes player yellows + staff yellows
  stats: Record<string, PlayerPerformance>; // key: playerID -> performance stats
  rivalColor: string; // Hex color selector (e.g. "#FF0000")
  talaveraKit: '1ª Equipación' | '2ª Equipación';
  localFouls1stHalf: number;
  rivalFouls1stHalf: number;
  localFouls2ndHalf: number;
  rivalFouls2ndHalf: number;
  shotsEvents: ShotEvent[];
  titulares: string[]; // exactly 5 IDs (Position 1 is treated as Portera)
  suplentes: string[]; // up to 9 IDs
  comment?: string;
  teamId?: string;
  seasonId?: string;
  periodDurationMinutes?: number;
  rotationEvents?: RotationEvent[];
}

export interface LivePlayerState {
  playerId: string;
  isOnCourt: boolean; // Is the player currently active on court
  shots: number;
  goals: number;
  yellows: number;
  redCard: boolean;
  secondsPlayed: number; // Total accumulated seconds played (for active half)
  secondsPlayed1st?: number; // Total seconds played in the first half
  currentShiftSeconds?: number; // Seconds played in the current on-court rotation stint
  timerStartTimestamp: number | null; // For running timer tracking
  saves: number;
  goalsConceded: number;
}

export interface LiveMatchState {
  rival: string;
  matchType: 'amistoso' | 'oficial';
  jornada?: number;
  date: string;
  goalsFor: number;
  goalsAgainst: number;
  teamShotsUnattributed: number; // Team shots not assigned to any specific player
  teamYellowsStaff: number; // Yellow cards given to coaching staff
  playersState: Record<string, LivePlayerState>;
  matchStartTime: number | null; // Overall match elapsed time helper if needed
  overallSeconds: number; // Seconds remaining in current half (e.g. 1200 down to 0) or standard countdown
  half: 1 | 2;
  rivalColor: string;
  talaveraKit: '1ª Equipación' | '2ª Equipación';
  localFouls1stHalf: number;
  rivalFouls1stHalf: number;
  localFouls2ndHalf: number;
  rivalFouls2ndHalf: number;
  shotsEvents: ShotEvent[];
  titulares: string[]; // chosen 5 starters
  initialTitulares?: string[]; // starting 5 chosen at match kickoff
  suplentes: string[]; // chosen up to 9 benched/subs
  activeGoalkeeperId?: string; // Currently active GK or flying GK in court
  isPreMatch: boolean; // true if still setting up squad/color
  periodDurationMinutes?: number; // Custom period duration in minutes (e.g., 20)
  attackDirection?: 'derecha' | 'izquierda'; // direction of attack in 1st half: 'derecha' or 'izquierda'
  timeout1stHalfCalled?: boolean; // time-out for 1st half called or not
  timeout2ndHalfCalled?: boolean; // time-out for 2nd half called or not
  localTimeout1stHalfCalled?: boolean;
  localTimeout2ndHalfCalled?: boolean;
  rivalTimeout1stHalfCalled?: boolean;
  rivalTimeout2ndHalfCalled?: boolean;
  penaltyTimers?: ActivePenalty[];
  teamId?: string;
  seasonId?: string;
  rotationEvents?: RotationEvent[];
}

export interface ActivePenalty {
  id: string;
  playerId: string;
  playerAlias: string;
  playerNumber: string;
  secondsRemaining: number;
}
