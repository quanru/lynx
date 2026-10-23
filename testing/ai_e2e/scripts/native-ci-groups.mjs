// Five independent hosted devices, not five concurrent users of one device.
// Keep source YAML files intact, including their hooks, case order and retries.
const coreFiles = ['dom-focus', 'event', 'explorer', 'insert-text', 'pixel-views', 'text-event']
  .map(name => `cases/native/${name}.yaml`);
const videoFiles = ['video-attributes', 'video-basic', 'video-modes']
  .map(name => `cases/native/${name}.yaml`);
export const nativeCiGroups = [
  { id: 'android-core-boundary', platform: 'android', label: 'Android · Core and boundary',
    files: [...coreFiles, 'cases/native/video-boundary.yaml'] },
  { id: 'android-video', platform: 'android', label: 'Android · Video', files: [...videoFiles] },
  { id: 'ios-boundary', platform: 'ios', label: 'iOS · Boundary', files: ['cases/native/video-boundary.yaml'] },
  { id: 'ios-video', platform: 'ios', label: 'iOS · Video', files: [...videoFiles] },
  { id: 'ios-core-sparkling', platform: 'ios', label: 'iOS · Core and Sparkling',
    files: [...coreFiles, ...['homepage-routes', 'route-errors', 'router'].map(name => `cases/ios-sparkling/${name}.yaml`)] },
];

export function nativeCiGroup(env = process.env) {
  if (!env.NATIVE_CI_GROUP) return undefined;
  const group = nativeCiGroups.find(item => item.id === env.NATIVE_CI_GROUP);
  if (!group) throw new Error('Unknown native CI device group');
  return group;
}

export function requireNativeProjectGroup(projectName, env = process.env) {
  const group = nativeCiGroup(env);
  if (group && `${group.platform}-explorer` !== projectName) {
    throw new Error('Native CI device group does not belong to the selected project');
  }
  return group;
}

export function nativeCiFiles(projectName, original, env = process.env) {
  const group = nativeCiGroup(env);
  // The SDK loads both project definitions before applying --project.
  // run-ci and collection reject a group/project mismatch before execution.
  return group && `${group.platform}-explorer` === projectName
    ? { include: [...group.files] } : original;
}
