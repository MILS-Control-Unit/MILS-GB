/**
 * AI Assistant Widget
 * -------------------
 * Drop this <script> into your main HTML page (after your other scripts):
 *   <script src="assistant-widget.js"></script>
 *
 * Talks to your own backend at BACKEND_URL — update this once you deploy
 * server.js somewhere (e.g. http://localhost:3001/api/assistant while
 * developing, or your deployed URL in production).
 */
(function () {
  const BACKEND_URL = 'https://mils-ai-proxy.mils-e75.workers.dev';

  const history = [];

  // ---- Styles ----
  const css = `
    #ai-assist-toggle{
      position:fixed; bottom:24px; right:24px; width:56px; height:56px; border-radius:50%;
      background:#2563eb; color:#fff; border:none; box-shadow:0 4px 14px rgba(0,0,0,.2);
      font-size:24px; cursor:pointer; z-index:9999; display:flex; align-items:center; justify-content:center;
    }
    #ai-assist-panel{
      position:fixed; bottom:90px; right:24px; width:340px; max-height:480px; background:#fff;
      border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.2); display:none; flex-direction:column;
      z-index:9999; overflow:hidden; font-family:system-ui,-apple-system,sans-serif;
    }
    #ai-assist-panel.open{ display:flex; }
    #ai-assist-header{
      background:#2563eb; color:#fff; padding:12px 16px; font-weight:700; font-size:14px;
      display:flex; justify-content:space-between; align-items:center;
    }
    #ai-assist-close{ background:none; border:none; color:#fff; font-size:18px; cursor:pointer; }
    #ai-assist-messages{ flex:1; overflow-y:auto; padding:12px; font-size:13px; color:#1f2937; }
    .ai-msg{ margin-bottom:10px; line-height:1.4; }
    .ai-msg.user{ text-align:right; }
    .ai-msg.user .bubble{ background:#2563eb; color:#fff; }
    .ai-msg .bubble{ display:inline-block; padding:8px 12px; border-radius:10px; background:#f1f3f5; max-width:85%; text-align:left; }
    #ai-assist-inputrow{ display:flex; border-top:1px solid #e5e7eb; }
    #ai-assist-input{ flex:1; border:none; padding:10px 12px; font-size:13px; outline:none; }
    #ai-assist-send{ border:none; background:#2563eb; color:#fff; padding:0 16px; cursor:pointer; font-weight:600; }
    .ai-msg.typing .bubble{ font-style:italic; color:#6b7280; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---- Markup ----
  const toggle = document.createElement('button');
  toggle.id = 'ai-assist-toggle';
  toggle.title = 'Ask the Assistant';
  toggle.textContent = '💬';

  const panel = document.createElement('div');
  panel.id = 'ai-assist-panel';
  panel.innerHTML = `
    <div id="ai-assist-header">
      <span>App Assistant</span>
      <button id="ai-assist-close">✕</button>
    </div>
    <div id="ai-assist-messages"></div>
    <div id="ai-assist-inputrow">
      <input id="ai-assist-input" type="text" placeholder="Ask how to do something..." />
      <button id="ai-assist-send">Send</button>
    </div>
  `;

  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('#ai-assist-messages');
  const inputEl = panel.querySelector('#ai-assist-input');
  const sendBtn = panel.querySelector('#ai-assist-send');
  const closeBtn = panel.querySelector('#ai-assist-close');

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;
    div.innerHTML = `<span class="bubble"></span>`;
    div.querySelector('.bubble').textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && !messagesEl.children.length) {
      addMessage('assistant', "Hi! Ask me anything about using this app — Grade Book, Attendance, Statistics, and more.");
    }
  });
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    addMessage('user', text);
    const typingEl = addMessage('assistant typing', 'Thinking...');

    try {
      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history })
      });
      const data = await res.json();
      typingEl.remove();

      if (!res.ok) {
        addMessage('assistant', data.error || 'Something went wrong. Please try again.');
        return;
      }

      addMessage('assistant', data.reply);
      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: data.reply });

    } catch (err) {
      typingEl.remove();
      addMessage('assistant', 'Could not reach the assistant service. Check your connection or try again later.');
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
})();
