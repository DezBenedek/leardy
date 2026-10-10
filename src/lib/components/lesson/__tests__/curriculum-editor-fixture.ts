// Kizárólag a helyi böngészős teszt Vite által fordított belépési pontja.
import { mount, unmount } from 'svelte';
import CurriculumEditor from '../../../../routes/tanulas/szerkeszto/+page.svelte';
import type { PageData } from '../../../../routes/tanulas/szerkeszto/$types';

let fixture: ReturnType<typeof mount> | undefined;
let target: HTMLElement | undefined;

export async function mountCurriculum(data: PageData) {
	if (fixture) await unmount(fixture);
	target?.remove();
	target = document.createElement('main');
	target.style.cssText = 'max-width:900px;margin:auto;min-width:0';
	document.body.append(target);
	fixture = mount(CurriculumEditor, { target, props: { data } });
}
