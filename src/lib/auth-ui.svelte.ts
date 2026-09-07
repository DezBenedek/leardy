export type AuthMode = 'login' | 'register';

/** Az auth-drawer globális kapcsolója — bárhonnan nyitható. */
class AuthUIStore {
	open = $state(false);
	mode = $state<AuthMode>('login');

	show(mode: AuthMode = 'login') {
		this.mode = mode;
		this.open = true;
	}

	hide() {
		this.open = false;
	}
}

export const authUI = new AuthUIStore();
