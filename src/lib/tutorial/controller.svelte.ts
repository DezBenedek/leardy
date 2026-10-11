import { getContext, setContext } from 'svelte';
import { TOURS, TOUR_IDS, TUTORIAL_VERSION, parseTourMutation, parseTourRecord, type TourContext, type TourId, type TourMutation, type TourRecord, type TourStep } from './definition';

interface Adapter { prepare: (step: TourStep, context: TourContext) => void; close: () => void }
const KEY = Symbol('student-tutorial');

/** Egy layoutpéldányhoz kötött vezérlő, külön fiókonként tárolt mentési sorral. */
export class TutorialController {
	userId = $state('');
	states = $state<Partial<Record<TourId, TourRecord>>>({});
	active = $state<TourId | null>(null);
	stepId = $state('');
	context = $state<TourContext>({});
	skipped = $state<string[]>([]);
	offer = $state(false);
	offerPending = $state(false);
	offeredThisSession = $state(false);
	menuOpen = $state(false);
	finished = $state(false);
	loaded = $state(false);
	checking = $state(false);
	syncError = $state('');
	navigating = $state(false);
	private pending: Partial<Record<TourId, TourMutation>> = {};
	private adapters = new Map<string, Adapter>();
	private generation = 0;
	private flushing = false;
	private disposed = false;
	private returnFocus: HTMLElement | null = null;
	get step() { return this.active ? TOURS[this.active].steps.find((s) => s.id === this.stepId) ?? null : null; }
	get steps() { return this.active ? TOURS[this.active].steps.filter((s) => !this.skipped.includes(s.id)) : []; }
	get index() { return this.steps.findIndex((s) => s.id === this.stepId); }
	get busy() { return !!this.active || this.offer || this.menuOpen || this.finished; }
	register(page: string, adapter: Adapter) {
		this.adapters.set(page, adapter);
		// Lassabb oldalváltáskor a komponens a kiemelés keresése után is megérkezhet.
		queueMicrotask(() => {
			const step = this.step;
			if (!this.disposed && step && this.adapters.get(page) === adapter && (page === step.page || page === step.page + '-load')) adapter.prepare(step, this.context);
		});
		return () => { if (this.adapters.get(page) === adapter) this.adapters.delete(page); };
	}
	prepare() {
		const step = this.step;
		if (step) {
			this.adapters.get(step.page + '-load')?.prepare(step, this.context);
			this.adapters.get(step.page)?.prepare(step, this.context);
		}
	}
	closePanels() { for (const adapter of this.adapters.values()) adapter.close(); }
	private storageKey() { return 'leardy-tutorial:' + this.userId; }
	private persist() {
		if (!this.userId) return;
		try { localStorage.setItem(this.storageKey(), JSON.stringify({ states: this.states, pending: this.pending })); } catch { /* A mentés a szerveren folytatódik. */ }
	}
	async identify(userId: string, student: boolean) {
		if (this.userId === userId) return;
		this.closePanels();
		const generation = ++this.generation;
		this.userId = userId;
		this.active = null; this.offer = false; this.offerPending = false; this.menuOpen = false; this.finished = false;
		this.loaded = false; this.checking = false; this.states = {}; this.pending = {}; this.syncError = '';
		this.offeredThisSession = false; this.context = {}; this.navigating = false;
		if (!userId) return;
		this.checking = true;
		try {
			const cached = JSON.parse(localStorage.getItem(this.storageKey()) ?? 'null');
			for (const id of TOUR_IDS) {
				const saved = cached?.states?.[id];
				const record = parseTourRecord(saved);
				if (record?.tourId === id) this.states[id] = record;
				const pending = parseTourMutation(cached?.pending?.[id]);
				if (pending?.tourId === id) this.pending[id] = pending;
			}
		} catch { /* Sérült helyi állapot esetén a szerver az igazság. */ }
		await this.refresh(student, generation);
	}
	async refresh(student = false, generation = this.generation) {
		if (!this.userId || this.disposed || !navigator.onLine) { this.checking = false; return; }
		try {
			const response = await fetch('/api/tutorial', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
			if (!response.ok) throw new Error('unavailable');
			const data = await response.json();
			if (generation !== this.generation || !Array.isArray(data.states)) return;
			const states: Partial<Record<TourId, TourRecord>> = {};
			for (const raw of data.states) { const record = parseTourRecord(raw); if (record) states[record.tourId] = record; }
			for (const id of TOUR_IDS) if (this.pending[id] && this.states[id]) states[id] = this.states[id];
			this.states = states; this.loaded = true;
			this.persist();
			await this.flush();
			if (generation !== this.generation) return;
			if (student && !this.states.basics && !this.pending.basics && !this.offeredThisSession && !this.busy) {
				this.offerPending = true;
			}
		} catch { if (generation === this.generation) this.syncError = 'A mentés most nem elérhető. Visszakapcsolódáskor újrapróbáljuk.'; }
		finally { if (generation === this.generation) this.checking = false; }
	}
	private save(status: TourRecord['status'], restart = false, tourId = this.active) {
		if (!tourId || !this.userId) return;
		const current = this.states[tourId];
		const record: TourRecord = {
			tourId, version: TUTORIAL_VERSION, status,
			stepId: this.stepId || TOURS[tourId].steps[0].id,
			context: { ...this.context }, revision: current?.revision ?? 0,
			operationId: crypto.randomUUID(), updatedAt: Date.now()
		};
		this.states = { ...this.states, [tourId]: record };
		// Egy még nem nyugtázott újrakezdés jelzése a következő pillanatképben is megmarad.
		this.pending[tourId] = { ...record, restart: restart || this.pending[tourId]?.restart };
		this.persist();
		void this.flush();
	}
	async flush() {
		if (this.flushing || !this.userId || !navigator.onLine || this.disposed) return;
		this.flushing = true;
		const generation = this.generation;
		try {
			for (const id of TOUR_IDS) {
				while (this.pending[id] && generation === this.generation) {
					const sending = { ...this.pending[id]! };
					const response = await fetch('/api/tutorial', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sending), signal: AbortSignal.timeout(8000) });
					if (generation !== this.generation) return;
					const body = await response.json();
					if (response.status === 409) {
						delete this.pending[id];
						const states = { ...this.states }; delete states[id];
						const record = parseTourRecord(body.state);
						if (record) states[id] = record;
						this.states = states;
						if (this.active === id) { this.closePanels(); this.active = null; this.menuOpen = true; }
						this.syncError = 'Az útmutató másik ablakban vagy eszközön megváltozott. A friss állapotból folytathatod.';
						this.persist(); break;
					}
					if (!response.ok || !parseTourRecord(body.state)) throw new Error('unavailable');
					if (this.pending[id]?.operationId === sending.operationId) {
						delete this.pending[id]; this.states = { ...this.states, [id]: body.state };
					} else if (this.pending[id]) {
						this.pending[id]!.revision = body.state.revision;
						this.states = { ...this.states, [id]: { ...this.states[id]!, revision: body.state.revision } };
					}
					this.syncError = ''; this.persist();
				}
			}
		} catch {
			if (generation === this.generation) this.syncError = 'A mentés most nem elérhető. Visszakapcsolódáskor újrapróbáljuk.';
		} finally {
			this.flushing = false;
			if (generation !== this.generation && !this.disposed) void this.flush();
		}
	}
	start(id: TourId, resume = false) {
		if (!this.userId) return;
		this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		this.closePanels();
		const saved = this.states[id];
		this.active = id;
		this.context = resume && saved ? { ...saved.context } : {};
		this.stepId = resume && saved && TOURS[id].steps.some((s) => s.id === saved.stepId) ? saved.stepId : TOURS[id].steps[0].id;
		this.skipped = []; this.offer = false; this.offerPending = false; this.menuOpen = false; this.finished = false; this.navigating = false;
		this.save('active', !resume);
	}
	dismissOffer() {
		this.context = {}; this.stepId = TOURS.basics.steps[0].id;
		this.save('skipped', false, 'basics'); this.offer = false; this.offerPending = false;
	}
	next() {
		if (!this.active) return;
		const next = this.steps[this.index + 1];
		this.navigating = false;
		if (next) { this.stepId = next.id; this.save('active'); }
		else { this.save('completed'); this.closePanels(); this.active = null; this.finished = true; }
	}
	previous() {
		const previous = this.steps[this.index - 1];
		if (!previous) return;
		this.closePanels(); this.navigating = false; this.stepId = previous.id; this.save('active');
	}
	skipStep() {
		const id = this.stepId;
		this.next(); this.skipped = [...this.skipped, id];
	}
	skipPages(pages: TourStep['page'][]) {
		if (!this.active) return;
		const all = TOURS[this.active].steps;
		const index = all.findIndex((step) => step.id === this.stepId);
		this.skipped = [...new Set([...this.skipped, ...all.filter((step) => pages.includes(step.page) && !step.id.startsWith('nav-')).map((step) => step.id)])];
		const next = all.slice(index + 1).find((step) => !this.skipped.includes(step.id));
		if (next) { this.stepId = next.id; this.save('active'); }
		else { this.save('completed'); this.closePanels(); this.active = null; this.finished = true; }
	}
	signal(event: string, context: TourContext = {}) {
		if (!this.active) return;
		this.context = { ...this.context, ...context };
		if (this.step?.event === event) this.next();
	}
	pause() {
		const target = this.step ? [...document.querySelectorAll<HTMLElement>(this.step.target)].find((node) => node.getClientRects().length > 0) : null;
		const returnTo = this.returnFocus?.isConnected ? this.returnFocus : target;
		if (this.active) this.save('paused');
		this.closePanels(); this.active = null; this.navigating = false;
		const generation = this.generation;
		requestAnimationFrame(() => {
			if (this.active || generation !== this.generation || !returnTo?.isConnected) return;
			const tabindex = returnTo.getAttribute('tabindex');
			if (!returnTo.matches('button,a[href],input,select,textarea,[tabindex]')) {
				returnTo.setAttribute('tabindex', '-1');
				returnTo.addEventListener('blur', () => { if (tabindex === null) returnTo.removeAttribute('tabindex'); }, { once: true });
			}
			returnTo.focus({ preventScroll: true });
		});
	}
	dispose() { this.pause(); this.disposed = true; ++this.generation; }
}

export function provideTutorial() { const controller = new TutorialController(); setContext(KEY, controller); return controller; }
export function getTutorial(): TutorialController | undefined { return getContext(KEY); }
