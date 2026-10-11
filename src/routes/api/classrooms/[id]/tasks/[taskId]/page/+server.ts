import type { RequestHandler } from '@sveltejs/kit';
import { loadClassroomTaskPage } from '$lib/server/classroom-task-page';
import { classroomPageResponse } from '$lib/server/classroom-page-response';

export const GET: RequestHandler = (event) => classroomPageResponse(event, loadClassroomTaskPage);
