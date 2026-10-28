// Kizárólag a helyi böngészős gesztus- és menüteszt belépési pontja.
import { createRawSnippet, mount, unmount } from 'svelte';
import { Pencil } from '@lucide/svelte';
import Drawer from '../Drawer.svelte';
import Sheet from '../../ui/Sheet.svelte';
import ActionMenu from '../../ui/ActionMenu.svelte';

let fixture: ReturnType<typeof mount> | undefined;
let target: HTMLElement | undefined;
let disposing: Promise<void> = Promise.resolve();
export let closedCount = 0;

async function clear() {
	await disposing;
	if (fixture) { await unmount(fixture); fixture = undefined; }
	target?.remove();
	target = document.createElement('div');
	document.body.append(target);
}

export async function mountOverlay(kind: 'drawer' | 'sheet', locked = false) {
	await clear();
	closedCount = 0;
	const children = createRawSnippet(() => ({ render: () => `<div data-gesture-content><input aria-label="Tesztmező" /><div data-nested-scroll style="height:70px;overflow:auto"><div style="height:180px">Belső görgetés</div></div>${Array.from({ length: 30 }, (_, index) => `<p style="height:44px;margin:0">Listaelem ${index + 1}</p>`).join('')}</div>` }));
	const onClose = () => {
		closedCount++;
		if (fixture) disposing = unmount(fixture);
		fixture = undefined;
	};
	const shared = { open: true, label: 'Gesztusteszt', title: 'Gesztusteszt', children, onClose };
	fixture = kind === 'drawer'
		? mount(Drawer, { target: target!, props: { ...shared, canClose: () => !locked } })
		: mount(Sheet, { target: target!, props: { ...shared, canClose: !locked } });
}

export async function mountMenu(above: boolean, floating: boolean) {
	await clear();
	target!.style.cssText = `position:fixed;right:16px;${above ? 'bottom' : 'top'}:20px`;
	fixture = mount(ActionMenu, { target: target!, props: {
		compact: true, floating, label: 'Menüteszt',
		actions: ['Első', 'Második', 'Harmadik'].map((label) => ({ id: label, label, icon: Pencil, onclick: () => {} }))
	} });
}
