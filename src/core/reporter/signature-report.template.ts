/**
 * Signature Mismatch Report Template
 * 
 * Generates interactive HTML reports for function signature mismatches.
 */

interface SignatureMismatchData {
  id: string;
  type: 'function-name' | 'parameter-name' | 'parameter-count' | 'type-field' | 'missing-field';
  expected: string;
  found: string;
  similarity?: number;
  definedIn: { file: string; line: number };
  usedIn: { file: string; line: number; column?: number };
  quickFixCommand?: string;
}

interface ReportData {
  projectName: string;
  timestamp: string;
  summary: {
    total: number;
    functionNames: number;
    parameterNames: number;
    parameterCounts: number;
    typeFields: number;
  };
  mismatches: SignatureMismatchData[];
}

export function generateSignatureReportHTML(data: ReportData): string {
  const { projectName, timestamp, summary, mismatches } = data;

  const getMismatchIcon = (type: string): string => {
    switch (type) {
      case 'function-name': return '&#x1F534;'; // Red circle
      case 'parameter-name': return '&#x1F7E0;'; // Orange circle
      case 'parameter-count': return '&#x1F7E1;'; // Yellow circle  
      case 'type-field': return '&#x1F535;'; // Blue circle
      case 'missing-field': return '&#x26AA;'; // White circle
      default: return '&#x2B55;'; // Hollow circle
    }
  };

  const getMismatchLabel = (type: string): string => {
    switch (type) {
      case 'function-name': return 'Function Name';
      case 'parameter-name': return 'Parameter Name';
      case 'parameter-count': return 'Parameter Count';
      case 'type-field': return 'Type Field';
      case 'missing-field': return 'Missing Field';
      default: return 'Unknown';
    }
  };

  const formatSimilarity = (similarity?: number): string => {
    if (similarity === undefined) return '';
    return `(${Math.round(similarity * 100)}% similar)`;
  };

  const mismatchRows = mismatches.map(m => `
    <tr class="mismatch-row" data-type="${m.type}">
      <td class="icon-cell">${getMismatchIcon(m.type)}</td>
      <td>
        <span class="badge badge-${m.type}">${getMismatchLabel(m.type)}</span>
      </td>
      <td>
        <div class="file-location">
          <span class="file-path">${m.definedIn.file}</span>
          <span class="line-number">:${m.definedIn.line}</span>
        </div>
        <code class="expected-name">${m.expected}</code>
      </td>
      <td>
        <div class="file-location">
          <span class="file-path">${m.usedIn.file}</span>
          <span class="line-number">:${m.usedIn.line}</span>
        </div>
        <code class="found-name">${m.found}</code>
        <span class="similarity">${formatSimilarity(m.similarity)}</span>
      </td>
      <td class="action-cell">
        <button class="copy-btn" onclick="copyCommand('${m.id}')" title="Copy fix command">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <input type="text" class="command-input" id="cmd-${m.id}" value="${m.quickFixCommand || `npx camouf fix --id ${m.id}`}" readonly>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signature Mismatches Report - ${projectName}</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --border-color: #30363d;
      --text-primary: #c9d1d9;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent-red: #f85149;
      --accent-orange: #db6d28;
      --accent-yellow: #e3b341;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-purple: #a371f7;
      --font-mono: 'Fira Code', 'JetBrains Mono', 'SF Mono', Consolas, monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    /* Header */
    header {
      background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: white;
    }

    .timestamp {
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    /* Summary Cards */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .summary-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1.25rem;
      text-align: center;
      transition: transform 0.2s, border-color 0.2s;
    }

    .summary-card:hover {
      transform: translateY(-2px);
      border-color: var(--accent-blue);
    }

    .summary-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--accent-blue);
    }

    .summary-card.error .summary-value { color: var(--accent-red); }
    .summary-card.warning .summary-value { color: var(--accent-orange); }
    .summary-card.info .summary-value { color: var(--accent-yellow); }

    .summary-label {
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin-top: 0.25rem;
    }

    /* Filters */
    .filters {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .filter-btn {
      padding: 0.5rem 1rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      cursor: pointer;
      transition: all 0.2s;
      font-size: 0.875rem;
    }

    .filter-btn:hover {
      background: var(--bg-tertiary);
      border-color: var(--accent-blue);
    }

    .filter-btn.active {
      background: var(--accent-blue);
      border-color: var(--accent-blue);
      color: white;
    }

    /* Table */
    .table-container {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      background: var(--bg-tertiary);
      padding: 1rem;
      text-align: left;
      font-weight: 600;
      color: var(--text-secondary);
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border-color);
    }

    td {
      padding: 1rem;
      border-bottom: 1px solid var(--border-color);
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover {
      background: var(--bg-tertiary);
    }

    .icon-cell {
      width: 40px;
      font-size: 1.25rem;
      text-align: center;
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .badge-function-name { background: rgba(248, 81, 73, 0.2); color: var(--accent-red); }
    .badge-parameter-name { background: rgba(219, 109, 40, 0.2); color: var(--accent-orange); }
    .badge-parameter-count { background: rgba(227, 179, 65, 0.2); color: var(--accent-yellow); }
    .badge-type-field { background: rgba(88, 166, 255, 0.2); color: var(--accent-blue); }
    .badge-missing-field { background: rgba(139, 148, 158, 0.2); color: var(--text-secondary); }

    /* File paths */
    .file-location {
      display: flex;
      align-items: center;
      gap: 0;
      margin-bottom: 0.25rem;
    }

    .file-path {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .line-number {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: var(--accent-purple);
    }

    code {
      font-family: var(--font-mono);
      font-size: 0.9rem;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }

    .expected-name {
      background: rgba(63, 185, 80, 0.15);
      color: var(--accent-green);
    }

    .found-name {
      background: rgba(248, 81, 73, 0.15);
      color: var(--accent-red);
    }

    .similarity {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-left: 0.5rem;
    }

    /* Action buttons */
    .action-cell {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .copy-btn {
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s;
    }

    .copy-btn:hover {
      background: var(--accent-blue);
      border-color: var(--accent-blue);
      color: white;
    }

    .command-input {
      flex: 1;
      min-width: 200px;
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 0.8rem;
    }

    /* Quick Actions Panel */
    .quick-actions {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 1.5rem;
      margin-top: 2rem;
    }

    .quick-actions h3 {
      font-size: 1rem;
      margin-bottom: 1rem;
      color: var(--text-secondary);
    }

    .command-block {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1rem;
      font-family: var(--font-mono);
      font-size: 0.875rem;
      margin-bottom: 1rem;
      position: relative;
    }

    .command-block .copy-all-btn {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
    }

    .command-block code {
      color: var(--accent-green);
      background: none;
      padding: 0;
    }

    .command-block .comment {
      color: var(--text-muted);
    }

    /* Agent Instructions */
    .agent-instructions {
      background: linear-gradient(135deg, rgba(88, 166, 255, 0.1), rgba(163, 113, 247, 0.1));
      border: 1px solid rgba(88, 166, 255, 0.3);
      border-radius: 12px;
      padding: 1.5rem;
      margin-top: 1.5rem;
    }

    .agent-instructions h3 {
      color: var(--accent-blue);
      margin-bottom: 1rem;
    }

    .agent-instructions p {
      color: var(--text-secondary);
      margin-bottom: 0.75rem;
    }

    .agent-instructions pre {
      background: var(--bg-primary);
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.875rem;
    }

    /* Toast notification */
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: var(--accent-green);
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 500;
      opacity: 0;
      transform: translateY(1rem);
      transition: all 0.3s;
      z-index: 1000;
    }

    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    /* Responsive */
    @media (max-width: 768px) {
      .container { padding: 1rem; }
      .header-content { flex-direction: column; align-items: flex-start; }
      .action-cell { flex-direction: column; }
      .command-input { min-width: auto; width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-content">
        <h1>
          <div class="logo">C</div>
          Signature Mismatches Report
        </h1>
        <div class="timestamp">Generated: ${timestamp}</div>
      </div>
    </header>

    <div class="summary-grid">
      <div class="summary-card error">
        <div class="summary-value">${summary.total}</div>
        <div class="summary-label">Total Mismatches</div>
      </div>
      <div class="summary-card error">
        <div class="summary-value">${summary.functionNames}</div>
        <div class="summary-label">Function Names</div>
      </div>
      <div class="summary-card warning">
        <div class="summary-value">${summary.parameterNames}</div>
        <div class="summary-label">Parameter Names</div>
      </div>
      <div class="summary-card info">
        <div class="summary-value">${summary.typeFields}</div>
        <div class="summary-label">Type Fields</div>
      </div>
    </div>

    <div class="filters">
      <button class="filter-btn active" onclick="filterTable('all')">All</button>
      <button class="filter-btn" onclick="filterTable('function-name')">Function Names</button>
      <button class="filter-btn" onclick="filterTable('parameter-name')">Parameters</button>
      <button class="filter-btn" onclick="filterTable('type-field')">Type Fields</button>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Type</th>
            <th>Expected (Defined In)</th>
            <th>Found (Used In)</th>
            <th>Quick Fix</th>
          </tr>
        </thead>
        <tbody>
          ${mismatchRows}
        </tbody>
      </table>
    </div>

    <div class="quick-actions">
      <h3>Batch Commands</h3>
      <div class="command-block">
        <button class="copy-btn copy-all-btn" onclick="copyAllCommands()">Copy All</button>
        <code># Fix all signature mismatches</code>
        <br><code>npx camouf fix-signatures --all</code>
        <br><br>
        <code># Fix only function name mismatches</code>
        <br><code>npx camouf fix-signatures --type function-name</code>
        <br><br>
        <code># Interactive mode</code>
        <br><code>npx camouf fix-signatures --interactive</code>
      </div>

      <div class="agent-instructions">
        <h3>For AI Agents</h3>
        <p>Copy and paste this instruction to your AI coding agent (Claude, Codex, etc.):</p>
        <pre>Review the following signature mismatches and fix them:

${mismatches.map(m => `- ${m.type}: Change "${m.found}" to "${m.expected}" in ${m.usedIn.file}:${m.usedIn.line}`).join('\n')}

After fixing, run: npx camouf validate --format json --ci</pre>
      </div>
    </div>
  </div>

  <div id="toast" class="toast">Copied to clipboard!</div>

  <script>
    function copyCommand(id) {
      const input = document.getElementById('cmd-' + id);
      navigator.clipboard.writeText(input.value);
      showToast();
    }

    function copyAllCommands() {
      const commands = Array.from(document.querySelectorAll('.command-input'))
        .map(input => input.value)
        .join('\\n');
      navigator.clipboard.writeText(commands);
      showToast();
    }

    function showToast() {
      const toast = document.getElementById('toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function filterTable(type) {
      const rows = document.querySelectorAll('.mismatch-row');
      const buttons = document.querySelectorAll('.filter-btn');
      
      buttons.forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');

      rows.forEach(row => {
        if (type === 'all' || row.dataset.type === type) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;
}

export function buildSignatureReportData(
  projectName: string,
  mismatches: SignatureMismatchData[]
): ReportData {
  const summary = {
    total: mismatches.length,
    functionNames: mismatches.filter(m => m.type === 'function-name').length,
    parameterNames: mismatches.filter(m => m.type === 'parameter-name').length,
    parameterCounts: mismatches.filter(m => m.type === 'parameter-count').length,
    typeFields: mismatches.filter(m => m.type === 'type-field' || m.type === 'missing-field').length,
  };

  return {
    projectName,
    timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
    summary,
    mismatches,
  };
}
