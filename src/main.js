import * as THREE from 'three';
import { SceneManager } from './visualizer/sceneManager.js';
import { STLViewer } from './visualizer/stlViewer.js';
import { StreamlineVisualizer } from './visualizer/streamlines.js';
import { ParticleTunnel } from './visualizer/particleTunnel.js';
import { SliceViewer } from './visualizer/sliceViewer.js';
import { AerodynamicGizmos } from './visualizer/gizmos.js';
import { FlowSolver } from './cfd/flowSolver.js';
import { TelemetryHud } from './ui/telemetryHud.js';
import { UIManager } from './ui/uiManager.js';

class AeroFlowApp {
  constructor() {
    this.container = document.getElementById('canvas-container');

    // 1. Core Visualizers
    this.sceneManager = new SceneManager(this.container);
    this.stlViewer = new STLViewer(this.sceneManager.scene);
    this.streamlines = new StreamlineVisualizer(this.sceneManager.scene);
    this.particles = new ParticleTunnel(this.sceneManager.scene, 7000);
    this.slices = new SliceViewer(this.sceneManager.scene);
    this.gizmos = new AerodynamicGizmos(this.sceneManager.scene);

    // 2. CFD Engine
    this.flowSolver = new FlowSolver({ nx: 64, ny: 32, nz: 32 });

    // 3. UI and HUD
    this.hud = new TelemetryHud();
    this.ui = new UIManager(this);

    // Clock for animation
    this.clock = new THREE.Clock();
    this.frame = 0;

    // Load default NACA 0012 model
    this.ui.loadSampleModel('naca0012');
    this.ui.syncDirectionSliders();

    // Start main render loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  loadModel(geometry, refArea = 0.5, refLength = 1.0) {
    this.stlViewer.setGeometry(geometry);
    this.flowSolver.loadGeometry(geometry, refArea, refLength);

    // Immediate initial visualization refresh
    this.stlViewer.updateSurfacePressure(this.flowSolver);
    this.streamlines.update(this.flowSolver);
    this.gizmos.update(this.flowSolver);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const deltaTime = Math.min(0.05, this.clock.getDelta());
    this.frame++;

    // 1. Advance CFD Navier-Stokes / LBM Solver (2 sub-steps per frame)
    if (this.flowSolver.isRunning) {
      this.flowSolver.step(2);
    }

    // 2. Update Surface Pressure on STL
    if (this.stlViewer.displayMode === 'cfd_pressure' && this.frame % 2 === 0) {
      this.stlViewer.updateSurfacePressure(this.flowSolver);
    }

    // 3. Update Streamlines (integrated via RK4 every 3 frames for 60fps smoothness)
    if (this.streamlines.visible && this.frame % 3 === 0) {
      this.streamlines.update(this.flowSolver);
    }
    this.streamlines.animate(deltaTime);

    // 4. Update Smoke Particles (continuous smooth advection)
    if (this.particles.visible) {
      this.particles.update(this.flowSolver, deltaTime);
    }

    // 5. Update Cut-Plane Slice
    if (this.slices.visible && this.frame % 4 === 0) {
      this.slices.update(this.flowSolver);
    }

    // 6. Update 3D Aerodynamic Force and Wind Direction Gizmos
    this.gizmos.update(this.flowSolver);

    // 7. Update HUD Telemetry and Convergence Graph
    if (this.frame % 3 === 0) {
      this.hud.update(this.flowSolver);
    }

    // 8. Render 3D Scene
    this.sceneManager.render();
  }
}

// Bulletproof application bootstrap (handles both immediate execution and deferred loading)
function startAeroFlow() {
  if (window.aeroFlowApp) return;
  try {
    console.log('[AeroFlow 3D] Initializing CFD wind tunnel application...');
    window.aeroFlowApp = new AeroFlowApp();
    console.log('[AeroFlow 3D] Wind tunnel simulation running at 60 FPS!');
  } catch (err) {
    console.error('[AeroFlow 3D] Failed to initialize application:', err);
    const errBanner = document.createElement('div');
    errBanner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#ff3355;color:#fff;padding:14px 24px;border-radius:8px;z-index:99999;font-family:sans-serif;font-size:13px;font-weight:600;box-shadow:0 10px 40px rgba(0,0,0,0.8);max-width:80%;';
    errBanner.innerHTML = `<strong>AeroFlow 3D Startup Notice:</strong> ${err.message}<br><small style="opacity:0.85">Check browser developer console for detailed stack trace.</small>`;
    document.body.appendChild(errBanner);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startAeroFlow);
} else {
  // DOM is already parsed (common in deferred ES module scripts)
  startAeroFlow();
}
