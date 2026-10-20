export type PermissionDef = {
  key: string;
  label: string;
  group: string;
};

export const PERMISSIONS: PermissionDef[] = [
  { key: 'createProject', label: 'Create projects', group: 'Projects' },
  { key: 'manageOwnProjects', label: 'Edit / delete own projects', group: 'Projects' },
  { key: 'editProjectLogo', label: 'Change project logo', group: 'Projects' },
  { key: 'editProject', label: 'Edit project name and description', group: 'Projects' },
  { key: 'createTasks', label: 'Create tasks', group: 'Tasks' },
  { key: 'editTasks', label: 'Edit tasks', group: 'Tasks' },
  { key: 'deleteTasks', label: 'Delete any task', group: 'Tasks' },
  { key: 'reviewTasks', label: 'Approve or request changes on submitted work', group: 'Tasks' },
  { key: 'manageReports', label: 'Review and answer problem reports', group: 'Reports' },
  { key: 'managePerformance', label: 'Review and correct performance records', group: 'Performance' },
  { key: 'approveUsers', label: 'Approve or reject new accounts', group: 'Users' },
  { key: 'viewRoles', label: 'View roles page (read only)', group: 'Roles' },
  { key: 'manageRoles', label: 'Manage roles (powerful)', group: 'Roles' },
];