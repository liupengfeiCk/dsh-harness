/** Locale bundles for the model-plan ("模型方案") settings section and the composer model-seat selector. */

/** Locale keys this surface renders. */
export type ModelPlanKey =
  | 'nav' | 'sectionIntro'
  | 'loading' | 'error' | 'unavailable'
  | 'create' | 'creating' | 'createTitle' | 'createIntro'
  | 'editTitle' | 'editIntro' | 'save' | 'saving' | 'cancel' | 'close'
  | 'idLabel' | 'idPlaceholder'
  | 'modelLabel' | 'modelPlaceholder'
  | 'paramsLabel' | 'paramsHint' | 'addParam' | 'paramKeyLabel' | 'paramKeyPlaceholder'
  | 'paramValueLabel' | 'paramValuePlaceholder' | 'removeParam'
  | 'temperatureKey' | 'maxTokensKey' | 'stopKey' | 'reasoningEffortKey'
  | 'reasoningProviderDefault'
  | 'paramsEmpty'
  | 'keyRequired' | 'valueInvalid'
  | 'reasoningUnavailable' | 'reasoningUnsupported'
  | 'idRequired' | 'idInvalid' | 'idTaken'
  | 'providerDefaultBadge' | 'brokenBadge'
  | 'setDefault' | 'defaultLabel'
  | 'delete' | 'deleteTitle' | 'deleteDescription' | 'deleteConfirm' | 'deleting'
  | 'modelRequired'
  | 'noPlans' | 'noPlansHint' | 'paramSummary' | 'paramCount'
  | 'customKeyNote'
  | 'seatPrefix' | 'seatEmpty' | 'seatHint' | 'seatLocked' | 'seatSelect' | 'seatSelectAria'
  | 'seatOverrides' | 'seatOverrideHint' | 'seatClearOverrides' | 'seatSelectRejected'
  | 'seatDefaultPlan'
  | 'brokenPlan'

/** English copy. */
export const en: Record<ModelPlanKey, string> = {
  nav: 'Model plans',
  sectionIntro:
    'Model plans are your fixed assets: each binds a display name to a provider/model plus a bag of '
    + 'params. A session binds a plan (not a bare model), so editing a plan is picked up by every '
    + 'session already bound to it.',
  loading: 'Loading model plans…',
  error: 'Could not load model plans.',
  unavailable: 'No model plans yet. Create one to bind a session to a fixed provider/model.',
  create: 'Create',
  creating: 'Creating…',
  createTitle: 'Create model plan',
  createIntro:
    'A model plan binds a display name to a provider/model route and a bag of params. Pick the model '
    + 'from the provider-grouped pool; the params ride into every request assembled under this plan.',
  editTitle: 'Edit model plan',
  editIntro:
    'Edit the plan\'s name, its provider/model route, and its params bag. Sessions already bound to '
    + 'this plan follow the edit (they bind the plan, not a snapshot of it).',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  close: 'Close',
  idLabel: 'Identifier',
  idPlaceholder: 'Sessions bind to this plan by this identifier',
  modelLabel: 'Model',
  modelPlaceholder: 'Pick a model from the provider-grouped pool',
  paramsLabel: 'Params',
  paramsHint: 'Every param rides into the assembled request body.',
  addParam: 'Add param',
  paramKeyLabel: 'Key',
  paramKeyPlaceholder: 'e.g. temperature',
  paramValueLabel: 'Value',
  paramValuePlaceholder: 'A JSON scalar, e.g. 0.7 or "high"',
  removeParam: 'Remove',
  temperatureKey: 'Temperature',
  maxTokensKey: 'Max tokens',
  stopKey: 'Stop',
  reasoningEffortKey: 'Reasoning effort',
  reasoningProviderDefault: 'Provider default',
  paramsEmpty: 'No params — the model\'s defaults apply.',
  keyRequired: 'Give every param a key.',
  valueInvalid: 'The value must be a valid JSON scalar.',
  reasoningUnavailable: 'This model does not support a reasoning effort.',
  reasoningUnsupported: 'This model does not support a reasoning effort; remove the value to save.',
  providerDefaultBadge: 'Default',
  brokenBadge: 'Failed to load',
  setDefault: 'Set default',
  defaultLabel: 'Default plan',
  delete: 'Delete',
  deleteTitle: 'Delete this model plan?',
  deleteDescription:
    'The plan is removed. Sessions already bound to it keep their current plan params; new sessions '
    + 'cannot bind it.',
  deleteConfirm: 'Delete',
  deleting: 'Deleting…',
  idRequired: 'Give the plan an id.',
  idInvalid: 'Use a lowercase letter or digit followed by letters, digits, or dashes.',
  idTaken: 'A model plan with this identifier already exists.',
  modelRequired: 'Pick a model.',
  noPlans: 'No plans yet — create one to bind a session to a fixed model.',
  noPlansHint: 'Create one in Settings → Model plans.',
  paramSummary: 'params',
  paramCount: 'params',
  customKeyNote:
    'Custom keys are passed through into the request body. Registering a key does not mean the '
    + 'provider supports it.',
  seatPrefix: 'Plan: ',
  seatEmpty: 'Select a plan',
  seatHint: 'Model plan for this session',
  seatLocked: 'The conversation has started; the model plan can no longer be changed.',
  seatSelect: 'Model plan',
  seatSelectAria: 'Choose the model plan for this session',
  seatOverrides: 'Session overrides',
  seatOverrideHint: 'Temporarily adjust params for this session only.',
  seatClearOverrides: 'Clear overrides',
  seatSelectRejected: 'The session has already started; the plan binding was not changed.',
  seatDefaultPlan: 'Default plan',
  brokenPlan: 'Failed to load',
}

/** Simplified Chinese copy. */
export const zh: Record<ModelPlanKey, string> = {
  nav: '模型方案',
  sectionIntro:
    '模型方案是你的固定资产：每个方案把一个显示名绑定到一个 provider/型号，外加一袋参数。'
    + '会话绑定的是方案（而非裸型号），所以编辑方案后，已绑定它的会话会跟着生效。',
  loading: '正在加载模型方案…',
  error: '无法加载模型方案。',
  unavailable: '还没有模型方案。创建一个，即可把会话绑定到固定的 provider/型号。',
  create: '创建',
  creating: '正在创建…',
  createTitle: '创建模型方案',
  createIntro:
    '一个模型方案把一个显示名绑定到一个 provider/型号，外加一袋参数。从按 provider 分组的型号池'
    + '里选型号；这袋参数会带进该方案下每次组装的请求。',
  editTitle: '编辑模型方案',
  editIntro:
    '编辑方案的名字、它的 provider/型号，以及参数袋。已绑定该方案的会话会跟随编辑（它们绑的是方案'
    + '本身，不是它的一份快照）。',
  save: '保存',
  saving: '正在保存…',
  cancel: '取消',
  close: '关闭',
  idLabel: '标识符',
  idPlaceholder: '会话按此标识符绑定该方案',
  modelLabel: '型号',
  modelPlaceholder: '从按 provider 分组的型号池里选',
  paramsLabel: '参数',
  paramsHint: '每个参数都会带进组装的请求体。',
  addParam: '添加参数',
  paramKeyLabel: '键',
  paramKeyPlaceholder: '例如 temperature',
  paramValueLabel: '值',
  paramValuePlaceholder: '合法的 JSON 标量，如 0.7 或 "high"',
  removeParam: '移除',
  temperatureKey: '温度',
  maxTokensKey: '最大 tokens',
  stopKey: '停止词',
  reasoningEffortKey: '推理档位',
  reasoningProviderDefault: '跟随服务商默认',
  paramsEmpty: '没有参数——使用型号默认值。',
  keyRequired: '请为每个参数填写键。',
  valueInvalid: '值必须是合法的 JSON 标量。',
  reasoningUnavailable: '该型号不支持思考档。',
  reasoningUnsupported: '该型号不支持思考档；请删除该值后再保存。',
  providerDefaultBadge: '默认',
  brokenBadge: '加载失败',
  setDefault: '设为默认',
  defaultLabel: '默认方案',
  delete: '删除',
  deleteTitle: '删除该模型方案？',
  deleteDescription:
    '该方案将被删除。已绑定它的会话继续使用当前的方案参数；新会话将无法再绑定它。',
  deleteConfirm: '删除',
  deleting: '正在删除…',
  idRequired: '请填写方案 id。',
  idInvalid: '以小写字母或数字开头，后面只能是小写字母、数字或短横线。',
  idTaken: '该标识符已被占用。',
  modelRequired: '请选择一个型号。',
  noPlans: '还没有方案——创建一个，即可把会话绑定到固定型号。',
  noPlansHint: '请到「设置 → 模型方案」里创建。',
  paramSummary: '个参数',
  paramCount: '个参数',
  customKeyNote:
    '自定义键将透传进请求体。登记不代表服务商支持该参数。',
  seatPrefix: '方案：',
  seatEmpty: '选择方案',
  seatHint: '本会话的模型方案',
  seatLocked: '对话已开始，模型方案无法再更改。',
  seatSelect: '模型方案',
  seatSelectAria: '选择本会话的模型方案',
  seatOverrides: '会话临时覆盖',
  seatOverrideHint: '仅对本会话临时调整参数。',
  seatClearOverrides: '清除覆盖',
  seatSelectRejected: '会话已开始，方案绑定未能更改。',
  seatDefaultPlan: '默认方案',
  brokenPlan: '加载失败',
}
