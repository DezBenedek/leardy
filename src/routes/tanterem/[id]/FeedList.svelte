<script lang="ts">
	import Card from '$lib/ui/Card.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import { CalendarDays, Check, ClipboardList, FileText, Megaphone, Paperclip } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { fmtDate, fmtTime } from './classroom-format';
	import { messageChips, parseTaskLessons, type FeedItem } from './classroom-task-utils';

	let {
		feed,
		isOwner,
		roomId,
		myMap = {},
		assignmentMap = {},
		onOpen
	}: {
		feed: FeedItem[];
		isOwner: boolean;
		roomId: string;
		myMap?: Record<string, { best_pct: number; submitted: boolean }>;
		assignmentMap?: Record<string, { submitted: boolean; grade: number | null }>;
		onOpen: (kind: 'message' | 'task' | 'assignment', id: string) => void;
	} = $props();
</script>

<div data-tutorial="room-feed" class="mt-4 grid min-w-0 gap-2.5 [&>*]:min-w-0">
	{#if feed.length === 0}
		<EmptyState
			title="Még nincs bejegyzés"
			description={isOwner ? 'A Létrehozás gombbal küldhetsz az osztálynak.' : 'A tanárod bejegyzései itt jelennek meg.'}
		/>
	{:else}
		{#each feed as item (item.kind + ':' + (item.kind === 'message' ? item.msg.id : item.kind === 'task' ? item.task.id : item.assignment.id))}
			{#if item.kind === 'assignment'}
				<Card
					href={isOwner ? `/tanterem/${roomId}/beadando/${item.assignment.id}` : undefined}
					onclick={isOwner ? undefined : () => onOpen('assignment', item.assignment.id)}
					ariaLabel={item.assignment.title || 'Beadandó részletei'}
				>
					<div class="flex min-w-0 items-start gap-3 overflow-hidden">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
							<FileText size={20} />
						</span>
						<div class="min-w-0 flex-1 overflow-hidden">
							<p class="truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
								{item.assignment.title || 'Beadandó'}
							</p>
							<p class="mt-0.5 truncate text-[13px] text-stone-500 dark:text-stone-400">
								Beadandó
							</p>
							{#if item.assignment.due_date}
								{@const late = item.assignment.due_date < Date.now()}
								<p class="mt-1 flex min-w-0 items-start gap-1.5 text-[13px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
									<CalendarDays size={14} class="mt-0.5 shrink-0" />
									<span class="min-w-0 flex-1 break-words">{late ? 'Lejárt: ' : 'Határidő: '}{fmtDate(item.assignment.due_date)}</span>
								</p>
							{/if}
						</div>
						{#if !isOwner}
							{@const st = assignmentMap[item.assignment.id]}
							{#if st?.grade !== null && st?.grade !== undefined}
								<span
									class="grid size-7 shrink-0 place-items-center self-start rounded-full bg-brand-500 text-[15px] font-extrabold text-white"
									title="Érdemjegy: {st.grade}"
									role="img"
									aria-label="Érdemjegy: {st.grade}"
								>
									{st.grade}
								</span>
							{:else if st?.submitted}
								<span
									class="grid size-6 shrink-0 place-items-center self-start rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
									title="Beküldve"
									role="img"
									aria-label="Beküldve"
								>
									<Check size={15} strokeWidth={3} />
								</span>
							{/if}
						{/if}
					</div>
				</Card>
			{:else if item.kind === 'task'}
				{@const lessons = parseTaskLessons(item.task)}
				<Card
					href={isOwner ? `/tanterem/${roomId}/feladat/${item.task.id}` : undefined}
					onclick={isOwner ? undefined : () => onOpen('task', item.task.id)}
					ariaLabel={item.task.title || 'Feladat részletei'}
				>
					<div class="flex min-w-0 items-start gap-3 overflow-hidden">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
							<ClipboardList size={20} />
						</span>
						<div class="min-w-0 flex-1 overflow-hidden">
							<p class="truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
								{item.task.title || 'Kvízfeladat'}
							</p>
							<p class="mt-0.5 truncate text-[13px] text-stone-500 dark:text-stone-400">
								{lessons.length} lecke · {item.task.question_count} kérdés · cél: {item.task.target_pct}%
							</p>
							{#if item.task.due_date}
								{@const late = item.task.due_date < Date.now()}
								<p class="mt-1 flex min-w-0 items-start gap-1.5 text-[13px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
									<CalendarDays size={14} class="mt-0.5 shrink-0" />
									<span class="min-w-0 flex-1 break-words">{late ? 'Lejárt: ' : 'Határidő: '}{fmtDate(item.task.due_date)}</span>
								</p>
							{/if}
						</div>
						{#if !isOwner && myMap[item.task.id]?.submitted}
							<span
								class="grid size-6 shrink-0 place-items-center self-start rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
								title="Beküldve"
								role="img"
								aria-label="Beküldve"
							>
								<Check size={15} strokeWidth={3} />
							</span>
						{/if}
					</div>
				</Card>
			{:else}
				{@const chips = messageChips(item.msg)}
				<Card onclick={() => onOpen('message', item.msg.id)} ariaLabel={item.msg.title}>
					<div class="flex min-w-0 items-start gap-3 overflow-hidden">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
							<Megaphone size={20} />
						</span>
						<div class="min-w-0 flex-1 overflow-hidden">
							<p class="truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{item.msg.title}</p>
							{#if item.msg.body}
								<p class="mt-0.5 line-clamp-2 text-sm leading-relaxed break-words text-stone-600 dark:text-stone-300">{item.msg.body}</p>
							{/if}
							<p class="mt-1.5 flex min-w-0 items-center gap-1 text-[12px] text-stone-400 dark:text-stone-500">
								<span class="min-w-0 flex-1 truncate">{item.msg.teacher_name ?? ''} · {fmtTime(item.msg.created_at)}</span>
								{#if chips.length > 0}
									<span class="inline-flex shrink-0 items-center gap-1 font-bold">
										<Paperclip size={12} /> {chips.length}
									</span>
								{/if}
							</p>
						</div>
					</div>
				</Card>
			{/if}
		{/each}
	{/if}
</div>
