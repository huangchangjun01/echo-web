<template>
  <div
    class="pixel-character"
    :class="[
      `pixel-character--${state}`,
      { 'pixel-character--talking': talking },
    ]"
    :style="{ width: `${size}px`, height: `${size * RATIO}px` }"
  >
    <svg
      :viewBox="viewBox"
      :width="size"
      :height="size * RATIO"
      xmlns="http://www.w3.org/2000/svg"
      shape-rendering="crispEdges"
      class="pixel-character__svg"
      :style="moodFilterStyle"
      aria-label="像素女生"
    >
      <!-- ==================== 落地阴影 ==================== -->
      <ellipse
        :cx="cxMid"
        :cy="SHADOW_Y"
        :rx="22"
        :ry="2"
        class="pc-shadow"
      />

      <!-- ==================== 腿 / 袜 / 鞋 ==================== -->
      <g class="pc-legs">
        <!-- 大腿 + 小腿（左） -->
        <rect x="55" y="124" width="6" height="20" class="pc-skin" />
        <rect x="55" y="124" width="1" height="20" class="pc-skin-shadow" />
        <!-- 大腿 + 小腿（右） -->
        <rect x="67" y="124" width="6" height="20" class="pc-skin" />
        <rect x="72" y="124" width="1" height="20" class="pc-skin-shadow" />
        <!-- 长筒袜 -->
        <rect x="54" y="140" width="8" height="6" class="pc-sock" />
        <rect x="66" y="140" width="8" height="6" class="pc-sock" />
        <rect x="54" y="140" width="8" height="1" class="pc-sock-trim" />
        <rect x="66" y="140" width="8" height="1" class="pc-sock-trim" />
        <!-- 鞋 -->
        <rect x="52" y="146" width="11" height="4" class="pc-shoe" />
        <rect x="52" y="146" width="2" height="1" class="pc-shoe-shine" />
        <rect x="65" y="146" width="11" height="4" class="pc-shoe" />
        <rect x="65" y="146" width="2" height="1" class="pc-shoe-shine" />
        <!-- 鞋扣 -->
        <rect x="56" y="148" width="3" height="1" class="pc-shoe-strap" />
        <rect x="69" y="148" width="3" height="1" class="pc-shoe-strap" />
      </g>

      <!-- ==================== 裙摆（梯形 + 蕾丝） ==================== -->
      <g class="pc-skirt-group">
        <!-- 主体梯形：自上而下渐宽 -->
        <rect x="46" y="100" width="36" height="4" class="pc-skirt" />
        <rect x="44" y="104" width="40" height="4" class="pc-skirt" />
        <rect x="42" y="108" width="44" height="4" class="pc-skirt" />
        <rect x="40" y="112" width="48" height="4" class="pc-skirt" />
        <rect x="38" y="116" width="52" height="4" class="pc-skirt" />
        <!-- 高光顶层 -->
        <rect x="46" y="100" width="36" height="1" class="pc-skirt-light" />
        <!-- 阴影底层 -->
        <rect x="38" y="118" width="52" height="2" class="pc-skirt-shadow" />
        <!-- 褶皱（垂直暗条） -->
        <rect x="48" y="104" width="1" height="14" class="pc-skirt-shadow" />
        <rect x="56" y="104" width="1" height="14" class="pc-skirt-shadow" />
        <rect x="64" y="104" width="1" height="14" class="pc-skirt-shadow" />
        <rect x="72" y="104" width="1" height="14" class="pc-skirt-shadow" />
        <rect x="80" y="104" width="1" height="14" class="pc-skirt-shadow" />
        <!-- 蕾丝边（底沿小方点） -->
        <rect x="38" y="120" width="2" height="2" class="pc-lace" />
        <rect x="42" y="120" width="2" height="2" class="pc-lace" />
        <rect x="46" y="120" width="2" height="2" class="pc-lace" />
        <rect x="50" y="120" width="2" height="2" class="pc-lace" />
        <rect x="54" y="120" width="2" height="2" class="pc-lace" />
        <rect x="58" y="120" width="2" height="2" class="pc-lace" />
        <rect x="62" y="120" width="2" height="2" class="pc-lace" />
        <rect x="66" y="120" width="2" height="2" class="pc-lace" />
        <rect x="70" y="120" width="2" height="2" class="pc-lace" />
        <rect x="74" y="120" width="2" height="2" class="pc-lace" />
        <rect x="78" y="120" width="2" height="2" class="pc-lace" />
        <rect x="82" y="120" width="2" height="2" class="pc-lace" />
        <rect x="86" y="120" width="2" height="2" class="pc-lace" />
      </g>

      <!-- ==================== 上衣 / 躯干 ==================== -->
      <g class="pc-torso">
        <!-- 主体 -->
        <rect x="48" y="78" width="32" height="22" class="pc-cloth" />
        <!-- 上沿（领口附近）高光 -->
        <rect x="48" y="78" width="32" height="2" class="pc-cloth-light" />
        <!-- 下摆阴影 -->
        <rect x="48" y="98" width="32" height="2" class="pc-cloth-shadow" />
        <!-- 衣领 V 形（露肤）-->
        <rect x="60" y="78" width="8" height="3" class="pc-skin" />
        <rect x="61" y="81" width="6" height="2" class="pc-skin" />
        <rect x="62" y="83" width="4" height="2" class="pc-skin-shadow" />
        <!-- 胸前大蝴蝶结 -->
        <rect x="54" y="84" width="4" height="3" class="pc-bow" />
        <rect x="70" y="84" width="4" height="3" class="pc-bow" />
        <rect x="58" y="85" width="12" height="2" class="pc-bow" />
        <rect x="63" y="84" width="2" height="4" class="pc-bow-dot" />
        <rect x="54" y="86" width="1" height="1" class="pc-bow-shadow" />
        <rect x="73" y="86" width="1" height="1" class="pc-bow-shadow" />
        <!-- 衣摆白边 -->
        <rect x="48" y="97" width="32" height="1" class="pc-cloth-trim" />
        <!-- 钮扣线（细节） -->
        <rect x="63" y="90" width="2" height="2" class="pc-cloth-light" />
        <rect x="63" y="94" width="2" height="2" class="pc-cloth-light" />
      </g>

      <!-- ==================== 后发（围在头部后方，下垂至腰） ==================== -->
      <g class="pc-hair-back">
        <!-- 头顶外缘 -->
        <rect x="40" y="14" width="48" height="6" class="pc-hair" />
        <rect x="42" y="12" width="44" height="2" class="pc-hair" />
        <rect x="44" y="10" width="40" height="2" class="pc-hair" />
        <!-- 左侧长发 -->
        <rect x="36" y="20" width="6" height="56" class="pc-hair" />
        <rect x="34" y="28" width="2" height="44" class="pc-hair" />
        <rect x="32" y="36" width="2" height="32" class="pc-hair" />
        <!-- 右侧长发 -->
        <rect x="86" y="20" width="6" height="56" class="pc-hair" />
        <rect x="92" y="28" width="2" height="44" class="pc-hair" />
        <rect x="94" y="36" width="2" height="32" class="pc-hair" />
        <!-- 后发尾端（不规则末梢） -->
        <rect x="34" y="76" width="6" height="6" class="pc-hair" />
        <rect x="32" y="68" width="2" height="8" class="pc-hair-shadow" />
        <rect x="88" y="76" width="6" height="6" class="pc-hair" />
        <rect x="94" y="68" width="2" height="8" class="pc-hair-shadow" />
        <!-- 后发高光（左右两道） -->
        <rect x="38" y="22" width="2" height="40" class="pc-hair-light" />
        <rect x="88" y="22" width="2" height="40" class="pc-hair-light" />
        <rect x="46" y="14" width="36" height="2" class="pc-hair-light" />
      </g>

      <!-- ==================== 左臂 ==================== -->
      <g class="pc-arm pc-arm--left" :data-pose="handPose">
        <!-- 挥手 / 双手举 / 指点：手臂朝斜上 -->
        <template v-if="handPose === 'wave' || handPose === 'both_up' || handPose === 'point'">
          <rect x="42" y="82" width="6" height="6" class="pc-cloth" />
          <rect x="38" y="76" width="6" height="6" class="pc-cloth" />
          <rect x="34" y="68" width="6" height="6" class="pc-skin" />
          <rect x="32" y="62" width="6" height="6" class="pc-skin" />
          <rect x="32" y="58" width="4" height="4" class="pc-skin" />
        </template>
        <!-- 叉腰 -->
        <template v-else-if="handPose === 'hip'">
          <rect x="42" y="82" width="6" height="8" class="pc-cloth" />
          <rect x="38" y="86" width="8" height="6" class="pc-cloth" />
          <rect x="44" y="90" width="6" height="4" class="pc-skin" />
        </template>
        <!-- 托腮 -->
        <template v-else-if="handPose === 'chin'">
          <rect x="42" y="82" width="6" height="6" class="pc-cloth" />
          <rect x="44" y="74" width="6" height="8" class="pc-cloth" />
          <rect x="48" y="64" width="6" height="10" class="pc-skin" />
          <rect x="52" y="58" width="6" height="6" class="pc-skin" />
        </template>
        <!-- 摸脸颊 -->
        <template v-else-if="handPose === 'cheek'">
          <rect x="42" y="82" width="6" height="6" class="pc-cloth" />
          <rect x="44" y="76" width="6" height="6" class="pc-cloth" />
          <rect x="46" y="62" width="6" height="14" class="pc-skin" />
          <rect x="48" y="52" width="6" height="10" class="pc-skin" />
        </template>
        <!-- 害羞（手藏身后） -->
        <template v-else-if="handPose === 'shy'">
          <rect x="44" y="82" width="6" height="6" class="pc-cloth" />
          <rect x="48" y="86" width="6" height="6" class="pc-cloth" />
          <rect x="54" y="88" width="6" height="4" class="pc-skin" />
        </template>
        <!-- 默认下垂 -->
        <template v-else>
          <rect x="42" y="80" width="6" height="14" class="pc-cloth" />
          <rect x="42" y="92" width="6" height="6" class="pc-skin" />
          <rect x="42" y="96" width="6" height="2" class="pc-skin-shadow" />
        </template>
      </g>

      <!-- ==================== 右臂 ==================== -->
      <g class="pc-arm pc-arm--right" :data-pose="handPose">
        <template v-if="handPose === 'both_up'">
          <rect x="80" y="82" width="6" height="6" class="pc-cloth" />
          <rect x="84" y="76" width="6" height="6" class="pc-cloth" />
          <rect x="88" y="68" width="6" height="6" class="pc-skin" />
          <rect x="90" y="62" width="6" height="6" class="pc-skin" />
          <rect x="92" y="58" width="4" height="4" class="pc-skin" />
        </template>
        <template v-else-if="handPose === 'chin'">
          <rect x="80" y="82" width="6" height="6" class="pc-cloth" />
          <rect x="78" y="74" width="6" height="8" class="pc-cloth" />
          <rect x="74" y="64" width="6" height="10" class="pc-skin" />
          <rect x="70" y="58" width="6" height="6" class="pc-skin" />
        </template>
        <template v-else-if="handPose === 'cheek'">
          <rect x="80" y="82" width="6" height="6" class="pc-cloth" />
          <rect x="78" y="76" width="6" height="6" class="pc-cloth" />
          <rect x="76" y="62" width="6" height="14" class="pc-skin" />
          <rect x="74" y="52" width="6" height="10" class="pc-skin" />
        </template>
        <template v-else-if="handPose === 'shy'">
          <rect x="78" y="82" width="6" height="6" class="pc-cloth" />
          <rect x="74" y="86" width="6" height="6" class="pc-cloth" />
          <rect x="68" y="88" width="6" height="4" class="pc-skin" />
        </template>
        <template v-else>
          <rect x="80" y="80" width="6" height="14" class="pc-cloth" />
          <rect x="80" y="92" width="6" height="6" class="pc-skin" />
          <rect x="80" y="96" width="6" height="2" class="pc-skin-shadow" />
        </template>
      </g>

      <!-- ==================== 脖子 ==================== -->
      <rect x="58" y="68" width="12" height="10" class="pc-skin-shadow" />
      <rect x="60" y="70" width="8" height="8" class="pc-skin" />

      <!-- ==================== 头部（脸 + 五官） ==================== -->
      <g class="pc-head">
        <!-- 脸型：圆润矩形 + 微圆下颌 -->
        <rect x="44" y="20" width="40" height="44" class="pc-skin" />
        <rect x="46" y="18" width="36" height="2" class="pc-skin" />
        <rect x="46" y="64" width="36" height="4" class="pc-skin" />
        <rect x="48" y="68" width="32" height="2" class="pc-skin" />
        <!-- 下颌阴影 -->
        <rect x="46" y="64" width="36" height="1" class="pc-skin-shadow" />
        <rect x="48" y="68" width="32" height="1" class="pc-skin-shadow" />
        <!-- 脸两侧阴影 -->
        <rect x="44" y="28" width="2" height="32" class="pc-skin-shadow" />
        <rect x="82" y="28" width="2" height="32" class="pc-skin-shadow" />

        <!-- 腮红：左右两块柔粉 -->
        <g class="pc-blush-group">
          <rect x="49" y="48" width="4" height="2" class="pc-blush" />
          <rect x="50" y="50" width="4" height="2" class="pc-blush" />
          <rect x="51" y="52" width="3" height="1" class="pc-blush" />
          <rect x="75" y="48" width="4" height="2" class="pc-blush" />
          <rect x="74" y="50" width="4" height="2" class="pc-blush" />
          <rect x="74" y="52" width="3" height="1" class="pc-blush" />
        </g>

        <!-- 鼻子（极小高光点） -->
        <rect x="63" y="46" width="2" height="1" class="pc-skin-shadow" />

        <!-- 眼睛：状态 / 眨眼切换 -->
        <g class="pc-eyes">
          <!-- 笑眼（happy / excited / blinking） -->
          <template v-if="state === 'happy' || state === 'excited' || blinking">
            <!-- 左笑眼 -->
            <path
              :d="`M 50 40 Q 55 36 60 40`"
              stroke="#3a2536"
              stroke-width="1.2"
              fill="none"
              stroke-linecap="round"
              class="pc-eye-smile"
            />
            <!-- 左眼睫弧 -->
            <rect x="50" y="38" width="1" height="2" class="pc-eye-lash" />
            <rect x="59" y="38" width="1" height="2" class="pc-eye-lash" />
            <!-- 右笑眼 -->
            <path
              :d="`M 68 40 Q 73 36 78 40`"
              stroke="#3a2536"
              stroke-width="1.2"
              fill="none"
              stroke-linecap="round"
              class="pc-eye-smile"
            />
            <rect x="68" y="38" width="1" height="2" class="pc-eye-lash" />
            <rect x="77" y="38" width="1" height="2" class="pc-eye-lash" />
          </template>

          <!-- 下垂眼（sad） -->
          <template v-else-if="state === 'sad'">
            <!-- 左眼（向下偏） -->
            <rect x="51" y="40" width="8" height="6" class="pc-eye-white" />
            <rect x="53" y="42" width="4" height="4" class="pc-eye-pupil" />
            <rect x="53" y="42" width="2" height="2" class="pc-eye-shine" />
            <rect x="51" y="40" width="8" height="1" class="pc-eye-lash" />
            <!-- 下泪 -->
            <rect x="54" y="48" width="1" height="3" class="pc-tear" />
            <!-- 右眼 -->
            <rect x="69" y="40" width="8" height="6" class="pc-eye-white" />
            <rect x="71" y="42" width="4" height="4" class="pc-eye-pupil" />
            <rect x="71" y="42" width="2" height="2" class="pc-eye-shine" />
            <rect x="69" y="40" width="8" height="1" class="pc-eye-lash" />
            <rect x="74" y="48" width="1" height="3" class="pc-tear" />
          </template>

          <!-- 默认大眼（idle / listen / talk / thinking / greet） -->
          <template v-else>
            <!-- 左眼眼白（椭圆形：用 4 个矩形拼出软角） -->
            <rect x="50" y="36" width="10" height="12" class="pc-eye-white" />
            <rect x="49" y="38" width="1" height="8" class="pc-eye-white" />
            <rect x="60" y="38" width="1" height="8" class="pc-eye-white" />
            <!-- 左眼虹膜 -->
            <rect x="51" y="38" width="8" height="10" class="pc-eye-iris" />
            <!-- 左眼瞳孔 -->
            <rect x="53" y="40" width="4" height="6" class="pc-eye-pupil" />
            <!-- 左眼大高光（左上） -->
            <rect x="53" y="40" width="3" height="3" class="pc-eye-shine" />
            <!-- 左眼小高光（右下） -->
            <rect x="56" y="46" width="2" height="2" class="pc-eye-shine" />
            <!-- 左眼上眼睑（睫毛主线） -->
            <rect x="49" y="35" width="12" height="1" class="pc-eye-lash" />
            <rect x="49" y="36" width="1" height="1" class="pc-eye-lash" />
            <rect x="60" y="36" width="1" height="1" class="pc-eye-lash" />
            <!-- 左眼睫毛尾端（外眼角） -->
            <rect x="60" y="34" width="2" height="2" class="pc-eye-lash" />
            <!-- 左眼下眼线（细） -->
            <rect x="51" y="48" width="8" height="1" class="pc-eye-lower" />

            <!-- 右眼（镜像） -->
            <rect x="68" y="36" width="10" height="12" class="pc-eye-white" />
            <rect x="67" y="38" width="1" height="8" class="pc-eye-white" />
            <rect x="78" y="38" width="1" height="8" class="pc-eye-white" />
            <rect x="69" y="38" width="8" height="10" class="pc-eye-iris" />
            <rect x="71" y="40" width="4" height="6" class="pc-eye-pupil" />
            <rect x="71" y="40" width="3" height="3" class="pc-eye-shine" />
            <rect x="74" y="46" width="2" height="2" class="pc-eye-shine" />
            <rect x="67" y="35" width="12" height="1" class="pc-eye-lash" />
            <rect x="67" y="36" width="1" height="1" class="pc-eye-lash" />
            <rect x="78" y="36" width="1" height="1" class="pc-eye-lash" />
            <rect x="66" y="34" width="2" height="2" class="pc-eye-lash" />
            <rect x="69" y="48" width="8" height="1" class="pc-eye-lower" />
          </template>
        </g>

        <!-- 嘴巴（多状态切换） -->
        <g class="pc-mouth-group">
          <!-- sad: 向下弯嘴 -->
          <path
            v-if="state === 'sad'"
            :d="`M 58 58 Q 64 54 70 58`"
            stroke="#a85a72"
            stroke-width="1.2"
            fill="none"
            stroke-linecap="round"
            class="pc-mouth-line"
          />
          <!-- happy / excited: 张嘴大笑 -->
          <g v-else-if="state === 'happy' || state === 'excited'">
            <path
              :d="`M 57 56 Q 64 62 71 56`"
              stroke="#c54a66"
              stroke-width="1.4"
              fill="#ff8fa8"
              stroke-linecap="round"
              class="pc-mouth-line"
            />
            <!-- 牙齿（小白点） -->
            <rect x="61" y="58" width="6" height="1" class="pc-mouth-teeth" />
          </g>
          <!-- talking: 张嘴 -->
          <g v-else-if="talking">
            <ellipse cx="64" cy="58" rx="3.5" ry="2.2" class="pc-mouth-open" />
            <ellipse cx="64" cy="59" rx="2.2" ry="1" class="pc-mouth-tongue" />
            <rect x="62" y="56" width="4" height="0.6" class="pc-mouth-teeth" />
          </g>
          <!-- 默认樱桃形小嘴（甜美微笑） -->
          <g v-else>
            <path
              :d="`M 59 57 Q 64 60 69 57`"
              stroke="#c54a66"
              stroke-width="1.2"
              fill="none"
              stroke-linecap="round"
              class="pc-mouth-line"
            />
            <!-- 下唇高光 -->
            <rect x="62" y="59" width="4" height="1" class="pc-mouth-lower" />
          </g>
        </g>
      </g>

      <!-- ==================== 前发 / 刘海 + 头顶配饰 ==================== -->
      <g class="pc-hair-front">
        <!-- 头顶层 -->
        <rect x="42" y="14" width="44" height="4" class="pc-hair" />
        <rect x="44" y="12" width="40" height="2" class="pc-hair" />
        <rect x="46" y="10" width="36" height="2" class="pc-hair" />
        <!-- 刘海主层（覆盖额头） -->
        <rect x="44" y="18" width="40" height="8" class="pc-hair" />
        <!-- 中分缝隙（露一点点额头） -->
        <rect x="63" y="20" width="2" height="4" class="pc-skin" />
        <!-- 左侧刘海层次（两段） -->
        <rect x="44" y="26" width="6" height="6" class="pc-hair" />
        <rect x="46" y="32" width="4" height="4" class="pc-hair" />
        <rect x="50" y="26" width="4" height="3" class="pc-hair" />
        <!-- 右侧刘海层次 -->
        <rect x="78" y="26" width="6" height="6" class="pc-hair" />
        <rect x="78" y="32" width="4" height="4" class="pc-hair" />
        <rect x="74" y="26" width="4" height="3" class="pc-hair" />
        <!-- 鬓发（脸颊侧的发丝） -->
        <rect x="42" y="30" width="3" height="22" class="pc-hair" />
        <rect x="83" y="30" width="3" height="22" class="pc-hair" />
        <rect x="40" y="36" width="2" height="14" class="pc-hair-shadow" />
        <rect x="86" y="36" width="2" height="14" class="pc-hair-shadow" />

        <!-- 头发高光（前发亮带） -->
        <rect x="48" y="16" width="32" height="1" class="pc-hair-light" />
        <rect x="46" y="22" width="2" height="6" class="pc-hair-light" />
        <rect x="80" y="22" width="2" height="6" class="pc-hair-light" />
        <rect x="52" y="20" width="6" height="1" class="pc-hair-light" />
        <rect x="70" y="20" width="6" height="1" class="pc-hair-light" />

        <!-- 头顶左蝴蝶结（双马尾扎带） -->
        <g class="pc-bow-left">
          <rect x="38" y="14" width="3" height="4" class="pc-bow" />
          <rect x="34" y="13" width="4" height="6" class="pc-bow" />
          <rect x="34" y="13" width="1" height="2" class="pc-bow-shadow" />
          <rect x="37" y="17" width="1" height="2" class="pc-bow-shadow" />
          <rect x="36" y="15" width="2" height="2" class="pc-bow-dot" />
        </g>
        <!-- 头顶右蝴蝶结 -->
        <g class="pc-bow-right">
          <rect x="87" y="14" width="3" height="4" class="pc-bow" />
          <rect x="90" y="13" width="4" height="6" class="pc-bow" />
          <rect x="93" y="13" width="1" height="2" class="pc-bow-shadow" />
          <rect x="90" y="17" width="1" height="2" class="pc-bow-shadow" />
          <rect x="90" y="15" width="2" height="2" class="pc-bow-dot" />
        </g>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
/**
 * 像素人物组件（甜美风 · 高分辨率 128×160）
 *
 * 与上一版对比：
 *  - viewBox 由 64×80 升级到 128×160，整体像素粒度变小一倍 → 细节更精致
 *  - 头身比 1:2 风格，圆润五官、长发双马尾、白袜小皮鞋
 *  - 大眼系统：眼白 / 虹膜 / 瞳孔 / 双高光 / 睫毛 / 下眼线 5 层
 *  - 多状态嘴型：sad 弯嘴 / happy 露齿笑 / talk 张嘴说话 / 默认樱桃小嘴
 *  - 8 种 handPose: rest / wave / hip / chin / cheek / both_up / shy / point
 *  - idle 微动作循环 + 呼吸浮动 + 头发摆动 + 随机眨眼
 *  - 表情对应的额外动画：happy 弹跳 / excited 跳跃 + 双手挥 / sad 低头
 *
 * API（保持与上一版完全一致，调用方无需改动）：
 *  - state: 角色当前状态
 *  - talking: 是否在张嘴
 *  - size: 角色宽度（px），高度按 RATIO 推导
 *  - handPose: 显式手部姿态（state !== 'idle' 时生效）
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

export type CharacterState =
  | 'idle'
  | 'listen'
  | 'talk'
  | 'happy'
  | 'sad'
  | 'excited'
  | 'greet'
  | 'thinking'

export type HandPose = 'rest' | 'wave' | 'hip' | 'chin' | 'cheek' | 'both_up' | 'shy' | 'point'

interface Props {
  state?: CharacterState
  talking?: boolean
  size?: number
  handPose?: HandPose
  /**
   * M2 联动：8 表情映射(由 mood_update 事件的 expression 字段传入)。
   * smile/happy/excited/sad/cry/angry/concern/thinking
   * 当传入时,会基于 valence 自动决定 state(优先级低于显式 state)。
   */
  moodExpression?: string
  /** M2 联动:整体色调滤镜(由 mood valence 计算得出) */
  moodColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  state: 'idle',
  talking: false,
  size: 240,
  handPose: 'rest',
  moodExpression: '',
  moodColor: '',
})

/** 帧高宽比（高 / 宽）— viewBox 128×160 故 1.25 */
const RATIO = 1.25
/** SVG viewBox 字符串 */
const viewBox = '0 0 128 160'
/** 阴影所在 y 坐标（接近脚底） */
const SHADOW_Y = 154
/** 角色水平中点 */
const cxMid = 64

/* ---- idle 微动作循环：每隔几秒切到一个细微的子状态 ---- */
const idleSubState = ref<'still' | 'wave' | 'cheek' | 'chin'>('still')
let idleTimer: ReturnType<typeof setTimeout> | null = null

/** 子状态轮转表：依次切换、形成"安静→挥手→安静→托腮→…"循环 */
const IDLE_CYCLE: ReadonlyArray<{ key: typeof idleSubState.value; dur: number }> = [
  { key: 'still', dur: 3000 },
  { key: 'wave', dur: 1800 },
  { key: 'still', dur: 2400 },
  { key: 'chin', dur: 2600 },
  { key: 'still', dur: 2200 },
  { key: 'cheek', dur: 2200 },
]

function startIdleCycle() {
  stopIdleCycle()
  let i = 0
  const step = () => {
    idleSubState.value = IDLE_CYCLE[i % IDLE_CYCLE.length].key
    idleTimer = setTimeout(step, IDLE_CYCLE[i % IDLE_CYCLE.length].dur)
    i++
  }
  step()
}

function stopIdleCycle() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

/** 实际渲染用 state：idle 时把子状态映射成具体表现 */
const derivedState = computed<CharacterState>(() => {
  if (props.state !== 'idle') return props.state
  // M2:根据 moodExpression 推断 state（优先级高于 idle 子状态）
  if (props.moodExpression) {
    const map: Record<string, CharacterState> = {
      smile: 'idle',
      happy: 'happy',
      excited: 'excited',
      sad: 'sad',
      cry: 'sad',
      angry: 'sad',
      concern: 'thinking',
      thinking: 'thinking',
      neutral: 'idle',
    }
    if (map[props.moodExpression]) return map[props.moodExpression]!
  }
  switch (idleSubState.value) {
    case 'wave':
      return 'greet'
    case 'cheek':
    case 'chin':
      return 'thinking'
    default:
      return 'idle'
  }
})

/** M2:根据 moodColor 生成 SVG 滤镜(整体色调微调) */
const moodFilterStyle = computed(() => {
  if (!props.moodColor) return {}
  return { filter: `drop-shadow(0 0 8px ${props.moodColor})` }
})

/** 实际手部姿态：idle 时由子状态接管 */
const derivedHandPose = computed<HandPose>(() => {
  if (props.state !== 'idle') return props.handPose
  switch (idleSubState.value) {
    case 'wave':
      return 'wave'
    case 'chin':
      return 'chin'
    case 'cheek':
      return 'cheek'
    default:
      return 'rest'
  }
})

const state = computed(() => derivedState.value)
const handPose = computed(() => derivedHandPose.value)

watch(
  () => props.state,
  (v) => {
    if (v === 'idle') startIdleCycle()
    else stopIdleCycle()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopIdleCycle()
  if (blinkTimer) clearTimeout(blinkTimer)
})

/* ---- 随机眨眼 ---- */
const blinking = ref(false)
let blinkTimer: ReturnType<typeof setTimeout> | null = null
function scheduleBlink() {
  if (blinkTimer) clearTimeout(blinkTimer)
  const delay = 2800 + Math.random() * 2400
  blinkTimer = setTimeout(() => {
    blinking.value = true
    setTimeout(() => {
      blinking.value = false
      scheduleBlink()
    }, 140)
  }, delay)
}
scheduleBlink()
</script>

<style scoped>
.pixel-character {
  position: relative;
  display: inline-block;
  user-select: none;
  pointer-events: none;
  filter: drop-shadow(0 0.8rem 1.4rem rgba(0, 0, 0, 0.4));
}

.pixel-character__svg {
  display: block;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

/* ====== 甜美粉色调色板 ====== */
.pixel-character :deep(.pc-skin) {
  fill: #ffe2cf;
}
.pixel-character :deep(.pc-skin-shadow) {
  fill: #f5c5ad;
}
.pixel-character :deep(.pc-hair) {
  fill: #c08bb0;
}
.pixel-character :deep(.pc-hair-light) {
  fill: #f1b8d4;
}
.pixel-character :deep(.pc-hair-shadow) {
  fill: #9a6b8e;
}
.pixel-character :deep(.pc-cloth) {
  fill: #ffb4d2;
}
.pixel-character :deep(.pc-cloth-light) {
  fill: #ffd8e8;
}
.pixel-character :deep(.pc-cloth-shadow) {
  fill: #d989b0;
}
.pixel-character :deep(.pc-cloth-trim) {
  fill: #fff;
}
.pixel-character :deep(.pc-skirt) {
  fill: #ff8aab;
}
.pixel-character :deep(.pc-skirt-light) {
  fill: #ffc0d4;
}
.pixel-character :deep(.pc-skirt-shadow) {
  fill: #c95c80;
}
.pixel-character :deep(.pc-lace) {
  fill: #fff;
}
.pixel-character :deep(.pc-sock) {
  fill: #fff;
}
.pixel-character :deep(.pc-sock-trim) {
  fill: #ffd2e0;
}
.pixel-character :deep(.pc-shoe) {
  fill: #5a3a4a;
}
.pixel-character :deep(.pc-shoe-shine) {
  fill: #8a5a7a;
}
.pixel-character :deep(.pc-shoe-strap) {
  fill: #ffc0d4;
}
.pixel-character :deep(.pc-eye-white) {
  fill: #fff;
}
.pixel-character :deep(.pc-eye-iris) {
  fill: #b48fdf;
}
.pixel-character :deep(.pc-eye-pupil) {
  fill: #5e3d8a;
}
.pixel-character :deep(.pc-eye-shine) {
  fill: #fff;
}
.pixel-character :deep(.pc-eye-lash) {
  fill: #3a2536;
}
.pixel-character :deep(.pc-eye-lower) {
  fill: #c79ec0;
}
.pixel-character :deep(.pc-eye-smile) {
  stroke: #3a2536;
}
.pixel-character :deep(.pc-tear) {
  fill: #9ec5ff;
  opacity: 0.85;
}
.pixel-character :deep(.pc-mouth-line) {
  stroke: #c54a66;
}
.pixel-character :deep(.pc-mouth-open) {
  fill: #8b3a4d;
}
.pixel-character :deep(.pc-mouth-tongue) {
  fill: #ff8fa8;
}
.pixel-character :deep(.pc-mouth-teeth) {
  fill: #fff7fa;
}
.pixel-character :deep(.pc-mouth-lower) {
  fill: #ffb6c5;
}
.pixel-character :deep(.pc-blush) {
  fill: #ffa6bc;
  opacity: 0.85;
}
.pixel-character :deep(.pc-bow) {
  fill: #ff4d80;
}
.pixel-character :deep(.pc-bow-shadow) {
  fill: #c93366;
}
.pixel-character :deep(.pc-bow-dot) {
  fill: #fff;
}
.pixel-character :deep(.pc-shadow) {
  fill: rgba(0, 0, 0, 0.22);
}

/* ====== 阴影呼吸 ====== */
.pc-shadow {
  transform-origin: center;
  transform-box: fill-box;
  animation: pc-shadow-breathe 2.6s ease-in-out infinite;
}
@keyframes pc-shadow-breathe {
  0%,
  100% {
    transform: scaleX(1);
    opacity: 0.85;
  }
  50% {
    transform: scaleX(0.82);
    opacity: 0.55;
  }
}

/* ====== idle 上下浮动（轻微） ====== */
.pixel-character--idle .pc-head,
.pixel-character--idle .pc-hair-front,
.pixel-character--idle .pc-hair-back,
.pixel-character--idle .pc-torso,
.pixel-character--idle .pc-arm--left,
.pixel-character--idle .pc-arm--right,
.pixel-character--idle .pc-skirt-group,
.pixel-character--idle .pc-legs {
  animation: pc-float 2.8s ease-in-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}
@keyframes pc-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-0.5px);
  }
}

/* ====== 头发飘动 ====== */
.pixel-character .pc-hair-back,
.pixel-character .pc-hair-front {
  animation: pc-hair-sway 4.2s ease-in-out infinite;
  transform-origin: center top;
  transform-box: fill-box;
}
@keyframes pc-hair-sway {
  0%,
  100% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(0.6deg);
  }
}

/* ====== 挥手（greet） ====== */
.pixel-character--greet .pc-arm--left {
  animation: pc-wave 0.7s ease-in-out infinite;
  transform-origin: 50% 100%;
  transform-box: fill-box;
}
@keyframes pc-wave {
  0%,
  100% {
    transform: rotate(12deg) translateY(-1px);
  }
  50% {
    transform: rotate(-12deg) translateY(-2px);
  }
}

/* ====== 思考：手托腮微动 ====== */
.pixel-character--thinking .pc-arm--left,
.pixel-character--thinking .pc-arm--right {
  animation: pc-think 1.8s ease-in-out infinite;
  transform-origin: 50% 100%;
  transform-box: fill-box;
}
@keyframes pc-think {
  0%,
  100% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(-2deg);
  }
}

/* ====== 倾听：歪头 ====== */
.pixel-character--listen {
  transform: translateY(0.4px) scale(1.01);
}
.pixel-character--listen .pc-head {
  animation: pc-listen-head 2.4s ease-in-out infinite;
  transform-origin: center bottom;
  transform-box: fill-box;
}
@keyframes pc-listen-head {
  0%,
  100% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(2deg);
  }
}

/* ====== 说话：头部微微点头 ====== */
.pixel-character--talk .pc-head {
  animation: pc-talk-head 0.7s ease-in-out infinite;
  transform-origin: center bottom;
  transform-box: fill-box;
}
@keyframes pc-talk-head {
  0%,
  100% {
    transform: rotate(0deg) translateY(0);
  }
  50% {
    transform: rotate(0.4deg) translateY(-0.4px);
  }
}

/* ====== 高兴：身体弹跳 + 双臂摆动 ====== */
.pixel-character--happy {
  animation: pc-happy-bounce 0.9s ease-in-out infinite;
}
.pixel-character--happy .pc-arm--left,
.pixel-character--happy .pc-arm--right {
  animation: pc-happy-arm 0.9s ease-in-out infinite;
  transform-origin: 50% 100%;
  transform-box: fill-box;
}
@keyframes pc-happy-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-1.2px);
  }
}
@keyframes pc-happy-arm {
  0%,
  100% {
    transform: rotate(-12deg) translateY(0);
  }
  50% {
    transform: rotate(12deg) translateY(0);
  }
}

/* ====== 兴奋：跳跃 + 双手挥 ====== */
.pixel-character--excited {
  animation: pc-excited-jump 0.55s ease-in-out infinite;
}
.pixel-character--excited .pc-arm--left,
.pixel-character--excited .pc-arm--right {
  animation: pc-excited-arms 0.55s ease-in-out infinite;
  transform-origin: 50% 100%;
  transform-box: fill-box;
}
@keyframes pc-excited-jump {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2.5px);
  }
}
@keyframes pc-excited-arms {
  0%,
  100% {
    transform: rotate(-24deg) translateY(-0.5px);
  }
  50% {
    transform: rotate(24deg) translateY(-0.5px);
  }
}

/* ====== 悲伤：头垂下、身体下沉 ====== */
.pixel-character--sad {
  transform: translateY(1px);
}
.pixel-character--sad .pc-head {
  animation: pc-sad-head 3s ease-in-out infinite;
  transform-origin: center bottom;
  transform-box: fill-box;
}
@keyframes pc-sad-head {
  0%,
  100% {
    transform: rotate(-2deg) translateY(0.4px);
  }
  50% {
    transform: rotate(-2deg) translateY(0.8px);
  }
}
.pixel-character--sad .pc-arm--left,
.pixel-character--sad .pc-arm--right {
  transform: translateY(0.4px);
}
</style>
