document.addEventListener("DOMContentLoaded", function() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div>
      <h2>Upload PDF or Paste Investment Memo</h2>
      <div style="margin: 8px 0 12px 0;">
        <span class="status-badge status-processing" id="apiStatus">Detecting API…</span>
      </div>
      <span class="status-badge status-ready" id="inputStatus">Ready</span>
      <div id="fileUploadArea" style="margin: 16px 0;">
        <input type="file" id="fileInput" accept=".txt,.pdf" style="display:none" />
        <button id="fileUploadBtn">Upload PDF or TXT</button>
        <span id="fileNameDisplay" style="margin-left:8px;color:#666"></span>
      </div>
      <textarea id="memoText" placeholder="Paste your investment memo here..."></textarea>
      <br>
      <button id="analyzeBtn">Analyze Memo</button>
      <span class="status-badge status-ready" id="outputStatus">Awaiting Input</span>
      <div id="output" style="margin-top:24px"></div>
      <div id="exportSection" style="margin-top:16px; display:none;">
        <button id="exportBtn">Export Summary</button>
        <button id="generateAudioBtn">Generate Audio</button>
        <button id="playBrowserTTSBtn" title="Play with your browser's built-in voice">Play In Browser</button>
        <button id="recordBrowserTTSBtn" title="Record tab audio to file (WebM)">Record Speech</button>
        <div style="margin-top:8px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          <label>Voice: <select id="voiceSelect"></select></label>
          <label>Rate: <input id="rateRange" type="range" min="0.7" max="1.3" step="0.05" value="1"/> <span id="rateLabel">1.00x</span></label>
        </div>
        <audio id="audioPlayer" controls style="display:none; margin-left:8px;"></audio>
      </div>
    </div>
  `;

  // Kick off API base detection in the background then refresh status pill
  detectApiBase().then(refreshApiStatus).catch(refreshApiStatus);

  document.getElementById("analyzeBtn").onclick = analyzeMemo;
  document.getElementById("fileUploadBtn").onclick = () => document.getElementById("fileInput").click();
  document.getElementById("fileInput").onchange = handleFileUpload;
  document.getElementById("exportBtn").onclick = exportSummary;
  document.getElementById("generateAudioBtn").onclick = generateAudio;
  document.getElementById("playBrowserTTSBtn").onclick = playBrowserTTS;
  document.getElementById("recordBrowserTTSBtn").onclick = recordBrowserTTS;
  const rateRange = document.getElementById('rateRange');
  const rateLabel = document.getElementById('rateLabel');
  if (rateRange) {
    rateRange.addEventListener('input', () => {
      rateLabel.textContent = Number(rateRange.value).toFixed(2) + 'x';
    });
  }
  // Populate voices if available
  if ('speechSynthesis' in window) {
    const populateVoices = () => {
      const sel = document.getElementById('voiceSelect');
      if (!sel) return;
      sel.innerHTML = '';
      const vs = window.speechSynthesis.getVoices();
      vs.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        sel.appendChild(opt);
      });
      // Choose an en-US by default
      const idx = Array.from(sel.options).findIndex(o => /en-US/i.test(o.textContent));
      if (idx >= 0) sel.selectedIndex = idx;
    };
    window.speechSynthesis.addEventListener('voiceschanged', populateVoices);
    // Try populate immediately
    setTimeout(populateVoices, 200);
  }

  // Drag & drop support
  const uploadArea = document.getElementById("fileUploadArea");
  uploadArea.ondragover = (e) => {
    e.preventDefault();
    uploadArea.style.background = "#eaf0fa";
  };
  uploadArea.ondragleave = () => {
    uploadArea.style.background = "";
  };
  uploadArea.ondrop = (e) => {
    e.preventDefault();
    uploadArea.style.background = "";
    if (e.dataTransfer.files.length) {
      document.getElementById("fileInput").files = e.dataTransfer.files;
      handleFileUpload();
    }
  };
});

let currentAnalysisResult = null;

let API_BASE = '';

function getApiUrl(path) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

async function detectApiBase() {
  // 0) Explicit override via config.js
  if (typeof window !== 'undefined' && window.API_BASE_URL) {
    API_BASE = window.API_BASE_URL;
    return;
  }
  // Try same-origin first
  try {
    const r = await fetch('/status', { method: 'GET' });
    if (r.ok) {
      API_BASE = '';
      return;
    }
  } catch (_) {}
  // Fallback to localhost:3001
  try {
    const r2 = await fetch('http://localhost:3001/status', { method: 'GET' });
    if (r2.ok) {
      API_BASE = 'http://localhost:3001';
      return;
    }
  } catch (_) {}
  // Last resort: keep same-origin; requests may fail if server not running
  API_BASE = '';
}

async function refreshApiStatus() {
  const el = document.getElementById('apiStatus');
  if (!el) return;
  el.textContent = 'Checking…';
  el.className = 'status-badge status-processing';
  try {
    const r = await fetch(getApiUrl('/status'), { method: 'GET' });
    if (!r.ok) throw new Error('Status not OK');
    const data = await r.json();
    const mode = data && data.mode ? data.mode : 'unknown';
    if (mode === 'openai') {
      el.textContent = `API: OpenAI (${(data.openai && data.openai.model) || 'model?'})`;
      el.className = 'status-badge status-complete';
    } else if (mode === 'groq') {
      el.textContent = `API: Groq (${(data.groq && data.groq.model) || 'model?'})`;
      el.className = 'status-badge status-complete';
    } else if (mode === 'anthropic') {
      el.textContent = `API: Anthropic (${(data.anthropic && data.anthropic.model) || 'model?'})`;
      el.className = 'status-badge status-complete';
    } else if (mode === 'xai') {
      el.textContent = `API: xAI Grok (${(data.xai && data.xai.model) || 'model?'})`;
      el.className = 'status-badge status-complete';
    } else if (mode === 'mock') {
      el.textContent = 'API: Mock mode';
      el.className = 'status-badge status-ready';
    } else {
      el.textContent = 'API: Unknown mode';
      el.className = 'status-badge status-error';
    }
  } catch (e) {
    el.textContent = 'API: Unreachable';
    el.className = 'status-badge status-error';
  }
}

function handleFileUpload() {
  const input = document.getElementById('fileInput');
  const file = input.files[0];
  if (!file) return;

  document.getElementById('fileNameDisplay').textContent = file.name;
  const inputStatus = document.getElementById('inputStatus');
  
  inputStatus.textContent = 'Processing file...';
  inputStatus.className = 'status-badge status-processing';

  // Fire-and-forget upload to server to complete the "file uploaded" step
  // This does not block local parsing; it enables server-side logging/auditing.
  try {
    const fd = new FormData();
    fd.append('file', file);
    fetch(getApiUrl('/upload'), { method: 'POST', body: fd })
      .then(r => r.json())
      .then(data => {
        const nameEl = document.getElementById('fileNameDisplay');
        if (data && data.success) {
          nameEl.textContent = `${file.name} (uploaded)`;
        }
      })
      .catch(() => {/* non-fatal for UX; local parsing continues */});
  } catch (_) { /* ignore */ }

  if (file.name.endsWith('.txt')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('memoText').value = e.target.result;
      inputStatus.textContent = 'Text file loaded';
      inputStatus.className = 'status-badge status-complete';
    };
    reader.onerror = () => {
      inputStatus.textContent = 'File read error';
      inputStatus.className = 'status-badge status-error';
    };
    reader.readAsText(file);
  } else if (file.name.endsWith('.pdf')) {
    inputStatus.textContent = 'Reading PDF...';
    readPdfAsText(file)
      .then(text => {
        document.getElementById('memoText').value = text;
        inputStatus.textContent = 'PDF loaded';
        inputStatus.className = 'status-badge status-complete';
      })
      .catch(err => {
        console.error('PDF read error:', err);
        inputStatus.textContent = 'PDF read failed';
        inputStatus.className = 'status-badge status-error';
        alert('Failed to read PDF: ' + err.message);
      });
  } else {
    inputStatus.textContent = 'Unsupported file type';
    inputStatus.className = 'status-badge status-error';
    alert('Unsupported file type. Please use TXT or PDF.');
  }
}

function readPdfAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        // Check if PDF.js is loaded
        if (!window.pdfjsLib) {
          reject(new Error("PDF.js library not loaded"));
          return;
        }
        
        const typedarray = new Uint8Array(e.target.result);
        const pdf = await window.pdfjsLib.getDocument({data: typedarray}).promise;
        let text = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(' ');
          text += pageText + '\n\n';
        }
        
        if (!text.trim()) {
          reject(new Error("No text found in PDF"));
          return;
        }
        
        resolve(text);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

async function analyzeMemo() {
  const memoText = document.getElementById('memoText').value.trim();
  const inputStatus = document.getElementById('inputStatus');
  const outputStatus = document.getElementById('outputStatus');
  const output = document.getElementById('output');
  const exportSection = document.getElementById('exportSection');

  if (!memoText) {
    alert('Please paste memo text or upload a file.');
    return;
  }

  inputStatus.textContent = 'Processing...';
  inputStatus.className = 'status-badge status-processing';
  outputStatus.textContent = 'Analyzing...';
  outputStatus.className = 'status-badge status-processing';
  output.innerHTML = '<div class="loading">Analyzing memo...</div>';
  exportSection.style.display = 'none';

  try {
    // Use chunked analysis for large inputs
    const CHUNK_TRIGGER = 12000; // characters
    if (memoText.length > CHUNK_TRIGGER) {
      await analyzeMemoChunked(memoText, output, inputStatus, outputStatus, exportSection);
      return;
    }

    const result = await analyzeSingle(memoText);

    currentAnalysisResult = result;
    renderAnalysisResult(result, output);

    inputStatus.textContent = 'Ready';
    inputStatus.className = 'status-badge status-ready';
    outputStatus.textContent = 'Analysis Complete';
    outputStatus.className = 'status-badge status-complete';
    exportSection.style.display = 'block';
  } catch (err) {
    console.error('Analysis error:', err);
    output.innerHTML = `<div class="error-message">Error: ${err.message}</div>`;
    inputStatus.textContent = 'Ready';
    inputStatus.className = 'status-badge status-ready';
    outputStatus.textContent = 'Error';
    outputStatus.className = 'status-badge status-error';
    exportSection.style.display = 'none';
  }
}

function renderAnalysisResult(result, outputEl) {
  const fmt = (v) => {
    if (v == null) return 'N/A';
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch { return String(v); }
  };
  outputEl.innerHTML = `
    <div class="analysis-result">
      <h3>Analysis Complete!</h3>
      <div class="section">
        <h4>Executive Summary</h4>
        <p>${fmt(result.executive_summary)}</p>
      </div>
      <div class="section">
        <h4>Financial Analysis</h4>
        <p>${fmt(result.financial_analysis)}</p>
      </div>
      <div class="section">
        <h4>Risks & Opportunities</h4>
        <p>${fmt(result.risks_opportunities)}</p>
      </div>
      <div class="section">
        <h4>Audio Script</h4>
        <p>${fmt(result.audio_script)}</p>
      </div>
    </div>
  `;
}

async function analyzeSingle(text) {
  const response = await fetch(getApiUrl('/analyze'), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ memo: text })
  });
  if (!response.ok) {
    try {
      const errJson = await response.json();
      const detail = errJson && (errJson.detail || errJson.error || JSON.stringify(errJson));
      throw new Error(`Analysis failed: ${response.status} ${response.statusText}${detail ? ' - ' + detail : ''}`);
    } catch (_) {
      throw new Error(`Analysis failed: ${response.status} ${response.statusText}`);
    }
  }
  const json = await response.json();
  if (json && json.error) throw new Error(json.error);
  return json;
}

function chunkText(text, targetSize = 8000, maxSize = 10000) {
  const paras = text.split(/\n\s*\n/);
  const chunks = [];
  let buf = '';
  for (const p of paras) {
    // If a single paragraph is huge, hard-split it
    if (p.length > maxSize) {
      // flush current
      if (buf) {
        chunks.push(buf);
        buf = '';
      }
      for (let i = 0; i < p.length; i += maxSize) {
        chunks.push(p.slice(i, i + maxSize));
      }
      continue;
    }
    if ((buf + (buf ? '\n\n' : '') + p).length > targetSize) {
      if (buf) chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function analyzeMemoChunked(fullText, output, inputStatus, outputStatus, exportSection) {
  const chunks = chunkText(fullText);
  const total = chunks.length;
  if (total === 0) throw new Error('No content to analyze');

  output.innerHTML = `<div class="loading">Analyzing memo in ${total} chunks...</div>`;
  outputStatus.textContent = `Analyzing 1/${total}...`;
  outputStatus.className = 'status-badge status-processing';

  const partials = [];
  for (let i = 0; i < total; i++) {
    inputStatus.textContent = `Processing chunk ${i + 1}/${total}...`;
    try {
      const part = await analyzeSingle(chunks[i]);
      partials.push(part);
      outputStatus.textContent = `Analyzing ${Math.min(i + 2, total)}/${total}...`;
    } catch (e) {
      throw new Error(`Chunk ${i + 1}/${total} failed: ${e.message}`);
    }
  }

  // Merge partial results locally
  const merged = mergePartials(partials);
  // Final refine pass
  outputStatus.textContent = 'Refining final summary...';
  output.innerHTML = '<div class="loading">Refining final summary...</div>';
  const refined = await refineMergedResult(merged);

  currentAnalysisResult = refined;
  renderAnalysisResult(refined, output);

  inputStatus.textContent = 'Ready';
  inputStatus.className = 'status-badge status-ready';
  outputStatus.textContent = 'Analysis Complete';
  outputStatus.className = 'status-badge status-complete';
  exportSection.style.display = 'block';
}

function mergePartials(parts) {
  const joiner = (arr) => arr.filter(Boolean).join('\n\n');
  return {
    executive_summary: joiner(parts.map(p => p.executive_summary)),
    financial_analysis: joiner(parts.map(p => p.financial_analysis)),
    risks_opportunities: joiner(parts.map(p => p.risks_opportunities)),
    audio_script: joiner(parts.map(p => p.audio_script))
  };
}

function truncateFields(obj, maxLen = 8000) {
  const t = (s) => (s && s.length > maxLen ? s.slice(0, maxLen) + '\n...[truncated]...' : (s || ''));
  return {
    executive_summary: t(obj.executive_summary),
    financial_analysis: t(obj.financial_analysis),
    risks_opportunities: t(obj.risks_opportunities),
    audio_script: t(obj.audio_script)
  };
}

async function refineMergedResult(merged) {
  const m = truncateFields(merged);
  const refinePrompt = `You are refining a multi-part investment memo analysis that was generated in chunks. 
Please consolidate, deduplicate, and polish the content into a single coherent deliverable with these fields:
- executive_summary (2-4 sentences, crisp and decision-oriented)
- financial_analysis (key numbers, growth, profitability, unit economics, notable risks)
- risks_opportunities (concise bullet points, highest-signal items first)
- audio_script (60-90 seconds, natural spoken style, avoid repetition)

Preserve concrete numbers and materially important caveats. Prefer clarity over verbosity.
Return only valid JSON with exactly these keys: executive_summary, financial_analysis, risks_opportunities, audio_script.

Preliminary combined content:
Executive Summary:\n${m.executive_summary}

Financial Analysis:\n${m.financial_analysis}

Risks & Opportunities:\n${m.risks_opportunities}

Audio Script:\n${m.audio_script}
`;
  const result = await analyzeSingle(refinePrompt);
  return result;
}

async function exportSummary() {
  if (!currentAnalysisResult) {
    alert('No analysis result to export');
    return;
  }

  // Query server status to embed provider + model info
  let provider = 'unknown';
  let model = null;
  try {
    const r = await fetch(getApiUrl('/status'));
    if (r.ok) {
      const s = await r.json();
      provider = s && s.mode ? s.mode : 'unknown';
      if (provider === 'openai' && s.openai) model = s.openai.model;
      if (provider === 'groq' && s.groq) model = s.groq.model;
      if (provider === 'anthropic' && s.anthropic) model = s.anthropic.model;
      if (provider === 'xai' && s.xai) model = s.xai.model;
    }
  } catch (_) { /* ignore status fetch failures */ }

  const exportData = {
    timestamp: new Date().toISOString(),
    provider,
    model,
    executive_summary: currentAnalysisResult.executive_summary,
    financial_analysis: currentAnalysisResult.financial_analysis,
    risks_opportunities: currentAnalysisResult.risks_opportunities,
    audio_script: currentAnalysisResult.audio_script
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], {type: 'application/json'});
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `investment_analysis_${new Date().toISOString().slice(0,10)}.json`;
  link.click();
  
  URL.revokeObjectURL(link.href);
}

async function generateAudio() {
  if (!currentAnalysisResult || !currentAnalysisResult.audio_script) {
    alert('No audio script available');
    return;
  }

  const generateBtn = document.getElementById('generateAudioBtn');
  const audioPlayer = document.getElementById('audioPlayer');
  
  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating Audio...';

  try {
    const response = await fetch(getApiUrl('/generate-audio'), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ text: currentAnalysisResult.audio_script })
    });

    if (!response.ok) {
      throw new Error(`Audio generation failed: ${response.status}`);
    }

    const result = await response.json();
    const url = result.audioUrl || (result.segments && result.segments[0]);
    if (url) {
      audioPlayer.src = url;
      audioPlayer.style.display = 'inline-block';
      audioPlayer.load();
    }
    
  } catch (err) {
    console.error('Audio generation error:', err);
    alert('Audio generation failed: ' + err.message);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate Audio';
  }
}

// -------- Browser TTS (fallback) --------
let currentUtterances = [];
let voicesCache = [];

function getVoicesCached() {
  if (voicesCache.length) return voicesCache;
  voicesCache = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  return voicesCache;
}

function chooseVoice(langPref = 'en-US') {
  const voices = getVoicesCached();
  if (!voices || !voices.length) return null;
  const sel = document.getElementById('voiceSelect');
  if (sel && sel.value) {
    const chosen = voices.find(v => v.name === sel.value);
    if (chosen) return chosen;
  }
  // Prefer exact lang, otherwise first voice
  return voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langPref.toLowerCase())) || voices[0];
}

function splitIntoSpeakable(text, maxLen = 4000) {
  const sents = String(text).split(/(?<=[\.\!\?])\s+/);
  const out = [];
  let buf = '';
  for (const s of sents) {
    if (!s) continue;
    if ((buf + (buf ? ' ' : '') + s).length > maxLen) {
      if (buf) out.push(buf);
      if (s.length > maxLen) {
        for (let i = 0; i < s.length; i += maxLen) out.push(s.slice(i, i + maxLen));
        buf = '';
      } else {
        buf = s;
      }
    } else {
      buf = buf ? buf + ' ' + s : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

async function playBrowserTTS() {
  if (!('speechSynthesis' in window)) {
    alert('Browser TTS not supported here. Try Chrome/Edge.');
    return;
  }
  if (!currentAnalysisResult || !currentAnalysisResult.audio_script) {
    alert('No audio script available');
    return;
  }
  // Ensure voices are loaded
  if (speechSynthesis.getVoices().length === 0) {
    await new Promise(resolve => {
      const h = () => { speechSynthesis.removeEventListener('voiceschanged', h); resolve(); };
      speechSynthesis.addEventListener('voiceschanged', h);
      speechSynthesis.getVoices();
      setTimeout(resolve, 500);
    });
  }
  const voice = chooseVoice('en-US');
  const rate = parseFloat(document.getElementById('rateRange')?.value || '1');
  const chunks = splitIntoSpeakable(currentAnalysisResult.audio_script, 4000);
  // Cancel any ongoing
  speechSynthesis.cancel();
  currentUtterances = chunks.map((t) => {
    const u = new SpeechSynthesisUtterance(t);
    u.voice = voice; u.rate = rate; u.pitch = 1; u.volume = 1;
    return u;
  });
  for (const u of currentUtterances) speechSynthesis.speak(u);
}

// Record spoken audio by capturing the tab via getDisplayMedia.
// Note: User must select "This Tab" and enable "Share tab audio".
let recState = { recorder: null, chunks: [], stream: null };
async function recordBrowserTTS() {
  if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getDisplayMedia) {
    alert('Screen capture with audio not supported in this browser.');
    return;
  }
  if (!currentAnalysisResult || !currentAnalysisResult.audio_script) {
    alert('No audio script available');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recState = { recorder, chunks: [], stream };
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recState.chunks.push(e.data); };
    recorder.onstop = async () => {
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
      const blob = new Blob(recState.chunks, { type: 'audio/webm' });
      // Ask user whether to convert to MP3 on server
      const doConvert = confirm('Recording complete. Convert to MP3? Click Cancel to download WebM instead.');
      if (doConvert) {
        try {
          const fd = new FormData();
          fd.append('file', blob, `speech_${Date.now()}.webm`);
          const r = await fetch(getApiUrl('/convert-audio'), { method: 'POST', body: fd });
          if (!r.ok) throw new Error(`Convert failed: ${r.status}`);
          const j = await r.json();
          const a = document.createElement('a');
          a.href = j.audioUrl; a.download = j.filename || `speech_${Date.now()}.mp3`;
          document.body.appendChild(a); a.click(); a.remove();
        } catch (err) {
          console.error('Convert error:', err);
          alert('Convert error: ' + (err && err.message ? err.message : err));
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `memo_audio_${new Date().toISOString().slice(0,10)}.webm`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    };
    recorder.start();
    await playBrowserTTS();
    // Stop when last utterance ends
    const last = currentUtterances[currentUtterances.length - 1];
    await new Promise(resolve => { last.addEventListener('end', resolve, { once: true }); });
    recorder.stop();
  } catch (err) {
    console.error('Recording failed:', err);
    alert('Recording failed: ' + (err && err.message ? err.message : err));
  }
}
