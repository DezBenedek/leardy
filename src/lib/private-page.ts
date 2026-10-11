import { error, redirect } from '@sveltejs/kit';
import { privateFetch } from './offline-api';

export async function loadPrivatePage<T>(url: string, owner?: string, fallback?: T & { offline: boolean }): Promise<T & { offline: boolean }> {
	try {
		const response = await privateFetch(url, owner);
		const data = await response.json();
		if (response.status === 409 && typeof data.redirect === 'string') redirect(303, data.redirect);
		if (!response.ok) {
			if (response.status === 503 && fallback) return fallback;
			error(response.status, data.error ?? 'Ez a tanterem még nincs elmentve ezen az eszközön. Nyisd meg egyszer internetkapcsolattal.');
		}
		return { ...data, offline: response.headers.get('x-content-offline') === 'true' };
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
		if (fallback) return fallback;
		error(503, 'Ez a tanterem még nincs elmentve ezen az eszközön. Nyisd meg egyszer internetkapcsolattal.');
	}
}
