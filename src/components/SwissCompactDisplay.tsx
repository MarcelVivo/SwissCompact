"use client";

import { forwardRef, useEffect, useMemo } from "react";
import type { ThreeElements } from "@react-three/fiber";
import * as THREE from "three";

import {
  createRoundedPanelGeometry,
  createRoundedPlaneGeometry,
  createRoundedRingGeometry,
} from "./RoundedPanelGeometry";

export type SwissCompactDisplayOrientation = "landscape" | "portrait";

export interface SwissCompactDisplayProps
  extends Omit<ThreeElements["group"], "position" | "rotation"> {
  orientation?: SwissCompactDisplayOrientation;
  width?: number;
  height?: number;
  depth?: number;
  screenTexture?: THREE.Texture | null;
  position?: ThreeElements["group"]["position"];
  rotation?: ThreeElements["group"]["rotation"];
}

interface DisplayMetrics {
  width: number;
  height: number;
  depth: number;
  outerRadius: number;
  innerRadius: number;
  screenWidth: number;
  screenHeight: number;
  screenRadius: number;
  outerOpeningWidth: number;
  outerOpeningHeight: number;
  innerFrameWidth: number;
  innerFrameHeight: number;
  innerOpeningWidth: number;
  innerOpeningHeight: number;
  frameDepth: number;
  innerFrameDepth: number;
  bodyDepth: number;
  backDepth: number;
  glassDepth: number;
  frontZ: number;
}

function safeDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveDimensions(
  orientation: SwissCompactDisplayOrientation,
  width: number,
  height: number,
): [number, number] {
  const safeWidth = safeDimension(width, 16);
  const safeHeight = safeDimension(height, 9);
  const longSide = Math.max(safeWidth, safeHeight);
  const shortSide = Math.min(safeWidth, safeHeight);

  return orientation === "portrait"
    ? [shortSide, longSide]
    : [longSide, shortSide];
}

function createMetrics(
  orientation: SwissCompactDisplayOrientation,
  width: number,
  height: number,
  depth: number,
): DisplayMetrics {
  const [displayWidth, displayHeight] = resolveDimensions(orientation, width, height);
  const displayDepth = safeDimension(depth, 0.65);
  const shortSide = Math.min(displayWidth, displayHeight);
  const bezelUnit = shortSide * 0.095;
  const screenWidth = displayWidth * 0.82;
  const screenHeight = displayHeight * 0.82;

  return {
    width: displayWidth,
    height: displayHeight,
    depth: displayDepth,
    outerRadius: shortSide * 0.072,
    innerRadius: shortSide * 0.043,
    screenWidth,
    screenHeight,
    screenRadius: shortSide * 0.029,
    outerOpeningWidth: screenWidth + bezelUnit * 0.42,
    outerOpeningHeight: screenHeight + bezelUnit * 0.42,
    innerFrameWidth: screenWidth + bezelUnit * 0.37,
    innerFrameHeight: screenHeight + bezelUnit * 0.37,
    innerOpeningWidth: screenWidth + bezelUnit * 0.1,
    innerOpeningHeight: screenHeight + bezelUnit * 0.1,
    frameDepth: Math.max(displayDepth * 0.24, shortSide * 0.012),
    innerFrameDepth: Math.max(displayDepth * 0.13, shortSide * 0.007),
    bodyDepth: displayDepth * 0.84,
    backDepth: displayDepth * 0.12,
    glassDepth: Math.max(displayDepth * 0.035, 0.018),
    frontZ: displayDepth * 0.5,
  };
}

export const SwissCompactDisplay = forwardRef<
  THREE.Group,
  SwissCompactDisplayProps
>(function SwissCompactDisplay(
  {
    orientation = "landscape",
    width = 16,
    height = 9,
    depth = 0.65,
    screenTexture = null,
    position,
    rotation,
    ...groupProps
  },
  ref,
) {
  const metrics = useMemo(
    () => createMetrics(orientation, width, height, depth),
    [orientation, width, height, depth],
  );

  const geometries = useMemo(() => {
    const bodyInset = Math.min(metrics.width, metrics.height) * 0.012;
    const backInset = Math.min(metrics.width, metrics.height) * 0.022;

    return {
      outerFrame: createRoundedRingGeometry({
        width: metrics.width,
        height: metrics.height,
        innerWidth: metrics.outerOpeningWidth,
        innerHeight: metrics.outerOpeningHeight,
        depth: metrics.frameDepth,
        radius: metrics.outerRadius,
        innerRadius: metrics.innerRadius * 1.16,
      }),
      innerFrame: createRoundedRingGeometry({
        width: metrics.innerFrameWidth,
        height: metrics.innerFrameHeight,
        innerWidth: metrics.innerOpeningWidth,
        innerHeight: metrics.innerOpeningHeight,
        depth: metrics.innerFrameDepth,
        radius: metrics.innerRadius * 1.12,
        innerRadius: metrics.screenRadius * 1.12,
      }),
      glass: createRoundedPanelGeometry({
        width: metrics.screenWidth,
        height: metrics.screenHeight,
        depth: metrics.glassDepth,
        radius: metrics.screenRadius,
        bevelSegments: 8,
      }),
      screen: createRoundedPlaneGeometry({
        width: metrics.screenWidth,
        height: metrics.screenHeight,
        radius: metrics.screenRadius * 0.92,
      }),
      body: createRoundedPanelGeometry({
        width: metrics.width - bodyInset,
        height: metrics.height - bodyInset,
        depth: metrics.bodyDepth,
        radius: metrics.outerRadius * 0.94,
        bevelSegments: 8,
      }),
      backPlate: createRoundedPanelGeometry({
        width: metrics.width - backInset,
        height: metrics.height - backInset,
        depth: metrics.backDepth,
        radius: metrics.outerRadius * 0.86,
        bevelSegments: 8,
      }),
    };
  }, [metrics]);

  useEffect(
    () => () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
    },
    [geometries],
  );

  const bodyZ = -metrics.depth * 0.5 + metrics.backDepth + metrics.bodyDepth * 0.5;
  const backZ = -metrics.depth * 0.5 + metrics.backDepth * 0.5;
  const outerFrameZ = metrics.frontZ - metrics.frameDepth * 0.5;
  const innerFrameZ = metrics.frontZ - metrics.innerFrameDepth * 0.46;
  const screenZ = metrics.frontZ + metrics.glassDepth * 0.2;
  const glassZ = metrics.frontZ + metrics.glassDepth * 0.74;

  return (
    <group
      ref={ref}
      name="DisplayRoot"
      position={position}
      rotation={rotation}
      {...groupProps}
    >
      <mesh
        name="Body"
        geometry={geometries.body}
        position-z={bodyZ}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          color="#0b0c0e"
          metalness={0.35}
          roughness={0.45}
          clearcoat={0.32}
          clearcoatRoughness={0.24}
          envMapIntensity={1.1}
        />
      </mesh>

      <mesh
        name="BackPlate"
        geometry={geometries.backPlate}
        position-z={backZ}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          color="#07080a"
          metalness={0.42}
          roughness={0.36}
          clearcoat={0.42}
          clearcoatRoughness={0.2}
          envMapIntensity={1.05}
        />
      </mesh>

      <mesh
        name="OuterFrame"
        geometry={geometries.outerFrame}
        position-z={outerFrameZ}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          color="#060709"
          metalness={0.65}
          roughness={0.12}
          clearcoat={1}
          clearcoatRoughness={0.05}
          envMapIntensity={1.8}
        />
      </mesh>

      <mesh
        name="InnerFrame"
        geometry={geometries.innerFrame}
        position-z={innerFrameZ}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          color="#020304"
          metalness={0.7}
          roughness={0.15}
          clearcoat={1}
          clearcoatRoughness={0.065}
          envMapIntensity={1.65}
        />
      </mesh>

      <mesh
        name="Screen"
        geometry={geometries.screen}
        position-z={screenZ}
        renderOrder={1}
      >
        <meshBasicMaterial
          color={screenTexture ? "#ffffff" : "#010203"}
          map={screenTexture}
          toneMapped={false}
          side={THREE.FrontSide}
        />
      </mesh>

      <mesh
        name="Glass"
        geometry={geometries.glass}
        position-z={glassZ}
        renderOrder={2}
        receiveShadow
      >
        <meshPhysicalMaterial
          color="#b6c1ce"
          metalness={0}
          transmission={0.08}
          roughness={0.06}
          transparent
          opacity={0.9}
          ior={1.45}
          thickness={Math.max(metrics.depth * 0.16, 0.08)}
          clearcoat={1}
          clearcoatRoughness={0.025}
          envMapIntensity={2.1}
          depthWrite={false}
          side={THREE.FrontSide}
        />
      </mesh>
    </group>
  );
});

SwissCompactDisplay.displayName = "SwissCompactDisplay";

export default SwissCompactDisplay;
