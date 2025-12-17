export async function index({ workspaceV2s }) {
  let workspaces = await workspaceV2s.all();
  
  // Should add await here
  return workspaces.sort(async (a, b) => {
    return a.name.localeCompare(b.name);
  });
}

export async function filter({ projectV2s }) {
  let projects = await projectV2s.all();
  
  // Should add await here
  projects = projects.filter(async project => {
    return project.isActive === true;
  });
  
  return projects;
}

export async function where({ varV2s }) {
  // Should add await here
  return await varV2s.where(async function (v) {
    return v.someCondition === true;
  });
}
