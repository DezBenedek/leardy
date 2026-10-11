import { isRedirect, json, type RequestEvent } from '@sveltejs/kit';

export async function classroomPageResponse(event: RequestEvent, load: (event: RequestEvent) => Promise<unknown>): Promise<Response> {
	try {
		const data = await load(event);
		return json(data, { headers: { 'cache-control': 'private, no-store' } });
	} catch (cause) {
		if (isRedirect(cause)) return json({ redirect: cause.location }, { status: 409, headers: { 'cache-control': 'private, no-store' } });
		throw cause;
	}
}
