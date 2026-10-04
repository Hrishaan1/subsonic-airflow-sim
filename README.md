# AeroFlow 3D - Subsonic Aerodynamics & Fluid Dynamics Simulator

**AeroFlow 3D** is an interactive, high-fidelity 3D Subsonic Aerodynamics Wind Tunnel and Computational Fluid Dynamics (CFD) simulator. It allows users to input any **STL** 3D model (aerospace, automotive, drone, or industrial geometry), define the flight/travel direction, and interactively simulate and visualize the subsonic fluid interactions, surface pressures, 3D streamlines, wake vortex shedding, and aerodynamic forces in real time.

---

## Key Features

### 1. Arbitrary STL Model Ingestion
- **Universal STL Support**: Drag-and-drop or browse any standard Binary or ASCII `.stl` file.
- **Automated Geometry Analysis**: Computes triangle facet counts, 3D bounding box dimensions, total wetted surface area ($S_{wet}$), and projected frontal area ($A_{proj}$).
- **Automatic Centering & Aerodynamic Scaling**: Automatically aligns and fits geometry into the subsonic wind tunnel test chamber.
- **Built-in Aerodynamic Presets**:
  - **NACA 0012 Wing**: Symmetrical standard aeronautical reference airfoil.
  - **NACA 2412 Cambered Wing**: High-lift cambered wing displaying positive zero-AoA lift.
  - **Delta-Wing Supersonic/Subsonic Fighter**: Swept delta wing with fuselage and vertical stabilizers.
  - **Commercial Jet Airliner**: Swept wing transport with engine nacelles and empennage.
  - **Ahmed Body**: Classic automotive bluff body with $25^\circ$ rear slant generating strong trailing vortex pairs.
  - **CFD Benchmark Sphere**: Classic flow separation and drag benchmark.
  - **Drone Propeller**: Twisted aerodynamic blade with varying pitch.

### 2. Multi-Axis Flight Direction & Velocity Controls
- **Airflow Entry Side**: Choose which tunnel face the wind enters through with the **X+, X−, Y+, Y−, Z+, Z−** axis buttons (sets the travel vector and inflow boundary conditions instantly).
- **User-Defined Travel Direction**: Freely orient the direction the model travels in space:
  - **Pitch / Angle of Attack ($\alpha$)**: Adjustable from $-25^\circ$ to $+35^\circ$ with quick presets ($0^\circ, \pm 5^\circ, +10^\circ, +15^\circ$, Stall $22^\circ$).
  - **Sideslip / Yaw Angle ($\beta$)**: Adjustable from $-30^\circ$ to $+30^\circ$.
  - **180° Direction Inverter**: Instantly reverse flight direction to analyze reverse airflow.
- **Airspeed ($V_\infty$)**: Adjustable from $5\text{ m/s}$ to $250\text{ m/s}$ (displaying $\text{m/s}$, $\text{km/h}$, and knots).
- **Atmospheric Environment**: Sea level standard atmosphere ($\rho = 1.225\text{ kg/m}^3$) or high-altitude thinner air ($\rho = 0.4\text{ kg/m}^3$).

### 3. Subsonic CFD Physics Engine
- **3D Lattice Boltzmann Method (LBM D3Q19)**:
  - 19 discrete velocities ($c_i$), BGK collision operator with relaxation time $\tau$ governing viscous behavior.
  - Voxelized obstacle representation with half-way bounce-back boundary condition.
  - **Exact Momentum Exchange**: Directly integrates fluid momentum transfer onto boundary voxels to compute instantaneous physical aerodynamic forces:
    - **Lift Force ($F_L$) & Lift Coefficient ($C_L$)**
    - **Drag Force ($F_D$) & Drag Coefficient ($C_D$)**
    - **Aerodynamic Glide Ratio / Efficiency ($L/D$)**
    - **Side Force ($F_S$) & Side Coefficient ($C_S$)**
    - **Pitching Moment ($C_M$)**
- **Subsonic Compressibility Modeling**:
  - Detects Mach number ($M_\infty = V_\infty / a$).
  - Implements **Prandtl-Glauert Compressibility Correction**:
    $$C_p = \frac{C_{p0}}{\sqrt{1 - M_\infty^2}} \quad (M_\infty < 0.8)$$
- **Flow Separation & Stall Detection**: Real-time stall warning indicator when the critical angle of attack is exceeded.

### 4. Interactive 3D Visualizations
- **Surface Pressure ($C_p$) Heatmap**: Colormapped directly onto the STL surface, highlighting stagnation zones (red) and suction peaks (blue/cyan).
- **3D Streamlines (RK4)**: Integrated via 4th-order Runge-Kutta through the 3D velocity field with animated flowing dashes.
- **Wind Tunnel Smoke Particles**: Thousands of smoke particles emitted upstream that wrap around the geometry and reveal wake recirculation and turbulence.
- **2D Cut-Plane Slices**: Orthogonal cut planes (Spanwise $Z$, Planform $Y$, Cross-section $X$) with live scalar field contours.
- **3D Aerodynamic Force Vectors**: Dynamic green (Lift) and red (Drag) arrows anchored at the Center of Pressure.
- **Multiple Colormaps**: Turbo (Google AI), Cool-to-Warm (Blue-Red), Viridis, and Jet.

### 5. Technical Reporting & Export
- **Export CFD Report**: Download a formatted HTML test report with simulation metadata, aerodynamic coefficients, polar summary, and high-resolution wind tunnel snapshot.
- **Screenshot Capture**: Instant PNG export of the 3D viewport.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation & Launch
```bash
# Navigate to project directory
cd subsonic-airflow-sim

# Install dependencies (three.js, lucide)
npm install

# Start local development wind tunnel
npm run dev
```

Open your browser at:
```
http://localhost:5173/
```

### Production Build
```bash
npm run build
npm run preview
```

---

## File Structure
```
subsonic-airflow-sim/
├── index.html                   # Modern aerospace HUD layout
├── package.json
├── src/
│   ├── main.js                  # Application coordinator & 60fps render loop
│   ├── style.css                # Aerospace glassmorphism design system
│   ├── cfd/
│   │   ├── stlParser.js         # Binary & ASCII STL parser and geometric analysis
│   │   ├── sampleGeometries.js  # Procedural NACA, Jet, Car, Propeller, Sphere models
│   │   ├── voxelizer.js         # 3D SAT Triangle-AABB voxelizer & surface normal calculator
│   │   ├── lbmSolver.js         # 3D D3Q19 Lattice Boltzmann Method solver
│   │   └── flowSolver.js        # Flow coordinator, potential field & telemetry
│   ├── visualizer/
│   │   ├── colormap.js          # Turbo, CoolWarm, Viridis, Jet colormaps
│   │   ├── sceneManager.js      # Three.js scene, lighting, camera view presets
│   │   ├── stlViewer.js         # Dynamic Cp surface pressure mapping & materials
│   │   ├── streamlines.js       # RK4 3D streamline integrator
│   │   ├── particleTunnel.js    # Smoke wind tunnel particle system
│   │   ├── sliceViewer.js       # 2D cut-plane slice generator
│   │   └── gizmos.js            # 3D force vectors and travel direction arrows
│   └── ui/
│       ├── telemetryHud.js      # Real-time HUD gauges & convergence plot
│       ├── uiManager.js         # UI event bindings, sliders, file dropzone
│       └── reportExporter.js    # Technical CFD report generator
└── public/
    └── samples/                 # Sample STL models for testing
        ├── naca0012_wing.stl
        ├── delta_fighter.stl
        ├── ahmed_car_body.stl
        └── sphere_cfd.stl
```
