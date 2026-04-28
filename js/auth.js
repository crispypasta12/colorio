(function () {
  const SUPABASE_URL = 'https://qgrkevhppwbgttthhyhn.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncmtldmhwcHdiZ3R0dGhoeWhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNTU3MjUsImV4cCI6MjA5MjgzMTcyNX0.YJkV6opIpfSCZArrrDvjiCKcQ5lleXshvxtTHut0ESo';

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const gate      = document.getElementById('auth-gate');
  const form      = document.getElementById('auth-form');
  const errorEl   = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit');

  function hideGate() {
    gate.classList.add('auth-fade-out');
    setTimeout(() => gate.remove(), 350);
  }

  // Reads from localStorage — resolves immediately on return visits
  client.auth.getSession().then(({ data: { session } }) => {
    if (session) hideGate();
  });

  // Handles sign-in success, token refresh, and sign-out
  client.auth.onAuthStateChange((event, session) => {
    if (session) {
      hideGate();
    } else if (event === 'SIGNED_OUT') {
      location.reload();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Signing in…';
    errorEl.textContent   = '';

    const { error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
      errorEl.textContent   = error.message;
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Sign In';
    }
  });

  // Call this from anywhere in the app to sign the user out
  window.authSignOut = () => client.auth.signOut();

  // Remove the Color.io about dialog when it appears in the DOM
  const brandingObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && node.textContent.includes('Jonathan Ochmann')) {
          node.remove();
        }
      }
    }
  });
  brandingObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
