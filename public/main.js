document.addEventListener("DOMContentLoaded", function() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div>
      <h2>Upload PDF or Paste Investment Memo</h2>
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
    </div>
  `;

  document.getElementById("analyzeBtn").onclick = analyzeMemo;
  document.getElementById("fileUploadBtn").onclick = () => document.getElementById("fileInput").click();
  document.getElementById("fileInput").onchange = handleFileUpload;

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

function handleFileUpload() {
  const input = document.getElementById('fileInput');
  const file = input.files[0];
  if (!file) return;

  document.getElementById('fileNameDisplay').textContent = file.name;
  const inputStatus = document.getElementById('inputStatus');

  if (file.name.endsWith('.txt')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('memoText').value = e.target.result;
      inputStatus.textContent = 'Text file loaded';
    };
    reader.readAsText(file);
  } else if (file.name.endsWith('.pdf')) {
    inputStatus.textContent = 'Reading PDF...';
    readPdfAsText(file)
      .then(text => {
        document.getElementById('memoText').value = text;
        inputStatus.textContent = 'PDF loaded';
      })
      .catch(err => {
        inputStatus.textContent = 'PDF read failed';
        alert('Failed to read PDF: ' + err.message);
      });
  } else {
    inputStatus.textContent = 'Unsupported file type';
    alert('Unsupported file type. Please use TXT or PDF.');
  }
}

function readPdfAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
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
          text += content.items.map(item => item.str).join(' ') + '\n';
        }
        resolve(text);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ---- AI ANALYSIS: Replace the URL below with your real backend endpoint ----
async function analyzeMemo() {
  const memoText = document.getElementById('memoText').value.trim();
  const inputStatus = document.getElementById('inputStatus');
  const outputStatus = document.getElementById('outputStatus');
  const output = document.getElementById('output');

  if (!memoText) {
    alert('Please paste memo text or upload a file.');
    return;
  }

  inputStatus.textContent = 'Processing...';
  inputStatus.className = 'status-badge status-processing';
  outputStatus.textContent = 'Analyzing...';
  outputStatus.className = 'status-badge status-processing';
  output.innerHTML = '';

  try {
    // Replace this URL with your backend endpoint!
    const response = await fetch('https://investmentmemoanalyzer.onrender.com', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ memo: memoText })
    });

    if (!response.ok) throw new Error('AI backend error: ' + response.status);

    const result = await response.json();

    output.innerHTML = `
      <div class="info-message">
        <b>Analysis complete!</b><br><br>
        <b>Executive Summary:</b> <br>${result.executive_summary || 'N/A'}<br><br>
        <b>Financial Analysis:</b> <br>${result.financial_analysis || 'N/A'}<br><br>
        <b>Risks & Opportunities:</b> <br>${result.risks_opportunities || 'N/A'}<br><br>
        <b>Audio Script:</b> <br>${result.audio_script || 'N/A'}<br>
      </div>
    `;
    inputStatus.textContent = 'Ready';
    inputStatus.className = 'status-badge status-ready';
    outputStatus.textContent = 'Analysis Complete';
    outputStatus.className = 'status-badge status-complete';
  } catch (err) {
    output.innerHTML = `<div class="info-message" style="color:red;">Error: ${err.message}</div>`;
    inputStatus.textContent = 'Ready';
    inputStatus.className = 'status-badge status-ready';
    outputStatus.textContent = 'Error';
    outputStatus.className = 'status-badge status-ready';
  }
}