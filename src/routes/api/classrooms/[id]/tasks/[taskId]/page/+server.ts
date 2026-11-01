import type { RequestHandler } from '@sveltejs/kit';
import { loadClassroomTaskPage } from '$lib/server/classroom/classroom-task-page';
import { classroomPageResponse } from '$lib/server/classroom/classroom-page-response';

export const GET: RequestHandler = (event) => classroomPageResponse(event, loadClassroomTaskPage);
