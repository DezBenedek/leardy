import { browser } from '$app/environment';
import { loadSettings, syncNotifPrefs } from '$lib/settings';
import { APP_VERSION } from '$lib/version';

/* Helyi push-szerű értesítések: Notification API + időzített ellenőrzés.
   Nincs külső push-szerver, az app nyitott állapotban jelez:
   - napi emlékeztető a beállított időpontban,
   - új tantermi üzenet / feladat (tantermek pollolásával),
   - új funkciók (verzióváltáskor egyszer). */

export type NotifPermission = NotificationPermission | 'unsupported';

export function notifSupported(): boolean {
	return browser && 'Notification' in window;
}

export function getNotifPermission(): NotifPermission {
	if (!notifSupported()) return 'unsupported';
	try {
		return Notification.permission;
	} catch {
		return 'unsupported';
	}
}

export async function requestNotifPermission(): Promise<NotifPermission> {
	if (!notifSupported()) return 'unsupported';
	try {
		const res = await Notification.requestPermission();
		return res;
	} catch {
		return getNotifPermission();
	}
}

export function canNotify(): boolean {
	return notifSupported() && getNotifPermission() === 'granted';
}

async function showViaServiceWorker(title: string, body: string, url: string, tag: string): Promise<boolean> {
	try {
		if (!('serviceWorker' in navigator)) return false;
		// Devben nincs service worker: a ready igeret sosem oldodna fel,
		// ezert idokorlattal varunk, kulonben az ertesites orokre beragadna.
		const reg = await Promise.race([
			navigator.serviceWorker.ready,
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
		]);
		if (!reg) return false;
		const anyReg = reg as unknown as {
			showNotification?: (t: string, o: object) => Promise<void>;
		};
		if (typeof anyReg.showNotification !== 'function') return false;
		await anyReg.showNotification(title, {
			body,
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			data: { url },
			tag,
			renotify: false
		});
		return true;
	} catch {
		return false;
	}
}

export async function showLocalNotification(
	title: string,
	body: string,
	url = '/',
	tag = `leardy-${url}`
): Promise<boolean> {
	if (!canNotify()) return false;
	// Kattintásra navigálás: a service worker nélküli esethez is figyelünk.
	try {
		if (await showViaServiceWorker(title, body, url, tag)) return true;
		const n = new Notification(title, { body, icon: '/icons/icon-192.png', tag });
		n.onclick = () => {
			try {
				window.focus();
				if (url && window.location.pathname !== url) window.location.href = url;
				n.close();
			} catch {
				// nem kritikus
			}
		};
		return true;
	} catch {
		return false;
	}
}

const REMINDER_LAST_KEY = 'leardy-reminder-last';
const SEEN_MSG_PREFIX = 'leardy-seen-msg-';
const SEEN_TASK_PREFIX = 'leardy-seen-task-';
const SEEN_DUE_PREFIX = 'leardy-seen-due-';
const SEEN_VERSION_KEY = 'leardy-seen-version';

function todayKey(date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function nowHM(date = new Date()): string {
	return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getSeen(key: string): string {
	try {
		return localStorage.getItem(key) ?? '';
	} catch {
		return '';
	}
}

function setSeen(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// storage tiltva
	}
}

async function checkDailyReminder(): Promise<void> {
	const s = loadSettings();
	if (!s.reminder || !canNotify()) return;
	// Pontos percrehegyezes helyett "lejart, de ma meg nem szolt" logika:
	// a tick keshet, a lap lehet hatterben, ebredereskor potolni kell.
	// A HH:MM nullazott alakban szovegesen osszehasonlithato.
	if (nowHM() < s.reminderTime) return;
	const today = todayKey();
	if (getSeen(REMINDER_LAST_KEY) === `${today}@${s.reminderTime}`) return;
	const ok = await showLocalNotification(
		'Ideje gyakorolni',
		'Ne szakadjon meg a sorozatod, nézz rá a mai leckéidre.',
		'/',
		`reminder:${today}`
	);
	if (ok) setSeen(REMINDER_LAST_KEY, `${today}@${s.reminderTime}`);
}

interface ClassroomListItem {
	id: string;
}

async function fetchJson(url: string, timeoutMs = 10_000): Promise<unknown> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, { credentials: 'same-origin', signal: ctrl.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	} finally {
		clearTimeout(t);
	}
}

async function hasPushSubscription(): Promise<boolean> {
	try {
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
		const reg = await navigator.serviceWorker.getRegistration();
		if (!reg) return false;
		return !!(await reg.pushManager.getSubscription());
	} catch {
		return false;
	}
}

async function checkClassroomUpdates(firstRun: boolean): Promise<void> {
	const s = loadSettings();
	if ((!s.pushClassMessage && !s.pushClassTask && !s.dueSoon) || !canNotify()) return;
	const muted = new Set(s.mutedClassrooms ?? []);
	const pushOn = await hasPushSubscription();
	let list: { teaching?: ClassroomListItem[]; joined?: ClassroomListItem[] };
	try {
		list = (await fetchJson('/api/classrooms')) as typeof list;
	} catch {
		return;
	}
	const rooms = [...(list.teaching ?? []), ...(list.joined ?? [])];
	for (const room of rooms.slice(0, 10)) {
		if (!room?.id) continue;
		if (muted.has(room.id)) continue;
		let content: {
			messages?: { id: string; title: string }[];
			tasks?: { id: string; title: string; due_date?: number | null }[];
			assignments?: { id: string; title: string; due_date?: number | null }[];
		};
		try {
			content = (await fetchJson(`/api/classrooms/${room.id}/content`)) as typeof content;
		} catch {
			continue;
		}
		if (s.pushClassMessage && content.messages?.length) {
			const latest = content.messages[0];
			const key = SEEN_MSG_PREFIX + room.id;
			const seen = getSeen(key);
			if (!seen) {
				// Elso indulas: csak megjegyezzuk, nem zargatunk regiekkel.
				setSeen(key, latest.id);
			} else if (latest.id !== seen && !firstRun) {
				// Feliratkozott eszközön a service worker már megjeleníti.
				// Itt csak megjegyezzük, különben ugyanaz kétszer szólna.
				if (pushOn) {
					setSeen(key, latest.id);
				} else {
					const ok = await showLocalNotification(
						'Új tantermi üzenet',
						latest.title || 'Új üzenet érkezett a tantermedbe.',
						`/tanterem/${room.id}`,
						`msg:${latest.id}`
					);
					if (ok) setSeen(key, latest.id);
				}
			} else if (latest.id !== seen) {
				setSeen(key, latest.id);
			}
		}
		if (s.pushClassTask && content.tasks?.length) {
			const latest = content.tasks[0];
			const key = SEEN_TASK_PREFIX + room.id;
			const seen = getSeen(key);
			if (!seen) {
				setSeen(key, latest.id);
			} else if (latest.id !== seen && !firstRun) {
				if (pushOn) {
					setSeen(key, latest.id);
				} else {
					const ok = await showLocalNotification(
						'Új tantermi feladat',
						latest.title || 'Új feladatot kaptál a tantermedben.',
						`/tanterem/${room.id}`,
						`task:${latest.id}`
					);
					if (ok) setSeen(key, latest.id);
				}
			} else if (latest.id !== seen) {
				setSeen(key, latest.id);
			}
		}
		if (s.dueSoon && !firstRun) {
			const now = Date.now();
			const soonTasks = (content.tasks ?? []).filter(
				(t) => typeof t.due_date === 'number' && t.due_date > now && t.due_date - now < 24 * 3600_000
			);
			const soonAssigns = (content.assignments ?? []).filter(
				(a) => typeof a.due_date === 'number' && a.due_date > now && a.due_date - now < 24 * 3600_000
			);
			const soon = [
				...soonTasks.map((t) => ({ id: `task:${t.id}`, title: t.title || 'Tantermi feladat' })),
				...soonAssigns.map((a) => ({ id: `assign:${a.id}`, title: a.title || 'Beadandó' }))
			].slice(0, 3);
			for (const item of soon) {
				const key = SEEN_DUE_PREFIX + room.id + '-' + item.id;
				if (getSeen(key)) continue;
				const ok = await showLocalNotification(
					'Határidő közeleg',
					`${item.title}: 24 órán belül lejár.`,
					`/tanterem/${room.id}`,
					`due:${item.id}`
				);
				if (ok) setSeen(key, '1');
			}
		}
	}
}

async function checkFeatureUpdates(): Promise<void> {
	const s = loadSettings();
	if (!s.pushFeatures || !canNotify()) return;
	const seen = getSeen(SEEN_VERSION_KEY);
	if (!seen) {
		setSeen(SEEN_VERSION_KEY, APP_VERSION);
		return;
	}
	if (seen !== APP_VERSION) {
		const ok = await showLocalNotification(
			'Új funkciók érkeztek',
			`Frissült a Leardy (${APP_VERSION}). Nézd meg az újdonságokat a Beállítások / Névjegy alatt.`,
			'/beallitasok',
			`version:${APP_VERSION}`
		);
		if (ok) setSeen(SEEN_VERSION_KEY, APP_VERSION);
	}
}

let engineStarted = false;
let engineStopped = false;
let tickRunning = false;
let tickTimer: ReturnType<typeof setTimeout> | null = null;
let reminderTimer: ReturnType<typeof setInterval> | null = null;

export function stopNotificationEngine(): void {
	engineStopped = true;
	if (tickTimer) {
		clearTimeout(tickTimer);
		tickTimer = null;
	}
	if (reminderTimer) {
		clearInterval(reminderTimer);
		reminderTimer = null;
	}
	document.removeEventListener('visibilitychange', onVisibility);
}

function onVisibility(): void {
	// Hatterben nem pollolunk: elebedeskor egyet futtatunk, elalvaskor toroljuk a kovetkezot.
	if (document.hidden && tickTimer) {
		clearTimeout(tickTimer);
		tickTimer = null;
	} else if (!document.hidden && engineStarted && !engineStopped && !tickTimer && !tickRunning) {
		tickTimer = setTimeout(tickLoop, 2000);
	}
}

async function tickLoop(): Promise<void> {
	tickTimer = null;
	if (engineStopped || document.hidden || tickRunning) return;
	tickRunning = true;
	try {
		try {
			await checkDailyReminder();
		} catch {
			// nem akasztjuk meg a tobbit
		}
		try {
			await checkClassroomUpdates(false);
		} catch {
			// halozati hiba: csendben ujra
		}
		try {
			await checkFeatureUpdates();
		} catch {
			// nem kritikus
		}
	} finally {
		tickRunning = false;
	}
	if (!engineStopped && !document.hidden) {
		tickTimer = setTimeout(tickLoop, 60_000);
	}
}

async function firstTickLoop(firstRun: boolean): Promise<void> {
	tickTimer = null;
	if (engineStopped || tickRunning) return;
	tickRunning = true;
	try {
		try {
			await checkDailyReminder();
		} catch {
			// nem akasztjuk meg a tobbit
		}
		try {
			await checkClassroomUpdates(firstRun);
		} catch {
			// halozati hiba: csendben ujra
		}
		try {
			await checkFeatureUpdates();
		} catch {
			// nem kritikus
		}
	} finally {
		tickRunning = false;
	}
	if (!engineStopped && !document.hidden) {
		tickTimer = setTimeout(tickLoop, 60_000);
	}
}

export function startNotificationEngine(): void {
	if (!browser || engineStarted) return;
	engineStarted = true;
	engineStopped = false;
	syncNotifPrefs();
	const firstRun = getSeen('leardy-notif-boot') !== '1';
	setSeen('leardy-notif-boot', '1');
	// Boot utan roviddel, majd percenkent. Egyetlen lancolt timer van,
	// atfedes nelkul: amig egy tick fut, nem indul uj.
	tickRunning = false;
	tickTimer = setTimeout(() => void firstTickLoop(firstRun), 8000);
	// Napi emlekezteto pontosabb: fel percenkent nezzuk az orat, de csak
	// lathato lapon, es nem parhuzamosan a fo tick-kel.
	reminderTimer = setInterval(() => {
		if (document.hidden || tickRunning) return;
		checkDailyReminder().catch(() => {});
	}, 30_000);
	document.addEventListener('visibilitychange', onVisibility);
}
