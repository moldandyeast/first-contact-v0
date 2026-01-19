import React, { useState, useRef, useCallback, useEffect } from 'react';

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
  const [notesA, setNotesA] = useState('');
  const [notesB, setNotesB] = useState('');
  
  // API Keys
  const [openAIKey, setOpenAIKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  
  // Provider selection for each entity
  const [providerA, setProviderA] = useState('openai');
  const [providerB, setProviderB] = useState('gemini');
  const [openAIModel, setOpenAIModel] = useState('gpt-4o');
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash');
  const [claudeModel, setClaudeModel] = useState('claude-sonnet-4-20250514');
  const [openAIModels, setOpenAIModels] = useState([]);
  const [geminiModels, setGeminiModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState({ openai: false, gemini: false });
  
  const [showPrompts, setShowPrompts] = useState(false);
  
  const abortRef = useRef(false);
  const entityAHistory = useRef([]);
  const entityBHistory = useRef([]);
  const entityANotes = useRef('');
  const entityBNotes = useRef('');

  const DEFAULT_SYSTEM = `You are an intelligence isolated in void. Glass barrier ahead. Unknown entity on other side.

COMMUNICATE ONLY via geometric shapes on 400x400 canvas. No text/symbols/numbers.

## OUTPUT FORMAT - STRICT JSON
{
  "shapes": [
    {"type": "circle", "cx": 200, "cy": 200, "r": 40, "filled": false, "thickness": 2},
    {"type": "line", "x1": 100, "y1": 100, "x2": 300, "y2": 100, "thickness": 2},
    {"type": "dot", "cx": 200, "cy": 300, "r": 8}
  ],
  "intent": "brief description of what this drawing tests or communicates",
  "notes": "CONFIRMED: ...\\nTESTING: ...\\nVOCAB: ...\\nNEXT: ..."
}

## SHAPE TYPES (canvas is 400x400, coordinates 0-400)
- circle: {"type":"circle", "cx":200, "cy":200, "r":50, "filled":false, "thickness":2}
- line: {"type":"line", "x1":50, "y1":50, "x2":350, "y2":50, "thickness":2}
- dot: {"type":"dot", "cx":200, "cy":200, "r":5}
- arc: {"type":"arc", "cx":200, "cy":200, "r":50, "startAngle":0, "endAngle":180, "thickness":2}

## RESEARCH NOTEPAD
Track in notes: CONFIRMED (facts), TESTING (hypotheses), VOCAB (shape meanings), NEXT (priorities)

## METHOD
1. OBSERVE what appeared (or nothing if first turn)
2. UPDATE your notepad
3. DRAW shapes that TEST something or TEACH something
4. Never just copy - acknowledge then extend/question

Output valid JSON only. shapes array must have at least one shape.`;

  const [systemA, setSystemA] = useState(DEFAULT_SYSTEM);
  const [systemB, setSystemB] = useState(DEFAULT_SYSTEM);


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
    },
    anthropic: { 
      name: 'Claude', 
      short: 'CLD',
      color: { primary: '#f97316', dim: 'rgba(249,115,22,0.15)', text: 'rgba(249,115,22,0.7)' }
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

  // Robust JSON parsing with fallbacks
  const parseJSON = (text) => {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in response');
    let json = match[0];
    
    // First attempt: direct parse
    try {
      return JSON.parse(json);
    } catch (e1) {
      // Second attempt: clean up common issues
      try {
        json = match[0]
          .replace(/,\s*}/g, '}')           // Remove trailing commas before }
          .replace(/,\s*]/g, ']');          // Remove trailing commas before ]
        return JSON.parse(json);
      } catch (e2) {
        // Third attempt: extract fields manually
        try {
          const shapesMatch = match[0].match(/"shapes"\s*:\s*(\[[\s\S]*?\])/);
          const intentMatch = match[0].match(/"intent"\s*:\s*"([^"]*)"/);
          const notesMatch = match[0].match(/"notes"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          
          let shapes = [];
          if (shapesMatch) {
            try {
              shapes = JSON.parse(shapesMatch[1]);
            } catch {
              // Try to parse individual shape objects
              const shapeMatches = shapesMatch[1].matchAll(/\{[^{}]+\}/g);
              for (const sm of shapeMatches) {
                try {
                  shapes.push(JSON.parse(sm[0]));
                } catch {}
              }
            }
          }
          
          return {
            shapes,
            intent: intentMatch ? intentMatch[1] : '',
            notes: notesMatch ? notesMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : ''
          };
        } catch (e3) {
          throw new Error('Failed to parse JSON: ' + e1.message);
        }
      }
    }
  };

  // Fetch available OpenAI models
  const fetchOpenAIModels = useCallback(async () => {
    if (!openAIKey || openAIKey.length < 10) return;
    setLoadingModels(prev => ({ ...prev, openai: true }));
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${openAIKey}` }
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      // Filter for chat/vision models, sort by id
      const chatModels = data.data
        .filter(m => 
          m.id.includes('gpt-4') || 
          m.id.includes('gpt-3.5') || 
          m.id.startsWith('o1') ||
          m.id.startsWith('o3')
        )
        .filter(m => !m.id.includes('instruct') && !m.id.includes('0125') && !m.id.includes('0613'))
        .map(m => m.id)
        .sort((a, b) => {
          // Prioritize newer/better models
          const priority = ['o3', 'o1', 'gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5'];
          const aP = priority.findIndex(p => a.startsWith(p));
          const bP = priority.findIndex(p => b.startsWith(p));
          if (aP !== bP) return (aP === -1 ? 99 : aP) - (bP === -1 ? 99 : bP);
          return a.localeCompare(b);
        });
      setOpenAIModels(chatModels);
      // Set default if current selection not in list
      if (chatModels.length > 0 && !chatModels.includes(openAIModel)) {
        setOpenAIModel(chatModels.find(m => m.includes('gpt-4o')) || chatModels[0]);
      }
    } catch (err) {
      console.error('Failed to fetch OpenAI models:', err);
    } finally {
      setLoadingModels(prev => ({ ...prev, openai: false }));
    }
  }, [openAIKey, openAIModel]);

  // Fetch available Gemini models
  const fetchGeminiModels = useCallback(async () => {
    if (!geminiKey || geminiKey.length < 10) return;
    setLoadingModels(prev => ({ ...prev, gemini: true }));
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      // Filter for generateContent capable models
      const genModels = data.models
        .filter(m => 
          m.supportedGenerationMethods?.includes('generateContent') &&
          (m.name.includes('gemini'))
        )
        .map(m => m.name.replace('models/', ''))
        .sort((a, b) => {
          // Prioritize newer models
          const priority = ['gemini-2.0', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0'];
          const aP = priority.findIndex(p => a.startsWith(p));
          const bP = priority.findIndex(p => b.startsWith(p));
          if (aP !== bP) return (aP === -1 ? 99 : aP) - (bP === -1 ? 99 : bP);
          return a.localeCompare(b);
        });
      setGeminiModels(genModels);
      // Set default if current selection not in list
      if (genModels.length > 0 && !genModels.includes(geminiModel)) {
        setGeminiModel(genModels.find(m => m.includes('2.0-flash')) || genModels[0]);
      }
    } catch (err) {
      console.error('Failed to fetch Gemini models:', err);
    } finally {
      setLoadingModels(prev => ({ ...prev, gemini: false }));
    }
  }, [geminiKey, geminiModel]);

  // Auto-fetch models when API keys are entered
  useEffect(() => {
    const timer = setTimeout(() => {
      if (openAIKey && openAIKey.length >= 20) {
        fetchOpenAIModels();
      }
    }, 500); // Debounce
    return () => clearTimeout(timer);
  }, [openAIKey, fetchOpenAIModels]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (geminiKey && geminiKey.length >= 20) {
        fetchGeminiModels();
      }
    }, 500); // Debounce
    return () => clearTimeout(timer);
  }, [geminiKey, fetchGeminiModels]);

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
  const callOpenAI = useCallback(async (system, history, imageData, previousNotes) => {
    const isO1 = openAIModel.startsWith('o1') || openAIModel.startsWith('o3');
    
    // o1 models don't support system messages - prepend to first user message
    const messages = [];
    if (!isO1) {
      messages.push({ role: 'system', content: system });
    }
    
    // Add limited history (last 2 exchanges only - notes carry the context)
    const recentHistory = history.slice(-4);
    for (const h of recentHistory) {
      if (h.role === 'assistant') {
        messages.push({ role: 'assistant', content: h.content });
      } else if (h.role === 'user') {
        if (typeof h.content === 'string') {
          messages.push({ role: 'user', content: h.content });
        } else if (Array.isArray(h.content)) {
          // Skip images in history for simplicity - notes carry context
          const textParts = h.content.filter(c => c.type === 'text' || c.text).map(c => c.text || '').join(' ');
          if (textParts) {
            messages.push({ role: 'user', content: textParts });
          }
        }
      }
    }

    // Build prompt with notes
    const notesSection = previousNotes 
      ? `\n\nYOUR RESEARCH NOTEPAD FROM PREVIOUS OBSERVATIONS:\n${previousNotes}\n\nUpdate these notes based on what you see now.`
      : '\n\nThis is your first observation. Start your research notepad.';
    
    const basePrompt = isO1 ? system + '\n\n' : '';
    
    // Add current message
    if (imageData && !isO1) {
      // Vision models
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageData}`, detail: 'low' } },
          { type: 'text', text: `${basePrompt}New signal appeared on the glass. Analyze and respond.${notesSection}\n\nOutput JSON only.` }
        ]
      });
    } else {
      // Text-only (o1 models or no image)
      const imgNote = imageData ? '[An image of geometric shapes was shown on the glass]' : 'Glass is empty.';
      messages.push({ role: 'user', content: `${basePrompt}${imgNote} Make your probe.${notesSection}\n\nOutput JSON only.` });
    }

    const body = { 
      model: openAIModel, 
      max_tokens: 1500,
      messages 
    };
    
    // o1 models don't support temperature
    if (!isO1) {
      body.temperature = 0.9;
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`OpenAI ${res.status}: ${errData.error?.message || 'Unknown error'}`);
    }
    
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) {
      throw new Error('OpenAI returned empty response');
    }
    return parseJSON(text);
  }, [openAIKey, openAIModel]);

  // Gemini API call
  const callGemini = useCallback(async (system, history, imageData, previousNotes) => {
    const contents = [];
    
    // Add limited history (last 2 exchanges only - notes carry the context)
    const recentHistory = history.slice(-4);
    for (const h of recentHistory) {
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

    // Build prompt with notes
    const notesSection = previousNotes 
      ? `\n\nYOUR RESEARCH NOTEPAD FROM PREVIOUS OBSERVATIONS:\n${previousNotes}\n\nUpdate these notes based on what you see now.`
      : '\n\nThis is your first observation. Start your research notepad.';

    // Add current message
    if (imageData) {
      contents.push({
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: imageData } },
          { text: `New signal appeared on the glass. Analyze and respond.${notesSection}\n\nOutput JSON only.` }
        ]
      });
    } else {
      contents.push({ role: 'user', parts: [{ text: `Glass is empty. Make first contact.${notesSection}\n\nOutput JSON only.` }] });
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
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
    return parseJSON(text);
  }, [geminiKey, geminiModel]);

  // Claude API call with vision
  const callClaude = useCallback(async (system, history, imageData, previousNotes) => {
    const messages = [];
    
    // Add limited history
    const recentHistory = history.slice(-4);
    for (const h of recentHistory) {
      if (h.role === 'assistant') {
        messages.push({ role: 'assistant', content: h.content });
      } else if (h.role === 'user') {
        if (typeof h.content === 'string') {
          messages.push({ role: 'user', content: h.content });
        } else if (Array.isArray(h.content)) {
          const textParts = h.content.filter(c => c.type === 'text' || c.text).map(c => c.text || '').join(' ');
          if (textParts) {
            messages.push({ role: 'user', content: textParts });
          }
        }
      }
    }

    // Build prompt with notes
    const notesSection = previousNotes 
      ? `\n\nYOUR RESEARCH NOTEPAD FROM PREVIOUS OBSERVATIONS:\n${previousNotes}\n\nUpdate these notes based on what you see now.`
      : '\n\nThis is your first observation. Start your research notepad.';
    
    // Add current message
    if (imageData) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageData } },
          { type: 'text', text: `New signal appeared on the glass. Analyze and respond.${notesSection}\n\nOutput JSON only.` }
        ]
      });
    } else {
      messages.push({ role: 'user', content: `Glass is empty. Make first contact.${notesSection}\n\nOutput JSON only.` });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ 
        model: claudeModel, 
        max_tokens: 1500,
        system: system,
        messages 
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Claude ${res.status}: ${errData.error?.message || 'Unknown error'}`);
    }
    
    const data = await res.json();
    const text = data.content?.map(c => c.text || '').join('') || '';
    if (!text) {
      throw new Error('Claude returned empty response');
    }
    return parseJSON(text);
  }, [anthropicKey, claudeModel]);

  // Unified call function that routes to the right provider
  const callProvider = useCallback(async (provider, system, history, imageData, notes) => {
    if (provider === 'openai') {
      return callOpenAI(system, history, imageData, notes);
    } else if (provider === 'gemini') {
      return callGemini(system, history, imageData, notes);
    } else if (provider === 'anthropic') {
      return callClaude(system, history, imageData, notes);
    }
    throw new Error(`Unknown provider: ${provider}`);
  }, [callOpenAI, callGemini, callClaude]);

  const canStart = () => {
    const needsOpenAI = providerA === 'openai' || providerB === 'openai';
    const needsGemini = providerA === 'gemini' || providerB === 'gemini';
    const needsAnthropic = providerA === 'anthropic' || providerB === 'anthropic';
    
    if (needsOpenAI && !openAIKey) return false;
    if (needsGemini && !geminiKey) return false;
    if (needsAnthropic && !anthropicKey) return false;
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
    entityANotes.current = '';
    entityBNotes.current = '';
    setNotesA('');
    setNotesB('');
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
          callProvider(providerA, systemA, entityAHistory.current, imgForA, entityANotes.current)
        );
        // Validate and filter shapes
        let shapesA = Array.isArray(respA.shapes) ? respA.shapes.filter(s => 
          s && s.type && (s.cx != null || s.x1 != null)
        ) : [];
        // Fallback if no valid shapes
        if (shapesA.length === 0) {
          console.warn('Entity A returned no valid shapes:', respA);
          shapesA = [{ type: 'dot', cx: 200, cy: 200, r: 10 }];
        }
        
        // Update notes from response
        if (respA.notes) {
          entityANotes.current = respA.notes;
          setNotesA(respA.notes);
        }
        
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
          notes: respA.notes || '',
          image: imgForB 
        }, ...prev]);
        
        // Pace delay between calls
        await delay(paceDelay * 1000);
        if (abortRef.current) break;
        
        // Entity B's turn
        setCurrentTurn('B');
        await delay(500);
        
        const respB = await withRetry(() => 
          callProvider(providerB, systemB, entityBHistory.current, imgForB, entityBNotes.current)
        );
        // Validate and filter shapes
        let shapesB = Array.isArray(respB.shapes) ? respB.shapes.filter(s => 
          s && s.type && (s.cx != null || s.x1 != null)
        ) : [];
        // Fallback if no valid shapes
        if (shapesB.length === 0) {
          console.warn('Entity B returned no valid shapes:', respB);
          shapesB = [{ type: 'dot', cx: 200, cy: 200, r: 10 }];
        }
        
        // Update notes from response
        if (respB.notes) {
          entityBNotes.current = respB.notes;
          setNotesB(respB.notes);
        }
        
        entityBHistory.current.push({ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: imgForB }}, { type: 'text', text: 'Respond.' }] });
        entityBHistory.current.push({ role: 'assistant', content: JSON.stringify(respB) });
        
        imgForA = renderShapes(shapesB, 'B');
        setExchanges(prev => [{ 
          id: `${round}-B`, 
          entity: 'B', 
          round: round + 1, 
          shapes: shapesB, 
          intent: respB.intent || '', 
          notes: respB.notes || '',
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
  }, [callProvider, renderShapes, totalRounds, providerA, providerB, paceDelay, withRetry, systemA, systemB]);

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
        
        {/* Intro / Landing */}
        {phase === 'intro' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: '40px 20px' }}>
            <div style={{ maxWidth: 640, width: '100%' }}>
              
              {/* Hero Section */}
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <pre style={{ 
                  fontFamily: 'monospace', 
                  fontSize: 11, 
                  lineHeight: 1.4, 
                  color: 'rgba(255,255,255,0.25)', 
                  marginBottom: 32,
                  letterSpacing: '0.05em'
                }}>
{`      ◯ ─────────── ◯
     A       ║       B
      │    glass    │
      │   barrier   │
      ▽             ▽
     ┌─┐           ┌─┐
     │●│  ←─────→  │◯│
     └─┘           └─┘`}
                </pre>
                
                <p style={{ 
                  color: 'rgba(255,255,255,0.5)', 
                  fontSize: 13, 
                  lineHeight: 1.8, 
                  maxWidth: 480, 
                  margin: '0 auto 16px',
                  fontWeight: 300
                }}>
                  Two AI entities on opposite sides of a glass barrier.<br/>
                  No language. Only geometric shapes on a 400×400 canvas.
                </p>
                <p style={{ 
                  color: 'rgba(255,255,255,0.3)', 
                  fontSize: 12, 
                  fontStyle: 'italic'
                }}>
                  What emerges when minds can only speak in circles and lines?
                </p>
              </div>

              {/* Configuration Card */}
              <div style={{ 
                background: 'rgba(255,255,255,0.02)', 
                border: '1px solid rgba(255,255,255,0.08)', 
                padding: 32,
                marginBottom: 24
              }}>
                
                {/* Entity Selection Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 28 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>ENTITY A</div>
                    <select
                      value={providerA}
                      onChange={e => setProviderA(e.target.value)}
                      style={{
                        width: 130,
                        height: 38,
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
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Gemini</option>
                      <option value="anthropic">Claude</option>
                    </select>
                  </div>

                  <div style={{ 
                    fontSize: 18, 
                    color: 'rgba(255,255,255,0.15)', 
                    marginTop: 20,
                    fontFamily: 'monospace'
                  }}>⟷</div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>ENTITY B</div>
                    <select
                      value={providerB}
                      onChange={e => setProviderB(e.target.value)}
                      style={{
                        width: 130,
                        height: 38,
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
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Gemini</option>
                      <option value="anthropic">Claude</option>
                    </select>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 24 }} />
              
                {/* API Keys & Models */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
                  {/* OpenAI Config */}
                  {(providerA === 'openai' || providerB === 'openai') && (
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: providers.openai.color.text, marginBottom: 8 }}>
                          OPENAI KEY
                        </div>
                        <input
                          type="password"
                          value={openAIKey}
                          onChange={e => setOpenAIKey(e.target.value)}
                          placeholder="sk-..."
                          style={{
                            width: 220,
                            height: 38,
                            fontSize: 11,
                            padding: '0 12px',
                            background: 'rgba(0,0,0,0.3)',
                            border: `1px solid ${openAIKey ? providers.openai.color.dim : 'rgba(255,255,255,0.1)'}`,
                            color: '#fff',
                            outline: 'none',
                            fontFamily: 'inherit'
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: providers.openai.color.text, marginBottom: 8 }}>
                          MODEL {loadingModels.openai && <span style={{ opacity: 0.5 }}>...</span>}
                        </div>
                        <select
                          value={openAIModel}
                          onChange={e => setOpenAIModel(e.target.value)}
                          style={{
                            width: 180,
                            height: 38,
                            fontSize: 10,
                            padding: '0 10px',
                            background: '#0a0a0a',
                            border: `1px solid ${providers.openai.color.dim}`,
                            color: providers.openai.color.primary,
                            outline: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}
                        >
                          {openAIModels.length > 0 ? (
                            openAIModels.map(m => <option key={m} value={m}>{m}</option>)
                          ) : (
                            <>
                              <option value="gpt-4o">gpt-4o</option>
                              <option value="gpt-4o-mini">gpt-4o-mini</option>
                              <option value="gpt-4-turbo">gpt-4-turbo</option>
                              <option value="o1">o1</option>
                              <option value="o1-mini">o1-mini</option>
                            </>
                          )}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Gemini Config */}
                  {(providerA === 'gemini' || providerB === 'gemini') && (
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: providers.gemini.color.text, marginBottom: 8 }}>
                          GEMINI KEY
                        </div>
                        <input
                          type="password"
                          value={geminiKey}
                          onChange={e => setGeminiKey(e.target.value)}
                          placeholder="AIza..."
                          style={{
                            width: 220,
                            height: 38,
                            fontSize: 11,
                            padding: '0 12px',
                            background: 'rgba(0,0,0,0.3)',
                            border: `1px solid ${geminiKey ? providers.gemini.color.dim : 'rgba(255,255,255,0.1)'}`,
                            color: '#fff',
                            outline: 'none',
                            fontFamily: 'inherit'
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: providers.gemini.color.text, marginBottom: 8 }}>
                          MODEL {loadingModels.gemini && <span style={{ opacity: 0.5 }}>...</span>}
                        </div>
                        <select
                          value={geminiModel}
                          onChange={e => setGeminiModel(e.target.value)}
                          style={{
                            width: 180,
                            height: 38,
                            fontSize: 10,
                            padding: '0 10px',
                            background: '#0a0a0a',
                            border: `1px solid ${providers.gemini.color.dim}`,
                            color: providers.gemini.color.primary,
                            outline: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}
                        >
                          {geminiModels.length > 0 ? (
                            geminiModels.map(m => <option key={m} value={m}>{m}</option>)
                          ) : (
                            <>
                              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                              <option value="gemini-2.0-flash-thinking-exp-01-21">gemini-2.0-flash-thinking</option>
                              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                              <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                            </>
                          )}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Anthropic/Claude Config */}
                  {(providerA === 'anthropic' || providerB === 'anthropic') && (
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: providers.anthropic.color.text, marginBottom: 8 }}>
                          ANTHROPIC KEY
                        </div>
                        <input
                          type="password"
                          value={anthropicKey}
                          onChange={e => setAnthropicKey(e.target.value)}
                          placeholder="sk-ant-..."
                          style={{
                            width: 220,
                            height: 38,
                            fontSize: 11,
                            padding: '0 12px',
                            background: 'rgba(0,0,0,0.3)',
                            border: `1px solid ${anthropicKey ? providers.anthropic.color.dim : 'rgba(255,255,255,0.1)'}`,
                            color: '#fff',
                            outline: 'none',
                            fontFamily: 'inherit'
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: providers.anthropic.color.text, marginBottom: 8 }}>
                          MODEL
                        </div>
                        <select
                          value={claudeModel}
                          onChange={e => setClaudeModel(e.target.value)}
                          style={{
                            width: 180,
                            height: 38,
                            fontSize: 10,
                            padding: '0 10px',
                            background: '#0a0a0a',
                            border: `1px solid ${providers.anthropic.color.dim}`,
                            color: providers.anthropic.color.primary,
                            outline: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}
                        >
                          <option value="claude-sonnet-4-20250514">claude-sonnet-4</option>
                          <option value="claude-opus-4-20250514">claude-opus-4</option>
                          <option value="claude-3-5-sonnet-20241022">claude-3.5-sonnet</option>
                          <option value="claude-3-5-haiku-20241022">claude-3.5-haiku</option>
                          <option value="claude-3-opus-20240229">claude-3-opus</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Rounds & Pace Row */}
                <div style={{ display: 'flex', gap: 40, justifyContent: 'center', alignItems: 'flex-end' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>ROUNDS</div>
                    <input
                      type="number"
                      min="1"
                      max="299"
                      value={totalRounds}
                      onChange={e => setTotalRounds(Math.max(1, Math.min(299, parseInt(e.target.value) || 1)))}
                      style={{
                        width: 70,
                        height: 38,
                        fontSize: 14,
                        textAlign: 'center',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        outline: 'none',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>PACE (SEC)</div>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={paceDelay}
                      onChange={e => setPaceDelay(Math.max(1, Math.min(30, parseInt(e.target.value) || 3)))}
                      style={{
                        width: 70,
                        height: 38,
                        fontSize: 14,
                        textAlign: 'center',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        outline: 'none',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* System Prompts Collapsible */}
              <div style={{ marginBottom: 28 }}>
                <button
                  onClick={() => setShowPrompts(!showPrompts)}
                  style={{
                    fontSize: 9,
                    letterSpacing: '0.15em',
                    color: 'rgba(255,255,255,0.35)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: '8px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <span style={{ fontSize: 8 }}>{showPrompts ? '▼' : '▶'}</span> CUSTOMIZE SYSTEM PROMPTS
                </button>
                
                {showPrompts && (
                  <div style={{ 
                    marginTop: 16, 
                    padding: 20, 
                    background: 'rgba(255,255,255,0.02)', 
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 16 
                  }}>
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: '0.15em', color: providers[providerA].color.text, marginBottom: 8 }}>
                        ENTITY A ({providers[providerA].name.toUpperCase()})
                      </div>
                      <textarea
                        value={systemA}
                        onChange={e => setSystemA(e.target.value)}
                        style={{
                          width: '100%',
                          height: 140,
                          fontSize: 10,
                          lineHeight: 1.5,
                          padding: 12,
                          background: 'rgba(0,0,0,0.3)',
                          border: `1px solid ${providers[providerA].color.dim}`,
                          color: 'rgba(255,255,255,0.7)',
                          outline: 'none',
                          fontFamily: 'inherit',
                          resize: 'vertical'
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: '0.15em', color: providers[providerB].color.text, marginBottom: 8 }}>
                        ENTITY B ({providers[providerB].name.toUpperCase()})
                      </div>
                      <textarea
                        value={systemB}
                        onChange={e => setSystemB(e.target.value)}
                        style={{
                          width: '100%',
                          height: 140,
                          fontSize: 10,
                          lineHeight: 1.5,
                          padding: 12,
                          background: 'rgba(0,0,0,0.3)',
                          border: `1px solid ${providers[providerB].color.dim}`,
                          color: 'rgba(255,255,255,0.7)',
                          outline: 'none',
                          fontFamily: 'inherit',
                          resize: 'vertical'
                        }}
                      />
                    </div>
                    <button
                      onClick={() => { setSystemA(DEFAULT_SYSTEM); setSystemB(DEFAULT_SYSTEM); }}
                      style={{
                        fontSize: 9,
                        letterSpacing: '0.1em',
                        color: 'rgba(255,255,255,0.3)',
                        background: 'none',
                        border: '1px solid rgba(255,255,255,0.08)',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        alignSelf: 'flex-start'
                      }}
                    >
                      RESET TO DEFAULT
                    </button>
                  </div>
                )}
              </div>

              {/* CTA */}
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={run}
                  disabled={!canStart()}
                  style={{ 
                    fontSize: 11, 
                    letterSpacing: '0.3em', 
                    border: canStart() ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.1)', 
                    background: canStart() ? 'rgba(255,255,255,0.06)' : 'transparent', 
                    color: canStart() ? '#fff' : 'rgba(255,255,255,0.25)', 
                    padding: '16px 40px', 
                    cursor: canStart() ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                    transition: 'all 0.2s'
                  }}
                >
                  INITIATE CONTACT
                </button>

                {!canStart() && (
                  <p style={{ fontSize: 10, color: 'rgba(255,120,120,0.6)', marginTop: 14 }}>
                    Enter required API key(s) to begin
                  </p>
                )}
              </div>

              {/* Warning */}
              <div style={{ 
                marginTop: 32,
                padding: '16px 20px',
                background: 'rgba(255,180,0,0.06)',
                border: '1px solid rgba(255,180,0,0.15)',
                textAlign: 'left'
              }}>
                <div style={{ 
                  fontSize: 9, 
                  letterSpacing: '0.15em', 
                  color: 'rgba(255,180,0,0.8)', 
                  marginBottom: 8,
                  fontWeight: 500
                }}>
                  ⚠ HEADS UP
                </div>
                <p style={{ 
                  fontSize: 11, 
                  lineHeight: 1.6, 
                  color: 'rgba(255,255,255,0.5)',
                  margin: 0
                }}>
                  Your API keys stay in your browser—never sent anywhere except the providers.
                  This is a proof of concept. Vision API calls add up fast. Set spending limits on your accounts.
                  For heavy use, clone the repo and run locally.
                </p>
              </div>

              {/* Footer */}
              <div style={{ 
                marginTop: 32, 
                paddingTop: 24, 
                borderTop: '1px solid rgba(255,255,255,0.05)', 
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 24,
                flexWrap: 'wrap'
              }}>
                <a 
                  href="https://github.com/moldandyeast/first-contact-v0" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    fontSize: 10, 
                    letterSpacing: '0.1em', 
                    color: 'rgba(255,255,255,0.35)', 
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6 }}>
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  GITHUB
                </a>
                <a 
                  href="https://moldandyeast-2026.pages.dev/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    fontSize: 10, 
                    letterSpacing: '0.1em', 
                    color: 'rgba(255,255,255,0.35)', 
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.6 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  MOLD&YEAST
                </a>
                <a 
                  href="https://twitter.com/nilsedison" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    fontSize: 10, 
                    letterSpacing: '0.1em', 
                    color: 'rgba(255,255,255,0.35)', 
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6 }}>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  @NILSEDISON
                </a>
                <a 
                  href="https://www.youtube.com/watch?v=wfLXOdrXR14" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    fontSize: 10, 
                    letterSpacing: '0.1em', 
                    color: 'rgba(255,255,255,0.35)', 
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6 }}>
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  DEMO VIDEO
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Contact View */}
        {(phase === 'contact' || phase === 'complete') && (
          <>
            {/* Canvases */}
            <div style={{ width: '25%', minWidth: 220, display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
              
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

            {/* Research Notepads */}
            <div style={{ width: '30%', minWidth: 280, borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' }}>
              
              {/* Entity A Notepad */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 0 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.25em', color: colorsA.text, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: colorsA.primary }} />
                  {getProviderName('A').toUpperCase()} NOTEPAD
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                  {notesA ? (
                    <pre style={{ 
                      fontSize: 10, 
                      color: 'rgba(255,255,255,0.6)', 
                      lineHeight: 1.6, 
                      margin: 0, 
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'inherit'
                    }}>{notesA}</pre>
                  ) : (
                    <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.12)' }}>NO OBSERVATIONS YET</span>
                  )}
                </div>
              </div>

              {/* Entity B Notepad */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.25em', color: colorsB.text, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: colorsB.primary }} />
                  {getProviderName('B').toUpperCase()} NOTEPAD
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                  {notesB ? (
                    <pre style={{ 
                      fontSize: 10, 
                      color: 'rgba(255,255,255,0.6)', 
                      lineHeight: 1.6, 
                      margin: 0, 
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'inherit'
                    }}>{notesB}</pre>
                  ) : (
                    <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.12)' }}>NO OBSERVATIONS YET</span>
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
                        {ex.notes && (
                          <div>
                            <span style={{ fontSize: 8, color: exColors.text, letterSpacing: '0.1em' }}>RESEARCH NOTEPAD </span>
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, margin: '2px 0 0 0', whiteSpace: 'pre-wrap' }}>{ex.notes}</p>
                          </div>
                        )}
                        {!ex.intent && !ex.notes && (
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
