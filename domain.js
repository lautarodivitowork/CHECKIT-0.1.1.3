export const COLORS = ['#efd8ae', '#d9e7be', '#cce6dd', '#cfe0f3', '#ddd7f0', '#f1d5db', '#e8ddcf', '#d8dce0'];
export function emptyData() {
    return { schemaVersion: 1, tasks: [], categories: [], completions: {}, hiddenDates: {}, dayOrder: {}, settings: { sortMode: 'oldest' } };
}
export function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dateFromKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
}
export function isValidDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const d = dateFromKey(value);
    return !Number.isNaN(d.getTime()) && dateKey(d) === value;
}
export function shiftDate(key, days) {
    const date = dateFromKey(key);
    date.setDate(date.getDate() + days);
    return dateKey(date);
}
export function weekday(key) {
    return (dateFromKey(key).getDay() + 6) % 7 + 1;
}
export function formatDisplayDate(key, today) {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    if (key.slice(0, 4) !== today.slice(0, 4))
        options.year = 'numeric';
    const formatted = new Intl.DateTimeFormat('es-AR', options).format(dateFromKey(key));
    return formatted.charAt(0).toLocaleUpperCase('es-AR') + formatted.slice(1);
}
export function newId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export function occursOn(schedule, date) {
    switch (schedule.kind) {
        case 'once': return date === schedule.date;
        case 'daily': return true;
        case 'weekly': return schedule.weekdays.includes(weekday(date));
        case 'dates': return schedule.dates.includes(date);
    }
}
export function revisionAt(task, date) {
    // Las fechas ISO locales se ordenan alfabéticamente.
    const revisions = task.revisions.filter(r => r.effectiveFrom <= date)
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    return revisions.length ? revisions[revisions.length - 1] : null;
}
export function completionKey(taskId, date) {
    return `${taskId}|${date}`;
}
export function visibleOccurrences(data, date) {
    const categories = new Map(data.categories.map(c => [c.id, c]));
    return data.tasks.flatMap(task => {
        if (task.cutoffDate && date >= task.cutoffDate)
            return [];
        if ((data.hiddenDates[task.id] || []).includes(date))
            return [];
        const revision = revisionAt(task, date);
        if (!revision || !occursOn(revision.schedule, date))
            return [];
        return [{ task, revision, category: categories.get(revision.categoryId || '') || null,
                completed: data.completions[completionKey(task.id, date)] === true }];
    });
}
export function orderedOccurrences(data, date) {
    const occurrences = visibleOccurrences(data, date);
    const sort = data.settings.sortMode;
    const taskIndex = new Map(data.tasks.map((task, index) => [task.id, index]));
    const catIndex = new Map(data.categories.map((c, index) => [c.id, index]));
    return [...occurrences].sort((a, b) => {
        if (a.completed !== b.completed)
            return a.completed ? 1 : -1;
        if (sort === 'newest')
            return b.task.createdAt - a.task.createdAt || (taskIndex.get(b.task.id) ?? 0) - (taskIndex.get(a.task.id) ?? 0);
        if (sort === 'category') {
            const catA = a.category;
            const catB = b.category;
            const colorA = catA ? COLORS.indexOf(catA.color) : 999;
            const colorB = catB ? COLORS.indexOf(catB.color) : 999;
            if (colorA !== colorB)
                return colorA - colorB;
            // Misma categoría junta; el color nunca fusiona identidades.
            if (catA?.id !== catB?.id)
                return (catIndex.get(catA?.id || '') ?? 999) - (catIndex.get(catB?.id || '') ?? 999);
            return a.task.createdAt - b.task.createdAt || (taskIndex.get(a.task.id) ?? 0) - (taskIndex.get(b.task.id) ?? 0);
        }
        return a.task.createdAt - b.task.createdAt || (taskIndex.get(a.task.id) ?? 0) - (taskIndex.get(b.task.id) ?? 0);
    });
}
export function createTask(data, date, fields) {
    const task = { id: newId(), createdAt: Date.now(), revisions: [
            { id: newId(), effectiveFrom: date, ...fields }
        ] };
    return { ...data, tasks: [...data.tasks, task] };
}
export function editTask(data, id, from, fields) {
    return {
        ...data,
        tasks: data.tasks.map(task => task.id !== id ? task : {
            ...task,
            // La nueva versión reemplaza cualquier modificación futura previamente programada.
            revisions: [
                ...task.revisions.filter(rev => rev.effectiveFrom < from),
                { id: newId(), effectiveFrom: from, ...fields }
            ]
        })
    };
}
export function toggleComplete(data, id, date) {
    const key = completionKey(id, date);
    return { ...data, completions: { ...data.completions, [key]: !data.completions[key] } };
}
export function deleteOnlyOn(data, id, date) {
    const dates = data.hiddenDates[id] || [];
    return { ...data, hiddenDates: { ...data.hiddenDates, [id]: [...new Set([...dates, date])] } };
}
export function deleteFrom(data, id, date) {
    return { ...data, tasks: data.tasks.map(t => t.id !== id ? t : {
            ...t, cutoffDate: t.cutoffDate && t.cutoffDate < date ? t.cutoffDate : date
        }) };
}
/** Mantiene el ID: los cambios de aspecto se reflejan en todas las tareas asociadas. */
export function updateCategory(data, id, { color, emoji }) {
    if (!data.categories.some(c => c.id === id)) return data;
    return { ...data, categories: data.categories.map(c =>
        c.id === id ? { ...c, color, emoji } : c) };
}
/** Borra la categoría, nunca las tareas ni sus estados de finalización. */
export function removeCategory(data, id) {
    if (!data.categories.some(c => c.id === id)) return data;
    return { ...data,
        categories: data.categories.filter(c => c.id !== id),
        tasks: data.tasks.map(task => {
            if (!task.revisions.some(r => r.categoryId === id)) return task;
            return { ...task, revisions: task.revisions.map(r =>
                r.categoryId === id ? { ...r, categoryId: null } : r) };
        })
    };
}
export function setSortMode(data, sortMode) {
    return { ...data, settings: { ...data.settings, sortMode } };
}
function isSchedule(value) {
    if (!value || typeof value !== 'object')
        return false;
    const s = value;
    if (s.kind === 'daily')
        return true;
    if (s.kind === 'once')
        return isValidDateKey(s.date);
    if (s.kind === 'weekly')
        return Array.isArray(s.weekdays) && s.weekdays.length > 0 && s.weekdays.every(d => Number.isInteger(d) && d >= 1 && d <= 7);
    if (s.kind === 'dates')
        return Array.isArray(s.dates) && s.dates.length > 0 && s.dates.every(isValidDateKey);
    return false;
}
/** Las copias se tratan como datos no confiables; nunca se evalúa código importado. */
export function parseBackup(json) {
    const value = JSON.parse(json);
    if (!value || typeof value !== 'object')
        throw new Error('El archivo no contiene una copia válida.');
    const d = value;
    if (d.schemaVersion !== 1 || !Array.isArray(d.categories) || !Array.isArray(d.tasks)) {
        throw new Error('Formato de copia no compatible.');
    }
    const categories = d.categories;
    const tasks = d.tasks;
    if (!categories.every(c => c && typeof c.id === 'string' && typeof c.emoji === 'string' && c.emoji.length <= 32 && typeof c.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.color) && typeof c.createdAt === 'number') ||
        !tasks.every(t => t && typeof t.id === 'string' && typeof t.createdAt === 'number' && (t.cutoffDate === undefined || isValidDateKey(t.cutoffDate)) &&
            Array.isArray(t.revisions) && t.revisions.length > 0 && t.revisions.every((r) => {
            if (!r || typeof r !== 'object')
                return false;
            const rev = r;
            return typeof rev.id === 'string' && isValidDateKey(rev.effectiveFrom) &&
                typeof rev.title === 'string' && rev.title.trim().length > 0 && rev.title.length <= 500 &&
                (rev.categoryId === null || typeof rev.categoryId === 'string') && isSchedule(rev.schedule);
        }))) {
        throw new Error('La copia contiene tareas o categorías inválidas.');
    }
    if (new Set(tasks.map(t => t.id)).size !== tasks.length || new Set(categories.map(c => c.id)).size !== categories.length) {
        throw new Error('La copia contiene identificadores duplicados.');
    }
    const completions = d.completions;
    const hiddenDates = d.hiddenDates;
    const dayOrder = d.dayOrder;
    const settings = d.settings;
    if (!completions || typeof completions !== 'object' || Array.isArray(completions) ||
        !Object.entries(completions).every(([k, v]) => /^.+\|\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'boolean') ||
        !hiddenDates || typeof hiddenDates !== 'object' || Array.isArray(hiddenDates) ||
        !Object.values(hiddenDates).every(v => Array.isArray(v) && v.every(isValidDateKey)) ||
        !dayOrder || typeof dayOrder !== 'object' || Array.isArray(dayOrder) ||
        !Object.entries(dayOrder).every(([k, v]) => isValidDateKey(k) && Array.isArray(v) && v.every(id => typeof id === 'string')) ||
        !settings || typeof settings !== 'object' || !['manual', 'oldest', 'newest', 'category'].includes(settings.sortMode)) {
        throw new Error('La copia tiene una estructura incompleta.');
    }
    // Crear exclusivamente los campos conocidos (evita arrastrar datos extraños).
    return {
        schemaVersion: 1,
        categories: categories,
        tasks: tasks,
        completions: completions,
        hiddenDates: hiddenDates,
        dayOrder: dayOrder,
        settings: { sortMode: settings.sortMode === 'manual' ? 'oldest' : settings.sortMode }
    };
}
