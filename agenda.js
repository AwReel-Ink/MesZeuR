// ===== MesZeuR — Vue agenda =====
// © 2026 LEROY Aurélien - Tous droits réservés
// Lit et écrit exactement les mêmes journées que la vue tableau (store "heures").

const AG = {
    view: 'week',            // 'week' | 'day'
    weekStart: null,         // lundi de la semaine affichée
    day: null,               // jour affiché en vue jour
    emplois: [],
    entreprises: [],
    records: [],             // journées de la période affichée
    showWeekend: prefGet('meszeur-weekend', '0') === '1',
    range: [6, 20],          // heures affichées (début, fin)
    hourH: 52,               // hauteur d'une heure en px
    scrollPending: true,
    drag: null,
    suppressClick: false,
    horairesCache: new Map() // emploiId -> horaires déduits de l'historique
};
const AG_COLORS = ['#2f80ed', '#27ae60', '#e67e22', '#8e44ad', '#16a085', '#d63384', '#3f51b5', '#8d6e63'];
const JOURS_COURT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const agEl = id => document.getElementById(id);

// ===== Petits utilitaires =====
const emploiColor = emploi => AG_COLORS[((emploi && emploi.id) || 0) % AG_COLORS.length];
const fmtHM = t => { if (!t) return ''; const [h, m] = t.split(':'); return `${Number(h)}h${m}`; };
const minToHHMM = min => { min = ((Math.round(min) % 1440) + 1440) % 1440; return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; };
const dayIndex = iso => (parseISO(iso).getDay() + 6) % 7;
const agEmploi = id => AG.emplois.find(e => e.id === id);
const agEntreprise = id => AG.entreprises.find(e => e.id === id);
const byRecentStart = (a, b) => (b.dateDebut || '').localeCompare(a.dateDebut || '') || (b.id - a.id);
const nowMinutes = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
function isLandscape() {
    return window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches || window.innerWidth >= 900;
}
function dayTitle(iso) {
    const d = parseISO(iso);
    return `${JOURS_FULL[dayIndex(iso)]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}
function contratLabel(e) {
    return e.cdi ? `CDI depuis le ${formatDate(e.dateDebut)}` : `${formatDate(e.dateDebut)} → ${formatDate(e.dateFin)}`;
}

// Horaires habituels d'un emploi pour un jour : ceux de l'emploi, sinon déduits de son historique.
// habituel = false quand ce jour n'est pas un jour travaillé (on reprend alors un autre jour travaillé).
async function horaireFor(emploi, iso) {
    const i = dayIndex(iso);
    const pauseDef = emploi.pauseDefaut || DEFAULT_PAUSE;
    const usable = h => h && h.travaille && h.debut && h.fin;
    let hs = emploi.horaires;
    if (!horairesUsable(hs)) {
        if (!AG.horairesCache.has(emploi.id)) AG.horairesCache.set(emploi.id, await inferHoraires(emploi));
        hs = AG.horairesCache.get(emploi.id);
    }
    if (hs) {
        if (usable(hs[i])) return { ...hs[i], pause: hs[i].pause || pauseDef, habituel: true };
        const ref = hs.find(usable);
        if (ref) return { ...ref, pause: ref.pause || pauseDef, habituel: false };
    }
    return { travaille: true, debut: '09:00', fin: '17:00', pause: pauseDef, habituel: false };
}

// ===== Ouverture / navigation =====
async function openAgenda() {
    showPage('page-agenda', 'MesZeuR');
    if (!AG.weekStart) agGoToday(false);
    AG.horairesCache.clear();
    AG.scrollPending = true;
    await agRender();
}

function agGoToday(render = true) {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    AG.day = t;
    AG.weekStart = getMonday(t);
    AG.scrollPending = true;
    if (render) agRender();
}

function agNav(dir) {
    if (AG.view === 'day') {
        AG.day = addDays(AG.day, dir);
        AG.weekStart = getMonday(AG.day);
    } else {
        AG.weekStart = addDays(AG.weekStart, dir * 7);
        AG.day = new Date(AG.weekStart);
    }
    AG.scrollPending = true;
    agRender();
}

function agSetView(view) {
    if (view === AG.view) return;
    AG.view = view;
    if (view === 'day') {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const inWeek = getMonday(today).getTime() === AG.weekStart.getTime();
        AG.day = inWeek ? today : new Date(AG.weekStart);
    } else {
        AG.weekStart = getMonday(AG.day);
    }
    AG.scrollPending = true;
    agRender();
}

// Jours affichés. Portrait : lundi → vendredi, samedi/dimanche repliés (sauf s'ils contiennent une journée).
function agDays() {
    if (AG.view === 'day') {
        const iso = formatDateISO(AG.day);
        return [{ iso, date: AG.day, idx: dayIndex(iso), collapsed: false }];
    }
    const land = isLandscape();
    return [...Array(7)].map((_, i) => {
        const date = addDays(AG.weekStart, i);
        const iso = formatDateISO(date);
        const hasRec = AG.records.some(r => r.date === iso);
        return { iso, date, idx: i, collapsed: i >= 5 && !land && !AG.showWeekend && !hasRec };
    });
}

function recordNet(r) {
    const emp = agEmploi(r.emploiId);
    if (!emp || isMonthLocked(emp, r.date)) return 0;
    return netMinutes(r, emp);
}

// ===== Rendu =====
let agToken = 0;
async function agRender() {
    const token = ++agToken;
    const from = formatDateISO(AG.view === 'day' ? AG.day : AG.weekStart);
    const to = AG.view === 'day' ? from : formatDateISO(addDays(AG.weekStart, 6));
    const [emplois, entreprises, records] = await Promise.all([
        getAllFromStore('emplois'), getAllFromStore('entreprises'), getHeuresBetween(from, to)
    ]);
    if (token !== agToken) return;   // une navigation plus récente a pris le relais
    AG.emplois = emplois;
    AG.entreprises = entreprises;
    AG.records = records.filter(r => agEmploi(r.emploiId));
    AG.hourH = isLandscape() ? 40 : 52;

    // Plage horaire : 7h-19h par défaut, élargie aux journées affichées
    let start = 7, end = 19;
    AG.records.forEach(r => {
        if (r.repos) return;
        const d = r.debut ? timeToMinutes(r.debut) : null;
        let f = r.fin ? timeToMinutes(r.fin) : null;
        if (d !== null) start = Math.min(start, Math.floor(d / 60));
        if (f !== null) {
            if (d !== null && f < d) f = 1440;
            end = Math.max(end, Math.ceil(f / 60));
        }
    });
    AG.range = [Math.max(0, start - 1), Math.min(24, end + 1)];

    const days = agDays();
    agRenderToolbar(days);
    agRenderHead(days);
    agRenderGrid(days);
    if (typeof pointageRefreshButton === 'function') pointageRefreshButton();

    if (AG.scrollPending) {
        AG.scrollPending = false;
        const firsts = AG.records.filter(r => !r.repos && r.debut).map(r => timeToMinutes(r.debut));
        const target = Math.min(8 * 60, ...firsts) - 45;
        agEl('ag-scroll').scrollTop = Math.max(0, (target - AG.range[0] * 60) * AG.hourH / 60);
    }
}

function agRenderToolbar(days) {
    const label = agEl('ag-label');
    if (AG.view === 'day') {
        label.textContent = dayTitle(days[0].iso);
    } else {
        const a = AG.weekStart, b = addDays(AG.weekStart, 6);
        const left = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MOIS_COURT[a.getMonth()]}`;
        label.textContent = `${left} – ${b.getDate()} ${MOIS_COURT[b.getMonth()]} ${b.getFullYear()}`;
    }
    document.querySelectorAll('.ag-view-toggle button').forEach(btn => btn.classList.toggle('active', btn.dataset.view === AG.view));

    const total = AG.records.reduce((s, r) => s + recordNet(r), 0);
    agEl('ag-total').textContent = minutesToTime(total);
    agEl('ag-total-label').textContent = AG.view === 'day' ? 'Jour' : 'Semaine';
}

function agColumns(days) {
    return (isLandscape() ? '44px ' : '36px ') + days.map(d => (d.collapsed ? '26px' : 'minmax(0, 1fr)')).join(' ');
}

function agRenderHead(days) {
    const head = agEl('ag-head');
    const today = todayISO();
    head.style.gridTemplateColumns = agColumns(days);
    head.innerHTML = '<div class="ag-corner"></div>' + days.map(d => {
        const recs = AG.records.filter(r => r.date === d.iso);
        const total = recs.reduce((s, r) => s + recordNet(r), 0);
        const repos = recs.find(r => r.repos);
        const sub = repos && !total ? `<span class="ag-dtotal ag-repos-chip" data-id="${repos.id}">Repos</span>`
            : `<span class="ag-dtotal">${total ? minutesToTime(total) : '&nbsp;'}</span>`;
        return `<button type="button" class="ag-day-head${d.iso === today ? ' today' : ''}${d.collapsed ? ' collapsed' : ''}" data-date="${d.iso}">
            <span class="ag-dow">${d.collapsed ? JOURS_COURT[d.idx][0] : JOURS_COURT[d.idx]}</span>
            <span class="ag-dnum">${d.date.getDate()}</span>
            ${d.collapsed ? '' : sub}
        </button>`;
    }).join('');
}

function agRenderGrid(days) {
    const grid = agEl('ag-grid');
    const [s, e] = AG.range;
    const H = (e - s) * AG.hourH;
    const today = todayISO();
    grid.style.gridTemplateColumns = agColumns(days);
    grid.style.setProperty('--hour-h', `${AG.hourH}px`);
    grid.classList.toggle('view-day', AG.view === 'day');

    let html = `<div class="ag-gutter" style="height:${H}px">`;
    for (let h = s + 1; h < e; h++) html += `<span style="top:${(h - s) * AG.hourH}px">${h}h</span>`;
    html += '</div>';

    days.forEach(d => {
        const recs = AG.records.filter(r => r.date === d.iso);
        const blocks = recs.filter(r => !r.repos);
        const repos = recs.filter(r => r.repos);
        html += `<div class="ag-col${d.iso === today ? ' today' : ''}${d.collapsed ? ' collapsed' : ''}${d.idx >= 5 ? ' weekend' : ''}${repos.length && !blocks.length ? ' is-repos' : ''}" data-date="${d.iso}" style="height:${H}px">`;
        if (!d.collapsed) {
            blocks.forEach((r, i) => { html += agBlockHtml(r, i, blocks.length, d.iso === today); });
            if (d.iso === today) {
                const n = nowMinutes();
                if (n >= s * 60 && n <= e * 60) html += `<div class="ag-now" style="top:${(n - s * 60) * AG.hourH / 60}px"></div>`;
            }
        }
        html += '</div>';
    });
    grid.innerHTML = html;
}

// Position d'une journée en minutes à l'écran (fin inconnue = "en cours", nuit = jusqu'à minuit).
function agBlockSpan(r, isToday) {
    let d = r.debut ? timeToMinutes(r.debut) : null;
    let f = r.fin ? timeToMinutes(r.fin) : null;
    let open = false, night = false;
    if (d === null && f !== null) d = Math.max(0, f - 60);
    if (f === null) { open = true; f = isToday ? Math.max(d + 30, nowMinutes()) : d + 60; }
    if (f < d) { f = 1440; night = true; }
    return { d, f: Math.min(f, 1440), open, night };
}

function agBlockHtml(r, i, n, isToday) {
    const emp = agEmploi(r.emploiId);
    const ent = agEntreprise(emp.entrepriseId);
    const locked = isMonthLocked(emp, r.date);
    const { d, f, open, night } = agBlockSpan(r, isToday);
    const ppm = AG.hourH / 60;
    const top = (d - AG.range[0] * 60) * ppm;
    const height = Math.max(26, (f - d) * ppm);
    const pauseMin = timeToMinutes(r.pause);
    const pauseTxt = emp.pauseRemuneree ? 'pause payée' : (pauseMin ? `pause ${pauseMin} min` : 'sans pause');
    const pauseShort = emp.pauseRemuneree ? '☕ payée' : (pauseMin ? `☕ ${pauseMin}′` : '☕ non');
    const est = r.estime || {};
    const cls = ['ag-block'];
    if (open) cls.push('open');
    if (locked) cls.push('locked');
    if (est.debut) cls.push('est-debut');
    if (est.fin) cls.push('est-fin');
    if (height < 70) cls.push('short');
    return `<div class="${cls.join(' ')}" data-id="${r.id}" style="top:${top}px;height:${height}px;left:calc(${(i * 100) / n}% + 2px);width:calc(${100 / n}% - 4px);--c:${emploiColor(emp)}">
        ${locked ? '' : '<div class="ag-handle ag-handle-top" data-edge="debut" aria-label="Ajuster l\'arrivée"></div>'}
        <div class="ag-b-time ag-b-start">${fmtHM(r.debut) || '?'}</div>
        <div class="ag-b-mid">
            <strong class="ag-b-total">${locked ? 'mensuel' : (open ? 'en cours' : minutesToTime(netMinutes(r, emp)))}</strong>
            <span class="ag-b-poste">${escapeHtml(emp.poste)}${ent ? ` · ${escapeHtml(ent.nom)}` : ''}</span>
            <span class="ag-b-pause"><span class="long">${pauseTxt}</span><span class="short-txt">${pauseShort}</span></span>
        </div>
        <div class="ag-b-time ag-b-end">${open ? '…' : fmtHM(r.fin) + (night ? ' (+1)' : '')}</div>
        ${locked ? '' : '<div class="ag-handle ag-handle-bottom" data-edge="fin" aria-label="Ajuster le départ"></div>'}
    </div>`;
}

// ===== Tirettes (glisser pour ajuster début / fin, pas de 5 min) =====
function agStartDrag(e, handle) {
    const block = handle.closest('.ag-block');
    const rec = AG.records.find(r => String(r.id) === block.dataset.id);
    if (!rec) return;
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    const span = agBlockSpan(rec, rec.date === todayISO());
    AG.drag = { rec, edge: handle.dataset.edge, startY: e.clientY, d0: span.d, f0: span.f, d: span.d, f: span.f, block, moved: false };
    block.classList.add('dragging');
    if (navigator.vibrate) navigator.vibrate(10);
}

function agMoveDrag(e) {
    const g = AG.drag;
    if (!g) return;
    e.preventDefault();
    const ppm = AG.hourH / 60;
    const delta = (e.clientY - g.startY) / ppm;
    const step5 = v => Math.round(v / 5) * 5;
    if (Math.abs(e.clientY - g.startY) > 4) g.moved = true;
    if (g.edge === 'debut') g.d = Math.max(0, Math.min(g.f0 - 15, step5(g.d0 + delta)));
    else g.f = Math.min(1440, Math.max(g.d0 + 15, step5(g.f0 + delta)));

    g.block.style.top = `${(g.d - AG.range[0] * 60) * ppm}px`;
    g.block.style.height = `${Math.max(26, (g.f - g.d) * ppm)}px`;
    const emp = agEmploi(g.rec.emploiId);
    const tmp = { ...g.rec, debut: minToHHMM(g.d), fin: minToHHMM(g.f) };
    g.block.querySelector('.ag-b-start').textContent = fmtHM(tmp.debut);
    g.block.querySelector('.ag-b-end').textContent = fmtHM(tmp.fin);
    g.block.querySelector('.ag-b-total').textContent = minutesToTime(netMinutes(tmp, emp));
}

async function agEndDrag() {
    const g = AG.drag;
    AG.drag = null;
    if (!g) return;
    g.block.classList.remove('dragging');
    if (!g.moved) return;
    AG.suppressClick = true;
    setTimeout(() => { AG.suppressClick = false; }, 80);
    const rec = { ...g.rec, estime: { ...(g.rec.estime || {}) } };
    if (g.edge === 'debut') { rec.debut = minToHHMM(g.d); rec.estime.debut = false; }
    else { rec.fin = minToHHMM(g.f); rec.estime.fin = false; }
    if (!rec.debut) rec.debut = minToHHMM(g.d);
    try {
        await saveDayRecord(rec);
    } catch (error) {
        showToast("Erreur lors de l'enregistrement", 'error');
        console.error(error);
    }
    await agRender();
}

// ===== Panneau du bas =====
const sheetEl = () => agEl('sheet');
const sheetBody = () => agEl('sheet-body');
let sheetOnClose = null;

function openSheet(html, handlers = {}) {
    elements.toast.classList.add('hidden');   // le message ne doit pas masquer le panneau
    const body = sheetBody();
    body.innerHTML = html;
    body.onclick = handlers.click || null;
    body.onchange = handlers.change || null;
    body.oninput = handlers.input || null;
    sheetOnClose = handlers.close || null;
    sheetEl().classList.remove('hidden');
    requestAnimationFrame(() => sheetEl().classList.add('open'));
}
function closeSheet() {
    sheetEl().classList.remove('open');
    sheetEl().classList.add('hidden');
    const cb = sheetOnClose;
    sheetOnClose = null;
    if (cb) cb();
}
function isSheetOpen() { return !sheetEl().classList.contains('hidden'); }

// ===== Menu des activités (toucher un jour) =====
function openActivityMenu(iso) {
    const emplois = [...AG.emplois].sort(byRecentStart);
    const dayRecs = AG.records.filter(r => r.date === iso);
    const item = (e, prefix = '') => {
        const covers = emploiCovers(e, iso);
        const done = dayRecs.some(r => r.emploiId === e.id);
        const badge = done ? '<span class="act-badge done">déjà saisi</span>'
            : (covers ? '<span class="act-badge">en cours ce jour</span>' : '');
        return `<button type="button" class="act-item${covers ? ' covers' : ''}" data-emploi="${e.id}" style="--c:${emploiColor(e)}">
            <span class="act-dot"></span>
            <span class="act-text"><span class="act-poste">${escapeHtml(e.poste)}</span><small>${escapeHtml(prefix)}${contratLabel(e)}</small></span>
            ${badge}
        </button>`;
    };

    let html = `<h3 class="sheet-title">${dayTitle(iso)}</h3><p class="sheet-sub">Quelle activité ?</p>`;
    if (emplois.length) {
        const last = emplois[0];
        const lastEnt = agEntreprise(last.entrepriseId);
        html += `<div class="act-label">Dernière activité</div>${item(last, lastEnt ? `${lastEnt.nom} · ` : '')}`;

        // Entreprises classées par contrat le plus récent ; dans chacune, du plus récent au plus ancien
        const groups = [];
        emplois.forEach(e => {
            let g = groups.find(x => x.id === e.entrepriseId);
            if (!g) { g = { id: e.entrepriseId, emplois: [] }; groups.push(g); }
            g.emplois.push(e);
        });
        html += '<div class="act-label">Toutes les activités</div>';
        groups.forEach((g, gi) => {
            const ent = agEntreprise(g.id);
            const open = gi === 0 || g.emplois.some(e => emploiCovers(e, iso));
            html += `<details class="act-group"${open ? ' open' : ''}>
                <summary><span>${escapeHtml(ent ? ent.nom : 'Sans entreprise')}${ent && ent.adresse ? ` – ${escapeHtml(ent.adresse)}` : ''}</span><span class="act-count">${g.emplois.length}</span></summary>
                ${g.emplois.map(e => item(e)).join('')}
            </details>`;
        });
    } else {
        html += '<p class="settings-description">Aucune activité enregistrée pour le moment.</p>';
    }
    html += '<button type="button" class="act-add" data-add="1">+ Ajouter un nouvel emploi</button>';

    openSheet(html, {
        click: e => {
            const btn = e.target.closest('[data-emploi], [data-add]');
            if (!btn) return;
            closeSheet();
            if (btn.dataset.add) { openFormEmploi(null, { from: 'agenda', date: iso }); return; }
            const emp = agEmploi(Number(btn.dataset.emploi));
            if (emp) agendaAddEmploiOnDay(emp, iso);
        }
    });
}

// Place l'emploi sur le jour avec ses horaires habituels (appelé aussi après création d'un emploi).
async function agendaAddEmploiOnDay(emploi, iso) {
    if (isMonthLocked(emploi, iso)) {
        showToast(`${monthLabel(iso.slice(0, 7))} est en saisie mensuelle pour cet emploi`, 'error');
        return;
    }
    const existing = await getDayRecord(emploi.id, iso);
    if (existing) { openDayPanel(existing); return; }

    const go = async () => {
        try {
            const h = await horaireFor(emploi, iso);
            await saveDayRecord({ emploiId: emploi.id, date: iso, repos: false, debut: h.debut, fin: h.fin, pause: h.pause });
            const d = parseISO(iso);
            if (AG.view === 'day') AG.day = d;
            AG.weekStart = getMonday(d);
            await agRender();
            showToast(`${fmtHM(h.debut)} → ${fmtHM(h.fin)} : ajustez avec les tirettes ou touchez le bloc`, 'success');
        } catch (error) {
            showToast("Erreur lors de l'enregistrement", 'error');
            console.error(error);
        }
    };
    if (!emploiCovers(emploi, iso)) {
        showModal('Hors des dates du contrat',
            `Le ${formatDate(iso)} n'est pas compris dans « ${emploi.poste} » (${contratLabel(emploi)}). Ajouter quand même ?`,
            go, null, { confirmLabel: 'Ajouter', danger: false });
    } else {
        await go();
    }
}

// ===== Panneau d'une journée (toucher un bloc) =====
function openDayPanel(recIn) {
    const emp = agEmploi(recIn.emploiId);
    if (!emp) return;
    const ent = agEntreprise(emp.entrepriseId);
    const locked = isMonthLocked(emp, recIn.date);
    let rec = { ...recIn, estime: { ...(recIn.estime || {}) } };
    let chain = Promise.resolve();
    let hab = null;
    horaireFor(emp, rec.date).then(h => { hab = h; });

    const timeField = (f, label) => `<div class="dp-time">
        <span class="dp-time-label">${label}</span>
        <div class="stepper">
            <button type="button" data-step="-5" data-f="${f}" aria-label="${label} moins 5 minutes">−5</button>
            <input type="time" step="300" id="dp-${f}">
            <button type="button" data-step="5" data-f="${f}" aria-label="${label} plus 5 minutes">+5</button>
        </div>
    </div>`;

    const html = `<h3 class="sheet-title">${dayTitle(rec.date)}</h3>
        <div class="dp-emploi" style="--c:${emploiColor(emp)}">
            <span class="act-dot"></span>
            <div class="dp-emploi-text"><strong>${escapeHtml(emp.poste)}</strong><small>${escapeHtml(ent ? ent.nom : '')} · ${contratLabel(emp)}</small></div>
            <button type="button" class="btn-link" data-cmd="edit-emploi">Modifier</button>
        </div>
        ${locked ? `<p class="dp-warn">${monthLabel(rec.date.slice(0, 7))} est en saisie mensuelle : journée en lecture seule.</p>` : ''}
        <div class="dp-row">
            <span>Jour de repos</span>
            <label class="switch"><input type="checkbox" id="dp-repos"><span class="slider-toggle"></span></label>
        </div>
        <div class="dp-times">${timeField('debut', 'Arrivée')}${timeField('fin', 'Départ')}</div>
        <div class="dp-row dp-pause-row">
            <span>Pause déduite</span>
            <select id="dp-pause" class="dp-pause-select" aria-label="Durée de la pause"></select>
            <label class="switch"><input type="checkbox" id="dp-pause-on"><span class="slider-toggle"></span></label>
        </div>
        ${emp.pauseRemuneree ? '<p class="field-hint">Pause rémunérée pour cet emploi : elle n\'est jamais déduite.</p>' : '<p class="field-hint">Décochez si la pause a été prise avec les personnes encadrées (temps de travail).</p>'}
        <div id="dp-estime" class="dp-estime hidden"></div>
        <div class="dp-total">Total compté <strong id="dp-total"></strong></div>
        <div class="sheet-actions">
            <button type="button" class="btn-danger" data-cmd="delete">Supprimer</button>
            <button type="button" class="btn-primary" data-cmd="close">OK</button>
        </div>`;

    const q = id => agEl(id);
    const fill = () => {
        q('dp-repos').checked = !!rec.repos;
        q('dp-debut').value = rec.debut || '';
        q('dp-fin').value = rec.fin || '';
        const pauseOn = timeToMinutes(rec.pause) > 0;
        q('dp-pause-on').checked = pauseOn;
        const sel = q('dp-pause');
        const wanted = pauseOn ? rec.pause : (sel.value || (hab && hab.pause) || emp.pauseDefaut || DEFAULT_PAUSE);
        const opts = [];
        for (let m = 5; m <= 180; m += 5) opts.push(m);
        if (!opts.includes(timeToMinutes(wanted)) && timeToMinutes(wanted) > 0) opts.push(timeToMinutes(wanted));
        sel.innerHTML = opts.sort((a, b) => a - b).map(m => `<option value="${minToHHMM(m)}">${m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)}`}</option>`).join('');
        sel.value = timeToMinutes(wanted) > 0 ? minToHHMM(timeToMinutes(wanted)) : '00:45';
        const disabled = locked || rec.repos;
        ['dp-debut', 'dp-fin', 'dp-pause-on'].forEach(id => { q(id).disabled = disabled; });
        q('dp-pause').disabled = disabled || !pauseOn;
        sheetBody().querySelectorAll('[data-step]').forEach(b => { b.disabled = disabled; });
        q('dp-repos').disabled = locked;
        sheetBody().querySelector('[data-cmd="delete"]').disabled = locked;
        q('dp-total').textContent = rec.repos ? 'Repos' : minutesToTime(netMinutes(rec, emp));

        const notes = [];
        if (rec.estime.debut) notes.push("Arrivée non pointée : heure estimée d'après vos horaires habituels.");
        if (rec.estime.fin) notes.push('Départ non pointé : heure estimée.');
        if (!rec.repos && rec.debut && !rec.fin) notes.push('Départ pas encore enregistré.');
        const box = q('dp-estime');
        box.classList.toggle('hidden', !notes.length);
        box.innerHTML = notes.map(n => `<p>⚠ ${n}</p>`).join('')
            + (rec.estime.debut || rec.estime.fin ? '<button type="button" class="btn-link" data-cmd="validate">C\'est correct, valider</button>' : '');
    };
    const persist = () => {
        fill();
        if (locked) return;
        const snapshot = { ...rec, estime: { ...rec.estime } };
        chain = chain.then(async () => {
            const id = await saveDayRecord({ ...snapshot, id: rec.id });   // id lu au moment de l'écriture
            rec.id = id || undefined;
            await agRender();
        }).catch(err => { showToast("Erreur lors de l'enregistrement", 'error'); console.error(err); });
    };

    openSheet(html, {
        click: e => {
            const step = e.target.closest('[data-step]');
            if (step) {
                const f = step.dataset.f;
                const fallback = f === 'fin' ? ((hab && hab.fin) || '17:00') : ((hab && hab.debut) || '09:00');
                rec[f] = minToHHMM(timeToMinutes(rec[f] || fallback) + Number(step.dataset.step));
                rec.estime[f] = false;
                persist();
                return;
            }
            const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
            if (cmd === 'close') closeSheet();
            else if (cmd === 'validate') { rec.estime = {}; persist(); }
            else if (cmd === 'edit-emploi') { closeSheet(); openFormEmploi(emp, { from: 'agenda' }); }
            else if (cmd === 'delete') {
                showModal('Supprimer cette journée ?', `${emp.poste} — ${dayTitle(rec.date)}`, async () => {
                    await chain;
                    if (rec.id) await deleteFromStore('heures', rec.id);
                    closeSheet();
                    await agRender();
                    showToast('Journée supprimée');
                });
            }
        },
        change: async e => {
            const id = e.target.id;
            if (id === 'dp-debut' || id === 'dp-fin') {
                const f = id.slice(3);
                rec[f] = e.target.value;
                rec.estime[f] = false;
            } else if (id === 'dp-pause') {
                rec.pause = e.target.value || '00:00';
            } else if (id === 'dp-pause-on') {
                rec.pause = e.target.checked ? (q('dp-pause').value || emp.pauseDefaut || DEFAULT_PAUSE) : '00:00';
            } else if (id === 'dp-repos') {
                if (e.target.checked) {
                    rec = { ...rec, repos: true, debut: '', fin: '', pause: '00:00', estime: {} };
                } else {
                    const h = hab || await horaireFor(emp, rec.date);
                    rec = { ...rec, repos: false, debut: h.debut, fin: h.fin, pause: h.pause };
                }
            } else return;
            persist();
        }
    });
    fill();
}

// ===== Remplir la semaine avec les horaires habituels =====
async function agFillWeek() {
    const plan = [];
    for (let i = 0; i < 7; i++) {
        const iso = formatDateISO(addDays(AG.weekStart, i));
        if (AG.records.some(r => r.date === iso)) continue;
        const emp = emploiForDate(AG.emplois, iso);
        if (!emp || isMonthLocked(emp, iso)) continue;
        const h = await horaireFor(emp, iso);
        if (!h.habituel) continue;   // jour non travaillé d'habitude
        plan.push({ emploiId: emp.id, date: iso, repos: false, debut: h.debut, fin: h.fin, pause: h.pause });
    }
    if (!plan.length) {
        showToast('Rien à remplir : jours déjà saisis, hors contrat ou non travaillés');
        return;
    }
    showModal('Remplir la semaine ?',
        `${plan.length} journée(s) ajoutée(s) avec les horaires habituels (${plan.map(p => JOURS_COURT[dayIndex(p.date)]).join(', ')}). Vous ajusterez ensuite les exceptions.`,
        async () => {
            for (const p of plan) await saveDayRecord(p);
            await agRender();
            showToast(`${plan.length} journée(s) ajoutée(s)`, 'success');
        }, null, { confirmLabel: 'Remplir', danger: false });
}

// ===== Événements =====
function initAgenda() {
    agEl('ag-prev').addEventListener('click', () => agNav(-1));
    agEl('ag-next').addEventListener('click', () => agNav(1));
    agEl('ag-label').addEventListener('click', () => agGoToday());
    document.querySelectorAll('.ag-view-toggle button').forEach(b => b.addEventListener('click', () => agSetView(b.dataset.view)));

    // Menu "⋯"
    const menu = agEl('ag-more-menu');
    agEl('ag-more').addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
    document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.classList.add('hidden'); });
    menu.addEventListener('click', e => {
        const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
        menu.classList.add('hidden');
        if (cmd === 'today') agGoToday();
        else if (cmd === 'fill') agFillWeek();
        else if (cmd === 'weekend') {
            AG.showWeekend = !AG.showWeekend;
            prefSet('meszeur-weekend', AG.showWeekend ? '1' : '0');
            agRender();
        } else if (cmd === 'entreprises') goToEntreprises();
    });

    // En-têtes des jours
    agEl('ag-head').addEventListener('click', e => {
        const h = e.target.closest('.ag-day-head');
        if (!h) return;
        const reposChip = e.target.closest(".ag-repos-chip");
        if (reposChip) {
            const rec = AG.records.find(r => String(r.id) === reposChip.dataset.id);
            if (rec) { openDayPanel(rec); return; }
        }
        if (h.classList.contains('collapsed')) {
            AG.showWeekend = true;
            prefSet('meszeur-weekend', '1');
            agRender();
        } else openActivityMenu(h.dataset.date);
    });

    // Grille : blocs, tirettes, jours vides
    const grid = agEl('ag-grid');
    grid.addEventListener('pointerdown', e => {
        const handle = e.target.closest('.ag-handle');
        if (handle) agStartDrag(e, handle);
    });
    grid.addEventListener('pointermove', agMoveDrag);
    grid.addEventListener('pointerup', agEndDrag);
    grid.addEventListener('pointercancel', agEndDrag);
    grid.addEventListener('click', e => {
        if (AG.suppressClick || AG.drag) return;
        const block = e.target.closest('.ag-block, .ag-repos');
        if (block) {
            const rec = AG.records.find(r => String(r.id) === block.dataset.id);
            if (rec) openDayPanel(rec);
            return;
        }
        const col = e.target.closest('.ag-col');
        if (!col) return;
        if (col.classList.contains('collapsed')) {
            AG.showWeekend = true;
            prefSet('meszeur-weekend', '1');
            agRender();
        } else openActivityMenu(col.dataset.date);
    });

    // Balayage gauche / droite = période suivante / précédente
    const scroller = agEl('ag-scroll');
    let sw = null;
    scroller.addEventListener('touchstart', e => {
        if (e.touches.length !== 1 || e.target.closest('.ag-handle')) { sw = null; return; }
        sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }, { passive: true });
    scroller.addEventListener('touchend', e => {
        if (!sw || AG.drag) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - sw.x, dy = t.clientY - sw.y;
        sw = null;
        if (Math.abs(dx) > 70 && Math.abs(dy) < 45) {
            AG.suppressClick = true;
            setTimeout(() => { AG.suppressClick = false; }, 80);
            agNav(dx < 0 ? 1 : -1);
        }
    }, { passive: true });

    // Panneau : fermer en touchant le fond
    sheetEl().addEventListener('click', e => { if (e.target === sheetEl()) closeSheet(); });

    // Rotation de l'écran / redimensionnement
    let rt = null;
    window.addEventListener('resize', () => {
        clearTimeout(rt);
        rt = setTimeout(() => { if (agEl('page-agenda').classList.contains('active') && !AG.drag) agRender(); }, 150);
    });

    // Ligne "maintenant"
    setInterval(() => {
        if (!agEl('page-agenda').classList.contains('active') || AG.drag) return;
        const line = document.querySelector('.ag-now');
        const n = nowMinutes();
        if (line) line.style.top = `${(n - AG.range[0] * 60) * AG.hourH / 60}px`;
        if (typeof pointageRefreshButton === 'function') pointageRefreshButton();
    }, 60000);
}
