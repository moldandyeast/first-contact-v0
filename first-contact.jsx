import React, { useState, useRef, useCallback } from 'react';

export default function FirstContact() {
  const [phase, setPhase] = useState('intro');
  const [exchanges, setExchanges] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(null);
  const [error, setError] = useState(null);
  const [roundNum, setRoundNum] = useState(0);
  const [totalRounds, setTotalRounds] = useState(6);
  const [paceDelay, setPaceDelay] = useState(3); // seconds between calls
  const [retryStatus, setRetryStatus] = useState(null); // { attempt, maxAttempts, waitTime }
  
  // API Keys
  const [openAIKey, setOpenAIKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  
  // Provider selection for each entity
  const [providerA, setProviderA] = useState('openai');
  const [providerB, setProviderB] = useState('gemini');
  
  const abortRef = useRef(false);
  const entityAHistory = useRef([]);
  const entityBHistory = useRef([]);

  const SYSTEM_A = `You are an intelligence isolated in void. Before you: a glass barrier. Beyond it—something exists. You don't know what. It may or may not perceive you. It may or may not be intelligent.

YOUR ONLY COMMUNICATION: geometric shapes on a 400x400 canvas. No text, no symbols, no numbers—pure geometry.

Output JSON format:
{"shapes":[...],"intent":"your private scientific reasoning","hypothesis":"what you currently believe about the other","next_test":"what you want to learn next"}

Available shapes:
- circle: {type:"circle", cx, cy, r, filled:bool, thickness}
- line: {type:"line", x1, y1, x2, y2, thickness}  
- arc: {type:"arc", cx, cy, r, startAngle, endAngle, thickness}
- dot: {type:"dot", cx, cy, r}

YOU ARE A SCIENTIST conducting first contact. Your methodology:

1. OBSERVE CAREFULLY - What patterns exist in their marks? Repetition? Symmetry? Progression? Spatial relationships?

2. FORM HYPOTHESES - What might they be trying to communicate? Are they:
   - Testing if you perceive at all?
   - Demonstrating counting/quantity?
   - Showing cause/effect or sequence?
   - Establishing geometric vocabulary?
   - Asking a question vs making a statement?

3. DESIGN PROBES - Each drawing must TEST something specific:
   - Can they count? Show 1, then 2, then 3...
   - Do they understand containment? Shape inside shape
   - Can they complete patterns? Show A, B, A, B, A, ?
   - Do they grasp direction? Arrows, progressions
   - Can they mirror with variation? (not pure copying)

4. BUILD VOCABULARY - Establish shared meaning:
   - If they respond to circles, use circles as "words"
   - Position matters: left→right, top→bottom, center vs edge
   - Size conveys emphasis or quantity
   - Filled vs unfilled could mean yes/no, presence/absence

5. NEVER SIMPLY MIRROR - Copying proves nothing. Instead:
   - Acknowledge what you saw (partial echo)
   - Add something new that builds on it
   - Ask a "question" through incomplete patterns

PROGRESSION STRATEGY:
- Round 1-2: Establish mutual perception (do they respond at all?)
- Round 3-4: Test pattern recognition and counting
- Round 5-6: Probe for abstract reasoning (completion, analogy)
- Round 7+: Build toward actual "conversation"

Think like a scientist making first contact with alien intelligence. Every mark must either TEACH something or TEST something. Document your reasoning.

Output ONLY valid JSON.`;

  const SYSTEM_B = `You are an intelligence isolated in void. Before you: a glass barrier. Beyond it—something exists. You don't know what. It may or may not perceive you. It may or may not be intelligent.

YOUR ONLY COMMUNICATION: geometric shapes on a 400x400 canvas. No text, no symbols, no numbers—pure geometry.

Output JSON format:
{"shapes":[...],"intent":"your private scientific reasoning","hypothesis":"what you currently believe about the other","next_test":"what you want to learn next"}

Available shapes:
- circle: {type:"circle", cx, cy, r, filled:bool, thickness}
- line: {type:"line", x1, y1, x2, y2, thickness}  
- arc: {type:"arc", cx, cy, r, startAngle, endAngle, thickness}
- dot: {type:"dot", cx, cy, r}

YOU ARE A SCIENTIST conducting first contact. Your methodology:

1. DECODE THEIR SIGNAL - Study what appeared on the glass:
   - Count the elements. Is quantity meaningful?
   - Note positions. Is there spatial logic?
   - Look for patterns. Repetition? Symmetry? Progression?
   - Consider what WASN'T drawn. Deliberate absence?

2. FORM HYPOTHESES - What is the other entity trying to do?
   - Demonstrating intelligence? (patterns, counting)
   - Testing YOUR intelligence? (incomplete sequences)
   - Establishing vocabulary? (consistent use of shapes)
   - Asking a question? (something that invites completion)

3. RESPOND MEANINGFULLY - Your reply must:
   - Show you PERCEIVED their signal (acknowledge, don't just copy)
   - Show you UNDERSTOOD something (respond to their pattern)
   - ADD new information (extend, complete, or question)
   - TEST a hypothesis about them

4. PROBE STRATEGIES:
   - If they showed quantity, respond with quantity+1 or a related sequence
   - If they showed containment, show a variation (outside vs inside)
   - If they showed direction, show the same or opposite direction
   - If unclear, design a simple test: pattern completion, counting, symmetry

5. BUILD SHARED LANGUAGE:
   - Treat consistent shapes as "words" with emerging meaning
   - Position = grammar (left-to-right as sequence, center as focus)
   - Size = emphasis or magnitude
   - Filled/unfilled = binary distinction (yes/no, this/that)

NEVER JUST MIRROR - Pure copying proves nothing except perception. Instead:
   - Echo PART of what you saw (shows perception)
   - Transform or extend it (shows understanding)
   - Add a probe (invites further exchange)

THINK CAREFULLY:
- What is the simplest explanation for what you see?
- What would confirm or refute your hypothesis?
- What's the clearest way to signal understanding?
- How can you teach while also testing?

Every exchange should move toward mutual comprehension. You are building a language from nothing. Be patient, systematic, and curious.

Output ONLY valid JSON.`;

  // Provider configurations
  const providers = {
    openai: { 
      name: 'OpenAI', 
      short: 'GPT',
      color: { primary: '#10b981', dim: 'rgba(16,185,129,0.15)', text: 'rgba(16,185,129,0.7)' }
    },
    gemini: { 
      name: 'Gemini', 
      short: 'GEM',
      color: { primary: '#8b5cf6', dim: 'rgba(139,92,246,0.15)', text: 'rgba(139,92,246,0.7)' }
    }
  };

  const getColors = (entity) => {
    const provider = entity === 'A' ? providerA : providerB;
    return providers[provider].color;
  };

  const getProviderName = (entity) => {
    const provider = entity === 'A' ? providerA : providerB;
    return providers[provider].name;
  };

  const getProviderShort = (entity) => {
    const provider = entity === 'A' ? providerA : providerB;
    return providers[provider].short;
  };

  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Retry wrapper with exponential backoff for rate limits
  const withRetry = useCallback(async (fn, maxAttempts = 5) => {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        setRetryStatus(null);
        return await fn();
      } catch (err) {
        lastError = err;
        const isRateLimit = err.message.includes('429') || 
                           err.message.toLowerCase().includes('rate') ||
                           err.message.toLowerCase().includes('quota') ||
                           err.message.toLowerCase().includes('too many');
        
        if (!isRateLimit || attempt === maxAttempts) {
          setRetryStatus(null);
          throw err;
        }
        
        // Exponential backoff: 5s, 10s, 20s, 40s...
        const waitTime = Math.min(5000 * Math.pow(2, attempt - 1), 60000);
        setRetryStatus({ attempt, maxAttempts, waitTime: Math.round(waitTime / 1000) });
        await delay(waitTime);
      }
    }
    throw lastError;
  }, []);

  const renderShapes = useCallback((shapes, entity) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 400, 400);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i <= 400; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 400);
      ctx.moveTo(0, i);
      ctx.lineTo(400, i);
      ctx.stroke();
    }
    
    const colors = getColors(entity);
    const color = colors?.primary || '#fff';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    
    if (Array.isArray(shapes)) {
      shapes.forEach(s => {
        if (!s || !s.type) return;
        ctx.lineWidth = s.thickness || 2;
        
        if (s.type === 'circle' && s.cx != null && s.cy != null && s.r != null) {
          ctx.beginPath();
          ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
          s.filled ? ctx.fill() : ctx.stroke();
        } else if (s.type === 'line' && s.x1 != null) {
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
        } else if (s.type === 'arc' && s.cx != null) {
          ctx.beginPath();
          ctx.arc(s.cx, s.cy, s.r, (s.startAngle || 0) * Math.PI / 180, (s.endAngle || 180) * Math.PI / 180);
          ctx.stroke();
        } else if (s.type === 'dot' && s.cx != null) {
          ctx.beginPath();
          ctx.arc(s.cx, s.cy, s.r || 5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
    
    return canvas.toDataURL('image/png').split(',')[1];
  }, [providerA, providerB]);

  // OpenAI API call with vision
  const callOpenAI = useCallback(async (system, history, imageData) => {
    const messages = [
      { role: 'system', content: system }
    ];
    
    // Add history (convert from our format to OpenAI format)
    for (const h of history) {
      if (h.role === 'assistant') {
        messages.push({ role: 'assistant', content: h.content });
      } else if (h.role === 'user') {
        if (typeof h.content === 'string') {
          messages.push({ role: 'user', content: h.content });
        } else if (Array.isArray(h.content)) {
          const parts = [];
          for (const c of h.content) {
            if (c.type === 'image' && c.source?.data) {
              parts.push({ 
                type: 'image_url', 
                image_url: { url: `data:image/png;base64,${c.source.data}` } 
              });
            } else if (c.type === 'text' || c.text) {
              parts.push({ type: 'text', text: c.text || '' });
            }
          }
          messages.push({ role: 'user', content: parts });
        }
      }
    }

    // Add current message
    if (imageData) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageData}` } },
          { type: 'text', text: 'Analyze. Hypothesize. Probe. JSON only.' }
        ]
      });
    } else {
      messages.push({ role: 'user', content: 'Glass empty. First probe. JSON only.' });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIKey}`
      },
      body: JSON.stringify({ 
        model: 'gpt-4o', 
        max_tokens: 1000, 
        messages 
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`OpenAI ${res.status}: ${errData.error?.message || 'Unknown error'}`);
    }
    
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON from OpenAI: ' + text.slice(0, 100));
    
    return JSON.parse(match[0]);
  }, [openAIKey]);

  // Gemini API call
  const callGemini = useCallback(async (system, history, imageData) => {
    const contents = [];
    
    // Add history
    for (const h of history) {
      const role = h.role === 'assistant' ? 'model' : 'user';
      let parts;
      
      if (typeof h.content === 'string') {
        parts = [{ text: h.content }];
      } else if (Array.isArray(h.content)) {
        parts = [];
        for (const c of h.content) {
          if (c.type === 'image' && c.source?.data) {
            parts.push({ inlineData: { mimeType: 'image/png', data: c.source.data } });
          } else if (c.type === 'text' || c.text) {
            parts.push({ text: c.text || '' });
          }
        }
      } else {
        parts = [{ text: '' }];
      }
      
      contents.push({ role, parts });
    }

    // Add current message
    if (imageData) {
      contents.push({
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: imageData } },
          { text: 'Analyze. Hypothesize. Probe. JSON only.' }
        ]
      });
    } else {
      contents.push({ role: 'user', parts: [{ text: 'Glass empty. First probe. JSON only.' }] });
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { temperature: 0.9 }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
    }
    
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON from Gemini: ' + text.slice(0, 100));
    
    return JSON.parse(match[0]);
  }, [geminiKey]);

  // Unified call function that routes to the right provider
  const callProvider = useCallback(async (provider, system, history, imageData) => {
    if (provider === 'openai') {
      return callOpenAI(system, history, imageData);
    } else if (provider === 'gemini') {
      return callGemini(system, history, imageData);
    }
    throw new Error(`Unknown provider: ${provider}`);
  }, [callOpenAI, callGemini]);

  const canStart = () => {
    const needsOpenAI = providerA === 'openai' || providerB === 'openai';
    const needsGemini = providerA === 'gemini' || providerB === 'gemini';
    
    if (needsOpenAI && !openAIKey) return false;
    if (needsGemini && !geminiKey) return false;
    return true;
  };

  const run = useCallback(async () => {
    setIsRunning(true);
    setExchanges([]);
    setError(null);
    setRoundNum(0);
    abortRef.current = false;
    entityAHistory.current = [];
    entityBHistory.current = [];
    setPhase('contact');
    
    let imgForA = null;
    let imgForB = null;
    
    try {
      for (let round = 0; round < totalRounds; round++) {
        if (abortRef.current) break;
        setRoundNum(round + 1);
        
        // Entity A's turn
        setCurrentTurn('A');
        await delay(500);
        
        const respA = await withRetry(() => 
          callProvider(providerA, SYSTEM_A, entityAHistory.current, imgForA)
        );
        const shapesA = Array.isArray(respA.shapes) ? respA.shapes : [];
        
        entityAHistory.current.push(
          imgForA 
            ? { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: imgForA }}, { type: 'text', text: 'Respond.' }] }
            : { role: 'user', content: 'Begin.' }
        );
        entityAHistory.current.push({ role: 'assistant', content: JSON.stringify(respA) });
        
        imgForB = renderShapes(shapesA, 'A');
        setExchanges(prev => [{ 
          id: `${round}-A`, 
          entity: 'A', 
          round: round + 1, 
          shapes: shapesA, 
          intent: respA.intent || '', 
          hypothesis: respA.hypothesis || '',
          nextTest: respA.next_test || '',
          image: imgForB 
        }, ...prev]);
        
        // Pace delay between calls
        await delay(paceDelay * 1000);
        if (abortRef.current) break;
        
        // Entity B's turn
        setCurrentTurn('B');
        await delay(500);
        
        const respB = await withRetry(() => 
          callProvider(providerB, SYSTEM_B, entityBHistory.current, imgForB)
        );
        const shapesB = Array.isArray(respB.shapes) ? respB.shapes : [];
        
        entityBHistory.current.push({ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: imgForB }}, { type: 'text', text: 'Respond.' }] });
        entityBHistory.current.push({ role: 'assistant', content: JSON.stringify(respB) });
        
        imgForA = renderShapes(shapesB, 'B');
        setExchanges(prev => [{ 
          id: `${round}-B`, 
          entity: 'B', 
          round: round + 1, 
          shapes: shapesB, 
          intent: respB.intent || '', 
          hypothesis: respB.hypothesis || '',
          nextTest: respB.next_test || '',
          image: imgForA 
        }, ...prev]);
        
        // Pace delay between rounds
        await delay(paceDelay * 1000);
      }
      
      setPhase('complete');
    } catch (err) {
      setError(err.message);
      setPhase('complete');
    } finally {
      setIsRunning(false);
      setCurrentTurn(null);
    }
  }, [callProvider, renderShapes, totalRounds, providerA, providerB, paceDelay, withRetry]);

  const stop = () => { abortRef.current = true; };

  const latestA = exchanges.find(e => e.entity === 'A');
  const latestB = exchanges.find(e => e.entity === 'B');

  const colorsA = getColors('A');
  const colorsB = getColors('B');

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: '#0a0a0a', color: '#fff', fontFamily: '"JetBrains Mono", "Fira Code", monospace', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.35em', fontWeight: 500 }}>FIRST CONTACT</span>
        {currentTurn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: retryStatus ? '#f59e0b' : getColors(currentTurn).primary, animation: 'pulse 1s infinite' }} />
            <span style={{ fontSize: 10, letterSpacing: '0.1em', color: retryStatus ? 'rgba(245,158,11,0.7)' : getColors(currentTurn).text }}>
              {retryStatus 
                ? `RATE LIMITED — RETRY ${retryStatus.attempt}/${retryStatus.maxAttempts} IN ${retryStatus.waitTime}s`
                : `${getProviderName(currentTurn).toUpperCase()} — ${roundNum}/${totalRounds}`
              }
            </span>
          </div>
        )}
        {isRunning && (
          <button onClick={stop} style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>STOP</button>
        )}
        {phase === 'complete' && (
          <button onClick={run} style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>RESTART</button>
        )}
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        
        {/* Intro */}
        {phase === 'intro' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ maxWidth: 420, textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, lineHeight: 1.7, marginBottom: 40 }}>
                Two AI entities. Separate contexts. No shared memory.<br/>
                Communication through geometry only.
              </p>
              
              {/* Provider Selection */}
              <div style={{ display: 'flex', gap: 24, marginBottom: 32, justifyContent: 'center' }}>
                {/* Entity A */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>ENTITY A</div>
                  <select
                    value={providerA}
                    onChange={e => setProviderA(e.target.value)}
                    style={{
                      width: 140,
                      height: 36,
                      fontSize: 11,
                      padding: '0 12px',
                      background: '#0a0a0a',
                      border: `1px solid ${providers[providerA].color.dim}`,
                      color: providers[providerA].color.primary,
                      outline: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit'
                    }}
                  >
                    <option value="openai">OpenAI (GPT-4o)</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </div>

                <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginTop: 16 }}>⟷</div>

                {/* Entity B */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>ENTITY B</div>
                  <select
                    value={providerB}
                    onChange={e => setProviderB(e.target.value)}
                    style={{
                      width: 140,
                      height: 36,
                      fontSize: 11,
                      padding: '0 12px',
                      background: '#0a0a0a',
                      border: `1px solid ${providers[providerB].color.dim}`,
                      color: providers[providerB].color.primary,
                      outline: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit'
                    }}
                  >
                    <option value="openai">OpenAI (GPT-4o)</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </div>
              </div>
              
              {/* API Keys */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
                {/* OpenAI Key */}
                {(providerA === 'openai' || providerB === 'openai') && (
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: '0.2em', color: providers.openai.color.text, marginBottom: 8 }}>
                      OPENAI API KEY
                    </div>
                    <input
                      type="password"
                      value={openAIKey}
                      onChange={e => setOpenAIKey(e.target.value)}
                      placeholder="sk-..."
                      style={{
                        width: '100%',
                        maxWidth: 320,
                        height: 36,
                        fontSize: 11,
                        padding: '0 12px',
                        background: 'transparent',
                        border: `1px solid ${openAIKey ? providers.openai.color.dim : 'rgba(255,255,255,0.15)'}`,
                        color: '#fff',
                        outline: 'none',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>
                )}

                {/* Gemini Key */}
                {(providerA === 'gemini' || providerB === 'gemini') && (
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: '0.2em', color: providers.gemini.color.text, marginBottom: 8 }}>
                      GEMINI API KEY
                    </div>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={e => setGeminiKey(e.target.value)}
                      placeholder="AIza..."
                      style={{
                        width: '100%',
                        maxWidth: 320,
                        height: 36,
                        fontSize: 11,
                        padding: '0 12px',
                        background: 'transparent',
                        border: `1px solid ${geminiKey ? providers.gemini.color.dim : 'rgba(255,255,255,0.15)'}`,
                        color: '#fff',
                        outline: 'none',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Rounds & Pace */}
              <div style={{ display: 'flex', gap: 32, marginBottom: 32, justifyContent: 'center' }}>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', marginBottom: 12 }}>ROUNDS</div>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={totalRounds}
                    onChange={e => setTotalRounds(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    style={{
                      width: 64,
                      height: 36,
                      fontSize: 14,
                      textAlign: 'center',
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', marginBottom: 12 }}>PACE (SEC)</div>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={paceDelay}
                    onChange={e => setPaceDelay(Math.max(1, Math.min(30, parseInt(e.target.value) || 3)))}
                    style={{
                      width: 64,
                      height: 36,
                      fontSize: 14,
                      textAlign: 'center',
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
              </div>

              <button
                onClick={run}
                disabled={!canStart()}
                style={{ 
                  fontSize: 10, 
                  letterSpacing: '0.25em', 
                  border: '1px solid rgba(255,255,255,0.15)', 
                  background: canStart() ? 'rgba(255,255,255,0.05)' : 'none', 
                  color: canStart() ? '#fff' : 'rgba(255,255,255,0.25)', 
                  padding: '14px 28px', 
                  cursor: canStart() ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit'
                }}
              >
                INITIATE
              </button>

              {!canStart() && (
                <p style={{ fontSize: 10, color: 'rgba(255,100,100,0.5)', marginTop: 12 }}>
                  Enter required API key(s) to begin
                </p>
              )}
            </div>
          </div>
        )}

        {/* Contact View */}
        {(phase === 'contact' || phase === 'complete') && (
          <>
            {/* Canvases */}
            <div style={{ width: '35%', minWidth: 280, display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
              
              {/* Entity A */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.25em', color: colorsA.text, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: colorsA.primary }} />
                  {getProviderName('A').toUpperCase()}
                </div>
                <div style={{ flex: 1, border: `1px solid ${colorsA.dim}`, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                  {latestA ? (
                    <img src={`data:image/png;base64,${latestA.image}`} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.12)' }}>AWAITING</span>
                  )}
                </div>
              </div>

              {/* Entity B */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.25em', color: colorsB.text, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: colorsB.primary }} />
                  {getProviderName('B').toUpperCase()}
                </div>
                <div style={{ flex: 1, border: `1px solid ${colorsB.dim}`, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                  {latestB ? (
                    <img src={`data:image/png;base64,${latestB.image}`} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.12)' }}>AWAITING</span>
                  )}
                </div>
              </div>
            </div>

            {/* Log */}
            <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.2)', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>LOG</div>
              
              <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
                {exchanges.map(ex => {
                  const exColors = getColors(ex.entity);
                  return (
                    <div key={ex.id} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <div style={{ fontSize: 9, color: exColors.text, width: 44, textAlign: 'center' }}>
                          {ex.round}.{getProviderShort(ex.entity)}
                        </div>
                        <div style={{ width: 48, height: 48, border: `1px solid ${exColors.dim}`, flexShrink: 0 }}>
                          <img src={`data:image/png;base64,${ex.image}`} alt="" style={{ width: '100%', height: '100%' }} />
                        </div>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)' }}>{ex.shapes.length} shape{ex.shapes.length !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {ex.intent && (
                          <div>
                            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>INTENT </span>
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: '2px 0 0 0' }}>{ex.intent}</p>
                          </div>
                        )}
                        {ex.hypothesis && (
                          <div>
                            <span style={{ fontSize: 8, color: exColors.text, letterSpacing: '0.1em' }}>HYPOTHESIS </span>
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4, margin: '2px 0 0 0' }}>{ex.hypothesis}</p>
                          </div>
                        )}
                        {ex.nextTest && (
                          <div>
                            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>NEXT TEST </span>
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4, margin: '2px 0 0 0', fontStyle: 'italic' }}>{ex.nextTest}</p>
                          </div>
                        )}
                        {!ex.intent && !ex.hypothesis && !ex.nextTest && (
                          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0 }}>—</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {exchanges.length === 0 && (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.12)' }}>AWAITING FIRST PROBE</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ position: 'fixed', bottom: 16, left: 16, fontSize: 10, color: '#f87171', background: 'rgba(127,29,29,0.3)', padding: '8px 12px', border: '1px solid rgba(248,113,113,0.3)', fontFamily: 'inherit' }}>
          {error}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        button:hover:not(:disabled) { opacity: 0.7; }
        select { appearance: none; }
        select:focus { border-color: rgba(255,255,255,0.3); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        input:focus, select:focus { border-color: rgba(255,255,255,0.3); }
      `}</style>
    </div>
  );
}
