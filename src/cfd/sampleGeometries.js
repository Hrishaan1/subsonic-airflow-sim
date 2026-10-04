import * as THREE from 'three';

export class SampleGeometries {
  /**
   * Generates a 3D NACA 4-digit airfoil wing geometry
   * @param {string} digits - e.g. "0012" or "2412"
   * @param {number} span - wing span length
   * @param {number} chord - wing chord length
   * @param {number} nChord - chordwise resolution
   * @param {number} nSpan - spanwise resolution
   */
  static createNACA(digits = '0012', span = 2.0, chord = 1.0, nChord = 40, nSpan = 20) {
    const m = parseInt(digits[0], 10) / 100; // max camber
    const p = parseInt(digits[1], 10) / 10;  // position of max camber
    const t = parseInt(digits.slice(2), 10) / 100; // max thickness

    const pointsUpper = [];
    const pointsLower = [];

    // Cosine spacing along chord for high leading edge resolution
    for (let i = 0; i <= nChord; i++) {
      const beta = (i / nChord) * Math.PI;
      const xc = 0.5 * (1 - Math.cos(beta)); // from 0 to 1

      // Thickness distribution yt
      const yt = 5 * t * (
        0.2969 * Math.sqrt(xc) -
        0.1260 * xc -
        0.3516 * Math.pow(xc, 2) +
        0.2843 * Math.pow(xc, 3) -
        0.1015 * Math.pow(xc, 4)
      );

      // Camber line yc and camber slope theta
      let yc = 0;
      let dyc_dx = 0;
      if (p > 0) {
        if (xc < p) {
          yc = (m / (p * p)) * (2 * p * xc - xc * xc);
          dyc_dx = ((2 * m) / (p * p)) * (p - xc);
        } else {
          yc = (m / Math.pow(1 - p, 2)) * ((1 - 2 * p) + 2 * p * xc - xc * xc);
          dyc_dx = ((2 * m) / Math.pow(1 - p, 2)) * (p - xc);
        }
      }

      const theta = Math.atan(dyc_dx);

      const xu = (xc - yt * Math.sin(theta)) * chord - (chord * 0.5);
      const yu = (yc + yt * Math.cos(theta)) * chord;
      const xl = (xc + yt * Math.sin(theta)) * chord - (chord * 0.5);
      const yl = (yc - yt * Math.cos(theta)) * chord;

      pointsUpper.push(new THREE.Vector2(xu, yu));
      pointsLower.push(new THREE.Vector2(xl, yl));
    }

    // Combine into full closed airfoil contour (clockwise from trailing edge)
    const airfoil2D = [];
    for (let i = nChord; i >= 0; i--) {
      airfoil2D.push(pointsUpper[i]);
    }
    for (let i = 1; i <= nChord; i++) {
      airfoil2D.push(pointsLower[i]);
    }

    const nPoints = airfoil2D.length;
    const vertices = [];
    const indices = [];

    // Extrude along Z (spanwise)
    const halfSpan = span * 0.5;
    for (let s = 0; s <= nSpan; s++) {
      const z = -halfSpan + (s / nSpan) * span;
      for (let p = 0; p < nPoints; p++) {
        vertices.push(airfoil2D[p].x, airfoil2D[p].y, z);
      }
    }

    // Build side quad faces
    for (let s = 0; s < nSpan; s++) {
      const row1 = s * nPoints;
      const row2 = (s + 1) * nPoints;
      for (let p = 0; p < nPoints; p++) {
        const next = (p + 1) % nPoints;
        const i1 = row1 + p;
        const i2 = row1 + next;
        const i3 = row2 + next;
        const i4 = row2 + p;

        indices.push(i1, i2, i3);
        indices.push(i1, i3, i4);
      }
    }

    // End caps (wingtips)
    const leftCapIdx = 0;
    const rightCapIdx = nSpan * nPoints;

    for (let p = 1; p < nPoints - 1; p++) {
      indices.push(leftCapIdx, leftCapIdx + p + 1, leftCapIdx + p);
      indices.push(rightCapIdx, rightCapIdx + p, rightCapIdx + p + 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    // Rotate 180 deg around Y so leading edge faces forward (+X, into the incoming wind)
    // and trailing edge points backwards (-X)
    geometry.rotateY(Math.PI);
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Generates a modern delta-wing fighter aircraft geometry
   */
  static createDeltaJet() {
    const group = new THREE.Group();

    // Fuselage
    const fuselageGeom = new THREE.CylinderGeometry(0.14, 0.08, 2.2, 18, 1);
    fuselageGeom.rotateZ(Math.PI / 2);
    fuselageGeom.scale(1, 0.8, 0.7);

    // Nose Cone
    const noseGeom = new THREE.ConeGeometry(0.14, 0.8, 18);
    noseGeom.rotateZ(-Math.PI / 2);
    noseGeom.translate(1.5, 0, 0);

    // Delta Wings (swept triangular wing)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0.8, 0);
    wingShape.lineTo(-0.7, 1.4);
    wingShape.lineTo(-0.9, 1.35);
    wingShape.lineTo(-0.7, 0);
    wingShape.closePath();

    const extrudeSettings = { depth: 0.04, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 };
    const wingGeom = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);
    wingGeom.rotateX(Math.PI / 2);
    wingGeom.translate(0, 0, -0.02);

    const wingGeomLeft = wingGeom.clone();
    const wingGeomRight = wingGeom.clone();
    wingGeomRight.scale(1, 1, -1);

    // Twin Vertical Stabilizers
    const finShape = new THREE.Shape();
    finShape.moveTo(-0.4, 0);
    finShape.lineTo(-0.9, 0.55);
    finShape.lineTo(-1.1, 0.5);
    finShape.lineTo(-1.0, 0);
    finShape.closePath();

    const finGeom1 = new THREE.ExtrudeGeometry(finShape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 });
    finGeom1.rotateZ(0.08);
    finGeom1.translate(0, 0.1, 0.18);

    const finGeom2 = finGeom1.clone();
    finGeom2.scale(1, 1, -1);

    // Cockpit Canopy
    const canopyGeom = new THREE.SphereGeometry(0.13, 16, 12);
    canopyGeom.scale(2.2, 0.9, 0.75);
    canopyGeom.translate(0.3, 0.12, 0);

    // Merge geometries
    return this.mergeGeometries([fuselageGeom, noseGeom, wingGeomLeft, wingGeomRight, finGeom1, finGeom2, canopyGeom]);
  }

  /**
   * Generates a Commercial Jet Airliner (swept wing, engine pods, T-tail)
   */
  static createCommercialAirliner() {
    // Fuselage
    const fuseGeom = new THREE.CylinderGeometry(0.18, 0.18, 2.4, 20);
    fuseGeom.rotateZ(Math.PI / 2);

    // Nose
    const noseGeom = new THREE.SphereGeometry(0.18, 16, 12);
    noseGeom.scale(1.5, 1, 1);
    noseGeom.translate(1.2, 0, 0);

    // Tail cone
    const tailConeGeom = new THREE.ConeGeometry(0.18, 0.8, 16);
    tailConeGeom.rotateZ(Math.PI / 2);
    tailConeGeom.translate(-1.6, 0.03, 0);

    // Swept Main Wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0.3, 0);
    wingShape.lineTo(-0.4, 1.8);
    wingShape.lineTo(-0.55, 1.78);
    wingShape.lineTo(-0.25, 0);
    wingShape.closePath();

    const wingExtrude = { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 };
    const wingRight = new THREE.ExtrudeGeometry(wingShape, wingExtrude);
    wingRight.rotateX(Math.PI / 2);
    wingRight.rotateZ(0.04); // slight sweep dihedral
    wingRight.translate(0, -0.05, 0);

    const wingLeft = wingRight.clone();
    wingLeft.scale(1, 1, -1);

    // Engine Nacelles (2 pods under wings)
    const nacelleGeom1 = new THREE.CylinderGeometry(0.08, 0.08, 0.45, 16);
    nacelleGeom1.rotateZ(Math.PI / 2);
    nacelleGeom1.translate(-0.05, -0.15, 0.65);

    const nacelleGeom2 = nacelleGeom1.clone();
    nacelleGeom2.translate(0, 0, -1.3);

    // Vertical Fin
    const vFinShape = new THREE.Shape();
    vFinShape.moveTo(-1.2, 0);
    vFinShape.lineTo(-1.7, 0.65);
    vFinShape.lineTo(-1.85, 0.62);
    vFinShape.lineTo(-1.7, 0);
    vFinShape.closePath();
    const vFin = new THREE.ExtrudeGeometry(vFinShape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 });
    vFin.translate(0, 0.16, -0.015);

    // Horizontal Stabilizers
    const hStabShape = new THREE.Shape();
    hStabShape.moveTo(-1.4, 0);
    hStabShape.lineTo(-1.8, 0.6);
    hStabShape.lineTo(-1.9, 0.58);
    hStabShape.lineTo(-1.75, 0);
    hStabShape.closePath();
    const hStabRight = new THREE.ExtrudeGeometry(hStabShape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008 });
    hStabRight.rotateX(Math.PI / 2);
    hStabRight.translate(0, 0.18, 0);

    const hStabLeft = hStabRight.clone();
    hStabLeft.scale(1, 1, -1);

    return this.mergeGeometries([fuseGeom, noseGeom, tailConeGeom, wingRight, wingLeft, nacelleGeom1, nacelleGeom2, vFin, hStabRight, hStabLeft]);
  }

  /**
   * Generates the canonical Ahmed Body (Automotive aerodynamic benchmark)
   * 25-degree rear slant angle that produces strong trailing vortex flow
   */
  static createAhmedBody(rearSlantAngleDeg = 25) {
    const length = 2.0;
    const width = 0.75;
    const height = 0.55;
    const slantLength = 0.44;
    const slantAngleRad = (rearSlantAngleDeg * Math.PI) / 180;
    const slantDrop = Math.sin(slantAngleRad) * slantLength;
    const slantX = Math.cos(slantAngleRad) * slantLength;

    // Build stylized aerodynamic car/bluff body
    const bodyGeom = new THREE.BoxGeometry(length, height, width, 16, 12, 12);

    // Deform vertices for rounded front nose & aerodynamic underbody
    const pos = bodyGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Front rounding (x > 0.4)
      if (x > 0.4) {
        const factor = (x - 0.4) / 0.6;
        y *= (1 - 0.28 * factor * factor);
        z *= (1 - 0.22 * factor * factor);
      }

      // Rear slant (x < -0.4 and y > 0)
      if (x < -0.3 && y > 0) {
        const factor = (-0.3 - x) / 0.7;
        y -= factor * slantDrop * 1.4;
      }

      pos.setXYZ(i, x, y, z);
    }

    bodyGeom.computeVertexNormals();

    // 4 Stylized Wheels/Stilts
    const wheelGeom1 = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16);
    wheelGeom1.rotateX(Math.PI / 2);
    wheelGeom1.translate(0.55, -0.32, 0.38);

    const wheelGeom2 = wheelGeom1.clone();
    wheelGeom2.translate(0, 0, -0.76);

    const wheelGeom3 = wheelGeom1.clone();
    wheelGeom3.translate(-1.1, 0, 0);

    const wheelGeom4 = wheelGeom2.clone();
    wheelGeom4.translate(-1.1, 0, 0);

    return this.mergeGeometries([bodyGeom, wheelGeom1, wheelGeom2, wheelGeom3, wheelGeom4]);
  }

  /**
   * Generates a 3D Sphere (canonical flow separation & drag benchmark, Re critical transition)
   */
  static createSphere(radius = 0.7) {
    const geom = new THREE.SphereGeometry(radius, 40, 32);
    geom.computeVertexNormals();
    return geom;
  }

  /**
   * Generates an Aerodynamic Drone Propeller (twisted blades)
   */
  static createDronePropeller() {
    const hub = new THREE.CylinderGeometry(0.15, 0.15, 0.16, 20);

    // Twisted blade geometry
    const bladeLength = 1.2;
    const nSteps = 16;
    const vertices = [];
    const indices = [];

    const makeBlade = (flip = 1) => {
      const vOffset = vertices.length / 3;
      for (let i = 0; i <= nSteps; i++) {
        const r = (i / nSteps) * bladeLength;
        const chord = 0.22 * (1 - 0.5 * (i / nSteps));
        const twist = (35 - (i / nSteps) * 20) * (Math.PI / 180); // pitch decreases outward

        const cosT = Math.cos(twist);
        const sinT = Math.sin(twist);

        // Leading and trailing edge points
        const x1 = -chord * 0.4 * cosT;
        const y1 = -chord * 0.4 * sinT;
        const x2 = chord * 0.6 * cosT;
        const y2 = chord * 0.6 * sinT;

        const posX = flip * r;
        vertices.push(posX, y1, x1);
        vertices.push(posX, y2, x2);
      }

      for (let i = 0; i < nSteps; i++) {
        const i1 = vOffset + i * 2;
        const i2 = vOffset + i * 2 + 1;
        const i3 = vOffset + (i + 1) * 2 + 1;
        const i4 = vOffset + (i + 1) * 2;

        indices.push(i1, i2, i3);
        indices.push(i1, i3, i4);
        indices.push(i1, i3, i2);
        indices.push(i1, i4, i3);
      }
    };

    makeBlade(1);
    makeBlade(-1);

    const bladeGeom = new THREE.BufferGeometry();
    bladeGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    bladeGeom.setIndex(indices);
    bladeGeom.computeVertexNormals();

    return this.mergeGeometries([hub, bladeGeom]);
  }

  /**
   * Helper to merge multiple THREE.BufferGeometries into one indexed BufferGeometry
   */
  static mergeGeometries(geometries) {
    const totalVertices = [];
    const totalNormals = [];
    const totalIndices = [];
    let vertexOffset = 0;

    for (const geom of geometries) {
      const nonIndexed = geom.toNonIndexed();
      const pos = nonIndexed.attributes.position;
      const norm = nonIndexed.attributes.normal;

      for (let i = 0; i < pos.count; i++) {
        totalVertices.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (norm) {
          totalNormals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
        } else {
          totalNormals.push(0, 1, 0);
        }
        totalIndices.push(vertexOffset + i);
      }
      vertexOffset += pos.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(totalVertices, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(totalNormals, 3));
    merged.setIndex(totalIndices);
    merged.computeVertexNormals();
    return merged;
  }
}
