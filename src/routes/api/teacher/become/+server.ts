import { json, type RequestHandler } from '@sveltejs/kit';

/* Kivezetve: a szerepkör automatikus az e-mail cím alapján.
   Számos helyi rész (pl. 72000000000) diák, minden más tanár. */
export const POST: RequestHandler = async () => {
	return json(
		{ error: 'A tanári szerepkör automatikus az e-mail címed alapján.' },
		{ status: 410 }
	);
};
