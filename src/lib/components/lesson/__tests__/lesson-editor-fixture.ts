// Kizárólag a helyi böngészős teszt Vite által fordított belépési pontja.
import { mount, unmount } from 'svelte';
import LessonEditor from '../../LessonEditor.svelte';
import { auth } from '$lib/auth.svelte';
import type { EditorLesson } from '$lib/curriculum-editor';

let fixture: ReturnType<typeof mount> | undefined;
let target: HTMLElement | undefined;

export async function mountLesson(lesson: EditorLesson) {
	if (fixture) await unmount(fixture);
	target?.remove();
	target = document.createElement('main');
	target.style.cssText = 'max-width:900px;margin:auto;min-width:0';
	document.body.append(target);
	auth.seed({ id: 'lesson-test-user', name: 'Tesztelő', email: 'test@example.invalid', role: 'teacher' });
	fixture = mount(LessonEditor, { target, props: { lesson } });
}
