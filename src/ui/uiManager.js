import { STLParser } from '../cfd/stlParser.js';
import { SampleGeometries } from '../cfd/sampleGeometries.js';
import { ReportExporter } from './reportExporter.js';

export class UIManager {
  constructor(app) {
    this.app = app;
    this.stlParser = new STLParser();
    this.currentModelAnalysis = null;

    this.bindElements();
    this.bindEvents();
  }

  bindElements() {
    // File upload
    this.dropZone = document.getElementById('drop-zone');
    this.fileInput = document.getElementById('file-input');
    this.modelSelect = document.getElementById('model-select');
    this.modelInfo = document.getElementById('model-info');

    // Direction & Flight Controls
    this.sliderAlpha = document.getElementById('slider-alpha');
    this.valAlpha = document.getElementById('val-alpha');
    this.sliderBeta = document.getElementById('slider-beta');
    this.valBeta = document.getElementById('val-beta');
    this.btnInvertDir = document.getElementById('btn-invert-dir');
    this.btnZeroAngles = document.getElementById('btn-zero-angles');
    this.valAirflowSide = document.getElementById('val-airflow-side');

    this.sliderSpeed = document.getElementById('slider-speed');
    this.valSpeed = document.getElementById('val-speed-input');
    this.sliderDensity = document.getElementById('slider-density');
    this.valDensity = document.getElementById('val-density');

    // Simulation controls
    this.btnPlayPause = document.getElementById('btn-play-pause');
    this.btnStep = document.getElementById('btn-step');
    this.btnReset = document.getElementById('btn-reset');
    this.selectResolution = document.getElementById('select-resolution');

    // Visualization toggles
    this.chkPressure = document.getElementById('chk-pressure');
    this.chkWireframe = document.getElementById('chk-wireframe');
    this.selectMaterial = document.getElementById('select-material');
    this.selectColormap = document.getElementById('select-colormap');

    this.chkStreamlines = document.getElementById('chk-streamlines');
    this.sliderStreamlines = document.getElementById('slider-streamlines');
    this.selectStreamlineColor = document.getElementById('select-streamline-color');

    this.chkParticles = document.getElementById('chk-particles');
    this.sliderParticleSpeed = document.getElementById('slider-particle-speed');

    this.chkSlice = document.getElementById('chk-slice');
    this.selectSliceAxis = document.getElementById('select-slice-axis');
    this.sliderSlicePos = document.getElementById('slider-slice-pos');

    this.chkForces = document.getElementById('chk-forces');
    this.chkDirectionGizmo = document.getElementById('chk-direction-gizmo');
    this.chkChamber = document.getElementById('chk-chamber');

    // Camera view buttons
    this.btnCamIso = document.getElementById('btn-cam-iso');
    this.btnCamTop = document.getElementById('btn-cam-top');
    this.btnCamSide = document.getElementById('btn-cam-side');
    this.btnCamFront = document.getElementById('btn-cam-front');

    // Export buttons
    this.btnExportReport = document.getElementById('btn-export-report');
    this.btnScreenshot = document.getElementById('btn-screenshot');
  }

  bindEvents() {
    // 1. STL Drag-and-Drop & File Input
    if (this.dropZone && this.fileInput) {
      this.dropZone.addEventListener('click', () => this.fileInput.click());
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleFileUpload(e.target.files[0]);
        }
      });

      this.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dropZone.classList.add('dragover');
      });

      this.dropZone.addEventListener('dragleave', () => {
        this.dropZone.classList.remove('dragover');
      });

      this.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });
    }

    // 2. Sample Model Select
    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', (e) => {
        this.loadSampleModel(e.target.value);
      });
    }

    // 3. Airflow Inflow Side Selector (X+/X-/Y+/Y-/Z+/Z-)
    document.querySelectorAll('[data-airflow-side]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const side = e.currentTarget.getAttribute('data-airflow-side');
        this.app.flowSolver.setAirflowSide(side);
        this.syncDirectionSliders();
      });
    });

    // 4. Model Orientation Tools (Rotate X, Y, Z by 90 deg, Flip 180)
    document.querySelectorAll('[data-rotate-model]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.getAttribute('data-rotate-model');
        if (action === 'x90') this.app.flowSolver.rotateModel('x', 90);
        else if (action === 'y90') this.app.flowSolver.rotateModel('y', 90);
        else if (action === 'z90') this.app.flowSolver.rotateModel('z', 90);
        else if (action === 'flip180') this.app.flowSolver.rotateModel('y', 180);

        if (this.app.flowSolver.currentGeometry) {
          this.app.loadModel(
            this.app.flowSolver.currentGeometry,
            this.app.flowSolver.referenceArea,
            this.app.flowSolver.referenceLength
          );
        }
      });
    });

    // 5. Flight Direction: Angle of Attack (Pitch)
    if (this.sliderAlpha) {
      this.sliderAlpha.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.app.flowSolver.setFlightAngles(val, this.app.flowSolver.angleSideslip);
        this.syncDirectionSliders();
      });
    }

    // 6. Flight Direction: Sideslip (Yaw)
    if (this.sliderBeta) {
      this.sliderBeta.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.app.flowSolver.setFlightAngles(this.app.flowSolver.angleAttack, val);
        this.syncDirectionSliders();
      });
    }

    // Invert Travel / Airflow Direction
    if (this.btnInvertDir) {
      this.btnInvertDir.addEventListener('click', () => {
        this.app.flowSolver.invertAirflowDirection();
        this.syncDirectionSliders();
      });
    }

    if (this.btnZeroAngles) {
      this.btnZeroAngles.addEventListener('click', () => {
        this.app.flowSolver.setAirflowSide('x+');
        this.syncDirectionSliders();
      });
    }

    // Quick angle buttons (e.g., [data-angle])
    document.querySelectorAll('[data-angle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const angle = parseFloat(e.currentTarget.getAttribute('data-angle'));
        this.sliderAlpha.value = angle;
        this.sliderAlpha.dispatchEvent(new Event('input'));
      });
    });

    // 7. Airspeed & Density
    if (this.sliderSpeed) {
      this.sliderSpeed.addEventListener('input', (e) => {
        const speed = parseFloat(e.target.value);
        if (this.valSpeed) this.valSpeed.textContent = `${speed.toFixed(1)} m/s`;
        this.app.flowSolver.setAirspeed(speed);
      });
    }

    if (this.sliderDensity) {
      this.sliderDensity.addEventListener('input', (e) => {
        const rho = parseFloat(e.target.value);
        if (this.valDensity) this.valDensity.textContent = `${rho.toFixed(3)} kg/m³`;
        this.app.flowSolver.setAtmosphericConditions(rho, this.app.flowSolver.dynamicViscosity);
      });
    }

    // 6. Simulation Controls
    if (this.btnPlayPause) {
      this.btnPlayPause.addEventListener('click', () => {
        this.app.flowSolver.isRunning = !this.app.flowSolver.isRunning;
        this.btnPlayPause.innerHTML = this.app.flowSolver.isRunning
          ? '<span>⏸</span> Pause'
          : '<span>▶</span> Run CFD';
        this.btnPlayPause.classList.toggle('active', this.app.flowSolver.isRunning);
      });
    }

    if (this.btnStep) {
      this.btnStep.addEventListener('click', () => {
        this.app.flowSolver.step(10);
      });
    }

    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        this.app.flowSolver.resetSimulation();
      });
    }

    if (this.selectResolution) {
      this.selectResolution.addEventListener('change', (e) => {
        const res = e.target.value;
        if (res === 'low') this.app.flowSolver.setGridResolution(48, 24, 24);
        else if (res === 'high') this.app.flowSolver.setGridResolution(80, 40, 40);
        else this.app.flowSolver.setGridResolution(64, 32, 32);
      });
    }

    // 7. Visual Layer Toggles
    if (this.chkPressure) {
      this.chkPressure.addEventListener('change', (e) => {
        this.app.stlViewer.setDisplayMode(e.target.checked ? 'cfd_pressure' : this.selectMaterial.value);
      });
    }

    if (this.chkWireframe) {
      this.chkWireframe.addEventListener('change', (e) => {
        this.app.stlViewer.setWireframeVisible(e.target.checked);
      });
    }

    if (this.selectMaterial) {
      this.selectMaterial.addEventListener('change', (e) => {
        if (!this.chkPressure.checked) {
          this.app.stlViewer.setDisplayMode(e.target.value);
        }
      });
    }

    if (this.selectColormap) {
      this.selectColormap.addEventListener('change', (e) => {
        const scheme = e.target.value;
        this.app.stlViewer.setColormap(scheme);
        this.app.streamlines.setColormap(scheme);
        this.app.particles.setColormap(scheme);
        this.app.slices.setColormap(scheme);
      });
    }

    // Streamlines
    if (this.chkStreamlines) {
      this.chkStreamlines.addEventListener('change', (e) => {
        this.app.streamlines.setVisible(e.target.checked);
      });
    }

    if (this.sliderStreamlines) {
      this.sliderStreamlines.addEventListener('input', (e) => {
        this.app.streamlines.setLineCount(parseInt(e.target.value, 10));
      });
    }

    if (this.selectStreamlineColor) {
      this.selectStreamlineColor.addEventListener('change', (e) => {
        this.app.streamlines.setColorBy(e.target.value);
      });
    }

    // Smoke Particles
    if (this.chkParticles) {
      this.chkParticles.addEventListener('change', (e) => {
        this.app.particles.setVisible(e.target.checked);
      });
    }

    if (this.sliderParticleSpeed) {
      this.sliderParticleSpeed.addEventListener('input', (e) => {
        this.app.particles.setSpeed(parseFloat(e.target.value));
      });
    }

    // Slices
    if (this.chkSlice) {
      this.chkSlice.addEventListener('change', (e) => {
        this.app.slices.setVisible(e.target.checked);
      });
    }

    if (this.selectSliceAxis) {
      this.selectSliceAxis.addEventListener('change', (e) => {
        this.app.slices.setAxis(e.target.value);
      });
    }

    if (this.sliderSlicePos) {
      this.sliderSlicePos.addEventListener('input', (e) => {
        this.app.slices.setPosition(parseFloat(e.target.value));
      });
    }

    // Gizmos
    if (this.chkForces) {
      this.chkForces.addEventListener('change', (e) => {
        this.app.gizmos.setForcesVisible(e.target.checked);
      });
    }

    if (this.chkDirectionGizmo) {
      this.chkDirectionGizmo.addEventListener('change', (e) => {
        this.app.gizmos.setDirectionVisible(e.target.checked);
      });
    }

    if (this.chkChamber) {
      this.chkChamber.addEventListener('change', (e) => {
        this.app.sceneManager.setTunnelVisibility(e.target.checked);
      });
    }

    // Camera Presets
    if (this.btnCamIso) this.btnCamIso.addEventListener('click', () => this.app.sceneManager.setCameraView('iso'));
    if (this.btnCamTop) this.btnCamTop.addEventListener('click', () => this.app.sceneManager.setCameraView('top'));
    if (this.btnCamSide) this.btnCamSide.addEventListener('click', () => this.app.sceneManager.setCameraView('side'));
    if (this.btnCamFront) this.btnCamFront.addEventListener('click', () => this.app.sceneManager.setCameraView('front'));

    // Export CFD Report
    if (this.btnExportReport) {
      this.btnExportReport.addEventListener('click', () => {
        this.app.sceneManager.render();
        const screenshot = this.app.sceneManager.renderer.domElement.toDataURL('image/png');
        ReportExporter.exportReport(this.app.flowSolver, this.currentModelAnalysis, screenshot);
      });
    }

    // Screenshot
    if (this.btnScreenshot) {
      this.btnScreenshot.addEventListener('click', () => {
        this.app.sceneManager.render();
        const dataUrl = this.app.sceneManager.renderer.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `Aerodynamic_CFD_${Date.now()}.png`;
        a.click();
      });
    }
  }

  /**
   * Handle user uploaded STL file
   * @param {File} file
   */
  async handleFileUpload(file) {
    if (!file.name.toLowerCase().endsWith('.stl')) {
      alert('Please upload a valid .STL 3D model file (Binary or ASCII).');
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = this.stlParser.parse(arrayBuffer, file.name);

      // Normalize scale & center
      this.stlParser.normalizeGeometry(parsed.geometry, 1.4);
      this.currentModelAnalysis = parsed.analysis;

      // Update UI Model Info Card
      this.updateModelInfoCard(parsed.analysis);

      // Estimate reference area
      const refArea = parsed.analysis.totalSurfaceArea * 0.25;
      const refLength = parsed.analysis.dimensions.x || 1.0;

      // Load into 3D viewer & CFD solver
      this.app.loadModel(parsed.geometry, refArea, refLength);

      // Reset model select dropdown to custom
      if (this.modelSelect) {
        this.modelSelect.value = 'custom';
      }
    } catch (err) {
      console.error('Failed to parse STL file:', err);
      alert(`Error reading STL file: ${err.message}`);
    }
  }

  /**
   * Load procedural sample model
   * @param {string} sampleKey
   */
  loadSampleModel(sampleKey) {
    let geom = null;
    let name = 'Sample Model';

    switch (sampleKey) {
      case 'naca0012':
        geom = SampleGeometries.createNACA('0012', 2.0, 1.0, 40, 24);
        name = 'NACA 0012 Airfoil Wing';
        break;
      case 'naca2412':
        geom = SampleGeometries.createNACA('2412', 2.0, 1.0, 40, 24);
        name = 'NACA 2412 Cambered Wing';
        break;
      case 'deltajet':
        geom = SampleGeometries.createDeltaJet();
        name = 'Delta-Wing Supersonic Fighter';
        break;
      case 'airliner':
        geom = SampleGeometries.createCommercialAirliner();
        name = 'Commercial Jetliner';
        break;
      case 'ahmed':
        geom = SampleGeometries.createAhmedBody(25);
        name = 'Ahmed Body (Car Aerodynamics)';
        break;
      case 'sphere':
        geom = SampleGeometries.createSphere(0.65);
        name = 'CFD Benchmark Sphere';
        break;
      case 'propeller':
        geom = SampleGeometries.createDronePropeller();
        name = 'Twisted Drone Propeller';
        break;
      default:
        geom = SampleGeometries.createNACA('0012', 2.0, 1.0, 40, 24);
        name = 'NACA 0012 Wing';
    }

    const analysis = this.stlParser.analyzeGeometry(geom, `${name}.stl`);
    this.stlParser.normalizeGeometry(geom, 1.4);
    this.currentModelAnalysis = analysis;
    this.updateModelInfoCard(analysis);

    const refArea = analysis.totalSurfaceArea * 0.25;
    const refLen = analysis.dimensions.x || 1.0;

    this.app.loadModel(geom, refArea, refLen);
  }

  updateModelInfoCard(analysis) {
    if (!this.modelInfo) return;
    this.modelInfo.innerHTML = `
      <div class="info-row">
        <span class="info-label">File:</span>
        <span class="info-val" title="${analysis.fileName}">${analysis.fileName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Facets:</span>
        <span class="info-val">${analysis.triangleCount.toLocaleString()} triangles</span>
      </div>
      <div class="info-row">
        <span class="info-label">Surface Area:</span>
        <span class="info-val">${analysis.totalSurfaceArea.toFixed(3)} m²</span>
      </div>
      <div class="info-row">
        <span class="info-label">Bounding Box:</span>
        <span class="info-val">${analysis.dimensions.x.toFixed(2)} × ${analysis.dimensions.y.toFixed(2)} × ${analysis.dimensions.z.toFixed(2)}</span>
      </div>
    `;
  }

  syncDirectionSliders() {
    const alpha = this.app.flowSolver.angleAttack;
    const beta = this.app.flowSolver.angleSideslip;

    if (this.sliderAlpha) {
      this.sliderAlpha.value = alpha;
      if (this.valAlpha) this.valAlpha.textContent = `${alpha.toFixed(1)}°`;
      this.sliderAlpha.classList.toggle('locked', !this.isAngleOnSlider(this.sliderAlpha, alpha));
    }
    if (this.sliderBeta) {
      this.sliderBeta.value = beta;
      if (this.valBeta) this.valBeta.textContent = `${beta.toFixed(1)}°`;
      this.sliderBeta.classList.toggle('locked', !this.isAngleOnSlider(this.sliderBeta, beta));
    }

    this.highlightActiveAirflowSide(this.app.flowSolver.getAirflowSide());
  }

  /**
   * Alpha and beta only span the +X hemisphere of the chamber, so directions
   * picked from the axis buttons can fall outside their range
   */
  isAngleOnSlider(slider, value) {
    if (!slider) return true;
    return value >= parseFloat(slider.min) && value <= parseFloat(slider.max);
  }

  highlightActiveAirflowSide(side) {
    document.querySelectorAll('[data-airflow-side]').forEach((btn) => {
      const btnSide = btn.getAttribute('data-airflow-side');
      btn.classList.toggle('active', btnSide === side);
    });

    if (this.valAirflowSide) {
      this.valAirflowSide.textContent = side ? `${side[0].toUpperCase()}${side[1]}` : 'CUSTOM α/β';
    }
  }
}
