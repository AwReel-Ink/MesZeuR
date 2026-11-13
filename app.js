// ===== MesZeuR Application =====
// © 2026 LEROY Aurélien - Tous droits réservés

const APP_VERSION = '1.7.1';
const DB_NAME = 'MesZeuRDB';
const DB_VERSION = 3;   // v2 : journal des pointages ; v3 : identifiants texte + updatedAt (serveur maison)
const DEFAULT_PAUSE = '00:30';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JOURS_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const NS = {
    office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
};

// ===== État =====
let db = null;
let currentEntreprise = null;
let currentEmploi = null;
let currentWeekStart = null;
let currentMonthKey = null;       // mois visé par la saisie manuelle (AAAA-MM)
let heuresCache = new Map();      // date -> enregistrement, pour l'emploi courant
let renderToken = 0;
let modalConfirmCallback = null;
let modalCancelCallback = null;
let toastTimeout = null;
let emploiFormContext = { from: 'classic', date: null };   // d'où vient le formulaire emploi (tableau ou agenda)

// ===== Éléments du DOM (id "mon-id" -> elements.monId) =====
const elements = {};
[
    'btn-back', 'btn-settings', 'page-title',
    'page-home', 'page-entreprises', 'page-form-entreprise', 'page-emplois', 'page-form-emploi', 'page-heures', 'page-settings',
    'btn-travail',
    'btn-add-entreprise', 'liste-entreprises',
    'form-entreprise', 'form-entreprise-title', 'entreprise-id', 'entreprise-nom', 'entreprise-adresse', 'btn-cancel-entreprise',
    'emplois-entreprise-nom', 'emplois-entreprise-adresse', 'btn-edit-entreprise', 'btn-delete-entreprise', 'btn-add-emploi', 'liste-emplois',
    'form-emploi', 'form-emploi-title', 'emploi-id', 'emploi-entreprise-id', 'emploi-poste', 'emploi-date-debut', 'emploi-cdd',
    'group-date-fin', 'emploi-date-fin', 'emploi-trajet', 'emploi-pause-remuneree', 'emploi-pause-heures', 'emploi-pause-minutes', 'btn-cancel-emploi',
    'group-emploi-entreprise', 'emploi-entreprise-select', 'group-new-entreprise', 'emploi-new-entreprise-nom', 'emploi-new-entreprise-adresse',
    'horaires-grid', 'btn-copy-lundi', 'postes-list',
    'heures-emploi-poste', 'heures-emploi-contrat', 'btn-edit-emploi', 'btn-delete-emploi',
    'btn-prev-week', 'btn-next-week', 'week-label', 'week-picker-modal', 'week-date-picker', 'week-picker-ok',
    'heures-table', 'row-dates', 'row-repos', 'row-jours', 'row-pause', 'row-debut', 'row-fin', 'row-total-jour', 'total-semaine',
    'heures-manuelles-check', 'heures-manuelles-input', 'heures-manuelles-mois-label', 'heures-manuelles-mois-select',
    'heures-manuelles-value', 'btn-save-heures-manuelles',
    'total-mois', 'total-annee', 'temps-reel', 'temps-reel-trajet', 'cumul-total-emploi', 'btn-save-heures',
    'btn-export-all', 'input-import', 'bilan-toggle', 'bilan-emplois-list', 'bilan-total-heures', 'bilan-total-duree', 'app-version',
    'modal-confirm', 'modal-title', 'modal-message', 'modal-cancel', 'modal-confirm-btn', 'toast',
    'page-agenda', 'affichage-tableau', 'affichage-agenda'
].forEach(id => {
    elements[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
});

// ===== Utilitaires dates / temps =====
const pad = n => String(n).padStart(2, '0');

function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function formatDateISO(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}
function formatDateFull(date) { return formatDate(formatDateISO(date)); }
function formatDateShort(date) { return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`; }
function todayISO() { return formatDateISO(new Date()); }
function monthKeyOf(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`; }
function monthLabel(key) {
    const [y, m] = key.split('-');
    return `${MOIS[Number(m) - 1]} ${y}`;
}
function addDays(date, days) {
    const r = new Date(date);
    r.setDate(r.getDate() + days);
    return r;
}
function getMonday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d;
}
function timeToMinutes(str) {
    if (!str) return 0;
    const [h, m] = str.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
function minutesToTime(min) {
    min = Math.max(0, Math.round(min));
    return `${Math.floor(min / 60)}H${pad(min % 60)}`;
}
function decimalHoursToMinutes(h) {
    const v = parseFloat(h);
    return isNaN(v) ? 0 : Math.round(v * 60);
}
function parseDecimal(str) {
    return parseFloat(String(str).replace(',', '.').replace(/[^\d.\-]/g, ''));
}
function round2(n) { return Math.round(n * 100) / 100; }

// ===== Calcul d'une journée =====
// Durée brute entre début et fin (une fin avant le début = travail de nuit, fin le lendemain).
function grossMinutes(h) {
    if (!h || h.repos || !h.debut || !h.fin) return 0;
    const d = timeToMinutes(h.debut);
    let f = timeToMinutes(h.fin);
    if (f < d) f += 1440;
    return f - d;
}
// Durée comptée : on retire la pause sauf si elle est rémunérée.
function netMinutes(h, emploi) {
    const g = grossMinutes(h);
    if (g <= 0) return 0;
    return emploi.pauseRemuneree ? g : Math.max(0, g - timeToMinutes(h.pause));
}
// Minutes par mois (AAAA-MM) : un mois en saisie manuelle ignore les jours détaillés.
function computePerMonth(emploi, heuresMap, overrides, lockedSet) {
    const manual = emploi.heuresManuelles || {};
    const locked = lockedSet || new Set(Object.keys(manual));
    const per = {};
    Object.entries(manual).forEach(([k, v]) => { per[k] = decimalHoursToMinutes(v); });
    const add = rec => {
        const mk = rec.date.slice(0, 7);
        if (locked.has(mk)) return;
        per[mk] = (per[mk] || 0) + netMinutes(rec, emploi);
    };
    heuresMap.forEach((rec, date) => { if (!overrides || !overrides[date]) add(rec); });
    if (overrides) Object.values(overrides).forEach(add);
    return per;
}

// ===== IndexedDB =====
// v3 : identifiants texte (UUID ; heures = `${emploiId}_${date}`) et updatedAt, pour la synchro « Serveur maison ».
const DATA_STORES = ['entreprises', 'emplois', 'heures', 'pointages'];
let migrationRapport = null;      // résultat de la migration v2 → v3 (affiché une fois)
let modeSecours = false;          // migration impossible : base ancienne ouverte, écritures bloquées

const newId = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
const heureId = (emploiId, date) => `${emploiId}_${date}`;

// Crée les 4 stores de données (sans autoIncrement) avec les mêmes index qu'avant.
function createDataStores(database) {
    const e = database.createObjectStore('entreprises', { keyPath: 'id' });
    e.createIndex('nom', 'nom', { unique: false });
    e.createIndex('lastActivity', 'lastActivity', { unique: false });
    const m = database.createObjectStore('emplois', { keyPath: 'id' });
    m.createIndex('entrepriseId', 'entrepriseId', { unique: false });
    m.createIndex('lastModified', 'lastModified', { unique: false });
    const h = database.createObjectStore('heures', { keyPath: 'id' });
    h.createIndex('emploiId', 'emploiId', { unique: false });
    h.createIndex('date', 'date', { unique: false });
    h.createIndex('emploiId_date', ['emploiId', 'date'], { unique: true });
    const p = database.createObjectStore('pointages', { keyPath: 'id' });
    p.createIndex('ts', 'ts', { unique: false });
    // Copie brute de l'ancienne base, conservée en secours (non synchronisée)
    if (!database.objectStoreNames.contains('secours')) database.createObjectStore('secours', { keyPath: 'cle' });
}

const reqP = r => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
});

// Migration unique des numéros auto-incrémentés vers des identifiants texte.
// Tout se passe dans la transaction de mise à jour : si une vérification échoue, tx.abort()
// annule TOUT (la base reste en version 1/2, avec ses données d'origine, intactes).
async function migrerVersV3(database, tx) {
    const now = Date.now();
    const anciens = DATA_STORES.filter(n => database.objectStoreNames.contains(n));
    anciens.forEach(n => { tx.objectStore(n).name = `ancien_${n}`; });   // on met l'ancien contenu de côté
    createDataStores(database);

    const lire = n => anciens.includes(n) ? reqP(tx.objectStore(`ancien_${n}`).getAll()) : Promise.resolve([]);
    const v2 = {
        entreprises: await lire('entreprises'),
        emplois: await lire('emplois'),
        heures: await lire('heures'),
        pointages: await lire('pointages')
    };
    // Copie de secours de l'ancienne base, telle quelle
    tx.objectStore('secours').put({ cle: 'base_avant_v3', date: new Date(now).toISOString(), data: v2 });

    const mapEnt = new Map(), mapEmp = new Map();
    const orphelins = [];
    const ref = (map, ancien, quoi) => {
        if (ancien === undefined || ancien === null) return ancien;
        if (map.has(ancien)) return map.get(ancien);
        orphelins.push(`${quoi} ${ancien}`);           // référence déjà cassée avant la migration
        return `ancien-${ancien}`;
    };

    const nouv = { entreprises: [], emplois: [], heures: [], pointages: [] };
    v2.entreprises.forEach(r => { const id = newId(); mapEnt.set(r.id, id); nouv.entreprises.push({ ...r, id, ancienId: r.id, updatedAt: now }); });
    v2.emplois.forEach(r => { const id = newId(); mapEmp.set(r.id, id); nouv.emplois.push({ ...r, id, ancienId: r.id, entrepriseId: ref(mapEnt, r.entrepriseId, 'entreprise'), updatedAt: now }); });
    v2.heures.forEach(r => {
        const emploiId = ref(mapEmp, r.emploiId, 'emploi');
        nouv.heures.push({ ...r, id: heureId(emploiId, r.date), ancienId: r.id, emploiId, updatedAt: now });
    });
    v2.pointages.forEach(r => nouv.pointages.push({ ...r, id: newId(), ancienId: r.id, emploiId: ref(mapEmp, r.emploiId, 'emploi'), updatedAt: now }));

    for (const n of DATA_STORES) {
        const st = tx.objectStore(n);
        for (const r of nouv[n]) await reqP(st.put(r));
    }

    // ----- Vérification complète avant de supprimer l'ancien contenu -----
    const erreurs = [];
    for (const n of DATA_STORES) {
        const compte = await reqP(tx.objectStore(n).count());
        if (compte !== v2[n].length) erreurs.push(`${n} : ${compte} au lieu de ${v2[n].length}`);
    }
    const lus = {};
    for (const n of DATA_STORES) lus[n] = await reqP(tx.objectStore(n).getAll());
    // Toute référence valide avant la migration doit pointer vers le BON nouvel enregistrement.
    const entParAncien = new Map(lus.entreprises.map(r => [r.ancienId, r.id]));
    const empParAncien = new Map(lus.emplois.map(r => [r.ancienId, r.id]));
    const verifRef = (quoi, ancienCible, nouvelleRef, parAncien) => {
        if (!parAncien.has(ancienCible)) return;                       // déjà cassée avant : conservée telle quelle
        if (parAncien.get(ancienCible) !== nouvelleRef) erreurs.push(`${quoi} : référence incorrecte`);
    };
    const emploiV2 = new Map(v2.emplois.map(r => [r.id, r]));
    const heureV2 = new Map(v2.heures.map(r => [r.id, r]));
    const pointV2 = new Map(v2.pointages.map(r => [r.id, r]));
    lus.emplois.forEach(r => verifRef(`emploi ${r.ancienId}`, emploiV2.get(r.ancienId)?.entrepriseId, r.entrepriseId, entParAncien));
    lus.heures.forEach(r => {
        verifRef(`journée ${r.ancienId}`, heureV2.get(r.ancienId)?.emploiId, r.emploiId, empParAncien);
        if (r.id !== heureId(r.emploiId, r.date)) erreurs.push(`journée ${r.ancienId} : identifiant incorrect`);
    });
    lus.pointages.forEach(r => verifRef(`pointage ${r.ancienId}`, pointV2.get(r.ancienId)?.emploiId, r.emploiId, empParAncien));
    // chaque ancien enregistrement est retrouvé une seule fois, avec son contenu
    for (const n of DATA_STORES) {
        const parAncien = new Map(lus[n].map(r => [r.ancienId, r]));
        if (parAncien.size !== v2[n].length) erreurs.push(`${n} : anciens numéros en double ou manquants`);
        v2[n].forEach(old => {
            const r = parAncien.get(old.id);
            if (!r) { erreurs.push(`${n} ${old.id} : non retrouvé`); return; }
            for (const k of Object.keys(old)) {
                if (['id', 'entrepriseId', 'emploiId'].includes(k)) continue;
                if (JSON.stringify(old[k]) !== JSON.stringify(r[k])) erreurs.push(`${n} ${old.id} : champ ${k} différent`);
            }
        });
    }
    if (erreurs.length) throw new Error('Vérification de la migration échouée : ' + erreurs.slice(0, 5).join(' ; '));

    anciens.forEach(n => database.deleteObjectStore(`ancien_${n}`));   // vérifié : on peut retirer l'ancien contenu
    migrationRapport = {
        entreprises: v2.entreprises.length, emplois: v2.emplois.length,
        heures: v2.heures.length, pointages: v2.pointages.length, orphelins
    };
}

function initDB() {
    return new Promise((resolve, reject) => {
        let migrationErreur = null;
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(migrationErreur || request.error);
        request.onsuccess = () => {
            db = request.result;
            // Une autre fenêtre ouvre une version plus récente : on libère la base.
            db.onversionchange = () => { db.close(); showToast('Nouvelle version de MesZeuR : rechargez la page', 'error'); };
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const database = request.result;
            const tx = request.transaction;
            if (event.oldVersion === 0) { createDataStores(database); return; }
            if (event.oldVersion < 3) {
                migrerVersV3(database, tx).catch(err => {
                    migrationErreur = err;
                    migrationErreur.migration = true;
                    console.error('[MesZeuR] migration annulée, données intactes :', err);
                    try { tx.abort(); } catch (_) { /* déjà terminée */ }
                });
            }
        };
        request.onblocked = () => showToast("Fermez les autres fenêtres de MesZeuR pour terminer la mise à jour", 'error');
    });
}

// Ouverture de secours (après une migration annulée) : base dans sa version actuelle, en lecture.
function openDBSecours() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onsuccess = () => { db = request.result; resolve(db); };
        request.onerror = () => reject(request.error);
    });
}

// La promesse se résout quand la transaction est réellement terminée (donnée écrite).
function dbRun(storeName, mode, fn) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = fn(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error || req.error);
        tx.onabort = () => reject(tx.error || req.error);
    });
}
const getAllFromStore = s => dbRun(s, 'readonly', st => st.getAll());
const getByKey = (s, k) => dbRun(s, 'readonly', st => st.get(k));
const getByIndex = (s, idx, v) => dbRun(s, 'readonly', st => st.index(idx).getAll(v));

// ----- Écritures : TOUTES passent par ces fonctions (sauf « appliquer » de la synchro) -----
// Pour les stores de données : id créé s'il manque, updatedAt posé, écriture avec put,
// puis la modification est confiée à SyncMaison (envoi au serveur maison quand il est joignable).
function preparer(store, data, opts = {}) {
    if (modeSecours) throw new Error('Mode secours : modifications désactivées');
    if (!DATA_STORES.includes(store)) return data;
    if (store === 'heures') {
        const attendu = heureId(data.emploiId, data.date);
        if (!data.id) data.id = attendu;
        else if (data.id !== attendu) throw new Error(`Identifiant de journée incohérent : ${data.id}`);
    } else if (data.id === undefined || data.id === null || data.id === '') {
        data.id = newId();
    }
    data.updatedAt = opts.updatedAt !== undefined ? opts.updatedAt : Date.now();
    return data;
}
function copieSure(rec) {
    try { return structuredClone(rec); } catch (_) { return JSON.parse(JSON.stringify(rec)); }
}
function syncModifie(store, rec) {
    if (!DATA_STORES.includes(store) || !window.SyncMaison) return;
    try { Promise.resolve(SyncMaison.modifie(store, copieSure(rec))).catch(err => console.error('[SyncMaison] modifie', err)); }
    catch (err) { console.error('[SyncMaison] modifie', err); }
}
function syncSupprime(store, id) {
    if (!DATA_STORES.includes(store) || !window.SyncMaison) return;
    try { Promise.resolve(SyncMaison.supprime(store, id)).catch(err => console.error('[SyncMaison] supprime', err)); }
    catch (err) { console.error('[SyncMaison] supprime', err); }
}

// Renvoie l'id (le code s'en sert, comme avant).
async function addToStore(store, data, opts) {
    preparer(store, data, opts);
    await dbRun(store, 'readwrite', st => st.put(data));
    syncModifie(store, data);
    return data.id;
}
const updateInStore = addToStore;   // même règle : put + updatedAt + synchro

async function deleteFromStore(store, id) {
    if (modeSecours) throw new Error('Mode secours : modifications désactivées');
    await dbRun(store, 'readwrite', st => st.delete(id));
    syncSupprime(store, id);
}

async function bulkPut(store, items, opts) {
    items.forEach(i => preparer(store, i, opts));
    await new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const st = tx.objectStore(store);
        items.forEach(i => st.put(i));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
    items.forEach(i => syncModifie(store, i));
}

// Écrit (ou supprime si vide) une journée. Partagé par l'agenda, le tableau et le pointage.
async function saveDayRecord(rec) {
    const data = { ...rec, id: heureId(rec.emploiId, rec.date) };
    if (!data.repos && !data.debut && !data.fin) {
        if (await getByKey('heures', data.id)) await deleteFromStore('heures', data.id);
        return null;
    }
    if (data.estime && !Object.values(data.estime).some(Boolean)) delete data.estime;
    return addToStore('heures', data);
}
// Appareil relié au serveur maison (adresse + compte) ?
function syncConnectee() {
    try {
        const r = window.SyncMaison && SyncMaison.instance && SyncMaison.instance.reglages;
        return !!(r && r.serveur() && r.jeton());
    } catch (_) { return false; }
}
const getDayRecord = (emploiId, date) => getByKey('heures', heureId(emploiId, date));
const getHeuresBetween = (from, to) => dbRun('heures', 'readonly', st => st.index('date').getAll(IDBKeyRange.bound(from, to)));

// ===== Horaires habituels (un par jour, lundi = 0) =====
function emptyHoraires() {
    return JOURS_FULL.map(() => ({ travaille: false, debut: '', fin: '', pause: '' }));
}
// Déduit les horaires les plus fréquents de l'historique d'un emploi (emplois créés avant la v1.6).
function deriveHoraires(heures, emploi) {
    const res = emptyHoraires();
    let found = false;
    const mode = arr => {
        const c = {};
        arr.forEach(v => { c[v] = (c[v] || 0) + 1; });
        return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
    };
    for (let i = 0; i < 7; i++) {
        const days = heures.filter(h => !h.repos && h.debut && h.fin && (parseISO(h.date).getDay() + 6) % 7 === i);
        if (!days.length) continue;
        const [debut, fin] = mode(days.map(h => `${h.debut}|${h.fin}`)).split('|');
        res[i] = { travaille: true, debut, fin, pause: mode(days.map(h => h.pause || '00:00')) };
        found = true;
    }
    if (!found) return null;
    const ref = res.find(h => h.travaille);
    res.forEach(h => { if (!h.travaille) h.pause = ref.pause; });
    return res;
}
// Horaires habituels d'un emploi, par ordre de préférence :
// 1. ceux saisis dans l'emploi ; 2. son historique s'il est assez fourni (8 jours complets) ;
// 3. ceux saisis dans le contrat précédent (même entreprise d'abord) ; 4. l'historique récent cumulé.
const horairesUsable = hs => Array.isArray(hs) && hs.some(h => h.travaille && h.debut && h.fin);
const isCompleteDay = h => !h.repos && h.debut && h.fin;
async function inferHoraires(emploi) {
    if (emploi && horairesUsable(emploi.horaires)) return emploi.horaires;
    const own = emploi && emploi.id ? (await getByIndex('heures', 'emploiId', emploi.id)).filter(isCompleteDay) : [];
    if (own.length >= 8) return deriveHoraires(own, emploi);

    const others = (await getAllFromStore('emplois')).filter(e => !emploi || e.id !== emploi.id)
        .sort((a, b) => (b.dateDebut || '').localeCompare(a.dateDebut || ''));
    if (emploi) others.sort((a, b) => Number(b.entrepriseId === emploi.entrepriseId) - Number(a.entrepriseId === emploi.entrepriseId));
    const explicit = others.find(e => horairesUsable(e.horaires));
    if (explicit) return explicit.horaires;

    const pool = [...own];
    for (const e of others) {
        if (pool.length >= 60) break;
        const recs = (await getByIndex('heures', 'emploiId', e.id)).filter(isCompleteDay)
            .sort((a, b) => b.date.localeCompare(a.date));
        pool.push(...recs.slice(0, 60 - pool.length));
    }
    return pool.length ? deriveHoraires(pool, emploi) : null;
}

function emploiCovers(emploi, date) {
    return (!emploi.dateDebut || emploi.dateDebut <= date) && (emploi.cdi || !emploi.dateFin || emploi.dateFin >= date);
}
// Contrat en cours le plus récent à une date (par date de début).
function emploiForDate(emplois, date) {
    return emplois.filter(e => emploiCovers(e, date))
        .sort((a, b) => (b.dateDebut || '').localeCompare(a.dateDebut || ''))[0] || null;
}
function isMonthLocked(emploi, date) {
    return (emploi.heuresManuelles || {})[date.slice(0, 7)] !== undefined;
}

// ===== Préférences locales (affichage…) =====
function prefGet(key, def) { try { const v = localStorage.getItem(key); return v === null ? def : v; } catch { return def; } }
function prefSet(key, value) { try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ } }
function getDisplayMode() { return prefGet('meszeur-affichage', 'tableau') === 'agenda' ? 'agenda' : 'tableau'; }

// On relit la base avant d'écrire : la version en mémoire a pu être dépassée par la synchro.
async function touchActivity(majEmploi) {
    const now = new Date().toISOString();
    if (currentEmploi) {
        const fresh = (await getByKey('emplois', currentEmploi.id)) || currentEmploi;
        if (majEmploi) majEmploi(fresh);
        fresh.lastModified = now;
        await updateInStore('emplois', fresh);
        currentEmploi = fresh;
    }
    if (currentEntreprise) {
        const fresh = (await getByKey('entreprises', currentEntreprise.id)) || currentEntreprise;
        fresh.lastActivity = now;
        await updateInStore('entreprises', fresh);
        currentEntreprise = fresh;
    }
}

// ===== Navigation =====
function showPage(pageId, title = 'MesZeuR') {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    elements.pageTitle.textContent = title;
    elements.btnBack.classList.toggle('hidden', pageId === 'page-home' || pageId === 'page-agenda');
    elements.btnSettings.classList.toggle('hidden', pageId === 'page-settings');
    window.scrollTo(0, 0);
}

// Accueil : page d'accueil classique ou agenda, selon l'affichage choisi.
function goHome() {
    if (getDisplayMode() === 'agenda') return openAgenda();
    showPage('page-home');
}

function goToEntreprises() {
    showPage('page-entreprises', 'Mes Entreprises');
    return loadEntreprises();
}
function goToEmplois() {
    showPage('page-emplois', currentEntreprise.nom);
    return loadEmplois(currentEntreprise.id);
}

function navigateBack() {
    const active = document.querySelector('.page.active').id;
    switch (active) {
        case 'page-form-entreprise':
        case 'page-emplois': goToEntreprises(); break;
        case 'page-form-emploi':
            if (emploiFormContext.from === 'agenda') openAgenda();
            else goToEmplois();
            break;
        case 'page-heures': goToEmplois(); break;
        default: goHome();
    }
}

// ===== Rendu de listes =====
const ARROW_SVG = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';

function addListItem(container, { title, subtitle, badge, badgeClass, onClick }) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.innerHTML = `
        <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(title)}</div>
            <div class="list-item-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <span class="list-item-badge ${badgeClass}">${escapeHtml(badge)}</span>
        <span class="list-item-arrow">${ARROW_SVG}</span>`;
    item.addEventListener('click', onClick);
    item.addEventListener('keydown', e => { if (e.key === 'Enter') onClick(); });
    container.appendChild(item);
}

function renderEmptyState(container, line1, line2) {
    container.innerHTML = `
        <div class="empty-state">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg>
            <p>${line1}</p><p>${line2}</p>
        </div>`;
}

// ===== Entreprises =====
// Tri : CDI en premier, puis fin de contrat la plus récente (le travail en cours est donc toujours en haut).
async function loadEntreprises() {
    const [entreprises, emploisAll] = await Promise.all([getAllFromStore('entreprises'), getAllFromStore('emplois')]);
    const today = todayISO();

    const rows = entreprises.map(e => {
        const emps = emploisAll.filter(x => x.entrepriseId === e.id);
        const hasCdi = emps.some(x => x.cdi);
        const lastEnd = emps.reduce((m, x) => (x.dateFin && x.dateFin > m ? x.dateFin : m), '');
        return { e, hasCdi, lastEnd, active: hasCdi || (lastEnd !== '' && lastEnd >= today) };
    });
    rows.sort((a, b) =>
        (Number(b.hasCdi) - Number(a.hasCdi)) ||
        b.lastEnd.localeCompare(a.lastEnd) ||
        (b.e.lastActivity || '').localeCompare(a.e.lastActivity || ''));

    elements.listeEntreprises.innerHTML = '';
    if (!rows.length) {
        renderEmptyState(elements.listeEntreprises, 'Aucune entreprise enregistrée', 'Cliquez sur + pour ajouter une entreprise');
        return;
    }
    rows.forEach(({ e, hasCdi, active }) => {
        addListItem(elements.listeEntreprises, {
            title: e.nom,
            subtitle: e.adresse,
            badge: hasCdi ? 'CDI' : (active ? 'En cours' : 'Terminé'),
            badgeClass: hasCdi ? 'cdi' : (active ? '' : 'termine'),
            onClick: () => openEntreprise(e)
        });
    });
}

function openFormEntreprise(entreprise = null) {
    elements.formEntrepriseTitle.textContent = entreprise ? "Modifier l'entreprise" : 'Nouvelle Entreprise';
    elements.entrepriseId.value = entreprise ? entreprise.id : '';
    elements.entrepriseNom.value = entreprise ? entreprise.nom : '';
    elements.entrepriseAdresse.value = entreprise ? entreprise.adresse : '';
    showPage('page-form-entreprise', entreprise ? 'Modifier' : 'Nouvelle Entreprise');
}

async function saveEntreprise(event) {
    event.preventDefault();
    const id = elements.entrepriseId.value || null;   // identifiant texte (UUID)
    try {
        if (id) {
            const existing = await getByKey('entreprises', id) || {};
            const entreprise = {
                ...existing, id,
                nom: elements.entrepriseNom.value.trim(),
                adresse: elements.entrepriseAdresse.value.trim()
            };
            await updateInStore('entreprises', entreprise);
            if (currentEntreprise && currentEntreprise.id === id) currentEntreprise = entreprise;
            showToast('Entreprise modifiée', 'success');
        } else {
            await addToStore('entreprises', {
                nom: elements.entrepriseNom.value.trim(),
                adresse: elements.entrepriseAdresse.value.trim(),
                lastActivity: new Date().toISOString()
            });
            showToast('Entreprise ajoutée', 'success');
        }
        goToEntreprises();
    } catch (error) {
        showToast("Erreur lors de l'enregistrement", 'error');
        console.error(error);
    }
}

function openEntreprise(entreprise) {
    currentEntreprise = entreprise;
    elements.emploisEntrepriseNom.textContent = entreprise.nom;
    elements.emploisEntrepriseAdresse.textContent = entreprise.adresse;
    goToEmplois();
}

function deleteEntreprise() {
    showModal(
        "Supprimer l'entreprise ?",
        `Supprimer "${currentEntreprise.nom}", tous ses emplois et toutes leurs heures, sur cet appareil ET sur tous les appareils synchronisés avec le serveur maison ?`,
        async () => {
            try {
                const emplois = await getByIndex('emplois', 'entrepriseId', currentEntreprise.id);
                for (const emploi of emplois) {
                    const heures = await getByIndex('heures', 'emploiId', emploi.id);
                    for (const h of heures) await deleteFromStore('heures', h.id);
                    await deleteFromStore('emplois', emploi.id);
                }
                await deleteFromStore('entreprises', currentEntreprise.id);
                showToast('Entreprise supprimée', 'success');
                goToEntreprises();
            } catch (error) {
                showToast('Erreur lors de la suppression', 'error');
                console.error(error);
            }
        }
    );
}

// ===== Emplois =====
async function loadEmplois(entrepriseId) {
    const emplois = await getByIndex('emplois', 'entrepriseId', entrepriseId);
    // Contrat le plus récent en haut (date de début), même après modification.
    emplois.sort((a, b) => (b.dateDebut || '').localeCompare(a.dateDebut || '') || String(b.id).localeCompare(String(a.id)));

    elements.listeEmplois.innerHTML = '';
    if (!emplois.length) {
        renderEmptyState(elements.listeEmplois, 'Aucun emploi enregistré', 'Cliquez sur + pour ajouter un emploi');
        return;
    }
    const today = todayISO();
    emplois.forEach(emploi => {
        const active = emploi.cdi || (emploi.dateFin && emploi.dateFin >= today);
        addListItem(elements.listeEmplois, {
            title: emploi.poste,
            subtitle: emploi.cdi
                ? `Depuis le ${formatDate(emploi.dateDebut)}`
                : `Du ${formatDate(emploi.dateDebut)} au ${formatDate(emploi.dateFin)}`,
            badge: emploi.cdi ? 'CDI' : (active ? formatDate(emploi.dateFin) : 'Terminé'),
            badgeClass: emploi.cdi ? 'cdi' : (active ? '' : 'termine'),
            onClick: () => openEmploi(emploi)
        });
    });
}

function updateDateFinVisibility() {
    const isCDD = elements.emploiCdd.checked;
    elements.groupDateFin.style.display = isCDD ? 'block' : 'none';
    elements.emploiDateFin.required = isCDD;
    if (!isCDD) elements.emploiDateFin.value = '';
}

// ----- Horaires habituels dans le formulaire -----
function renderHorairesGrid(horaires) {
    const rows = JOURS_FULL.map((jour, i) => {
        const h = horaires[i] || {};
        return `<div class="hor-row" data-day="${i}">
            <label class="hor-day"><input type="checkbox" class="hor-travaille" ${h.travaille ? 'checked' : ''}> ${jour.slice(0, 3)}.</label>
            <input type="time" class="hor-debut" step="300" value="${h.debut || ''}" aria-label="${jour} : début">
            <input type="time" class="hor-fin" step="300" value="${h.fin || ''}" aria-label="${jour} : fin">
            <input type="time" class="hor-pause" step="300" value="${h.pause || ''}" aria-label="${jour} : pause">
        </div>`;
    }).join('');
    elements.horairesGrid.innerHTML = `<div class="hor-row hor-head"><span>Jour</span><span>Début</span><span>Fin</span><span>Pause</span></div>${rows}`;
    syncHorairesRows();
}
function syncHorairesRows() {
    elements.horairesGrid.querySelectorAll('.hor-row[data-day]').forEach(row => {
        const on = row.querySelector('.hor-travaille').checked;
        row.classList.toggle('off', !on);
        row.querySelectorAll('input[type="time"]').forEach(inp => { inp.disabled = !on; });
    });
}
function readHorairesGrid() {
    return [...elements.horairesGrid.querySelectorAll('.hor-row[data-day]')].map(row => ({
        travaille: row.querySelector('.hor-travaille').checked,
        debut: row.querySelector('.hor-debut').value,
        fin: row.querySelector('.hor-fin').value,
        pause: row.querySelector('.hor-pause').value || '00:00'
    }));
}
function copyLundiHoraires() {
    const rows = [...elements.horairesGrid.querySelectorAll('.hor-row[data-day]')];
    const src = rows[0];
    rows.slice(1, 5).forEach(row => {
        row.querySelector('.hor-travaille').checked = src.querySelector('.hor-travaille').checked;
        ['hor-debut', 'hor-fin', 'hor-pause'].forEach(c => { row.querySelector('.' + c).value = src.querySelector('.' + c).value; });
    });
    syncHorairesRows();
    showToast('Lundi copié sur mardi → vendredi');
}

// Horaires à afficher pour un emploi : les siens, sinon ceux déduits de son historique.
// Si l'emploi n'a ni horaires ni historique complet, on reprend le contrat le plus récent qui en a.
async function horairesForForm(emploi) {
    if (emploi && emploi.horaires) return emploi.horaires;
    const inferred = await inferHoraires(emploi);
    if (inferred) return inferred;
    const pause = (emploi && emploi.pauseDefaut) || DEFAULT_PAUSE;
    return JOURS_FULL.map((_, i) => ({ travaille: i < 5, debut: '', fin: '', pause }));
}

// opts.from : 'classic' (tableau) ou 'agenda' ; opts.date : jour touché dans l'agenda.
async function openFormEmploi(emploi = null, opts = {}) {
    emploiFormContext = { from: opts.from || 'classic', date: opts.date || null };
    const [emploisAll, entreprises] = await Promise.all([getAllFromStore('emplois'), getAllFromStore('entreprises')]);
    const byRecent = (a, b) => (b.dateDebut || '').localeCompare(a.dateDebut || '') || String(b.id).localeCompare(String(a.id));

    // Nouvel emploi : on part du contrat précédent (même entreprise si on la connaît).
    let source = emploi;
    if (!emploi) {
        const pool = currentEntreprise && emploiFormContext.from === 'classic'
            ? emploisAll.filter(e => e.entrepriseId === currentEntreprise.id) : emploisAll;
        source = [...pool].sort(byRecent)[0] || null;
    }

    elements.formEmploiTitle.textContent = emploi ? "Modifier l'emploi" : 'Nouvel Emploi';
    elements.emploiId.value = emploi ? emploi.id : '';
    elements.emploiPoste.value = emploi ? emploi.poste : '';
    elements.emploiDateDebut.value = emploi ? emploi.dateDebut : (emploiFormContext.date || '');
    elements.emploiCdd.checked = emploi ? !emploi.cdi : (source ? !source.cdi : true);   // coché = temps déterminé
    elements.emploiDateFin.value = emploi ? (emploi.dateFin || '') : '';
    elements.emploiTrajet.value = source ? (source.trajet || 0) : 0;
    elements.emploiPauseRemuneree.checked = source ? !!source.pauseRemuneree : false;
    const [h, m] = (source && source.pauseDefaut ? source.pauseDefaut : DEFAULT_PAUSE).split(':').map(Number);
    elements.emploiPauseHeures.value = h;
    elements.emploiPauseMinutes.value = m;
    renderHorairesGrid(await horairesForForm(source));

    // Intitulés déjà utilisés, proposés en saisie
    const postes = [...new Set(emploisAll.map(e => e.poste))].sort((a, b) => a.localeCompare(b));
    elements.postesList.innerHTML = postes.map(p => `<option value="${escapeHtml(p)}"></option>`).join('');

    // Depuis l'agenda, on choisit l'entreprise dans le formulaire
    const chooseEntreprise = !emploi && emploiFormContext.from === 'agenda';
    elements.groupEmploiEntreprise.classList.toggle('hidden', !chooseEntreprise);
    if (chooseEntreprise) {
        const lastStart = id => emploisAll.filter(e => e.entrepriseId === id).reduce((mx, e) => (e.dateDebut > mx ? e.dateDebut : mx), '');
        const sorted = [...entreprises].sort((a, b) => lastStart(b.id).localeCompare(lastStart(a.id)));
        elements.emploiEntrepriseSelect.innerHTML = sorted
            .map(e => `<option value="${e.id}">${escapeHtml(e.nom)}${e.adresse ? ' – ' + escapeHtml(e.adresse) : ''}</option>`).join('')
            + '<option value="__new">+ Nouvelle entreprise…</option>';
        elements.emploiEntrepriseSelect.value = source ? String(source.entrepriseId) : (sorted[0] ? String(sorted[0].id) : '__new');
        updateNewEntrepriseVisibility();
        elements.emploiEntrepriseId.value = '';
    } else {
        elements.groupNewEntreprise.classList.add('hidden');
        elements.emploiNewEntrepriseNom.required = false;
        elements.emploiNewEntrepriseAdresse.required = false;
        elements.emploiEntrepriseId.value = emploi ? emploi.entrepriseId : (currentEntreprise ? currentEntreprise.id : '');
    }

    updateDateFinVisibility();
    showPage('page-form-emploi', emploi ? 'Modifier' : 'Nouvel Emploi');
}

function updateNewEntrepriseVisibility() {
    const isNew = elements.emploiEntrepriseSelect.value === '__new' && !elements.groupEmploiEntreprise.classList.contains('hidden');
    elements.groupNewEntreprise.classList.toggle('hidden', !isNew);
    elements.emploiNewEntrepriseNom.required = isNew;
    elements.emploiNewEntrepriseAdresse.required = isNew;
}

function cancelFormEmploi() {
    if (emploiFormContext.from === 'agenda') openAgenda();
    else goToEmplois();
}

async function saveEmploi(event) {
    event.preventDefault();
    const isCDD = elements.emploiCdd.checked;
    const id = elements.emploiId.value || null;   // identifiant texte (UUID)
    const dateDebut = elements.emploiDateDebut.value;
    const dateFin = isCDD ? elements.emploiDateFin.value : null;

    if (isCDD && dateFin < dateDebut) {
        showToast('La date de fin est avant la date de début', 'error');
        return;
    }

    const ph = parseInt(elements.emploiPauseHeures.value);
    const pm = parseInt(elements.emploiPauseMinutes.value);
    const pauseDefaut = `${pad(isNaN(ph) ? 0 : ph)}:${pad(isNaN(pm) ? 30 : pm)}`;

    try {
        const now = new Date().toISOString();
        // Entreprise : celle du formulaire (agenda) ou l'entreprise courante (tableau)
        let entrepriseId = elements.emploiEntrepriseId.value;
        if (!elements.groupEmploiEntreprise.classList.contains('hidden')) {
            if (elements.emploiEntrepriseSelect.value === '__new') {
                entrepriseId = await addToStore('entreprises', {
                    nom: elements.emploiNewEntrepriseNom.value.trim(),
                    adresse: elements.emploiNewEntrepriseAdresse.value.trim(),
                    lastActivity: now
                });
            } else {
                entrepriseId = elements.emploiEntrepriseSelect.value;
            }
        }
        const entreprise = await getByKey('entreprises', entrepriseId);
        if (!entreprise) { showToast('Choisissez une entreprise', 'error'); return; }

        const existing = id ? (await getByKey('emplois', id)) || {} : {};
        const emploi = {
            ...existing,   // conserve heuresManuelles et tout le reste
            entrepriseId,
            poste: elements.emploiPoste.value.trim(),
            dateDebut,
            cdi: !isCDD,
            dateFin,
            trajet: parseInt(elements.emploiTrajet.value) || 0,
            pauseRemuneree: elements.emploiPauseRemuneree.checked,
            pauseDefaut,
            horaires: readHorairesGrid(),
            lastModified: now
        };
        if (id) {
            emploi.id = id;
            await updateInStore('emplois', emploi);
            if (currentEmploi && currentEmploi.id === id) currentEmploi = emploi;
            showToast('Emploi modifié', 'success');
        } else {
            emploi.id = await addToStore('emplois', emploi);
            showToast('Emploi ajouté', 'success');
        }
        entreprise.lastActivity = now;
        await updateInStore('entreprises', entreprise);
        currentEntreprise = entreprise;

        if (emploiFormContext.from === 'agenda') {
            const date = emploiFormContext.date;
            await openAgenda();
            if (!id && date) await agendaAddEmploiOnDay(emploi, date);
        } else {
            goToEmplois();
        }
    } catch (error) {
        showToast("Erreur lors de l'enregistrement", 'error');
        console.error(error);
    }
}

// Semaine affichée à l'ouverture : aujourd'hui si le contrat est en cours, sinon début ou fin du contrat.
function initialWeekFor(emploi) {
    const today = todayISO();
    let ref = today;
    if (emploi.dateDebut && today < emploi.dateDebut) ref = emploi.dateDebut;
    else if (!emploi.cdi && emploi.dateFin && today > emploi.dateFin) ref = emploi.dateFin;
    return getMonday(parseISO(ref));
}

async function openEmploi(emploi) {
    currentEmploi = emploi;
    elements.heuresEmploiPoste.textContent = emploi.poste;
    let info = emploi.cdi
        ? `CDI depuis le ${formatDate(emploi.dateDebut)}`
        : `CDD du ${formatDate(emploi.dateDebut)} au ${formatDate(emploi.dateFin)}`;
    if (emploi.pauseRemuneree) info += ' • Pause rémunérée';
    elements.heuresEmploiContrat.textContent = info;

    currentWeekStart = initialWeekFor(emploi);
    currentMonthKey = null;
    showPage('page-heures', emploi.poste);
    await renderWeekTable();
}

function deleteEmploi() {
    showModal(
        "Supprimer l'emploi ?",
        `Supprimer "${currentEmploi.poste}" et toutes ses heures, sur cet appareil ET sur tous les appareils synchronisés avec le serveur maison ?`,
        async () => {
            try {
                const heures = await getByIndex('heures', 'emploiId', currentEmploi.id);
                for (const h of heures) await deleteFromStore('heures', h.id);
                await deleteFromStore('emplois', currentEmploi.id);
                showToast('Emploi supprimé', 'success');
                goToEmplois();
            } catch (error) {
                showToast('Erreur lors de la suppression', 'error');
                console.error(error);
            }
        }
    );
}

// ===== Saisie des heures : tableau hebdomadaire =====
function dayQuery(cls, dateStr) {
    return elements.heuresTable.querySelector(`.${cls}[data-date="${dateStr}"]`);
}

// Deux journées identiques ? (une journée vide équivaut à l'absence de journée)
function memeJournee(a, b) {
    const vide = r => !r || (!r.repos && !r.debut && !r.fin);
    if (vide(a) || vide(b)) return vide(a) && vide(b);
    if (!!a.repos !== !!b.repos) return false;
    if (a.repos) return true;
    return (a.debut || '') === (b.debut || '') && (a.fin || '') === (b.fin || '') && (a.pause || '00:00') === (b.pause || '00:00');
}

function readDayFromDOM(dateStr) {
    return {
        date: dateStr,
        repos: dayQuery('repos-checkbox', dateStr)?.checked || false,
        pause: dayQuery('input-pause', dateStr)?.value || '00:00',
        debut: dayQuery('input-debut', dateStr)?.value || '',
        fin: dayQuery('input-fin', dateStr)?.value || ''
    };
}

function timeCell(cls, dateStr, value) {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'time';
    input.className = cls;
    input.dataset.date = dateStr;
    input.value = value;
    td.appendChild(input);
    return td;
}

async function renderWeekTable() {
    if (!currentEmploi || !currentWeekStart) return;
    const token = ++renderToken;
    const list = await getByIndex('heures', 'emploiId', currentEmploi.id);
    if (token !== renderToken) return;   // une navigation plus récente a pris le relais
    heuresCache = new Map(list.map(h => [h.date, h]));

    const weekEnd = addDays(currentWeekStart, 6);
    elements.weekLabel.value = `${formatDateFull(currentWeekStart)} - ${formatDateFull(weekEnd)}`;

    elements.rowDates.innerHTML = '<th></th>';
    elements.rowRepos.innerHTML = '<th>Repos</th>';
    elements.rowJours.innerHTML = '<th></th>';
    [elements.rowPause, elements.rowDebut, elements.rowFin, elements.rowTotalJour].forEach(row => {
        while (row.children.length > 1) row.removeChild(row.lastChild);
    });

    const defaultPause = currentEmploi.pauseDefaut || DEFAULT_PAUSE;
    const today = todayISO();

    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(currentWeekStart, i);
        const dateStr = formatDateISO(dayDate);
        const rec = heuresCache.get(dateStr) || {};

        const thDate = document.createElement('th');
        thDate.textContent = formatDateShort(dayDate);
        if (dateStr === today) thDate.classList.add('today');
        elements.rowDates.appendChild(thDate);

        const thRepos = document.createElement('th');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'repos-checkbox';
        cb.dataset.date = dateStr;
        cb.title = 'Jour de repos';
        cb.checked = !!rec.repos;
        thRepos.appendChild(cb);
        elements.rowRepos.appendChild(thRepos);

        const thJour = document.createElement('th');
        thJour.textContent = JOURS[i];
        thJour.title = JOURS_FULL[i];
        elements.rowJours.appendChild(thJour);

        elements.rowPause.appendChild(timeCell('input-pause', dateStr, rec.pause !== undefined ? rec.pause : defaultPause));
        elements.rowDebut.appendChild(timeCell('input-debut', dateStr, rec.debut || ''));
        elements.rowFin.appendChild(timeCell('input-fin', dateStr, rec.fin || ''));

        const tdTotal = document.createElement('td');
        tdTotal.className = 'total-cell';
        tdTotal.id = `total-jour-${dateStr}`;
        tdTotal.textContent = '0H00';
        elements.rowTotalJour.appendChild(tdTotal);
    }

    updateManualPanel();
    applyDayStates();
    refreshTotals();
}

async function navigateWeek(direction) {
    currentWeekStart = addDays(currentWeekStart, direction * 7);
    await renderWeekTable();
}

// ===== Saisie manuelle mensuelle =====
function weekMonthKeys() {
    const a = monthKeyOf(currentWeekStart);
    const b = monthKeyOf(addDays(currentWeekStart, 6));
    return a === b ? [a] : [a, b];
}

function updateManualPanel() {
    const keys = weekMonthKeys();
    if (!keys.includes(currentMonthKey)) currentMonthKey = keys[0];

    elements.heuresManuellesMoisLabel.textContent = monthLabel(currentMonthKey);
    elements.heuresManuellesMoisLabel.classList.toggle('hidden', keys.length > 1);
    const sel = elements.heuresManuellesMoisSelect;
    sel.innerHTML = keys.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join('');
    sel.value = currentMonthKey;
    sel.classList.toggle('hidden', keys.length < 2);

    const value = (currentEmploi.heuresManuelles || {})[currentMonthKey];
    const has = value !== undefined;
    elements.heuresManuellesCheck.checked = has;
    elements.heuresManuellesInput.classList.toggle('hidden', !has);
    elements.heuresManuellesValue.value = has ? value : '';
}

// Mois dont les jours sont verrouillés : ceux déjà saisis en manuel + le mois en cours de saisie manuelle.
function getLockedMonths() {
    const set = new Set(Object.keys(currentEmploi.heuresManuelles || {}));
    if (elements.heuresManuellesCheck.checked && currentMonthKey) set.add(currentMonthKey);
    return set;
}

// Active/désactive les champs de chaque jour (mois verrouillé, jour de repos).
function applyDayStates() {
    const locked = getLockedMonths();
    for (let i = 0; i < 7; i++) {
        const dateStr = formatDateISO(addDays(currentWeekStart, i));
        const isLocked = locked.has(dateStr.slice(0, 7));
        const repos = dayQuery('repos-checkbox', dateStr);
        repos.disabled = isLocked;
        ['input-pause', 'input-debut', 'input-fin'].forEach(cls => {
            dayQuery(cls, dateStr).disabled = isLocked || repos.checked;
        });
        [repos, dayQuery('input-pause', dateStr), dayQuery('input-debut', dateStr), dayQuery('input-fin', dateStr),
            document.getElementById(`total-jour-${dateStr}`)]
            .forEach(el => el.closest('td, th').classList.toggle('cell-locked', isLocked));
    }
}

function handleReposChange(event) {
    const cb = event.target;
    const dateStr = cb.dataset.date;
    if (cb.checked) {
        dayQuery('input-debut', dateStr).value = '';
        dayQuery('input-fin', dateStr).value = '';
        dayQuery('input-pause', dateStr).value = '00:00';
    } else {
        dayQuery('input-pause', dateStr).value = currentEmploi.pauseDefaut || DEFAULT_PAUSE;
    }
    applyDayStates();
    refreshTotals();
}

// ===== Totaux (semaine, mois, année, cumul) — recalculés en direct pendant la saisie =====
function refreshTotals() {
    if (!currentEmploi || !currentWeekStart) return;
    const locked = getLockedMonths();
    let weekNet = 0, weekGross = 0, worked = 0;
    const overrides = {};

    for (let i = 0; i < 7; i++) {
        const dateStr = formatDateISO(addDays(currentWeekStart, i));
        const rec = readDayFromDOM(dateStr);
        overrides[dateStr] = rec;
        const cell = document.getElementById(`total-jour-${dateStr}`);
        if (locked.has(dateStr.slice(0, 7))) { cell.textContent = '—'; continue; }
        const net = netMinutes(rec, currentEmploi);
        const gross = grossMinutes(rec);
        cell.textContent = minutesToTime(net);
        weekNet += net;
        weekGross += gross;
        if (gross > 0) worked++;
    }

    elements.totalSemaine.textContent = minutesToTime(weekNet);
    elements.tempsReel.textContent = minutesToTime(weekGross);
    const trajet = currentEmploi.trajet || 0;
    elements.tempsReelTrajet.textContent = minutesToTime(weekGross + trajet * 2 * worked);

    const per = computePerMonth(currentEmploi, heuresCache, overrides, locked);
    const year = currentMonthKey.slice(0, 4);
    let yearTotal = 0, cumul = 0;
    Object.entries(per).forEach(([k, v]) => {
        cumul += v;
        if (k.startsWith(year)) yearTotal += v;
    });
    elements.totalMois.textContent = minutesToTime(per[currentMonthKey] || 0);
    elements.totalAnnee.textContent = minutesToTime(yearTotal);
    elements.cumulTotalEmploi.textContent = minutesToTime(cumul);
}

async function saveHeures() {
    if (!currentEmploi) return;
    try {
        const locked = getLockedMonths();
        const existing = await getByIndex('heures', 'emploiId', currentEmploi.id);
        const byDate = new Map(existing.map(h => [h.date, h]));

        for (let i = 0; i < 7; i++) {
            const dateStr = formatDateISO(addDays(currentWeekStart, i));
            if (locked.has(dateStr.slice(0, 7))) continue;   // mois en saisie manuelle : on ne touche à rien
            const rec = readDayFromDOM(dateStr);
            // Jour non modifié à l'écran : on n'y touche pas (pas de fausse modification envoyée à la synchro)
            if (memeJournee(rec, heuresCache.get(dateStr))) continue;
            const old = byDate.get(dateStr);
            const data = { ...(old || {}), emploiId: currentEmploi.id, date: dateStr, repos: rec.repos, pause: rec.pause, debut: rec.debut, fin: rec.fin };
            delete data.estime;   // corrigé à la main : plus d'heure estimée
            await saveDayRecord(data);
        }

        await touchActivity();
        const fresh = await getByIndex('heures', 'emploiId', currentEmploi.id);
        heuresCache = new Map(fresh.map(h => [h.date, h]));
        refreshTotals();
        showToast('Heures enregistrées', 'success');
    } catch (error) {
        showToast("Erreur lors de l'enregistrement", 'error');
        console.error(error);
    }
}

async function persistManual(heuresManuelles) {
    await touchActivity(fresh => { fresh.heuresManuelles = heuresManuelles; });
}

async function onManualCheckChange() {
    const manual = currentEmploi.heuresManuelles || {};
    if (elements.heuresManuellesCheck.checked) {
        elements.heuresManuellesInput.classList.remove('hidden');
        elements.heuresManuellesValue.focus();
    } else if (manual[currentMonthKey] !== undefined) {
        showModal(
            'Supprimer la saisie manuelle ?',
            `Les ${manual[currentMonthKey]} h saisies pour ${monthLabel(currentMonthKey)} seront supprimées. Les jours détaillés éventuels redeviendront utilisables.`,
            async () => {
                const copy = { ...manual };
                delete copy[currentMonthKey];
                await persistManual(copy);
                updateManualPanel();
                applyDayStates();
                refreshTotals();
                showToast('Saisie manuelle supprimée');
            },
            () => { elements.heuresManuellesCheck.checked = true; }
        );
        return;
    } else {
        elements.heuresManuellesInput.classList.add('hidden');
        elements.heuresManuellesValue.value = '';
    }
    applyDayStates();
    refreshTotals();
}

async function onManualSave() {
    if (!currentEmploi || !currentMonthKey) return;
    const value = parseDecimal(elements.heuresManuellesValue.value);
    if (isNaN(value) || value < 0) {
        showToast("Veuillez entrer un nombre d'heures valide", 'error');
        return;
    }
    try {
        await persistManual({ ...(currentEmploi.heuresManuelles || {}), [currentMonthKey]: round2(value) });
        applyDayStates();
        refreshTotals();
        showToast('Heures mensuelles enregistrées', 'success');
    } catch (error) {
        showToast("Erreur lors de l'enregistrement", 'error');
        console.error(error);
    }
}

// ===== Export : un ZIP, un dossier par entreprise, un .ods par emploi =====
const escapeXml = text => String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function sanitizeFilename(name) {
    return String(name).normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'sans_nom';
}

function uniqueName(base, usedSet, ext = '') {
    let name = base + ext, n = 2;
    while (usedSet.has(name.toLowerCase())) name = `${base}_${n++}${ext}`;
    usedSet.add(name.toLowerCase());
    return name;
}

// Quels mois exporter, et quels jours dans chaque mois.
// Période = du début du contrat à sa fin (CDI : jusqu'à la dernière saisie). Les jours saisis hors période sont conservés.
// Les mois sans aucune saisie ne sont pas exportés.
function buildMonthPlan(emploi, heures) {
    const manual = emploi.heuresManuelles || {};
    const meaningful = heures.filter(h => h.repos || h.debut || h.fin).map(h => h.date).sort();
    const months = new Set([...Object.keys(manual), ...meaningful.map(d => d.slice(0, 7))]);
    const lastData = meaningful.length ? meaningful[meaningful.length - 1] : null;
    const start = emploi.dateDebut || meaningful[0] || null;
    const end = emploi.cdi ? lastData : (emploi.dateFin || lastData);

    return [...months].sort().map(mk => {
        if (manual[mk] !== undefined) return { monthKey: mk, manual: manual[mk] };
        const [y, m] = mk.split('-').map(Number);
        const first = `${mk}-01`;
        const last = `${mk}-${pad(new Date(y, m, 0).getDate())}`;
        const dates = new Set(meaningful.filter(d => d.startsWith(mk)));
        if (start && end) {
            const from = start > first ? start : first;
            const to = end < last ? end : last;
            for (let d = parseISO(from); formatDateISO(d) <= to; d = addDays(d, 1)) dates.add(formatDateISO(d));
        }
        return { monthKey: mk, dates: [...dates].sort() };
    });
}

function sheetName(monthKey) {
    const [y, m] = monthKey.split('-');
    return `${MOIS[Number(m) - 1]}_${y}`;
}

const strCell = v => `<table:table-cell office:value-type="string"><text:p>${escapeXml(v ?? '')}</text:p></table:table-cell>`;
const numCell = v => `<table:table-cell office:value-type="float" office:value="${v}"><text:p>${v}</text:p></table:table-cell>`;
const emptyCell = () => '<table:table-cell/>';
const row = (...cells) => `<table:table-row>${cells.join('')}</table:table-row>`;

function generateODSContent(entreprise, emploi, heures) {
    const recs = new Map(heures.map(h => [h.date, h]));
    const per = computePerMonth(emploi, recs);
    const totalHeures = round2(Object.values(per).reduce((a, b) => a + b, 0) / 60);

    let sheets = `<table:table table:name="Informations">`
        + row(strCell('Entreprise'), strCell(entreprise.nom))
        + row(strCell('Adresse'), strCell(entreprise.adresse))
        + row(strCell('Poste'), strCell(emploi.poste))
        + row(strCell('Type de contrat'), strCell(emploi.cdi ? 'CDI' : 'CDD'))
        + row(strCell('Date de début'), strCell(formatDate(emploi.dateDebut)))
        + (emploi.cdi ? '' : row(strCell('Date de fin'), strCell(formatDate(emploi.dateFin))))
        + row(strCell('Temps de trajet'), strCell(`${emploi.trajet || 0} minutes`))
        + row(strCell('Pause rémunérée'), strCell(emploi.pauseRemuneree ? 'Oui' : 'Non'))
        + row(strCell('Pause par défaut'), strCell(emploi.pauseDefaut || DEFAULT_PAUSE))
        + (emploi.horaires || []).map((h, i) => row(strCell(`Horaires ${JOURS_FULL[i]}`),
            strCell(h.travaille && h.debut && h.fin ? `${h.debut}-${h.fin} pause ${h.pause || '00:00'}` : 'Non travaillé'))).join('')
        + row(strCell('Total heures travaillées'), numCell(totalHeures))
        + `</table:table>`;

    buildMonthPlan(emploi, heures).forEach(plan => {
        sheets += `<table:table table:name="${escapeXml(sheetName(plan.monthKey))}">`;

        if (plan.manual !== undefined) {
            const minutes = decimalHoursToMinutes(plan.manual);
            sheets += row(strCell('Type de saisie'), strCell('Heures manuelles'))
                + row(strCell('Total du mois (heures)'), numCell(plan.manual))
                + row(strCell('Total du mois'), strCell(minutesToTime(minutes)));
        } else {
            sheets += row(...['Date', 'Jour', 'Repos', 'Début', 'Fin', 'Pause', 'Total', 'Total (h décimales)'].map(strCell));
            let monthTotal = 0;
            plan.dates.forEach(date => {
                const rec = recs.get(date);
                const jour = JOURS_FULL[(parseISO(date).getDay() + 6) % 7];
                if (!rec) {
                    sheets += row(strCell(formatDate(date)), strCell(jour), ...Array(6).fill(0).map(emptyCell));
                    return;
                }
                const net = netMinutes(rec, emploi);
                monthTotal += net;
                sheets += row(
                    strCell(formatDate(date)), strCell(jour), strCell(rec.repos ? 'Oui' : 'Non'),
                    strCell(rec.debut || ''), strCell(rec.fin || ''), strCell(rec.pause || '00:00'),
                    strCell(minutesToTime(net)), numCell(round2(net / 60)));
            });
            sheets += row(strCell('Total du mois'), ...Array(5).fill(0).map(emptyCell),
                strCell(minutesToTime(monthTotal)), numCell(round2(monthTotal / 60)));
        }
        sheets += `</table:table>`;
    });
    return sheets;
}

function wrapContentXml(sheets) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="${NS.office}" xmlns:table="${NS.table}" xmlns:text="${NS.text}" office:version="1.2">
<office:body><office:spreadsheet>${sheets}</office:spreadsheet></office:body>
</office:document-content>`;
}

async function buildODS(entreprise, emploi, heures, optFichier = {}) {
    const zip = new JSZip();
    const mime = 'application/vnd.oasis.opendocument.spreadsheet';
    zip.file('mimetype', mime, { compression: 'STORE', ...optFichier });   // doit être le premier fichier, non compressé
    zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`, optFichier);
    zip.file('styles.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="${NS.office}" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2"></office:document-styles>`, optFichier);
    zip.file('content.xml', wrapContentXml(generateODSContent(entreprise, emploi, heures)), optFichier);
    return zip.generateAsync({ type: 'uint8array', mimeType: mime, compression: 'DEFLATE' });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Fabrique le ZIP (un dossier par entreprise, un .ods par emploi) sans le télécharger.
// Sert à l'export manuel ET à la « copie lisible » envoyée au serveur maison.
// dateFixe : dates internes du ZIP figées, pour que le même contenu donne exactement le même fichier
// (le module n'envoie la copie que si son contenu a changé).
async function construireExportZip(opts = {}) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip est introuvable : ajoutez jszip.min.js à côté de index.html');
    const [entreprises, emplois] = await Promise.all([getAllFromStore('entreprises'), getAllFromStore('emplois')]);
    if (!emplois.length) {
        const err = new Error('Aucune donnée à exporter');
        err.vide = true;
        throw err;   // la copie lisible n'est pas envoyée (un fichier vide n'a aucun intérêt)
    }
    const optFichier = opts.dateFixe ? { date: new Date(2000, 0, 1), createFolders: false } : {};
    const root = new JSZip();
    const usedFolders = new Set();
    let count = 0;

    for (const entreprise of [...entreprises].sort((a, b) => a.nom.localeCompare(b.nom))) {
        const emps = emplois.filter(e => e.entrepriseId === entreprise.id)
            .sort((a, b) => (a.dateDebut || '').localeCompare(b.dateDebut || '') || String(a.id).localeCompare(String(b.id)));
        if (!emps.length) continue;
        const dossier = uniqueName(sanitizeFilename(entreprise.nom), usedFolders);
        if (!opts.dateFixe) root.folder(dossier);
        const usedFiles = new Set();
        for (const emploi of emps) {
            const heures = (await getByIndex('heures', 'emploiId', emploi.id)).sort((a, b) => a.date.localeCompare(b.date));
            const bytes = await buildODS(entreprise, emploi, heures, optFichier);
            const base = `${sanitizeFilename(emploi.poste)}_${emploi.dateDebut || 'sans-date'}_${emploi.cdi ? 'CDI' : (emploi.dateFin || 'CDD')}`;
            root.file(`${dossier}/${uniqueName(base, usedFiles, '.ods')}`, bytes, { compression: 'STORE', ...optFichier });
            count++;
        }
    }
    const blob = await root.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return { blob, nom: `MesZeuR_${todayISO()}.zip`, count };
}

// Export manuel : fabrique le ZIP puis le télécharge.
async function exportAllToZip() {
    try {
        showToast('Export en cours…');
        const { blob, nom, count } = await construireExportZip();
        downloadBlob(blob, nom);
        showToast(`Export terminé : ${count} fichier(s) dans un ZIP`, 'success');
    } catch (error) {
        showToast(error.vide || /JSZip/.test(error.message) ? error.message : "Erreur lors de l'export", 'error');
        if (!error.vide) console.error(error);
    }
}

// ===== Import : ZIP ou fichiers .ods =====
function normalizeTime(s) {
    const m = String(s || '').match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
    return m ? `${pad(Number(m[1]))}:${m[2]}` : '';
}

function parseImportDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

const stripAccents = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// "juillet_2023", "juillet 2023", "juillet_2023 (Manuel)" -> "2023-07"
function parseMonthSheetName(name) {
    const clean = name.replace(/\s*\(manuel\)\s*$/i, '').trim();
    const m = clean.match(/^([A-Za-zÀ-ÿ]+)[\s_]+(\d{4})$/);
    if (!m) return '';
    const idx = MOIS.findIndex(x => stripAccents(x) === stripAccents(m[1]));
    return idx === -1 ? '' : `${m[2]}-${pad(idx + 1)}`;
}

// Valeur d'une cellule ODS (tolère les cellules réenregistrées par Excel : dates, heures, nombres).
function cellValue(cell) {
    const attr = n => cell.getAttributeNS(NS.office, n);
    const type = attr('value-type');
    if (type === 'float' || type === 'percentage' || type === 'currency') {
        const v = attr('value');
        if (v) return v;
    }
    if (type === 'date') {
        const v = attr('date-value');
        if (v) return v.slice(0, 10);
    }
    if (type === 'time') {
        const m = (attr('time-value') || '').match(/PT(\d+)H(\d+)M/);
        if (m) return `${pad(Number(m[1]))}:${m[2]}`;
    }
    return Array.from(cell.getElementsByTagNameNS(NS.text, 'p')).map(p => p.textContent).join(' ').trim();
}

function readSheetRows(tableEl) {
    const rows = [];
    for (const rowEl of tableEl.getElementsByTagNameNS(NS.table, 'table-row')) {
        const cells = [];
        for (const cell of rowEl.children) {
            if (cell.namespaceURI !== NS.table || !/table-cell$/.test(cell.localName)) continue;
            const rep = parseInt(cell.getAttributeNS(NS.table, 'number-columns-repeated')) || 1;
            const val = cellValue(cell);
            for (let i = 0; i < rep && cells.length < 20; i++) cells.push(val);
        }
        if (cells.some(c => c !== '')) rows.push(cells);
    }
    return rows;
}

// Importe un fichier .ods (emploi + heures). Fusion sans suppression : mêmes dates / mêmes mois mis à jour.
async function importOdsData(data) {
    const zip = await JSZip.loadAsync(data);
    const contentFile = zip.file('content.xml');
    if (!contentFile) throw new Error('content.xml introuvable');
    const doc = new DOMParser().parseFromString(await contentFile.async('string'), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML invalide');

    const info = {}, manual = {}, days = new Map();
    for (const table of doc.getElementsByTagNameNS(NS.table, 'table')) {
        const name = table.getAttributeNS(NS.table, 'name') || '';
        const rows = readSheetRows(table);

        if (name === 'Informations') {
            rows.forEach(r => { if (r.length >= 2) info[r[0]] = r[1]; });
            continue;
        }
        if (rows.some(r => r[0] === 'Type de saisie' && r[1] === 'Heures manuelles')) {
            const mk = parseMonthSheetName(name);
            const hRow = rows.find(r => /^Total du mois \(heures/i.test(r[0]));
            const mRow = rows.find(r => /^Total du mois \(minutes/i.test(r[0]));   // anciens exports
            let value = NaN;
            if (hRow) value = parseDecimal(hRow[1]);
            else if (mRow) value = parseDecimal(mRow[1]) / 60;
            if (mk && !isNaN(value)) manual[mk] = round2(value);
            continue;
        }
        rows.forEach(r => {
            const date = parseImportDate(r[0]);
            if (!date) return;   // en-tête, ligne de total…
            const repos = r[2] === 'Oui';
            const debut = normalizeTime(r[3]);
            const fin = normalizeTime(r[4]);
            if (!repos && !debut && !fin) return;   // jour vide
            days.set(date, { date, repos, debut, fin, pause: normalizeTime(r[5]) || '00:00' });
        });
    }

    const nom = (info['Entreprise'] || '').trim();
    const poste = (info['Poste'] || '').trim();
    const dateDebut = parseImportDate(info['Date de début']);
    if (!nom || !poste || !dateDebut) throw new Error('Informations manquantes');
    const adresse = (info['Adresse'] || '').trim();
    const cdi = String(info['Type de contrat'] || '').toUpperCase() === 'CDI';
    const fields = {
        cdi,
        dateFin: cdi ? null : (parseImportDate(info['Date de fin']) || null),
        trajet: parseInt(info['Temps de trajet']) || 0,
        pauseRemuneree: info['Pause rémunérée'] === 'Oui',
        pauseDefaut: normalizeTime(info['Pause par défaut']) || DEFAULT_PAUSE
    };
    if (JOURS_FULL.some(j => info[`Horaires ${j}`] !== undefined)) {
        fields.horaires = JOURS_FULL.map(j => {
            const m = String(info[`Horaires ${j}`] || '').match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})(?:\D+(\d{1,2}:\d{2}))?/);
            return m ? { travaille: true, debut: normalizeTime(m[1]), fin: normalizeTime(m[2]), pause: normalizeTime(m[3]) || '00:00' }
                : { travaille: false, debut: '', fin: '', pause: '' };
        });
    }

    // Le fichier ne dit pas quand les données ont été modifiées : updatedAt = 1 (« ancien »).
    // Avec le serveur maison, ce qu'il possède déjà garde sa version ; le reste lui est ajouté.
    // Appareil connecté au serveur : ce qui est déjà sur l'appareil EST la version du serveur (ou plus
    // récente) → on ne le remplace pas, on n'ajoute que ce qui manque. (Le remplacer par une version
    // « ancienne » ferait refuser l'envoi par le serveur et laisserait cet appareil différent des autres.)
    const IMPORT = { updatedAt: 1 };
    const connecte = syncConnectee();
    const now = new Date().toISOString();
    const norm = s => (s || '').trim().toLowerCase();
    const entreprises = await getAllFromStore('entreprises');
    let entreprise = entreprises.find(e => norm(e.nom) === norm(nom) && norm(e.adresse) === norm(adresse));
    if (!entreprise) {
        const id = await addToStore('entreprises', { nom, adresse, lastActivity: now }, IMPORT);   // nouvel UUID
        entreprise = await getByKey('entreprises', id);
    }

    const emplois = await getByIndex('emplois', 'entrepriseId', entreprise.id);
    let emploi = emplois.find(e => norm(e.poste) === norm(poste) && e.dateDebut === dateDebut);
    const created = !emploi;
    let joursConserves = 0;
    if (emploi && connecte) {
        // On garde l'emploi tel quel ; seuls les mois de saisie manuelle absents sont ajoutés (vraie modification).
        const ajouts = Object.keys(manual).filter(k => !(emploi.heuresManuelles || {}).hasOwnProperty(k));
        if (ajouts.length) {
            ajouts.forEach(k => { emploi.heuresManuelles = { ...(emploi.heuresManuelles || {}), [k]: manual[k] }; });
            await updateInStore('emplois', emploi);
        }
    } else if (emploi) {
        Object.assign(emploi, fields, { heuresManuelles: { ...(emploi.heuresManuelles || {}), ...manual }, lastModified: now });
        await updateInStore('emplois', emploi, IMPORT);
    } else {
        emploi = { entrepriseId: entreprise.id, poste, dateDebut, ...fields, heuresManuelles: manual, lastModified: now };
        emploi.id = await addToStore('emplois', emploi, IMPORT);   // nouvel UUID
    }

    // Journées : id fixe `${emploiId}_${date}` ; on garde les autres champs d'une journée déjà présente.
    const existing = new Map((await getByIndex('heures', 'emploiId', emploi.id)).map(h => [h.date, h]));
    const aEcrire = [...days.values()].filter(d => {
        if (connecte && existing.has(d.date)) { joursConserves++; return false; }
        return true;
    });
    const items = aEcrire.map(d => {
        const old = existing.get(d.date) || {};
        const rec = { ...old, emploiId: emploi.id, ...d, id: heureId(emploi.id, d.date) };
        delete rec.estime;
        return rec;
    });
    if (items.length) await bulkPut('heures', items, IMPORT);

    return { created, jours: items.length, conserves: joursConserves, mois: Object.keys(manual).length };
}

async function importFiles(fileList) {
    if (typeof JSZip === 'undefined') {
        showToast('JSZip est introuvable : ajoutez jszip.min.js à côté de index.html', 'error');
        return;
    }
    const stats = { emplois: 0, jours: 0, conserves: 0, mois: 0, erreurs: 0 };
    const handle = async (data, label) => {
        try {
            const r = await importOdsData(data);
            stats.emplois++; stats.jours += r.jours; stats.conserves += r.conserves; stats.mois += r.mois;
        } catch (error) {
            stats.erreurs++;
            console.error(`Import de ${label} impossible :`, error);
        }
    };

    for (const file of fileList) {
        if (file.name.toLowerCase().endsWith('.zip')) {
            try {
                const zip = await JSZip.loadAsync(file);
                const entries = Object.values(zip.files).filter(f =>
                    !f.dir && f.name.toLowerCase().endsWith('.ods') && !f.name.startsWith('__MACOSX'));
                for (const entry of entries) await handle(await entry.async('uint8array'), entry.name);
            } catch (error) {
                stats.erreurs++;
                console.error(`ZIP ${file.name} illisible :`, error);
            }
        } else {
            await handle(file, file.name);
        }
    }

    let msg = `Import : ${stats.emplois} emploi(s), ${stats.jours} jour(s) ajouté(s) ou mis à jour, ${stats.mois} mois manuel(s)`;
    if (stats.erreurs) msg += ` — ${stats.erreurs} fichier(s) en erreur (voir console)`;
    msg += syncConnectee()
        ? `. Serveur maison : ${stats.conserves} journée(s) déjà présente(s) gardent leur version ; les journées nouvelles lui seront ajoutées.`
        : '. Serveur maison : les journées qu\'il possède déjà garderont sa version, les autres lui seront ajoutées.';
    showToast(msg, stats.erreurs ? 'error' : 'success', 9000);
    if (typeof rafraichirApresSynchro === 'function') rafraichirApresSynchro([]);
    await loadEntreprises();
    await calculerBilanGlobal();
}

// ===== Bilan global =====
// Conversion heures -> années/mois/jours (base 35 h/semaine, 52 semaines, 7 h/jour).
function convertirMinutesEnDuree(totalMinutes) {
    const heuresParAn = 35 * 52;
    const heuresParMois = heuresParAn / 12;
    const heuresParJour = 7;
    const totalHeures = totalMinutes / 60;
    const annees = Math.floor(totalHeures / heuresParAn);
    const reste = totalHeures % heuresParAn;
    const mois = Math.floor(reste / heuresParMois);
    const jours = Math.floor((reste % heuresParMois) / heuresParJour);
    return { annees, mois, jours };
}

async function calculerBilanGlobal() {
    const [emplois, entreprises] = await Promise.all([getAllFromStore('emplois'), getAllFromStore('entreprises')]);
    elements.bilanEmploisList.innerHTML = '';
    let totalGlobal = 0;

    const sorted = [...emplois].sort((a, b) => (a.dateDebut || '').localeCompare(b.dateDebut || ''));
    for (const emploi of sorted) {
        const list = await getByIndex('heures', 'emploiId', emploi.id);
        const per = computePerMonth(emploi, new Map(list.map(h => [h.date, h])));
        const total = Object.values(per).reduce((a, b) => a + b, 0);
        totalGlobal += total;
        if (total <= 0) continue;

        const entreprise = entreprises.find(e => e.id === emploi.entrepriseId);
        const item = document.createElement('div');
        item.className = 'bilan-emploi-item';
        item.innerHTML = `<span class="bilan-emploi-nom">${escapeHtml(entreprise ? `${entreprise.nom} - ${emploi.poste}` : emploi.poste)}</span>
            <span class="bilan-emploi-heures">${minutesToTime(total)}</span>`;
        elements.bilanEmploisList.appendChild(item);
    }
    if (!elements.bilanEmploisList.children.length) {
        elements.bilanEmploisList.innerHTML = '<p class="settings-description">Aucune heure enregistrée</p>';
    }
    elements.bilanTotalHeures.textContent = minutesToTime(totalGlobal);
    const d = convertirMinutesEnDuree(totalGlobal);
    elements.bilanTotalDuree.textContent = `${d.annees} année(s), ${d.mois} mois, ${d.jours} jour(s)`;
}

function toggleBilanDetails() {
    const collapsed = elements.bilanEmploisList.classList.toggle('collapsed');
    document.querySelector('.bilan-toggle-icon').classList.toggle('open', !collapsed);
    elements.bilanToggle.setAttribute('aria-expanded', String(!collapsed));
}

// ===== Divers : échappement, modal, toast =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showModal(title, message, onConfirm, onCancel, opts = {}) {
    elements.modalTitle.textContent = title;
    elements.modalMessage.textContent = message;
    elements.modalConfirmBtn.textContent = opts.confirmLabel || 'Supprimer';
    elements.modalCancel.textContent = opts.cancelLabel || 'Annuler';
    elements.modalConfirmBtn.className = opts.danger === false ? 'btn-primary' : 'btn-danger';
    modalConfirmCallback = onConfirm;
    modalCancelCallback = onCancel || null;
    elements.modalConfirm.classList.remove('hidden');
}

function closeModal(confirmed) {
    const cb = confirmed ? modalConfirmCallback : modalCancelCallback;
    modalConfirmCallback = null;
    modalCancelCallback = null;
    elements.modalConfirm.classList.add('hidden');
    if (cb) cb();
}

function showToast(message, type = '', duree = 3500) {
    clearTimeout(toastTimeout);
    elements.toast.textContent = message;
    elements.toast.className = 'toast' + (type ? ` ${type}` : '');
    toastTimeout = setTimeout(() => elements.toast.classList.add('hidden'), duree);
}

// ===== Événements =====
function initEventListeners() {
    elements.btnBack.addEventListener('click', navigateBack);
    elements.btnSettings.addEventListener('click', () => {
        showPage('page-settings', 'Paramètres');
        const mode = getDisplayMode();
        elements.affichageTableau.checked = mode === 'tableau';
        elements.affichageAgenda.checked = mode === 'agenda';
        calculerBilanGlobal();
        renderPointagesList();
    });
    [elements.affichageTableau, elements.affichageAgenda].forEach(r => r.addEventListener('change', () => {
        prefSet('meszeur-affichage', r.value);
        showToast(r.value === 'agenda' ? "L'app s'ouvrira sur l'agenda" : "L'app s'ouvrira sur l'accueil classique", 'success');
    }));
    elements.btnTravail.addEventListener('click', goToEntreprises);

    // Entreprises
    elements.btnAddEntreprise.addEventListener('click', () => openFormEntreprise());
    elements.formEntreprise.addEventListener('submit', saveEntreprise);
    elements.btnCancelEntreprise.addEventListener('click', goToEntreprises);

    // Emplois
    elements.btnEditEntreprise.addEventListener('click', () => openFormEntreprise(currentEntreprise));
    elements.btnDeleteEntreprise.addEventListener('click', deleteEntreprise);
    elements.btnAddEmploi.addEventListener('click', () => openFormEmploi());
    elements.formEmploi.addEventListener('submit', saveEmploi);
    elements.emploiCdd.addEventListener('change', updateDateFinVisibility);
    elements.btnCancelEmploi.addEventListener('click', cancelFormEmploi);
    elements.emploiEntrepriseSelect.addEventListener('change', updateNewEntrepriseVisibility);
    elements.horairesGrid.addEventListener('change', e => { if (e.target.classList.contains('hor-travaille')) syncHorairesRows(); });
    elements.btnCopyLundi.addEventListener('click', copyLundiHoraires);

    // Heures
    elements.btnEditEmploi.addEventListener('click', () => openFormEmploi(currentEmploi, { from: 'classic' }));
    elements.btnDeleteEmploi.addEventListener('click', deleteEmploi);
    elements.btnPrevWeek.addEventListener('click', () => navigateWeek(-1));
    elements.btnNextWeek.addEventListener('click', () => navigateWeek(1));
    elements.btnSaveHeures.addEventListener('click', saveHeures);

    // Saisie dans le tableau (délégation : fonctionne après chaque rafraîchissement)
    const isTimeInput = el => el.matches('.input-pause, .input-debut, .input-fin');
    elements.heuresTable.addEventListener('input', e => { if (isTimeInput(e.target)) refreshTotals(); });
    elements.heuresTable.addEventListener('change', e => {
        if (e.target.classList.contains('repos-checkbox')) handleReposChange(e);
        else if (isTimeInput(e.target)) refreshTotals();
    });

    // Sélecteur de semaine
    elements.weekLabel.addEventListener('click', () => {
        if (!currentWeekStart) return;
        elements.weekDatePicker.value = formatDateISO(currentWeekStart);
        elements.weekPickerModal.classList.remove('hidden');
    });
    elements.weekPickerOk.addEventListener('click', async () => {
        const v = elements.weekDatePicker.value;
        elements.weekPickerModal.classList.add('hidden');
        if (v) {
            currentWeekStart = getMonday(parseISO(v));
            await renderWeekTable();
        }
    });
    document.addEventListener('click', e => {
        if (!elements.weekPickerModal.contains(e.target) && e.target !== elements.weekLabel) {
            elements.weekPickerModal.classList.add('hidden');
        }
    });

    // Saisie manuelle
    elements.heuresManuellesCheck.addEventListener('change', onManualCheckChange);
    elements.btnSaveHeuresManuelles.addEventListener('click', onManualSave);
    elements.heuresManuellesMoisSelect.addEventListener('change', () => {
        currentMonthKey = elements.heuresManuellesMoisSelect.value;
        updateManualPanel();
        applyDayStates();
        refreshTotals();
    });

    // Paramètres
    elements.btnExportAll.addEventListener('click', exportAllToZip);
    elements.inputImport.addEventListener('change', async e => {
        const files = Array.from(e.target.files);
        e.target.value = '';
        if (files.length) await importFiles(files);
    });
    elements.bilanToggle.addEventListener('click', toggleBilanDetails);
    document.getElementById('btn-serveur-maison').addEventListener('click', () => {
        if (window.SyncMaison && SyncMaison.instance) SyncMaison.ouvrirReglages();
        else showToast(modeSecours ? 'Synchronisation indisponible en mode secours' : 'Module de synchronisation absent (sync-maison.js)', 'error');
    });

    // Modal
    elements.modalCancel.addEventListener('click', () => closeModal(false));
    elements.modalConfirmBtn.addEventListener('click', () => closeModal(true));
    elements.modalConfirm.addEventListener('click', e => { if (e.target === elements.modalConfirm) closeModal(false); });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (!elements.modalConfirm.classList.contains('hidden')) closeModal(false);
        else if (typeof isSheetOpen === 'function' && isSheetOpen()) closeSheet();
        else if (!elements.weekPickerModal.classList.contains('hidden')) elements.weekPickerModal.classList.add('hidden');
        else navigateBack();
    });
}

// ===== Service Worker =====
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    try {
        // La version dans l'URL change le nom du cache : une nouvelle version de l'app met à jour les fichiers.
        await navigator.serviceWorker.register(`sw.js?v=${APP_VERSION}`);
    } catch (error) {
        console.error('Service Worker registration failed:', error);
    }
}

// ===== Démarrage =====
async function initApp() {
    try {
        try {
            await initDB();
        } catch (error) {
            if (!error || !error.migration) throw error;
            // Migration annulée : la base d'origine est intacte. On l'ouvre en lecture seule.
            await openDBSecours();
            modeSecours = true;
        }
        try {
            if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        } catch (_) { /* non disponible */ }
        elements.appVersion.textContent = APP_VERSION;
        if (!modeSecours) configurerSynchro();   // avant toute écriture : chaque modification est confiée à la synchro
        initEventListeners();
        initAgenda();
        initPointage();
        await registerServiceWorker();

        if (modeSecours) {
            goHome();
            showModal('Mise à jour des données impossible',
                "La conversion de vos données pour le serveur maison n'a pas abouti et a été entièrement annulée : vos données sont intactes. Par sécurité, MesZeuR est en lecture seule. Exportez une copie, puis signalez le problème.",
                exportAllToZip, null, { confirmLabel: 'Exporter mes données', cancelLabel: 'Fermer', danger: false });
            return;
        }
        if (migrationRapport) {
            const r = migrationRapport;
            showToast(`Données mises à jour : ${r.entreprises} entreprise(s), ${r.emplois} emploi(s), ${r.heures} journée(s), ${r.pointages} pointage(s) conservés.`, 'success', 7000);
            if (r.orphelins.length) console.warn('[MesZeuR] références déjà cassées avant la migration, conservées :', r.orphelins);
        }

        // ?action=… vient du raccourci de l'icône ou du tag NFC ; on le retire pour qu'un rechargement ne le rejoue pas.
        const action = new URLSearchParams(location.search).get('action');
        if (action) history.replaceState(null, '', location.pathname);
        if (action === 'travail') await goToEntreprises();
        else await goHome();
        if (action === 'pointer') await pointer('nfc');
        startNfcScan();
        console.log(`MesZeuR v${APP_VERSION} initialized`);
    } catch (error) {
        console.error('App initialization failed:', error);
        showToast("Erreur d'initialisation", 'error');
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
