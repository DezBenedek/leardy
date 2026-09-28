import { json, type RequestHandler } from '@sveltejs/kit';

/* A regi, jovahagyas nelkuli jelszo-atiras megszunt biztonsagi okbol.
 * Uj folyamat: POST /api/auth/reset-password/request, majd
 * POST /api/auth/reset-password/confirm (15 perces, egyszer hasznalhato kod). */
export const POST: RequestHandler = async () => {
	return json(
		{ error: 'Ez a helyreállítási mód megszűnt. Kérj új kódot az Elfelejtettem a jelszavam képernyőn.' },
		{ status: 410 }
	);
};
