# 性格(OCEAN)功能页 — 全量测试方案

> 鉴于历史上此页 bug 多发(切预设丢值、auto-save 误覆盖、超范围 400、保存无反应、warning 误弹),本方案覆盖**所有用户场景 + 边界 + 错误路径**。
> 测试环境:`echo_test_001` 账号,新建独立测试角色,**不删数据**。

---

## 系统数据流回顾

```
[TraitSlider ×5]  →  local(OceanTraits, reactive)  →  emit('update:modelValue', local)
                                                       emit('save')
                                                              ↓
                                              RoleEditorPage.onTraitsSave()
                                                              ↓
                                              store.saveTraits(local)
                                                              ↓
                                              POST /api/role-core/traits
                                                              ↓
                                              role_traits 表 (单行/user_id+role_id)
                                                              ↓
                                              return TraitsResponse(200) + maxDelta + warning
```

**关键不变量**:
- `local` = 当前 UI 状态(可能在调 chip 后被覆写,等保存)
- `store.traits` = 上次服务端返回的真值(切角色/保存时刷新)
- `store.presets` = 用户级预设字典(companion_default 等)

---

## A. 数据加载与初始化

| # | 用例 | 期望 | 关键路径 |
|---|---|---|---|
| A1 | 打开新角色的"性格"页(无 traits 行) | 滑块全 0,presetType=companion_default,雷达图全灰 | 初始 local = props.modelValue |
| A2 | 已有 traits 的角色(全 0.5) | 滑块 5 维都显示 0.5,presetType 显示"标准陪伴" | store.traits 已正确反映 DB |
| A3 | 切到无 traits 的新角色(从 A2 角色切) | 滑块立刻全 0,不再显示 A2 的 0.5 | loadAll 触发 + loadCoreSnapshot 兜底 |
| A4 | 切到有 traits 的另一角色 | 滑块立刻显示新角色的 0.5 | loadAll + 三件套并行 |
| A5 | 预设列表加载(新账号首次) | 6 个默认预设自动 seed | ListPresets count==0 → seed 6 |
| A6 | 预设列表加载(已有 6 预设) | 直接返回 6 个,不再 seed | ListPresets count>0 → 直接 list |
| A7 | 预设加载失败(网络断开) | TraitsTab 仍可显示 sliders(0 0 0 0 0 0) | loadPresets try/except 静默 |

---

## B. 滑块编辑

| # | 用例 | 期望 |
|---|---|---|
| B1 | 拖动开放性滑块 0 → 0.3 | 滑块 UI 实时变,值显示 `+0.30`,雷达图更新 |
| B2 | 拖到边界 -1 / +1 | 滑块停住,值显示 `-1.00` / `+1.00` |
| B3 | 拖到边界 -2 / +2(放宽后) | 滑块停住,值显示 `-2.00` / `+2.00` |
| B4 | 输入越界值(假设粘贴 1.5) | 滑块自动 clamp 到 1(浏览器 input range 自动行为) |
| B5 | 5 维同时为 0 | 雷达图全灰,中心点 |
| B6 | 5 维同时为 ±2 | 雷达图达最大边界 |
| B7 | 拖动到 0.01 step(最小步进) | 滑块正常响应 |
| B8 | 移动端触摸拖动 | 滑块跟随手指 |

---

## C. 保存流程

| # | 用例 | 期望 |
|---|---|---|
| C1 | 拖动 1 维 ±0.05 → 点"设置当前性格" | 200 + success toast,maxDelta=0.05,无 warning |
| C2 | 拖动 1 维 ±0.06 → 点保存 | 200 + success + warning toast "本次最大单步变更 0.060(>0.05)..." |
| C3 | 拖动 5 维 ±0.5 → 点保存 | 200 + warning(maxDelta=0.5) |
| C4 | 拖动到 ±2 边界 → 点保存 | 200 + warning(maxDelta=2.0),DB 正确持久化 |
| C5 | 拖到 -1.5 → 点保存 | 200(因为 [-2,2] 范围内) |
| C6 | 拖动 → 不点保存 → 切角色 → 切回 | 滑块显示切回后的初始值,不是拖动后的(因为没保存) |
| C7 | 拖动 → 保存 → 切角色 → 切回 | 滑块显示保存后的值 |
| C8 | 保存后 GET 验证 DB | 返回相同值(数值精度无损) |
| C9 | 保存失败(后端 500) | 弹 error toast,local 不变 |
| C10 | 保存中(saving=true)再点保存 | 按钮 disabled(el-button loading 由 saving prop 控制) |

---

## D. 预设芯片(OCEAN 预设字典)

### D1-D7 切预设(用户场景,过去 bug 重灾区)

| # | 用例 | 期望 |
|---|---|---|
| D1 | 首次切到预设 X(无 saved) | local 套用 X 默认值,info toast,DB 不变 |
| D2 | 切到已 saved 的预设 X(presetType 相同) | local 用 saved 值,info toast "(使用已保存的自定义值)",DB 不变 |
| D3 | 保存 companion(0.5)→ 切 rational → 切回 companion | local 用 0.5(saved 保留),DB 不变 |
| D4 | 保存 companion(0.5)→ 切 rational → 保存(0.2)→ 切回 companion | local 用 rational(0.2),presetType=companion,**0.5 已丢**(预期) |
| D5 | 拖动 sliders(不动预设 chip) → 点保存 | 保存拖动后的值,DB 更新 |
| D6 | 切预设 + 再点保存(新预设的预设值) | DB 用新预设值,旧 saved 值被覆盖 |
| D7 | 切到不存在的预设(local.presetType 是手动改的怪值) | 保存时后端 GetByUserAndKey 找不到 → 400 错误 |

### D8-D15 预设 chip 删除(hover 红 X)

| # | 用例 | 期望 |
|---|---|---|
| D8 | mouseover 预设 chip | 红 X 淡入 |
| D9 | mouseleave 预设 chip | 红 X 淡出 |
| D10 | mouseover 受保护 chip(标准陪伴) | 仍显示 X(视觉一致) |
| D11 | 点击 X(受保护) | toast warning: "「标准陪伴」受保护,不可删除" |
| D12 | 点击 X(非受保护) | 弹 ElMessageBox.confirm |
| D13 | confirm 取消 | 不删除,chip 仍在 |
| D14 | confirm 确定 | 删除预设,chip 列表刷新;若删除的是当前预设,自动 fallback 到 protected/第一个 |
| D15 | 删了当前 chip 后未保存的 local 值 | local 保留切回后的(但 presetType 已变,再次保存会落到新 presetType) |

### D16-D24 预设 CRUD 弹窗

| # | 用例 | 期望 |
|---|---|---|
| D16 | 点"新增预设" | 弹窗标题"新增 OCEAN 预设",key 输入可编辑,5 维 sliders 默认 0 |
| D17 | 新增:key 空 → 提交 | warning "标识 key 与显示名不可为空" |
| D18 | 新增:key 含大写字母 "BadKey" | warning "key 只能含小写字母/数字/_/-" |
| D19 | 新增:key="new_preset" + 5 维 → 提交 | 创建成功,chip 列表出现新预设 |
| D20 | 新增:与已有 key 重复 | 400 错误 toast "预设 key 已存在" |
| D21 | 鼠标悬停已存在预设 → 红 X 点击 → confirm 删 → chip 列表少一个 | |
| D22 | 删除"标准陪伴" → 应被拒(虽然 D11 保护生效,但 D21 测试的是删除按钮,应能拦住) | toast warning 受保护 |
| D23 | 编辑预设:key 字段 disabled(只读),可改 label/description/5 维 | 弹窗"编辑 OCEAN 预设" |
| D24 | 编辑标准陪伴 → 应有 alert "该预设为系统级,只能修改数值/描述,不能删除" | alert 出现 |

---

## E. 切角色(跨角色数据隔离)

| # | 用例 | 期望 |
|---|---|---|
| E1 | 切到不同角色,角色 A 的 traits 不显示在角色 B 页 | |
| E2 | 切到不同角色,角色 A 的预设不污染角色 B | |
| E3 | 切到不同角色,BeliefsTab 用 `:key="beliefs-${roleId}"` remount | 无脏数据 |
| E4 | 切到不同角色,RelationshipTab 同 E3 逻辑 | |
| E5 | URL 直接访问 /admin/role-editor/N | loadAll 触发,正确显示 N 角色数据 |
| E6 | 角色 A 未保存拖动 → 切到 B → 切回 A | A 仍是原 props.modelValue(没保存即丢失) |

---

## F. UI 反馈(console 观察)

| # | 用例 | 期望 |
|---|---|---|
| F1 | 点 chip,info toast 颜色 | 浅蓝,3 秒自动消失 |
| F2 | 保存成功,success toast | 绿色,3 秒 |
| F3 | delta > 0.05 保存,warning toast | 黄色,5 秒,可关闭 |
| F4 | 保存失败,error toast | 红色,持续到关闭 |
| F5 | 删除成功,success toast | 绿色 |
| F6 | 取消删除(confirm),无 toast | |
| F7 | 同时点多个 chip(toast 队列) | 多个 info 按顺序显示 |

---

## G. 边界 & 错误路径

| # | 用例 | 期望 |
|---|---|---|
| G1 | presetType 字段空字符串 → 提交 | 400 必填校验 |
| G2 | roleId = 0 → 提交 | 400 必填 |
| G3 | 越界值 5.0 → 提交 | 400 max 校验 |
| G4 | OCEAN 字段缺失(请求体少 1 维) | 400 字段必填 |
| G5 | 5 维全 = NaN 或 Infinity | 400 数值校验 |
| G6 | user_id 不存在 → 提交 traits | 500 或 401(取决于中间件) |
| G7 | 角色不存在 → 提交 traits | DB 写入成功(role_traits 不依赖 role 表外键) |
| G8 | presetType 是用户自定义 key(非 6 默认) | 200(只要 ListPresets 中存在即可) |
| G9 | 同一个 key 创建两次 | 400 重复 |
| G10 | 删别人用户的预设 | 404 防越权 |
| G11 | 跨用户 GET 别人角色的 traits | 后端只按 (user_id, role_id) 查 → 200 但返回 null |

---

## H. 并发 & 持久化

| # | 用例 | 期望 |
|---|---|---|
| H1 | 同一 role_id 并发两次保存 | 两次都 200,后写覆盖前写 |
| H2 | 同一 role_id 一个读一个写并发 | 读可能拿到旧值,写最终一致 |
| H3 | 角色删除后,role_traits 行是否还在 | 行仍在(user_id+role_id 主键,role 表无外键) |

---

## I. 历史 bug 回归(用户已报过)

| # | 历史 bug | 修复 | 当前期望 |
|---|---|---|---|
| I1 | 切回预设丢自定义值 | applyPreset 用 saved 保留 | 见 D3,D4 |
| I2 | 滑块 max=1 拒 1.7 | 放宽到 [-2, 2] | B3,B4,C5 |
| I3 | warning 误弹(切预设时) | 取消 auto-save | chip 切换不再保存 → 不再 warning |
| I4 | 切回预设被 auto-save 覆盖 | 取消 auto-save | D3 |
| I5 | 切角色后 beliefs 残留 | loadAll 含 coreSnapshot + :key remount | E3,E4 |
| I6 | OCEAN 修改保存不响应 | 200 落库成功 | C1-C8 |

---

## 验证步骤

1. **后端启动**:`./echo-core-new.exe`,health 200
2. **前端启动**:vite(用户已有) + 浏览器打开 /admin/role-editor/{newRid}
3. **自动化**:用 node 脚本逐 case 跑(API 部分),UI 部分用 Puppeteer/手动
4. **回归**:跑完所有 I1-I6 确认历史 bug 不再出现
5. **清理**:关闭后端,清理临时测试脚本

---

## 已知问题(本次测试会标记但不修)

| 项 | 说明 |
|---|---|
| 每个 role 一份 OCEAN | schema 限制,无 per-preset 独立存储 |
| mood/relationship 当前未与 traits 同步 | M2/M3 prompt 注入已通,但 DB 写入路径独立 |
| 滑块拖动不保存到 DB | 设计如此,需点"设置当前性格" |