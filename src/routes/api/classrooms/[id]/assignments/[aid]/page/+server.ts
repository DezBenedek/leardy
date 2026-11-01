import type { RequestHandler } from '@sveltejs/kit';
import { loadClassroomAssignmentPage } from '$lib/server/classroom/classroom-assignment-page';
import { classroomPageResponse } from '$lib/server/classroom/classroom-page-response';

export const GET: RequestHandler = (event) => classroomPageResponse(event, loadClassroomAssignmentPage);
