import { Box3, Sphere, Vector3 } from 'three';

export type SceneBounds = {
  box: Box3;
  center: Vector3;
  size: Vector3;
  radius: number;
  sphere: Sphere;
};

const temp = new Vector3();

const isFinitePoint = (value: Vector3): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * ratio)));
  return values[index];
};

export const computeSceneBounds = (splatMesh: any, maxSamples = 18000): SceneBounds => {
  const box = new Box3();
  const center = new Vector3();
  const size = new Vector3();
  const sphere = new Sphere();
  const sampledPoints: Vector3[] = [];

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
    if (!isFinitePoint(temp)) continue;
    box.expandByPoint(temp);
    sampledPoints.push(temp.clone());
    sampled++;
  }

  if (sampled < splatCount) {
    splatMesh.getSplatCenter(splatCount - 1, temp, true);
    if (isFinitePoint(temp)) {
      box.expandByPoint(temp);
      sampledPoints.push(temp.clone());
    }
  }

  if (sampledPoints.length === 0 || box.isEmpty()) {
    box.set(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    box.getCenter(center);
    box.getSize(size);
    box.getBoundingSphere(sphere);
    return { box, center, size, radius: sphere.radius, sphere };
  }

  const robustBox = new Box3();
  if (sampledPoints.length >= 50) {
    const xs = sampledPoints.map((point) => point.x).sort((a, b) => a - b);
    const ys = sampledPoints.map((point) => point.y).sort((a, b) => a - b);
    const zs = sampledPoints.map((point) => point.z).sort((a, b) => a - b);
    robustBox.set(
      new Vector3(percentile(xs, 0.02), percentile(ys, 0.02), percentile(zs, 0.02)),
      new Vector3(percentile(xs, 0.98), percentile(ys, 0.98), percentile(zs, 0.98)),
    );
  } else {
    robustBox.copy(box);
  }

  const robustSphere = new Sphere();
  robustBox.getBoundingSphere(robustSphere);
  box.getBoundingSphere(sphere);

  const shouldUseRobust = robustSphere.radius > 0 && sphere.radius > robustSphere.radius * 1.8;
  const selectedBox = shouldUseRobust ? robustBox : box;
  const selectedSphere = shouldUseRobust ? robustSphere : sphere;

  selectedBox.getCenter(center);
  selectedBox.getSize(size);
  sphere.copy(selectedSphere);

  return { box: selectedBox.clone(), center, size, radius: sphere.radius, sphere };
};
