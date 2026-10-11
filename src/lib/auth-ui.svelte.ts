export type AuthMode = 'login';

/** Az auth-drawer globális kapcsolója, bárhonnan nyitható.
 *  Csak Google belépés van, ezért nincs több mód. */
class AuthUIStore {
	open = $state(false);
	mode = $state<AuthMode>('login');

	show(_mode: AuthMode = 'login') {
		this.mode = 'login';
		this.open = true;
	}

	hide() {
		this.open = false;
	}
}

export const authUI = new AuthUIStore();
