import * as THREE from 'three';

export class AerodynamicGizmos {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.showForces = true;
    this.showWindDirection = true;

    // Travel & Wind Direction Arrows
    this.windArrow = this.createVectorArrow(0x00f2fe, 'Relative Wind');
    this.travelArrow = this.createVectorArrow(0xff9900, 'Flight Path');

    // Force Vectors at Center of Pressure
    this.liftArrow = this.createVectorArrow(0x00ff88, 'Lift (FL)');
    this.dragArrow = this.createVectorArrow(0xff3355, 'Drag (FD)');
    this.resultantArrow = this.createVectorArrow(0xffcc00, 'Resultant');

    this.group.add(this.windArrow.root);
    this.group.add(this.travelArrow.root);
    this.group.add(this.liftArrow.root);
    this.group.add(this.dragArrow.root);
    this.group.add(this.resultantArrow.root);
  }

  createVectorArrow(hexColor, name = '') {
    const root = new THREE.Group();

    // Shaft cylinder
    const shaftGeom = new THREE.CylinderGeometry(0.016, 0.016, 1.0, 16);
    shaftGeom.translate(0, 0.5, 0);
    const shaftMat = new THREE.MeshStandardMaterial({
      color: hexColor,
      roughness: 0.2,
      metalness: 0.8,
      emissive: hexColor,
      emissiveIntensity: 0.35,
    });
    const shaft = new THREE.Mesh(shaftGeom, shaftMat);
    root.add(shaft);

    // Tip cone
    const tipGeom = new THREE.ConeGeometry(0.045, 0.16, 16);
    tipGeom.translate(0, 1.08, 0);
    const tipMat = new THREE.MeshStandardMaterial({
      color: hexColor,
      roughness: 0.2,
      metalness: 0.8,
      emissive: hexColor,
      emissiveIntensity: 0.6,
    });
    const tip = new THREE.Mesh(tipGeom, tipMat);
    root.add(tip);

    return {
      root,
      shaft,
      tip,
      color: hexColor,
      name,
    };
  }

  setForcesVisible(visible) {
    this.showForces = visible;
    this.liftArrow.root.visible = visible;
    this.dragArrow.root.visible = visible;
    this.resultantArrow.root.visible = visible;
  }

  setDirectionVisible(visible) {
    this.showWindDirection = visible;
    this.windArrow.root.visible = visible;
    this.travelArrow.root.visible = visible;
  }

  /**
   * Orient an arrow from base position in direction `dir` with length `len`
   */
  orientArrow(arrowObj, basePos, dir, len) {
    const clampedLen = Math.max(0.15, Math.min(2.5, len));
    arrowObj.root.position.copy(basePos);

    // Direction alignment
    const unitDir = dir.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, unitDir);
    arrowObj.root.setRotationFromQuaternion(quat);

    // Scale length
    arrowObj.root.scale.set(1, clampedLen, 1);
  }

  /**
   * Update gizmo orientations and magnitudes from flowSolver
   * @param {import('../cfd/flowSolver.js').FlowSolver} flowSolver
   */
  update(flowSolver) {
    if (!flowSolver) return;

    // 1. Travel Direction & Wind Arrows
    if (this.showWindDirection) {
      const travelDir = flowSolver.travelDirection;
      const windDir = travelDir.clone().negate().normalize();

      // Place wind indicator at upper corner
      const indicatorPos = new THREE.Vector3(-1.4, 0.7, -0.7);
      this.orientArrow(this.windArrow, indicatorPos, windDir, 0.55);

      // Travel vector placed slightly offset
      const travelPos = new THREE.Vector3(1.4, -0.7, 0.7);
      this.orientArrow(this.travelArrow, travelPos, travelDir, 0.55);
    }

    // 2. Aerodynamic Force Vectors
    if (this.showForces) {
      const t = flowSolver.telemetry;
      const cp = t.centerOfPressure;

      const windUnit = flowSolver.travelDirection.clone().negate().normalize();
      const sideUnit = new THREE.Vector3(0, 1, 0).cross(windUnit).normalize();
      if (sideUnit.lengthSq() < 0.01) sideUnit.set(0, 0, 1);
      const liftUnit = windUnit.clone().cross(sideUnit).normalize();

      // Normalize force magnitudes for 3D visualization length
      const refForce = Math.max(10, t.liftForce + t.dragForce);
      const liftLen = 0.2 + (Math.abs(t.liftForce) / refForce) * 0.9;
      const dragLen = 0.2 + (Math.abs(t.dragForce) / refForce) * 0.65;

      const liftDir = liftUnit.clone().multiplyScalar(Math.sign(t.liftForce) || 1);
      const dragDir = windUnit.clone(); // Drag acts downstream along wind

      this.orientArrow(this.liftArrow, cp, liftDir, liftLen);
      this.orientArrow(this.dragArrow, cp, dragDir, dragLen);

      // Total Resultant Force
      const resultantDir = liftDir.clone().multiplyScalar(Math.abs(t.liftForce))
        .addScaledVector(dragDir, Math.abs(t.dragForce))
        .normalize();
      const resultantLen = Math.hypot(liftLen, dragLen) * 0.9;
      this.orientArrow(this.resultantArrow, cp, resultantDir, resultantLen);
    }
  }
}
