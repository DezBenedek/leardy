import type { RequestHandler } from '@sveltejs/kit';
import { loadClassroomPage } from '$lib/server/classroom-page';
import { classroomPageResponse } from '$lib/server/classroom-page-response';

export const GET: RequestHandler = (event) => classroomPageResponse(event, loadClassroomPage);
