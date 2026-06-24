/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Match, Player, ShotEvent, PlayerPerformance } from '../types';

// Format seconds into MM:SS string
const formatTime = (totalSeconds: number): string => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Help convert hex color to RGB array
const hexToRgb = (hex: string): [number, number, number] => {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return [r, g, b];
};

// Help adapt goalkeeper position label based on player gender
const getPlayerPositionLabel = (pos: string, gender?: 'M' | 'F') => {
  if (pos === 'Portero/a') {
    return gender === 'M' ? 'Portero' : gender === 'F' ? 'Portera' : 'Portero/a';
  }
  return pos;
};

// Help load image and convert to Base64 to bypass CORS issues on direct jsPDF loading
const loadImgBase64 = (url: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
          return;
        }
      } catch (err) {
        console.warn('CORS or security error converting image to Base64', err);
      }
      resolve('');
    };
    img.onerror = () => {
      resolve('');
    };
  });
};

// Preload Logo Base64 to make generation synchronous on user gesture thread
let preloadedLogoBase64 = '';
const logoUrl = 'https://api.clupik.com/clubs/10590/images/navbar.png';
try {
  loadImgBase64(logoUrl).then(res => {
    preloadedLogoBase64 = res;
  }).catch(err => {
    console.warn('Failed to preload FS Talavera logo:', err);
  });
} catch (e) {
  console.warn('Sync preload logo attempt failed:', e);
}

// Draw Futsal Pitch and Shot Markers on jsPDF Canvas
const drawFutsalPitchPDF = (
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  shots: ShotEvent[],
  half: 1 | 2,
  rivalColorHex: string,
  talaveraKit: '1ª Equipación' | '2ª Equipación'
) => {
  // Brand colors
  const primaryColor = [0, 65, 131]; // FS Talavera Navy (#004183)
  const secondaryColor = [255, 215, 0]; // FS Talavera Gold (#FFD700)
  const rivalColor = hexToRgb(rivalColorHex || '#FF0000');

  // Draw Field Background (light ice-blue / grey sports court look)
  doc.setFillColor(245, 247, 250);
  doc.rect(x, y, w, h, 'F');

  // Draw outer border boundary lines
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.6);
  doc.rect(x, y, w, h, 'S');

  // Draw Center Line
  doc.line(x + w / 2, y, x + w / 2, y + h);

  // Draw Center Circle (Simplified circle of radius 3m in 40m scale, i.e., 3/40 of width)
  const centerRadius = w * (3 / 40);
  doc.circle(x + w / 2, y + h / 2, centerRadius, 'S');
  doc.circle(x + w / 2, y + h / 2, 0.4, 'FD'); // center point

  // Draw Penalty areas (simplified 6-meter semi-circles on left and right goal lines)
  const areaRadius = w * (6 / 40);
  
  // Helper to draw clean semi-circles using line segments compatible with jsPDF
  const drawArc = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
    const numSegments = 30;
    for (let i = 0; i < numSegments; i++) {
      const theta1 = startAngle + (i / numSegments) * (endAngle - startAngle);
      const theta2 = startAngle + ((i + 1) / numSegments) * (endAngle - startAngle);
      const px1 = cx + radius * Math.cos(theta1);
      const py1 = cy + radius * Math.sin(theta1);
      const px2 = cx + radius * Math.cos(theta2);
      const py2 = cy + radius * Math.sin(theta2);
      doc.line(px1, py1, px2, py2);
    }
  };

  // Left Area: Semicircle bending to the right (inside the pitch)
  drawArc(x, y + h / 2, areaRadius, -Math.PI / 2, Math.PI / 2);

  // Right Area: Semicircle bending to the left (inside the pitch)
  drawArc(x + w, y + h / 2, areaRadius, Math.PI / 2, 3 * Math.PI / 2);

  // Redraw white line over center line to split inside areas cleanly
  doc.setDrawColor(245, 247, 250);
  doc.setLineWidth(1.0);
  doc.line(x, y, x, y + h);
  doc.line(x + w, y, x + w, y + h);

  // Restore line color
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.6);
  // Re-draw outer crop bounds
  doc.rect(x, y, w, h, 'S');

  // Draw Goal indicators
  const goalWidth = 1.2;
  const goalHeight = h * (3 / 20); // 3m goal in 20m width
  doc.setFillColor(150, 150, 150);
  // Left goal outer box
  doc.rect(x - goalWidth, y + h / 2 - goalHeight / 2, goalWidth, goalHeight, 'FD');
  // Right goal outer box
  doc.rect(x + w, y + h / 2 - goalHeight / 2, goalWidth, goalHeight, 'FD');

  // Filter shots for this half
  const halfShots = shots.filter(s => s.half === half);

  // Draw shot markers
  halfShots.forEach(shot => {
    // Map percentages (0-100) to actual canvas bounding dimensions
    const sx = x + (shot.x * w) / 100;
    const sy = y + (shot.y * h) / 100;

    // Safety clip
    if (sx < x || sx > x + w || sy < y || sy > y + h) return;

    const isLocal = shot.team === 'local';
    const markerColor = isLocal 
      ? (talaveraKit === '1ª Equipación' ? [56, 189, 248] : [236, 72, 153])
      : rivalColor;

    doc.setDrawColor(markerColor[0], markerColor[1], markerColor[2]);
    doc.setFillColor(markerColor[0], markerColor[1], markerColor[2]);

    if (shot.type === 'out') {
      // Draw 'X'
      doc.setLineWidth(0.4);
      doc.line(sx - 1.2, sy - 1.2, sx + 1.2, sy + 1.2);
      doc.line(sx + 1.2, sy - 1.2, sx - 1.2, sy + 1.2);
    } else if (shot.type === 'on_target') {
      // Draw 'O' (circle)
      doc.setLineWidth(0.4);
      doc.circle(sx, sy, 1.3, 'S');
    } else if (shot.type === 'goal') {
      // Draw Concentric Goal Circles
      doc.setLineWidth(0.4);
      doc.circle(sx, sy, 2.0, 'S');
      doc.circle(sx, sy, 1.1, 'FD');
      
      // Print player number or 'G' or time
      if (isLocal && talaveraKit === '1ª Equipación') {
        doc.setTextColor(0, 41, 131); // Brand Navy color for contrast on sky-blue circle background
      } else {
        doc.setTextColor(255, 255, 255);
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5);
      const label = shot.playerNumber ? `${shot.playerNumber}` : 'G';
      doc.text(label, sx - 0.7, sy + 0.6);
      
      // Mini timestamp box next to goal
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(`(${shot.timeString})`, sx + 2.5, sy + 1);
    }
  });
};

// PAGE HEADER HELPER FOR FS TALAVERA
const drawPageHeader = (doc: jsPDF, title: string, subtitle: string, pageNum: number, totalPages: number, logoBase64?: string) => {
  const brandBlue = [0, 65, 131]; // #004183
  const brandGold = [255, 215, 0]; // #FFD700

  // Top colored stripe background banner
  doc.setFillColor(brandBlue[0], brandBlue[1], brandBlue[2]);
  doc.rect(0, 0, 210, 35, 'F');

  // Gold accent line under banner
  doc.setFillColor(brandGold[0], brandGold[1], brandGold[2]);
  doc.rect(0, 35, 210, 2.5, 'F');

  // Load Base64 Clupik official logo if available, else render beautiful vector shield
  if (logoBase64) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.circle(20, 18, 12, 'F');
      doc.addImage(logoBase64, 'PNG', 11, 9, 18, 18);
    } catch (err) {
      console.warn('Error rendering loaded Base64 image in PDF, fallback to vector shield.', err);
      doc.setFillColor(brandGold[0], brandGold[1], brandGold[2]);
      doc.circle(20, 18, 11, 'FD');
      doc.setFillColor(brandBlue[0], brandBlue[1], brandBlue[2]);
      doc.circle(20, 18, 8, 'FD');
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.line(17, 18, 23, 18);
      doc.line(20, 15, 20, 21);
      doc.circle(20, 18, 2, 'S');
    }
  } else {
    // Draw Club Logo Emblem mock physically on top left
    doc.setFillColor(brandGold[0], brandGold[1], brandGold[2]);
    doc.circle(20, 18, 11, 'FD'); // Gold outer circle
    doc.setFillColor(brandBlue[0], brandBlue[1], brandBlue[2]);
    doc.circle(20, 18, 8, 'FD'); // Blue inner circle
    
    // Draw mini white soccer ball lines inside circle
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.3);
    doc.line(17, 18, 23, 18);
    doc.line(20, 15, 20, 21);
    doc.circle(20, 18, 2, 'S');
  }

  // Club Text
  doc.setTextColor(255, 215, 0); // Gold text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('FS TALAVERA', 36, 17);

  doc.setTextColor(255, 255, 255); // White sub text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('CLUB DE FÚTBOL SALA FEMENINO • INFORMES TÁCTICOS', 36, 23);

  // Document Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, 210 - 15, 17, { align: 'right' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(subtitle, 210 - 15, 23, { align: 'right' });

  // Page Numbers Footer
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(15, 280, 195, 280);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(`FS Talavera - Club de Fútbol Sala. Todos los derechos reservados.`, 15, 285);
  doc.text(`Pág. ${pageNum} de ${totalPages}`, 205, 285, { align: 'right' });
};

// EXPORT EXACT SINGLE PAGE MATCH REPORT
export const exportMatchToPDF = (match: Match, allPlayers: Player[]) => {
  const logoBase64 = preloadedLogoBase64;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const totalPages = 2;

  // HEADER: Official Shield, Rival, and Marcador Final Summary
  const titleStr = 'INFORME COMPLETO DE PARTIDO';
  const subtitleStr = match.matchType === 'amistoso'
    ? `vs ${match.rival} • Amistoso • ${match.date}`
    : `vs ${match.rival} • Jornada ${match.jornada} • ${match.date}`;
  drawPageHeader(doc, titleStr, subtitleStr, 1, totalPages, logoBase64);

  // --- UPPER HALF: TWO COLUMNS (1st & 2nd HALF SIDE-BY-SIDE) ---
  const colY = 40;
  const colHeight = 68;
  const colW = 86;
  const col1X = 14;
  const col2X = 110;

  // 1ª PARTE (Izquierda Column card)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(col1X, colY, colW, colHeight, 3.5, 3.5, 'FD');

  doc.setTextColor(0, 65, 131);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ANÁLISIS COLECTIVO: 1ª PARTE', col1X + 4, colY + 6);

  const goals1stLocal = match.shotsEvents.filter(s => s.team === 'local' && s.type === 'goal' && s.half === 1).length;
  const goals1stRival = match.shotsEvents.filter(s => s.team === 'rival' && s.type === 'goal' && s.half === 1).length;
  const fouls1stLocal = match.localFouls1stHalf || 0;
  const fouls1stRival = match.rivalFouls1stHalf || 0;

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Marcador parcial: Equipo ${goals1stLocal} - ${goals1stRival} Rival`, col1X + 4, colY + 11.5);
  
  const bonusLocal1st = fouls1stLocal >= 5 ? 'SÍ' : 'No';
  const bonusRival1st = fouls1stRival >= 5 ? 'SÍ' : 'No';

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(`Faltas Equipo: ${fouls1stLocal} (Bonus: ${bonusLocal1st})`, col1X + 4, colY + 16.5);
  doc.text(`Faltas Rival: ${fouls1stRival} (Bonus: ${bonusRival1st})`, col1X + 4, colY + 21.5);

  // Draw 1st Half Shot Map
  drawFutsalPitchPDF(doc, col1X + 3, colY + 24, 80, 40, match.shotsEvents, 1, match.rivalColor, match.talaveraKit);


  // 2ª PARTE (Derecha Column card)
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(col2X, colY, colW, colHeight, 3.5, 3.5, 'FD');

  doc.setTextColor(0, 65, 131);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ANÁLISIS COLECTIVO: 2ª PARTE', col2X + 4, colY + 6);

  const goals2ndLocal = match.shotsEvents.filter(s => s.team === 'local' && s.type === 'goal' && s.half === 2).length;
  const goals2ndRival = match.shotsEvents.filter(s => s.team === 'rival' && s.type === 'goal' && s.half === 2).length;
  const fouls2ndLocal = match.localFouls2ndHalf || 0;
  const fouls2ndRival = match.rivalFouls2ndHalf || 0;

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Marcador parcial: Equipo ${goals2ndLocal} - ${goals2ndRival} Rival`, col2X + 4, colY + 11.5);

  const bonusLocal2nd = fouls2ndLocal >= 5 ? 'SÍ' : 'No';
  const bonusRival2nd = fouls2ndRival >= 5 ? 'SÍ' : 'No';

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(`Faltas Equipo: ${fouls2ndLocal} (Bonus: ${bonusLocal2nd})`, col2X + 4, colY + 16.5);
  doc.text(`Faltas Rival: ${fouls2ndRival} (Bonus: ${bonusRival2nd})`, col2X + 4, colY + 21.5);

  // Draw 2nd Half Shot Map
  drawFutsalPitchPDF(doc, col2X + 3, colY + 24, 80, 40, match.shotsEvents, 2, match.rivalColor, match.talaveraKit);


  // --- LOWER HALF (PAGE 1): ESTADÍSTICAS COLECTIVAS (Left) vs TIMELINE DE GOLES (Right) ---
  const bottomY = colY + colHeight + 8; // 152. Highly spacious.

  const cstX = 14;
  const cstW = 60;
  const tlgX = 80;
  const tlgW = 116;

  // Divider lines & headers
  doc.setTextColor(0, 65, 131);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('ESTADÍSTICAS COLECTIVAS', cstX, bottomY - 2);
  doc.text('TIMELINE DE RESULTADO (POR GOL Y GOLEADOR/A)', tlgX, bottomY - 2);

  doc.setDrawColor(0, 65, 131);
  doc.setLineWidth(0.4);
  doc.line(cstX, bottomY - 0.5, cstX + cstW, bottomY - 0.5);
  doc.line(tlgX, bottomY - 0.5, tlgX + tlgW, bottomY - 0.5);

  // Calculate collective numbers
  const localGoalsTotal = match.goalsFor;
  const rivalGoalsTotal = match.goalsAgainst;

  const localShotsTotal = match.shotsEvents.filter(s => s.team === 'local').length;
  const rivalShotsTotal = match.shotsEvents.filter(s => s.team === 'rival').length;

  const localShotsOnTarget = match.shotsEvents.filter(s => s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
  const rivalShotsOnTarget = match.shotsEvents.filter(s => s.team === 'rival' && (s.type === 'on_target' || s.type === 'goal')).length;

  const localShotsOut = match.shotsEvents.filter(s => s.team === 'local' && s.type === 'out').length;
  const rivalShotsOut = match.shotsEvents.filter(s => s.team === 'rival' && s.type === 'out').length;

  const mappedResultSymbol = match.result === 'W' ? 'V' : match.result === 'D' ? 'E' : 'D';
  const collectiveHeaders = [['Indicador', 'LCL', 'RVL']];
  const collectiveRows = [
    ['Goles Marcados', localGoalsTotal.toString(), rivalGoalsTotal.toString()],
    ['Tiros Registrados', localShotsTotal.toString(), rivalShotsTotal.toString()],
    ['Tiros a Puerta', localShotsOnTarget.toString(), rivalShotsOnTarget.toString()],
    ['Tiros Fuera', localShotsOut.toString(), rivalShotsOut.toString()],
    ['Faltas Acum. 1ª P.', (match.localFouls1stHalf || 0).toString(), (match.rivalFouls1stHalf || 0).toString()],
    ['Faltas Acum. 2ª P.', (match.localFouls2ndHalf || 0).toString(), (match.rivalFouls2ndHalf || 0).toString()],
    ['Resultado Final', `${mappedResultSymbol} (${match.goalsFor}-${match.goalsAgainst})`, '—']
  ];

  // Render Collective table
  autoTable(doc, {
    startY: bottomY + 2,
    head: collectiveHeaders,
    body: collectiveRows,
    theme: 'striped',
    headStyles: {
      fillColor: [0, 65, 131],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center'
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 1.5,
      halign: 'center'
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 32 },
      1: { cellWidth: 14 },
      2: { cellWidth: 14 }
    },
    margin: { left: cstX },
    tableWidth: cstW
  });


  // --- GOAL TIMELINE TABLE (Right Side) ---
  const goalEvents = [...match.shotsEvents].filter(s => s.type === 'goal');
  goalEvents.sort((a, b) => {
    if (a.half !== b.half) return a.half - b.half;
    return a.timeString.localeCompare(b.timeString);
  });

  let runningLocalScore = 0;
  let runningRivalScore = 0;
  const goalRows = goalEvents.map((g, idx) => {
    if (g.team === 'local') {
      runningLocalScore++;
    } else {
      runningRivalScore++;
    }
    const runningScoreStr = `${runningLocalScore} - ${runningRivalScore}`;
    const halfStr = `${g.half}ª P.`;

    let scorerName = 'Rival';
    if (g.team === 'local') {
      const scorerPlayer = allPlayers.find(p => p.id === g.playerId || p.number === g.playerNumber);
      scorerName = scorerPlayer ? `${scorerPlayer.alias} (#${scorerPlayer.number})` : (g.playerNumber ? `Equipo (#${g.playerNumber})` : 'Equipo');
    }

    return [
      (idx + 1).toString(),
      scorerName,
      halfStr,
      g.timeString,
      runningScoreStr
    ];
  });

  const goalHeaders = [['Nº', 'Goleador/a', 'Parte', 'Minuto', 'Marcador']];
  const goalBody = goalRows.length > 0 ? goalRows : [['-', 'No se registraron goles', '-', '-', '0 - 0']];

  autoTable(doc, {
    startY: bottomY + 2,
    head: goalHeaders,
    body: goalBody,
    theme: 'striped',
    headStyles: {
      fillColor: [0, 65, 131],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center'
    },
    styles: {
      fontSize: 7.2,
      cellPadding: 1.5,
      halign: 'center'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55, fontStyle: 'bold', halign: 'left' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 19, fontStyle: 'bold', halign: 'center' }
    },
    margin: { left: tlgX },
    tableWidth: tlgW
  });


  // ==========================================
  // --- PAGE 2: INDIVIDUAL DETAILED REPORT ---
  // ==========================================
  doc.addPage();
  drawPageHeader(doc, titleStr, subtitleStr, 2, totalPages, logoBase64);

  // Individual Player stats header area
  doc.setTextColor(0, 65, 131);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('ESTADÍSTICAS INDIVIDUALES DE LA PLANTILLA', 14, 41);

  doc.setDrawColor(0, 65, 131);
  doc.setLineWidth(0.4);
  doc.line(14, 42.5, 196, 42.5);

  const individualHeaders = [[
    'Nº',
    'Jugador/a convocado/a',
    'Posición',
    'Min. 1ª Parte',
    'Min. 2ª Parte',
    'Tiempo Total',
    'Gol',
    'Tir',
    'Par/Enc',
    'Am.',
    'Roja'
  ]];

  // Include only players convocadas for this specific match (starters, subs or having stats)
  const convocadasIds = new Set([
    ...(match.titulares || []),
    ...(match.suplentes || []),
    ...Object.keys(match.stats || {})
  ]);
  
  let finalPlayersToReport = allPlayers.filter(p => convocadasIds.has(p.id));
  if (finalPlayersToReport.length === 0) {
    finalPlayersToReport = allPlayers.filter(p => p.isActive);
  }

  // Sort by position (GK first) then by dorsal number
  finalPlayersToReport.sort((a, b) => {
    const aIsGk = a.position === 'Portero/a';
    const bIsGk = b.position === 'Portero/a';
    if (aIsGk && !bIsGk) return -1;
    if (!aIsGk && bIsGk) return 1;
    return (parseInt(a.number) || 0) - (parseInt(b.number) || 0);
  });

  const individualRows = finalPlayersToReport.map(p => {
    const perf = match.stats[p.id] || {
      secondsPlayed: 0,
      secondsPlayed1st: 0,
      secondsPlayed2nd: 0,
      shots: 0,
      goals: 0,
      yellows: 0,
      redCard: false,
      saves: 0,
      goalsConceded: 0
    };

    const isStartingGoalkeeper = match.titulares && match.titulares[0] === p.id;
    const isPortera = p.position === 'Portero/a' || isStartingGoalkeeper;

    const t1 = perf.secondsPlayed1st !== undefined ? formatTime(perf.secondsPlayed1st) : '-';
    const t2 = perf.secondsPlayed2nd !== undefined ? formatTime(perf.secondsPlayed2nd) : formatTime(perf.secondsPlayed);
    const tTot = formatTime(perf.secondsPlayed);

    return [
      `#${p.number}`,
      p.name + (isStartingGoalkeeper ? ' 🧤(T)' : ''),
      getPlayerPositionLabel(p.position, p.gender),
      t1,
      t2,
      tTot,
      perf.goals.toString(),
      perf.shots.toString(),
      isPortera ? `${perf.saves || 0} / -${perf.goalsConceded || 0}` : '-',
      perf.yellows.toString(),
      perf.redCard ? '1' : '0'
    ];
  });

  // Render individual player stats table spanning full width (182mm)
  autoTable(doc, {
    startY: 44,
    head: individualHeaders,
    body: individualRows,
    theme: 'striped',
    headStyles: {
      fillColor: [0, 65, 131],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5
    },
    styles: {
      fontSize: 7.2,
      cellPadding: 1.6
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 8, halign: 'center' },
      1: { fontStyle: 'bold', cellWidth: 46 },
      2: { cellWidth: 20 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
      6: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
      7: { halign: 'center', cellWidth: 10 },
      8: { halign: 'center', cellWidth: 22 },
      9: { halign: 'center', cellWidth: 8 },
      10: { halign: 'center', cellWidth: 9 }
    },
    margin: { left: 14 },
    tableWidth: 182,
    didParseCell: (data: any) => {
      // Highlight the Portera or active goalkeeper with a specialized visual soft-amber background tint
      const pId = finalPlayersToReport[data.row.index]?.id;
      const isStartingGoalkeeper = match.titulares && match.titulares[0] === pId;
      const isPortera = finalPlayersToReport[data.row.index]?.position === 'Portero/a' || isStartingGoalkeeper;
      
      if (isPortera && data.section === 'body') {
        data.cell.styles.fillColor = [254, 243, 199];
        data.cell.styles.textColor = [146, 64, 14];
        data.cell.styles.fontStyle = 'bold';
      }

      // Highlight Red Card cells with bold red color when the value is "1"
      if (data.section === 'body' && data.column.index === 10 && data.cell.raw === '1') {
        data.cell.styles.textColor = [190, 24, 24]; // Dark red
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // Add Notes section beautifully fitted on page 2 base
  const finalY = (doc as any).lastAutoTable?.finalY || 200;
  const notesY = finalY + 12;
  if (notesY < 240) {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, notesY, 182, 32, 3, 3, 'FD');

    doc.setTextColor(0, 65, 131);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('NOTAS TÁCTICAS Y OBSERVACIONES', 18, notesY + 5.5);

    // Draw comment text or horizontal lines inside
    if (match.comment) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      const splitComment = doc.splitTextToSize(match.comment, 174);
      doc.text(splitComment, 18, notesY + 11.5);
    } else {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.line(18, notesY + 11.5, 192, notesY + 11.5);
      doc.line(18, notesY + 18, 192, notesY + 18);
      doc.line(18, notesY + 24.5, 192, notesY + 24.5);
    }
  }

  const fileName = match.matchType === 'amistoso'
    ? `FS_Talavera_Amistoso_vs_${match.rival.replace(/\s+/g, '_')}.pdf`
    : `FS_Talavera_Jornada_${match.jornada}_vs_${match.rival.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
};

// REPORT EXPORTS: 1. TEAM REPORT TO PDF
export const exportTeamReportToPDF = (
  matches: Match[],
  players: Player[],
  selectedSeason: string = 'all',
  matchTypeFilter: string = 'all'
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const logoBase64 = preloadedLogoBase64;
  const seasonLabel = selectedSeason === 'all' ? 'Todas las Temporadas' : selectedSeason;
  const typeLabel = matchTypeFilter === 'all' ? 'Todos los partidos' : matchTypeFilter === 'oficial' ? 'Partidos Oficiales' : 'Partidos Amistosos';

  if (matches.length === 0) {
    drawPageHeader(doc, 'INFORME DE RENDIMIENTO ACUMULADO', `${seasonLabel} • ${typeLabel}`, 1, 1, logoBase64);
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('No hay partidos archivados para procesar estadísticas de equipo todavía con los filtros seleccionados.', 15, 60);
    doc.save('FS_Talavera_Rendimiento_Vacio.pdf');
    return;
  }

  // Calculations
  const totalGames = matches.length;
  const wins = matches.filter(m => m.result === 'W').length;
  const draws = matches.filter(m => m.result === 'D').length;
  const losses = matches.filter(m => m.result === 'L').length;

  const totalGoalsFor = matches.reduce((sum, m) => sum + m.goalsFor, 0);
  const totalGoalsAgainst = matches.reduce((sum, m) => sum + m.goalsAgainst, 0);
  const totalShots = matches.reduce((sum, m) => sum + (m.teamShots || 0), 0);
  const totalTeamYellows = matches.reduce((sum, m) => sum + (m.teamYellows || 0), 0);

  const totalShotsOnTarget = matches.reduce((acc, m) => {
    if (m.shotsEvents && m.shotsEvents.length > 0) {
      return acc + m.shotsEvents.filter(s => s.team === 'local' && (s.type === 'on_target' || s.type === 'goal')).length;
    }
    return acc + m.goalsFor;
  }, 0);

  const totalShotsOut = matches.reduce((acc, m) => {
    if (m.shotsEvents && m.shotsEvents.length > 0) {
      return acc + m.shotsEvents.filter(s => s.team === 'local' && s.type === 'out').length;
    }
    return acc + Math.max(0, (m.teamShots || 0) - m.goalsFor);
  }, 0);

  const winsPercent = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const goalDiff = totalGoalsFor - totalGoalsAgainst;

  const avgGoalsFor = totalGames > 0 ? (totalGoalsFor / totalGames).toFixed(1) : '0';
  const avgShots = totalGames > 0 ? (totalShots / totalGames).toFixed(1) : '0';

  // Compute individual aggregated performance
  const playersStatsMap: Record<
    string,
    {
      goals: number;
      shots: number;
      minutes: number;
      saves: number;
      conceded: number;
      yellows: number;
      redCards: number;
      matchesPlayed: number;
    }
  > = {};

  players.forEach(p => {
    playersStatsMap[p.id] = {
      goals: 0,
      shots: 0,
      minutes: 0,
      saves: 0,
      conceded: 0,
      yellows: 0,
      redCards: 0,
      matchesPlayed: 0
    };
  });

  matches.forEach(m => {
    Object.keys(m.stats).forEach(pid => {
      if (!playersStatsMap[pid]) {
        playersStatsMap[pid] = {
          goals: 0,
          shots: 0,
          minutes: 0,
          saves: 0,
          conceded: 0,
          yellows: 0,
          redCards: 0,
          matchesPlayed: 0
        };
      }
      const perf = m.stats[pid];
      playersStatsMap[pid].goals += perf.goals || 0;
      playersStatsMap[pid].shots += perf.shots || 0;
      playersStatsMap[pid].minutes += perf.secondsPlayed || 0;
      playersStatsMap[pid].saves += perf.saves || 0;
      playersStatsMap[pid].conceded += perf.goalsConceded || 0;
      playersStatsMap[pid].yellows += perf.yellows || 0;
      if (perf.secondsPlayed > 0) {
        playersStatsMap[pid].matchesPlayed += 1;
      }
      if (perf.redCard) {
        playersStatsMap[pid].redCards += 1;
      }
    });
  });

  const playerStatsList = players.map(p => {
    const agg = playersStatsMap[p.id] || {
      goals: 0,
      shots: 0,
      minutes: 0,
      saves: 0,
      conceded: 0,
      yellows: 0,
      redCards: 0,
      matchesPlayed: 0
    };
    return {
      player: p,
      ...agg
    };
  });

  const topScorersList = [...playerStatsList]
    .filter(p => p.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.shots - a.shots)
    .slice(0, 5);

  const topMinutesList = [...playerStatsList]
    .filter(p => p.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  const topShotsList = [...playerStatsList]
    .filter(p => p.shots > 0)
    .sort((a, b) => b.shots - a.shots)
    .slice(0, 5);

  const topCardsList = [...playerStatsList]
    .filter(p => p.yellows > 0 || p.redCards > 0)
    .sort((a, b) => (b.yellows + b.redCards * 2) - (a.yellows + a.redCards * 2))
    .slice(0, 5);

  // --- PAGE 1: COLLECTIVE ANALYSIS AND LEADERS ---
  const totalPages = 2;
  drawPageHeader(doc, 'ANÁLISIS DE RENDIMIENTO COLECTIVO', `${seasonLabel} • ${typeLabel}`, 1, totalPages, logoBase64);

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Resumen Colectivo de la Temporada', 15, 46);

  doc.setDrawColor(0, 65, 131);
  doc.setLineWidth(0.4);
  doc.line(15, 48, 195, 48);

  const boxWidth = 56;
  const boxHeight = 27;
  const leftX1 = 15;
  const leftX2 = 77;
  const leftX3 = 139;
  const boxY = 53;

  // Box 1: Balance del Club
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(leftX1, boxY, boxWidth, boxHeight, 3, 3, 'FD');
  
  doc.setTextColor(110, 110, 110);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('BALANCE DEL CLUB', leftX1 + 4, boxY + 5);

  doc.setTextColor(0, 65, 131);
  doc.setFontSize(13);
  doc.text(`${wins}V - ${draws}E - ${losses}D`, leftX1 + 4, boxY + 13.5);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Partidos: ${totalGames}  •  Victorias: ${winsPercent}%`, leftX1 + 4, boxY + 22);

  // Box 2: Balance Goleador
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(leftX2, boxY, boxWidth, boxHeight, 3, 3, 'FD');
  
  doc.setTextColor(110, 110, 110);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('BALANCE GOLEADOR', leftX2 + 4, boxY + 5);

  doc.setTextColor(16, 185, 129); // emerald-600
  doc.setFontSize(13);
  doc.text(`${totalGoalsFor} / ${totalGoalsAgainst}`, leftX2 + 4, boxY + 13.5);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Diferencia: ${goalDiff > 0 ? '+' : ''}${goalDiff} goles`, leftX2 + 4, boxY + 22);

  // Box 3: Tiros (Mismo cajón de tiros)
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(leftX3, boxY, boxWidth, boxHeight, 3, 3, 'FD');
  
  doc.setTextColor(110, 110, 110);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('TIROS', leftX3 + 4, boxY + 5);

  doc.setTextColor(190, 140, 10); // gold/amber
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`${totalShots} Totales`, leftX3 + 4, boxY + 13);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Dentro: ${totalShotsOnTarget}  •  Fuera: ${totalShotsOut}`, leftX3 + 4, boxY + 19.5);

  doc.setTextColor(0, 65, 131); // brand blue
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  const shotsPerGoal = totalGoalsFor > 0 ? (totalShots / totalGoalsFor).toFixed(1) : '0';
  doc.text(`Tiros / Gol: ${shotsPerGoal} de media`, leftX3 + 4, boxY + 24.5);

  // Leaders Section Title
  const leadersY = 87;
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Líderes de la Temporada', 15, leadersY);

  doc.setDrawColor(0, 65, 131);
  doc.setLineWidth(0.3);
  doc.line(15, leadersY + 2, 195, leadersY + 2);

  // --- LEADERBOARDS ROW 1 ---
  // Left: Goleadoras
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Goleadoras', 15, leadersY + 8);

  const scorersTableBody = topScorersList.length > 0 
    ? topScorersList.map((s, idx) => [
        `#${idx + 1}`,
        `#${s.player.number} ${s.player.alias || s.player.name}`,
        `${s.goals} G`
      ])
    : [['-', 'Sin goles registrados', '-']];

  autoTable(doc, {
    startY: leadersY + 10,
    margin: { left: 15 },
    tableWidth: 82,
    head: [['Pos', 'Jugadora', 'Goles']],
    body: scorersTableBody,
    theme: 'striped',
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontSize: 7.5, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
      1: { cellWidth: 50 },
      2: { halign: 'center', cellWidth: 22, fontStyle: 'bold' }
    }
  });

  // Right: Minutos Jugados
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Minutos Jugados', 113, leadersY + 8);

  const minutesTableBody = topMinutesList.length > 0
    ? topMinutesList.map((s, idx) => [
        `#${idx + 1}`,
        `#${s.player.number} ${s.player.alias || s.player.name}`,
        `${Math.floor(s.minutes / 60)} min`
      ])
    : [['-', 'Sin minutos registrados', '-']];

  autoTable(doc, {
    startY: leadersY + 10,
    margin: { left: 113 },
    tableWidth: 82,
    head: [['Pos', 'Jugadora', 'Minutos']],
    body: minutesTableBody,
    theme: 'striped',
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontSize: 7.5, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
      1: { cellWidth: 50 },
      2: { halign: 'center', cellWidth: 22 }
    }
  });

  // --- LEADERBOARDS ROW 2 ---
  const row2TitleY = 148;
  // Left: Volumen de Tiros
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Clasificación por Tiros', 15, row2TitleY);

  const shotsTableBody = topShotsList.length > 0
    ? topShotsList.map((s, idx) => [
        `#${idx + 1}`,
        `#${s.player.number} ${s.player.alias || s.player.name}`,
        `${s.shots} tiros`
      ])
    : [['-', 'Sin tiros registrados', '-']];

  autoTable(doc, {
    startY: row2TitleY + 2,
    margin: { left: 15 },
    tableWidth: 82,
    head: [['Pos', 'Jugadora', 'Tiros']],
    body: shotsTableBody,
    theme: 'striped',
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontSize: 7.5, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
      1: { cellWidth: 50 },
      2: { halign: 'center', cellWidth: 22 }
    }
  });

  // Right: Sanciones y Disciplina
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Amonestaciones', 113, row2TitleY);

  const cardsTableBody = topCardsList.length > 0
    ? topCardsList.map((s, idx) => {
        return [
          `#${idx + 1}`,
          `#${s.player.number} ${s.player.name}`,
          s.yellows.toString(),
          s.redCards.toString()
        ];
      })
    : [['-', 'Sin amonestaciones', '0', '0']];

  autoTable(doc, {
    startY: row2TitleY + 2,
    margin: { left: 113 },
    tableWidth: 82,
    head: [['Pos', 'Jugadora', 'A', 'R']],
    body: cardsTableBody,
    theme: 'striped',
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontSize: 7.5, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
      1: { cellWidth: 50 },
      2: { halign: 'center', cellWidth: 11, fontStyle: 'bold' },
      3: { halign: 'center', cellWidth: 11, fontStyle: 'bold' }
    }
  });

  // --- PAGE 2: SQUAD DETAILED STATISTICS ---
  doc.addPage();
  drawPageHeader(doc, 'ESTADÍSTICAS COMPLETAS DE LA PLANTILLA', `${seasonLabel} • ${typeLabel}`, 2, totalPages, logoBase64);

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Rendimiento Individual de la Plantilla', 15, 46);

  doc.setDrawColor(0, 65, 131);
  doc.setLineWidth(0.4);
  doc.line(15, 48, 195, 48);

  const sortedScorers = players
    .map(p => {
      const agg = playersStatsMap[p.id] || {
        goals: 0,
        shots: 0,
        minutes: 0,
        saves: 0,
        conceded: 0,
        yellows: 0,
        redCards: 0,
        matchesPlayed: 0
      };
      const accuracy = agg.shots > 0 ? `${((agg.goals / agg.shots) * 100).toFixed(0)}%` : '-';
      const isGK = p.position === 'Portero/a';
      const cardStr = agg.yellows > 0 || agg.redCards > 0 
        ? `${agg.yellows}A${agg.redCards > 0 ? ` + ${agg.redCards}R` : ''}`
        : '0';
      return {
        dorsal: p.number,
        name: p.name,
        position: getPlayerPositionLabel(p.position, p.gender),
        matchesPlayed: agg.matchesPlayed,
        minutes: agg.minutes,
        shots: agg.shots,
        goals: agg.goals,
        saves: agg.saves,
        conceded: agg.conceded,
        cards: cardStr,
        accuracy: accuracy,
        isGK: isGK
      };
    })
    .filter(item => {
      const playerObj = players.find(p => p.number === item.dorsal);
      return (playerObj && playerObj.isActive) || item.minutes > 0 || item.goals > 0 || item.shots > 0;
    })
    .sort((a, b) => b.goals - a.goals || b.minutes - a.minutes);

  const scorersBody = sortedScorers.map(item => [
    `#${item.dorsal}`,
    item.name,
    item.position,
    item.matchesPlayed.toString(),
    formatTime(item.minutes),
    item.shots.toString(),
    item.goals.toString(),
    item.isGK ? `${item.saves} / -${item.conceded}` : '-',
    item.cards,
    item.accuracy
  ]);

  autoTable(doc, {
    startY: 52,
    head: [['Nº', 'Jugador/a', 'Posición', 'Part.', 'Tiempo', 'Tir', 'Gol', 'Par/Enc', 'Tarjetas', 'Efect.']],
    body: scorersBody,
    theme: 'striped',
    headStyles: { fillColor: [0, 65, 131], textColor: [255, 255, 255] },
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 8, halign: 'center' },
      1: { fontStyle: 'bold', cellWidth: 35 },
      2: { cellWidth: 18 },
      3: { halign: 'center', cellWidth: 10 },
      4: { halign: 'center', cellWidth: 15 },
      5: { halign: 'center', cellWidth: 10 },
      6: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
      7: { halign: 'center', cellWidth: 22 },
      8: { halign: 'center', cellWidth: 18 },
      9: { halign: 'center', cellWidth: 14 }
    },
    didParseCell: (data: any) => {
      const isPortero = sortedScorers[data.row.index]?.isGK;
      if (isPortero && data.section === 'body') {
        data.cell.styles.fillColor = [254, 243, 199];
        data.cell.styles.textColor = [146, 64, 14];
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  doc.save(`FS_Talavera_Reporte_Temporada_${seasonLabel.replace(/\s+/g, '_')}.pdf`);
};

// REPORT EXPORTS: 2. PLAYER COMPARISONS TO PDF
export const exportPlayerComparisonsToPDF = (selectedPlayers: Player[], matches: Match[]) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const logoBase64 = preloadedLogoBase64;
  drawPageHeader(doc, 'COMPARATIVA INDIVIDUAL DE JUGADORAS', 'Análisis Comparativo Directo', 1, 1, logoBase64);

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Comparativa de Rendimiento y Rendimiento Técnico', 15, 48);

  doc.setDrawColor(0, 65, 131);
  doc.setLineWidth(0.4);
  doc.line(15, 51, 195, 51);

  if (selectedPlayers.length === 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Por favor, selecciona al menos una jugadora en el panel para exportar el informe comparativo.', 15, 60);
    doc.save('FS_Talavera_Comparativa_Vacia.pdf');
    return;
  }

  // Row generation comparing metrics
  const headers = [['Métrica / Jugadora', ...selectedPlayers.map(p => `${p.name} (#${p.number})`)]];

  // Aggregate metrics for each player
  const fetchMetrics = (pId: string) => {
    let totSeconds = 0;
    let totShots = 0;
    let totGoals = 0;
    let totYellows = 0;
    let totRedCards = 0;
    let totSaves = 0;
    let totGoalsConceded = 0;
    let matchesPlayed = 0;

    matches.forEach(m => {
      const perf = m.stats[pId];
      if (perf) {
        if (perf.secondsPlayed > 0) {
          matchesPlayed++;
        }
        totSeconds += perf.secondsPlayed || 0;
        totShots += perf.shots || 0;
        totGoals += perf.goals || 0;
        totYellows += perf.yellows || 0;
        if (perf.redCard) {
          totRedCards++;
        }
        totSaves += perf.saves || 0;
        totGoalsConceded += perf.goalsConceded || 0;
      }
    });

    return {
      totSeconds,
      totShots,
      totGoals,
      totYellows,
      totRedCards,
      totSaves,
      totGoalsConceded,
      matchesPlayed
    };
  };

  const playersMetrics = selectedPlayers.map(p => ({
    player: p,
    m: fetchMetrics(p.id)
  }));

  const compData = [
    [
      'Posición',
      ...playersMetrics.map(pm => getPlayerPositionLabel(pm.player.position, pm.player.gender))
    ],
    [
      'Partidos Participados',
      ...playersMetrics.map(pm => pm.m.matchesPlayed.toString())
    ],
    [
      'Tiempo Total Jugado (MM:SS)',
      ...playersMetrics.map(pm => formatTime(pm.m.totSeconds))
    ],
    [
      'Promedio Minutos por Partido',
      ...playersMetrics.map(pm => {
        if (pm.m.matchesPlayed === 0) return '00:00';
        return formatTime(Math.floor(pm.m.totSeconds / pm.m.matchesPlayed));
      })
    ],
    [
      'Goles Totales',
      ...playersMetrics.map(pm => pm.m.totGoals.toString())
    ],
    [
      'Tiros Totales',
      ...playersMetrics.map(pm => pm.m.totShots.toString())
    ],
    [
      'Efectividad de Tiro %',
      ...playersMetrics.map(pm => {
        if (pm.m.totShots === 0) return '0%';
        return `${((pm.m.totGoals / pm.m.totShots) * 100).toFixed(1)}%`;
      })
    ],
    [
      'Goles / Partido',
      ...playersMetrics.map(pm => {
        if (pm.m.matchesPlayed === 0) return '0';
        return (pm.m.totGoals / pm.m.matchesPlayed).toFixed(2);
      })
    ],
    [
      'Paradas de Portero/a (Saves)',
      ...playersMetrics.map(pm => {
        return pm.player.position === 'Portero/a' ? pm.m.totSaves.toString() : '-';
      })
    ],
    [
      'Goles Encajados',
      ...playersMetrics.map(pm => {
        return pm.player.position === 'Portero/a' ? pm.m.totGoalsConceded.toString() : '-';
      })
    ],
    [
      'Tarjetas Amarillas Acumuladas',
      ...playersMetrics.map(pm => pm.m.totYellows.toString())
    ],
    [
      'Tarjetas Rojas',
      ...playersMetrics.map(pm => pm.m.totRedCards.toString())
    ]
  ];

  autoTable(doc, {
    startY: 58,
    head: headers,
    body: compData,
    theme: 'striped',
    headStyles: {
      fillColor: [0, 65, 131],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 9,
      cellPadding: 3
    }
  });

  doc.save(`FS_Talavera_Comparativa_Jugadoras.pdf`);
};

// --- TECHNICAL DOSSIER FOR REPRESENTED PLAYERS (INDIVIDUAL & BULK SQUAD CARD EXPORT) ---
const calculateAge = (birthDateStr: string): string => {
  if (!birthDateStr) return 'N/D';
  try {
    const birth = new Date(birthDateStr);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    return isNaN(age) ? 'N/D' : `${age} años`;
  } catch (e) {
    return 'N/D';
  }
};

const formatToSpanishDate = (dateStr: string): string => {
  if (!dateStr) return 'N/D';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
};

export const exportPlayerDossierToPDF = (playersToExport: Player[], matches: Match[], singleFileName?: string) => {
  if (playersToExport.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const logoBase64 = preloadedLogoBase64;
  const totalPages = playersToExport.length;

  playersToExport.forEach((p, idx) => {
    if (idx > 0) {
      doc.addPage();
    }

    // 1. HEADER (Club Logo/Shield & Banner)
    const titleStr = 'FICHA TÉCNICA DE JUGADORA';
    const subtitleStr = `${p.alias || p.name} • Dorsal #${p.number}`;
    drawPageHeader(doc, titleStr, subtitleStr, idx + 1, totalPages, logoBase64);

    // 2. PROFILE PHOTO PORTRAIT
    let photoRendered = false;
    if (p.photo) {
      try {
        let format: 'JPEG' | 'PNG' = 'JPEG';
        if (p.photo.includes('image/png')) format = 'PNG';
        // Base structure & outline for high resolution
        doc.setDrawColor(0, 65, 131);
        doc.setLineWidth(0.6);
        doc.roundedRect(14.8, 42.8, 34.4, 34.4, 1.5, 1.5, 'S');
        doc.addImage(p.photo, format, 15, 43, 34, 34);
        photoRendered = true;
      } catch (err) {
        console.warn('Error drawing player base64 in PDF:', err);
      }
    }

    if (!photoRendered) {
      // Stand-in beautiful background silhouette box
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.roundedRect(15, 43, 34, 34, 1.5, 1.5, 'FD');
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      const initials = (p.alias || p.name).substring(0, 2).toUpperCase();
      doc.text(initials, 32, 63, { align: 'center' });
    }

    // 3. COMPLETE BIO INFORMATION CARD
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.roundedRect(53, 43, 142, 34, 2, 2, 'FD');

    doc.setTextColor(110, 110, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('DATOS DE LA JUGADORA', 57, 48);

    doc.setTextColor(0, 41, 131);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(p.name, 57, 54.5);

    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8.2);

    // Grid Left Column
    doc.setFont('helvetica', 'bold');
    doc.text('Nombre Dep.:', 57, 61);
    doc.setFont('helvetica', 'normal');
    doc.text(p.alias || p.name, 78, 61);

    doc.setFont('helvetica', 'bold');
    doc.text('Posición:', 57, 66);
    doc.setFont('helvetica', 'normal');
    const posLabel = getPlayerPositionLabel(p.position, p.gender);
    doc.text(posLabel, 78, 66);

    doc.setFont('helvetica', 'bold');
    doc.text('Dorsal:', 57, 71);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${p.number}`, 78, 71);

    // Grid Right Column (Offset to X=122)
    doc.setFont('helvetica', 'bold');
    doc.text('Nacimiento:', 122, 61);
    doc.setFont('helvetica', 'normal');
    const ageStr = calculateAge(p.birthDate);
    doc.text(`${formatToSpanishDate(p.birthDate)} (${ageStr})`, 141, 61);

    doc.setFont('helvetica', 'bold');
    doc.text('Pierna Dom.:', 122, 66);
    doc.setFont('helvetica', 'normal');
    doc.text(p.dominantLeg || 'Diestra', 141, 66);

    // 4. STATISTICAL PERFORMANCE COMPUTATION
    let totalSecondsPlayed = 0;
    let totalShots = 0;
    let totalGoals = 0;
    let totalYellows = 0;
    let totalRedCards = 0;
    let totalSaves = 0;
    let totalGoalsConceded = 0;
    let matchesPlayedCount = 0;

    matches.forEach(m => {
      const perf = m.stats[p.id];
      if (perf) {
        if (perf.secondsPlayed > 0) {
          matchesPlayedCount++;
        }
        totalSecondsPlayed += perf.secondsPlayed || 0;
        totalShots += perf.shots || 0;
        totalGoals += perf.goals || 0;
        totalYellows += perf.yellows || 0;
        if (perf.redCard) {
          totalRedCards++;
        }
        totalSaves += perf.saves || 0;
        totalGoalsConceded += perf.goalsConceded || 0;
      }
    });

    const isGK = p.position === 'Portero/a';
    const avgMinutes = matchesPlayedCount > 0 
      ? formatTime(Math.floor(totalSecondsPlayed / matchesPlayedCount))
      : '00:00';
    const shootingAccuracy = totalShots > 0 
      ? `${Math.round((totalGoals / totalShots) * 100)}%`
      : '0%';

    // Draw KPI Grid boxes to present summarized telemetry
    const kpiY = 82;
    const kpiW = 42.5;
    const kpiH = 15;
    const kpiGap = 3.5;

    // KPI 1: MATCH PARTICIPATION
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(15, kpiY, kpiW, kpiH, 1.5, 1.5, 'FD');
    doc.setTextColor(110, 110, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('PARTIDOS Y TIEMPO', 18, kpiY + 4);
    doc.setTextColor(0, 65, 131);
    doc.setFontSize(8.2);
    doc.text(`${matchesPlayedCount} Partidos`, 18, kpiY + 9);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Total T.: ${formatTime(totalSecondsPlayed)}`, 18, kpiY + 13.2);

    // KPI 2: GOALS AND EFFICIENCY
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15 + kpiW + kpiGap, kpiY, kpiW, kpiH, 1.5, 1.5, 'FD');
    doc.setTextColor(110, 110, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('GOLES Y EFECTIVIDAD', 15 + kpiW + kpiGap + 3, kpiY + 4);
    doc.setTextColor(16, 185, 129); // emerald
    doc.setFontSize(8.2);
    doc.text(`${totalGoals} Goles / ${totalShots} Tiros`, 15 + kpiW + kpiGap + 3, kpiY + 9);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Efect: ${shootingAccuracy}`, 15 + kpiW + kpiGap + 3, kpiY + 13.2);

    // KPI 3: GK SAVES OR DISCIPLINE
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15 + 2 * (kpiW + kpiGap), kpiY, kpiW, kpiH, 1.5, 1.5, 'FD');
    doc.setTextColor(110, 110, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    if (isGK) {
      doc.text('PARADAS Y ENCAJADOS', 15 + 2 * (kpiW + kpiGap) + 3, kpiY + 4);
      doc.setTextColor(217, 119, 6); // Amber
      doc.setFontSize(8.2);
      doc.text(`${totalSaves} Par. / -${totalGoalsConceded} Enc`, 15 + 2 * (kpiW + kpiGap) + 3, kpiY + 9);
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const denominator = totalSaves + totalGoalsConceded;
      const pct = denominator > 0 ? Math.round((totalSaves / denominator) * 100) : 0;
      doc.text(`Efectividad: ${pct}%`, 15 + 2 * (kpiW + kpiGap) + 3, kpiY + 13.2);
    } else {
      doc.text('TARJETAS ADVERTIDAS', 15 + 2 * (kpiW + kpiGap) + 3, kpiY + 4);
      doc.setTextColor(220, 38, 38); // Red
      doc.setFontSize(8.2);
      doc.text(`${totalYellows} Amarillas / ${totalRedCards} Rojas`, 15 + 2 * (kpiW + kpiGap) + 3, kpiY + 9);
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`Expulsiones directas: ${totalRedCards}`, 15 + 2 * (kpiW + kpiGap) + 3, kpiY + 13.2);
    }

    // KPI 4: MATCH AGGREGATIONS
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15 + 3 * (kpiW + kpiGap), kpiY, kpiW, kpiH, 1.5, 1.5, 'FD');
    doc.setTextColor(110, 110, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('MEDIAS ESTADÍSTICAS', 15 + 3 * (kpiW + kpiGap) + 3, kpiY + 4);
    doc.setTextColor(0, 65, 131);
    doc.setFontSize(8.2);
    const avgG = matchesPlayedCount > 0 ? (totalGoals / matchesPlayedCount).toFixed(2) : '0.00';
    doc.text(`${avgG} Goles / match`, 15 + 3 * (kpiW + kpiGap) + 3, kpiY + 9);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const avgS = matchesPlayedCount > 0 ? (totalShots / matchesPlayedCount).toFixed(2) : '0.00';
    doc.text(`${avgS} Tiros / match`, 15 + 3 * (kpiW + kpiGap) + 3, kpiY + 13.2);

    // 5. HISTORICAL PARTICIPATION LIST (TABLE)
    doc.setTextColor(0, 65, 131);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('HISTORIAL DE PARTIDOS PARTICIPADOS', 15, 103);

    doc.setDrawColor(0, 65, 131);
    doc.setLineWidth(0.4);
    doc.line(15, 104.5, 195, 104.5);

    const histHeaders = [[
      'Fecha',
      'Rival',
      'Competición',
      'Marcador',
      'Resultado',
      'Tiempo J.',
      'Goles',
      'Tiros',
      isGK ? 'Paradas / Enc' : 'Tarjetas'
    ]];

    const histBody: any[] = [];
    // Sort matches chronologically (newest first)
    const sortedMatches = [...matches].sort((a, b) => b.date.localeCompare(a.date));

    sortedMatches.forEach(m => {
      const perf = m.stats[p.id];
      if (perf && perf.secondsPlayed > 0) {
        const resLabel = m.result === 'W' ? 'Victoria' : m.result === 'D' ? 'Empate' : 'Derrota';
        const typeLabel = m.matchType === 'amistoso' ? 'Amistoso' : `Oficial J.${m.jornada}`;
        const keyStat = isGK 
          ? `${perf.saves || 0} / -${perf.goalsConceded || 0}`
          : `${perf.yellows || 0}A ${perf.redCard ? '+ 1R' : ''}`;

        histBody.push([
          formatToSpanishDate(m.date),
          m.rival,
          typeLabel,
          `${m.goalsFor} - ${m.goalsAgainst}`,
          resLabel,
          formatTime(perf.secondsPlayed),
          perf.goals.toString(),
          perf.shots.toString(),
          keyStat
        ]);
      }
    });

    if (histBody.length === 0) {
      histBody.push(['-', 'No se registra participación activa en partidos archivados.', '-', '-', '-', '-', '-', '-', '-']);
    }

    autoTable(doc, {
      startY: 106.5,
      head: histHeaders,
      body: histBody,
      theme: 'striped',
      headStyles: {
        fillColor: [0, 65, 131],
        textColor: [255, 255, 255],
        fontSize: 7.2,
        halign: 'center',
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 7,
        cellPadding: 1.6,
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { fontStyle: 'bold', halign: 'left', cellWidth: 32 },
        2: { cellWidth: 20 },
        3: { cellWidth: 14 },
        4: { cellWidth: 15, fontStyle: 'bold' },
        5: { cellWidth: 18 },
        6: { cellWidth: 10, fontStyle: 'bold' },
        7: { cellWidth: 10 },
        8: { cellWidth: 25 }
      },
      margin: { left: 15 },
      tableWidth: 180,
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index === 4) {
            if (data.cell.raw === 'Victoria') {
              data.cell.styles.textColor = [16, 185, 129]; // emerald
            } else if (data.cell.raw === 'Derrota') {
              data.cell.styles.textColor = [239, 68, 68]; // red
            } else {
              data.cell.styles.textColor = [107, 114, 128]; // slate
            }
          }
        }
      }
    });

    // 6. BOTTOM SYSTEM NOTES BOX
    const lastY = (doc as any).lastAutoTable?.finalY || 165;
    const nY = lastY + 6;
    if (nY < 250) {
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, nY, 180, 26, 2, 2, 'FD');

      doc.setTextColor(0, 65, 131);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.text('NOTAS Y RECOMENDACIÓN TÁCTICA COLECTIVA', 18, nY + 4.5);

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(18, nY + 10, 192, nY + 10);
      doc.line(18, nY + 16, 192, nY + 16);
      doc.line(18, nY + 22, 192, nY + 22);
    }
  });

  const finalFileName = singleFileName || (playersToExport.length === 1 
    ? `FS_Talavera_Ficha_${playersToExport[0].alias.replace(/\s+/g, '_') || 'Jugadora'}.pdf`
    : `FS_Talavera_Dossier_Plantilla.pdf`);

  doc.save(finalFileName);
};

