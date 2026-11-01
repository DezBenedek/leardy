import { privateFetch } from '$lib/content/offline-api';
import { mutationFetch } from '$lib/platform/mutation-fetch';

export function apiPublishLive(id: string) {
	return mutationFetch(`/api/live/${encodeURIComponent(id)}/publish`, { method: 'POST' });
}

export function apiDeleteLive(id: string) {
	return mutationFetch(`/api/live/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function apiMineMap(roomId: string) {
	return privateFetch(`/api/classrooms/${roomId}/submissions/mine`);
}

export function apiTaskSubmissions(roomId: string, taskId: string) {
	return privateFetch(`/api/classrooms/${roomId}/tasks/${taskId}/submissions`);
}

export function apiPostTaskSubmission(roomId: string, taskId: string, body: unknown) {
	return mutationFetch(`/api/classrooms/${roomId}/tasks/${taskId}/submissions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiDeleteMessage(roomId: string, id: string) {
	return mutationFetch(`/api/classrooms/${roomId}/messages/${id}`, { method: 'DELETE' });
}

export function apiPatchMessage(roomId: string, id: string, body: unknown) {
	return mutationFetch(`/api/classrooms/${roomId}/messages/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiPatchTask(roomId: string, id: string, body: unknown) {
	return mutationFetch(`/api/classrooms/${roomId}/tasks/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiTaskQuiz(roomId: string, taskId: string) {
	return privateFetch(`/api/classrooms/${roomId}/tasks/${taskId}/quiz`);
}

export function apiLoadLive(roomId: string) {
	return privateFetch(`/api/classrooms/${roomId}/live`);
}

export function apiLeave(roomId: string) {
	return mutationFetch(`/api/classrooms/${roomId}/leave`, { method: 'DELETE' });
}

export function apiCreateMessage(roomId: string, body: unknown) {
	return mutationFetch(`/api/classrooms/${roomId}/messages`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiContent(roomId: string) {
	return privateFetch(`/api/classrooms/${roomId}/content`);
}

export function apiCreateTask(roomId: string, body: unknown) {
	return mutationFetch(`/api/classrooms/${roomId}/tasks`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiCreateAssignment(roomId: string, body: unknown) {
	return mutationFetch(`/api/classrooms/${roomId}/assignments`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiPatchAssignment(roomId: string, id: string, body: unknown) {
	return mutationFetch(`/api/classrooms/${roomId}/assignments/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiDeleteAssignment(roomId: string, id: string) {
	return mutationFetch(`/api/classrooms/${roomId}/assignments/${id}`, { method: 'DELETE' });
}

export function apiAssignmentSubmissions(roomId: string, aid: string) {
	return privateFetch(`/api/classrooms/${roomId}/assignments/${aid}/submissions`);
}

export function apiUploadAssignment(roomId: string, aid: string, form: FormData) {
	return mutationFetch(`/api/classrooms/${roomId}/assignments/${aid}/uploads`, {
		method: 'POST',
		body: form
	});
}

export function apiDeleteUpload(roomId: string, aid: string, uploadId: string) {
	return mutationFetch(`/api/classrooms/${roomId}/assignments/${aid}/uploads/${uploadId}`, {
		method: 'DELETE'
	});
}

export function apiPostAssignmentSubmission(roomId: string, aid: string, body: unknown) {
	return mutationFetch(`/api/classrooms/${roomId}/assignments/${aid}/submissions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiPatchClassroom(roomId: string, body: unknown) {
	return mutationFetch(`/api/classrooms/${roomId}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiRegenCode(roomId: string) {
	return mutationFetch(`/api/classrooms/${roomId}/code`, { method: 'POST' });
}

export function apiKick(roomId: string, memberId: string) {
	return mutationFetch(`/api/classrooms/${roomId}/members/${memberId}`, { method: 'DELETE' });
}

export function apiDeleteClassroom(roomId: string) {
	return mutationFetch(`/api/classrooms/${roomId}`, { method: 'DELETE' });
}

export async function apiBrowse() {
	return fetch('/api/browse');
}

export async function apiLibrary() {
	return fetch('/api/library');
}
