export function renderHelpPage(): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Supabase MCP Server</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
            text-align: center;
            line-height: 1.6;
            color: #333;
          }
          h1 {
            font-size: 24px;
            margin-bottom: 20px;
          }
          p {
            margin-bottom: 10px;
          }
          .logo {
            font-size: 48px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="logo">🔌</div>
        <h1>Supabase MCP Server</h1>
        <p>This is a Model Context Protocol (MCP) server for Supabase.</p>
        <p>To use this server, please connect it to an MCP Client (like ChatGPT or Claude Desktop).</p>
      </body>
    </html>
  `;
}
