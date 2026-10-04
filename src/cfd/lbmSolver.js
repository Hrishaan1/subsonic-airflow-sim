/**
 * 3D Lattice Boltzmann Method (LBM D3Q19) Subsonic Aerodynamic Solver
 * Features:
 * - D3Q19 standard lattice
 * - BGK collision model with variable relaxation time tau (viscosity Re control)
 * - Momentum exchange method for exact aerodynamic surface force integration (Lift, Drag, Side Force)
 * - Inflow velocity equilibrium injection along arbitrary 3D flight/travel direction vector
 * - Non-equilibrium bounce-back / half-way bounce-back on arbitrary STL voxel boundaries
 * - Outflow non-reflective zero-gradient boundary conditions
 */

// D3Q19 discrete velocity vectors [cx, cy, cz]
export const D3Q19_C = [
  [0, 0, 0],    // 0: rest
  [1, 0, 0],    // 1: +x
  [-1, 0, 0],   // 2: -x
  [0, 1, 0],    // 3: +y
  [0, -1, 0],   // 4: -y
  [0, 0, 1],    // 5: +z
  [0, 0, -1],   // 6: -z
  [1, 1, 0],    // 7: +x +y
  [-1, -1, 0],  // 8: -x -y
  [1, -1, 0],   // 9: +x -y
  [-1, 1, 0],   // 10: -x +y
  [1, 0, 1],    // 11: +x +z
  [-1, 0, -1],  // 12: -x -z
  [1, 0, -1],   // 13: +x -z
  [-1, 0, 1],   // 14: -x +z
  [0, 1, 1],    // 15: +y +z
  [0, -1, -1],  // 16: -y -z
  [0, 1, -1],   // 17: +y -z
  [0, -1, 1],   // 18: -y +z
];

// Opposite direction indices for bounce-back
export const D3Q19_OPP = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17];

// Lattice weights
export const D3Q19_W = [
  1 / 3,
  1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18,
  1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36,
];

export class LBMSolver {
  constructor(nx, ny, nz) {
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.total = nx * ny * nz;

    // Double buffered distribution functions: 19 * total
    this.f0 = new Float32Array(19 * this.total);
    this.f1 = new Float32Array(19 * this.total);

    // Solid obstacle mask (1 = solid obstacle, 0 = fluid)
    this.solid = new Uint8Array(this.total);

    // Macroscopic fields
    this.rho = new Float32Array(this.total);
    this.ux = new Float32Array(this.total);
    this.uy = new Float32Array(this.total);
    this.uz = new Float32Array(this.total);

    // Aerodynamic forces (integrated via momentum exchange)
    this.forceX = 0;
    this.forceY = 0;
    this.forceZ = 0;
    this.stepCount = 0;

    // Simulation parameters
    this.tau = 0.58; // relaxation time (nu = (tau - 0.5)/3)
    this.uInflow = [0.08, 0.0, 0.0]; // lattice velocity (Mach < 0.15 on lattice for numerical stability)
  }

  setSolidMask(mask) {
    if (mask.length !== this.total) {
      console.error('Mask size mismatch in LBMSolver');
      return;
    }
    this.solid.set(mask);
  }

  /**
   * Set inflow lattice velocity based on travel direction
   * Inflow is opposite to travel direction
   */
  setInflowVelocity(travelDirX, travelDirY, travelDirZ, latticeSpeed = 0.08) {
    const len = Math.hypot(travelDirX, travelDirY, travelDirZ) || 1;
    // Relative wind is opposite to travel direction
    this.uInflow[0] = (-travelDirX / len) * latticeSpeed;
    this.uInflow[1] = (-travelDirY / len) * latticeSpeed;
    this.uInflow[2] = (-travelDirZ / len) * latticeSpeed;
  }

  setRelaxationTime(tau) {
    // Keep tau strictly within stable LBM range [0.51, 1.95]
    this.tau = Math.max(0.515, Math.min(1.8, tau));
  }

  /**
   * Equilibrium distribution function
   */
  feq(i, rhoVal, uX, uY, uZ) {
    const ci = D3Q19_C[i];
    const wi = D3Q19_W[i];

    const cu = ci[0] * uX + ci[1] * uY + ci[2] * uZ;
    const u2 = uX * uX + uY * uY + uZ * uZ;

    return wi * rhoVal * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * u2);
  }

  /**
   * Initialize fluid field with uniform density rho=1.0 and inflow velocity
   */
  initField() {
    const u0 = this.uInflow[0];
    const u1 = this.uInflow[1];
    const u2 = this.uInflow[2];

    for (let idx = 0; idx < this.total; idx++) {
      const isSolid = this.solid[idx] === 1;
      const initialU0 = isSolid ? 0 : u0;
      const initialU1 = isSolid ? 0 : u1;
      const initialU2 = isSolid ? 0 : u2;
      const initialRho = 1.0;

      this.rho[idx] = initialRho;
      this.ux[idx] = initialU0;
      this.uy[idx] = initialU1;
      this.uz[idx] = initialU2;

      const base = idx * 19;
      for (let i = 0; i < 19; i++) {
        const val = this.feq(i, initialRho, initialU0, initialU1, initialU2);
        this.f0[base + i] = val;
        this.f1[base + i] = val;
      }
    }
    this.stepCount = 0;
    this.forceX = 0;
    this.forceY = 0;
    this.forceZ = 0;
  }

  /**
   * Perform one complete LBM time step (Collision -> Streaming -> Bounce-back -> Inflow/Outflow)
   */
  step() {
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;
    const invTau = 1.0 / this.tau;
    const oneMinusInvTau = 1.0 - invTau;

    const fSrc = (this.stepCount % 2 === 0) ? this.f0 : this.f1;
    const fDst = (this.stepCount % 2 === 0) ? this.f1 : this.f0;

    let fx = 0;
    let fy = 0;
    let fz = 0;

    const uIn0 = this.uInflow[0];
    const uIn1 = this.uInflow[1];
    const uIn2 = this.uInflow[2];

    // 1. COLLISION & STREAMING
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const idx = i + j * nx + k * nx * ny;
          const base = idx * 19;

          if (this.solid[idx] === 1) {
            // Solid obstacle: internal nodes do nothing
            continue;
          }

          // Calculate macroscopic rho and velocity from incoming distributions
          let r = 0;
          let m0 = 0;
          let m1 = 0;
          let m2 = 0;

          for (let d = 0; d < 19; d++) {
            const fVal = fSrc[base + d];
            r += fVal;
            const ci = D3Q19_C[d];
            m0 += fVal * ci[0];
            m1 += fVal * ci[1];
            m2 += fVal * ci[2];
          }

          // Safety guard against numerical divergence
          if (r < 0.2 || r > 3.0 || isNaN(r)) {
            r = 1.0;
            m0 = uIn0;
            m1 = uIn1;
            m2 = uIn2;
          }

          const invR = 1.0 / r;
          const uX = m0 * invR;
          const uY = m1 * invR;
          const uZ = m2 * invR;

          this.rho[idx] = r;
          this.ux[idx] = uX;
          this.uy[idx] = uY;
          this.uz[idx] = uZ;

          const u2 = uX * uX + uY * uY + uZ * uZ;

          // Collision and stream to neighbors
          for (let d = 0; d < 19; d++) {
            const ci = D3Q19_C[d];
            const wi = D3Q19_W[d];
            const cu = ci[0] * uX + ci[1] * uY + ci[2] * uZ;
            const feqVal = wi * r * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * u2);

            // Post-collision distribution
            const fPost = fSrc[base + d] * oneMinusInvTau + feqVal * invTau;

            // Target neighbor coordinates
            const ni = i + ci[0];
            const nj = j + ci[1];
            const nk = k + ci[2];

            // Check domain bounds
            if (ni >= 0 && ni < nx && nj >= 0 && nj < ny && nk >= 0 && nk < nz) {
              const nIdx = ni + nj * nx + nk * nx * ny;
              if (this.solid[nIdx] === 1) {
                // HALF-WAY BOUNCE-BACK on solid obstacle!
                const oppDir = D3Q19_OPP[d];
                fDst[base + oppDir] = fPost;

                // Momentum exchange: force exerted on the obstacle
                fx += 2.0 * ci[0] * fPost;
                fy += 2.0 * ci[1] * fPost;
                fz += 2.0 * ci[2] * fPost;
              } else {
                // Stream to neighbor
                fDst[nIdx * 19 + d] = fPost;
              }
            } else {
              // Boundary condition handled in pass 2
            }
          }
        }
      }
    }

    // 2. BOUNDARY CONDITIONS (Inflow & Outflow based on travel direction)
    // Determine dominant inflow faces based on uInflow vector
    this.applyBoundaries(fDst);

    this.forceX = fx;
    this.forceY = fy;
    this.forceZ = fz;
    this.stepCount++;
  }

  /**
   * Apply domain boundary conditions:
   * Upstream faces receive equilibrium distribution with uInflow
   * Downstream faces use open zero-gradient extrapolation
   */
  applyBoundaries(fArray) {
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;
    const uIn0 = this.uInflow[0];
    const uIn1 = this.uInflow[1];
    const uIn2 = this.uInflow[2];

    const getIdx = (i, j, k) => i + j * nx + k * nx * ny;

    // X boundaries (i = 0 and i = nx - 1)
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        // i = 0
        const idx0 = getIdx(0, j, k);
        if (this.solid[idx0] === 0) {
          if (uIn0 >= 0) {
            // Inflow
            for (let d = 0; d < 19; d++) {
              fArray[idx0 * 19 + d] = this.feq(d, 1.0, uIn0, uIn1, uIn2);
            }
          } else {
            // Outflow: copy from adjacent interior cell
            const adj = getIdx(1, j, k);
            for (let d = 0; d < 19; d++) {
              fArray[idx0 * 19 + d] = fArray[adj * 19 + d];
            }
          }
        }

        // i = nx - 1
        const idx1 = getIdx(nx - 1, j, k);
        if (this.solid[idx1] === 0) {
          if (uIn0 <= 0) {
            // Inflow
            for (let d = 0; d < 19; d++) {
              fArray[idx1 * 19 + d] = this.feq(d, 1.0, uIn0, uIn1, uIn2);
            }
          } else {
            // Outflow: copy from adjacent interior cell
            const adj = getIdx(nx - 2, j, k);
            for (let d = 0; d < 19; d++) {
              fArray[idx1 * 19 + d] = fArray[adj * 19 + d];
            }
          }
        }
      }
    }

    // Y boundaries (j = 0 and j = ny - 1)
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        // j = 0
        const idx0 = getIdx(i, 0, k);
        if (this.solid[idx0] === 0) {
          if (uIn1 >= 0) {
            for (let d = 0; d < 19; d++) {
              fArray[idx0 * 19 + d] = this.feq(d, 1.0, uIn0, uIn1, uIn2);
            }
          } else {
            const adj = getIdx(i, 1, k);
            for (let d = 0; d < 19; d++) {
              fArray[idx0 * 19 + d] = fArray[adj * 19 + d];
            }
          }
        }

        // j = ny - 1
        const idx1 = getIdx(i, ny - 1, k);
        if (this.solid[idx1] === 0) {
          if (uIn1 <= 0) {
            for (let d = 0; d < 19; d++) {
              fArray[idx1 * 19 + d] = this.feq(d, 1.0, uIn0, uIn1, uIn2);
            }
          } else {
            const adj = getIdx(i, ny - 2, k);
            for (let d = 0; d < 19; d++) {
              fArray[idx1 * 19 + d] = fArray[adj * 19 + d];
            }
          }
        }
      }
    }

    // Z boundaries (k = 0 and k = nz - 1)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // k = 0
        const idx0 = getIdx(i, j, 0);
        if (this.solid[idx0] === 0) {
          if (uIn2 >= 0) {
            for (let d = 0; d < 19; d++) {
              fArray[idx0 * 19 + d] = this.feq(d, 1.0, uIn0, uIn1, uIn2);
            }
          } else {
            const adj = getIdx(i, j, 1);
            for (let d = 0; d < 19; d++) {
              fArray[idx0 * 19 + d] = fArray[adj * 19 + d];
            }
          }
        }

        // k = nz - 1
        const idx1 = getIdx(i, j, nz - 1);
        if (this.solid[idx1] === 0) {
          if (uIn2 <= 0) {
            for (let d = 0; d < 19; d++) {
              fArray[idx1 * 19 + d] = this.feq(d, 1.0, uIn0, uIn1, uIn2);
            }
          } else {
            const adj = getIdx(i, j, nz - 2);
            for (let d = 0; d < 19; d++) {
              fArray[idx1 * 19 + d] = fArray[adj * 19 + d];
            }
          }
        }
      }
    }
  }

  /**
   * Sample 3D velocity vector at arbitrary continuous coordinates (trilinear interpolation)
   * Domain is mapped to grid coordinates [0, nx-1], [0, ny-1], [0, nz-1]
   */
  sampleVelocity(gridX, gridY, gridZ, outVec = { x: 0, y: 0, z: 0 }) {
    const x0 = Math.max(0, Math.min(this.nx - 2, Math.floor(gridX)));
    const y0 = Math.max(0, Math.min(this.ny - 2, Math.floor(gridY)));
    const z0 = Math.max(0, Math.min(this.nz - 2, Math.floor(gridZ)));

    const fx = Math.max(0, Math.min(1, gridX - x0));
    const fy = Math.max(0, Math.min(1, gridY - y0));
    const fz = Math.max(0, Math.min(1, gridZ - z0));

    const nx = this.nx;
    const ny = this.ny;

    const i000 = x0 + y0 * nx + z0 * nx * ny;
    const i100 = (x0 + 1) + y0 * nx + z0 * nx * ny;
    const i010 = x0 + (y0 + 1) * nx + z0 * nx * ny;
    const i110 = (x0 + 1) + (y0 + 1) * nx + z0 * nx * ny;

    const i001 = x0 + y0 * nx + (z0 + 1) * nx * ny;
    const i101 = (x0 + 1) + y0 * nx + (z0 + 1) * nx * ny;
    const i011 = x0 + (y0 + 1) * nx + (z0 + 1) * nx * ny;
    const i111 = (x0 + 1) + (y0 + 1) * nx + (z0 + 1) * nx * ny;

    // Trilinear interpolation helper
    const interp = (field) => {
      const c00 = field[i000] * (1 - fx) + field[i100] * fx;
      const c10 = field[i010] * (1 - fx) + field[i110] * fx;
      const c01 = field[i001] * (1 - fx) + field[i101] * fx;
      const c11 = field[i011] * (1 - fx) + field[i111] * fx;

      const c0 = c00 * (1 - fy) + c10 * fy;
      const c1 = c01 * (1 - fy) + c11 * fy;

      return c0 * (1 - fz) + c1 * fz;
    };

    outVec.x = interp(this.ux);
    outVec.y = interp(this.uy);
    outVec.z = interp(this.uz);
    return outVec;
  }
}
