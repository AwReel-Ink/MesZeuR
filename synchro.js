// ===== MesZeuR — Synchronisation avec le serveur maison =====
// © 2026 LEROY Aurélien - Tous droits réservés
//
// Le module sync-maison.js (non modifié) fait tout le travail réseau. Ici :
//  - sa configuration (stores, lecture complète, copie lisible) ;
//  - « appliquer » : écriture directe dans IndexedDB des changements reçus (sans repasser
//    par addToStore & co, pour ne pas les renvoyer au serveur), puis mise à jour de l'écran
//    sans jamais écraser une saisie en cours.

function configurerSynchro() {
    if (!window.SyncMaison) {
        console.warn('[MesZeuR] sync-maison.js absent : synchronisation désactivée');
        return;
    }
    try {
        SyncMaison.configurer({
            app: 'meszeur',
            nom: 'MesZeuR',
            mode: 'complet',
            stores: DATA_STORES.slice(),          // ['entreprises', 'emplois', 'heures', 'pointages']
            toutLire: store => getAllFromStore(store),
            appliquer: appliquerChangements,
            // Copie lisible : le même ZIP que l'export manuel, rangé par le serveur dans exports/meszeur/
            copie: { nom: 'MesZeuR.zip', exporter: () => construireExportZip({ dateFixe: true }) }
        });
        SyncMaison.surEtat(afficherEtatSynchro);
    } catch (error) {
        console.error('[MesZeuR] configuration de la synchro impossible :', error);
    }
}

// ----- Réception des changements : [{ store, id, data }] (data === null → supprimé) -----
async function appliquerChangements(changements) {
    const utiles = (changements || []).filter(c => DATA_STORES.includes(c.store));
    if (!utiles.length) return;
    const saisie = capturerSaisieTableau();       // à faire AVANT d'écrire : ce que l'utilisateur a modifié à l'écran
    for (const c of utiles) await ecrireChangement(c);
    try {
        await rafraichirApresSynchro(utiles, saisie);
    } catch (error) {
        console.error('[MesZeuR] rafraîchissement après synchro :', error);   // les données sont écrites : on ne bloque pas la synchro
    }
}

function ecrireChangement(c) {
    if (c.data === null || c.data === undefined) {
        return dbRun(c.store, 'readwrite', st => st.delete(c.id));   // absent localement : sans erreur
    }
    const rec = { ...c.data };
    if (rec.id === undefined || rec.id === null || rec.id === '') rec.id = c.id;
    if (c.store !== 'heures') return dbRun(c.store, 'readwrite', st => st.put(rec));
    // Journée : une seule fiche par emploi et par date. Une autre fiche locale pour la même
    // journée (identifiant différent) bloquerait l'index unique : elle est remplacée.
    return new Promise((resolve, reject) => {
        const tx = db.transaction('heures', 'readwrite');
        const st = tx.objectStore('heures');
        const r = st.index('emploiId_date').getKey([rec.emploiId, rec.date]);
        r.onsuccess = () => {
            if (r.result !== undefined && r.result !== rec.id) st.delete(r.result);
            st.put(rec);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

// ----- Tableau : jours modifiés à l'écran mais pas encore enregistrés -----
function datesSemaineAffichee() {
    return currentWeekStart ? [...Array(7)].map((_, i) => formatDateISO(addDays(currentWeekStart, i))) : [];
}
function capturerSaisieTableau() {
    const dirty = new Set();
    if (!elements.pageHeures.classList.contains('active') || !currentEmploi) return { emploiId: null, dirty };
    datesSemaineAffichee().forEach(date => {
        if (!dayQuery('repos-checkbox', date)) return;
        if (!memeJournee(readDayFromDOM(date), heuresCache.get(date))) dirty.add(date);
    });
    return { emploiId: currentEmploi.id, dirty };
}
function ecrireJourDansDOM(date, rec) {
    const cb = dayQuery('repos-checkbox', date);
    if (!cb) return;
    cb.checked = !!(rec && rec.repos);
    dayQuery('input-pause', date).value = rec && rec.pause !== undefined ? rec.pause : (currentEmploi.pauseDefaut || DEFAULT_PAUSE);
    dayQuery('input-debut', date).value = (rec && rec.debut) || '';
    dayQuery('input-fin', date).value = (rec && rec.fin) || '';
}
function libelleJour(date) {
    const d = parseISO(date);
    return `${JOURS_FULL[(d.getDay() + 6) % 7].toLowerCase()} ${formatDateShort(d)}`;
}

async function rafraichirTableau(changes, saisie) {
    const avant = heuresCache;
    heuresCache = new Map((await getByIndex('heures', 'emploiId', currentEmploi.id)).map(h => [h.date, h]));
    const memeSaisie = saisie && saisie.emploiId === currentEmploi.id;
    const conflits = [];
    datesSemaineAffichee().forEach(date => {
        if (memeJournee(avant.get(date), heuresCache.get(date))) return;   // rien de neuf pour ce jour
        if (memeSaisie && saisie.dirty.has(date)) conflits.push(date);    // saisie en cours : on n'écrase pas
        else ecrireJourDansDOM(date, heuresCache.get(date));
    });
    if (changes.some(c => c.store === 'emplois' && c.id === currentEmploi.id)) updateManualPanel();
    applyDayStates();
    refreshTotals();
    if (!conflits.length) return;

    const jours = conflits.map(libelleJour).join(', ');
    const message = `${jours} : cette journée a été modifiée sur un autre appareil pendant votre saisie (pas encore enregistrée).`;
    if (!elements.modalConfirm.classList.contains('hidden')) {
        showToast(`${message} Votre saisie est conservée à l'écran.`, 'error', 9000);
        return;
    }
    showModal('Modifié sur un autre appareil',
        `${message} Gardez votre saisie (elle remplacera l'autre version quand vous enregistrerez) ou affichez la nouvelle version.`,
        () => {
            conflits.forEach(date => ecrireJourDansDOM(date, heuresCache.get(date)));
            applyDayStates();
            refreshTotals();
        }, null, { confirmLabel: 'Afficher la nouvelle version', cancelLabel: 'Garder ma saisie', danger: false });
}

function majEnteteEmploi() {
    const emploi = currentEmploi;
    elements.heuresEmploiPoste.textContent = emploi.poste;
    let info = emploi.cdi
        ? `CDI depuis le ${formatDate(emploi.dateDebut)}`
        : `CDD du ${formatDate(emploi.dateDebut)} au ${formatDate(emploi.dateFin)}`;
    if (emploi.pauseRemuneree) info += ' • Pause rémunérée';
    elements.heuresEmploiContrat.textContent = info;
    elements.pageTitle.textContent = emploi.poste;
}

// Met l'écran à jour après une synchro (ou un import : changes = []).
async function rafraichirApresSynchro(changes, saisie) {
    const touche = (store, id) => changes.some(c => c.store === store && c.id === id);
    let entrepriseSupprimee = false, emploiSupprime = false;

    if (currentEntreprise && touche('entreprises', currentEntreprise.id)) {
        const fresh = await getByKey('entreprises', currentEntreprise.id);
        if (fresh) currentEntreprise = fresh; else { currentEntreprise = null; entrepriseSupprimee = true; }
    }
    if (currentEmploi && touche('emplois', currentEmploi.id)) {
        const fresh = await getByKey('emplois', currentEmploi.id);
        if (fresh) currentEmploi = fresh; else { currentEmploi = null; emploiSupprime = true; }
    }

    const page = document.querySelector('.page.active')?.id;
    switch (page) {
        case 'page-entreprises':
            await loadEntreprises();
            break;
        case 'page-emplois':
            if (!currentEntreprise) {
                if (entrepriseSupprimee) showToast('Cette entreprise a été supprimée sur un autre appareil', 'error');
                await goToEntreprises();
            } else {
                elements.emploisEntrepriseNom.textContent = currentEntreprise.nom;
                elements.emploisEntrepriseAdresse.textContent = currentEntreprise.adresse;
                elements.pageTitle.textContent = currentEntreprise.nom;
                await loadEmplois(currentEntreprise.id);
            }
            break;
        case 'page-heures':
            if (!currentEmploi) {
                showToast('Cet emploi a été supprimé sur un autre appareil', 'error');
                if (currentEntreprise) await goToEmplois(); else await goToEntreprises();
            } else {
                majEnteteEmploi();
                await rafraichirTableau(changes, saisie);
            }
            break;
        case 'page-form-entreprise': {
            const id = elements.entrepriseId.value;
            if (id && touche('entreprises', id)) {
                const fresh = await getByKey('entreprises', id);
                showToast(fresh ? 'Cette entreprise vient d\'être modifiée sur un autre appareil : en enregistrant, votre version remplacera l\'autre.'
                    : 'Cette entreprise a été supprimée sur un autre appareil', 'error', 8000);
                if (!fresh) await goToEntreprises();
            }
            break;
        }
        case 'page-form-emploi': {
            const id = elements.emploiId.value;
            if (id && touche('emplois', id)) {
                const fresh = await getByKey('emplois', id);
                showToast(fresh ? 'Cet emploi vient d\'être modifié sur un autre appareil : en enregistrant, votre version remplacera l\'autre.'
                    : 'Cet emploi a été supprimé sur un autre appareil', 'error', 8000);
                if (!fresh) await goHome();
            }
            break;
        }
        case 'page-agenda':
            await rafraichirAgenda(changes);
            break;
        case 'page-settings':
            await calculerBilanGlobal();
            await renderPointagesList();
            break;
        default:
            break;
    }
    if (typeof pointageRefreshButton === 'function') pointageRefreshButton();
}

async function rafraichirAgenda(changes) {
    if (AG.drag) AG.renderApresDrag = true;      // pas de redessin pendant un glisser : on attend la fin
    else await agRender();
    if (AG.panneau && changes.some(c => c.store === 'heures' && c.id === AG.panneau.id)) {
        const fresh = await getByKey('heures', AG.panneau.id);
        if (!fresh) {
            closeSheet();
            showToast('Cette journée a été supprimée sur un autre appareil', 'error');
        } else {
            openDayPanel(fresh);
            showToast('Journée mise à jour depuis un autre appareil');
        }
    }
}

// ----- État affiché dans les Paramètres -----
function afficherEtatSynchro(e) {
    const el = document.getElementById('sync-etat');
    if (!el || !e) return;
    const libelles = {
        'inactif': '—', 'en-cours': '🔄 Synchronisation…', 'ok': '✅ Synchronisé',
        'hors-maison': '🏠 Hors de la maison (synchro au retour)', 'non-connecte': '🔑 Compte non connecté',
        'non-configure': '⚙️ Serveur non configuré', 'erreur': '⚠️ Erreur de synchro'
    };
    let texte = libelles[e.statut] || e.statut;
    if (e.derniere) texte += ` · dernière synchro ${new Date(e.derniere).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`;
    if (e.enAttente) texte += ` · ${e.enAttente} modification(s) en attente`;
    el.textContent = texte;
}
