<script lang="ts">
	import type { QuestionEditorProps } from '../types';
	import { fieldClass, labelClass } from '../editor-styles';
	import '../editor.css';
	let { draft = $bindable(), saving, onChange }: QuestionEditorProps = $props();
	const id = $props.id();
</script>

<div>
	<label for={`${id}-answer`} class="{labelClass} mb-1">Elfogadott válasz</label>
	<input id={`${id}-answer`} class={fieldClass} value={draft.correct_answer} oninput={(event) => { draft.correct_answer = event.currentTarget.value; onChange(); }} maxlength={200} placeholder="Válasz" disabled={saving} />
</div>
