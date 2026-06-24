/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PositionType = 'Portero/a' | 'Cierre' | 'Ala' | 'Pívot' | 'Universal';

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

export interface ShotEvent {
  id: string;
  x: number; // percentage coordinate 0 to 100 on canvas width
  y: number; // percentage coordinate 0 to 100 on canvas height
  team: 'local' | 'rival';
  type: 'out' | 'on_target' | 'goal';
  playerId?: string; // string ID of the player if local
  playerNumber?: string; // Dorsal of player
  timeString: string; // "MM:SS" of the match
  half: 1 | 2;
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
  suplentes: string[]; // up to 7 IDs
  comment?: string;
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
  suplentes: string[]; // chosen up to 7 benched/subs
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
}

export interface ActivePenalty {
  id: string;
  playerId: string;
  playerAlias: string;
  playerNumber: string;
  secondsRemaining: number;
}
