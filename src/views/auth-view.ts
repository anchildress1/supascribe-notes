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
          input { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; }
          button { width: 100%; padding: 10px; background: #24b47e; color: white; border: none; cursor: pointer; font-size: 16px; margin-top: 10px; }
          .error { color: red; margin: 10px 0; display: none; }
          #consent-section { display: none; }
          #login-section { display: none; }
        </style>
      </head>
      <body>
        <h1>Authorize Access</h1>
        <div id="loading">Loading details...</div>
        <div id="error-msg" class="error"></div>

        <div id="login-section">
          <p>Please sign in to continue.</p>
          <input type="email" id="email" placeholder="Email" />
          <input type="password" id="password" placeholder="Password" />
          <button onclick="signIn()">Sign In</button>
        </div>

        <div id="consent-section">
          <p><strong><span id="client-name">App</span></strong> is requesting access to your account.</p>
          <p>Scopes: <span id="scopes"></span></p>
          <button onclick="approve()">Approve</button>
          <button onclick="deny()" style="background: #666; margin-top: 5px;">Deny</button>
        </div>

        <script>
          const supabaseUrl = '${config.supabaseUrl}';
          // Use a different variable name to avoid shadowing the global 'supabase' from the CDN script
          const supabaseClient = supabase.createClient(supabaseUrl, '${config.supabaseAnonKey}');
          const params = new URLSearchParams(window.location.search);
          const authId = params.get('authorization_id');

          async function init() {
            try {
              if (!authId) {
                showError('Missing authorization_id');
                return;
              }
              
              document.getElementById('loading').style.display = 'block';
              
              // check session
              const { data: { session }, error } = await supabaseClient.auth.getSession();
              
              if (error) {
                console.error('Session error:', error);
                throw error;
              }
              
              if (!session) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('login-section').style.display = 'block';
                return;
              }
              
              loadConsent(session);
            } catch (err) {
              console.error('Init error:', err);
              showError('Failed to initialize: ' + (err.message || String(err)));
              document.getElementById('loading').style.display = 'none';
            }
          }

          async function loadConsent(session) {
              document.getElementById('login-section').style.display = 'none';
              document.getElementById('loading').style.display = 'block';
              
              // Display generic consent prompt since we can't easily fetch specific scope details client-side without admin privileges.
              
              document.getElementById('loading').style.display = 'none';
              document.getElementById('consent-section').style.display = 'block';
              document.getElementById('client-name').innerText = 'External Application'; // Placeholder
          }

          async function signIn() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
              const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
              
              if (error) {
                showError(error.message);
              } else {
                loadConsent(data.session);
              }
            } catch (err) {
               showError(err.message || String(err));
            }
          }

          async function approve() {
              try {
               const { data: { session } } = await supabaseClient.auth.getSession();
               if (!session) throw new Error('No active session');
               const token = session.access_token;
               
               const res = await fetch('/api/oauth/approve', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                  body: JSON.stringify({ authorization_id: authId })
               });
               
               const result = await res.json();
               if (result.error) throw new Error(result.error);
               
               if (result.redirect_url) {
                  window.location.href = result.redirect_url;
               }
            } catch (err) {
               showError(err.message);
            }
          }
          
          async function deny() {
              try {
                 const { data: { session } } = await supabaseClient.auth.getSession();
                 if (!session) throw new Error('No active session');
                 const token = session.access_token;
                 
                 const res = await fetch('/api/oauth/deny', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ authorization_id: authId })
                 });
                 
                 const result = await res.json();
                 if (result.error) throw new Error(result.error);
                 
                 if (result.redirect_url) {
                    window.location.href = result.redirect_url;
                 }
              } catch (err) {
                 showError(err.message);
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
