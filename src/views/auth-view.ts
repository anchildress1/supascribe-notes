import type { Config } from '../config.js';

export function renderAuthPage(config: Config): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Authorize App</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
        <style>
          body { font-family: -apple-system, sans-serif; max-width: 400px; margin: 40px auto; padding: 20px; text-align: center; }
          button { width: 100%; padding: 10px; background: #24b47e; color: white; border: none; cursor: pointer; font-size: 16px; margin-top: 10px; }
          button:disabled { background: #ccc; cursor: not-allowed; }
          .error { color: red; margin: 10px 0; display: none; }
          #consent-section { display: none; }
        </style>
      </head>
      <body>
        <h1>Authorize Access</h1>
        <div id="loading">Loading details...</div>
        <div id="error-msg" class="error"></div>

        <div id="consent-section">
          <p><strong><span id="client-name">External Application</span></strong> is requesting access to your account.</p>
          <p>Scopes: <span id="scopes">All permissions</span></p>
          <button id="approve-btn" onclick="approve()">Approve</button>
          <button onclick="deny()" style="background: #666; margin-top: 5px;">Deny</button>
        </div>

        <script>
          const supabaseClient = supabase.createClient('${config.supabaseUrl}', '${config.supabaseAnonKey}');
          const params = new URLSearchParams(window.location.search);
          const authId = params.get('authorization_id');

          async function init() {
            try {
              if (!authId) {
                showError('Missing authorization_id');
                return;
              }
              
              // Check if user has a session
              const { data: { session } } = await supabaseClient.auth.getSession();
              
              if (!session) {
                showError('You must be logged in to authorize this application. Please log in to your Supabase account first.');
                document.getElementById('loading').style.display = 'none';
                return;
              }
              
              // Show consent screen
              document.getElementById('loading').style.display = 'none';
              document.getElementById('consent-section').style.display = 'block';
            } catch (err) {
              console.error('Init error:', err);
              showError('Failed to initialize: ' + (err.message || String(err)));
              document.getElementById('loading').style.display = 'none';
            }
          }

          async function approve() {
              const btn = document.getElementById('approve-btn');
              btn.disabled = true;
              btn.innerText = 'Approving...';
              
              try {
               const { data, error } = await supabaseClient.auth.oauth.approveAuthorization(authId);
               
               if (error) {
                  // Provide helpful error messages
                  if (error.message && error.message.includes('authorization not found')) {
                     throw new Error('This authorization request has expired or was already used. Please start a new authorization request from your application.');
                  }
                  throw error;
               }
               
               if (data?.redirect_url) {
                  window.location.href = data.redirect_url;
               }
            } catch (err) {
               btn.disabled = false;
               btn.innerText = 'Approve';
               showError(err.message || String(err));
            }
          }
          
          async function deny() {
              try {
                 const { data, error } = await supabaseClient.auth.oauth.denyAuthorization(authId);
                 
                 if (error) {
                    // Provide helpful error messages
                    if (error.message && error.message.includes('authorization not found')) {
                       throw new Error('This authorization request has expired or was already used. Please start a new authorization request from your application.');
                    }
                    throw error;
                 }
                 
                 if (data?.redirect_url) {
                    window.location.href = data.redirect_url;
                 }
              } catch (err) {
                 showError(err.message || String(err));
              }
          }

          function showError(msg) {
            const el = document.getElementById('error-msg');
            el.innerText = msg;
            el.style.display = 'block';
          }
          
          init();
        </script>
      </body>
    </html>
  `;
}
