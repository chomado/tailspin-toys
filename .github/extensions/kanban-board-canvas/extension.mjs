// Extension: kanban-board-canvas
import { createServer } from 'node:http';
import { joinSession, createCanvas } from '@github/copilot-sdk/extension';

const servers = new Map();

const issues = [
    {
        id: 'incident-mobile-login',
        title: 'モバイルログインの不具合',
        description: 'iOS ユーザーが新しいアカウント復旧フロー導入後にサインインを完了できなくなっています。',
        reasons: [
            { label: 'シグナル', text: 'サポート問い合わせが直近 24 時間で倍増し、最初のログイン試行でエラーが発生しています。' },
            { label: '影響', text: '新規ユーザーのオンボーディングが止まり、トライアル転換にも影響しています。' },
        ],
    },
    {
        id: 'billing-webhook-delays',
        title: '請求 Webhook の遅延',
        description: 'サブスクリプション更新の Webhook が遅れて届き、下流システムでエンタイトルメントが古いままになります。',
        reasons: [
            { label: 'シグナル', text: 'キューの深さが閾値を超え、再試行も急増しています。' },
            { label: '影響', text: '請求状態と製品アクセスにズレが生じます。' },
        ],
    },
    {
        id: 'search-index-staleness',
        title: '検索インデックスの鮮度低下',
        description: '新しいゲーム掲載情報が、次のフル再インデックス完了まで検索結果に反映されません。',
        reasons: [
            { label: 'シグナル', text: 'インデックス遅延が 45 分を超え、ヘルプデスクの苦情も増えています。' },
            { label: '影響', text: '検索での発見性が下がり、新規リリースの収益機会を逃します。' },
        ],
    },
    {
        id: 'analytics-dashboard-latency',
        title: '分析ダッシュボードの遅延',
        description: 'ピーク時に運用ダッシュボードの描画に 15 秒以上かかるようになっています。',
        reasons: [
            { label: 'シグナル', text: '監視では直近のリリース後にクエリ時間が長期的に増加しています。' },
            { label: '影響', text: '運用担当がインシデント対応に時間を要し、迅速な判断が難しくなっています。' },
        ],
    },
    {
        id: 'email-template-typos',
        title: 'メールテンプレートの文言不備',
        description: '一部のトランザクションメールで古いサポートリンクや壊れたプレースホルダーが使われています。',
        reasons: [
            { label: 'シグナル', text: 'サポートから onboarding メールの混乱に関する苦情が届いています。' },
            { label: '影響', text: '信頼低下とサポート負荷増加につながりますが、影響は上位 3 件より小さくなっています。' },
        ],
    },
];

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderIssueCard(issue, priority = false) {
    const accent = priority ? 'priority-card' : 'secondary-card';
    const badge = priority ? '優先度高' : '要確認';
    const reasonsHtml = issue.reasons
        .map((reason) => `<li><strong>${escapeHtml(reason.label)}:</strong> ${escapeHtml(reason.text)}</li>`)
        .join('');

    return `
        <article class="issue-card ${accent}">
            <div class="issue-card__header">
                <span class="issue-card__badge">${escapeHtml(badge)}</span>
                <h2>${escapeHtml(issue.title)}</h2>
            </div>
            <p class="issue-card__description">${escapeHtml(issue.description)}</p>
            <div class="issue-card__reasons">
                <h3>この Issue がボードに載っている理由</h3>
                <ul>${reasonsHtml}</ul>
            </div>
            <button class="issue-card__button" data-issue-id="${escapeHtml(issue.id)}">現在のコンテキストに追加</button>
        </article>
    `;
}

function renderHtml(_instanceId) {
    const topIssues = issues.slice(0, 3);
    const followUpIssues = issues.slice(3);
    const topCards = topIssues.map((issue) => renderIssueCard(issue, true)).join('');
    const secondaryCards = followUpIssues.map((issue) => renderIssueCard(issue, false)).join('');

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Issue triage board</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      .shell {
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
      }
      .header h1 { margin: 0; font-size: 1.4rem; }
      .status {
        border: 1px solid #475569;
        border-radius: 999px;
        padding: 8px 12px;
        color: #cbd5e1;
        background: rgba(15, 23, 42, 0.75);
      }
      .section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 20px 0 12px;
        font-size: 1rem;
        font-weight: 700;
      }
      .section-title span {
        color: #94a3b8;
        font-size: 0.9rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .board-grid {
        display: grid;
        gap: 16px;
      }
      .priority-grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      .issue-card {
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 16px;
        background: linear-gradient(180deg, rgba(30,41,59,0.95), rgba(15,23,42,0.95));
        box-shadow: 0 10px 30px rgba(2, 8, 23, 0.2);
      }
      .priority-card { border-color: #f59e0b; box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.25), 0 10px 30px rgba(2, 8, 23, 0.25); }
      .issue-card__header { display: flex; flex-direction: column; gap: 8px; }
      .issue-card__badge {
        display: inline-flex;
        align-self: flex-start;
        border-radius: 999px;
        padding: 4px 10px;
        background: rgba(59, 130, 246, 0.16);
        color: #bfdbfe;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .priority-card .issue-card__badge { background: rgba(245, 158, 11, 0.16); color: #fde68a; }
      .issue-card h2 { margin: 0; font-size: 1.06rem; }
      .issue-card__description { margin: 10px 0 12px; line-height: 1.5; color: #cbd5e1; }
      .issue-card__reasons h3 { margin: 0 0 8px; font-size: 0.9rem; color: #f8fafc; }
      .issue-card__reasons ul { margin: 0; padding-left: 18px; color: #cbd5e1; display: grid; gap: 6px; }
      .issue-card__button {
        margin-top: 14px;
        width: 100%;
        border: 0;
        border-radius: 10px;
        padding: 10px 12px;
        background: #2563eb;
        color: white;
        font-weight: 700;
        cursor: pointer;
      }
      .issue-card__button:hover { background: #1d4ed8; }
      .issue-card__button:disabled { opacity: 0.75; cursor: wait; }
      .secondary-card { background: rgba(15, 23, 42, 0.9); }
      code { color: #fcd34d; }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="header">
        <div>
          <h1>Issue triage board</h1>
          <p>このボードで、まず対応すべき内容を素早く把握できます。</p>
        </div>
        <div id="status" class="status">トリアージ待ち</div>
      </div>

      <div class="section-title">
        <span>今すぐ対応</span>
        <span>上位 3 件</span>
      </div>
      <div class="board-grid priority-grid">${topCards}</div>

      <div class="section-title">
        <span>次の候補</span>
        <span>確認予定</span>
      </div>
      <div class="board-grid">${secondaryCards}</div>
    </div>

    <script>
      const statusEl = document.getElementById('status');
      const buttons = Array.from(document.querySelectorAll('.issue-card__button'));

      buttons.forEach((button) => {
        button.addEventListener('click', async () => {
          const issueId = button.getAttribute('data-issue-id');
          button.disabled = true;
          button.textContent = '追加中…';
          statusEl.textContent = '現在のコンテキストに追加しています…';

          try {
            const response = await fetch('/action?issueId=' + encodeURIComponent(issueId));
            const payload = await response.json();
            if (payload.ok) {
              statusEl.textContent = '“' + payload.title + '” を現在のコンテキストに追加しました。';
            } else {
              statusEl.textContent = 'この Issue を追加できませんでした。';
            }
          } catch (error) {
            statusEl.textContent = 'この Issue を追加できませんでした。';
          } finally {
            button.disabled = false;
            button.textContent = '現在のコンテキストに追加';
          }
        });
      });
    </script>
  </body>
</html>`;
}

async function addIssueToContext(issueId, session, sessionId) {
    const issue = issues.find((item) => item.id === issueId);
    if (!issue) {
        throw new Error(`Unknown issue: ${issueId}`);
    }

    const prompt = `Please keep this issue in the current context for the active session.\n\nIssue: ${issue.title}\nDescription: ${issue.description}\nWhy it matters: ${issue.reasons.map((reason) => `${reason.label}: ${reason.text}`).join(' | ')}`;
    await session.send({ prompt });
    await session.log(`Added issue to context: ${issue.title}`, { level: 'info' });
    return { ok: true, title: issue.title, sessionId };
}

async function startServer(instanceId, session, sessionId) {
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            if (url.pathname === '/action') {
                const issueId = url.searchParams.get('issueId');
                if (!issueId) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: 'Missing issueId' }));
                    return;
                }
                const result = await addIssueToContext(issueId, session, sessionId);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(result));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderHtml(instanceId));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: 'kanban-board-canvas',
            displayName: 'Issue triage board',
            description: 'A lightweight kanban board for quickly triaging the next issues to work on.',
            actions: [
                {
                    name: 'add_issue_to_context',
                    description: 'Add an issue to the current session context.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            issueId: { type: 'string' },
                        },
                        required: ['issueId'],
                    },
                    handler: async (ctx) => {
                        const issueId = typeof ctx.input?.issueId === 'string' ? ctx.input.issueId : '';
                        return addIssueToContext(issueId, session, ctx.sessionId);
                    },
                },
            ],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId, session, ctx.sessionId);
                    servers.set(ctx.instanceId, entry);
                }
                return {
                    title: 'Issue triage board',
                    url: entry.url,
                };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
