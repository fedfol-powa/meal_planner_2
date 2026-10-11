import type { Env } from './auth.ts';

/**
 * Minimal consent page for the Supabase OAuth server (spike only): password sign-in for the
 * test users, then the client details with approve/deny. The real page is `/authorize`
 * from the sixth prototype round.
 */
export function authorizePage(env: Env): Response {
	const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Autorizza agente (prova)</title>
<style>
	body { font: 16px/1.5 system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }
	input, button { font: inherit; padding: .5rem; margin: .25rem 0; width: 100%; box-sizing: border-box; }
	.row { display: flex; gap: .5rem; } .row button { flex: 1; }
	#error { color: #b00020; }
</style>
</head>
<body>
<h1>Autorizza agente</h1>
<form id="login" hidden>
	<p>Accedi con un utente di prova.</p>
	<input name="email" type="email" placeholder="email" required>
	<input name="password" type="password" placeholder="password" required>
	<button>Accedi</button>
</form>
<section id="consent" hidden>
	<p><strong id="client"></strong> chiede di accedere al tuo account <span id="user"></span>.</p>
	<p>Rimando a: <code id="redirect"></code><br>Scope: <code id="scope"></code></p>
	<div class="row"><button id="approve">Autorizza</button><button id="deny">Rifiuta</button></div>
</section>
<p id="error"></p>
<script type="module">
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
const supabase = createClient(${JSON.stringify(env.SUPABASE_URL)}, ${JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY)});
const id = new URLSearchParams(location.search).get('authorization_id');
const $ = (s) => document.getElementById(s);
const fail = (e) => { $('error').textContent = e?.message ?? String(e); };

async function showConsent() {
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) { $('login').hidden = false; return; }
	$('login').hidden = true;
	const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
	if (error) return fail(error);
	// Already approved earlier: Supabase answers with the redirect directly.
	if (data.redirect_url && !data.client) { location.href = data.redirect_url; return; }
	$('client').textContent = data.client?.name ?? data.client?.client_id ?? 'Un agente';
	$('user').textContent = user.email;
	$('redirect').textContent = data.redirect_uri;
	$('scope').textContent = data.scope || '(nessuno)';
	$('consent').hidden = false;
}

$('login').addEventListener('submit', async (event) => {
	event.preventDefault();
	const form = new FormData(event.target);
	const { error } = await supabase.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
	if (error) return fail(error);
	showConsent().catch(fail);
});
for (const [button, decide] of [['approve', 'approveAuthorization'], ['deny', 'denyAuthorization']]) {
	$(button).addEventListener('click', async () => {
		const { data, error } = await supabase.auth.oauth[decide](id);
		if (error) return fail(error);
		location.href = data.redirect_url;
	});
}
if (!id) fail('Manca authorization_id'); else showConsent().catch(fail);
</script>
</body>
</html>`;
	return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
