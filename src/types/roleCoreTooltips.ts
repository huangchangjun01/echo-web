/**
 * 角色内核核心概念名词的 tooltip 文案(集中维护,避免散落各处)。
 *
 * 设计原则:
 *  - 每条 1~2 句,突出"这个字段是什么 + 它在系统里起什么作用"
 *  - 后端公式/表里实际用到的字段要明确写出影响路径
 *  - 暂未生效的字段(如 C/E 在心情计算里)说明"留给后续 chat LLM"
 *  - 单步 0.05 上限的语义变化(从硬拒绝 → 软告警)也写在 OCEAN 介绍里
 */

/** 身份卡: 角色基本身份信息 */
export const TIP_IDENTITY =
  '角色的身份、外貌、年龄、性别等基本信息。LLM 据此建立"我是谁"的一致性,在所有对话里保持人设不漂移。'

/** 背景故事: 角色来历/经历/与用户关系 */
export const TIP_BACKGROUND =
  '角色的来历、过往经历、与用户的相识背景。LLM 据此推断角色的知识范围、情感反应模式,以及"为什么对用户有这种态度"。'

/** 性格标签: 简短性格描述 */
export const TIP_TRAITS_TAGS =
  '描述角色性格的简短关键词(温柔、活泼、毒舌 等)。多个标签组合,作为 OCEAN 五维之外的性格画像补充。LLM 在生成回复时会参考这些标签。'

/** 价值观: 角色坚守的核心理念 */
export const TIP_VALUES =
  '角色坚守的核心价值观(诚实、自由、家庭 等)。LLM 在涉及价值观判断的话题(如道德困境、立场选择)时会参考此字段调整立场。'

/** 语气偏好: 角色说话风格 */
export const TIP_SPEAKING_STYLE =
  '角色的说话风格(正式/俏皮/简洁/学术 等)。直接影响 LLM 生成回复的语言风格与措辞。越具体越能稳定输出。'

/** 禁忌话题: 角色不愿谈论 */
export const TIP_TABOOS =
  '角色不愿主动谈论的话题(暴力、政治敏感、隐私 等)。LLM 在涉及此类话题时会主动回避或婉转带过,避免破坏沉浸感。'

/** 示例对话: user→assistant 样例 */
export const TIP_EXAMPLE_DIALOGS =
  '用户与角色的简短对话样例(user→assistant)。LLM 通过 few-shot 学习模仿这个对话风格——越多越有代表性的样例,角色语气越稳定。'

/** OCEAN 五维性格: 整组介绍 */
export const TIP_OCEAN_INTRO =
  'OCEAN 是国际通用的大五人格模型(Openness/Conscientiousness/Extraversion/Agreeableness/Neuroticism),5 维 ∈ [-1, 1]。' +
  '本系统在心情计算(Mood)中使用 O、A、N 三维:O 与 A 提升心情基线,N 拉低;C、E 暂不参与心情计算,留给后续 chat LLM 推断对话风格。' +
  '保存时单步调整 > 0.05 会触发软告警(不阻断),便于审计大变更。'

/** OCEAN 单维度说明 */
export const OCEAN_TIPS = {
  O: '开放性(Openness):接受新经验、富有想象力的程度。本系统 +0.10 计入心情基线(越开放越积极)。',
  C: '尽责性(Conscientiousness):自律、条理化的程度。当前未直接计入心情,留给后续 chat LLM 参考(影响回复是否周全、是否给清单)。',
  E: '外向性(Extraversion):社交活跃、表达能量的程度。当前未直接计入心情,留给后续 chat LLM 参考(影响回复的主动程度与篇幅)。',
  A: '宜人性(Agreeableness):合作、信任他人的程度。本系统 +0.05 计入心情基线(越随和越积极)。',
  N: '神经质(Neuroticism):情绪波动、敏感性的程度(值越大越神经质)。本系统 -0.15 计入心情基线(负向影响心情)。',
} as const

/** 信念清单 */
export const TIP_BELIEFS =
  '角色对某些话题的立场记录。可手动新增,也可在"演化建议"中应用 LLM 自动抽取的建议;支持按话题检索历史立场。'

/** 关系值 */
export const TIP_RELATIONSHIP =
  '亲密/信任/满意度 三维关系值 ∈ [0, 1]。累积驱动:对话轮次、自我披露、正负反馈、陪伴天数等。会作为系统提示词的一部分影响 LLM 对"与用户当前关系"的判断。'

/** 置信度: 信念/立场的确信程度 */
export const TIP_CONFIDENCE =
  '置信度(Confidence):角色对该信念的确定程度 ∈ [0, 1]。值越高,角色在相关话题上表达此立场时越坚定;值越低,角色越倾向于保留、模糊回应。' +
  '由反馈/证据自动累积或人工编辑调整。'

/** 角色编辑器 */
export const TIP_ROLE_EDITOR =
  '管理当前角色的"内核"四要素:人格(Persona)、性格(OCEAN)、信念(Beliefs)、关系值(Relationship)。编辑后记得点"保存人格"/"设置当前性格"等按钮入库,变更会立即影响后续对话。'