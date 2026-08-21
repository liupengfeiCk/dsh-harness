/** Locale bundles for the memory ("记忆") settings section. */

/** Locale keys this surface renders. */
export type MemoryKey =
  | 'nav' | 'sectionIntro'
  | 'loading' | 'error'
  | 'scopeTeam' | 'scopeTeamRole' | 'scopeProject'
  | 'layerL1' | 'layerL2' | 'layerL3'
  | 'emptyLayer'
  | 'statusTitle' | 'statusL0' | 'statusL1' | 'statusL2' | 'statusL3'
  | 'statusLastExtracted' | 'statusNever'
  | 'view' | 'viewTitle' | 'close'
  | 'delete' | 'deleteTitle' | 'deleteDescription' | 'deleteConfirm' | 'deleting'
  | 'bindTitle' | 'bindHint' | 'bindRoleLabel' | 'bindRolePlaceholder'
  | 'loadBindings' | 'bind' | 'unbind' | 'boundAssets' | 'noBindings'
  | 'configTitle' | 'configEnabled' | 'configRefinementPlan'
  | 'configCompression' | 'configCompressionFollow' | 'configCompressionPlan'
  | 'configCompressionPlanId' | 'configInjectionLimit' | 'configCompressionLine' | 'configRetainLine'
  | 'percent'

/** English copy. */
export const en: Record<MemoryKey, string> = {
  nav: 'Memory',
  sectionIntro:
    'Memory keeps your fixed assets in three isolated scopes — team, team+role, and project — '
    + 'each across three layers: atomic facts (L1), scene profiles (L2), and personas (L3). '
    + 'Inspect, delete, and assemble role bindings from here.',
  loading: 'Loading memory…',
  error: 'Could not load memory.',
  scopeTeam: 'Team',
  scopeTeamRole: 'Team + role',
  scopeProject: 'Project',
  layerL1: 'Atomic facts (L1)',
  layerL2: 'Scenes (L2)',
  layerL3: 'Personas (L3)',
  emptyLayer: 'No memories here yet.',
  statusTitle: 'Pipeline status',
  statusL0: 'Original turns',
  statusL1: 'Atomic facts',
  statusL2: 'Scenes',
  statusL3: 'Personas',
  statusLastExtracted: 'Last extraction',
  statusNever: 'never',
  view: 'View',
  viewTitle: 'Memory detail',
  close: 'Close',
  delete: 'Delete',
  deleteTitle: 'Delete this memory?',
  deleteDescription: 'This memory is removed and any role binding that referenced it is cleared.',
  deleteConfirm: 'Delete',
  deleting: 'Deleting…',
  bindTitle: 'Role assembly',
  bindHint: 'Bind the active memories to a role so its sessions pull them in.',
  bindRoleLabel: 'Role id',
  bindRolePlaceholder: 'e.g. architect',
  loadBindings: 'Load',
  bind: 'Bind',
  unbind: 'Unbind',
  boundAssets: 'Bound assets',
  noBindings: 'No assets bound to this role.',
  configTitle: 'Configuration',
  configEnabled: 'Enabled',
  configRefinementPlan: 'Extraction plan',
  configCompression: 'Compression route',
  configCompressionFollow: 'Follow current route',
  configCompressionPlan: 'Pinned plan',
  configCompressionPlanId: 'Compression plan id',
  configInjectionLimit: 'Injection limit',
  configCompressionLine: 'Compression line',
  configRetainLine: 'Retention line',
  percent: '%',
}

/** Simplified Chinese copy. */
export const zh: Record<MemoryKey, string> = {
  nav: '记忆',
  sectionIntro:
    '记忆把固定资产放在三个正交作用域——团队、团队+角色、项目——每个作用域下分三层：'
    + '原子事实（L1）、场景（L2）、画像（L3）。在这里查看、删除，并为角色装配记忆。',
  loading: '正在加载记忆…',
  error: '无法加载记忆。',
  scopeTeam: '团队',
  scopeTeamRole: '团队+角色',
  scopeProject: '项目',
  layerL1: '原子事实（L1）',
  layerL2: '场景（L2）',
  layerL3: '画像（L3）',
  emptyLayer: '这里还没有记忆。',
  statusTitle: '提炼状态',
  statusL0: '原文轮次',
  statusL1: '原子事实',
  statusL2: '场景',
  statusL3: '画像',
  statusLastExtracted: '最近提炼',
  statusNever: '从未',
  view: '查看',
  viewTitle: '记忆详情',
  close: '关闭',
  delete: '删除',
  deleteTitle: '删除这条记忆？',
  deleteDescription: '该记忆将被删除，引用它的角色绑定也会一并清除。',
  deleteConfirm: '删除',
  deleting: '正在删除…',
  bindTitle: '角色装配',
  bindHint: '把当前记忆绑定到某个角色，让该角色的会话拉取它们。',
  bindRoleLabel: '角色 id',
  bindRolePlaceholder: '例如 architect',
  loadBindings: '加载',
  bind: '绑定',
  unbind: '解绑',
  boundAssets: '已绑定资产',
  noBindings: '该角色还没有绑定任何资产。',
  configTitle: '配置',
  configEnabled: '启用',
  configRefinementPlan: '提炼模型方案',
  configCompression: '压缩模型路由',
  configCompressionFollow: '跟随当前路由',
  configCompressionPlan: '指定方案',
  configCompressionPlanId: '压缩方案 id',
  configInjectionLimit: '统一注入上限',
  configCompressionLine: '原文压缩线',
  configRetainLine: '原文保留线',
  percent: '%',
}
