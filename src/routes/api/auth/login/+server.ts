import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async () => {
	return json(
		{ error: 'Csak Google belépés.' },
		{ status: 410 }
	);
};
