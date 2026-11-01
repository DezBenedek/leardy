<script lang="ts">
	import type { LessonNode } from '$lib/curriculum/lesson-content';
	import { renderLessonDoc } from '$lib/curriculum/lesson-render';
	import { renderMarkdown } from '$lib/curriculum/markdown';
	import 'katex/dist/katex.min.css';
	import './lesson-content.css';
	let { doc, md = '' }: { doc?: LessonNode; md?: string } = $props();
</script>

<div class="lesson-prose">{@html doc ? renderLessonDoc(doc) : renderMarkdown(md)}</div>
