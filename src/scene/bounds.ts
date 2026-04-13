import { Box3, Sphere, Vector3 } from 'three';

export type SceneBounds = {
  box: Box3;
  center: Vector3;
  size: Vector3;
  radius: number;
  sphere: Sphere;
};

const temp = new Vector3();

export const computeSceneBounds = (splatMesh: any, maxSamples = 18000): SceneBounds => {
  const box = new Box3();
  const center = new Vector3();
  const size = new Vector3();
  const sphere = new Sphere();

  const splatCount: number = Math.max(0, splatMesh?.getSplatCount?.() ?? 0);
  if (splatCount === 0) {
    box.set(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    box.getCenter(center);
    box.getSize(size);
    box.getBoundingSphere(sphere);
    return { box, center, size, radius: sphere.radius, sphere };
  }

  const step = Math.max(1, Math.floor(splatCount / maxSamples));
  let sampled = 0;

  for (let i = 0; i < splatCount; i += step) {
    splatMesh.getSplatCenter(i, temp, true);
    box.expandByPoint(temp);
    sampled++;
  }

  if (sampled < splatCount) {
    splatMesh.getSplatCenter(splatCount - 1, temp, true);
    box.expandByPoint(temp);
  }

  box.getCenter(center);
  box.getSize(size);
  box.getBoundingSphere(sphere);

  return { box, center, size, radius: sphere.radius, sphere };
};
