import {
  COLORS, createTask, dateKey, deleteFrom, deleteOnlyOn, editTask,
  updateCategory, removeCategory,
  formatDisplayDate, orderedOccurrences, parseBackup,
  setSortMode, shiftDate, toggleComplete, visibleOccurrences
} from './domain.js';
import { createBackup, loadData, saveData } from './storage.js';

const root = document.querySelector('#root');
const WEEKDAYS = ['L','M','M','J','V','S','D'];
const WEEKDAY_LABELS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const SORT_LABELS = { oldest: 'Más antiguas primero', newest: 'Más recientes primero', category: 'Por categoría' };
const ICONS = {
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  sort: '<path d="M4 7h16M7 12h10m-7 5h4"/><circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',
  upload: '<path d="M12 21V9m-4 4 4-4 4 4M4 7V4h16v3"/>',
  archive: '<rect x="4" y="4" width="16" height="5" rx="1"/><path d="M5 9v11h14V9m-9 5h4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/>',
  pencil: '<path d="m4 20 4.3-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/><path d="m14.5 6.5 3 3"/>'
};
function icon(name, size = 21) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}
function esc(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const visibleTextDate = (date) => new Intl.DateTimeFormat('es-AR', {day:'numeric',month:'short'}).format(new Date(`${date}T12:00:00`));
const longTextDate = (date) => new Intl.DateTimeFormat('es-AR', {day:'numeric',month:'long'}).format(new Date(`${date}T12:00:00`));
const newId = () => (globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const state = {
  data: null, date: dateKey(), today: dateKey(), sortOpen: false,
  calendarOpen: false, calendarMonth: dateKey().slice(0, 7),
  context: null, modal: null, editingId: null, deleteId: null,
  editor: null, suppressClick: 0,
  suppressCategoryClick: 0, suppressCategoryClickId: null, toast: '', toastTimer: null, saveProblem: false
};
let taskPointer = null;
let categoryPointer = null;
let currentOrdered = [];
let isRendering = false;

function changeData(update) {
  if (!state.data) return;
  const updated = update(state.data);
  if (updated === state.data) return;
  state.data = updated;
  saveData(state.data).then(() => {
    if (state.saveProblem) { state.saveProblem = false; render(); }
  }).catch(() => { state.saveProblem = true; render(); });
  render();
}
function toast(message) {
  state.toast = message;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { state.toast = ''; render(); }, 2200);
  render();
}
function dismiss() {
  state.context = null;
  state.sortOpen = false;
  state.calendarOpen = false;
}
function contextMenu(id) {
  const element = [...root.querySelectorAll('[data-task-id]')].find(el => el.dataset.taskId === id);
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const menuWidth = 205;
  const x = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth));
  // Ubicar el menú debajo de la tarea; si no entra, arriba sin taparla.
  const below = rect.bottom + 10;
  const y = below + 115 <= window.innerHeight ? below : Math.max(12, rect.top - 115);
  state.sortOpen = false;
  state.calendarOpen = false;
  state.context = {id, x, y};
  render();
}
function startEditor(id = null) {
  cancelCategoryPointer();
  dismiss(); state.editingId = id;
  const rev = id ? visibleOccurrences(state.data, state.date).find(o => o.task.id === id)?.revision : null;
  state.editor = {
    title: rev?.title || '', categoryId: rev?.categoryId ?? null,
    kind: rev?.schedule.kind || 'once',
    weekdays: rev?.schedule.kind === 'weekly' ? [...rev.schedule.weekdays] : [1,2,3,4,5,6,7],
    dates: rev?.schedule.kind === 'dates' ? rev.schedule.dates.filter(d => d >= state.date) : [state.date],
    nextDate: state.date, creatingCategory: false, categoryEditId: null,
    categoryMenuId: null, categoryMenuLeft: 0, deletingCategoryId: null, color: COLORS[0], emoji: '', error: ''
  };
  state.modal = 'editor'; render();
  if (!('ontouchstart' in window)) root.querySelector('#task-title')?.focus();
}
function closeModal() {
  cancelCategoryPointer();
  state.modal = null; state.editor = null; state.editingId = null;
  document.body.classList.remove('modal-open'); render();
}
function saveEditor() {
  const f = state.editor;
  const title = f.title.trim();
  if (!title) return editorError('Escribí un título para la tarea.');
  if (f.kind === 'weekly' && !f.weekdays.length) return editorError('Elegí al menos un día de la semana.');
  if (f.kind === 'dates' && !f.dates.length) return editorError('Elegí al menos una fecha.');
  const schedule = f.kind === 'once' ? {kind:'once',date:state.date} :
    f.kind === 'daily' ? {kind:'daily'} :
    f.kind === 'weekly' ? {kind:'weekly',weekdays:[...f.weekdays].sort((a,b)=>a-b)} :
    {kind:'dates',dates:[...f.dates].sort()};
  const fields = { title, categoryId: f.categoryId, schedule };
  const editingId = state.editingId, selectedDate = state.date;
  state.modal = null; state.editor = null; state.editingId = null;
  document.body.classList.remove('modal-open');
  changeData(data => editingId ? editTask(data, editingId, selectedDate, fields) : createTask(data, selectedDate, fields));
  toast(editingId ? 'Tarea actualizada' : 'Tarea creada');
}
function editorError(message) {
  state.editor.error = message;
  renderEditor();
}
function persistCategoryChange(transform) {
  const updated = transform(state.data);
  if (updated === state.data) return;
  state.data = updated;
  saveData(updated).then(() => {
    if (state.saveProblem) { state.saveProblem = false; render(); }
  }).catch(() => { state.saveProblem = true; render(); });
  // Conservar el borrador y el foco del formulario mientras se actualizan las categorías.
  renderEditor();
}
function resetCategoryCreator() {
  if (!state.editor) return;
  Object.assign(state.editor, {
    creatingCategory: false, categoryEditId: null, categoryMenuId: null,
    categoryMenuLeft: 0, deletingCategoryId: null, color: COLORS[0], emoji: '', error: ''
  });
}
function makeCategory() {
  const f=state.editor;
  const emoji=f.emoji.trim().slice(0,32);
  if (!emoji) return editorError('Elegí un emoji para la categoría.');
  if (f.categoryEditId) {
    const id=f.categoryEditId;
    persistCategoryChange(data => updateCategory(data, id, {color:f.color, emoji}));
    resetCategoryCreator();
  } else {
    const id=newId();
    persistCategoryChange(data => ({ ...data, categories: [...data.categories, {id,color:f.color,emoji,createdAt:Date.now()}] }));
    f.categoryId=id;
    resetCategoryCreator();
  }
  renderEditor();
}
function openCategoryMenu(id) {
  if (state.modal !== 'editor' || !state.editor || !state.data.categories.some(cat => cat.id === id)) return;
  const el = [...root.querySelectorAll('.category-dot[data-cat]')].find(node => node.dataset.cat === id);
  const row = root.querySelector('.category-list');
  if (el && row) {
    const rect = el.getBoundingClientRect(), parent = row.getBoundingClientRect();
    const left = rect.left - parent.left + rect.width/2 - 102;
    state.editor.categoryMenuLeft = Math.max(0, Math.min(Math.max(0, parent.width - 208), left));
  }
  state.editor.categoryMenuId=id;
  state.editor.deletingCategoryId=null;
  state.editor.creatingCategory=false;
  state.editor.categoryEditId=null;
  state.suppressCategoryClick=Date.now()+650;
  state.suppressCategoryClickId=id;
  renderEditor();
}
function editSelectedCategory() {
  const f=state.editor;
  const cat=state.data.categories.find(c=>c.id===f.categoryMenuId);
  if (!cat) return;
  f.creatingCategory=true;
  f.categoryEditId=cat.id;
  f.color=cat.color;
  f.emoji=cat.emoji;
  f.categoryMenuId=null;
  f.deletingCategoryId=null;
  f.error='';
  renderEditor();
}
function deleteSelectedCategory() {
  const f=state.editor;
  const id=f.deletingCategoryId;
  if (!id) return;
  persistCategoryChange(data => removeCategory(data, id));
  if (f.categoryId===id) f.categoryId=null;
  resetCategoryCreator();
  renderEditor();
}

function deleteTask(onlyDate) {
  const id=state.deleteId;
  if (!id) return;
  state.modal=null; state.deleteId=null;
  document.body.classList.remove('modal-open');
  changeData(data => onlyDate ? deleteOnlyOn(data,id,state.date) : deleteFrom(data,id,state.date));
  toast('Tarea eliminada');
}

function categoryDot(category, selected, menuActive=false) {
  return `<button type="button" class="category-dot ${selected ? 'category-dot--selected' : ''} ${menuActive ? 'category-dot--context-active' : ''}" style="--dot-color:${esc(category.color)}" aria-label="Categoría ${esc(category.emoji)}${selected ? ', seleccionada':''}. Mantener presionada para editar o eliminar." aria-pressed="${selected}" data-eaction="select-cat" data-cat="${esc(category.id)}"><span aria-hidden="true">${esc(category.emoji)}</span></button>`;
}
function editorHTML() {
  const f=state.editor; const editing=!!state.editingId;
  return `<header class="sheet-header"><div><p class="eyebrow">${editing ? 'MODIFICAR':'NUEVA'}</p><h2>${editing ? 'Editar tarea':'Crear tarea'}</h2></div><button type="button" class="icon-button close-button" aria-label="Cerrar" data-action="modal-close">${icon('x')}</button></header>
    <form class="editor-form" id="task-form">
      <div class="field"><label for="task-title">Título</label><input id="task-title" class="title-input" type="text" maxlength="500" autocomplete="off" placeholder="¿Qué vas a hacer?" value="${esc(f.title)}" required></div>
      <div class="field"><div class="field-heading"><span>Categoría</span><span class="field-subtitle">Color + emoji</span></div>
        <div class="category-list">
          ${state.data.categories.map(cat=>categoryDot(cat,cat.id===f.categoryId,cat.id===f.categoryMenuId || cat.id===f.deletingCategoryId)).join('')}
          <button type="button" class="category-add" title="Nueva categoría" aria-label="Crear categoría" data-eaction="toggle-creator">${icon('plus',20)}</button>
          ${f.categoryMenuId ? `<div class="category-popover" style="left:${f.categoryMenuLeft}px" role="menu" aria-label="Opciones de categoría">
            <button type="button" role="menuitem" data-eaction="edit-category">${icon('pencil',17)} Editar categoría</button>
            <button type="button" role="menuitem" class="destructive-option" data-eaction="delete-category-request">${icon('trash',17)} Eliminar categoría</button>
          </div>` : ''}
          ${f.deletingCategoryId ? `<div class="category-popover category-popover--confirm" style="left:${f.categoryMenuLeft}px" role="group" aria-label="Confirmar eliminación de categoría">
            <p><strong>¿Eliminar categoría?</strong><span>Las tareas se conservan sin categoría.</span></p>
            <button type="button" class="destructive-option" data-eaction="confirm-delete-category">${icon('trash',16)} Sí, eliminar</button>
            <button type="button" data-eaction="cancel-delete-category">Cancelar</button>
          </div>` : ''}
        </div>
        ${f.creatingCategory ? `<div class="category-creator"><div class="creator-heading"><span>${f.categoryEditId ? 'Editar categoría' : 'Crear categoría'}</span><button class="text-button" type="button" data-eaction="cancel-creator">Cancelar</button></div>
          <div class="color-list" aria-label="Elegir color">${COLORS.map(c=>`<button type="button" class="color-swatch ${f.color===c?'color-swatch--selected':''}" style="background-color:${c}" data-eaction="set-color" data-color="${c}" aria-label="Color ${c}" aria-pressed="${f.color===c}">${f.color===c?icon('check',17):''}</button>`).join('')}</div>
          <div class="emoji-create-row"><div class="emoji-preview" style="background-color:${f.color}">${esc(f.emoji || '＋')}</div><input type="text" class="emoji-input" id="cat-emoji" aria-label="Emoji de categoría" placeholder="Elegí un emoji 😀" maxlength="32" value="${esc(f.emoji)}"><button type="button" class="small-solid-button" data-eaction="add-category">${f.categoryEditId ? 'Guardar' : 'Crear'}</button></div>
        </div>` : ''}
      </div>
      <div class="field"><label>Frecuencia</label><div class="frequency-options" role="radiogroup" aria-label="Frecuencia de la tarea">
        ${[['once','Una sola vez'],['daily','Todos los días'],['weekly','Días de la semana'],['dates','Fechas puntuales']].map(([kind,label]) => `<button type="button" role="radio" aria-checked="${kind===f.kind}" class="frequency-item ${kind===f.kind?'frequency-item--active':''}" data-eaction="kind" data-kind="${kind}"><span class="frequency-radio"></span>${label}</button>`).join('')}
      </div>
      ${f.kind==='weekly' ? `<div class="weekday-panel"><p>Elegí los días</p><div class="weekday-list">${WEEKDAYS.map((w,i)=>`<button type="button" aria-label="${WEEKDAY_LABELS[i]}" aria-pressed="${f.weekdays.includes(i+1)}" class="weekday-button ${f.weekdays.includes(i+1)?'weekday-button--active':''}" data-eaction="weekday" data-weekday="${i+1}">${w}</button>`).join('')}</div></div>` : ''}
      ${f.kind==='dates' ? `<div class="dates-panel"><p>Fechas seleccionadas</p><div class="date-chips">${[...f.dates].sort().map(d=>`<button type="button" class="date-chip" data-eaction="remove-date" data-date="${d}" aria-label="Quitar ${esc(longTextDate(d))}">${esc(visibleTextDate(d))} ${icon('x',13)}</button>`).join('')}</div>
        <div class="add-specific-date"><input type="date" id="add-date" min="${state.date}" value="${esc(f.nextDate)}" aria-label="Elegir una fecha puntual"><button type="button" class="secondary-small" data-eaction="add-date">${icon('plus',17)} Añadir</button></div></div>` : ''}
      <p class="hint">${f.kind==='once' ? 'Solo para la fecha seleccionada.' : `Comienza el ${esc(longTextDate(state.date))}.`}</p></div>
      ${f.error?`<p class="form-error" role="alert">${esc(f.error)}</p>`:''}
      <button type="submit" class="primary-button">${editing ? 'Guardar cambios':'Guardar tarea'}</button>
    </form>`;
}
function modalHTML() {
  const compact=state.modal!=='editor';
  let contents='';
  if (state.modal==='editor') contents=editorHTML();
  else if (state.modal==='delete') contents=`<header class="sheet-header"><div><p class="eyebrow">CONFIRMAR</p><h2>Eliminar tarea</h2></div><button class="icon-button close-button" aria-label="Cerrar" data-action="modal-close">${icon('x')}</button></header>
    <div class="delete-options"><p>¿Desde cuándo querés eliminarla?</p><button type="button" data-action="delete-once"><strong>Solo de este día</strong><span>Las demás fechas no se modifican.</span></button><button type="button" data-action="delete-from"><strong>Desde este día</strong><span>Se conserva todo lo anterior.</span></button><button type="button" class="cancel-button" data-action="modal-close">Cancelar</button></div>`;
  else if (state.modal==='backup') contents=`<header class="sheet-header"><div><p class="eyebrow">ALMACENAMIENTO LOCAL</p><h2>Tus datos</h2></div><button type="button" class="icon-button close-button" data-action="modal-close" aria-label="Cerrar">${icon('x')}</button></header>
    <div class="backup-body"><p>Las tareas se guardan en este dispositivo. No se sincronizan entre el iPhone y otros equipos.</p>
      <button type="button" class="backup-action" data-action="export"><span class="backup-action-icon">${icon('download')}</span><span><strong>Exportar copia</strong><small>Guardar o compartir un archivo JSON.</small></span>${icon('right',18)}</button>
      <button type="button" class="backup-action" data-action="import"><span class="backup-action-icon">${icon('upload')}</span><span><strong>Importar copia</strong><small>Reemplaza los datos actuales.</small></span>${icon('right',18)}</button>
      <input type="file" accept=".json,application/json" hidden id="backup-import"></div>`;
  return `<div class="modal-backdrop" data-backdrop="true"><section role="dialog" aria-modal="true" class="sheet ${compact?'sheet--compact':''}">${contents}</section></div>`;
}
function renderEditor() {
  const sheet=root.querySelector('.sheet');
  if (!sheet || state.modal!=='editor') return render();
  const currentFocus=document.activeElement?.id;
  sheet.innerHTML=editorHTML();
  if (currentFocus==='task-title' || currentFocus==='cat-emoji') {
    const input=sheet.querySelector(`#${currentFocus}`);
    if (input) {input.focus();input.setSelectionRange(input.value.length,input.value.length);}
  }
}
function taskHTML(o) {
  const cat=o.category;
  return `<div data-task-id="${esc(o.task.id)}" role="button" tabindex="0" aria-pressed="${o.completed}" aria-label="${esc(o.revision.title)}${o.completed?', completada':', pendiente'}" class="task-item ${o.completed?'task-item--complete':''} ${state.context?.id===o.task.id?'task-item--context-active':''}" style="--task-color:${cat?esc(cat.color):'#ebe9e5'}">
    <span class="task-title">${esc(o.revision.title)}</span>
    ${cat?`<span class="task-emoji" style="background-color:${esc(cat.color)}" aria-hidden="true">${esc(cat.emoji)}</span>`:'<span class="task-empty-category" aria-hidden="true"></span>'}</div>`;
}
function calendarHTML() {
  const [year, month] = state.calendarMonth.split('-').map(Number);
  const first = new Date(year, month - 1, 1, 12);
  const heading = new Intl.DateTimeFormat('es-AR', {month:'long',year:'numeric'}).format(first);
  const offset = (first.getDay() + 6) % 7;
  const length = new Date(year, month, 0, 12).getDate();
  const dayButtons = Array.from({length: offset}, () => '<span aria-hidden="true"></span>').join('') +
    Array.from({length}, (_, index) => {
      const day = index+1;
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const selected = key===state.date;
      const today = key===state.today;
      const readable = new Intl.DateTimeFormat('es-AR', {weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(year,month-1,day,12));
      return `<button type="button" class="calendar-day ${selected?'calendar-day--selected':''} ${today?'calendar-day--today':''}" aria-label="${esc(readable)}" aria-pressed="${selected}" data-action="calendar-select" data-date="${key}">${day}</button>`;
    }).join('');
  return `<div class="calendar-popover" role="dialog" aria-label="Elegir fecha">
    <div class="calendar-top"><strong>${esc(heading.charAt(0).toUpperCase()+heading.slice(1))}</strong><div class="calendar-arrows"><button type="button" aria-label="Mes anterior" data-action="calendar-prev-month">${icon('left',18)}</button><button type="button" aria-label="Mes siguiente" data-action="calendar-next-month">${icon('right',18)}</button></div></div>
    <div class="calendar-weekdays" aria-hidden="true">${['L','M','M','J','V','S','D'].map(c=>`<span>${c}</span>`).join('')}</div>
    <div class="calendar-days">${dayButtons}</div>
    <button type="button" class="calendar-today" data-action="calendar-today">Ir a hoy</button>
  </div>`;
}
function shiftCalendarMonth(amount) {
  const [year, month] = state.calendarMonth.split('-').map(Number);
  const d = new Date(year,month-1+amount,1,12);
  state.calendarMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  render();
}
function render() {
  if (isRendering) return;
  isRendering=true;
  try {
    const before = new Map();
    root.querySelectorAll('[data-task-id]').forEach(el => before.set(el.dataset.taskId,el.getBoundingClientRect()));
    currentOrdered=state.data ? orderedOccurrences(state.data,state.date) : [];
    const dateText=formatDisplayDate(state.date,state.today), parts=dateText.split(',');
    const empty=currentOrdered.length===0;
    root.innerHTML=`<main class="app-shell"><div class="app-content">
      <header class="app-header">
        <div class="date-toolbar">
          <button type="button" class="nav-button" aria-label="Día anterior" data-action="prev">${icon('left')}</button>
          <button type="button" class="date-button" aria-label="Fecha seleccionada: ${esc(dateText)}. Volver a hoy." data-action="today"><span class="date-weekday">${esc(parts[0])}</span><span class="date-main">${esc(parts.slice(1).join(',').trim())}</span>${state.date===state.today?'<span class="today-indicator">HOY</span>':''}</button>
          <button type="button" class="nav-button" aria-label="Día siguiente" data-action="next">${icon('right')}</button>
        </div>
        <div class="header-actions">
          <button type="button" class="calendar-button ${state.calendarOpen?'calendar-button--active':''}" aria-label="Abrir calendario" aria-expanded="${state.calendarOpen}" data-action="calendar-toggle">${icon('calendar',21)}</button>
          <div class="sort-wrapper"><button type="button" class="sort-button ${state.sortOpen?'sort-button--active':''}" aria-label="Ordenar tareas. ${esc(SORT_LABELS[state.data?.settings.sortMode]||'Más antiguas primero')}" aria-expanded="${state.sortOpen}" data-action="sort">${icon('sort',23)}</button>
          ${state.sortOpen?`<div class="sort-popover" role="menu" aria-label="Ordenamiento">${Object.entries(SORT_LABELS).map(([mode,label])=>`<button type="button" role="menuitemradio" aria-checked="${(state.data?.settings.sortMode==='manual'?'oldest':state.data?.settings.sortMode)===mode}" data-action="set-sort" data-mode="${mode}">${esc(label)}${(state.data?.settings.sortMode==='manual'?'oldest':state.data?.settings.sortMode)===mode?icon('check',17):''}</button>`).join('')}</div>`:''}
          </div>
        </div>
        ${state.calendarOpen?calendarHTML():''}
        ${state.calendarOpen || state.sortOpen?`<button type="button" class="popover-dismiss" aria-label="Cerrar menú" data-action="dismiss-popover"></button>`:''}
      </header>
      ${!state.data?'<div class="loading-space" aria-label="Cargando tareas"></div>':`<section class="task-section ${empty?'task-section--empty':''}" aria-label="Tareas del día">
        ${empty?'':`<div class="task-list">${currentOrdered.map(taskHTML).join('')}</div>`}
        <div class="add-holder ${empty?'add-holder--empty':''}"><button type="button" class="add-button" aria-label="Añadir tarea" data-action="new">${icon('plus',30)}</button></div>
      </section><footer class="app-footer"><button class="data-button" type="button" aria-label="Copias de seguridad y datos" data-action="backup">${icon('archive',19)}</button></footer>`}
    </div>
    ${state.context?`<button type="button" class="context-dismiss" aria-label="Cerrar menú contextual" data-action="dismiss-context"></button><div class="context-popover" role="menu" style="left:${state.context.x}px;top:${state.context.y}px"><button type="button" data-action="edit" role="menuitem">${icon('pencil',18)} Editar tarea</button><button type="button" data-action="delete-menu" class="destructive-option" role="menuitem">${icon('trash',18)} Eliminar tarea</button></div>`:''}
    ${state.modal?modalHTML():''}
    ${state.toast?`<div class="toast" role="status">${esc(state.toast)}</div>`:''}
    ${state.saveProblem?'<div class="save-error" role="alert">No se pudieron guardar los cambios. Exportá una copia.</div>':''}
    </main>`;
    document.body.classList.toggle('modal-open',!!state.modal);
    if (state.context || !state.data) return;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.querySelectorAll('[data-task-id]').forEach(el => {
        const from=before.get(el.dataset.taskId), to=el.getBoundingClientRect();
        if (from) { const delta=from.top-to.top; if(Math.abs(delta)>2 && Math.abs(delta)<1200) el.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:240,easing:'cubic-bezier(.2,.75,.25,1)'}); }
      });
    }
  } finally {isRendering=false;}
}

async function exportBackup() {
  const fileName=`tareas-respaldo-${dateKey()}.json`;
  const blob=new Blob([createBackup(state.data)],{type:'application/json'});
  try {
    const file=new File([blob],fileName,{type:'application/json'});
    if (navigator.share && navigator.canShare?.({files:[file]})) await navigator.share({files:[file],title:'Copia de seguridad de Tareas'});
    else { const url=URL.createObjectURL(blob), link=document.createElement('a'); link.href=url;link.download=fileName;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000); }
    toast('Copia de seguridad preparada');
  } catch(error) {
    if(error?.name!=='AbortError') window.alert('No se pudo exportar. Probá desde Safari.');
  }
}
async function importBackup(file) {
  if (!file) return;
  try {
    if(file.size>10000000) throw new Error('El archivo es demasiado grande.');
    const imported=parseBackup(await file.text());
    if(!confirm('¿Reemplazar todas las tareas y categorías actuales con esta copia? Esta acción no se puede deshacer.')) return;
    state.data=imported;await saveData(imported);
    closeModal();toast('Datos importados');
  } catch(error) { window.alert(error instanceof Error?error.message:'No se pudo leer el archivo.'); }
}
function modalClick(event) {
  const actionEl=event.target.closest('[data-eaction]');
  if(!actionEl || !state.editor) return false;
  if(actionEl.dataset.eaction==='select-cat' && actionEl.dataset.cat===state.suppressCategoryClickId && Date.now()<state.suppressCategoryClick) return true;
  const f=state.editor;
  switch(actionEl.dataset.eaction) {
    case 'select-cat': f.categoryId=f.categoryId===actionEl.dataset.cat?null:actionEl.dataset.cat;f.categoryMenuId=null;f.deletingCategoryId=null;break;
    case 'toggle-creator': {
      const opening=!f.creatingCategory;
      resetCategoryCreator();
      f.creatingCategory=opening;
      break;
    }
    case 'cancel-creator': resetCategoryCreator();break;
    case 'close-category-menu': f.categoryMenuId=null;break;
    case 'edit-category': editSelectedCategory();return true;
    case 'delete-category-request': f.deletingCategoryId=f.categoryMenuId;f.categoryMenuId=null;break;
    case 'cancel-delete-category': f.deletingCategoryId=null;break;
    case 'confirm-delete-category': deleteSelectedCategory();return true;
    case 'set-color': f.color=actionEl.dataset.color;break;
    case 'add-category': makeCategory();return true;
    case 'kind': f.kind=actionEl.dataset.kind;break;
    case 'weekday': {const d=Number(actionEl.dataset.weekday);f.weekdays=f.weekdays.includes(d)?f.weekdays.filter(x=>x!==d):[...f.weekdays,d];break;}
    case 'remove-date': f.dates=f.dates.filter(d=>d!==actionEl.dataset.date);break;
    case 'add-date': if(f.nextDate>=state.date && !f.dates.includes(f.nextDate))f.dates.push(f.nextDate);break;
  }
  f.error='';renderEditor();return true;
}
function handleAction(event) {
  if (state.editor?.categoryMenuId || state.editor?.deletingCategoryId) {
    if (!event.target.closest('.category-popover, .category-dot')) {
      state.editor.categoryMenuId=null;state.editor.deletingCategoryId=null;
      // Un toque fuera solo cierra el menú, igual que el de tareas.
      if (!event.target.closest('[data-action="modal-close"]')) {renderEditor();return;}
    }
  }
  if (event.target.closest('[data-eaction]') && modalClick(event)) return;
  const clicked=event.target.closest('[data-action]');
  if (clicked) {
    const action=clicked.dataset.action;
    switch(action) {
      case 'prev': state.date=shiftDate(state.date,-1);dismiss();render();break;
      case 'next': state.date=shiftDate(state.date,1);dismiss();render();break;
      case 'today': state.date=dateKey();state.today=state.date;dismiss();render();break;
      case 'new': startEditor();break;
      case 'calendar-toggle': state.calendarOpen=!state.calendarOpen;state.calendarMonth=state.date.slice(0,7);state.sortOpen=false;state.context=null;render();break;
      case 'calendar-prev-month': shiftCalendarMonth(-1);break;
      case 'calendar-next-month': shiftCalendarMonth(1);break;
      case 'calendar-select': state.date=clicked.dataset.date;dismiss();render();break;
      case 'calendar-today': state.date=dateKey();state.today=state.date;dismiss();render();break;
      case 'sort': state.sortOpen=!state.sortOpen;state.calendarOpen=false;state.context=null;render();break;
      case 'dismiss-popover': dismiss();render();break;
      case 'set-sort': changeData(data=>setSortMode(data,clicked.dataset.mode));dismiss();render();break;
      case 'backup': dismiss();state.modal='backup';render();break;
      case 'modal-close': closeModal();break;
      case 'dismiss-context': state.context=null;render();break;
      case 'edit': startEditor(state.context.id);break;
      case 'delete-menu': state.deleteId=state.context.id;state.context=null;state.modal='delete';render();break;
      case 'delete-once': deleteTask(true);break;
      case 'delete-from': deleteTask(false);break;
      case 'export': exportBackup();break;
      case 'import': root.querySelector('#backup-import')?.click();break;
    }
    return;
  }
  if (event.target.dataset.backdrop==='true') {closeModal();return;}
  const taskEl=event.target.closest('[data-task-id]');
  if(taskEl && !state.context && Date.now()>state.suppressClick) {
    changeData(data=>toggleComplete(data,taskEl.dataset.taskId,state.date));
  }
}
root.addEventListener('click',handleAction);
root.addEventListener('submit',event=>{if(event.target.id==='task-form'){event.preventDefault();saveEditor();}});
root.addEventListener('input',event=>{
  if(!state.editor) return;
  if(event.target.id==='task-title')state.editor.title=event.target.value;
  if(event.target.id==='cat-emoji'){
    state.editor.emoji=event.target.value;
    const preview=root.querySelector('.emoji-preview');if(preview)preview.textContent=event.target.value||'＋';
  }
});
root.addEventListener('change',event=>{
  if(event.target.id==='add-date' && state.editor)state.editor.nextDate=event.target.value;
  if(event.target.id==='backup-import')importBackup(event.target.files?.[0]);
});
root.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(state.editor?.categoryMenuId || state.editor?.deletingCategoryId){state.editor.categoryMenuId=null;state.editor.deletingCategoryId=null;renderEditor();}else if(state.modal)closeModal();else {dismiss();render();}return;}
  const categoryEl=event.target.closest('.category-dot[data-cat]');
  if(categoryEl && (event.key==='F10'&&event.shiftKey || event.key==='ContextMenu')) {
    event.preventDefault();openCategoryMenu(categoryEl.dataset.cat);return;
  }
  const taskEl=event.target.closest('[data-task-id]');
  if(!taskEl)return;
  if((event.key==='F10'&&event.shiftKey) || event.key==='ContextMenu'){event.preventDefault();contextMenu(taskEl.dataset.taskId);return;}
  if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!state.context && Date.now()>state.suppressClick)changeData(data=>toggleComplete(data,taskEl.dataset.taskId,state.date));}
});
root.addEventListener('contextmenu',event=>{const taskEl=event.target.closest('[data-task-id]');if(taskEl){event.preventDefault();cancelTaskPointer();if(state.context?.id!==taskEl.dataset.taskId) contextMenu(taskEl.dataset.taskId);}});

// Las tareas NO se pueden arrastrar: el orden se define exclusivamente desde el botón superior.
// Una pulsación prolongada estacionaria abre el menú; un gesto de desplazamiento lo cancela.
function cancelTaskPointer() {
  if(taskPointer) clearTimeout(taskPointer.timer);
  taskPointer=null;
}
root.addEventListener('pointerdown',event=>{
  const el=event.target.closest('[data-task-id]');
  if(!el || state.modal || state.context || (event.pointerType==='mouse' && event.button!==0)) return;
  cancelTaskPointer();
  const p={pointerId:event.pointerId,id:el.dataset.taskId,x:event.clientX,y:event.clientY,timer:null};
  p.timer=setTimeout(()=>{
    if(taskPointer!==p) return;
    taskPointer=null;
    state.suppressClick=Date.now()+850;
    contextMenu(p.id);
  },450);
  taskPointer=p;
});
document.addEventListener('pointermove',event=>{
  if(taskPointer?.pointerId===event.pointerId && Math.hypot(event.clientX-taskPointer.x,event.clientY-taskPointer.y)>10) cancelTaskPointer();
});
document.addEventListener('pointerup',event=>{
  if(taskPointer?.pointerId===event.pointerId) cancelTaskPointer();
});
document.addEventListener('pointercancel',cancelTaskPointer);
// Menú de categorías: pulsación prolongada táctil, ratón y opción de teclado.
function cancelCategoryPointer() {
  if (categoryPointer) clearTimeout(categoryPointer.timer);
  categoryPointer=null;
}
root.addEventListener('pointerdown', event => {
  const dot=event.target.closest('.category-dot[data-cat]');
  if(!dot || state.modal!=='editor' || (event.pointerType==='mouse' && event.button!==0)) return;
  cancelCategoryPointer();
  const p={pointerId:event.pointerId,x:event.clientX,y:event.clientY,timer:null};
  p.timer=setTimeout(()=>{
    if(categoryPointer!==p)return;
    categoryPointer=null;
    openCategoryMenu(dot.dataset.cat);
  },460);
  categoryPointer=p;
});
document.addEventListener('pointermove', event => {
  const p=categoryPointer;
  if(p?.pointerId===event.pointerId && Math.hypot(event.clientX-p.x,event.clientY-p.y)>10) cancelCategoryPointer();
});
document.addEventListener('pointerup', event => {
  if(categoryPointer?.pointerId===event.pointerId) cancelCategoryPointer();
});
document.addEventListener('pointercancel', cancelCategoryPointer);
root.addEventListener('contextmenu',event=>{
  const dot=event.target.closest('.category-dot[data-cat]');
  if(dot && state.modal==='editor') {
    event.preventDefault();cancelCategoryPointer();openCategoryMenu(dot.dataset.cat);
  }
});
// Los campos de escritura mantienen selección normal; el resto no muestra resalte azul.
root.addEventListener('selectstart',event=>{
  if(!event.target.closest('input, textarea, [contenteditable="true"]'))event.preventDefault();
});
root.addEventListener('dblclick',event=>{
  if(!event.target.closest('input, textarea, select'))event.preventDefault();
});
document.addEventListener('visibilitychange',()=>{state.today=dateKey();if(!document.hidden)render();});
window.addEventListener('focus',()=>{state.today=dateKey();render();});

render();
loadData().then(data=>{state.data=data;render();}).catch(error=>{
  console.error(error);
  state.data={schemaVersion:1,tasks:[],categories:[],completions:{},hiddenDates:{},dayOrder:{},settings:{sortMode:'oldest'}};
  state.saveProblem=true;render();
});
if('serviceWorker' in navigator && location.protocol==='https:'){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(console.warn));
}
