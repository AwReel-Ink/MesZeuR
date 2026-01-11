// ===== MesZeuR Application =====
// © 2026 LEROY Aurélien - Tous droits réservés
// Version 1.3.6

const APP_VERSION = '1.3.6';
const DB_NAME = 'MesZeuRDB';
const DB_VERSION = 1;

// ===== State Management =====
let db = null;
let currentEntreprise = null;
let currentEmploi = null;
let currentWeekStart = null;

// ===== DOM Elements =====
const elements = {
    // Header
    btnBack: document.getElementById('btn-back'),
    btnSettings: document.getElementById('btn-settings'),
    pageTitle: document.getElementById('page-title'),
    
    // Pages
    pageHome: document.getElementById('page-home'),
    pageEntreprises: document.getElementById('page-entreprises'),
    pageFormEntreprise: document.getElementById('page-form-entreprise'),
    pageEmplois: document.getElementById('page-emplois'),
    pageFormEmploi: document.getElementById('page-form-emploi'),
    pageHeures: document.getElementById('page-heures'),
    pageSettings: document.getElementById('page-settings'),
    
    // Home
    btnTravail: document.getElementById('btn-travail'),
    
    // Entreprises
    btnAddEntreprise: document.getElementById('btn-add-entreprise'),
    listeEntreprises: document.getElementById('liste-entreprises'),
    
    // Form Entreprise
    formEntreprise: document.getElementById('form-entreprise'),
    formEntrepriseTitle: document.getElementById('form-entreprise-title'),
    entrepriseId: document.getElementById('entreprise-id'),
    entrepriseNom: document.getElementById('entreprise-nom'),
    entrepriseAdresse: document.getElementById('entreprise-adresse'),
    btnCancelEntreprise: document.getElementById('btn-cancel-entreprise'),
    
    // Emplois
    emploisEntrepriseNom: document.getElementById('emplois-entreprise-nom'),
    emploisEntrepriseAdresse: document.getElementById('emplois-entreprise-adresse'),
    btnEditEntreprise: document.getElementById('btn-edit-entreprise'),
    btnDeleteEntreprise: document.getElementById('btn-delete-entreprise'),
    btnAddEmploi: document.getElementById('btn-add-emploi'),
    listeEmplois: document.getElementById('liste-emplois'),
    
    // Form Emploi
    formEmploi: document.getElementById('form-emploi'),
    formEmploiTitle: document.getElementById('form-emploi-title'),
    emploiId: document.getElementById('emploi-id'),
    emploiEntrepriseId: document.getElementById('emploi-entreprise-id'),
    emploiPoste: document.getElementById('emploi-poste'),
    emploiDateDebut: document.getElementById('emploi-date-debut'),
    emploiCdi: document.getElementById('emploi-cdi'),
    emploiDateFin: document.getElementById('emploi-date-fin'),
    groupDateFin: document.getElementById('group-date-fin'),
    emploiTrajet: document.getElementById('emploi-trajet'),
    emploiPauseRemuneree: document.getElementById('emploi-pause-remuneree'),
    btnCancelEmploi: document.getElementById('btn-cancel-emploi'),
    
    // Heures
    heuresEmploiPoste: document.getElementById('heures-emploi-poste'),
    heuresEmploiContrat: document.getElementById('heures-emploi-contrat'),
    btnEditEmploi: document.getElementById('btn-edit-emploi'),
    btnDeleteEmploi: document.getElementById('btn-delete-emploi'),
    btnPrevWeek: document.getElementById('btn-prev-week'),
    btnNextWeek: document.getElementById('btn-next-week'),
    weekLabel: document.getElementById('week-label'),
    rowDates: document.getElementById('row-dates'),
    rowRepos: document.getElementById('row-repos'),
    rowJours: document.getElementById('row-jours'),
    rowPause: document.getElementById('row-pause'),
    rowDebut: document.getElementById('row-debut'),
    rowFin: document.getElementById('row-fin'),
    rowTotalJour: document.getElementById('row-total-jour'),
    totalSemaine: document.getElementById('total-semaine'),
    totalMois: document.getElementById('total-mois'),
    totalAnnee: document.getElementById('total-annee'),
    tempsReel: document.getElementById('temps-reel'),
    tempsReelTrajet: document.getElementById('temps-reel-trajet'),
    btnSaveHeures: document.getElementById('btn-save-heures'),
    cumulTotalEmploi: document.getElementById('cumul-total-emploi'),
    
    // Settings
    btnExportAll: document.getElementById('btn-export-all'),
    inputImport: document.getElementById('input-import'),
    
    // Modal
    modal: document.getElementById('modal-confirm'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalCancel: document.getElementById('modal-cancel'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn'),
    
    // Toast
    toast: document.getElementById('toast'),

    // Week picker 
    weekLabelInput: document.getElementById('week-label'),
    weekPickerModal: document.getElementById('week-picker-modal'),
    weekDatePicker: document.getElementById('week-date-picker'),
    weekPickerOk: document.getElementById('week-picker-ok'),

    // Heures manuelles
heuresManuellesCheck: document.getElementById('heures-manuelles-check'),
heuresManuellesInput: document.getElementById('heures-manuelles-input'),
heuresManuellesValue: document.getElementById('heures-manuelles-value'),
btnSaveHeuresManuelles: document.getElementById('btn-save-heures-manuelles'),

};

// ===== IndexedDB Setup =====
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            // Store Entreprises
            if (!database.objectStoreNames.contains('entreprises')) {
                const entreprisesStore = database.createObjectStore('entreprises', { keyPath: 'id', autoIncrement: true });
                entreprisesStore.createIndex('nom', 'nom', { unique: false });
                entreprisesStore.createIndex('lastActivity', 'lastActivity', { unique: false });
            }
            
            // Store Emplois
            if (!database.objectStoreNames.contains('emplois')) {
                const emploisStore = database.createObjectStore('emplois', { keyPath: 'id', autoIncrement: true });
                emploisStore.createIndex('entrepriseId', 'entrepriseId', { unique: false });
                emploisStore.createIndex('lastModified', 'lastModified', { unique: false });
            }
            
            // Store Heures
            if (!database.objectStoreNames.contains('heures')) {
                const heuresStore = database.createObjectStore('heures', { keyPath: 'id', autoIncrement: true });
                heuresStore.createIndex('emploiId', 'emploiId', { unique: false });
                heuresStore.createIndex('date', 'date', { unique: false });
                heuresStore.createIndex('emploiId_date', ['emploiId', 'date'], { unique: true });
            }
        };
    });
}

// ===== Database Operations =====
async function dbOperation(storeName, mode, operation) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = operation(store);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllFromStore(storeName) {
    return dbOperation(storeName, 'readonly', store => store.getAll());
}

async function getByKey(storeName, key) {
    return dbOperation(storeName, 'readonly', store => store.get(key));
}

async function addToStore(storeName, data) {
    return dbOperation(storeName, 'readwrite', store => store.add(data));
}

async function updateInStore(storeName, data) {
    return dbOperation(storeName, 'readwrite', store => store.put(data));
}

async function deleteFromStore(storeName, key) {
    return dbOperation(storeName, 'readwrite', store => store.delete(key));
}

async function getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ===== Navigation =====
function showPage(pageId, title = 'MesZeuR') {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    elements.pageTitle.textContent = title;
    
    // Show/hide back button
    const showBack = pageId !== 'page-home';
    elements.btnBack.classList.toggle('hidden', !showBack);
    elements.btnSettings.classList.toggle('hidden', pageId === 'page-settings');
}

function navigateBack() {
    const activePage = document.querySelector('.page.active').id;
    
    switch (activePage) {
        case 'page-entreprises':
            showPage('page-home');
            break;
        case 'page-form-entreprise':
            showPage('page-entreprises', 'Mes Entreprises');
            loadEntreprises();
            break;
        case 'page-emplois':
            showPage('page-entreprises', 'Mes Entreprises');
            loadEntreprises();
            break;
        case 'page-form-emploi':
            showPage('page-emplois', currentEntreprise.nom);
            loadEmplois(currentEntreprise.id);
            break;
        case 'page-heures':
            showPage('page-emplois', currentEntreprise.nom);
            loadEmplois(currentEntreprise.id);
            break;
        case 'page-settings':
            showPage('page-home');
            break;
        default:
            showPage('page-home');
    }
}

// ===== Entreprises =====
async function loadEntreprises() {
    const entreprises = await getAllFromStore('entreprises');
    
    // Sort by lastActivity (most recent first)
    entreprises.sort((a, b) => {
        const dateA = a.lastActivity ? new Date(a.lastActivity) : new Date(0);
        const dateB = b.lastActivity ? new Date(b.lastActivity) : new Date(0);
        return dateB - dateA;
    });
    
    elements.listeEntreprises.innerHTML = '';
    
    if (entreprises.length === 0) {
        elements.listeEntreprises.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>
                </svg>
                <p>Aucune entreprise enregistrée</p>
                <p>Cliquez sur + pour ajouter une entreprise</p>
            </div>
        `;
        return;
    }
    
    for (const entreprise of entreprises) {
        const emplois = await getByIndex('emplois', 'entrepriseId', entreprise.id);
        const hasActiveCDI = emplois.some(e => e.cdi);
        const hasActiveContract = emplois.some(e => e.cdi || (e.dateFin && new Date(e.dateFin) >= new Date()));
        
        let badgeClass = 'termine';
        let badgeText = 'Terminé';
        
        if (hasActiveCDI) {
            badgeClass = 'cdi';
            badgeText = 'CDI';
        } else if (hasActiveContract) {
            badgeClass = '';
            badgeText = 'En cours';
        }
        
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(entreprise.nom)}</div>
                <div class="list-item-subtitle">${escapeHtml(entreprise.adresse)}</div>
            </div>
            <span class="list-item-badge ${badgeClass}">${badgeText}</span>
            <span class="list-item-arrow">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
            </span>
        `;
        item.addEventListener('click', () => openEntreprise(entreprise));
        elements.listeEntreprises.appendChild(item);
    }
}

function openFormEntreprise(entreprise = null) {
    elements.formEntrepriseTitle.textContent = entreprise ? 'Modifier l\'entreprise' : 'Nouvelle Entreprise';
    elements.entrepriseId.value = entreprise ? entreprise.id : '';
    elements.entrepriseNom.value = entreprise ? entreprise.nom : '';
    elements.entrepriseAdresse.value = entreprise ? entreprise.adresse : '';
    showPage('page-form-entreprise', entreprise ? 'Modifier' : 'Nouvelle Entreprise');
}

async function saveEntreprise(event) {
    event.preventDefault();
    
    const entreprise = {
        nom: elements.entrepriseNom.value.trim(),
        adresse: elements.entrepriseAdresse.value.trim(),
        lastActivity: new Date().toISOString()
    };
    
    try {
        if (elements.entrepriseId.value) {
            entreprise.id = parseInt(elements.entrepriseId.value);
            await updateInStore('entreprises', entreprise);
            showToast('Entreprise modifiée', 'success');
        } else {
            await addToStore('entreprises', entreprise);
            showToast('Entreprise ajoutée', 'success');
        }
        
        showPage('page-entreprises', 'Mes Entreprises');
        loadEntreprises();
    } catch (error) {
        showToast('Erreur lors de l\'enregistrement', 'error');
        console.error(error);
    }
}

async function openEntreprise(entreprise) {
    currentEntreprise = entreprise;
    elements.emploisEntrepriseNom.textContent = entreprise.nom;
    elements.emploisEntrepriseAdresse.textContent = entreprise.adresse;
    showPage('page-emplois', entreprise.nom);
    loadEmplois(entreprise.id);
}

async function deleteEntreprise() {
    showModal(
        'Supprimer l\'entreprise ?',
        `Êtes-vous sûr de vouloir supprimer "${currentEntreprise.nom}" et tous ses emplois associés ?`,
        async () => {
            try {
                // Delete all emplois and their heures
                const emplois = await getByIndex('emplois', 'entrepriseId', currentEntreprise.id);
                for (const emploi of emplois) {
                    const heures = await getByIndex('heures', 'emploiId', emploi.id);
                    for (const heure of heures) {
                        await deleteFromStore('heures', heure.id);
                    }
                    await deleteFromStore('emplois', emploi.id);
                }
                
                await deleteFromStore('entreprises', currentEntreprise.id);
                showToast('Entreprise supprimée', 'success');
                showPage('page-entreprises', 'Mes Entreprises');
                loadEntreprises();
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
    
    // Sort by lastModified (most recent first)
    emplois.sort((a, b) => {
        const dateA = a.lastModified ? new Date(a.lastModified) : new Date(0);
        const dateB = b.lastModified ? new Date(b.lastModified) : new Date(0);
        return dateB - dateA;
    });
    
    elements.listeEmplois.innerHTML = '';
    
    if (emplois.length === 0) {
        elements.listeEmplois.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24">
                    <path fill="currentColor" d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/>
                </svg>
                <p>Aucun emploi enregistré</p>
                <p>Cliquez sur + pour ajouter un emploi</p>
            </div>
        `;
        return;
    }
    
    for (const emploi of emplois) {
        const isActive = emploi.cdi || (emploi.dateFin && new Date(emploi.dateFin) >= new Date());
        
        let badgeClass = 'termine';
        let badgeText = 'Terminé';
        
        if (emploi.cdi) {
            badgeClass = 'cdi';
            badgeText = 'CDI';
        } else if (isActive) {
            badgeClass = '';
            badgeText = formatDate(emploi.dateFin);
        }
        
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(emploi.poste)}</div>
                <div class="list-item-subtitle">Depuis le ${formatDate(emploi.dateDebut)}</div>
            </div>
            <span class="list-item-badge ${badgeClass}">${badgeText}</span>
            <span class="list-item-arrow">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
            </span>
        `;
        item.addEventListener('click', () => openEmploi(emploi));
        elements.listeEmplois.appendChild(item);
    }
}

function openFormEmploi(emploi = null) {
    elements.formEmploiTitle.textContent = emploi ? 'Modifier l\'emploi' : 'Nouvel Emploi';
    elements.emploiId.value = emploi ? emploi.id : '';
    elements.emploiEntrepriseId.value = currentEntreprise.id;
    elements.emploiPoste.value = emploi ? emploi.poste : '';
    elements.emploiDateDebut.value = emploi ? emploi.dateDebut : '';
    elements.emploiCdi.checked = emploi ? !emploi.cdi : true; // Inversé car le slider va de CDI à Temps déterminé
    elements.emploiDateFin.value = emploi ? (emploi.dateFin || '') : '';
    elements.emploiTrajet.value = emploi ? (emploi.trajet || 0) : 0;
    elements.emploiPauseRemuneree.checked = emploi ? emploi.pauseRemuneree : false;
    
    updateDateFinVisibility();
    showPage('page-form-emploi', emploi ? 'Modifier' : 'Nouvel Emploi');
}

function updateDateFinVisibility() {
    const isCDD = elements.emploiCdi.checked;
    elements.groupDateFin.style.display = isCDD ? 'block' : 'none';
    if (!isCDD) {
        elements.emploiDateFin.value = '';
    }
}

async function saveEmploi(event) {
    event.preventDefault();

    const isCDD = elements.emploiCdi.checked;
    const id = elements.emploiId.value ? parseInt(elements.emploiId.value) : null;

    // 🔧 CORRECTION : Récupérer l'emploi existant pour conserver heuresManuelles
    let emploiExistant = {};
    if (id) {
        const allEmplois = await getAllFromStore('emplois');
        emploiExistant = allEmplois.find(e => e.id === id) || {};
    }

    const emploi = {
        ...emploiExistant,  // ← Conserve heuresManuelles et autres données
        entrepriseId: parseInt(elements.emploiEntrepriseId.value),
        poste: elements.emploiPoste.value.trim(),
        dateDebut: elements.emploiDateDebut.value,
        cdi: !isCDD,
        dateFin: isCDD ? elements.emploiDateFin.value : null,
        trajet: parseInt(elements.emploiTrajet.value) || 0,
        pauseRemuneree: elements.emploiPauseRemuneree.checked,
        lastModified: new Date().toISOString()
    };

    try {
        if (id) {
            emploi.id = id;
            await updateInStore('emplois', emploi);
            showToast('Emploi modifié', 'success');
        } else {
            await addToStore('emplois', emploi);
            showToast('Emploi ajouté', 'success');
        }

        // Update entreprise lastActivity
        currentEntreprise.lastActivity = new Date().toISOString();
        await updateInStore('entreprises', currentEntreprise);

        showPage('page-emplois', currentEntreprise.nom);
        loadEmplois(currentEntreprise.id);
    } catch (error) {
        showToast('Erreur lors de l\'enregistrement', 'error');
        console.error(error);
    }
}

async function openEmploi(emploi) {
    currentEmploi = emploi;
    elements.heuresEmploiPoste.textContent = emploi.poste;
    
    let contratInfo = emploi.cdi ? 'CDI' : `CDD jusqu'au ${formatDate(emploi.dateFin)}`;
    if (emploi.pauseRemuneree) contratInfo += ' • Pause rémunérée';
    elements.heuresEmploiContrat.textContent = contratInfo;
    
    // Initialize week to current week or last modified week
    currentWeekStart = getMonday(new Date());
    
    showPage('page-heures', emploi.poste);
    await renderWeekTable();
}

async function deleteEmploi() {
    showModal(
        'Supprimer l\'emploi ?',
        `Êtes-vous sûr de vouloir supprimer "${currentEmploi.poste}" et toutes les heures associées ?`,
        async () => {
            try {
                // Delete all heures
                const heures = await getByIndex('heures', 'emploiId', currentEmploi.id);
                for (const heure of heures) {
                    await deleteFromStore('heures', heure.id);
                }
                
                await deleteFromStore('emplois', currentEmploi.id);
                showToast('Emploi supprimé', 'success');
                showPage('page-emplois', currentEntreprise.nom);
                loadEmplois(currentEntreprise.id);
            } catch (error) {
                showToast('Erreur lors de la suppression', 'error');
                console.error(error);
            }
        }
    );
}

// ===== Heures =====
function getMonday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    // Si dimanche (0), reculer de 6 jours; sinon reculer de (day - 1) jours
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDateISO(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateShort(date) {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function formatDateFull(date) {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
}

// Convertir heures décimales en format Xh:mm (ex: 124.60 → 124h36)
function formatDecimalToHoursMinutes(decimalHours) {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}h${minutes.toString().padStart(2, '0')}`;
}

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JOURS_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

async function renderWeekTable() {
    const weekEnd = addDays(currentWeekStart, 6);
    elements.weekLabel.value = `${formatDateFull(currentWeekStart)} - ${formatDateFull(weekEnd)}`;
    
    // Clear previous content
    elements.rowDates.innerHTML = '<th></th>';
    elements.rowRepos.innerHTML = '<th></th>';
    elements.rowJours.innerHTML = '<th></th>';
    
    // Clear input rows (keep label cell)
    const rowsToUpdate = [elements.rowPause, elements.rowDebut, elements.rowFin, elements.rowTotalJour];
    rowsToUpdate.forEach(row => {
        while (row.children.length > 1) {
            row.removeChild(row.lastChild);
        }
    });
    
    // Get existing heures for this week
    const heuresMap = {};
    const allHeures = await getByIndex('heures', 'emploiId', currentEmploi.id);
    allHeures.forEach(h => {
        heuresMap[h.date] = h;
    });
    
    // Render each day
    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(currentWeekStart, i);
        const dateStr = formatDateISO(dayDate);
        const dayNum = dayDate.getDay();
        const existingHeure = heuresMap[dateStr] || {};
        
        // Date header
        const thDate = document.createElement('th');
        thDate.textContent = formatDateShort(dayDate);
        elements.rowDates.appendChild(thDate);
        
        // Repos checkbox
        const thRepos = document.createElement('th');
        thRepos.innerHTML = `
            <label class="checkbox-container" title="Jour de repos">
                <input type="checkbox" class="repos-checkbox" data-date="${dateStr}" ${existingHeure.repos ? 'checked' : ''}>
                <span class="checkmark"></span>
            </label>
        `;
        elements.rowRepos.appendChild(thRepos);
        
        // Day name (i = 0 pour lundi, 1 pour mardi, etc.)
        const thJour = document.createElement('th');
        thJour.textContent = JOURS[i];
        thJour.title = JOURS_FULL[i];
        elements.rowJours.appendChild(thJour);
        
        // Pause input
        const tdPause = document.createElement('td');
        tdPause.innerHTML = `<input type="time" class="input-pause" data-date="${dateStr}" value="${existingHeure.pause || '00:30'}">`;
        elements.rowPause.appendChild(tdPause);
        
        // Début input
        const tdDebut = document.createElement('td');
        tdDebut.innerHTML = `<input type="time" class="input-debut" data-date="${dateStr}" value="${existingHeure.debut || ''}">`;
        elements.rowDebut.appendChild(tdDebut);
        
        // Fin input
        const tdFin = document.createElement('td');
        tdFin.innerHTML = `<input type="time" class="input-fin" data-date="${dateStr}" value="${existingHeure.fin || ''}">`;
        elements.rowFin.appendChild(tdFin);
        
        // Total jour
        const tdTotal = document.createElement('td');
        tdTotal.className = 'total-cell';
        tdTotal.id = `total-jour-${dateStr}`;
        tdTotal.textContent = '0H00';
        elements.rowTotalJour.appendChild(tdTotal);
    }
    
    // Add event listeners
    document.querySelectorAll('.repos-checkbox').forEach(cb => {
        cb.addEventListener('change', handleReposChange);
    });
    
    document.querySelectorAll('.input-pause, .input-debut, .input-fin').forEach(input => {
        input.addEventListener('change', calculateTotals);
    });
    
    // Initial calculation
    calculateTotals();
    await calculateMonthlyAndYearlyTotals();

    await checkHeuresManuelles();

        // Vérifier si le mois a des heures manuelles et griser les inputs
    const monthKey = `${currentWeekStart.getFullYear()}-${(currentWeekStart.getMonth() + 1).toString().padStart(2, '0')}`;
    const hasHeuresManuelles = currentEmploi.heuresManuelles && currentEmploi.heuresManuelles[monthKey] !== undefined;
    
    if (hasHeuresManuelles) {
        elements.heuresManuellesCheck.checked = true;
        elements.heuresManuellesInput.classList.remove('hidden');
        elements.heuresManuellesValue.value = currentEmploi.heuresManuelles[monthKey];
        
        // Griser les inputs du mois
        const currentMonth = currentWeekStart.getMonth();
        const currentYear = currentWeekStart.getFullYear();
        
        document.querySelectorAll('.heures-table input[type="time"]').forEach(input => {
            const dateStr = input.dataset.date;
            if (dateStr) {
                const inputDate = new Date(dateStr);
                if (inputDate.getMonth() === currentMonth && inputDate.getFullYear() === currentYear) {
                    input.disabled = true;
                    input.classList.add('disabled-manuel');
                }
            }
        });
    } else {
        elements.heuresManuellesCheck.checked = false;
        elements.heuresManuellesInput.classList.add('hidden');
        elements.heuresManuellesValue.value = '';
    }
}

async function checkHeuresManuelles() {
    if (!currentEmploi || !currentWeekStart) {
        elements.heuresManuellesCheck.checked = false;
        elements.heuresManuellesInput.classList.add('hidden');
        return;
    }

    const monthKey = `${currentWeekStart.getFullYear()}-${(currentWeekStart.getMonth() + 1).toString().padStart(2, '0')}`;
    const heuresManuelles = currentEmploi.heuresManuelles || {};

    if (heuresManuelles[monthKey] !== undefined) {
        elements.heuresManuellesCheck.checked = true;
        elements.heuresManuellesInput.classList.remove('hidden');
        elements.heuresManuellesValue.value = heuresManuelles[monthKey];
        document.querySelector('.heures-table')?.classList.add('mois-manuel');
    } else {
        elements.heuresManuellesCheck.checked = false;
        elements.heuresManuellesInput.classList.add('hidden');
        elements.heuresManuellesValue.value = '';
        document.querySelector('.heures-table')?.classList.remove('mois-manuel');
    }
}

function handleReposChange(event) {
    const dateStr = event.target.dataset.date;
    const isRepos = event.target.checked;
    
    // Disable/enable inputs for this day
    const inputs = document.querySelectorAll(`[data-date="${dateStr}"]`);
    inputs.forEach(input => {
        if (input.type !== 'checkbox') {
            input.disabled = isRepos;
            if (isRepos) {
                input.value = input.classList.contains('input-pause') ? '00:00' : '';
            }
        }
    });
    
    calculateTotals();
}

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    if (minutes < 0) minutes = 0;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}H${m.toString().padStart(2, '0')}`;
}

function calculateTotals() {
    let totalSemaine = 0;
    let totalSemaineAvecPauses = 0;
    let joursTravailes = 0;
    
    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(currentWeekStart, i);
        const dateStr = formatDateISO(dayDate);
        
        const reposCheckbox = document.querySelector(`.repos-checkbox[data-date="${dateStr}"]`);
        const pauseInput = document.querySelector(`.input-pause[data-date="${dateStr}"]`);
        const debutInput = document.querySelector(`.input-debut[data-date="${dateStr}"]`);
        const finInput = document.querySelector(`.input-fin[data-date="${dateStr}"]`);
        const totalJourCell = document.getElementById(`total-jour-${dateStr}`);
        
        if (reposCheckbox && reposCheckbox.checked) {
            totalJourCell.textContent = '0H00';
            continue;
        }
        
        const pauseMinutes = timeToMinutes(pauseInput?.value || '00:00');
        const debutMinutes = timeToMinutes(debutInput?.value);
        const finMinutes = timeToMinutes(finInput?.value);
        
        let totalJour = 0;
        let totalJourAvecPause = 0;
        
        if (debutMinutes && finMinutes && finMinutes > debutMinutes) {
            totalJourAvecPause = finMinutes - debutMinutes;
            
            if (currentEmploi.pauseRemuneree) {
                totalJour = totalJourAvecPause;
            } else {
                totalJour = totalJourAvecPause - pauseMinutes;
            }
            
            joursTravailes++;
        }
        
        if (totalJourCell) {
            totalJourCell.textContent = minutesToTime(totalJour);
        }
        
        totalSemaine += totalJour;
        totalSemaineAvecPauses += totalJourAvecPause;
    }
    
    elements.totalSemaine.textContent = minutesToTime(totalSemaine);
    
    // Temps réel (avec pauses)
    elements.tempsReel.textContent = minutesToTime(totalSemaineAvecPauses);
    
    // Temps réel + trajets
    const trajetMinutes = currentEmploi.trajet || 0;
    const totalTrajet = totalSemaineAvecPauses + (trajetMinutes * 2 * joursTravailes);
    elements.tempsReelTrajet.textContent = minutesToTime(totalTrajet);
}

async function calculateMonthlyAndYearlyTotals() {
    if (!currentEmploi || !currentWeekStart) return;

    const currentMonth = currentWeekStart.getMonth();
    const currentYear = currentWeekStart.getFullYear();
    const monthKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}`;

    let monthlyMinutes = 0;
    let yearlyMinutes = 0;
    let cumulTotalMinutes = 0;

    const heuresManuelles = currentEmploi.heuresManuelles || {};

    // Fonction helper pour calculer les minutes d'une journée
    function calculateDayMinutes(h) {
        if (!h || h.repos) return 0;
        if (!h.debut || !h.fin) return 0;
        
        const debut = timeToMinutes(h.debut);
        const fin = timeToMinutes(h.fin);
        const pause = timeToMinutes(h.pause || '00:00');
        
        if (fin > debut) {
            return (fin - debut) - pause;
        }
        return 0;
    }

    // Récupérer toutes les heures de cet emploi depuis le store
    const allHeures = await getByIndex('heures', 'emploiId', currentEmploi.id);

    // Calculer le mois courant
    if (heuresManuelles[monthKey] !== undefined) {
        const decimalHours = heuresManuelles[monthKey];
        const hours = Math.floor(decimalHours);
        const mins = Math.round((decimalHours - hours) * 60);
        monthlyMinutes = hours * 60 + mins;
    } else {
        allHeures.forEach(h => {
            const date = new Date(h.date);
            if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
                monthlyMinutes += calculateDayMinutes(h);
            }
        });
    }

    // Calculer l'année courante
    const moisAvecHeuresManuelles = new Set();
    
    Object.entries(heuresManuelles).forEach(([key, value]) => {
        const [y, m] = key.split('-').map(Number);
        if (y === currentYear) {
            const hours = Math.floor(value);
            const mins = Math.round((value - hours) * 60);
            yearlyMinutes += hours * 60 + mins;
            moisAvecHeuresManuelles.add(m);
        }
    });

    allHeures.forEach(h => {
        const date = new Date(h.date);
        if (date.getFullYear() === currentYear && !moisAvecHeuresManuelles.has(date.getMonth() + 1)) {
            yearlyMinutes += calculateDayMinutes(h);
        }
    });

    // ========== NOUVEAU : Calculer le cumul total (toutes années confondues) ==========
    
    // Regrouper par année pour éviter les doublons
    const minutesParAnnee = {};
    
    // Ajouter toutes les heures manuelles
    Object.entries(heuresManuelles).forEach(([key, value]) => {
        const [y, m] = key.split('-').map(Number);
        if (!minutesParAnnee[y]) {
            minutesParAnnee[y] = { manuels: new Set(), heuresJournalieres: 0, heuresManuelles: 0 };
        }
        const hours = Math.floor(value);
        const mins = Math.round((value - hours) * 60);
        minutesParAnnee[y].heuresManuelles += hours * 60 + mins;
        minutesParAnnee[y].manuels.add(m);
    });

    // Ajouter les heures journalières pour les mois sans heures manuelles
    allHeures.forEach(h => {
        const date = new Date(h.date);
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        
        if (!minutesParAnnee[y]) {
            minutesParAnnee[y] = { manuels: new Set(), heuresJournalieres: 0, heuresManuelles: 0 };
        }
        
        if (!minutesParAnnee[y].manuels.has(m)) {
            minutesParAnnee[y].heuresJournalieres += calculateDayMinutes(h);
        }
    });

    // Sommer toutes les années
    Object.values(minutesParAnnee).forEach(annee => {
        cumulTotalMinutes += annee.heuresManuelles + annee.heuresJournalieres;
    });

    // ========== Affichage ==========
    
    // Temps du mois
    const monthlyHours = Math.floor(monthlyMinutes / 60);
    const monthlyMins = monthlyMinutes % 60;
    elements.totalMois.textContent = `${monthlyHours}H${monthlyMins.toString().padStart(2, '0')}`;

    // Temps de l'année
    const yearlyHours = Math.floor(yearlyMinutes / 60);
    const yearlyMins = yearlyMinutes % 60;
    elements.totalAnnee.textContent = `${yearlyHours}H${yearlyMins.toString().padStart(2, '0')}`;

    // Cumul total (toutes années)
    const cumulHours = Math.floor(cumulTotalMinutes / 60);
    const cumulMins = cumulTotalMinutes % 60;
    if (elements.cumulTotalEmploi) {
        elements.cumulTotalEmploi.textContent = `${cumulHours}H${cumulMins.toString().padStart(2, '0')}`;
    }
}

async function saveHeures() {
    try {
        for (let i = 0; i < 7; i++) {
            const dayDate = addDays(currentWeekStart, i);
            const dateStr = formatDateISO(dayDate);
            
            const reposCheckbox = document.querySelector(`.repos-checkbox[data-date="${dateStr}"]`);
            const pauseInput = document.querySelector(`.input-pause[data-date="${dateStr}"]`);
            const debutInput = document.querySelector(`.input-debut[data-date="${dateStr}"]`);
            const finInput = document.querySelector(`.input-fin[data-date="${dateStr}"]`);
            
            const heureData = {
                emploiId: currentEmploi.id,
                date: dateStr,
                repos: reposCheckbox?.checked || false,
                pause: pauseInput?.value || '00:00',
                debut: debutInput?.value || '',
                fin: finInput?.value || ''
            };
            
            // Check if entry exists
            const existing = await getByIndex('heures', 'emploiId', currentEmploi.id);
            const existingHeure = existing.find(h => h.date === dateStr);
            
            if (existingHeure) {
                heureData.id = existingHeure.id;
                await updateInStore('heures', heureData);
            } else {
                await addToStore('heures', heureData);
            }
        }
        
        // Update emploi lastModified
        currentEmploi.lastModified = new Date().toISOString();
        await updateInStore('emplois', currentEmploi);
        
        // Update entreprise lastActivity
        currentEntreprise.lastActivity = new Date().toISOString();
        await updateInStore('entreprises', currentEntreprise);
        
        await calculateMonthlyAndYearlyTotals();
        showToast('Heures enregistrées', 'success');
    } catch (error) {
        showToast('Erreur lors de l\'enregistrement', 'error');
        console.error(error);
    }
}

async function navigateWeek(direction) {
    currentWeekStart = addDays(currentWeekStart, direction * 7);
    await renderWeekTable();
}

// ===== Export ODS =====
async function exportAllToODS() {
    try {
        const entreprises = await getAllFromStore('entreprises');
        
        if (entreprises.length === 0) {
            showToast('Aucune donnée à exporter', 'error');
            return;
        }
        
        for (const entreprise of entreprises) {
            const emplois = await getByIndex('emplois', 'entrepriseId', entreprise.id);
            
            for (const emploi of emplois) {
                await exportEmploiToODS(entreprise, emploi);
            }
        }
        
        showToast('Export terminé', 'success');
    } catch (error) {
        showToast('Erreur lors de l\'export', 'error');
        console.error(error);
    }
}

async function exportEmploiToODS(entreprise, emploi) {
    const heures = await getByIndex('heures', 'emploiId', emploi.id);
    
    // Sort heures by date
    heures.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Create ODS content (simplified XML format)
    const odsContent = generateODSContent(entreprise, emploi, heures);
    
    // Create and download file
    const filename = `${sanitizeFilename(entreprise.nom)}-${sanitizeFilename(emploi.poste)}.ods`;
    await downloadODS(odsContent, filename);
}

function generateODSContent(entreprise, emploi, heures) {
    const monthlyData = {};

    heures.forEach(heure => {
        const date = new Date(heure.date);
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = [];
        }
        monthlyData[monthKey].push(heure);
    });

    let sheets = '';

    const cell = (value) => `<table:table-cell office:value-type="string"><text:p>${escapeXml(String(value ?? ''))}</text:p></table:table-cell>`;
    const emptyCell = () => `<table:table-cell office:value-type="string"/>`;

    sheets += `<table:table table:name="Informations">
        <table:table-row>${cell('Entreprise')}${cell(entreprise.nom)}</table:table-row>
        <table:table-row>${cell('Adresse')}${cell(entreprise.adresse)}</table:table-row>
        <table:table-row>${cell('Poste')}${cell(emploi.poste)}</table:table-row>
        <table:table-row>${cell('Type de contrat')}${cell(emploi.cdi ? 'CDI' : 'CDD')}</table:table-row>
        <table:table-row>${cell('Date de début')}${cell(formatDate(emploi.dateDebut))}</table:table-row>
        ${!emploi.cdi ? `<table:table-row>${cell('Date de fin')}${cell(formatDate(emploi.dateFin))}</table:table-row>` : ''}
        <table:table-row>${cell('Temps de trajet')}${cell((emploi.trajet || 0) + ' minutes')}</table:table-row>
        <table:table-row>${cell('Pause rémunérée')}${cell(emploi.pauseRemuneree ? 'Oui' : 'Non')}</table:table-row>
    </table:table>`;

    // Récupérer les heures manuelles
    const heuresManuelles = emploi.heuresManuelles || {};

    Object.keys(monthlyData).sort().forEach(monthKey => {
        const monthHeures = monthlyData[monthKey];
        const [year, month] = monthKey.split('-');
        const monthName = new Date(year, parseInt(month) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

        // Vérifier si ce mois a des heures manuelles
        if (heuresManuelles[monthKey] !== undefined) {
            // Mois avec saisie manuelle
            sheets += `<table:table table:name="${escapeXml(monthName)}">
                <table:table-row>${cell('Type de saisie')}${cell('Heures manuelles')}</table:table-row>
                <table:table-row>${cell('Total du mois')}${cell(heuresManuelles[monthKey] + 'h')}</table:table-row>
            </table:table>`;
        } else {
            // Mois avec détail journalier
            sheets += `<table:table table:name="${escapeXml(monthName)}">
                <table:table-row>${cell('Date')}${cell('Jour')}${cell('Repos')}${cell('Début')}${cell('Fin')}${cell('Pause')}${cell('Total')}</table:table-row>`;

            let monthTotal = 0;

            monthHeures.forEach(heure => {
                const date = new Date(heure.date);
                const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
                const jourNom = JOURS_FULL[dayIndex];

                let total = 0;
                if (!heure.repos && heure.debut && heure.fin) {
                    const debutMin = timeToMinutes(heure.debut);
                    const finMin = timeToMinutes(heure.fin);
                    const pauseMin = timeToMinutes(heure.pause || '00:00');
                    if (finMin > debutMin) {
                        total = emploi.pauseRemuneree ? (finMin - debutMin) : (finMin - debutMin - pauseMin);
                    }
                }
                monthTotal += total;

                sheets += `<table:table-row>${cell(formatDate(heure.date))}${cell(jourNom)}${cell(heure.repos ? 'Oui' : 'Non')}${cell(heure.debut || '')}${cell(heure.fin || '')}${cell(heure.pause || '00:00')}${cell(minutesToTime(total))}</table:table-row>`;
            });

            sheets += `<table:table-row>${cell('Total du mois')}${emptyCell()}${emptyCell()}${emptyCell()}${emptyCell()}${emptyCell()}${cell(minutesToTime(monthTotal))}</table:table-row>`;
            sheets += `</table:table>`;
        }
    });

    return sheets;
}

async function downloadODS(content, filename) {
    const zip = new JSZip();
    
    zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { compression: 'STORE' });
    
    zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
    <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
    <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
    <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`);
    
    zip.file('styles.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" 
                        xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
                        office:version="1.2">
</office:document-styles>`);
    
    zip.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
                         xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
                         xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
                         office:version="1.2">
    <office:body>
        <office:spreadsheet>
            ${content}
        </office:spreadsheet>
    </office:body>
</office:document-content>`);
    
    const blob = await zip.generateAsync({ 
        type: 'blob',
        mimeType: 'application/vnd.oasis.opendocument.spreadsheet'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ===== Import ODS =====
async function importODS(file) {
    try {
        const content = await file.text();
        
        // Parse the FODS XML
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');
        
        // Extract data from sheets
        const tables = doc.querySelectorAll('table\\:table, table');
        
        if (tables.length === 0) {
            showToast('Format de fichier invalide', 'error');
            return;
        }
        
        // Find info sheet
        let entrepriseNom = '';
        let entrepriseAdresse = '';
        let emploiPoste = '';
        let emploiCdi = false;
        let emploiDateDebut = '';
        let emploiDateFin = '';
        let emploiTrajet = 0;
        let emploiPauseRemuneree = false;
        
        tables.forEach(table => {
            const tableName = table.getAttribute('table:name') || '';
            
            if (tableName === 'Informations') {
                const rows = table.querySelectorAll('table\\:table-row, table-row');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('table\\:table-cell, table-cell');
                    if (cells.length >= 2) {
                        const label = cells[0].textContent.trim();
                        const value = cells[1].textContent.trim();
                        
                        switch (label) {
                            case 'Entreprise': entrepriseNom = value; break;
                            case 'Adresse': entrepriseAdresse = value; break;
                            case 'Poste': emploiPoste = value; break;
                            case 'Type de contrat': emploiCdi = value === 'CDI'; break;
                            case 'Date de début': emploiDateDebut = parseImportDate(value); break;
                            case 'Date de fin': emploiDateFin = parseImportDate(value); break;
                            case 'Temps de trajet': emploiTrajet = parseInt(value) || 0; break;
                            case 'Pause rémunérée': emploiPauseRemuneree = value === 'Oui'; break;
                        }
                    }
                });
            }
        });
        
        if (!entrepriseNom || !emploiPoste) {
            showToast('Données incomplètes dans le fichier', 'error');
            return;
        }
        
        // Find or create entreprise
        const entreprises = await getAllFromStore('entreprises');
        let entreprise = entreprises.find(e => e.nom === entrepriseNom && e.adresse === entrepriseAdresse);
        
        if (!entreprise) {
            const id = await addToStore('entreprises', {
                nom: entrepriseNom,
                adresse: entrepriseAdresse,
                lastActivity: new Date().toISOString()
            });
            entreprise = await getByKey('entreprises', id);
        }
        
        // Create emploi
        const emploiId = await addToStore('emplois', {
            entrepriseId: entreprise.id,
            poste: emploiPoste,
            dateDebut: emploiDateDebut,
            cdi: emploiCdi,
            dateFin: emploiDateFin || null,
            trajet: emploiTrajet,
            pauseRemuneree: emploiPauseRemuneree,
            lastModified: new Date().toISOString()
        });
        
        // Import heures from monthly sheets
        let heuresImported = 0;
        
        tables.forEach(table => {
            const tableName = table.getAttribute('table:name') || '';
            
            if (tableName !== 'Informations') {
                const rows = table.querySelectorAll('table\\:table-row, table-row');
                
                rows.forEach((row, index) => {
                    if (index === 0) return; // Skip header
                    
                    const cells = row.querySelectorAll('table\\:table-cell, table-cell');
                    if (cells.length >= 6) {
                        const dateStr = parseImportDate(cells[0].textContent.trim());
                        const repos = cells[2].textContent.trim() === 'Oui';
                        const debut = cells[3].textContent.trim();
                        const fin = cells[4].textContent.trim();
                        const pause = cells[5].textContent.trim();
                        
                        if (dateStr && dateStr !== 'Total du mois') {
                            addToStore('heures', {
                                emploiId: emploiId,
                                date: dateStr,
                                repos: repos,
                                debut: debut,
                                fin: fin,
                                pause: pause || '00:00'
                            });
                            heuresImported++;
                        }
                    }
                });
            }
        });
        
        showToast(`Import réussi: ${heuresImported} entrées`, 'success');
        
    } catch (error) {
        showToast('Erreur lors de l\'import', 'error');
        console.error(error);
    }
}

function parseImportDate(dateStr) {
    if (!dateStr) return '';
    
    // Try DD/MM/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    
    // Try YYYY-MM-DD format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateStr;
    }
    
    return '';
}

// ===== Utility Functions =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ_-]/g, '_');
}

// ===== Modal =====
let modalCallback = null;

function showModal(title, message, callback) {
    elements.modalTitle.textContent = title;
    elements.modalMessage.textContent = message;
    modalCallback = callback;
    elements.modal.classList.remove('hidden');
}

function hideModal() {
    elements.modal.classList.add('hidden');
    modalCallback = null;
}

// ===== Toast =====
let toastTimeout = null;

function showToast(message, type = '') {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    
    elements.toast.textContent = message;
    elements.toast.className = 'toast';
    if (type) {
        elements.toast.classList.add(type);
    }
    
    toastTimeout = setTimeout(() => {
        elements.toast.classList.add('hidden');
    }, 3000);
}

// ===== Event Listeners =====
function initEventListeners() {
    // Navigation
    elements.btnBack.addEventListener('click', navigateBack);
    elements.btnSettings.addEventListener('click', () => {
        showPage('page-settings', 'Paramètres');
        calculerBilanGlobal();
    });

    // Home
    elements.btnTravail.addEventListener('click', () => {
        showPage('page-entreprises', 'Mes Entreprises');
        loadEntreprises();
    });

    // Entreprises
    elements.btnAddEntreprise.addEventListener('click', () => openFormEntreprise());
    elements.formEntreprise.addEventListener('submit', saveEntreprise);
    elements.btnCancelEntreprise.addEventListener('click', () => {
        showPage('page-entreprises', 'Mes Entreprises');
        loadEntreprises();
    });

    // Emplois
    elements.btnEditEntreprise.addEventListener('click', () => openFormEntreprise(currentEntreprise));
    elements.btnDeleteEntreprise.addEventListener('click', deleteEntreprise);
    elements.btnAddEmploi.addEventListener('click', () => openFormEmploi());
    elements.formEmploi.addEventListener('submit', saveEmploi);
    elements.emploiCdi.addEventListener('change', updateDateFinVisibility);
    elements.btnCancelEmploi.addEventListener('click', () => {
        showPage('page-emplois', currentEntreprise.nom);
        loadEmplois(currentEntreprise.id);
    });

    // Heures
    elements.btnEditEmploi.addEventListener('click', () => openFormEmploi(currentEmploi));
    elements.btnDeleteEmploi.addEventListener('click', deleteEmploi);
    elements.btnPrevWeek.addEventListener('click', () => navigateWeek(-1));
    elements.btnNextWeek.addEventListener('click', () => navigateWeek(1));
    elements.btnSaveHeures.addEventListener('click', saveHeures);

    // Week picker - clic sur la date pour ouvrir le sélecteur
    elements.weekLabel.addEventListener('click', () => {
        if (!currentEmploi) return;
        elements.weekDatePicker.value = formatDateISO(currentWeekStart);
        
        // Définir les limites selon le contrat
        elements.weekDatePicker.min = currentEmploi.dateDebut;
        if (!currentEmploi.cdi && currentEmploi.dateFin) {
            elements.weekDatePicker.max = currentEmploi.dateFin;
        } else {
            elements.weekDatePicker.removeAttribute('max');
        }
        
        elements.weekPickerModal.classList.remove('hidden');
    });

    // Week picker - validation
    elements.weekPickerOk.addEventListener('click', async () => {
        const selectedDate = elements.weekDatePicker.value;
        if (selectedDate) {
            currentWeekStart = getMonday(new Date(selectedDate));
            await renderWeekTable();
        }
        elements.weekPickerModal.classList.add('hidden');
    });

    // Week picker - fermer en cliquant ailleurs
    document.addEventListener('click', (e) => {
        if (!elements.weekPickerModal.contains(e.target) && e.target !== elements.weekLabel) {
            elements.weekPickerModal.classList.add('hidden');
        }
    });

// Heures manuelles - checkbox toggle
elements.heuresManuellesCheck.addEventListener('change', async function() {
    const isChecked = this.checked;
    const currentMonth = currentWeekStart.getMonth();
    const currentYear = currentWeekStart.getFullYear();
    const monthKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}`;
    
    if (isChecked) {
        elements.heuresManuellesInput.classList.remove('hidden');
        
        // Griser les inputs du mois
        document.querySelectorAll('.heures-table input[type="time"]').forEach(input => {
            const dateStr = input.dataset.date;
            if (dateStr) {
                const inputDate = new Date(dateStr);
                if (inputDate.getMonth() === currentMonth && inputDate.getFullYear() === currentYear) {
                    input.disabled = true;
                    input.classList.add('disabled-manuel');
                }
            }
        });
        
    } else {
        // DÉCOCHAGE : Supprimer les heures manuelles ET SAUVEGARDER
        elements.heuresManuellesInput.classList.add('hidden');
        elements.heuresManuellesValue.value = '';
        
        // Supprimer de l'objet
        if (currentEmploi.heuresManuelles && currentEmploi.heuresManuelles[monthKey] !== undefined) {
            delete currentEmploi.heuresManuelles[monthKey];
            
            // SAUVEGARDER EN BASE
            await updateInStore('emplois', currentEmploi);
            
            showToast('Heures manuelles supprimées');
        }
        
        // Dégrisser les inputs du mois
        document.querySelectorAll('.heures-table input[type="time"]').forEach(input => {
            const dateStr = input.dataset.date;
            if (dateStr) {
                const inputDate = new Date(dateStr);
                if (inputDate.getMonth() === currentMonth && inputDate.getFullYear() === currentYear) {
                    input.disabled = false;
                    input.classList.remove('disabled-manuel');
                }
            }
        });
        
        // Recalculer les totaux
        await calculateMonthlyAndYearlyTotals();
    }
});

    // Heures manuelles - sauvegarde
    elements.btnSaveHeuresManuelles.addEventListener('click', async () => {
        if (!currentEmploi || !currentWeekStart) return;

        const heures = parseFloat(elements.heuresManuellesValue.value);
        if (isNaN(heures) || heures < 0) {
            showToast('Veuillez entrer un nombre d\'heures valide', 'error');
            return;
        }

        const monthKey = `${currentWeekStart.getFullYear()}-${(currentWeekStart.getMonth() + 1).toString().padStart(2, '0')}`;

        const heuresManuelles = currentEmploi.heuresManuelles || {};
        heuresManuelles[monthKey] = heures;

        await updateInStore('emplois', {
            ...currentEmploi,
            heuresManuelles
        });

        currentEmploi.heuresManuelles = heuresManuelles;

        showToast('Heures mensuelles enregistrées', 'success');
        await calculateMonthlyAndYearlyTotals();
    });

    // Settings
    elements.btnExportAll.addEventListener('click', exportAllToODS);
    elements.inputImport.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importODS(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Modal
    elements.modalCancel.addEventListener('click', hideModal);
    elements.modalConfirmBtn.addEventListener('click', () => {
        if (modalCallback) {
            modalCallback();
        }
        hideModal();
    });
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) {
            hideModal();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!elements.modal.classList.contains('hidden')) {
                hideModal();
            } else if (!elements.weekPickerModal.classList.contains('hidden')) {
                elements.weekPickerModal.classList.add('hidden');
            } else {
                navigateBack();
            }
        }
    });
}

    // ===== Service Worker Registration =====
    async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker registered:', registration.scope);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

// ========================================
// BILAN GLOBAL
// ========================================

// Convertir minutes en années/mois/jours (base: 35h/semaine, 52 semaines)
function convertirMinutesEnDuree(totalMinutes) {
    const heuresParAn = 35 * 52; // 1820 heures par an
    const heuresParMois = heuresParAn / 12; // ~151.67 heures par mois
    const heuresParJour = 7; // 7 heures par jour
    
    const totalHeures = totalMinutes / 60;
    
    const annees = Math.floor(totalHeures / heuresParAn);
    const resteApresAnnees = totalHeures % heuresParAn;
    
    const mois = Math.floor(resteApresAnnees / heuresParMois);
    const resteApresMois = resteApresAnnees % heuresParMois;
    
    const jours = Math.floor(resteApresMois / heuresParJour);
    
    return { annees, mois, jours };
}

// Calculer le bilan global
async function calculerBilanGlobal() {
    const bilanList = document.getElementById('bilan-emplois-list');
    const bilanTotalHeures = document.getElementById('bilan-total-heures');
    const bilanTotalDuree = document.getElementById('bilan-total-duree');

    if (!bilanList) return;

    bilanList.innerHTML = '';
    let totalMinutesGlobal = 0;

    // Récupérer tous les emplois et entreprises
    const emplois = await getAllFromStore('emplois');
    const allEntreprises = await getAllFromStore('entreprises');

    // Parcourir tous les emplois
    for (const emploi of emplois) {
        let totalMinutesEmploi = 0;

        // 1. Récupérer les heures du store 'heures' (saisie quotidienne)
        const heuresEmploi = await getByIndex('heures', 'emploiId', emploi.id);

        heuresEmploi.forEach(h => {
            if (h && !h.repos && h.debut && h.fin) {
                const debut = timeToMinutes(h.debut);
                const fin = timeToMinutes(h.fin);
                const pause = timeToMinutes(h.pause || '00:00');

                if (fin > debut) {
                    totalMinutesEmploi += (fin - debut) - pause;
                }
            }
        });

        // 2. Ajouter les heures manuelles stockées dans l'emploi
        if (emploi.heuresManuelles && typeof emploi.heuresManuelles === 'object') {
            Object.values(emploi.heuresManuelles).forEach(heuresDecimales => {
                const minutes = Math.round(parseFloat(heuresDecimales) * 60);
                totalMinutesEmploi += minutes;
            });
        }

        // Récupérer l'entreprise pour afficher son nom avec l'emploi
        const entreprise = allEntreprises.find(e => e.id === emploi.entrepriseId);
        const nomComplet = entreprise ? `${entreprise.nom} - ${emploi.poste}` : emploi.poste;

        if (totalMinutesEmploi > 0) {
            const heures = Math.floor(totalMinutesEmploi / 60);
            const mins = totalMinutesEmploi % 60;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'bilan-emploi-item';
            itemDiv.innerHTML = `
                <span class="bilan-emploi-nom">${nomComplet}</span>
                <span class="bilan-emploi-heures">${heures}H${mins.toString().padStart(2, '0')}</span>
            `;
            bilanList.appendChild(itemDiv);
        }

        totalMinutesGlobal += totalMinutesEmploi;
    }

    // Si aucun emploi avec des heures
    if (bilanList.children.length === 0) {
        bilanList.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Aucune heure enregistrée</p>';
    }

    // Afficher le total
    const totalHeures = Math.floor(totalMinutesGlobal / 60);
    const totalMins = totalMinutesGlobal % 60;
    bilanTotalHeures.textContent = `${totalHeures}H${totalMins.toString().padStart(2, '0')}`;

    // Convertir en années/mois/jours
    const duree = convertirMinutesEnDuree(totalMinutesGlobal);
    bilanTotalDuree.textContent = `${duree.annees} année(s), ${duree.mois} mois, ${duree.jours} jour(s)`;
}

// Toggle pour afficher/masquer le détail du bilan
function toggleBilanDetails() {
    const list = document.getElementById('bilan-emplois-list');
    const icon = document.querySelector('.bilan-toggle-icon');
    
    if (list.classList.contains('collapsed')) {
        list.classList.remove('collapsed');
        icon.classList.add('open');
    } else {
        list.classList.add('collapsed');
        icon.classList.remove('open');
    }
}

// ===== App Initialization =====
async function initApp() {
    try {
        await initDB();
        initEventListeners();
        await registerServiceWorker();
        
        // Show home page
        showPage('page-home');
        
        console.log(`MesZeuR v${APP_VERSION} initialized`);
    } catch (error) {
        console.error('App initialization failed:', error);
        showToast('Erreur d\'initialisation', 'error');
    }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

