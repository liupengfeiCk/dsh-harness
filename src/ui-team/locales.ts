/** Locale bundles for the user-defined team ("编制表") settings section. */

/** Locale keys this surface renders. */
export type TeamSettingsKey =
  | 'nav' | 'sectionIntro'
  | 'loading' | 'error' | 'unavailable'
  | 'userTrust' | 'systemTrust'
  | 'enabled' | 'disabled'
  | 'brokenBadge'
  | 'rolesLabel' | 'roleCount'
  | 'create' | 'creating' | 'createTitle' | 'createIntro'
  | 'detailTitle' | 'detailIntro' | 'save' | 'saving' | 'cancel' | 'close'
  | 'roleIdLabel' | 'roleIdPlaceholder'
  | 'roleDescriptionLabel' | 'roleDescriptionPlaceholder'
  | 'roleBodyLabel' | 'roleBodyPlaceholder' | 'noBodies'
  | 'roleMemoryLabel' | 'memoryOneShot' | 'memoryPersistent'
  | 'rolePromptLabel' | 'rolePromptPlaceholder'
  | 'addRole' | 'removeRole'
  | 'idLabel' | 'idPlaceholder'
  | 'nameLabel' | 'namePlaceholder'
  | 'descriptionLabel' | 'descriptionPlaceholder'
  | 'delete' | 'deleteTitle' | 'deleteDescription' | 'deleteConfirm' | 'deleting'
  | 'openLocation' | 'showLocation' | 'revealedPathLabel'
  | 'idRequired' | 'idInvalid' | 'idTaken'
  | 'roleIdRequired' | 'roleBodyRequired'
  | 'noDescription'

/** English copy. */
export const en: Record<TeamSettingsKey, string> = {
  nav: 'Teams',
  sectionIntro:
    'Teams are your own role rosters ("编制表"), stored independently from subagents. '
    + 'Each role binds a soul (the role\'s own prompt) to a body (a user-defined subagent id '
    + 'that bounds the role\'s capability surface). A team-shaped deployment delegates to roles by name.',
  loading: 'Loading teams…',
  error: 'Could not load teams.',
  unavailable: 'No user-defined teams yet. Create one to compose a roster of roles.',
  userTrust: 'Custom',
  systemTrust: 'Built-in',
  enabled: 'Enabled',
  disabled: 'Disabled',
  brokenBadge: 'Failed to load',
  rolesLabel: 'Roles',
  roleCount: 'roles',
  create: 'Create',
  creating: 'Creating…',
  createTitle: 'Create team',
  createIntro:
    'A team is one directory holding a team.yml. The identifier becomes its directory name '
    + 'and cannot be changed later; the roster of roles is edited in the team\'s detail view.',
  detailTitle: 'Edit team',
  detailIntro:
    'Each role binds a soul (its own prompt, injected as the child\'s persona) to a body '
    + '(a subagent id bounding what the role may do). Memory decides whether the role is a '
    + 'fresh child per call or a durable one that remembers earlier work.',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  close: 'Close',
  roleIdLabel: 'Role id',
  roleIdPlaceholder: 'A stable id the model names this role by',
  roleDescriptionLabel: 'Description',
  roleDescriptionPlaceholder: 'One sentence on what this role is for',
  roleBodyLabel: 'Body',
  roleBodyPlaceholder: 'The subagent bounding this role\'s capability surface',
  noBodies: 'No usable subagents',
  roleMemoryLabel: 'Memory',
  memoryOneShot: 'One-shot',
  memoryPersistent: 'Persistent',
  rolePromptLabel: 'Soul prompt',
  rolePromptPlaceholder: 'Who this role is and how it works (multiline)',
  addRole: 'Add role',
  removeRole: 'Remove',
  idLabel: 'Identifier',
  idPlaceholder: 'The id the delegation refers to the team by',
  nameLabel: 'Name',
  namePlaceholder: 'Display name of the team (defaults to the id)',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'One sentence on what this team is for',
  delete: 'Delete',
  deleteTitle: 'Delete this team?',
  deleteDescription:
    'The team directory is deleted. A role already running keeps working; new delegations cannot select it.',
  deleteConfirm: 'Delete',
  deleting: 'Deleting…',
  openLocation: 'Open folder',
  showLocation: 'Show location',
  revealedPathLabel: 'Team files:',
  idRequired: 'Give the team an identifier.',
  idInvalid: 'Use lowercase letters, digits, and hyphens, starting with a letter or digit.',
  idTaken: 'A team with this identifier already exists.',
  roleIdRequired: 'Give every role an identifier.',
  roleBodyRequired: 'Bind every role to a body (a subagent).',
  noDescription: 'No description.',
}

/** Simplified Chinese copy. */
export const zh: Record<TeamSettingsKey, string> = {
  nav: '团队',
  sectionIntro:
    '团队是你自定义的角色编制表，与子代理分开存储。每个角色把一个灵魂（角色自己的提示词）'
    + '绑定到一个身体（一个用户自定义子代理 id，界定该角色的能力边界）。团队形态的部署按名称把任务委派给角色。',
  loading: '正在加载团队…',
  error: '无法加载团队。',
  unavailable: '还没有自定义团队。创建一个，即可编排一份角色编制表。',
  userTrust: '自定义',
  systemTrust: '内置',
  enabled: '已启用',
  disabled: '已停用',
  brokenBadge: '加载失败',
  rolesLabel: '角色',
  roleCount: '个角色',
  create: '创建',
  creating: '正在创建…',
  createTitle: '创建团队',
  createIntro:
    '一个团队即一个目录，内含 team.yml。标识符将成为目录名，事后无法更改；角色编制表在团队的详情视图里编辑。',
  detailTitle: '编辑团队',
  detailIntro:
    '每个角色把灵魂（自己的提示词，注入为子代理的 persona）绑定到一个身体（界定该角色能力范围的子代理 id）。'
    + '记忆模式决定该角色是每次调用都全新、还是保留可续对话的长期角色。',
  save: '保存',
  saving: '正在保存…',
  cancel: '取消',
  close: '关闭',
  roleIdLabel: '角色 id',
  roleIdPlaceholder: '模型按此 id 引用该角色',
  roleDescriptionLabel: '职责描述',
  roleDescriptionPlaceholder: '一句话说明该角色的职责',
  roleBodyLabel: '绑定身体',
  roleBodyPlaceholder: '界定该角色能力范围的子代理',
  noBodies: '没有可用子代理',
  roleMemoryLabel: '记忆模式',
  memoryOneShot: '一次性',
  memoryPersistent: '长期',
  rolePromptLabel: '灵魂提示词',
  rolePromptPlaceholder: '这个角色是谁、该怎么干活（多行）',
  addRole: '添加角色',
  removeRole: '移除',
  idLabel: '标识符',
  idPlaceholder: '委派按此标识符引用该团队',
  nameLabel: '名称',
  namePlaceholder: '团队显示名称（缺省用 id）',
  descriptionLabel: '描述',
  descriptionPlaceholder: '一句话说明该团队的用途',
  delete: '删除',
  deleteTitle: '删除该团队？',
  deleteDescription: '团队目录将被删除。已在运行的角色不受影响；新委派将无法再选择它。',
  deleteConfirm: '删除',
  deleting: '正在删除…',
  openLocation: '打开目录',
  showLocation: '查看路径',
  revealedPathLabel: '团队文件：',
  idRequired: '请填写团队标识符。',
  idInvalid: '只能使用小写字母、数字与连字符，且以字母或数字开头。',
  idTaken: '该标识符已被占用。',
  roleIdRequired: '请为每个角色填写标识符。',
  roleBodyRequired: '请为每个角色绑定身体（一个子代理）。',
  noDescription: '暂无描述。',
}
