<template>
  <div class="about-page">
    <v-card
      class="about-hero rounded-xl"
      color="surface-variant"
      variant="flat"
    >
      <div class="about-hero__content">
        <img
          :src="novarkLogo"
          alt="星火动力标志"
          class="about-hero__logo"
        >
        <div class="about-hero__copy">
          <div class="text-overline text-primary">
            面向真实校园场景的作业板
          </div>
          <h2 class="about-hero__title">
            NPClassworks
          </h2>
          <p class="about-hero__description text-medium-emphasis">
            为学生、教师和班级大屏提供统一的作业与通知体验，并适配行政班、选科定班和走班教学并存的使用方式。
          </p>
          <div class="d-flex flex-wrap ga-2 mt-4">
            <v-chip
              color="primary"
              prepend-icon="mdi-tag-outline"
              variant="tonal"
            >
              v{{ packageInfo.version }} · {{ packageInfo.codename }}（{{ packageInfo.codenameZh }}）
            </v-chip>
            <v-chip
              prepend-icon="mdi-web"
              variant="tonal"
            >
              PWA
            </v-chip>
            <v-chip
              prepend-icon="mdi-license"
              variant="tonal"
            >
              AGPL-3.0
            </v-chip>
          </div>
        </div>
      </div>
      <v-card-actions class="about-hero__actions">
        <v-btn
          color="primary"
          href="https://novark.ink/"
          prepend-icon="mdi-open-in-new"
          rel="noopener noreferrer"
          target="_blank"
          variant="flat"
        >
          星火动力官网
        </v-btn>
        <v-btn
          href="https://github.com/tempChanghong/NPClassworks"
          prepend-icon="mdi-github"
          rel="noopener noreferrer"
          target="_blank"
          variant="tonal"
        >
          前端源代码
        </v-btn>
        <v-btn
          href="https://github.com/tempChanghong/NPClassworksKV"
          prepend-icon="mdi-server-outline"
          rel="noopener noreferrer"
          target="_blank"
          variant="tonal"
        >
          后端源代码
        </v-btn>
      </v-card-actions>
    </v-card>

    <div class="about-feature-grid">
      <v-card
        v-for="feature in features"
        :key="feature.title"
        class="rounded-xl"
        variant="outlined"
      >
        <v-card-text class="pa-5">
          <v-icon
            class="mb-3"
            color="primary"
            :icon="feature.icon"
            size="32"
          />
          <h3 class="text-h6 mb-2">
            {{ feature.title }}
          </h3>
          <p class="text-body-2 text-medium-emphasis mb-0">
            {{ feature.description }}
          </p>
        </v-card-text>
      </v-card>
    </div>

    <v-card
      class="rounded-xl"
      variant="outlined"
    >
      <v-card-text class="pa-5 pa-md-6">
        <div class="about-section-heading">
          <v-icon
            color="deep-orange"
            icon="mdi-creation-outline"
            size="30"
          />
          <div>
            <h3 class="text-h6">
              由星火动力维护
            </h3>
            <div class="text-caption text-medium-emphasis">
              NOVARK POWER · 2026年6月30日成立
            </div>
          </div>
        </div>
        <p class="about-paragraph text-medium-emphasis">
          星火动力由一群愿意把热爱变成作品的人共同建立。团队尊重每位创作者对作品的归属，也重视从想法、制作到长期维护的完整过程，希望让值得实现的创意获得持续成长的空间。
        </p>
        <p class="about-paragraph text-medium-emphasis mb-0">
          NPClassworks 是星火动力在校园工具方向的一次实践：从班级里的实际使用出发，让作业发布、通知传达和大屏值守更清晰、更顺手，也更适合长期运行。
        </p>
      </v-card-text>
    </v-card>

    <v-card
      class="rounded-xl"
      variant="outlined"
    >
      <v-card-text class="pa-5 pa-md-6">
        <div class="about-section-heading mb-4">
          <v-icon
            color="primary"
            icon="mdi-source-fork"
            size="30"
          />
          <div>
            <h3 class="text-h6">
              项目关系与开源许可
            </h3>
            <div class="text-caption text-medium-emphasis">
              尊重上游，也持续面向学校实际需求演进
            </div>
          </div>
        </div>
        <p class="about-paragraph text-medium-emphasis">
          NPClassworks 基于 Moonrend 的 Classworks 项目改造，是独立维护的衍生版本，并非 Classworks 官方版本。感谢原作者及所有上游贡献者为项目奠定基础。
        </p>
        <p class="about-paragraph text-medium-emphasis mb-4">
          本项目依据 GNU AGPL-3.0 许可证开放源代码。部署、修改或分发时，请同时遵守上游项目和本项目的许可证要求。
        </p>
        <v-btn
          href="https://github.com/Moonrend/Classworks"
          prepend-icon="mdi-source-repository"
          rel="noopener noreferrer"
          target="_blank"
          variant="text"
        >
          查看 Classworks 上游项目
        </v-btn>
      </v-card-text>
    </v-card>

    <v-card
      class="rounded-xl"
      variant="outlined"
    >
      <v-card-text class="pa-5 pa-md-6">
        <div class="about-section-heading mb-2">
          <v-icon
            color="primary"
            icon="mdi-heart-outline"
            size="30"
          />
          <div>
            <h3 class="text-h6">
              感谢与参考
            </h3>
            <div class="text-caption text-medium-emphasis">
              感谢这些开源项目为 NPClassworks 提供基础与启发
            </div>
          </div>
        </div>
        <div class="acknowledgement-grid mt-5">
          <v-card
            v-for="project in acknowledgements"
            :key="project.name"
            class="acknowledgement-card rounded-xl"
            :href="project.url"
            rel="noopener noreferrer"
            target="_blank"
            variant="tonal"
          >
            <v-card-text class="d-flex align-start ga-4 pa-5">
              <v-avatar
                color="primary"
                size="42"
                variant="tonal"
              >
                <v-icon :icon="project.icon" />
              </v-avatar>
              <div class="acknowledgement-card__copy">
                <div class="d-flex align-center ga-2 mb-1">
                  <strong>{{ project.name }}</strong>
                  <v-icon
                    class="text-medium-emphasis"
                    icon="mdi-open-in-new"
                    size="15"
                  />
                </div>
                <div class="text-body-2 text-medium-emphasis">
                  {{ project.description }}
                </div>
              </div>
            </v-card-text>
          </v-card>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import packageInfo from "../../../../package.json";
import novarkLogo from "../../../../images/星火动力0702.svg";

const features = [
  {
    icon: "mdi-account-group-outline",
    title: "三种使用方式",
    description: "分别面向学生、教师和班级大屏设计界面，让每种角色只看到当前真正需要的信息与操作。",
  },
  {
    icon: "mdi-school-outline",
    title: "适应实际班级结构",
    description: "统一处理行政班、定科班与走班教学班，减少高二分班后重复切换页面和账号的麻烦。",
  },
  {
    icon: "mdi-history",
    title: "记录每次变化",
    description: "通过教师确认、修订历史、离线队列和同步状态，让大屏录入既方便，也便于核对与恢复。",
  },
];

const acknowledgements = [
  {
    name: "Classworks",
    url: "https://github.com/Moonrend/Classworks",
    icon: "mdi-view-dashboard-outline",
    description: "提供原始前端基础，以及面向班级大屏展示和录入作业的核心产品思路。",
  },
  {
    name: "ClassworksKV",
    url: "https://github.com/Moonrend/ClassworksKV",
    icon: "mdi-database-outline",
    description: "提供上游作业板的后端存储与查询实现，为 NPClassworksKV 的后续演进奠定基础。",
  },
  {
    name: "Immersive Clock",
    url: "https://github.com/Qziky/Immersive-clock",
    icon: "mdi-clock-outline",
    description: "为教室常驻大屏的时间展示、低干扰界面和环境监测体验提供设计参考。",
  },
  {
    name: "2school Immersive Clock",
    url: "https://github.com/tempChanghong/2school-Immersive-Clock",
    icon: "mdi-microphone-outline",
    description: "其噪音监测中的麦克风枚举、设备选择、权限提示与测试流程，为本项目的麦克风选择系统提供了重要参考。",
  },
];
</script>

<style scoped>
.about-page { display: grid; gap: 20px; }
.about-hero { overflow: hidden; position: relative; }
.about-hero::after {
  background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.18), transparent 68%);
  content: "";
  height: 320px;
  pointer-events: none;
  position: absolute;
  right: -100px;
  top: -140px;
  width: 320px;
}
.about-hero__content {
  align-items: center;
  display: flex;
  gap: clamp(20px, 4vw, 44px);
  padding: clamp(24px, 4vw, 44px);
  position: relative;
  z-index: 1;
}
.about-hero__logo {
  flex: 0 0 auto;
  height: clamp(84px, 10vw, 124px);
  width: clamp(76px, 9vw, 112px);
}
.about-hero__copy { max-width: 780px; }
.about-hero__title {
  font-size: clamp(2rem, 4vw, 3.4rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.05;
}
.about-hero__description {
  font-size: clamp(1rem, 1.5vw, 1.15rem);
  line-height: 1.75;
  margin: 18px 0 0;
}
.about-hero__actions {
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 clamp(24px, 4vw, 44px) clamp(24px, 4vw, 36px);
  position: relative;
  z-index: 1;
}
.about-feature-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.about-section-heading {
  align-items: center;
  display: flex;
  gap: 14px;
  margin-bottom: 18px;
}
.about-paragraph { line-height: 1.8; }
.acknowledgement-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.acknowledgement-card {
  height: 100%;
  transition: border-color 160ms ease, transform 160ms ease;
}
.acknowledgement-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.5);
  transform: translateY(-2px);
}
.acknowledgement-card__copy {
  line-height: 1.65;
  min-width: 0;
}
@media (max-width: 900px) {
  .about-feature-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .acknowledgement-grid { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .about-hero__content { align-items: flex-start; flex-direction: column; }
  .about-hero__logo { height: 76px; width: 68px; }
  .about-hero__actions :deep(.v-btn) { flex: 1 1 100%; }
}
</style>
