// One InstancedMesh of unit boxes (or another unit geometry) from a list of {position, scale, colour}.
// Every repeated thing in City3D goes through here, so a whole layer (all windows, all lane dashes…)
// is ONE draw call. Instances are written once per `items` change, never per frame.

import { memo, useLayoutEffect, useRef, type JSX, type ReactNode } from "react";
import * as THREE from "three";

export type BoxItem = {
  p: readonly [number, number, number];
  s: readonly [number, number, number];
  /** rotation around y (radians) */
  ry?: number;
  /** per-instance colour; falls back to the material colour */
  c?: string;
};

export const InstancedBoxes = memo(function InstancedBoxes({
  items,
  children,
  geometry,
  castShadow = false,
  receiveShadow = false,
  meshRef,
}: {
  items: readonly BoxItem[];
  /** the material (and optionally geometry) as JSX children */
  children: ReactNode;
  /** custom geometry; defaults to a 1×1×1 box */
  geometry?: ReactNode;
  castShadow?: boolean;
  receiveShadow?: boolean;
  meshRef?: React.RefObject<THREE.InstancedMesh | null>;
}): JSX.Element {
  const localRef = useRef<THREE.InstancedMesh>(null);
  const ref = meshRef ?? localRef;
  const hasColor = items.some((i) => i.c);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    items.forEach((it, i) => {
      dummy.position.set(it.p[0], it.p[1], it.p[2]);
      dummy.scale.set(it.s[0], it.s[1], it.s[2]);
      dummy.rotation.set(0, it.ry ?? 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Instance colour multiplies the material colour (keep the material white when using it).
      if (hasColor) mesh.setColorAt(i, color.set(it.c ?? "#ffffff"));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, hasColor, ref]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, Math.max(1, items.length)]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    >
      {geometry ?? <boxGeometry args={[1, 1, 1]} />}
      {children}
    </instancedMesh>
  );
});
