export type LiveAction = '' | '/join' | '/start' | '/next' | '/answer' | '/finish' | '/publish';

export function liveUrl(liveId: string, action: LiveAction = ''): string {
	return `/api/live/${encodeURIComponent(liveId)}${action}`;
}

export async function readJson(res: Response): Promise<Record<string, unknown>> {
	return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export function socketUrl(host: string, protocol: string, liveId: string, userId: string, userName: string, teacher: boolean): string {
	const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
	return `${wsProtocol}//${host}/api/live/socket/${encodeURIComponent(liveId)}?userId=${encodeURIComponent(userId)}&name=${encodeURIComponent(userName)}&role=${teacher ? 'teacher' : 'student'}`;
}
