export function filter({ projectV2s }) {
  let projects = projectV2s.all();
  projects = projects.filter(async project => {
    return project.isActive === true;
  });
  return projects;
}
