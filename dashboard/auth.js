// dashboard/auth.js
// Página de autenticación — login/signup/magic link.
// GitHub OAuth como opción secundaria.

(function() {
  'use strict';

  function showAuthModal() {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'auth-modal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal__backdrop" data-close></div>
        <div class="modal__panel" style="max-width:420px">
          <div class="modal__header">
            <h2 class="modal__title">🔐 Iniciar sesión</h2>
            <button class="icon-btn icon-btn--ghost" data-close>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal__body" id="auth-modal-body"></div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) modal.hidden = true;
      });
    }
    const body = document.getElementById('auth-modal-body');
    body.innerHTML = `
      <div class="auth-tabs">
        <button class="auth-tab is-active" data-auth-tab="login">Iniciar sesión</button>
        <button class="auth-tab" data-auth-tab="signup">Registrarse</button>
        <button class="auth-tab" data-auth-tab="magic">Magic link</button>
      </div>
      <div id="auth-form-area"></div>
      <div class="auth-divider"><span>o</span></div>
      <button class="btn btn--ghost auth-github-btn" id="auth-github">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        Continuar con GitHub
      </button>
    `;

    // Render form por defecto (login)
    renderAuthForm('login');

    // Tab switching
    modal.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        renderAuthForm(tab.dataset.authTab);
      });
    });

    // GitHub OAuth
    document.getElementById('auth-github').addEventListener('click', async () => {
      if (window.supabaseClient) {
        try {
          await window.supabaseClient.auth.signInWithGitHub();
        } catch (err) {
          window.toast && window.toast('Error GitHub OAuth: ' + err.message, '⚠️');
        }
      } else {
        // Sin Supabase: usar PAT directamente
        const token = prompt('Pega tu GitHub PAT:');
        if (token) {
          localStorage.setItem('agent-brain-pat', token);
          modal.hidden = true;
          window.toast && window.toast('Sesión iniciada con GitHub', '🐙');
          updateAuthUI();
        }
      }
    });

    modal.hidden = false;
  }

  function renderAuthForm(type) {
    const area = document.getElementById('auth-form-area');
    if (!area) return;
    if (type === 'login') {
      area.innerHTML = `
        <div class="field"><label class="field__label">Email</label><input class="field__input" type="email" id="auth-email" placeholder="tu@email.com"></div>
        <div class="field"><label class="field__label">Contraseña</label><input class="field__input" type="password" id="auth-pass" placeholder="••••••••"></div>
        <button class="btn btn--primary" id="auth-login-btn" style="width:100%;justify-content:center">Iniciar sesión</button>
      `;
      document.getElementById('auth-login-btn').addEventListener('click', doLogin);
    } else if (type === 'signup') {
      area.innerHTML = `
        <div class="field"><label class="field__label">Email</label><input class="field__input" type="email" id="auth-email" placeholder="tu@email.com"></div>
        <div class="field"><label class="field__label">Contraseña</label><input class="field__input" type="password" id="auth-pass" placeholder="mín 8 caracteres"></div>
        <button class="btn btn--primary" id="auth-signup-btn" style="width:100%;justify-content:center">Registrarse</button>
      `;
      document.getElementById('auth-signup-btn').addEventListener('click', doSignup);
    } else if (type === 'magic') {
      area.innerHTML = `
        <div class="field"><label class="field__label">Email</label><input class="field__input" type="email" id="auth-email" placeholder="tu@email.com"></div>
        <p style="color:var(--text-muted);font-size:12px;margin:0 0 var(--s-3)">Te enviaremos un enlace mágico para iniciar sesión sin contraseña.</p>
        <button class="btn btn--primary" id="auth-magic-btn" style="width:100%;justify-content:center">Enviar magic link</button>
      `;
      document.getElementById('auth-magic-btn').addEventListener('click', doMagicLink);
    }
  }

  async function doLogin() {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    if (!email || !pass) { window.toast && window.toast('Faltan credenciales', '⚠️'); return; }
    if (window.supabaseClient) {
      try {
        await window.supabaseClient.auth.signInWithEmail(email, pass);
        document.getElementById('auth-modal').hidden = true;
        window.toast && window.toast('Sesión iniciada', '✓');
        updateAuthUI();
      } catch (err) { window.toast && window.toast('Error: ' + err.message, '⚠️'); }
    } else {
      // Sin Supabase: guardar email como sesión local
      localStorage.setItem('user-email', email);
      localStorage.setItem('user-authenticated', 'true');
      document.getElementById('auth-modal').hidden = true;
      window.toast && window.toast('Sesión local iniciada', '✓');
      updateAuthUI();
    }
  }

  async function doSignup() {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    if (!email || !pass || pass.length < 8) { window.toast && window.toast('Email válido y contraseña de 8+ caracteres', '⚠️'); return; }
    if (window.supabaseClient) {
      try {
        await window.supabaseClient.auth.signUp(email, pass);
        window.toast && window.toast('Cuenta creada. Revisa tu email para confirmar.', '📧');
      } catch (err) { window.toast && window.toast('Error: ' + err.message, '⚠️'); }
    } else {
      localStorage.setItem('user-email', email);
      localStorage.setItem('user-authenticated', 'true');
      document.getElementById('auth-modal').hidden = true;
      window.toast && window.toast('Cuenta local creada', '✓');
      updateAuthUI();
    }
  }

  async function doMagicLink() {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) { window.toast && window.toast('Email requerido', '⚠️'); return; }
    if (window.supabaseClient) {
      try {
        await window.supabaseClient.auth.signInWithMagicLink(email);
        window.toast && window.toast('Magic link enviado a ' + email, '📧');
        document.getElementById('auth-modal').hidden = true;
      } catch (err) { window.toast && window.toast('Error: ' + err.message, '⚠️'); }
    } else {
      window.toast && window.toast('Magic link requiere Supabase. Configúralo en Settings.', '⚠️');
    }
  }

  function isAuthenticated() {
    return localStorage.getItem('user-authenticated') === 'true';
  }

  function updateAuthUI() {
    const authed = isAuthenticated();
    const email = localStorage.getItem('user-email') || '';
    // Actualizar botón en el topbar
    const installBtn = document.getElementById('install-btn');
    if (authed && installBtn) {
      installBtn.innerHTML = `<span>${email.split('@')[0]}</span>`;
      installBtn.title = 'Sesión: ' + email + ' — click para cerrar';
      installBtn.onclick = () => {
        localStorage.removeItem('user-authenticated');
        localStorage.removeItem('user-email');
        window.toast && window.toast('Sesión cerrada', '👋');
        updateAuthUI();
      };
    }
  }

  window.showAuthModal = showAuthModal;
  window.isAuthenticated = isAuthenticated;
  window.updateAuthUI = updateAuthUI;
})();
