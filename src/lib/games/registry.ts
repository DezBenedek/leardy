import type { Component } from 'svelte';
import ChoiceGame from './ChoiceGame.svelte';
import MatchGame from './MatchGame.svelte';
import OrderGame from './OrderGame.svelte';
import TrueFalseGame from './TrueFalseGame.svelte';
import TypeGame from './TypeGame.svelte';
import type { GameProps } from './types';

/** Kérdéstípus → játékkomponens. Új típus = új fájl + egy sor ide. */
export const GAMES: Record<string, Component<GameProps>> = {
	choice: ChoiceGame,
	text: TypeGame,
	match: MatchGame,
	order: OrderGame,
	tf: TrueFalseGame
};

export function gameFor(type: string): Component<GameProps> {
	return GAMES[type] ?? ChoiceGame;
}
