import { emptyData, parseBackup } from './domain.js';
const DB_NAME = 'tareas-diarias-v1';
const STORE = 'snapshots';
const KEY = 'main';
const FALLBACK = 'tareas-diarias-respaldo-local';
let connection = null;
let writeQueue = Promise.resolve();
function openDb() {
    if (!('indexedDB' in window))
        return Promise.reject(new Error('IndexedDB no disponible'));
    if (connection)
        return connection;
    connection = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE))
                db.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Cerrá las otras pestañas de la aplicación.'));
    });
    return connection.catch(err => { connection = null; throw err; });
}
async function readDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
        req.onerror = () => reject(req.error);
    });
}
async function writeDb(serialized) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(serialized, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}
export async function loadData() {
    // Si un guardado reciente cayó a localStorage, es la versión más nueva.
    // En cuanto se vuelva a poder escribir IndexedDB, se limpia esa reserva.
    try {
        const fallback = localStorage.getItem(FALLBACK);
        if (fallback)
            return parseBackup(fallback);
    }
    catch (error) {
        console.warn('No se pudo leer la reserva de localStorage.', error);
    }
    try {
        const json = await readDb();
        if (json)
            return parseBackup(json);
    }
    catch (error) {
        console.warn('No se pudo leer IndexedDB.', error);
    }
    return emptyData();
}
export function saveData(data) {
    const json = JSON.stringify(data);
    // Escrituras serializadas: un guardado lento no pisa uno más nuevo.
    writeQueue = writeQueue.catch(() => { }).then(async () => {
        try {
            await writeDb(json);
            try {
                localStorage.removeItem(FALLBACK);
            }
            catch { /* Safari puede bloquear localStorage. */ }
        }
        catch (error) {
            // Recuperación limitada si Safari bloquea IndexedDB.
            localStorage.setItem(FALLBACK, json);
            console.warn('Guardado de emergencia en localStorage.', error);
        }
    });
    return writeQueue;
}
export function createBackup(data) {
    return JSON.stringify(data, null, 2);
}
