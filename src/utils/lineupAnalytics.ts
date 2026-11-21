import { Match, Player, RotationEvent, ShotEvent } from '../types';

export interface QuintetPerformance {
  key: string;
  playerIds: string[];
  secondsTogether: number;
  stintsCount: number;
  goalsFor: number;
  goalsAgainst: number;
  plusMinus: number;
  localShotsIn: number;
  localShotsOut: number;
  localShotsTotal: number;
  rivalShotsIn: number;
  rivalShotsOut: number;
  rivalShotsTotal: number;
}

const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const parseClockToSeconds = (timeString: string): number => {
  if (!timeString) return 0;
  const parts = timeString.trim().split(':');
  if (parts.length !== 2) return 0;
  const mins = Number(parts[0]);
  const secs = Number(parts[1]);
  if (Number.isNaN(mins) || Number.isNaN(secs)) return 0;
  return Math.max(0, Math.round(mins * 60 + secs));
};

export const formatSecondsMMSS = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const extractSurnameTokens = (player: Player): string[] => {
  const fullName = (player.name || '').trim();
  const base = (player.alias || player.name || '').trim();
  if (!fullName) return [];
  const nameTokens = fullName.split(/\s+/).filter(Boolean);
  if (nameTokens.length <= 1) return [];

  const baseTokens = normalizeText(base).split(/\s+/).filter(Boolean);
  if (
    baseTokens.length > 0 &&
    baseTokens.length < nameTokens.length &&
    nameTokens.slice(0, baseTokens.length).map(normalizeText).join(' ') === baseTokens.join(' ')
  ) {
    return nameTokens.slice(baseTokens.length);
  }
  return nameTokens.slice(1);
};

export const getDisambiguatedPlayerLabel = (
  player: Player,
  pool: Player[],
  includeNumber = true
): string => {
  const base = (player.alias || player.name || '').trim() || `#${player.number}`;
  const normBase = normalizeText(base);

  const collidingPeers = pool.filter(
    (other) => other.id !== player.id && normalizeText(other.alias || other.name || '') === normBase
  );

  let resolvedLabel = base;

  if (collidingPeers.length > 0) {
    const surnameTokens = extractSurnameTokens(player);
    if (surnameTokens.length > 0) {
      const firstSurname = surnameTokens[0];
      const firstInitial = normalizeText(firstSurname.charAt(0));

      const initialCollision = collidingPeers.some((peer) => {
        const peerSurnames = extractSurnameTokens(peer);
        return peerSurnames.length > 0 && normalizeText(peerSurnames[0].charAt(0)) === firstInitial;
      });

      if (!initialCollision) {
        resolvedLabel = `${base} ${firstSurname.charAt(0).toUpperCase()}.`;
      } else {
        const fullSurnameCollision = collidingPeers.some((peer) => {
          const peerSurnames = extractSurnameTokens(peer);
          return (
            peerSurnames.length > 0 &&
            normalizeText(peerSurnames[0]) === normalizeText(firstSurname)
          );
        });

        if (fullSurnameCollision && surnameTokens.length > 1) {
          resolvedLabel = `${base} ${firstSurname} ${surnameTokens[1].charAt(0).toUpperCase()}.`;
        } else {
          resolvedLabel = `${base} ${firstSurname}`;
        }
      }
    } else if (!includeNumber) {
      resolvedLabel = `${base} (#${player.number})`;
    }
  }

  return includeNumber ? `#${player.number} ${resolvedLabel}` : resolvedLabel;
};

const compareHalfEventsChrono = (a: RotationEvent, b: RotationEvent): number => {
  if (a.secondsRemaining !== b.secondsRemaining) {
    return b.secondsRemaining - a.secondsRemaining;
  }
  return (a.timestamp || 0) - (b.timestamp || 0);
};

export const getOnCourtAtMoment = (
  match: Match,
  half: 1 | 2,
  timeString: string
): string[] => {
  const events = (match.rotationEvents || [])
    .filter((ev) => ev.half === half && ev.type !== 'half_end')
    .sort(compareHalfEventsChrono);

  if (events.length === 0) return [];

  const targetSec = parseClockToSeconds(timeString);
  let matched: RotationEvent | null = null;

  for (const ev of events) {
    if (ev.secondsRemaining >= targetSec) {
      matched = ev;
    } else {
      break;
    }
  }

  return matched ? [...matched.onCourtIds] : [...events[0].onCourtIds];
};

export const getShotOnCourtIds = (match: Match, shot: ShotEvent): string[] => {
  if (shot.onCourtIds && shot.onCourtIds.length > 0) {
    return shot.onCourtIds;
  }
  return getOnCourtAtMoment(match, shot.half, shot.timeString);
};

export const sortLineupIds = (ids: string[], allPlayers: Player[]): string[] => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

  return uniqueIds.sort((idA, idB) => {
    const pA = playerMap.get(idA);
    const pB = playerMap.get(idB);
    const isGkA = pA?.position === 'Portero/a' ? 0 : 1;
    const isGkB = pB?.position === 'Portero/a' ? 0 : 1;
    if (isGkA !== isGkB) return isGkA - isGkB;

    const numA = parseInt(pA?.number || '', 10);
    const numB = parseInt(pB?.number || '', 10);
    const safeA = Number.isNaN(numA) ? 999 : numA;
    const safeB = Number.isNaN(numB) ? 999 : numB;
    if (safeA !== safeB) return safeA - safeB;

    return (pA?.number || idA).localeCompare(pB?.number || idB);
  });
};

export const computeQuintetStats = (
  match: Match,
  allPlayers: Player[]
): QuintetPerformance[] => {
  const groups = new Map<string, QuintetPerformance>();

  const ensureGroup = (rawIds: string[]): QuintetPerformance => {
    const cleanIds = Array.from(new Set(rawIds.filter(Boolean)));
    const key = [...cleanIds].sort().join('|');
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        playerIds: sortLineupIds(cleanIds, allPlayers),
        secondsTogether: 0,
        stintsCount: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        plusMinus: 0,
        localShotsIn: 0,
        localShotsOut: 0,
        localShotsTotal: 0,
        rivalShotsIn: 0,
        rivalShotsOut: 0,
        rivalShotsTotal: 0,
      };
      groups.set(key, group);
    }
    return group;
  };

  for (const half of [1, 2] as const) {
    const halfEvents = (match.rotationEvents || [])
      .filter((ev) => ev.half === half)
      .sort(compareHalfEventsChrono);

    for (let i = 0; i < halfEvents.length; i++) {
      const ev = halfEvents[i];
      if (ev.type === 'half_end') continue;
      const cleanIds = ev.onCourtIds.filter(Boolean);
      if (cleanIds.length === 0) continue;

      const nextEv = halfEvents[i + 1];
      const startSec = ev.secondsRemaining;
      const endSec = nextEv ? nextEv.secondsRemaining : 0;
      const duration = Math.max(0, startSec - endSec);

      const group = ensureGroup(cleanIds);
      group.secondsTogether += duration;
      if (duration > 0) {
        group.stintsCount += 1;
      }
    }
  }

  for (const shot of match.shotsEvents || []) {
    const qIds = getShotOnCourtIds(match, shot).filter(Boolean);
    if (qIds.length === 0) continue;

    const group = ensureGroup(qIds);
    if (shot.team === 'local') {
      group.localShotsTotal += 1;
      if (shot.type === 'goal' || shot.type === 'on_target') {
        group.localShotsIn += 1;
      } else {
        group.localShotsOut += 1;
      }
      if (shot.type === 'goal') {
        group.goalsFor += 1;
      }
    } else {
      group.rivalShotsTotal += 1;
      if (shot.type === 'goal' || shot.type === 'on_target') {
        group.rivalShotsIn += 1;
      } else {
        group.rivalShotsOut += 1;
      }
      if (shot.type === 'goal') {
        group.goalsAgainst += 1;
      }
    }
  }

  return Array.from(groups.values())
    .map((g) => ({
      ...g,
      plusMinus: g.goalsFor - g.goalsAgainst,
    }))
    .filter(
      (g) =>
        g.secondsTogether > 0 ||
        g.goalsFor > 0 ||
        g.goalsAgainst > 0 ||
        g.localShotsTotal > 0 ||
        g.rivalShotsTotal > 0
    )
    .sort((a, b) => {
      if (b.secondsTogether !== a.secondsTogether) {
        return b.secondsTogether - a.secondsTogether;
      }
      return b.plusMinus - a.plusMinus;
    });
};

export const getDisplayRotationEvents = (match: Match): RotationEvent[] => {
  return (match.rotationEvents || [])
    .filter((ev) => ev.type !== 'half_end')
    .sort((a, b) => {
      if (a.half !== b.half) return a.half - b.half;
      return compareHalfEventsChrono(a, b);
    });
};
