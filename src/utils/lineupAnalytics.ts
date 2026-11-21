import { Match, Player, RotationEvent, RotationEventType, ShotEvent } from '../types';

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
  if (!Number.isFinite(mins) || !Number.isFinite(secs)) return 0;
  return Math.max(0, Math.round(mins * 60 + secs));
};

export const formatSecondsMMSS = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const isNaturalGoalkeeperRole = (p?: Player): boolean =>
  p?.position === 'Portero/a' || Boolean(p?.position?.toLowerCase().includes('porter'));

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
        } else if (fullSurnameCollision && !includeNumber) {
          resolvedLabel = `${base} ${firstSurname} (#${player.number})`;
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
  const tsA = a.timestamp || 0;
  const tsB = b.timestamp || 0;
  if (tsA > 0 && tsB > 0 && tsA !== tsB) {
    return tsA - tsB;
  }
  if (a.secondsRemaining !== b.secondsRemaining) {
    return b.secondsRemaining - a.secondsRemaining;
  }
  return tsA - tsB;
};

const parseShotTimestamp = (shot: ShotEvent): number | null => {
  if (typeof shot?.timestamp === 'number' && Number.isFinite(shot.timestamp) && shot.timestamp > 0) {
    return shot.timestamp;
  }
  if (!shot?.id) return null;
  const match = /^s-(\d+)$/.exec(shot.id);
  if (!match) return null;
  const ts = Number(match[1]);
  return Number.isFinite(ts) ? ts : null;
};

const hasPlayActionBetween = (
  shotsEvents: ShotEvent[],
  half: 1 | 2,
  sec: number,
  fromTs: number,
  toTs: number
): boolean => {
  return shotsEvents.some((shot) => {
    if (shot.half !== half) return false;
    const shotTs = parseShotTimestamp(shot);
    if (shotTs === null) return false;
    if (fromTs > 0 && toTs > 0) {
      return fromTs <= shotTs && shotTs <= toTs;
    }
    return parseClockToSeconds(shot.timeString) === sec;
  });
};

export const consolidateRotationEvents = (
  events: RotationEvent[],
  shotsEvents: ShotEvent[] = []
): RotationEvent[] => {
  if (!events || events.length === 0) return [];

  const consolidated: RotationEvent[] = [];

  for (const half of [1, 2] as const) {
    const halfEvents = events.filter((ev) => ev.half === half);
    if (halfEvents.length === 0) continue;

    const halfEndEvents = halfEvents
      .filter((ev) => ev.type === 'half_end')
      .sort(compareHalfEventsChrono);
    const lastHalfEnd =
      halfEndEvents.length > 0 ? halfEndEvents[halfEndEvents.length - 1] : null;

    const rotationOps = halfEvents
      .filter((ev) => ev.type !== 'half_end')
      .sort(compareHalfEventsChrono);

    const clusters: RotationEvent[][] = [];
    for (const ev of rotationOps) {
      const currentCluster = clusters[clusters.length - 1];
      if (!currentCluster) {
        clusters.push([ev]);
        continue;
      }

      const prevEv = currentCluster[currentCluster.length - 1];
      const involvesRedCard = ev.type === 'red_card' || prevEv.type === 'red_card';
      const sameClock = ev.secondsRemaining === prevEv.secondsRemaining;
      const interruptedByPlay =
        sameClock &&
        hasPlayActionBetween(
          shotsEvents,
          half,
          ev.secondsRemaining,
          prevEv.timestamp || 0,
          ev.timestamp || 0
        );

      if (sameClock && !interruptedByPlay && !involvesRedCard) {
        currentCluster.push(ev);
      } else {
        clusters.push([ev]);
      }
    }

    let previousLineupIds: string[] | null = null;

    for (const cluster of clusters) {
      const firstEv = cluster[0];
      const lastEv = cluster[cluster.length - 1];
      const finalOnCourtIds = Array.from(
        new Set((lastEv.onCourtIds || []).filter(Boolean))
      );

      if (firstEv.type === 'initial_lineup' || previousLineupIds === null) {
        consolidated.push({
          id: lastEv.id || firstEv.id,
          half,
          timeString: lastEv.timeString,
          secondsRemaining: lastEv.secondsRemaining,
          type: 'initial_lineup',
          onCourtIds: finalOnCourtIds,
          timestamp: lastEv.timestamp,
        });
        previousLineupIds = finalOnCourtIds;
        continue;
      }

      const prevSet = new Set(previousLineupIds);
      const finalSet = new Set(finalOnCourtIds);
      const netIn = finalOnCourtIds.filter((id) => !prevSet.has(id));
      const netOut = previousLineupIds.filter((id) => !finalSet.has(id));

      if (netIn.length === 0 && netOut.length === 0) {
        continue;
      }

      const hasRedCard = cluster.some((ev) => ev.type === 'red_card');
      let mergedType: RotationEventType = 'substitution';
      if (netIn.length > 0 && netOut.length > 0) {
        mergedType = 'substitution';
      } else if (netIn.length > 0 && netOut.length === 0) {
        mergedType = 'enter';
      } else if (netOut.length > 0 && netIn.length === 0) {
        mergedType = hasRedCard ? 'red_card' : 'substitution';
      }

      consolidated.push({
        id: lastEv.id || firstEv.id,
        half,
        timeString: lastEv.timeString,
        secondsRemaining: lastEv.secondsRemaining,
        type: mergedType,
        inPlayerId: netIn[0],
        outPlayerId: netOut[0],
        inPlayerIds: netIn.length > 0 ? netIn : undefined,
        outPlayerIds: netOut.length > 0 ? netOut : undefined,
        onCourtIds: finalOnCourtIds,
        timestamp: lastEv.timestamp,
      });
      previousLineupIds = finalOnCourtIds;
    }

    if (lastHalfEnd) {
      consolidated.push({
        ...lastHalfEnd,
        onCourtIds:
          lastHalfEnd.onCourtIds && lastHalfEnd.onCourtIds.length > 0
            ? lastHalfEnd.onCourtIds
            : previousLineupIds || [],
      });
    }
  }

  return consolidated;
};

export const formatRotationMovement = (
  ev: RotationEvent,
  formatPlayer: (pid: string) => string,
  separator = ' ⬅ '
): string => {
  if (ev.type === 'initial_lineup') {
    return 'Quinteto Inicial';
  }

  const ins =
    ev.inPlayerIds && ev.inPlayerIds.length > 0
      ? ev.inPlayerIds
      : ev.inPlayerId
        ? [ev.inPlayerId]
        : [];
  const outs =
    ev.outPlayerIds && ev.outPlayerIds.length > 0
      ? ev.outPlayerIds
      : ev.outPlayerId
        ? [ev.outPlayerId]
        : [];

  if (ev.type === 'red_card' && ins.length === 0) {
    const verb = outs.length > 1 ? 'Expulsiones (Roja)' : 'Expulsión (Roja)';
    return `${verb} ${outs.map(formatPlayer).join(', ')}`.trim();
  }

  if (ins.length > 0 && outs.length > 0) {
    const inVerb = ins.length > 1 ? 'Entran' : 'Entra';
    const outVerb = outs.length > 1 ? 'Salen' : 'Sale';
    return `${inVerb} ${ins.map(formatPlayer).join(', ')}${separator}${outVerb} ${outs.map(formatPlayer).join(', ')}`;
  }

  if (ins.length > 0) {
    const inVerb = ins.length > 1 ? 'Entran' : 'Entra';
    return `${inVerb} ${ins.map(formatPlayer).join(', ')}`;
  }

  if (outs.length > 0) {
    const outVerb = outs.length > 1 ? 'Salen' : 'Sale';
    return `${outVerb} ${outs.map(formatPlayer).join(', ')}`;
  }

  return 'Quinteto Inicial';
};

export const getOnCourtAtMoment = (
  match: Match,
  half: 1 | 2,
  timeString: string,
  shotTimestamp?: number
): string[] => {
  const events = consolidateRotationEvents(
    match.rotationEvents || [],
    match.shotsEvents || []
  )
    .filter((ev) => ev.half === half && ev.type !== 'half_end')
    .sort(compareHalfEventsChrono);

  if (events.length === 0) return [];

  const allHaveTimestamp =
    shotTimestamp !== undefined &&
    Number.isFinite(shotTimestamp) &&
    events.every((ev) => (ev.timestamp || 0) > 0);

  if (allHaveTimestamp && shotTimestamp !== undefined) {
    let matchedByTs: RotationEvent | null = null;
    for (const ev of events) {
      if ((ev.timestamp || 0) <= shotTimestamp) {
        matchedByTs = ev;
      } else {
        break;
      }
    }
    return matchedByTs ? [...matchedByTs.onCourtIds] : [...events[0].onCourtIds];
  }

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
  const shotTs = parseShotTimestamp(shot) ?? undefined;
  return getOnCourtAtMoment(match, shot.half, shot.timeString, shotTs);
};

export const sortLineupIds = (ids: string[], allPlayers: Player[]): string[] => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

  return uniqueIds.sort((idA, idB) => {
    const pA = playerMap.get(idA);
    const pB = playerMap.get(idB);
    const isGkA = isNaturalGoalkeeperRole(pA) ? 0 : 1;
    const isGkB = isNaturalGoalkeeperRole(pB) ? 0 : 1;
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

  const consolidatedEvents = consolidateRotationEvents(
    match.rotationEvents || [],
    match.shotsEvents || []
  );

  for (const half of [1, 2] as const) {
    const halfEvents = consolidatedEvents.filter((ev) => ev.half === half);
    const halfEndEvents = halfEvents
      .filter((ev) => ev.type === 'half_end')
      .sort(compareHalfEventsChrono);
    const lastHalfEnd =
      halfEndEvents.length > 0 ? halfEndEvents[halfEndEvents.length - 1] : null;
    const rotationOps = halfEvents
      .filter((ev) => ev.type !== 'half_end')
      .sort(compareHalfEventsChrono);

    if (rotationOps.length === 0) continue;

    // If a half has no half_end marker, bound the tail stint using observed shots rather than inflating to 00:00
    let fallbackEndSec = rotationOps[rotationOps.length - 1].secondsRemaining;
    if (!lastHalfEnd) {
      const halfShots = (match.shotsEvents || []).filter((s) => s.half === half);
      if (halfShots.length > 0) {
        const minShotSec = Math.min(
          ...halfShots.map((s) => parseClockToSeconds(s.timeString))
        );
        fallbackEndSec = Math.min(fallbackEndSec, minShotSec);
      }
    }

    for (let i = 0; i < rotationOps.length; i++) {
      const ev = rotationOps[i];
      const cleanIds = ev.onCourtIds.filter(Boolean);
      if (cleanIds.length === 0) continue;

      const nextEv = rotationOps[i + 1];
      const startSec = ev.secondsRemaining;
      const endSec = nextEv
        ? nextEv.secondsRemaining
        : lastHalfEnd
          ? lastHalfEnd.secondsRemaining
          : fallbackEndSec;
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
  return consolidateRotationEvents(
    match.rotationEvents || [],
    match.shotsEvents || []
  )
    .filter((ev) => ev.type !== 'half_end')
    .sort((a, b) => {
      if (a.half !== b.half) return a.half - b.half;
      return compareHalfEventsChrono(a, b);
    });
};

export interface SeasonQuintetPerformance extends QuintetPerformance {
  matchesCount: number;
}

export const computeSeasonQuintetStats = (
  matches: Match[],
  allPlayers: Player[],
  topN?: number
): SeasonQuintetPerformance[] => {
  const aggMap = new Map<string, SeasonQuintetPerformance>();

  for (const match of matches) {
    const matchQuintets = computeQuintetStats(match, allPlayers);
    for (const q of matchQuintets) {
      if (q.playerIds.length !== 5) continue;

      const existing = aggMap.get(q.key);
      if (!existing) {
        aggMap.set(q.key, {
          ...q,
          playerIds: sortLineupIds(q.playerIds, allPlayers),
          matchesCount: 1,
        });
      } else {
        existing.secondsTogether += q.secondsTogether;
        existing.stintsCount += q.stintsCount;
        existing.matchesCount += 1;
        existing.goalsFor += q.goalsFor;
        existing.goalsAgainst += q.goalsAgainst;
        existing.localShotsIn += q.localShotsIn;
        existing.localShotsOut += q.localShotsOut;
        existing.localShotsTotal += q.localShotsTotal;
        existing.rivalShotsIn += q.rivalShotsIn;
        existing.rivalShotsOut += q.rivalShotsOut;
        existing.rivalShotsTotal += q.rivalShotsTotal;
      }
    }
  }

  const results = Array.from(aggMap.values())
    .map((g) => ({
      ...g,
      plusMinus: g.goalsFor - g.goalsAgainst,
    }))
    .sort((a, b) => {
      if (b.secondsTogether !== a.secondsTogether) {
        return b.secondsTogether - a.secondsTogether;
      }
      if (b.plusMinus !== a.plusMinus) {
        return b.plusMinus - a.plusMinus;
      }
      return b.matchesCount - a.matchesCount;
    });

  return topN && topN > 0 ? results.slice(0, topN) : results;
};
