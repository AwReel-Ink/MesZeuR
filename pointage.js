// ===== MesZeuR — Pointage (bouton, raccourci de l'icône, tag NFC) =====
// © 2026 LEROY Aurélien - Tous droits réservés
//
// Règle : le pointage s'applique au contrat en cours le plus récent.
// Arrivée ou départ ? On compare l'heure au milieu de la journée (journée déjà saisie, sinon horaires habituels).
// Un oubli le matin ne transforme donc pas un départ à 18h25 en arrivée : l'arrivée est alors estimée.

const PUNCH_DOUBLE_SCAN_MS = 90 * 1000;     // deux scans à moins de 90 s : le second est ignoré
const PUNCH_ARRIVAL_DUP_MIN = 30;            // re-scan moins de 30 min après l'arrivée : pas un départ
const NFC_OK = 'NDEFReader' in window;
let lastPunch = null;        // dernier pointage, pour « Annuler » et « C'était un départ / une arrivée »
let nfcReader = null;
let nfcIgnoreUntil = 0;

const nowHHMM = () => { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}`; };

function decidePunchKind(rec, time, hab) {
    if (rec && !rec.repos) {
        if (rec.debut && !rec.fin) return 'depart';
        if (!rec.debut && rec.fin) return 'arrivee';
    }
    const ref = rec && !rec.repos && rec.debut && rec.fin ? rec : hab;
    const d = timeToMinutes(ref.debut);
    let f = timeToMinutes(ref.fin);
    if (f <= d) f += 1440;
    return timeToMinutes(time) < (d + f) / 2 ? 'arrivee' : 'depart';
}

function applyPunch(before, kind, time, hab, emploi, date) {
    const rec = before && !before.repos
        ? { ...before, estime: { ...(before.estime || {}) } }
        : { ...(before ? { id: before.id } : {}), emploiId: emploi.id, date, repos: false, debut: '', fin: '', pause: hab.pause, estime: {} };
    let note = '';
    if (kind === 'arrivee') {
        rec.debut = time;
        rec.estime.debut = false;
    } else {
        rec.fin = time;
        rec.estime.fin = false;
        if (!rec.debut) {
            rec.debut = hab.debut;
            rec.estime.debut = true;
            note = `Arrivée non pointée : ${fmtHM(hab.debut)} supposée (horaire habituel). Touchez la journée dans l'agenda pour corriger.`;
        }
    }
    return { rec, note };
}

async function lastPointage() {
    const all = await getAllFromStore('pointages');
    return all.sort((a, b) => b.ts.localeCompare(a.ts))[0] || null;
}

// source : 'bouton' | 'nfc' ; opts : { date, time, emploi, kind, force }
async function pointer(source = 'bouton', opts = {}) {
    try {
        const date = opts.date || todayISO();
        const time = opts.time || nowHHMM();
        if (!opts.force) {
            const last = await lastPointage();
            if (last && Date.now() - new Date(last.ts).getTime() < PUNCH_DOUBLE_SCAN_MS) {
                showToast(`Déjà pointé à ${fmtHM(last.heure)} : scan ignoré`);
                return;
            }
        }
        const emplois = await getAllFromStore('emplois');
        if (!emplois.length) { showToast("Créez d'abord un emploi pour pouvoir pointer", 'error'); return; }

        const emploi = opts.emploi || emploiForDate(emplois, date);
        if (!emploi) {
            const fallback = [...emplois].sort(byRecentStart)[0];
            showModal('Aucun contrat en cours',
                `Aucun contrat ne couvre le ${formatDate(date)}. Pointer ${time.replace(':', 'h')} sur « ${fallback.poste} » quand même ?`,
                () => pointer(source, { ...opts, date, time, emploi: fallback, force: true }), null,
                { confirmLabel: 'Pointer', danger: false });
            return;
        }
        if (isMonthLocked(emploi, date)) {
            showToast(`${monthLabel(date.slice(0, 7))} est en saisie mensuelle : pointage impossible`, 'error');
            return;
        }

        const before = (await getDayRecord(emploi.id, date)) || null;
        const hab = await horaireFor(emploi, date);
        const kind = opts.kind || decidePunchKind(before, time, hab);
        if (!opts.kind && kind === 'depart' && before && !before.repos && before.debut && !before.fin) {
            const since = timeToMinutes(time) - timeToMinutes(before.debut);
            if (since >= 0 && since < PUNCH_ARRIVAL_DUP_MIN) {
                showToast(`Arrivée déjà pointée à ${fmtHM(before.debut)} (il y a ${since} min) : scan ignoré`);
                return;
            }
        }
        const { rec, note } = applyPunch(before, kind, time, hab, emploi, date);
        const recId = await saveDayRecord(rec);
        const logId = await addToStore('pointages', { ts: new Date().toISOString(), date, heure: time, emploiId: emploi.id, type: kind, source });
        lastPunch = { before, recId, logId, kind, emploi, date, time, source };

        if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(kind === 'arrivee' ? 150 : [90, 70, 90]);
        showPunchOverlay(kind, time, emploi, { ...rec, id: recId }, before, note);
        refreshAfterPunch();
    } catch (error) {
        showToast('Erreur lors du pointage', 'error');
        console.error(error);
    }
}

async function undoLastPunch() {
    const p = lastPunch;
    lastPunch = null;
    if (!p) return null;
    if (p.before) await updateInStore('heures', p.before);
    else if (p.recId) await deleteFromStore('heures', p.recId);
    if (p.logId) await deleteFromStore('pointages', p.logId);
    return p;
}

// ===== Confirmation =====
async function showPunchOverlay(kind, time, emploi, rec, before, note) {
    const entreprises = await getAllFromStore('entreprises');
    const ent = entreprises.find(e => e.id === emploi.entrepriseId);
    let title;
    if (kind === 'arrivee') title = before && before.debut && !before.repos ? `Arrivée corrigée : ${fmtHM(time)}` : `Arrivée ${fmtHM(time)}`;
    else title = before && before.fin && !before.repos ? `Départ modifié : ${fmtHM(before.fin)} → ${fmtHM(time)}` : `Départ ${fmtHM(time)}`;

    agEl('punch-icon').textContent = kind === 'arrivee' ? '→' : '←';
    agEl('punch-icon').className = `punch-icon ${kind}`;
    agEl('punch-title').textContent = title;
    let sub = `${emploi.poste}${ent ? ` · ${ent.nom}` : ''}`;
    if (rec.debut && rec.fin) sub += `\nJournée ${fmtHM(rec.debut)} → ${fmtHM(rec.fin)} · ${minutesToTime(netMinutes(rec, emploi))}`;
    agEl('punch-sub').textContent = sub;
    agEl('punch-note').textContent = note || '';
    agEl('punch-note').classList.toggle('hidden', !note);
    agEl('punch-swap').textContent = kind === 'arrivee' ? "C'était un départ" : "C'était une arrivée";
    agEl('punch-overlay').classList.remove('hidden');
}
function hidePunchOverlay() { agEl('punch-overlay').classList.add('hidden'); }

function refreshAfterPunch() {
    if (agEl('page-agenda').classList.contains('active')) agRender();
    else if (elements.pageHeures.classList.contains('active') && currentEmploi) renderWeekTable();
    if (elements.pageSettings.classList.contains('active')) renderPointagesList();
    pointageRefreshButton();
}

// Libellé du bouton : ce que ferait un pointage maintenant.
async function pointageRefreshButton() {
    const btn = agEl('btn-pointer');
    const label = agEl('btn-pointer-label');
    const sub = agEl('btn-pointer-sub');
    try {
        const date = todayISO();
        const emp = emploiForDate(await getAllFromStore('emplois'), date);
        if (!emp) {
            label.textContent = 'Pointer';
            sub.textContent = 'aucun contrat en cours';
            btn.classList.remove('depart');
            return;
        }
        const rec = await getDayRecord(emp.id, date);
        const kind = decidePunchKind(rec, nowHHMM(), await horaireFor(emp, date));
        label.textContent = kind === 'arrivee' ? "Pointer l'arrivée" : 'Pointer le départ';
        btn.classList.toggle('depart', kind === 'depart');
        if (rec && !rec.repos && rec.debut) {
            sub.textContent = `arrivée ${fmtHM(rec.debut)}${rec.estime && rec.estime.debut ? ' (estimée)' : ''}${rec.fin ? ` · départ ${fmtHM(rec.fin)}` : ''}`;
        } else {
            sub.textContent = emp.poste;
        }
    } catch (error) {
        console.error(error);
    }
}

// ===== Journal (Paramètres) =====
async function renderPointagesList() {
    const box = agEl('pointages-list');
    const [list, emplois] = await Promise.all([getAllFromStore('pointages'), getAllFromStore('emplois')]);
    list.sort((a, b) => b.ts.localeCompare(a.ts));
    if (!list.length) {
        box.innerHTML = '<p class="settings-description">Aucun pointage pour le moment.</p>';
        return;
    }
    box.innerHTML = list.slice(0, 15).map(p => {
        const emp = emplois.find(e => e.id === p.emploiId);
        const d = parseISO(p.date);
        return `<div class="pointage-item">
            <span class="pointage-type ${p.type}">${p.type === 'arrivee' ? 'Arrivée' : 'Départ'}</span>
            <span class="pointage-when">${JOURS_COURT[dayIndex(p.date)]} ${formatDateShort(d)} · ${fmtHM(p.heure)}</span>
            <span class="pointage-src">${p.source === 'nfc' ? 'NFC' : 'bouton'}${emp ? ` · ${escapeHtml(emp.poste)}` : ''}</span>
        </div>`;
    }).join('');
}

// ===== NFC (Chrome sur Android) =====
function tagUrl() {
    const u = new URL('./', location.href);
    u.search = 'action=pointer';
    return u.href;
}

function isPointerMessage(message) {
    return [...message.records].some(r => {
        if (r.recordType !== 'url' && r.recordType !== 'absolute-url') return false;
        try { return new TextDecoder().decode(r.data).includes('action=pointer'); } catch { return false; }
    });
}

// Lecture pendant que l'app est ouverte (sinon c'est Android qui ouvre l'adresse du tag).
async function startNfcScan(userGesture = false) {
    if (!NFC_OK || nfcReader) return;
    try {
        if (!userGesture) {
            const perm = await navigator.permissions.query({ name: 'nfc' });
            if (perm.state !== 'granted') return;
        }
        const reader = new NDEFReader();
        await reader.scan();
        reader.onreading = e => {
            if (Date.now() < nfcIgnoreUntil) return;
            if (isPointerMessage(e.message)) { hidePunchOverlay(); pointer('nfc'); }
        };
        reader.onreadingerror = () => {};
        nfcReader = reader;
    } catch (error) {
        console.warn('Lecture NFC indisponible :', error);
    }
}

async function programTag() {
    if (!NFC_OK) {
        showToast('Programmation possible uniquement dans Chrome sur Android', 'error');
        return;
    }
    const ctrl = new AbortController();
    const url = tagUrl();
    nfcIgnoreUntil = Infinity;   // le tag qu'on écrit ne doit pas déclencher de pointage
    openSheet(`<h3 class="sheet-title">Programmer un tag NFC</h3>
        <div class="nfc-anim" aria-hidden="true"><span></span></div>
        <p class="sheet-sub">Posez le tag vierge contre le dos du téléphone et ne bougez plus jusqu'à la confirmation.</p>
        <p class="field-hint">Adresse écrite sur le tag : <code>${escapeHtml(url)}</code></p>
        <div class="sheet-actions"><button type="button" class="btn-secondary" data-cmd="cancel">Annuler</button></div>`, {
        click: e => { if (e.target.closest('[data-cmd="cancel"]')) closeSheet(); },
        close: () => ctrl.abort()
    });
    try {
        await new NDEFReader().write({ records: [{ recordType: 'url', data: url }] }, { signal: ctrl.signal, overwrite: true });
        nfcIgnoreUntil = Date.now() + 5000;
        sheetOnClose = null;
        closeSheet();
        if (navigator.vibrate) navigator.vibrate(150);
        showToast('Tag programmé ✓ Scannez-le pour pointer', 'success');
        startNfcScan(true);
    } catch (error) {
        nfcIgnoreUntil = Date.now() + 1000;
        if (error.name === 'AbortError') return;
        sheetOnClose = null;
        closeSheet();
        showToast(`Écriture impossible : ${error.message}`, 'error');
        console.error(error);
    }
}

// ===== Événements =====
function initPointage() {
    agEl('btn-pointer').addEventListener('click', () => pointer('bouton'));
    agEl('punch-ok').addEventListener('click', hidePunchOverlay);
    agEl('punch-undo').addEventListener('click', async () => {
        hidePunchOverlay();
        if (await undoLastPunch()) { showToast('Pointage annulé'); refreshAfterPunch(); }
    });
    agEl('punch-swap').addEventListener('click', async () => {
        hidePunchOverlay();
        const p = await undoLastPunch();
        if (p) await pointer(p.source, { date: p.date, time: p.time, emploi: p.emploi, kind: p.kind === 'arrivee' ? 'depart' : 'arrivee', force: true });
    });
    agEl('punch-overlay').addEventListener('click', e => { if (e.target === agEl('punch-overlay')) hidePunchOverlay(); });

    agEl('btn-program-tag').addEventListener('click', programTag);
    agEl('btn-program-tag').disabled = !NFC_OK;
    agEl('nfc-status').textContent = NFC_OK
        ? "Ce téléphone sait programmer et lire les tags. Scannez le tag écran déverrouillé : l'app s'ouvre et pointe toute seule."
        : "Le NFC n'est disponible que dans Chrome sur Android. Le bouton « Pointer » de l'agenda et le raccourci de l'icône (appui long) fonctionnent partout.";
}
