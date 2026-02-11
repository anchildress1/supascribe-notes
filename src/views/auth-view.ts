import type { Config } from '../config.js';

export function renderAuthPage(config: Config): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Authorize App</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
        <script>
            // Global error handler
            window.onerror = function(msg, url, line, col, error) {
                const logDiv = document.getElementById('debug-logs');
                if (logDiv) {
                    logDiv.innerHTML += '<div style="color:red">Error: ' + msg + ' (' + url + ':' + line + ')</div>';
                    logDiv.classList.remove('hidden');
                }
                return false;
            };
        </script>
        <style>
          body { font-family: -apple-system, sans-serif; max-width: 400px; margin: 40px auto; padding: 20px; text-align: center; color: #333; }
          .card { padding: 24px; border: 1px solid #eaeaea; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
          button { width: 100%; padding: 12px; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; margin-top: 10px; font-weight: 500; transition: background 0.2s; }
          .btn-primary { background: #24b47e; color: white; }
          .btn-primary:hover { background: #1fa06f; }
          .btn-secondary { background: #666; color: white; }
          .btn-secondary:hover { background: #555; }
          .btn-outline { background: white; border: 1px solid #ccc; color: #333; }
          .btn-outline:hover { background: #f5f5f5; }
          .error { color: #e53e3e; background: #fff5f5; padding: 12px; border-radius: 4px; margin: 10px 0; font-size: 14px; text-align: left; }
          .hidden { display: none; }
          .scope-item { background: #f7fafc; padding: 8px; border-radius: 4px; margin: 4px 0; font-size: 14px; text-align: left; }
          h1 { margin-bottom: 24px; font-size: 24px; }
          .provider-btn { display: flex; align-items: center; justify-content: center; gap: 8px; background: white; border: 1px solid #ccc; color: #333; }
          #debug-logs { display: block; margin-top: 20px; padding: 10px; background: #fffbe6; border: 2px solid #d4b106; font-family: monospace; font-size: 12px; text-align: left; max-height: 300px; overflow-y: auto; white-space: pre-wrap; color: #333; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Authorize Access</h1>
          
          <div id="status-banner" style="background: #e6fffa; color: #000; padding: 10px; margin-bottom: 20px; display:none;">JavaScript is running</div>
          
          <div id="loading">Loading details...</div>
          <div id="error-msg" class="error hidden"></div>

          <!-- Login Section -->
          <div id="login-section" class="hidden">
            <p style="margin-bottom: 20px;">Please sign in to your Supabase account.</p>
            <button class="provider-btn" onclick="signIn('google')">Sign in with Google</button>
            <button class="provider-btn" onclick="signIn('github')">Sign in with GitHub</button>
          </div>

          <!-- Consent Section -->
          <div id="consent-section" class="hidden">
            <p><strong><span id="client-name">External Application</span></strong> is requesting access to your account.</p>
            
            <div style="text-align: left; margin: 20px 0;">
              <div><strong>Permissions:</strong></div>
              <div id="scopes-list" style="margin-top: 8px;"></div>
            </div>

            <div style="font-size: 13px; color: #666; margin-bottom: 20px;">
              Signed in as: <strong id="user-email"></strong>
              <a href="#" onclick="signOut()" style="color: #666; margin-left: 8px;">(Sign out)</a>
            </div>

            <button id="approve-btn" class="btn-primary" onclick="approve()">Approve</button>
            <button class="btn-secondary" onclick="deny()">Deny</button>
          </div>
        </div>
        
        <div id="debug-logs"><strong>Debug Logs:</strong><br></div>

        <script>
          // IMMEDIATELY SHOW JS STATUS
          document.getElementById('status-banner').style.display = 'block';

          function log(msg) {
              console.log(msg);
              const logDiv = document.getElementById('debug-logs');
              if (logDiv) {
                  logDiv.innerHTML += '<div>' + new Date().toISOString().split('T')[1].slice(0,-1) + ' ' + msg + '</div>';
              }
          }

          window.onerror = function(msg, url, line, col, error) {
              log('Uncaught Error: ' + msg + ' (' + url + ':' + line + ')');
              return false;
          };

          log('Page loaded. Script starting...');
          
          let supabaseClient;
          
          function initSupabase() {
             if (typeof supabase === 'undefined') {
                log('CRITICAL: Supabase SDK not loaded! CDN blocked?');
                document.getElementById('error-msg').textContent = 'Error: Supabase SDK failed to load.';
                document.getElementById('error-msg').classList.remove('hidden');
                return false;
             }
             try {
                supabaseClient = supabase.createClient('${config.supabaseUrl}', '${config.supabaseAnonKey}', {
                  auth: { debug: true }
                });
                log('Supabase client initialized.');
                return true;
            } catch (e) {
                log('Failed to initialize Supabase client: ' + e.message);
                return false;
            }
          }

          if (!initSupabase()) {
             log('Aborting init due to missing Supabase client.');
          }

          const params = new URLSearchParams(window.location.search);
          const authId = params.get('authorization_id');
          log('Auth ID present: ' + (authId ? 'Yes' : 'No'));

          // Timeout helper
          const timeout = (ms, promise) => {
              return new Promise((resolve, reject) => {
                  const timer = setTimeout(() => {
                      reject(new Error('Operation timed out after ' + ms + 'ms'));
                  }, ms);
                  promise
                      .then(value => { clearTimeout(timer); resolve(value); })
                      .catch(reason => { clearTimeout(timer); reject(reason); });
              });
          };

          async function init() {
            try {
              if (!authId) {
                showError('Missing authorization_id parameter');
                document.getElementById('loading').classList.add('hidden');
                return;
              }
              
              log('Getting session...');
              // 5 second timeout for session fetch
              let sessionResult;
              try {
                  sessionResult = await timeout(5000, supabaseClient.auth.getSession());
              } catch (e) {
                  log('Session check timed out or failed: ' + e.message);
                  throw e;
              }
              
              const { data: { session }, error: sessionError } = sessionResult;
              
              if (sessionError) {
                  log('Session error: ' + sessionError.message);
                  throw sessionError;
              }
              
              log('Session check complete. User: ' + (session ? session.user.email : 'None'));

              if (!session) {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('login-section').classList.remove('hidden');
                return;
              }

              // Fetch Authorization Details
              log('Fetching authorization details...');
              let authDetailsResult;
              try {
                   authDetailsResult = await timeout(8000, supabaseClient.auth.oauth.getAuthorizationDetails(authId));
              } catch (e) {
                   log('Auth details fetch timed out or failed: ' + e.message);
                   throw e;
              }

              const { data, error } = authDetailsResult;
              
              if (error) {
                log('getAuthorizationDetails error: ' + error.message + ' (Status: ' + error.status + ')');
                if (error.status === 404) {
                   showError('Authorization request not found. It may have expired or belongs to a different user. Try logging out and signing in with the correct account.');
                } else {
                   showError('Failed to load authorization details: ' + error.message);
                }
                
                const div = document.createElement('div');
                div.innerHTML = '<button class="btn-outline" onclick="signOut()" style="margin-top:10px">Sign out</button>';
                document.getElementById('error-msg').appendChild(div);
                
                document.getElementById('loading').classList.add('hidden');
                return;
              }
              
              log('Auth details loaded: ' + JSON.stringify(data, null, 2));

              // CHECK IF ALREADY AUTHORIZED (Supabase v2 returns redirect_url directly)
              if (data && (data.redirect_url || data.url)) {
                  const targetUrl = data.redirect_url || data.url;
                  log('Authorization already active. Redirecting to: ' + targetUrl);
                  
                  // Update UI to show success
                  document.getElementById('loading').innerHTML = 'Already authorized! Redirecting...<br><br><a href="' + targetUrl + '">Click here if not redirected</a>';
                  document.getElementById('loading').classList.remove('hidden');
                  
                  // Short delay to let user see logs if debugging
                  setTimeout(() => {
                      window.location.href = targetUrl;
                  }, 1500);
                  
                  return;
              }

              // Populate UI
              document.getElementById('client-name').textContent = (data.client && data.client.name) || 'External Application';
              document.getElementById('user-email').textContent = session.user.email;
              
              const scopesList = document.getElementById('scopes-list');
              const scopes = data.scopes || [];
              if (scopes.length === 0) {
                 scopesList.innerHTML = '<div class="scope-item">Access your Supabase account</div>';
              } else {
                 scopesList.innerHTML = scopes.map(s => '<div class="scope-item">' + s + '</div>').join('');
              }

              document.getElementById('loading').classList.add('hidden');
              document.getElementById('consent-section').classList.remove('hidden');

            } catch (err) {
              console.error('Init error:', err);
              log('Init Fatal Error: ' + (err.message || String(err)));
              showError('Unexpected error: ' + (err.message || String(err)));
              document.getElementById('loading').classList.add('hidden');
            }
          }

          async function signIn(provider) {
             log('Signing in with ' + provider);
             const { error } = await supabaseClient.auth.signInWithOAuth({
               provider: provider,
               options: {
                 redirectTo: window.location.href
               }
             });
             if (error) {
                 log('Sign in error: ' + error.message);
                 showError(error.message);
             }
          }

          async function signOut() {
             log('Signing out...');
             await supabaseClient.auth.signOut();
             window.location.reload();
          }

          async function approve() {
               const btn = document.getElementById('approve-btn');
               btn.disabled = true;
               btn.innerText = 'Approving...';
               
               try {
                log('Approving authId: ' + authId);
                const { data, error } = await supabaseClient.auth.oauth.approveAuthorization(authId);
                if (error) {
                  log('Approve failed: ' + error.message);
                  throw error;
                }
                
                log('Approve success. Redirecting...');
                if (data && data.url) {
                   log('Redirecting to: ' + data.url);
                   window.location.href = data.url;
                } else if (data && data.redirect_to) {
                   log('Redirecting to: ' + data.redirect_to);
                   window.location.href = data.redirect_to; 
                } else {
                   log('No redirect URL found in response');
                   console.warn('No redirect URL in response', data);
                   showError('Approved, but no redirect URL provided. Please close this window and try again.');
                }
               } catch (error) {
                  console.error('Approve error object:', error);
                  log('Approve error: ' + error.message);
                  btn.disabled = false;
                  btn.innerText = 'Approve';
                  showError('Error ' + (error.status || '') + ': ' + error.message);
               }
          }

          async function deny() {
              try {
                log('Denying access...');
                const { data, error } = await supabaseClient.auth.oauth.denyAuthorization(authId);
                if (error) throw error;
                 if (data && data.url) {
                   window.location.href = data.url;
                } else if (data && data.redirect_to) {
                   window.location.href = data.redirect_to;
                }
              } catch (error) {
                log('Deny error: ' + error.message);
                showError(error.message);
              }
          }

          function showError(msg) {
            const el = document.getElementById('error-msg');
            el.textContent = msg;
            el.classList.remove('hidden');
          }

          init();
        </script>
      </body>
    </html>
  `;
}
