<script lang="ts">
	import type { LessonNode } from '$lib/lesson-content';
	import { renderLessonDoc } from '$lib/lesson-render';
	import { renderMarkdown } from '$lib/markdown';
	import 'katex/dist/katex.min.css';
	import './lesson-content.css';
	let { doc, md = '' }: { doc?: LessonNode; md?: string } = $props();
</script>

<div class="lesson-prose">{@html doc ? renderLessonDoc(doc) : renderMarkdown(md)}</div>
