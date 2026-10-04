import * as THREE from 'three';
import { LBMSolver } from './lbmSolver.js';
import { Voxelizer } from './voxelizer.js';

// Model travel direction for each airflow entry face of the tunnel chamber.
// The key names the face the air ENTERS through, so the model moves along that
// same axis and the relative wind blows toward the opposite face.
const AIRFLOW_SIDE_VECTORS = {
  'x+': new THREE.Vector3(1, 0, 0),
  'x-': new THREE.Vector3(-1, 0, 0),
  'y+': new THREE.Vector3(0, 1, 0),
  'y-': new THREE.Vector3(0, -1, 0),
  'z+': new THREE.Vector3(0, 0, 1),
  'z-': new THREE.Vector3(0, 0, -1),
};

// Legacy descriptive names kept so older callers keep working.
const AIRFLOW_SIDE_ALIASES = {
  front: 'x+',
  rear: 'x-',
  top: 'y+',
  bottom: 'y-',
  left: 'z+',
  right: 'z-',
};

export class FlowSolver {
  constructor(options = {}) {
    this.nx = options.nx || 64;
    this.ny = options.ny || 32;
    this.nz = options.nz || 32;

    this.domainMin = new THREE.Vector3(-1.8, -0.9, -0.9);
    this.domainMax = new THREE.Vector3(1.8, 0.9, 0.9);

    // Physical Aerodynamic Conditions
    this.airspeed = 45.0; // m/s (~162 km/h, subsonic)
    this.airDensity = 1.225; // kg/m^3 (sea level standard atmosphere)
    this.dynamicViscosity = 1.81e-5; // Pa*s
    this.speedOfSound = 340.29; // m/s
    this.angleAttack = 6.0; // degrees (alpha)
    this.angleSideslip = 0.0; // degrees (beta)

    // Travel direction unit vector (direction the aircraft/model flies toward)
    this.travelDirection = new THREE.Vector3(1, 0, 0);
    this.updateTravelDirectionFromAngles();

    // Model reference geometry
    this.currentGeometry = null;
    this.voxelData = null;
    this.referenceArea = 0.4; // m^2
    this.referenceLength = 1.0; // m

    // LBM Solver instance
    this.lbm = new LBMSolver(this.nx, this.ny, this.nz);

    // Simulation status
    this.isRunning = true;
    this.iteration = 0;
    this.convergenceHistory = []; // stores { iteration, cl, cd, ld }

    // Instant/Smoothed telemetry
    this.telemetry = {
      airspeed: this.airspeed,
      machNumber: this.airspeed / this.speedOfSound,
      reynoldsNumber: 1e6,
      dynamicPressure: 0.5 * this.airDensity * this.airspeed * this.airspeed,
      liftForce: 0,
      dragForce: 0,
      sideForce: 0,
      liftCoeff: 0,
      dragCoeff: 0,
      sideCoeff: 0,
      liftToDrag: 0,
      pitchingMomentCoeff: 0,
      centerOfPressure: new THREE.Vector3(0, 0, 0),
      isStalled: false,
      flowRegime: 'Subsonic Incompressible',
    };
  }

  /**
   * Update travel direction vector from pitch (AoA) and yaw (sideslip) angles
   */
  updateTravelDirectionFromAngles() {
    const alphaRad = (this.angleAttack * Math.PI) / 180;
    const betaRad = (this.angleSideslip * Math.PI) / 180;

    // Model moves in direction: forward + pitch up/down + yaw left/right
    this.travelDirection.set(
      Math.cos(alphaRad) * Math.cos(betaRad),
      Math.sin(alphaRad),
      Math.cos(alphaRad) * Math.sin(betaRad)
    ).normalize();
  }

  /**
   * Load and voxelize a new 3D model geometry
   */
  loadGeometry(geometry, referenceArea = 0.5, referenceLength = 1.0) {
    this.currentGeometry = geometry;
    this.referenceArea = referenceArea;
    this.referenceLength = referenceLength;

    // Voxelize onto Cartesian grid
    this.voxelData = Voxelizer.voxelize(geometry, {
      nx: this.nx,
      ny: this.ny,
      nz: this.nz,
      domainMin: this.domainMin,
      domainMax: this.domainMax,
    });

    this.lbm.setSolidMask(this.voxelData.solidMask);
    this.resetSimulation();
  }

  /**
   * Change grid resolution (e.g. 48x24x24 for turbo speed, 64x32x32 standard, 80x40x40 high)
   */
  setGridResolution(nx, ny, nz) {
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.lbm = new LBMSolver(this.nx, this.ny, this.nz);
    if (this.currentGeometry) {
      this.loadGeometry(this.currentGeometry, this.referenceArea, this.referenceLength);
    }
  }

  /**
   * Set flight direction via angles
   */
  setFlightAngles(alphaDeg, betaDeg) {
    this.angleAttack = alphaDeg;
    this.angleSideslip = betaDeg;
    this.updateTravelDirectionFromAngles();
    this.applyInflowConditions();
  }

  /**
   * Select which face of the tunnel chamber the incoming airflow enters from.
   * Keys name the entry face: 'x+', 'x-', 'y+', 'y-', 'z+', 'z-'
   * (legacy aliases: front, rear, top, bottom, left, right)
   */
  setAirflowSide(side) {
    const key = AIRFLOW_SIDE_ALIASES[side] || side;
    const target = AIRFLOW_SIDE_VECTORS[key];
    if (!target) return;

    this.travelDirection.copy(target);
    this.updateAnglesFromTravelDirection();
    this.applyInflowConditions();
  }

  /**
   * Which chamber face the airflow currently enters through, or null when the
   * travel direction is an oblique alpha/beta combination
   */
  getAirflowSide() {
    const dir = this.travelDirection;
    let best = null;
    let bestDot = 0.9999;
    for (const [key, vec] of Object.entries(AIRFLOW_SIDE_VECTORS)) {
      const dot = dir.dot(vec);
      if (dot > bestDot) {
        bestDot = dot;
        best = key;
      }
    }
    return best;
  }

  /**
   * Reverse airflow direction by 180 degrees
   */
  invertAirflowDirection() {
    this.travelDirection.negate();
    this.updateAnglesFromTravelDirection();
    this.applyInflowConditions();
  }

  /**
   * Rotate loaded 3D model geometry by 90 degrees around X, Y, or Z
   */
  rotateModel(axis, angleDeg = 90) {
    if (!this.currentGeometry) return;
    const rad = (angleDeg * Math.PI) / 180;
    if (axis === 'x') this.currentGeometry.rotateX(rad);
    else if (axis === 'y') this.currentGeometry.rotateY(rad);
    else if (axis === 'z') this.currentGeometry.rotateZ(rad);
    this.currentGeometry.computeVertexNormals();

    // Re-voxelize with rotated geometry
    this.loadGeometry(this.currentGeometry, this.referenceArea, this.referenceLength);
  }

  /**
   * Set flight direction vector directly
   */
  setTravelDirectionVector(vec) {
    this.travelDirection.copy(vec).normalize();
    this.updateAnglesFromTravelDirection();
    this.applyInflowConditions();
  }

  updateAnglesFromTravelDirection() {
    const dir = this.travelDirection;
    this.angleAttack = (Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180) / Math.PI;
    const horizLen = Math.hypot(dir.x, dir.z);
    this.angleSideslip = horizLen > 0.001
      ? (Math.atan2(dir.z, dir.x) * 180) / Math.PI
      : 0;
  }

  setAirspeed(speed) {
    this.airspeed = Math.max(1.0, Math.min(260.0, speed));
    this.applyInflowConditions();
  }

  setAtmosphericConditions(density, viscosity) {
    this.airDensity = density;
    this.dynamicViscosity = viscosity;
  }

  applyInflowConditions() {
    // Relative wind is in opposite direction of travel
    const latticeSpeed = 0.07; // stable lattice Mach
    this.lbm.setInflowVelocity(
      this.travelDirection.x,
      this.travelDirection.y,
      this.travelDirection.z,
      latticeSpeed
    );

    // Compute fast analytical potential/Euler flow baseline immediately
    this.computeFastPotentialField();
  }

  resetSimulation() {
    this.iteration = 0;
    this.convergenceHistory = [];
    this.applyInflowConditions();
    this.lbm.initField();
    this.computeFastPotentialField();
  }

  /**
   * 3D Isotropic Eulerian/Potential initial condition
   * Works identically regardless of whether air comes from Front, Rear, Left, Right, Top, or Bottom
   */
  computeFastPotentialField() {
    if (!this.voxelData) return;

    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;
    const solid = this.voxelData.solidMask;

    // Relative wind unit vector (direction air is flowing towards)
    const windDir = this.travelDirection.clone().negate().normalize();
    const latticeSpeed = 0.07;
    const u0 = windDir.x * latticeSpeed;
    const u1 = windDir.y * latticeSpeed;
    const u2 = windDir.z * latticeSpeed;

    const dx = (this.domainMax.x - this.domainMin.x) / nx;
    const dy = (this.domainMax.y - this.domainMin.y) / ny;
    const dz = (this.domainMax.z - this.domainMin.z) / nz;

    const uInfVec = new THREE.Vector3(u0, u1, u2);
    const rPos = new THREE.Vector3();

    for (let k = 0; k < nz; k++) {
      const zPos = this.domainMin.z + (k + 0.5) * dz;
      for (let j = 0; j < ny; j++) {
        const yPos = this.domainMin.y + (j + 0.5) * dy;
        for (let i = 0; i < nx; i++) {
          const idx = i + j * nx + k * nx * ny;
          const xPos = this.domainMin.x + (i + 0.5) * dx;

          if (solid[idx] === 1) {
            this.lbm.ux[idx] = 0;
            this.lbm.uy[idx] = 0;
            this.lbm.uz[idx] = 0;
            this.lbm.rho[idx] = 1.0;
            continue;
          }

          rPos.set(xPos, yPos, zPos);
          const rDist = rPos.length();

          let velX = u0;
          let velY = u1;
          let velZ = u2;

          if (rDist < 1.15 && rDist > 0.01) {
            const factor = Math.max(0, 1.15 - rDist) / 1.15;
            const rHat = rPos.clone().normalize();
            const uRad = uInfVec.dot(rHat);
            const deflectX = (u0 - uRad * rHat.x) * 1.35;
            const deflectY = (u1 - uRad * rHat.y) * 1.35;
            const deflectZ = (u2 - uRad * rHat.z) * 1.35;

            velX = u0 * (1 - factor) + deflectX * factor;
            velY = u1 * (1 - factor) + deflectY * factor;
            velZ = u2 * (1 - factor) + deflectZ * factor;
          }

          this.lbm.ux[idx] = velX;
          this.lbm.uy[idx] = velY;
          this.lbm.uz[idx] = velZ;

          const localSpeed2 = velX * velX + velY * velY + velZ * velZ;
          const infSpeed2 = u0 * u0 + u1 * u1 + u2 * u2;
          this.lbm.rho[idx] = 1.0 - 1.5 * (localSpeed2 - infSpeed2);
        }
      }
    }
  }

  /**
   * Step the Navier-Stokes / Lattice Boltzmann CFD solver
   * @param {number} subSteps - number of LBM steps to compute per frame
   */
  step(subSteps = 2) {
    if (!this.isRunning || !this.voxelData) return;

    for (let s = 0; s < subSteps; s++) {
      this.lbm.step();
      this.iteration++;
    }

    this.computeAerodynamicsTelemetry();
  }

  /**
   * Calculate physical aerodynamic coefficients and forces
   */
  computeAerodynamicsTelemetry() {
    const mach = this.airspeed / this.speedOfSound;
    const qInf = 0.5 * this.airDensity * this.airspeed * this.airspeed; // Pa
    const re = (this.airDensity * this.airspeed * this.referenceLength) / this.dynamicViscosity;

    // Relative wind unit vector (opposite travel direction)
    const windUnit = this.travelDirection.clone().negate().normalize();

    // Lift direction: perpendicular to wind in the vertical pitch plane
    const sideUnit = new THREE.Vector3(0, 1, 0).cross(windUnit).normalize();
    if (sideUnit.lengthSq() < 0.001) sideUnit.set(0, 0, 1);
    const liftUnit = windUnit.clone().cross(sideUnit).normalize();

    // Subsonic compressibility correction (Prandtl-Glauert rule: 1 / sqrt(1 - M^2) for M < 0.8)
    const prandtlGlauert = mach < 0.8 ? 1.0 / Math.sqrt(Math.max(0.1, 1.0 - mach * mach)) : 1.66;

    // Aerodynamic model estimation coupled with integrated LBM momentum exchange
    const alphaRad = (this.angleAttack * Math.PI) / 180;

    // Theoretical thin-airfoil & 3D finite wing lift slope: a = 2*pi / (1 + 2/AR)
    const aspect = 4.0;
    const liftSlope = (2 * Math.PI) / (1 + 2 / aspect);

    // Stall behavior: smooth nonlinear stall past stall angle (~15 - 18 deg)
    const stallAngleRad = (16.0 * Math.PI) / 180;
    const isStalled = Math.abs(alphaRad) > stallAngleRad;

    let clTheoretical = liftSlope * Math.sin(alphaRad) * Math.cos(alphaRad) * prandtlGlauert;
    if (isStalled) {
      const stallFactor = Math.exp(-Math.pow((Math.abs(alphaRad) - stallAngleRad) * 4.0, 2));
      clTheoretical = Math.sign(alphaRad) * (0.8 * stallFactor + 0.3 * Math.sin(2 * alphaRad));
    }

    // Drag polar: CD = CD0 + k * CL^2 + CD_separation
    const cd0 = 0.024;
    const inducedFactor = 1.0 / (Math.PI * 0.82 * aspect);
    let cdTheoretical = (cd0 + inducedFactor * clTheoretical * clTheoretical) * prandtlGlauert;
    if (isStalled) {
      cdTheoretical += 0.35 * Math.pow(Math.sin(alphaRad), 2);
    }

    // Blend LBM momentum exchange force with theoretical scaling
    const lbmFx = this.lbm.forceX;
    const lbmFy = this.lbm.forceY;
    const lbmFz = this.lbm.forceZ;

    // Scale LBM forces into physical dimensions
    const scaleFactor = (qInf * this.referenceArea) / Math.max(1, this.voxelData.boundaryCount * 0.02);

    let physLift = clTheoretical * qInf * this.referenceArea;
    let physDrag = cdTheoretical * qInf * this.referenceArea;
    let physSide = Math.sin((this.angleSideslip * Math.PI) / 180) * 0.4 * qInf * this.referenceArea;

    // If LBM has accumulated meaningful momentum transfer:
    if (this.iteration > 10 && Math.hypot(lbmFx, lbmFy, lbmFz) > 0.001) {
      const lbmForce = new THREE.Vector3(lbmFx, lbmFy, lbmFz).multiplyScalar(scaleFactor);
      const measuredDrag = lbmForce.dot(windUnit);
      const measuredLift = lbmForce.dot(liftUnit);

      // Smooth relaxation
      physLift = 0.7 * physLift + 0.3 * Math.abs(measuredLift) * Math.sign(clTheoretical);
      physDrag = 0.7 * physDrag + 0.3 * Math.abs(measuredDrag);
    }

    const cl = physLift / (qInf * this.referenceArea);
    const cd = Math.max(0.015, physDrag / (qInf * this.referenceArea));
    const cs = physSide / (qInf * this.referenceArea);
    const ld = cl / cd;

    // Pitching moment about quarter-chord
    const cm0 = -0.035;
    const cm = cm0 + 0.05 * (cl - 0.2);

    // Center of pressure (chordwise location % from leading edge)
    const xCp = 0.25 - (cl !== 0 ? cm / cl : 0);

    let regime = 'Incompressible Subsonic (M < 0.3)';
    if (mach >= 0.3 && mach < 0.7) {
      regime = 'Subsonic Compressible (Prandtl-Glauert)';
    } else if (mach >= 0.7) {
      regime = 'Transonic Approach (M ≥ 0.7)';
    }

    this.telemetry = {
      airspeed: this.airspeed,
      machNumber: mach,
      reynoldsNumber: re,
      dynamicPressure: qInf,
      liftForce: physLift,
      dragForce: physDrag,
      sideForce: physSide,
      liftCoeff: cl,
      dragCoeff: cd,
      sideCoeff: cs,
      liftToDrag: ld,
      pitchingMomentCoeff: cm,
      centerOfPressure: new THREE.Vector3((xCp - 0.5) * this.referenceLength, 0, 0),
      isStalled,
      flowRegime: regime,
    };

    // Track convergence history every 5 iterations
    if (this.iteration % 5 === 0) {
      this.convergenceHistory.push({
        iteration: this.iteration,
        cl,
        cd,
        ld,
      });
      if (this.convergenceHistory.length > 60) {
        this.convergenceHistory.shift();
      }
    }
  }

  /**
   * Sample 3D world velocity at an arbitrary 3D position (x, y, z in domain [-1.8, 1.8] x [-0.9, 0.9]^2)
   */
  getVelocityAt(worldPos, outVec = new THREE.Vector3()) {
    const gx = ((worldPos.x - this.domainMin.x) / (this.domainMax.x - this.domainMin.x)) * (this.nx - 1);
    const gy = ((worldPos.y - this.domainMin.y) / (this.domainMax.y - this.domainMin.y)) * (this.ny - 1);
    const gz = ((worldPos.z - this.domainMin.z) / (this.domainMax.z - this.domainMin.z)) * (this.nz - 1);

    if (gx < 0 || gx >= this.nx - 1 || gy < 0 || gy >= this.ny - 1 || gz < 0 || gz >= this.nz - 1) {
      // Free-stream incoming wind outside simulation domain
      const wind = this.travelDirection.clone().negate().normalize().multiplyScalar(0.07);
      outVec.copy(wind);
      return outVec;
    }

    const sampled = { x: 0, y: 0, z: 0 };
    this.lbm.sampleVelocity(gx, gy, gz, sampled);
    outVec.set(sampled.x, sampled.y, sampled.z);
    return outVec;
  }

  /**
   * Sample local pressure / density at an arbitrary 3D position
   */
  getPressureAt(worldPos) {
    const gx = Math.floor(((worldPos.x - this.domainMin.x) / (this.domainMax.x - this.domainMin.x)) * (this.nx - 1));
    const gy = Math.floor(((worldPos.y - this.domainMin.y) / (this.domainMax.y - this.domainMin.y)) * (this.ny - 1));
    const gz = Math.floor(((worldPos.z - this.domainMin.z) / (this.domainMax.z - this.domainMin.z)) * (this.nz - 1));

    if (gx < 0 || gx >= this.nx || gy < 0 || gy >= this.ny || gz < 0 || gz >= this.nz) {
      return 1.0;
    }

    const idx = gx + gy * this.nx + gz * this.nx * this.ny;
    return this.lbm.rho[idx] || 1.0;
  }
}
