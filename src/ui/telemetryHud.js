export class TelemetryHud {
  constructor() {
    // DOM metric elements
    this.elLiftForce = document.getElementById('val-lift-force');
    this.elLiftCoeff = document.getElementById('val-cl');
    this.elDragForce = document.getElementById('val-drag-force');
    this.elDragCoeff = document.getElementById('val-cd');
    this.elLiftToDrag = document.getElementById('val-ld');
    this.elSideForce = document.getElementById('val-side-force');
    this.elPitchingMoment = document.getElementById('val-cm');
    this.elAirspeed = document.getElementById('val-airspeed');
    this.elMach = document.getElementById('val-mach');
    this.elReynolds = document.getElementById('val-reynolds');
    this.elDynPressure = document.getElementById('val-q');
    this.elStallBadge = document.getElementById('stall-badge');
    this.elRegimeBadge = document.getElementById('regime-badge');
    this.elIterCount = document.getElementById('val-iterations');

    // Canvas for convergence history plot
    this.canvas = document.getElementById('convergence-chart');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
    }
  }

  /**
   * Format numbers cleanly with SI units or decimal rounding
   */
  formatForce(n) {
    if (Math.abs(n) >= 1000) {
      return (n / 1000).toFixed(2) + ' kN';
    }
    return n.toFixed(1) + ' N';
  }

  formatRe(re) {
    if (re >= 1e6) {
      return (re / 1e6).toFixed(2) + ' × 10⁶';
    }
    if (re >= 1e3) {
      return (re / 1e3).toFixed(1) + 'k';
    }
    return Math.round(re).toString();
  }

  /**
   * Update the HUD elements with latest CFD telemetry
   * @param {import('../cfd/flowSolver.js').FlowSolver} flowSolver
   */
  update(flowSolver) {
    if (!flowSolver) return;
    const t = flowSolver.telemetry;

    if (this.elLiftForce) this.elLiftForce.textContent = this.formatForce(t.liftForce);
    if (this.elLiftCoeff) this.elLiftCoeff.textContent = t.liftCoeff.toFixed(3);

    if (this.elDragForce) this.elDragForce.textContent = this.formatForce(t.dragForce);
    if (this.elDragCoeff) this.elDragCoeff.textContent = t.dragCoeff.toFixed(3);

    if (this.elLiftToDrag) {
      this.elLiftToDrag.textContent = t.liftToDrag.toFixed(2);
      this.elLiftToDrag.style.color = t.liftToDrag >= 10 ? '#00ff88' : (t.liftToDrag >= 5 ? '#00f2fe' : '#ffaa00');
    }

    if (this.elSideForce) this.elSideForce.textContent = this.formatForce(t.sideForce);
    if (this.elPitchingMoment) this.elPitchingMoment.textContent = t.pitchingMomentCoeff.toFixed(4);

    if (this.elAirspeed) this.elAirspeed.textContent = `${flowSolver.airspeed.toFixed(1)} m/s (${Math.round(flowSolver.airspeed * 3.6)} km/h)`;
    if (this.elMach) this.elMach.textContent = `M ${t.machNumber.toFixed(3)}`;
    if (this.elReynolds) this.elReynolds.textContent = this.formatRe(t.reynoldsNumber);
    if (this.elDynPressure) this.elDynPressure.textContent = `${Math.round(t.dynamicPressure)} Pa`;
    if (this.elIterCount) this.elIterCount.textContent = `Step ${flowSolver.iteration}`;

    // Stall Warning Badge
    if (this.elStallBadge) {
      if (t.isStalled) {
        this.elStallBadge.textContent = 'STALL DETECTED';
        this.elStallBadge.className = 'badge badge-warning pulse';
        this.elStallBadge.style.display = 'inline-flex';
      } else {
        this.elStallBadge.textContent = 'ATTACHED FLOW';
        this.elStallBadge.className = 'badge badge-success';
        this.elStallBadge.style.display = 'inline-flex';
      }
    }

    // Subsonic Regime Badge
    if (this.elRegimeBadge) {
      this.elRegimeBadge.textContent = t.flowRegime;
    }

    // Render Convergence Graph
    this.drawConvergencePlot(flowSolver.convergenceHistory);
  }

  drawConvergencePlot(history) {
    if (!this.ctx || !history || history.length < 2) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    // Dark grid background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.5);
    ctx.lineTo(width, height * 0.5);
    ctx.moveTo(0, height * 0.25);
    ctx.lineTo(width, height * 0.25);
    ctx.moveTo(0, height * 0.75);
    ctx.lineTo(width, height * 0.75);
    ctx.stroke();

    // Find min and max for auto-scaling
    let maxVal = 1.2;
    let minVal = -0.4;
    for (const h of history) {
      if (h.cl > maxVal) maxVal = h.cl;
      if (h.cl < minVal) minVal = h.cl;
      if (h.cd > maxVal) maxVal = h.cd;
    }
    const valRange = Math.max(0.2, maxVal - minVal);

    const getY = (val) => height - ((val - minVal) / valRange) * (height - 14) - 7;
    const getX = (idx) => (idx / (history.length - 1)) * (width - 10) + 5;

    // Draw CL line (cyan)
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = getX(i);
      const y = getY(history[i].cl);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw CD line (coral red)
    ctx.strokeStyle = '#ff4b5c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = getX(i);
      const y = getY(history[i].cd);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    ctx.font = '10px monospace';
    ctx.fillStyle = '#00f2fe';
    ctx.fillText('CL', width - 42, 14);
    ctx.fillStyle = '#ff4b5c';
    ctx.fillText('CD', width - 20, 14);
  }
}
