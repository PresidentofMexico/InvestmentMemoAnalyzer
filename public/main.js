// ========== Simple MVP UI Logic ==========
document.addEventListener("DOMContentLoaded", function() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div>
      <h2>Upload or Paste Investment Memo</h2>
      <span class="status-badge status-ready" id="inputStatus">Ready</span>
      <textarea id="memoText" placeholder="Paste your investment memo here..."></textarea>
      <br>
      <button id="analyzeBtn">Analyze Memo</button>
      <span class="status-badge status-ready" id="outputStatus">Awaiting Input</span>
      <div id="output" style="margin-top:24px"></div>
    </div>
  `;

  document.getElementById("analyzeBtn").onclick = analyzeMemo;
});

function analyzeMemo() {
  const memoText = document.getElementById('memoText').value.trim();
  const inputStatus = document.getElementById('inputStatus');
  const outputStatus = document.getElementById('outputStatus');
  const output = document.getElementById('output');

  if (!memoText) {
    alert('Please paste memo text.');
    return;
  }

  inputStatus.textContent = 'Processing...';
  inputStatus.className = 'status-badge status-processing';
  outputStatus.textContent = 'Analyzing...';
  outputStatus.className = 'status-badge status-processing';
  output.innerHTML = '';

  // Demo: Simulate analysis (replace with real API call later!)
  setTimeout(() => {
    // Fake output for MVP
    output.innerHTML = `
      <div class="info-message">
        <b>Analysis complete!</b><br><br>
        <i>Stub: In production, this will show your investment memo summary, analysis, and audio script.</i>
        <br><br>
        <b>Executive Summary:</b> ...<br>
        <b>Financial Analysis:</b> ...<br>
        <b>Risks & Opportunities:</b> ...<br>
        <b>Audio Script:</b> ...<br>
      </div>
    `;
    inputStatus.textContent = 'Ready';
    inputStatus.className = 'status-badge status-ready';
    outputStatus.textContent = 'Analysis Complete';
    outputStatus.className = 'status-badge status-complete';
  }, 1500);
}