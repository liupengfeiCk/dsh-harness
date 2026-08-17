/** Locale bundles for the user-defined subagent settings section. */

/** Locale keys this surface renders. */
export type SubagentSettingsKey =
  | 'nav' | 'sectionIntro'
  | 'loading' | 'error' | 'unavailable'
  | 'userTrust' | 'systemTrust'
  | 'enabled' | 'disabled'
  | 'brokenBadge'
  | 'create' | 'creating' | 'createTitle' | 'createIntro'
  | 'copyOf'
  | 'delete' | 'deleteTitle' | 'deleteDescription' | 'deleteConfirm' | 'deleting'
  | 'view' | 'viewTitle' | 'viewIntro'
  | 'edit' | 'editTitle' | 'editIntro' | 'save' | 'saving' | 'cancel' | 'close'
  | 'idLabel' | 'idPlaceholder'
  | 'descriptionLabel' | 'descriptionPlaceholder'
  | 'personaLabel' | 'personaPlaceholder'
  | 'inheritParentLabel' | 'inheritParentHint'
  | 'toolsTitle' | 'toolsLabel' | 'toolInstalled' | 'toolUninstalled' | 'toolExprDisabled' | 'model' | 'inheritModel'
  | 'openLocation' | 'showLocation' | 'revealedPathLabel'
  | 'idRequired' | 'idInvalid' | 'idTaken'
  | 'noDescription'

/** English copy. */
export const en: Record<SubagentSettingsKey, string> = {
  nav: 'Subagents',
  sectionIntro:
    'Subagents are your own helper agents, stored independently from agent presets. '
    + 'A main agent can delegate to an enabled subagent by name. Each subagent is a plugin '
    + 'tree — its persona, tools, and prompt sections — that is mounted onto the delegated child.',
  loading: 'Loading subagents…',
  error: 'Could not load subagents.',
  unavailable: 'No user-defined subagents yet. Create one to delegate work to a custom helper.',
  userTrust: 'Custom',
  systemTrust: 'Built-in',
  enabled: 'Enabled',
  disabled: 'Disabled',
  brokenBadge: 'Failed to load',
  create: 'Create',
  creating: 'Creating…',
  createTitle: 'Create subagent',
  createIntro:
    'The whole subagent is copied on this machine. The identifier becomes its directory name '
    + 'and cannot be changed later; everything else is edited in the subagent\'s own files.',
  copyOf: 'Copied from',
  delete: 'Delete',
  deleteTitle: 'Delete this subagent?',
  deleteDescription:
    'The subagent directory is deleted. A delegated child already running on it keeps working; '
    + 'new delegations cannot select it.',
  deleteConfirm: 'Delete',
  deleting: 'Deleting…',
  view: 'View',
  viewTitle: 'View subagent',
  viewIntro: 'The composition this subagent mounts when delegated. Read-only.',
  edit: 'Edit',
  editTitle: 'Edit subagent',
  editIntro:
    'Changes apply to delegations from now on; a child already running keeps the composition it '
    + 'began with.',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  close: 'Close',
  idLabel: 'Identifier',
  idPlaceholder: 'The id the main agent refers to it by',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'One sentence on what this subagent is for',
  personaLabel: 'Persona',
  personaPlaceholder: 'Who this subagent is and how it works',
  inheritParentLabel: 'Inherit the main agent',
  inheritParentHint:
    'When on, the delegated child layers this subagent on top of the main agent\'s tools and prompt. '
    + 'When off, the child uses only this subagent\'s own configuration.',
  toolsTitle: 'Tools',
  toolsLabel: 'Tools',
  toolInstalled: 'Enabled',
  toolUninstalled: 'Not enabled',
  toolExprDisabled: 'Locked by the deployment',
  model: 'Model',
  inheritModel: 'Inherit parent (default)',
  openLocation: 'Open folder',
  showLocation: 'Show location',
  revealedPathLabel: 'Subagent files:',
  idRequired: 'Give the subagent an identifier.',
  idInvalid: 'Use lowercase letters, digits, and hyphens, starting with a letter or digit.',
  idTaken: 'A subagent with this identifier already exists.',
  noDescription: 'No description.',
}

/** Simplified Chinese copy. */
export const zh: Record<SubagentSettingsKey, string> = {
  nav: '子代理',
  sectionIntro:
    '子代理是你自定义的帮手 Agent，与 Agent 预设完全分开存储。主 Agent 可按名称把工作委派给已启用的子代理。'
    + '每个子代理即一棵插件树 —— 它的人设、工具与提示词段 —— 在委派时挂到派出的子 Agent 上。',
  loading: '正在加载子代理…',
  error: '无法加载子代理。',
  unavailable: '还没有自定义子代理。创建一个，即可把工作委派给自定义帮手。',
  userTrust: '自定义',
  systemTrust: '内置',
  enabled: '已启用',
  disabled: '已停用',
  brokenBadge: '加载失败',
  create: '创建',
  creating: '正在创建…',
  createTitle: '创建子代理',
  createIntro: '整个子代理会在本机复制一份。标识符将成为目录名，事后无法更改；其余内容之后直接在子代理自己的文件里编辑。',
  copyOf: '复制自',
  delete: '删除',
  deleteTitle: '删除该子代理？',
  deleteDescription: '子代理目录将被删除。已在其上运行的委派子 Agent 不受影响；新委派将无法再选择它。',
  deleteConfirm: '删除',
  deleting: '正在删除…',
  view: '查看',
  viewTitle: '查看子代理',
  viewIntro: '该子代理被委派时挂载的插件树内容。只读。',
  edit: '编辑',
  editTitle: '编辑子代理',
  editIntro: '改动对此后发起的委派生效；已在运行的子 Agent 保持它开始时的组装。',
  save: '保存',
  saving: '正在保存…',
  cancel: '取消',
  close: '关闭',
  idLabel: '标识符',
  idPlaceholder: '主 agent 按此标识符引用它',
  descriptionLabel: '描述',
  descriptionPlaceholder: '一句话说明该子代理的用途',
  personaLabel: '人设',
  personaPlaceholder: '这个子代理是谁、该怎么干活',
  inheritParentLabel: '继承主 agent',
  inheritParentHint:
    '开启后，派出的子 agent 在主 agent 的工具和提示词之上叠加本子代理自己的配置；'
    + '关闭后仅使用本子代理自己的配置。',
  toolsTitle: '工具',
  toolsLabel: '工具',
  toolInstalled: '已启用',
  toolUninstalled: '未启用',
  toolExprDisabled: '部署锁定的',
  model: '模型',
  inheritModel: '继承父级（默认）',
  openLocation: '打开目录',
  showLocation: '查看路径',
  revealedPathLabel: '子代理文件：',
  idRequired: '请填写标识符。',
  idInvalid: '只能使用小写字母、数字与连字符，且以字母或数字开头。',
  idTaken: '该标识符已被占用。',
  noDescription: '暂无描述。',
}
