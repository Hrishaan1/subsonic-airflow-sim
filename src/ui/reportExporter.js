export class ReportExporter {
  /**
   * Export comprehensive CFD aerodynamic simulation report
   * @param {import('../cfd/flowSolver.js').FlowSolver} flowSolver
   * @param {Object} modelAnalysis
   * @param {string} canvasDataUrl - screenshot of the 3D wind tunnel
   */
  static exportReport(flowSolver, modelAnalysis, canvasDataUrl = '') {
    const t = flowSolver.telemetry;
    const dateStr = new Date().toLocaleString();

    const reportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CFD Aerodynamic Test Report - ${modelAnalysis?.fileName || 'Model'}</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #131b2e;
      --border: #243354;
      --text: #e2e8f0;
      --cyan: #00f2fe;
      --green: #00ff88;
      --red: #ff3366;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 30px;
    }
    .header {
      border-bottom: 2px solid var(--cyan);
      padding-bottom: 15px;
      margin-bottom: 25px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      color: var(--cyan);
      letter-spacing: 1px;
    }
    .meta { font-size: 13px; color: #8fa0be; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 15px;
      margin-bottom: 25px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .card-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #7e93b8;
      margin-bottom: 6px;
    }
    .card-val {
      font-size: 22px;
      font-weight: 700;
      font-family: monospace;
      color: #fff;
    }
    .card-sub { font-size: 12px; color: #8fa0be; margin-top: 4px; }
    .screenshot {
      width: 100%;
      border-radius: 8px;
      border: 1px solid var(--border);
      margin-bottom: 25px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      background: var(--card);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    th {
      background: #17223b;
      color: #9cb3d9;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(0, 242, 254, 0.15);
      color: var(--cyan);
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>AERO-FLOW 3D AERODYNAMIC TEST REPORT</h1>
      <div class="meta">Subsonic Computational Fluid Dynamics (LBM D3Q19 / Navier-Stokes)</div>
    </div>
    <div class="meta">${dateStr}</div>
  </div>

  ${canvasDataUrl ? `<img src="${canvasDataUrl}" class="screenshot" alt="CFD Wind Tunnel Flow Visualization">` : ''}

  <div class="grid">
    <div class="card">
      <div class="card-title">Lift Force (FL)</div>
      <div class="card-val" style="color: var(--green);">${t.liftForce.toFixed(1)} N</div>
      <div class="card-sub">Coefficient CL: ${t.liftCoeff.toFixed(3)}</div>
    </div>
    <div class="card">
      <div class="card-title">Drag Force (FD)</div>
      <div class="card-val" style="color: var(--red);">${t.dragForce.toFixed(1)} N</div>
      <div class="card-sub">Coefficient CD: ${t.dragCoeff.toFixed(3)}</div>
    </div>
    <div class="card">
      <div class="card-title">Aerodynamic Efficiency (L/D)</div>
      <div class="card-val" style="color: var(--cyan);">${t.liftToDrag.toFixed(2)}</div>
      <div class="card-sub">Glide Ratio</div>
    </div>
    <div class="card">
      <div class="card-title">Flight Conditions</div>
      <div class="card-val">${flowSolver.airspeed.toFixed(1)} m/s</div>
      <div class="card-sub">Mach ${t.machNumber.toFixed(3)} | q: ${Math.round(t.dynamicPressure)} Pa</div>
    </div>
  </div>

  <div class="card">
    <h3 style="margin-top:0; color:var(--cyan);">Test Parameters & Model Geometry</h3>
    <table>
      <tr><th>Parameter</th><th>Value</th><th>Unit / Notes</th></tr>
      <tr><td>Model File</td><td>${modelAnalysis?.fileName || 'Procedural Geometry'}</td><td>STL format</td></tr>
      <tr><td>Geometry Facets</td><td>${modelAnalysis?.triangleCount ? modelAnalysis.triangleCount.toLocaleString() : 'N/A'}</td><td>Triangles</td></tr>
      <tr><td>Total Surface Area</td><td>${modelAnalysis?.totalSurfaceArea ? modelAnalysis.totalSurfaceArea.toFixed(4) : 'N/A'}</td><td>m² (scaled)</td></tr>
      <tr><td>Angle of Attack (α)</td><td>${flowSolver.angleAttack.toFixed(1)}°</td><td>Pitch angle relative to inflow</td></tr>
      <tr><td>Sideslip Angle (β)</td><td>${flowSolver.angleSideslip.toFixed(1)}°</td><td>Yaw angle relative to inflow</td></tr>
      <tr><td>Travel Direction Vector</td><td>[${flowSolver.travelDirection.x.toFixed(3)}, ${flowSolver.travelDirection.y.toFixed(3)}, ${flowSolver.travelDirection.z.toFixed(3)}]</td><td>Normalized 3D vector</td></tr>
      <tr><td>Air Density (ρ)</td><td>${flowSolver.airDensity.toFixed(3)}</td><td>kg/m³ (ISA Sea Level)</td></tr>
      <tr><td>Reynolds Number (Re)</td><td>${Math.round(t.reynoldsNumber).toLocaleString()}</td><td>Subsonic viscous regime</td></tr>
      <tr><td>Flow Status</td><td><span class="badge">${t.isStalled ? 'SEPARATED / STALL' : 'ATTACHED FLOW'}</span></td><td>${t.flowRegime}</td></tr>
      <tr><td>Solver Iterations</td><td>${flowSolver.iteration}</td><td>LBM D3Q19 lattice steps</td></tr>
    </table>
  </div>
</body>
</html>`;

    // Download blob as HTML
    const blob = new Blob([reportHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CFD_Report_${(modelAnalysis?.fileName || 'model').replace(/\.[^/.]+$/, '')}_${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
