import * as THREE from "three";

const MIN_SIZE = 0.001;

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > MIN_SIZE ? value : fallback;
}

function clampRadius(width: number, height: number, radius: number): number {
  return THREE.MathUtils.clamp(radius, MIN_SIZE, Math.min(width, height) * 0.49);
}

function addRoundedRectangle(
  path: THREE.Shape | THREE.Path,
  width: number,
  height: number,
  radius: number,
  clockwise: boolean,
): void {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const r = clampRadius(width, height, radius);

  if (clockwise) {
    path.moveTo(-halfWidth + r, -halfHeight);
    path.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth, -halfHeight + r);
    path.lineTo(-halfWidth, halfHeight - r);
    path.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth + r, halfHeight);
    path.lineTo(halfWidth - r, halfHeight);
    path.quadraticCurveTo(halfWidth, halfHeight, halfWidth, halfHeight - r);
    path.lineTo(halfWidth, -halfHeight + r);
    path.quadraticCurveTo(halfWidth, -halfHeight, halfWidth - r, -halfHeight);
    path.lineTo(-halfWidth + r, -halfHeight);
    path.closePath();
    return;
  }

  path.moveTo(-halfWidth + r, -halfHeight);
  path.lineTo(halfWidth - r, -halfHeight);
  path.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + r);
  path.lineTo(halfWidth, halfHeight - r);
  path.quadraticCurveTo(halfWidth, halfHeight, halfWidth - r, halfHeight);
  path.lineTo(-halfWidth + r, halfHeight);
  path.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - r);
  path.lineTo(-halfWidth, -halfHeight + r);
  path.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + r, -halfHeight);
  path.closePath();
}

function extrude(
  shape: THREE.Shape,
  depth: number,
  radius: number,
  bevelSegments: number,
): THREE.ExtrudeGeometry {
  const safeDepth = positive(depth, 0.05);
  const bevelThickness = Math.min(safeDepth * 0.18, radius * 0.14);
  const bevelSize = Math.min(radius * 0.12, safeDepth * 0.16);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: safeDepth,
    steps: 1,
    curveSegments: 18,
    bevelEnabled: true,
    bevelSegments: Math.max(3, Math.round(bevelSegments)),
    bevelSize,
    bevelThickness,
  });

  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

export interface RoundedPanelGeometryOptions {
  width: number;
  height: number;
  depth: number;
  radius: number;
  bevelSegments?: number;
}

export function createRoundedPanelGeometry({
  width,
  height,
  depth,
  radius,
  bevelSegments = 7,
}: RoundedPanelGeometryOptions): THREE.ExtrudeGeometry {
  const safeWidth = positive(width, 1);
  const safeHeight = positive(height, 1);
  const safeRadius = clampRadius(safeWidth, safeHeight, radius);
  const shape = new THREE.Shape();

  addRoundedRectangle(shape, safeWidth, safeHeight, safeRadius, false);
  return extrude(shape, depth, safeRadius, bevelSegments);
}

export interface RoundedRingGeometryOptions extends RoundedPanelGeometryOptions {
  innerWidth: number;
  innerHeight: number;
  innerRadius: number;
}

export function createRoundedRingGeometry({
  width,
  height,
  innerWidth,
  innerHeight,
  depth,
  radius,
  innerRadius,
  bevelSegments = 7,
}: RoundedRingGeometryOptions): THREE.ExtrudeGeometry {
  const safeWidth = positive(width, 1);
  const safeHeight = positive(height, 1);
  const safeInnerWidth = THREE.MathUtils.clamp(
    positive(innerWidth, safeWidth * 0.8),
    MIN_SIZE,
    safeWidth - MIN_SIZE * 2,
  );
  const safeInnerHeight = THREE.MathUtils.clamp(
    positive(innerHeight, safeHeight * 0.8),
    MIN_SIZE,
    safeHeight - MIN_SIZE * 2,
  );
  const safeRadius = clampRadius(safeWidth, safeHeight, radius);
  const safeInnerRadius = clampRadius(safeInnerWidth, safeInnerHeight, innerRadius);
  const shape = new THREE.Shape();
  const opening = new THREE.Path();

  addRoundedRectangle(shape, safeWidth, safeHeight, safeRadius, false);
  addRoundedRectangle(opening, safeInnerWidth, safeInnerHeight, safeInnerRadius, true);
  shape.holes.push(opening);

  return extrude(shape, depth, Math.min(safeRadius, safeInnerRadius), bevelSegments);
}

export interface RoundedPlaneGeometryOptions {
  width: number;
  height: number;
  radius: number;
}

export function createRoundedPlaneGeometry({
  width,
  height,
  radius,
}: RoundedPlaneGeometryOptions): THREE.ShapeGeometry {
  const safeWidth = positive(width, 1);
  const safeHeight = positive(height, 1);
  const shape = new THREE.Shape();

  addRoundedRectangle(
    shape,
    safeWidth,
    safeHeight,
    clampRadius(safeWidth, safeHeight, radius),
    false,
  );

  const geometry = new THREE.ShapeGeometry(shape, 20);
  geometry.computeVertexNormals();
  return geometry;
}
