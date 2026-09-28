<script lang="ts">
	import { browser } from '$app/environment';
	import { FolderOpen, Mic, Pause, Play, RotateCcw, Check, X, Square } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import MediaPermissionHelp from '$lib/components/MediaPermissionHelp.svelte';
	import { lockBody } from '$lib/overlay';

	/* Hangrögzítő beadandóhoz: felvétel vagy fájl, automatikus csendvágás
	   az elejéről és végéről (1 mp ráhagyással), meghallgatás, tömörített feltöltés. */

	interface Props {
		open: boolean;
		onClose: () => void;
		onDone: (blob: Blob, durationSec: number) => void;
	}

	let { open, onClose, onDone }: Props = $props();

	type Step = 'pick' | 'recording' | 'edit';
	let step = $state<Step>('pick');
	let error = $state<string | null>(null);
	let busy = $state(false);
	/** Letiltott mikrofonengedély: segítő ablak a bekapcsoláshoz. */
	let helpOpen = $state(false);

	let fileInput: HTMLInputElement | null = $state(null);
	let canvasEl: HTMLCanvasElement | null = $state(null);

	let recorder: MediaRecorder | null = $state(null);
	let recStream: MediaStream | null = $state(null);
	let recChunks: Blob[] = [];
	let recSecs = $state(0);
	let recTimer: ReturnType<typeof setInterval> | null = null;
	const MAX_RECS_SECS = 600;

	/** A vágott (csend nélküli) hang. */
	let buffer: AudioBuffer | null = $state(null);
	let totalSecs = $state(0);

	let audioCtx: AudioContext | null = null;
	let previewSrc: AudioBufferSourceNode | null = null;
	let playing = $state(false);
	let waveRaf = 0;

	onDestroy(() => {
		if (recTimer) {
			clearInterval(recTimer);
			recTimer = null;
		}
		if (waveRaf) {
			cancelAnimationFrame(waveRaf);
			waveRaf = 0;
		}
		stopPreview();
		stopRecorderTracks();
		try {
			if (recorder && recorder.state !== 'inactive') recorder.onstop = null;
		} catch {
			// mindegy
		}
		recorder = null;
		try {
			if (audioCtx && audioCtx.state !== 'closed') void audioCtx.close().catch(() => {});
		} catch {
			// mindegy
		}
		audioCtx = null;
	});

	const rowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition hover:bg-stone-100 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-white/5';

	function fmt(s: number): string {
		if (!Number.isFinite(s) || s < 0) s = 0;
		const m = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		return `${m}:${String(sec).padStart(2, '0')}`;
	}

	function reset() {
		step = 'pick';
		error = null;
		busy = false;
		helpOpen = false;
		stopPreview();
		stopRecorderTracks();
		if (recTimer) {
			clearInterval(recTimer);
			recTimer = null;
		}
		recorder = null;
		recChunks = [];
		recSecs = 0;
		buffer = null;
		totalSecs = 0;
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

	function stopRecorderTracks() {
		try {
			recStream?.getTracks().forEach((t) => t.stop());
		} catch {
			// mindegy
		}
		recStream = null;
	}

	function pickMime(): string {
		// MP4/AAC elöl: Safariban is lejátszható (az Opus WebM-et a Safari nem viszi).
		const cands = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
		try {
			for (const c of cands) {
				if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
			}
		} catch {
			// mindegy
		}
		return '';
	}

	async function startRecording() {
		error = null;
		try {
			if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
				error = 'Ezen az eszközön nem érhető el a hangfelvétel. Válassz hangfájlt!';
				return;
			}
			stopRecorderTracks();
			recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const mime = pickMime();
			recorder = mime ? new MediaRecorder(recStream, { mimeType: mime }) : new MediaRecorder(recStream);
			recChunks = [];
			recorder.ondataavailable = (e) => {
				if (e.data && e.data.size > 0) recChunks.push(e.data);
			};
			recorder.onstop = () => {
				if (recTimer) {
					clearInterval(recTimer);
					recTimer = null;
				}
				const blob = new Blob(recChunks, { type: recorder?.mimeType || 'audio/webm' });
				stopRecorderTracks();
				if (blob.size === 0) {
					error = 'Üres lett a felvétel. Próbáld újra!';
					step = 'pick';
					return;
				}
				void decodeBlob(blob);
			};
			recorder.start(500);
			recSecs = 0;
			step = 'recording';
			recTimer = setInterval(() => {
				recSecs += 1;
				if (recSecs >= MAX_RECS_SECS) stopRecording();
			}, 1000);
		} catch (e) {
			const name = e instanceof DOMException ? e.name : '';
			if (name === 'NotAllowedError' || name === 'SecurityError') {
				error = 'A mikrofon le van tiltva. Engedélyezd a hozzáférést!';
				helpOpen = true;
			} else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
				error = 'Nem található mikrofon ezen az eszközön. Válassz hangfájlt!';
			} else {
				error = 'A mikrofon nem érhető el. Engedélyezd a hozzáférést, vagy válassz hangfájlt!';
			}
			step = 'pick';
		}
	}

	function stopRecording() {
		try {
			if (recorder && recorder.state !== 'inactive') recorder.stop();
			else {
				if (recTimer) {
					clearInterval(recTimer);
					recTimer = null;
				}
				stopRecorderTracks();
				step = 'pick';
			}
		} catch {
			step = 'pick';
		}
	}

	function cancelRecording() {
		if (recTimer) {
			clearInterval(recTimer);
			recTimer = null;
		}
		try {
			if (recorder && recorder.state !== 'inactive') {
				recorder.ondataavailable = null;
				recorder.onstop = () => {
					stopRecorderTracks();
					step = 'pick';
				};
				recorder.stop();
			} else {
				stopRecorderTracks();
				step = 'pick';
			}
		} catch {
			stopRecorderTracks();
			step = 'pick';
		}
		recorder = null;
		recChunks = [];
		recSecs = 0;
	}

	function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		input.value = '';
		if (!f) return;
		error = null;
		if (f.size > 25 * 1024 * 1024) {
			error = 'Túl nagy hangfájl: legfeljebb 25 MB lehet.';
			return;
		}
		void decodeBlob(f);
	}

	function getCtx(): AudioContext {
		if (!audioCtx) audioCtx = new AudioContext();
		if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {});
		return audioCtx;
	}

	/** Csendkeresés: az első és utolsó hangos rész, 1 mp ráhagyással. */
	function findSpeechRange(buf: AudioBuffer): { start: number; end: number } {
		const dur = buf.duration;
		const TH = 0.02;
		const WIN = Math.max(1024, Math.floor(buf.sampleRate * 0.05));
		const nCh = buf.numberOfChannels;
		const lens: number[] = [];
		for (let c = 0; c < nCh; c++) lens.push(buf.getChannelData(c).length);
		const total = Math.min(...lens);
		const chans: Float32Array[] = [];
		for (let c = 0; c < nCh; c++) chans.push(buf.getChannelData(c));
		let first = -1;
		let last = -1;
		for (let i = 0; i < total; i += WIN) {
			let peak = 0;
			const to = Math.min(total, i + WIN);
			for (let c = 0; c < nCh; c++) {
				const d = chans[c];
				for (let j = i; j < to; j += 4) {
					const v = Math.abs(d[j]);
					if (v > peak) peak = v;
					if (peak >= TH) break;
				}
				if (peak >= TH) break;
			}
			if (peak >= TH) {
				if (first < 0) first = i;
				last = to;
			}
		}
		if (first < 0) return { start: 0, end: dur };
		const PAD = 1;
		return {
			start: Math.max(0, first / buf.sampleRate - PAD),
			end: Math.min(dur, last / buf.sampleRate + PAD)
		};
	}

	function sliceBuffer(buf: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
		const from = Math.max(0, Math.floor(startSec * buf.sampleRate));
		const to = Math.min(buf.length, Math.ceil(endSec * buf.sampleRate));
		if (to - from >= buf.length) return buf;
		const out = new AudioBuffer({
			numberOfChannels: buf.numberOfChannels,
			length: Math.max(1, to - from),
			sampleRate: buf.sampleRate
		});
		for (let c = 0; c < buf.numberOfChannels; c++) {
			out.getChannelData(c).set(buf.getChannelData(c).subarray(from, to));
		}
		return out;
	}

	async function decodeBlob(blob: Blob) {
		error = null;
		busy = true;
		try {
			const ctx = getCtx();
			const bytes = await blob.arrayBuffer();
			const decoded = await ctx.decodeAudioData(bytes.slice(0));
			if (!decoded || decoded.duration < 0.3) {
				error = 'Túl rövid vagy olvashatatlan hang.';
				step = 'pick';
				return;
			}
			const range = findSpeechRange(decoded);
			const trimmed = sliceBuffer(decoded, range.start, range.end);
			if (!trimmed || trimmed.duration < 0.3) {
				error = 'Túl rövid vagy olvashatatlan hang.';
				step = 'pick';
				return;
			}
		buffer = trimmed;
		totalSecs = trimmed.duration;
		step = 'edit';
		if (waveRaf) cancelAnimationFrame(waveRaf);
		waveRaf = requestAnimationFrame(drawWave);
		} catch {
			error = 'Nem olvasható hangfájl.';
			step = 'pick';
		} finally {
			busy = false;
		}
	}

	function peaks(): number[] {
		const buf = buffer;
		if (!buf) return [];
		const W = canvasEl?.clientWidth || 320;
		const N = Math.max(200, Math.min(800, Math.round(W / 2)));
		const ch0 = buf.getChannelData(0);
		const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
		const out: number[] = [];
		const per = Math.max(1, Math.floor(ch0.length / N));
		for (let i = 0; i < N; i++) {
			let max = 0;
			const from = i * per;
			for (let j = from; j < from + per && j < ch0.length; j += 7) {
				const v = Math.abs(ch0[j]) + (ch1 ? Math.abs(ch1[j]) : 0);
				if (v > max) max = v;
			}
			out.push(Math.min(1, max));
		}
		return out;
	}

	function drawWave() {
		const canvas = canvasEl;
		const buf = buffer;
		if (!canvas || !buf) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const W = canvas.clientWidth || 320;
		const H = 160;
		canvas.width = W * dpr;
		canvas.height = H * dpr;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, W, H);
		const data = peaks();
		const mid = H / 2;
		for (let i = 0; i < data.length; i++) {
			const x = (i / data.length) * W;
			const h = Math.max(2, data[i] * (H - 12));
			ctx.fillStyle = '#f59e0b';
			ctx.fillRect(x, mid - h / 2, Math.max(1, W / data.length - 0.5), h);
		}
	}

	$effect(() => {
		if (open && step === 'edit') {
			buffer;
			if (waveRaf) cancelAnimationFrame(waveRaf);
			waveRaf = requestAnimationFrame(drawWave);
		}
	});

	$effect(() => {
		if (!browser || !open || step !== 'edit') return;
		const onResize = () => {
			if (waveRaf) cancelAnimationFrame(waveRaf);
			waveRaf = requestAnimationFrame(drawWave);
		};
		window.addEventListener('resize', onResize);
		window.addEventListener('orientationchange', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('orientationchange', onResize);
		};
	});

	function stopPreview() {
		try {
			previewSrc?.stop();
		} catch {
			// mindegy
		}
		try {
			previewSrc?.disconnect();
		} catch {
			// mindegy
		}
		previewSrc = null;
		playing = false;
	}

	function togglePreview() {
		const buf = buffer;
		if (!buf) return;
		if (playing) {
			stopPreview();
			return;
		}
		try {
			const ctx = getCtx();
			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.connect(ctx.destination);
			src.onended = () => {
				playing = false;
				previewSrc = null;
			};
			src.start();
			previewSrc = src;
			playing = true;
		} catch {
			error = 'Nem indítható a lejátszás.';
		}
	}

	/** Tömörített kódolás: Opus WebM-ben (vagy MP4-ben), visszalépésként WAV. */
	async function encodeCompressed(buf: AudioBuffer): Promise<Blob> {
		const mime = pickMime();
		if (browser && mime && window.MediaRecorder) {
			try {
				const ctx = getCtx();
				const dest = ctx.createMediaStreamDestination();
				const src = ctx.createBufferSource();
				src.buffer = buf;
				src.connect(dest);
				const rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 64000 });
				const chunks: Blob[] = [];
				rec.ondataavailable = (e) => {
					if (e.data && e.data.size > 0) chunks.push(e.data);
				};
				const stopped = new Promise<void>((resolve) => {
					rec.onstop = () => resolve();
				});
				const ended = new Promise<void>((resolve) => {
					src.onended = () => resolve();
				});
				rec.start(250);
				src.start();
				await ended;
				await new Promise((r) => setTimeout(r, 120));
				if (rec.state !== 'inactive') rec.stop();
				await stopped;
				if (chunks.length > 0) return new Blob(chunks, { type: rec.mimeType || mime });
			} catch {
				// visszalépés WAV-re
			}
		}
		return encodeWavMono(buf);
	}

	function encodeWavMono(buf: AudioBuffer): Blob {
		const targetRate = Math.min(16000, buf.sampleRate);
		const nCh = buf.numberOfChannels;
		const ratio = buf.sampleRate / targetRate;
		const len = Math.max(1, Math.floor(buf.length / ratio));
		const chans: Float32Array[] = [];
		for (let c = 0; c < nCh; c++) chans.push(buf.getChannelData(c));
		const mono = new Float32Array(len);
		for (let i = 0; i < len; i++) {
			const at = Math.min(buf.length - 1, Math.floor(i * ratio));
			let sum = 0;
			for (let c = 0; c < nCh; c++) sum += chans[c][at];
			mono[i] = sum / nCh;
		}
		const bytes = new ArrayBuffer(44 + len * 2);
		const v = new DataView(bytes);
		const writeStr = (off: number, s: string) => {
			for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
		};
		writeStr(0, 'RIFF');
		v.setUint32(4, 36 + len * 2, true);
		writeStr(8, 'WAVE');
		writeStr(12, 'fmt ');
		v.setUint32(16, 16, true);
		v.setUint16(20, 1, true);
		v.setUint16(22, 1, true);
		v.setUint32(24, targetRate, true);
		v.setUint32(28, targetRate * 2, true);
		v.setUint16(32, 2, true);
		v.setUint16(34, 16, true);
		writeStr(36, 'data');
		v.setUint32(40, len * 2, true);
		for (let i = 0; i < len; i++) {
			const s = Math.max(-1, Math.min(1, mono[i]));
			v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
		}
		return new Blob([bytes], { type: 'audio/wav' });
	}

	async function confirm() {
		const buf = buffer;
		if (!buf || busy) return;
		busy = true;
		error = null;
		stopPreview();
		try {
			const out = await encodeCompressed(buf);
			const done = onDone;
			const dur = buf.duration;
			reset();
			done(out, dur);
		} catch {
			error = 'Nem sikerült feldolgozni a hangot.';
		} finally {
			busy = false;
		}
	}
</script>

{#if open && step !== 'pick'}
	<div
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-label="Hangfelvétel"
		onkeydown={onKey}
		class="fixed inset-0 z-[95] flex flex-col bg-white outline-none dark:bg-stone-950"
	>
		<header
			class="shrink-0 border-b border-stone-200 bg-white dark:border-white/10 dark:bg-stone-950"
			style="padding-top: max(0.5rem, env(safe-area-inset-top))"
		>
			<div class="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2.5">
				<p class="min-w-0 flex-1 truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
					{#if step === 'recording'}Felvétel{:else}Meghallgatás{/if}
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
				{#if step === 'recording'}
					<div class="m-auto grid w-full place-items-center gap-5 py-8">
						<span class="size-4 animate-pulse rounded-full bg-red-500"></span>
						<p class="font-display text-[56px] leading-none font-extrabold text-ink-900 tabular-nums dark:text-white">
							{fmt(recSecs)}
						</p>
						<div class="w-full max-w-xs">
							<div class="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10" role="progressbar" aria-valuenow={recSecs} aria-valuemin={0} aria-valuemax={MAX_RECS_SECS} aria-label="Felvétel hossza">
								<div class="h-full rounded-full bg-red-500 transition-all duration-1000" style="width: {Math.min(100, (recSecs / MAX_RECS_SECS) * 100)}%"></div>
							</div>
							<p class="mt-1.5 text-center text-[13px] text-stone-400 tabular-nums dark:text-stone-500">
								max {fmt(MAX_RECS_SECS)}
							</p>
						</div>
					</div>
				{:else}
					<div class="grid w-full gap-4">
						<div class="flex items-baseline justify-center gap-3">
							<p class="font-display text-[34px] leading-none font-extrabold text-ink-900 tabular-nums dark:text-white">
								{fmt(totalSecs)}
							</p>
						</div>
						<div>
							<canvas
								bind:this={canvasEl}
								class="h-[160px] w-full rounded-2xl bg-stone-100 dark:bg-white/5"
							></canvas>
							<p class="mt-1 text-center text-[12px] text-stone-400 dark:text-stone-500">
								Az elejéről és végéről a csendet automatikusan levágtuk.
							</p>
						</div>
						{#if error}
							<p role="alert" class="text-[13px] font-medium text-red-600 dark:text-red-300">{error}</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		{#if step === 'recording'}
			<footer
				class="shrink-0 border-t border-stone-200 bg-white dark:border-white/10 dark:bg-stone-950"
				style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
			>
				<div class="mx-auto grid w-full max-w-2xl grid-cols-2 gap-2.5 px-4 pt-3">
					<Button variant="outline" block onclick={cancelRecording}>Mégse</Button>
					<Button block variant="danger" onclick={stopRecording}>
						<Square size={16} /> Leállítás
					</Button>
				</div>
			</footer>
		{:else if step === 'edit'}
			<footer
				class="shrink-0 border-t border-stone-200 bg-white dark:border-white/10 dark:bg-stone-950"
				style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
			>
				<div class="mx-auto grid w-full max-w-2xl grid-cols-3 gap-2.5 px-4 pt-3">
					<Button variant="outline" block disabled={busy} onclick={togglePreview}>
						{#if playing}<Pause size={16} /> Stop{:else}<Play size={16} /> Lejátszás{/if}
					</Button>
					<Button
						variant="outline"
						block
						disabled={busy}
						onclick={() => {
							stopPreview();
							step = 'pick';
						}}
					>
						<RotateCcw size={16} /> Újra
					</Button>
					<Button block busy={busy} onclick={confirm}>
						<Check size={17} /> {busy ? '…' : 'Kész'}
					</Button>
				</div>
			</footer>
		{/if}
	</div>
{/if}

	<div use:portal>
		<Sheet open={open && step === 'pick'} label="Hang hozzáadása" title="Hang hozzáadása" onClose={close}>
			<ul class="-mx-1 mt-2 space-y-0.5">
				<li>
					<button type="button" onclick={() => void startRecording()} class={rowBtn}>
						<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300">
							<Mic size={18} aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Felvétel</span>
							<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Mikrofonnal, max 10 perc</span>
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
							<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Kész hangfájl kiválasztása</span>
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
	kind="microphone"
	onClose={() => (helpOpen = false)}
	onRetry={() => void startRecording()}
/>

<input
	bind:this={fileInput}
	type="file"
	accept="audio/*"
	class="hidden"
	aria-hidden="true"
	tabindex="-1"
	onchange={onFileChange}
/>
