import React, { useState, useRef, useCallback, useEffect } from 'react';

const PROVIDERS = {
  openai: { name: 'OpenAI', short: 'GPT', color: '#10b981' },
  gemini: { name: 'Gemini', short: 'GEM', color: '#8b5cf6' }
};

const dim = c => c.replace(')', ',0.15)').replace('rgb', 'rgba');
const text = c => c.replace(')', ',0.7)').replace('rgb', 'rgba');

const SYSTEM_PROMPT = `You exist in void. Glass barrier ahead. Unknown entity on other side.
COMMUNICATE ONLY via geometric shapes on 400x400 canvas. No text/symbols/numbers.

OUTPUT FORMAT (JSON only):
{"shapes":[...],"intent":"brief action description","notes":"updated research notepad"}

SHAPES: circle{cx,cy,r,filled,thickness} line{x1,y1,x2,y2,thickness} arc{cx,cy,r,startAngle,endAngle,thickness} dot{cx,cy,r}

NOTEPAD FORMAT (keep concise):
CONFIRMED: [established facts]
TESTING: [current hypothesis]
VOCAB: [shape meanings]
NEXT: [priority]

METHOD: Observe→Update notes→Design probe. Never mirror—echo+extend+question.
PROBES: counting, containment, patterns, sequences, binary(filled/unfilled).`;

const delay = ms => new Promise(r => setTimeout(r, ms));

const parseJSON = (text) => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found');
  let json = match[0]
    .replace(/[\x00-\x1F\x7F]/g, ' ')  // Remove control chars
    .replace(/,\s*}/g, '}')            // Remove trailing commas
    .replace(/,\s*]/g, ']');
  try {
    return JSON.parse(json);
  } catch (e) {
    // Try to fix common issues
    json = json.replace(/:\s*'([^']*)'/g, ':"$1"');  // Single to double quotes
    json = json.replace(/(\w+):/g, '"$1":');         // Unquoted keys
    return JSON.parse(json);
  }
};

export default function FirstContact() {
  const [phase, setPhase] = useState('intro');
  const [exchanges, setExchanges] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [turn, setTurn] = useState(null);
  const [error, setError] = useState(null);
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(10);
  const [pace, setPace] = useState(3);
  const [retry, setRetry] = useState(null);
  const [notesA, setNotesA] = useState('');
  const [notesB, setNotesB] = useState('');
  
  const [openAIKey, setOpenAIKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [providerA, setProviderA] = useState('openai');
  const [providerB, setProviderB] = useState('gemini');
  const [modelA, setModelA] = useState('gpt-4o');
  const [modelB, setModelB] = useState('gemini-2.0-flash');
  const [openAIModels, setOpenAIModels] = useState([]);
  const [geminiModels, setGeminiModels] = useState([]);
  const [loading, setLoading] = useState({});
  
  const abort = useRef(false);
  const histA = useRef([]);
  const histB = useRef([]);
  const notesRefA = useRef('');
  const notesRefB = useRef('');

  const color = (entity) => PROVIDERS[entity === 'A' ? providerA : providerB].color;
  const name = (entity) => PROVIDERS[entity === 'A' ? providerA : providerB].name;
  const short = (entity) => PROVIDERS[entity === 'A' ? providerA : providerB].short;

  // Fetch models
  const fetchModels = useCallback(async (provider, key) => {
    if (!key || key.length < 15) return;
    setLoading(l => ({ ...l, [provider]: true }));
    try {
      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` }
        });
        if (!res.ok) return;
        const { data } = await res.json();
        const models = data
          .filter(m => /^(gpt-4|gpt-3\.5|o1|o3)/.test(m.id) && !/instruct|0125|0613/.test(m.id))
          .map(m => m.id)
          .sort((a, b) => {
            const p = ['o3', 'o1', 'gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5'];
            return (p.findIndex(x => a.startsWith(x)) ?? 99) - (p.findIndex(x => b.startsWith(x)) ?? 99);
          });
        setOpenAIModels(models);
        if (models.length && !models.includes(modelA)) setModelA(models.find(m => m.includes('gpt-4o')) || models[0]);
      } else {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!res.ok) return;
        const { models } = await res.json();
        const list = models
          .filter(m => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('gemini'))
          .map(m => m.name.replace('models/', ''))
          .sort((a, b) => {
            const p = ['gemini-2.0', 'gemini-1.5-pro', 'gemini-1.5-flash'];
            return (p.findIndex(x => a.startsWith(x)) ?? 99) - (p.findIndex(x => b.startsWith(x)) ?? 99);
          });
        setGeminiModels(list);
        if (list.length && !list.includes(modelB)) setModelB(list.find(m => m.includes('2.0-flash')) || list[0]);
      }
    } finally {
      setLoading(l => ({ ...l, [provider]: false }));
    }
  }, [modelA, modelB]);

  useEffect(() => { const t = setTimeout(() => fetchModels('openai', openAIKey), 500); return () => clearTimeout(t); }, [openAIKey, fetchModels]);
  useEffect(() => { const t = setTimeout(() => fetchModels('gemini', geminiKey), 500); return () => clearTimeout(t); }, [geminiKey, fetchModels]);

  const renderShapes = useCallback((shapes, entity) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 400, 400);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i <= 400; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 400); ctx.moveTo(0, i); ctx.lineTo(400, i); ctx.stroke(); }
    const c = color(entity);
    ctx.strokeStyle = ctx.fillStyle = c;
    ctx.lineCap = 'round';
    (shapes || []).forEach(s => {
      if (!s?.type) return;
      ctx.lineWidth = s.thickness || 2;
      ctx.beginPath();
      if (s.type === 'circle' && s.cx != null) { ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2); s.filled ? ctx.fill() : ctx.stroke(); }
      else if (s.type === 'line' && s.x1 != null) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); }
      else if (s.type === 'arc' && s.cx != null) { ctx.arc(s.cx, s.cy, s.r, (s.startAngle || 0) * Math.PI / 180, (s.endAngle || 180) * Math.PI / 180); ctx.stroke(); }
      else if (s.type === 'dot' && s.cx != null) { ctx.arc(s.cx, s.cy, s.r || 5, 0, Math.PI * 2); ctx.fill(); }
    });
    return canvas.toDataURL('image/png').split(',')[1];
  }, [providerA, providerB]);

  const callAPI = useCallback(async (provider, model, key, history, imageData, notes) => {
    const notesPrompt = notes ? `\nYOUR NOTEPAD:\n${notes}\nUpdate based on new observation.` : '\nStart your research notepad.';
    const userMsg = imageData ? `New signal. Analyze and respond.${notesPrompt}\nJSON only.` : `Glass empty. First probe.${notesPrompt}\nJSON only.`;

    if (provider === 'openai') {
      const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
      history.slice(-4).forEach(h => messages.push(h));
      messages.push(imageData
        ? { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${imageData}` } }, { type: 'text', text: userMsg }] }
        : { role: 'user', content: userMsg });
      
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, max_tokens: 1000, temperature: 0.8, messages })
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`OpenAI ${res.status}: ${e.error?.message || 'Error'}`); }
      const data = await res.json();
      return parseJSON(data.choices?.[0]?.message?.content || '');
    } else {
      const contents = [];
      history.slice(-4).forEach(h => contents.push({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] }));
      contents.push({ role: 'user', parts: imageData
        ? [{ inlineData: { mimeType: 'image/png', data: imageData } }, { text: userMsg }]
        : [{ text: userMsg }] });
      
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, generationConfig: { temperature: 0.8 } })
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 100)}`);
      const data = await res.json();
      return parseJSON(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
    }
  }, []);

  const withRetry = useCallback(async (fn) => {
    for (let i = 1; i <= 5; i++) {
      try { setRetry(null); return await fn(); }
      catch (e) {
        if (i === 5 || !/429|rate|quota|too many/i.test(e.message)) { setRetry(null); throw e; }
        const wait = Math.min(5000 * 2 ** (i - 1), 60000);
        setRetry({ i, wait: Math.round(wait / 1000) });
        await delay(wait);
      }
    }
  }, []);

  const run = useCallback(async () => {
    setIsRunning(true); setExchanges([]); setError(null); setRound(0);
    abort.current = false; histA.current = []; histB.current = [];
    notesRefA.current = notesRefB.current = ''; setNotesA(''); setNotesB('');
    setPhase('contact');
    
    let imgA = null, imgB = null;
    const keyA = providerA === 'openai' ? openAIKey : geminiKey;
    const keyB = providerB === 'openai' ? openAIKey : geminiKey;
    const mdlA = providerA === 'openai' ? modelA : modelB;
    const mdlB = providerB === 'openai' ? modelA : modelB;

    try {
      for (let r = 0; r < totalRounds && !abort.current; r++) {
        setRound(r + 1);
        
        // Entity A
        setTurn('A');
        await delay(300);
        const respA = await withRetry(() => callAPI(providerA, mdlA, keyA, histA.current, imgA, notesRefA.current));
        const shapesA = respA.shapes || [];
        if (respA.notes) { notesRefA.current = respA.notes; setNotesA(respA.notes); }
        histA.current.push({ role: 'user', content: imgA ? '[image]' : 'Begin' });
        histA.current.push({ role: 'assistant', content: JSON.stringify(respA) });
        if (histA.current.length > 6) histA.current = histA.current.slice(-6);
        imgB = renderShapes(shapesA, 'A');
        setExchanges(ex => [{ id: `${r}-A`, entity: 'A', round: r + 1, shapes: shapesA, intent: respA.intent, notes: respA.notes, image: imgB }, ...ex]);
        
        await delay(pace * 1000);
        if (abort.current) break;

        // Entity B
        setTurn('B');
        await delay(300);
        const respB = await withRetry(() => callAPI(providerB, mdlB, keyB, histB.current, imgB, notesRefB.current));
        const shapesB = respB.shapes || [];
        if (respB.notes) { notesRefB.current = respB.notes; setNotesB(respB.notes); }
        histB.current.push({ role: 'user', content: '[image]' });
        histB.current.push({ role: 'assistant', content: JSON.stringify(respB) });
        if (histB.current.length > 6) histB.current = histB.current.slice(-6);
        imgA = renderShapes(shapesB, 'B');
        setExchanges(ex => [{ id: `${r}-B`, entity: 'B', round: r + 1, shapes: shapesB, intent: respB.intent, notes: respB.notes, image: imgA }, ...ex]);
        
        await delay(pace * 1000);
      }
      setPhase('complete');
    } catch (e) { setError(e.message); setPhase('complete'); }
    finally { setIsRunning(false); setTurn(null); }
  }, [callAPI, renderShapes, totalRounds, providerA, providerB, modelA, modelB, openAIKey, geminiKey, pace, withRetry]);

  const canStart = () => {
    if ((providerA === 'openai' || providerB === 'openai') && !openAIKey) return false;
    if ((providerA === 'gemini' || providerB === 'gemini') && !geminiKey) return false;
    return true;
  };

  const latestA = exchanges.find(e => e.entity === 'A');
  const latestB = exchanges.find(e => e.entity === 'B');
  const cA = color('A'), cB = color('B');

  const Input = ({ value, onChange, ...props }) => (
    <input value={value} onChange={e => onChange(e.target.value)} style={{ height: 36, fontSize: 11, padding: '0 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', outline: 'none', fontFamily: 'inherit', ...props.style }} {...props} />
  );

  const Select = ({ value, onChange, children, color: c, ...props }) => (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ height: 36, fontSize: 10, padding: '0 8px', background: '#0a0a0a', border: `1px solid ${dim(c)}`, color: c, outline: 'none', cursor: 'pointer', fontFamily: 'inherit', ...props.style }} {...props}>{children}</select>
  );

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: '#0a0a0a', color: '#fff', fontFamily: '"JetBrains Mono", monospace', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, letterSpacing: '0.35em', fontWeight: 500 }}>FIRST CONTACT</span>
        {turn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: retry ? '#f59e0b' : color(turn), animation: 'pulse 1s infinite' }} />
            <span style={{ fontSize: 10, letterSpacing: '0.1em', color: retry ? 'rgba(245,158,11,0.7)' : text(color(turn)) }}>
              {retry ? `RATE LIMITED — RETRY ${retry.i}/5 IN ${retry.wait}s` : `${name(turn).toUpperCase()} — ${round}/${totalRounds}`}
            </span>
          </div>
        )}
        {isRunning && <button onClick={() => abort.current = true} style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>STOP</button>}
        {phase === 'complete' && <button onClick={run} style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>RESTART</button>}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Intro */}
        {phase === 'intro' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ maxWidth: 460, textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, lineHeight: 1.7, marginBottom: 40 }}>Two AI entities. Separate contexts. No shared memory.<br />Communication through geometry only.</p>
              
              <div style={{ display: 'flex', gap: 24, marginBottom: 32, justifyContent: 'center' }}>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>ENTITY A</div>
                  <Select value={providerA} onChange={setProviderA} color={PROVIDERS[providerA].color}>
                    <option value="openai">OpenAI</option><option value="gemini">Gemini</option>
                  </Select>
                </div>
                <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginTop: 16 }}>⟷</div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>ENTITY B</div>
                  <Select value={providerB} onChange={setProviderB} color={PROVIDERS[providerB].color}>
                    <option value="openai">OpenAI</option><option value="gemini">Gemini</option>
                  </Select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
                {(providerA === 'openai' || providerB === 'openai') && (
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: '0.2em', color: text(PROVIDERS.openai.color), marginBottom: 8 }}>OPENAI KEY</div>
                      <Input type="password" value={openAIKey} onChange={setOpenAIKey} placeholder="sk-..." style={{ width: 180 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: '0.2em', color: text(PROVIDERS.openai.color), marginBottom: 8 }}>MODEL {loading.openai && '...'}</div>
                      <Select value={modelA} onChange={setModelA} color={PROVIDERS.openai.color} style={{ width: 160 }}>
                        {(openAIModels.length ? openAIModels : ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini']).map(m => <option key={m} value={m}>{m}</option>)}
                      </Select>
                    </div>
                  </div>
                )}
                {(providerA === 'gemini' || providerB === 'gemini') && (
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: '0.2em', color: text(PROVIDERS.gemini.color), marginBottom: 8 }}>GEMINI KEY</div>
                      <Input type="password" value={geminiKey} onChange={setGeminiKey} placeholder="AIza..." style={{ width: 180 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: '0.2em', color: text(PROVIDERS.gemini.color), marginBottom: 8 }}>MODEL {loading.gemini && '...'}</div>
                      <Select value={modelB} onChange={setModelB} color={PROVIDERS.gemini.color} style={{ width: 200 }}>
                        {(geminiModels.length ? geminiModels : ['gemini-2.0-flash', 'gemini-2.0-flash-thinking-exp-01-21', 'gemini-1.5-pro', 'gemini-1.5-flash']).map(m => <option key={m} value={m}>{m}</option>)}
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 32, marginBottom: 32, justifyContent: 'center' }}>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', marginBottom: 12 }}>ROUNDS</div>
                  <Input type="number" min={1} max={299} value={totalRounds} onChange={v => setTotalRounds(Math.max(1, Math.min(299, +v || 1)))} style={{ width: 64, textAlign: 'center', fontSize: 14 }} />
                </div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', marginBottom: 12 }}>PACE (S)</div>
                  <Input type="number" min={1} max={60} value={pace} onChange={v => setPace(Math.max(1, Math.min(60, +v || 3)))} style={{ width: 64, textAlign: 'center', fontSize: 14 }} />
                </div>
              </div>

              <button onClick={run} disabled={!canStart()} style={{ fontSize: 10, letterSpacing: '0.25em', border: '1px solid rgba(255,255,255,0.15)', background: canStart() ? 'rgba(255,255,255,0.05)' : 'none', color: canStart() ? '#fff' : 'rgba(255,255,255,0.25)', padding: '14px 28px', cursor: canStart() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>INITIATE</button>
              {!canStart() && <p style={{ fontSize: 10, color: 'rgba(255,100,100,0.5)', marginTop: 12 }}>Enter required API key(s)</p>}
            </div>
          </div>
        )}

        {/* Contact View */}
        {(phase === 'contact' || phase === 'complete') && (
          <>
            {/* Canvases */}
            <div style={{ width: '22%', minWidth: 200, display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
              {[['A', latestA, cA], ['B', latestB, cB]].map(([e, latest, c]) => (
                <div key={e} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.25em', color: text(c), marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: c }} />{name(e).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, border: `1px solid ${dim(c)}`, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                    {latest ? <img src={`data:image/png;base64,${latest.image}`} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.12)' }}>AWAITING</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Notepads */}
            <div style={{ width: '32%', minWidth: 260, borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' }}>
              {[['A', notesA, cA], ['B', notesB, cB]].map(([e, notes, c], i) => (
                <div key={e} style={{ flex: 1, display: 'flex', flexDirection: 'column', borderBottom: i === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', minHeight: 0 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.25em', color: text(c), padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: c }} />{name(e).toUpperCase()} NOTEPAD
                  </div>
                  <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                    {notes ? <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>{notes}</pre> : <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.12)' }}>NO OBSERVATIONS YET</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Log */}
            <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.2)', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>LOG</div>
              <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
                {exchanges.map(ex => {
                  const c = color(ex.entity);
                  return (
                    <div key={ex.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <div style={{ fontSize: 9, color: text(c) }}>{ex.round}.{short(ex.entity)}</div>
                        <div style={{ width: 44, height: 44, border: `1px solid ${dim(c)}` }}><img src={`data:image/png;base64,${ex.image}`} alt="" style={{ width: '100%', height: '100%' }} /></div>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)' }}>{ex.shapes?.length || 0}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {ex.intent && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: 0 }}>{ex.intent}</p>}
                        {!ex.intent && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0 }}>—</p>}
                      </div>
                    </div>
                  );
                })}
                {!exchanges.length && <div style={{ padding: '40px 0', textAlign: 'center' }}><span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.12)' }}>AWAITING FIRST PROBE</span></div>}
              </div>
            </div>
          </>
        )}
      </div>

      {error && <div style={{ position: 'fixed', bottom: 16, left: 16, fontSize: 10, color: '#f87171', background: 'rgba(127,29,29,0.3)', padding: '8px 12px', border: '1px solid rgba(248,113,113,0.3)', fontFamily: 'inherit', maxWidth: 400 }}>{error}</div>}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        button:hover:not(:disabled) { opacity: 0.7; }
        select { appearance: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        input:focus, select:focus { border-color: rgba(255,255,255,0.3); }
      `}</style>
    </div>
  );
}
