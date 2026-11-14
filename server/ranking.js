/**
 * Calcul des classements « par salle ».
 *
 * Dans QCM App, une salle correspond à la classe de l'étudiant : sa filière et
 * son niveau (ex. « Informatique · L1 »). Les copies sont regroupées par
 * épreuve + session (launchTime) + salle, puis classées par note décroissante.
 */

function noteOf(row) {
  const total = Number(row.total) || 0;
  if (!total) return 0;
  return (Number(row.score) || 0) / total;
}

function identityOf(row) {
  return String(row.email || row.name || row.id || '').trim().toLowerCase();
}

function isSameStudent(row, viewer) {
  if (!viewer) return false;
  const email = String(viewer.email || '').trim().toLowerCase();
  const name = String(viewer.name || '').trim();
  const rowEmail = String(row.email || '').trim().toLowerCase();
  const rowName = String(row.name || '').trim();
  return (email && rowEmail === email) || (name && rowName === name);
}

/**
 * Construit les groupes de classement à partir des lignes `results`.
 *
 * @param {Array} rows          Lignes de la table results
 * @param {object} [viewer]     Étudiant courant (pour marquer sa ligne)
 * @returns {{ groups: Array }}
 */
export function buildRankingGroups(rows, viewer = null) {
  const groups = new Map();

  (rows || []).forEach((row) => {
    const filiere = String(row.filiere || 'Non renseignée').trim();
    const niveau = String(row.niveau || 'Non renseigné').trim();
    const sessionTimestamp = Number(row.sessionTimestamp) || 0;
    const ue = String(row.ue || '-');
    const key = `${ue}|${sessionTimestamp}|${filiere}|${niveau}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        ue,
        sessionTimestamp,
        filiere,
        niveau,
        salle: `${filiere} · ${niveau}`,
        date: row.date || null,
        _students: new Map()
      });
    }

    const group = groups.get(key);
    if (row.date && (!group.date || String(row.date) > String(group.date))) {
      group.date = row.date;
    }

    // Un étudiant peut avoir plusieurs tentatives (régulier + rattrapage) :
    // on conserve sa meilleure note pour le classement.
    const identity = identityOf(row);
    if (!identity) return;
    const note = noteOf(row);
    const existing = group._students.get(identity);
    const candidate = {
      name: row.name || 'Étudiant',
      score: Number(row.score) || 0,
      total: Number(row.total) || 0,
      note,
      isMakeup: !!row.isMakeup,
      date: row.date || null,
      isMe: isSameStudent(row, viewer)
    };

    if (!existing) {
      group._students.set(identity, { ...candidate, attempts: 1 });
      return;
    }

    const attempts = existing.attempts + 1;
    const better =
      candidate.note > existing.note ||
      (candidate.note === existing.note && candidate.score > existing.score) ||
      (candidate.note === existing.note &&
        candidate.score === existing.score &&
        String(candidate.date || '') > String(existing.date || ''));

    group._students.set(identity, better ? { ...candidate, attempts } : { ...existing, attempts });
  });

  const result = [...groups.values()]
    .map((group) => {
      const participants = [...group._students.values()]
        .sort((a, b) => b.note - a.note || b.score - a.score || a.name.localeCompare(b.name, 'fr'))
        .map((p, index) => ({
          rank: index + 1,
          name: p.name,
          score: p.score,
          total: p.total,
          note: Number((p.note * 20).toFixed(2)),
          isMakeup: p.isMakeup,
          attempts: p.attempts,
          isMe: p.isMe
        }));

      const sum = participants.reduce((acc, p) => acc + p.note, 0);
      return {
        key: group.key,
        ue: group.ue,
        sessionTimestamp: group.sessionTimestamp,
        filiere: group.filiere,
        niveau: group.niveau,
        salle: group.salle,
        date: group.date,
        count: participants.length,
        averageNote: participants.length ? Number((sum / participants.length).toFixed(2)) : 0,
        bestNote: participants.length ? Math.max(...participants.map((p) => p.note)) : 0,
        participants
      };
    })
    .sort(
      (a, b) =>
        (b.sessionTimestamp || 0) - (a.sessionTimestamp || 0) ||
        String(b.date || '').localeCompare(String(a.date || '')) ||
        a.ue.localeCompare(b.ue, 'fr')
    );

  return { groups: result };
}
