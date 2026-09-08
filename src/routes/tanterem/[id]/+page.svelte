<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, Link2, Megaphone, Plus, Trash2 } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { studyApi, type AssignmentRow, type Classroom, type LessonRow, type MessageRow, type Topic } from '$lib/study';

	let { params } = $props();

	let room = $state<Classroom | null>(null);
	let assigns = $state<AssignmentRow[]>([]);
	let members = $state<{ name: string }[]>([]);
	let messages = $state<MessageRow[]>([]);
	let err = $state<string | null>(null);

	let isTeacher = $derived((auth.user?.role ?? 'student') === 'teacher');
	let openMsg = $state<string | null>(null);

	// Üzenetküldés (tanár)
	let showMsgForm = $state(false);
	let mTitle = $state('');
	let mBody = $state('');
	let mLink = $state('');
	let mTopic = $state('');
	let mLesson = $state('');
	let topicLessons = $state<LessonRow[]>([]);
	let libTopics = $state<Topic[]>([]);

	async function loadMessages() {
		try {
			messages = (await studyApi.messages(params.id)).messages;
		} catch {
			// üzenetek nélkül is megy az oldal
		}
	}

	async function loadLib() {
		if (libTopics.length > 0) return;
		try {
			libTopics = (await studyApi.topics('')).topics;
		} catch {
			// csatolmány nélkül is lehet üzenni
		}
	}

	async function loadTopicLessons(tid: string) {
		mLesson = '';
		topicLessons = [];
		if (!tid) return;
		try {
			topicLessons = (await studyApi.topic(tid)).lessons;
		} catch {
			// üresen marad
		}
	}

	async function send() {
		if (!mTitle.trim()) return;
		try {
			const ref = mLesson || mTopic;
			await studyApi.sendMessage(params.id, {
				title: mTitle.trim(),
				body: mBody.trim(),
				link_url: mLink.trim(),
				...(ref ? (mLesson ? { ref_type: 'lesson', ref_id: mLesson } : { ref_type: 'topic', ref_id: mTopic }) : {})
			});
			mTitle = '';
			mBody = '';
			mLink = '';
			mTopic = '';
			mLesson = '';
			showMsgForm = false;
			await loadMessages();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function removeMsg(id: string) {
		try {
			await studyApi.deleteMessage(id);
			messages = messages.filter((m) => m.id !== id);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function revoke(id: string) {
		try {
			await studyApi.revokeAssignment(id);
			assigns = assigns.filter((a) => a.id !== id);
			invalidate('assignments');
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	function fmtDate(ts: number): string {
		return new Date(ts).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	const input =
		'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white';

	onMount(() => {
		const cached = peek<{ classroom: Classroom; assignments: AssignmentRow[]; members: { name: string }[] }>(
			`classroom:${params.id}`
		);
		if (cached) {
			room = cached.classroom;
			assigns = cached.assignments;
			members = cached.members;
		}
		void (async () => {
			try {
				const data = await cacheGet(`classroom:${params.id}`, () => studyApi.classroom(params.id), 30000);
				room = data.data.classroom;
				assigns = data.data.assignments;
				members = data.data.members;
				void loadMessages();
			} catch (e) {
				if (!room) err = e instanceof Error ? e.message : 'Hiba történt.';
			}
		})();
		void loadMessages();
	});

	function fmtDue(ts: number): string {
		if (!ts) return 'nincs határidő';
		return new Date(ts).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:head>
	<title>{room ? `${room.name} — Tanterem` : 'Osztály — Leardy'}</title>
</svelte:head>

<div class="mt-3 flex items-center gap-2">
	<a
		href="/tanterem"
		aria-label="Vissza a tanterembe"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-white"
	>
		<ArrowLeft size={20} />
	</a>
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{room ? room.name : 'Osztály'}</h1>
</div>

{#if err && !room}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if !room}
	<p class="animate-pulse mt-2 text-sm text-stone-500 dark:text-stone-400">Betöltés…</p>
{:else}
	<section class="mt-2 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<p class="text-sm text-ink-600 dark:text-stone-400">
			{#if room.subject}<span class="mr-2 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-600 dark:bg-white/10 dark:text-stone-300">{room.subject}</span>{/if}
			Kód: <span class="font-bold tracking-widest">{room.code}</span> · {members.length} tag
		</p>
	</section>

	<!-- Üzenőfal -->
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900" aria-label="Üzenetek">
		<div class="flex items-center justify-between gap-2">
			<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900 dark:text-white">
				<Megaphone size={18} class="text-ink-400 dark:text-stone-500" /> Üzenetek
			</h2>
			{#if isTeacher && room.mine === 1}
				<button
					onclick={() => {
						showMsgForm = !showMsgForm;
						if (showMsgForm) void loadLib();
					}}
					aria-label="Új üzenet"
					class="grid size-8 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95"
				>
					<Plus size={17} strokeWidth={2.5} />
				</button>
			{/if}
		</div>

		{#if showMsgForm && isTeacher}
			<div class="anim-pop mt-3 space-y-2 rounded-2xl bg-stone-100 p-3.5 dark:bg-white/5">
				<input bind:value={mTitle} placeholder="Cím" aria-label="Üzenet címe" class={input} />
				<textarea bind:value={mBody} rows="3" placeholder="Szöveg (opcionális)" aria-label="Üzenet szövege" class={input}></textarea>
				<input bind:value={mLink} placeholder="Link (opcionális)" aria-label="Link" inputmode="url" class={input} />
				<div class="grid grid-cols-2 gap-2">
					<select
						bind:value={mTopic}
						onchange={() => void loadTopicLessons(mTopic)}
						aria-label="Csatolt témakör"
						class={input}
					>
						<option value="">Témakör…</option>
						{#each libTopics as t (t.id)}
							<option value={t.id}>{t.title}</option>
						{/each}
					</select>
					<select bind:value={mLesson} aria-label="Csatolt lecke" class={input} disabled={!mTopic}>
						<option value="">Lecke…</option>
						{#each topicLessons as l (l.id)}
							<option value={l.id}>{l.title}</option>
						{/each}
					</select>
				</div>
				<button
					onclick={() => void send()}
					disabled={!mTitle.trim()}
					class="w-full rounded-full bg-brand-500 py-2.5 text-sm font-bold text-white disabled:opacity-60"
				>
					Közzététel
				</button>
			</div>
		{/if}

		<ul class="mt-3 space-y-2">
			{#each messages as m (m.id)}
				<li class="rounded-xl border border-stone-100 dark:border-white/10">
					<button
						onclick={() => (openMsg = openMsg === m.id ? null : m.id)}
						class="flex w-full items-center gap-2.5 p-3.5 text-left"
					>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-semibold text-ink-900 dark:text-white">{m.title}</span>
							<span class="block text-[13px] text-ink-400 dark:text-stone-500">
								{m.teacher_name} · {fmtDate(m.created_at)}
							</span>
						</span>
					</button>
					{#if openMsg === m.id}
						<div class="anim-fade space-y-2 px-3.5 pb-3.5">
							{#if m.body}
								<p class="text-sm leading-relaxed whitespace-pre-wrap text-ink-900 dark:text-stone-200">{m.body}</p>
							{/if}
							{#if m.ref_link}
								<a
									href={m.ref_link}
									class="flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-bold text-brand-700 dark:bg-brand-500/15 dark:text-white"
								>
									<Link2 size={15} /> {m.ref_title ?? (m.ref_type === 'lesson' ? 'Lecke' : 'Témakör')}
								</a>
							{/if}
							{#if m.link_url}
								<a
									href={m.link_url}
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2.5 text-sm font-semibold text-ink-600 break-all dark:bg-white/10 dark:text-stone-200"
								>
									<Link2 size={15} class="shrink-0" /> {m.link_url}
								</a>
							{/if}
							{#if isTeacher && room.mine === 1}
								<button
									onclick={() => void removeMsg(m.id)}
									class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10"
								>
									<Trash2 size={14} /> Törlés
								</button>
							{/if}
						</div>
					{/if}
				</li>
			{:else}
				<p class="text-sm text-stone-500 dark:text-stone-400">Még nincs üzenet.</p>
			{/each}
		</ul>
	</section>

	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<h2 class="text-[16px] font-bold text-ink-900 dark:text-white">Feladatok</h2>
		<ul class="mt-3 space-y-2.5">
			{#each assigns as a (a.id)}
				<li class="flex items-center gap-3.5 rounded-xl border border-stone-100 p-3.5 dark:border-white/10">
					<div class="min-w-0 flex-1">
						<p class="truncate text-[15px] font-semibold text-ink-900 dark:text-white">{a.title}</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">
							Határidő: {fmtDue(a.due_date)}
							{#if a.best !== null} · legjobb: {a.best}{/if}
						</p>
					</div>
					<a
						href="/tanterem/dolgozat/{a.id}"
						class="shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-brand-600"
					>
						{a.submitted ? 'Újra' : 'Kitöltés'}
					</a>
					{#if isTeacher && room.mine === 1}
						<button
							onclick={() => void revoke(a.id)}
							class="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10"
						>
							Visszavonás
						</button>
					{/if}
				</li>
			{:else}
				<p class="text-sm text-stone-500 dark:text-stone-400">Ehhez az osztályhoz még nincs kiadott feladat.</p>
			{/each}
		</ul>
	</section>

	{#if members.length > 0}
		<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
			<h2 class="text-[16px] font-bold text-ink-900 dark:text-white">Tagok</h2>
			<ul class="mt-2 flex flex-wrap gap-2">
				{#each members as m (m.name)}
					<li class="rounded-full bg-stone-100 px-3 py-1 text-[13px] font-semibold text-ink-600 dark:bg-white/10 dark:text-stone-300">
						{m.name}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}
