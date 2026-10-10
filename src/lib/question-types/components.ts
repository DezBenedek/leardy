import type { Component } from 'svelte';
import { Check, ListChecks, ListOrdered, Pencil, Shapes } from '@lucide/svelte';
import ChoiceGame from './choice/Game.svelte';
import ChoiceEditor from './choice/Editor.svelte';
import TrueFalseGame from './true-false/Game.svelte';
import TrueFalseEditor from './true-false/Editor.svelte';
import TextGame from './text/Game.svelte';
import TextEditor from './text/Editor.svelte';
import MatchGame from './match/Game.svelte';
import MatchEditor from './match/Editor.svelte';
import OrderGame from './order/Game.svelte';
import OrderEditor from './order/Editor.svelte';
import type { GameProps } from '../games/types';
import type { QuestionEditorProps, QuestionTypeId } from './types';

const components: Record<QuestionTypeId, { Game: Component<GameProps>; Editor: Component<QuestionEditorProps>; icon: typeof ListChecks }> = {
	choice: { Game: ChoiceGame, Editor: ChoiceEditor, icon: ListChecks },
	tf: { Game: TrueFalseGame, Editor: TrueFalseEditor, icon: Check },
	text: { Game: TextGame, Editor: TextEditor, icon: Pencil },
	match: { Game: MatchGame, Editor: MatchEditor, icon: Shapes },
	order: { Game: OrderGame, Editor: OrderEditor, icon: ListOrdered }
};

export function typeComponents(type: string) {
	return components[type as QuestionTypeId] ?? components.choice;
}

export function gameFor(type: string) { return typeComponents(type).Game; }
export function editorFor(type: string) { return typeComponents(type).Editor; }
