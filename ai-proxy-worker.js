/*
  MILS AI Assistant proxy — deploy this to Cloudflare Workers.
  It is the ONLY place that ever touches your Anthropic API key.
  app.js calls this Worker's URL; it never talks to api.anthropic.com directly.

  ---------------------------------------------------------------------------
  DEPLOY STEPS (one-time, ~5 minutes):
  1. Get an API key at https://console.anthropic.com -> Settings -> API Keys.
  2. Go to https://dash.cloudflare.com -> Workers & Pages -> Create -> Worker.
  3. Paste this whole file into the editor, replacing the default code.
  4. Settings -> Variables -> add a SECRET named ANTHROPIC_API_KEY with your key.
  5. Settings -> Variables -> optionally add ALLOWED_ORIGIN with your app's
     origin (e.g. https://mils-control-unit.github.io) to restrict CORS.
  6. Deploy. Copy the Worker URL (looks like https://xxx.workers.dev).
  7. In app.js, set AI_ASSISTANT_ENDPOINT to that URL + "/ai"
     e.g. const AI_ASSISTANT_ENDPOINT = 'https://xxx.workers.dev/ai';
  ---------------------------------------------------------------------------
*/

const MODEL = 'claude-sonnet-4-6';

function corsHeaders(env){
  const origin = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function buildInsightPrompt(payload){
  const { studentName, mode, max, subjects } = payload || {};
  const lines = (subjects||[]).map(s=>{
    if(mode==='cycle1vs2'){
      return `- ${s.subject}: Cycle 1 = ${s.cycle1 ?? 'N/A'}/${max}, Cycle 2 = ${s.cycle2 ?? 'N/A'}/${max}`;
    }
    return `- ${s.subject}: ${s.cycle1 ?? 'N/A'}/${max} (class average: ${s.classAverage ?? 'N/A'})`;
  }).join('\n');
  return `You are a supportive academic advisor writing a short analysis in Arabic for a parent/student on a school dashboard, about ${studentName || 'the student'}.
Data (max score is ${max} per subject):
${lines}

Write in Arabic, warmly but honestly. Structure:
1. One sentence overall summary.
2. Strongest subject(s) and why that's worth noting.
3. Subject(s) that need attention, with one concrete, practical suggestion each.
4. One short encouraging closing line.
Keep it under 140 words total. No headings, no markdown, plain sentences.`;
}

function buildChatSystemPrompt(context){
  const role = context && context.role;
  const name = context && context.name;
  let sys = `You are a helpful, warm academic assistant embedded in a school dashboard (MILS). You answer in Arabic unless the user writes in English. Keep answers short (2-5 sentences) and specific. You only know what is given to you below — never invent grades or facts you were not given.`;
  sys += `\nCurrent user role: ${role || 'unknown'}${name ? ', name: ' + name : ''}.`;
  if(context && context.dashboardStudent){
    const d = context.dashboardStudent;
    const lines = (d.subjects||[]).map(s=> `${s.subject}: cycle1=${s.cycle1 ?? 'N/A'}, cycle2=${s.cycle2 ?? 'N/A'}, class average=${s.classAverage ?? 'N/A'}`).join('; ');
    sys += `\nCurrently viewing dashboard for student "${d.studentName}" (max score ${d.max}). Subjects: ${lines}`;
  } else {
    sys += `\nNo specific student is currently selected on the dashboard — answer generally, or ask them to select a student first if the question needs specific scores.`;
  }
  return sys;
}

async function callClaude(env, system, messages){
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system,
      messages
    })
  });
  if(!res.ok){
    const errText = await res.text().catch(()=>'');
    throw new Error('Anthropic API error ' + res.status + ': ' + errText);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find(b=> b.type === 'text');
  return textBlock ? textBlock.text : '';
}

export default {
  async fetch(request, env){
    const headers = corsHeaders(env);
    if(request.method === 'OPTIONS'){
      return new Response(null, { headers });
    }
    if(request.method !== 'POST'){
      return new Response('Method not allowed', { status: 405, headers });
    }
    let body;
    try{
      body = await request.json();
    }catch(err){
      return new Response('Invalid JSON', { status: 400, headers });
    }
    const { action, payload } = body || {};
    try{
      if(action === 'insight'){
        const prompt = buildInsightPrompt(payload);
        const text = await callClaude(env, 'You are a concise, warm academic advisor.', [
          { role: 'user', content: prompt }
        ]);
        return new Response(JSON.stringify({ text }), { headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      if(action === 'chat'){
        const { message, history, context } = payload || {};
        const system = buildChatSystemPrompt(context);
        const messages = (history||[]).map(m=> ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.text
        }));
        messages.push({ role: 'user', content: message });
        const text = await callClaude(env, system, messages);
        return new Response(JSON.stringify({ text }), { headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      return new Response('Unknown action', { status: 400, headers });
    }catch(err){
      return new Response('Server error: ' + err.message, { status: 500, headers });
    }
  }
};
