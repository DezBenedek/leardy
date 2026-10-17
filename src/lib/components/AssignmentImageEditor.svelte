<script lang="ts">
	import { browser } from '$app/environment';
	import { Camera, Check, FlipHorizontal, FolderOpen, RotateCcw, RotateCw, X } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import MediaPermissionHelp from '$lib/components/MediaPermissionHelp.svelte';
	import { lockBody } from '$lib/overlay';

	/* Képszerkesztő beadandóhoz: fotózás vagy választás, téglalapos körülvágás,
	   forgatás, tükrözés,
	   feltöltés előtt optimalizált WebP/JPEG. */

	interface Props {
		open: boolean;
		onClose: () => void;
		onDone: (blob: Blob, width: number, height: number) => void;
	}

	let { open, onClose, onDone }: Props = $props();

	type Step = 'pick' | 'camera' | 'edit';
	interface Pt {
		x: number;
		y: number;
	}

	let step = $state<Step>('pick');
	let error = $state<string | null>(null);
	let busy = $state(false);
	/** Kamera nyitása folyamatban (engedélykérés, indulás). */
	let cameraBusy = $state(false);
	/** Letiltott kameraengedély: segítő ablak a bekapcsoláshoz. */
	let helpOpen = $state(false);

	let fileInput: HTMLInputElement | null = $state(null);
	let videoEl: HTMLVideoElement | null = $state(null);
	let stream: MediaStream | null = $state(null);
	let canvasEl: HTMLCanvasElement | null = $state(null);

	let imgEl: HTMLImageElement | null = $state(null);
	let imgUrl: string | null = $state(null);
	let imgW = $state(1);
	let imgH = $state(1);
	let rotation = $state(0);
	let mirror = $state(false);
	/** Vágópontok a kész (forgatott + tükrözött) képhez mérve, 0..1 között. */
	let points = $state<Pt[]>([
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 1, y: 1 },
		{ x: 0, y: 1 }
	]);
	/** Épp húzott sarok indexe. */
	let dragIdx: number | null = null;
	/** Előnézeti illesztés CSS-px-ben (pointerekhez). */
	let fit = { s: 1, ox: 0, oy: 0 };

	const rowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition hover:bg-stone-100 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-white/5';

	/** Megjelenített (forgatott) méretarány. */
	let swapped = $derived(rotation % 180 !== 0);
	let dispW = $derived(swapped ? imgH : imgW);
	let dispH = $derived(swapped ? imgW : imgH);

	function fullRect(): Pt[] {
		return [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
			{ x: 0, y: 1 }
		];
	}

	function reset() {
		step = 'pick';
		error = null;
		busy = false;
		cameraBusy = false;
		helpOpen = false;
		rotation = 0;
		mirror = false;
		points = fullRect();
		dragIdx = null;
		stopCamera();
		if (imgUrl) {
			try {
				URL.revokeObjectURL(imgUrl);
			} catch {
				// mindegy
			}
		}
		imgUrl = null;
		imgEl = null;
	}

	function close() {
		if (busy) return;
		reset();
		onClose();
	}

	$effect(() => {
		if (!open) reset();
	});

	// Teljes oldal: test görgetés tiltva + Escape zár (referencia-számlált).
	$effect(() => {
		if (!browser || !open) return;
		return lockBody();
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	async function loadFile(file: File | Blob) {
		error = null;
		if (file.size > 25 * 1024 * 1024) {
			error = 'Túl nagy kép: legfeljebb 25 MB lehet.';
			return;
		}
		if (imgUrl) {
			try {
				URL.revokeObjectURL(imgUrl);
			} catch {
				// mindegy
			}
		}
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			imgEl = img;
			imgUrl = url;
			imgW = img.naturalWidth || 1;
			imgH = img.naturalHeight || 1;
			rotation = 0;
			mirror = false;
				points = fullRect();
			dragIdx = null;
			step = 'edit';
			requestAnimationFrame(drawPreview);
		};
		img.onerror = () => {
			error = 'Nem olvasható képfájl.';
			try {
				URL.revokeObjectURL(url);
			} catch {
				// mindegy
			}
		};
		img.src = url;
	}

	function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		input.value = '';
		if (f) void loadFile(f);
	}

	/** Kameraállapot: a stream akkor is rákerül a videóra, ha az engedély
	    megadásakor a nézet még nem készült el (ez okozta a fekete képet). */
	$effect(() => {
		if (step === 'camera' && stream && videoEl) {
			if (videoEl.srcObject !== stream) videoEl.srcObject = stream;
			videoEl.play().catch(() => {});
		}
	});

	async function cameraPermissionState(): Promise<string> {
		try {
			const q = await navigator.permissions?.query({ name: 'camera' } as PermissionDescriptor);
			return q?.state ?? '';
		} catch {
			return '';
		}
	}

	async function openCamera() {
		error = null;
		if (!browser || !navigator.mediaDevices?.getUserMedia) {
			error = 'Ezen az eszközön nem érhető el a kamera. Válassz képet fájlból!';
			return;
		}
		if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(location.hostname)) {
			error = 'A kamera csak biztonságos (HTTPS) oldalon érhető el. Válassz képet fájlból!';
			return;
		}
		stopCamera();
		step = 'camera';
		cameraBusy = true;
		const tries: MediaStreamConstraints[] = [
			{
				video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
				audio: false
			},
			{ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false },
			{ video: true, audio: false }
		];
		let lastName = '';
		for (const constraints of tries) {
			try {
				stream = await navigator.mediaDevices.getUserMedia(constraints);
				if (videoEl) {
					videoEl.srcObject = stream;
					await videoEl.play().catch(() => {});
				}
				cameraBusy = false;
				return;
			} catch (e) {
				lastName = e instanceof Error ? e.name : 'Ismeretlen';
				try {
					console.error(
						'[kamera]',
						lastName,
						e instanceof Error ? e.message : String(e)
					);
				} catch {
					// mindegy
				}
				// Engedélyhiba: nincs értelme a többi beállítást próbálni.
				if (lastName === 'NotAllowedError' || lastName === 'SecurityError') break;
				if (lastName === 'AbortError') break;
				// NotFoundError / OverconstrainedError: jöhet a lazább beállítás.
			}
		}
		cameraBusy = false;
		const code = lastName ? ` [kód: ${lastName}]` : '';
		if (lastName === 'NotAllowedError' || lastName === 'SecurityError') {
			const state = await cameraPermissionState();
			if (state === 'denied') {
				error = `A kamera le van tiltva. Engedélyezd a hozzáférést!${code}`;
				helpOpen = true;
			} else {
				error = `Nem kaptunk kameraengedélyt. Koppints a Fotózásra az újbóli kéréshez!${code}`;
			}
		} else if (lastName === 'NotReadableError' || lastName === 'TrackStartError') {
			error = `A kamera használatban van egy másik alkalmazásban (pl. Teams, Zoom, Photo Booth). Zárd be ott, majd próbáld újra!${code}`;
		} else if (lastName === 'NotFoundError' || lastName === 'OverconstrainedError') {
			try {
				const devs = await navigator.mediaDevices.enumerateDevices();
				console.error(
					'[kamera] videoinput eszközök:',
					devs.filter((d) => d.kind === 'videoinput').length
				);
			} catch {
				// mindegy
			}
			error = `Nem található kamera ezen az eszközön. Válassz képet fájlból!${code}`;
		} else {
			error = `A kamera nem érhető el. Válassz képet fájlból!${code}`;
		}
		stopCamera();
		step = 'pick';
	}

	function stopCamera() {
		try {
			stream?.getTracks().forEach((t) => t.stop());
		} catch {
			// mindegy
		}
		stream = null;
		if (videoEl) videoEl.srcObject = null;
	}

	async function capture() {
		if (!videoEl || !stream) return;
		error = null;
		try {
			const w = videoEl.videoWidth || 0;
			const h = videoEl.videoHeight || 0;
			if (!w || !h) {
				error = 'A kamera még indul, várj egy pillanatot, majd próbáld újra!';
				return;
			}
			const c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			const ctx = c.getContext('2d');
			if (!ctx) return;
			ctx.drawImage(videoEl, 0, 0, w, h);
			const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.92));
			stopCamera();
			if (!blob) {
				error = 'Nem sikerült exponálni.';
				step = 'pick';
				return;
			}
			await loadFile(blob);
		} catch {
			error = 'Nem sikerült exponálni.';
		}
	}

	function rotate(delta: number) {
		rotation = (rotation + (mirror ? -delta : delta) + 360) % 360;
		const cw = delta === 90 || delta === -270;
		points = rectangle(points.map((p) => (cw ? { x: 1 - p.y, y: p.x } : { x: p.y, y: 1 - p.x })));
	}

	function toggleMirror() {
		mirror = !mirror;
		points = rectangle(points.map((p) => ({ x: 1 - p.x, y: p.y })));
	}

	function rectangle(corners: Pt[]): Pt[] {
		const left = Math.min(...corners.map((p) => p.x));
		const right = Math.max(...corners.map((p) => p.x));
		const top = Math.min(...corners.map((p) => p.y));
		const bottom = Math.max(...corners.map((p) => p.y));
		return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
	}

	/** Előnézet: a kész kép kicsinyítve, rajta a 4 pont és a köztük futó vonal. */
	function drawPreview() {
		const canvas = canvasEl;
		if (!canvas || !imgEl) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const cssW = canvas.clientWidth || 300;
		const cssH = canvas.clientHeight || 300;
		canvas.width = Math.max(1, Math.round(cssW * dpr));
		canvas.height = Math.max(1, Math.round(cssH * dpr));
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = '#111';
		ctx.fillRect(0, 0, cssW, cssH);
		const padding = 26;
		const s = Math.min((cssW - padding * 2) / dispW, (cssH - padding * 2) / dispH);
		const dw = dispW * s;
		const dh = dispH * s;
		const ox = (cssW - dw) / 2;
		const oy = (cssH - dh) / 2;
		fit = { s, ox, oy };
		const rot = ((rotation % 360) + 360) % 360;
		ctx.save();
		ctx.translate(ox + dw / 2, oy + dh / 2);
		if (mirror) ctx.scale(-1, 1);
		ctx.rotate((rot * Math.PI) / 180);
		ctx.drawImage(imgEl, (-imgW * s) / 2, (-imgH * s) / 2, imgW * s, imgH * s);
		ctx.restore();
		const P = points.map((p) => ({ x: ox + p.x * dw, y: oy + p.y * dh }));
		ctx.save();
		ctx.beginPath();
		ctx.rect(0, 0, cssW, cssH);
		ctx.moveTo(P[0].x, P[0].y);
		for (let k = 1; k < 4; k++) ctx.lineTo(P[k].x, P[k].y);
		ctx.closePath();
		ctx.fillStyle = 'rgba(0,0,0,0.55)';
		ctx.fill('evenodd');
		ctx.beginPath();
		ctx.moveTo(P[0].x, P[0].y);
		for (let k = 1; k < 4; k++) ctx.lineTo(P[k].x, P[k].y);
		ctx.closePath();
		ctx.strokeStyle = 'rgba(255,255,255,0.95)';
		ctx.lineWidth = 2;
		ctx.stroke();
		for (const p of P) {
			ctx.beginPath();
			ctx.arc(p.x, p.y, 13, 0, 7);
			ctx.fillStyle = 'rgba(0,0,0,0.45)';
			ctx.fill();
			ctx.beginPath();
			ctx.arc(p.x, p.y, 8, 0, 7);
			ctx.fillStyle = '#fff';
			ctx.fill();
		}
		ctx.restore();
	}

	$effect(() => {
		if (open && step === 'edit') {
			rotation;
			mirror;
			points;
			imgEl;
			requestAnimationFrame(drawPreview);
		}
	});

	$effect(() => {
		if (!open || step !== 'edit' || !canvasEl) return;
		const observer = new ResizeObserver(() => requestAnimationFrame(drawPreview));
		observer.observe(canvasEl);
		return () => observer.disconnect();
	});

	function clamp01(v: number): number {
		return Math.max(0, Math.min(1, v));
	}

	function toNorm(e: PointerEvent): Pt {
		const rect = canvasEl?.getBoundingClientRect();
		const cx = e.clientX - (rect?.left ?? 0);
		const cy = e.clientY - (rect?.top ?? 0);
		return {
			x: clamp01((cx - fit.ox) / (fit.s * dispW)),
			y: clamp01((cy - fit.oy) / (fit.s * dispH))
		};
	}

	function onPointerDown(e: PointerEvent) {
		if (!canvasEl || step !== 'edit') return;
		const rect = canvasEl.getBoundingClientRect();
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;
		const P = points.map((p) => ({ x: fit.ox + p.x * fit.s * dispW, y: fit.oy + p.y * fit.s * dispH }));
		const R = 30;
		let best = -1;
		let bestD = R;
		for (let i = 0; i < 4; i++) {
			const d = Math.hypot(P[i].x - cx, P[i].y - cy);
			if (d <= bestD) {
				bestD = d;
				best = i;
			}
		}
		if (best >= 0) {
			dragIdx = best;
			(canvasEl as HTMLElement).setPointerCapture(e.pointerId);
			e.preventDefault();
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (dragIdx === null || dragIdx === undefined) return;
		const n = toNorm(e);
		dragRect(dragIdx, n.x, n.y);
	}

	function onPointerUp() {
		dragIdx = null;
	}

	/** Téglalap mód: a sarok húzása a szemközti sarkot fixen hagyja. */
	function dragRect(i: number, nx: number, ny: number) {
		const MIN = 0.04;
		const o = (i + 2) % 4;
		const ox = points[o].x;
		const oy = points[o].y;
		nx = i === 0 || i === 3 ? Math.min(nx, ox - MIN) : Math.max(nx, ox + MIN);
		ny = i < 2 ? Math.min(ny, oy - MIN) : Math.max(ny, oy + MIN);
		nx = clamp01(nx);
		ny = clamp01(ny);
		const q = points.map((p) => ({ ...p }));
		q[i] = { x: nx, y: ny };
		const a = (i + 1) % 4;
		const b = (i + 3) % 4;
		if (i % 2 === 0) {
			q[a].y = ny;
			q[b].x = nx;
		} else {
			q[a].x = nx;
			q[b].y = ny;
		}
		points = q;
	}

	/** Kész kép renderelése (forgatás + tükrözés), legfeljebb 2048 px. */
	function renderFinal(): HTMLCanvasElement | null {
		if (!imgEl) return null;
		const rot = ((rotation % 360) + 360) % 360;
		const sw = rot === 90 || rot === 270;
		const dw = sw ? imgH : imgW;
		const dh = sw ? imgW : imgH;
		const k = Math.min(1, 2048 / Math.max(dw, dh));
		const ow = Math.max(1, Math.round(dw * k));
		const oh = Math.max(1, Math.round(dh * k));
		const out = document.createElement('canvas');
		out.width = ow;
		out.height = oh;
		const ctx = out.getContext('2d');
		if (!ctx) return null;
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, ow, oh);
		ctx.save();
		ctx.translate(ow / 2, oh / 2);
		if (mirror) ctx.scale(-1, 1);
		ctx.rotate((rot * Math.PI) / 180);
		ctx.drawImage(imgEl, (-imgW * k) / 2, (-imgH * k) / 2, imgW * k, imgH * k);
		ctx.restore();
		return out;
	}

	function encodeCanvas(out: HTMLCanvasElement): Promise<Blob | null> {
		return new Promise((res) => {
			try {
				out.toBlob(
					(b) => {
						if (b) res(b);
						else out.toBlob(res, 'image/jpeg', 0.85);
					},
					'image/webp',
					0.82
				);
			} catch {
				res(null);
			}
		});
	}

	async function confirm() {
		if (!imgEl || busy) return;
		busy = true;
		error = null;
		try {
			const fin = renderFinal();
			if (!fin) throw new Error('render');
			const fw = fin.width;
			const fh = fin.height;
			const S = points.map((p) => ({ x: p.x * fw, y: p.y * fh }));
			const out = document.createElement('canvas');
			const x0 = Math.max(0, Math.min(S[0].x, S[1].x, S[2].x, S[3].x));
			const x1 = Math.min(fw, Math.max(S[0].x, S[1].x, S[2].x, S[3].x));
			const y0 = Math.max(0, Math.min(S[0].y, S[1].y, S[2].y, S[3].y));
			const y1 = Math.min(fh, Math.max(S[0].y, S[1].y, S[2].y, S[3].y));
			const w = Math.round(x1 - x0);
			const h = Math.round(y1 - y0);
			if (w < 8 || h < 8) {
				error = 'Túl kicsi a kijelölés, húzd kijjebb a sarkokat!';
				return;
			}
			out.width = w;
			out.height = h;
			const ctx = out.getContext('2d');
			if (!ctx) throw new Error('ctx');
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, w, h);
			ctx.drawImage(fin, x0, y0, w, h, 0, 0, w, h);
			const blob = await encodeCanvas(out);
			if (!blob) throw new Error('encode');
			const done = onDone;
			const ow = out.width;
			const oh = out.height;
			reset();
			done(blob, ow, oh);
		} catch {
			if (!error) error = 'Nem sikerült feldolgozni a képet.';
		} finally {
			busy = false;
		}
	}
</script>

{#if open && step !== 'pick'}
	<div use:portal>
	<div
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-label="Képszerkesztő"
		onkeydown={onKey}
		class="fixed inset-0 z-[95] flex flex-col bg-white outline-none dark:bg-stone-950"
	>
		<header
			class="shrink-0 border-b border-stone-200 bg-white dark:border-white/10 dark:bg-stone-950"
			style="padding-top: max(0.5rem, env(safe-area-inset-top))"
		>
			<div class="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2.5">
				<p class="min-w-0 flex-1 truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
					{#if step === 'camera'}Fotózás{:else}Kép szerkesztése{/if}
				</p>
				<button
					type="button"
					onclick={close}
					aria-label="Bezárás"
					class="grid size-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-500 transition hover:rotate-90 hover:bg-stone-200 hover:text-ink-900 active:scale-95 motion-reduce:transition-none motion-reduce:hover:rotate-0 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15 dark:hover:text-white"
				>
					<X size={19} />
				</button>
			</div>
		</header>

		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
			<div class="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pt-4 pb-6">
				{#if step === 'camera'}
					<div class="grid w-full gap-3">
						<div class="relative overflow-hidden rounded-2xl bg-black">
							<video bind:this={videoEl} playsinline autoplay muted class="aspect-[4/3] max-h-[60dvh] w-full object-cover"></video>
							{#if cameraBusy}
								<p class="absolute inset-0 grid place-items-center text-[14px] font-bold text-white/90">
									Kamera indítása…
								</p>
							{/if}
						</div>
						{#if error}
							<p role="alert" class="text-[13px] font-medium text-red-600 dark:text-red-300">{error}</p>
						{/if}
					</div>
				{:else}
					<div class="grid w-full gap-3">
						<div class="mx-auto w-full max-w-[520px]">
							<canvas
								bind:this={canvasEl}
								class="w-full touch-none"
								style="height: clamp(180px, calc(100dvh - 290px), 560px)"
								onpointerdown={onPointerDown}
								onpointermove={onPointerMove}
								onpointerup={onPointerUp}
								onpointercancel={onPointerUp}
							></canvas>
						</div>
						<p class="text-center text-[13px] text-stone-500 dark:text-stone-400">
							Húzd a fehér sarkokat a téglalap alakú vágáshoz.
						</p>
						{#if error}
							<p role="alert" class="text-center text-[13px] font-medium text-red-600 dark:text-red-300">{error}</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<footer
			class="shrink-0 border-t border-stone-200 bg-white dark:border-white/10 dark:bg-stone-950"
			style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
		>
			<div class="mx-auto w-full max-w-2xl px-4 pt-3">
				{#if step === 'camera'}
					<div class="grid grid-cols-2 gap-2.5">
						<Button
							variant="outline"
							block
							onclick={() => {
								stopCamera();
								step = 'pick';
							}}
						>
							Vissza
						</Button>
						<Button block disabled={cameraBusy} onclick={capture}>
							<Camera size={17} /> Exponálás
						</Button>
					</div>
				{:else}
					<div class="flex items-center justify-center gap-3">
						<IconButton ariaLabel="Forgatás balra" size={44} onclick={() => rotate(-90)}>
							<RotateCcw size={19} />
						</IconButton>
						<IconButton ariaLabel="Forgatás jobbra" size={44} onclick={() => rotate(90)}>
							<RotateCw size={19} />
						</IconButton>
						<IconButton ariaLabel="Tükrözés" size={44} onclick={toggleMirror}>
							<span class={mirror ? 'text-brand-600 dark:text-brand-300' : ''}>
								<FlipHorizontal size={19} />
							</span>
						</IconButton>
					</div>
					<div class="mt-2 grid grid-cols-2 gap-2.5">
						<Button
							variant="outline"
							block
							disabled={busy}
							onclick={() => {
								step = 'pick';
							}}
						>
							Másik kép
						</Button>
						<Button block busy={busy} onclick={confirm}>
							<Check size={17} /> {busy ? '…' : 'Kész'}
						</Button>
					</div>
				{/if}
			</div>
		</footer>
	</div>
	</div>
{/if}

	<div use:portal>
		<Sheet open={open && step === 'pick'} label="Kép hozzáadása" title="Kép hozzáadása" onClose={close}>
			<ul class="-mx-1 mt-2 space-y-0.5">
				<li>
					<button type="button" onclick={() => void openCamera()} class={rowBtn}>
						<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300">
							<Camera size={18} aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Fotózás</span>
							<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Kamera megnyitása</span>
						</span>
					</button>
				</li>
				<li>
					<button type="button" onclick={() => fileInput?.click()} class={rowBtn}>
						<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300">
							<FolderOpen size={18} aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Feltöltés fájlból</span>
							<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Kész fotó kiválasztása</span>
						</span>
					</button>
				</li>
			</ul>
			{#if error}
				<p role="alert" class="mt-2 text-[13px] font-medium text-red-600 dark:text-red-300">{error}</p>
			{/if}
			{#if busy}
				<p class="mt-2 text-[13px] text-stone-400 dark:text-stone-500">Feldolgozás…</p>
			{/if}
		</Sheet>
	</div>

<MediaPermissionHelp
	open={helpOpen}
	kind="camera"
	onClose={() => (helpOpen = false)}
	onRetry={() => void openCamera()}
/>

<input
	bind:this={fileInput}
	type="file"
	accept="image/*"
	class="hidden"
	aria-hidden="true"
	tabindex="-1"
	onchange={onFileChange}
/>
