<template>
  <div>
    <v-progress-linear
      v-if="loading"
      class="mb-4"
      indeterminate
      rounded
    />
    <v-alert
      v-if="errorMessage"
      class="mb-4"
      closable
      type="error"
      variant="tonal"
      @click:close="errorMessage = ''"
    >
      {{ errorMessage }}
    </v-alert>
    <v-alert
      v-if="successMessage"
      class="mb-4"
      closable
      type="success"
      variant="tonal"
      @click:close="successMessage = ''"
    >
      {{ successMessage }}
    </v-alert>

    <v-tabs
      v-model="section"
      class="section-tabs section-tabs--desktop mb-4"
      color="primary"
    >
      <v-tab value="school">
        学校与学科
      </v-tab>
      <v-tab value="organization">
        年级与行政班
      </v-tab>
      <v-tab value="classes">
        行政班授课规则
      </v-tab>
      <v-tab value="groups">
        走班教学班与来源
      </v-tab>
    </v-tabs>
    <v-select
      v-model="section"
      class="section-tabs--mobile mb-4"
      density="comfortable"
      hide-details
      :items="sectionOptions"
      item-title="title"
      item-value="value"
      label="组织配置页面"
      prepend-inner-icon="mdi-shape-outline"
      variant="outlined"
    />

    <v-window
      v-model="section"
      :touch="false"
    >
      <v-window-item value="school">
        <v-row>
          <v-col
            cols="12"
            lg="5"
          >
            <v-card class="rounded-xl">
              <v-card-title class="pa-5 pb-2">
                学校基础信息
              </v-card-title>
              <v-card-text class="px-5 pb-5">
                <v-text-field
                  v-model.trim="schoolForm.name"
                  label="学校名称"
                  variant="outlined"
                />
                <v-text-field
                  :model-value="schoolProfile?.code || ''"
                  hint="学校代码用于本地账号登录，正式部署后保持不变"
                  label="学校代码"
                  persistent-hint
                  readonly
                  variant="outlined"
                />
                <v-select
                  v-model="schoolForm.teacherAuthMode"
                  :items="teacherAuthModeOptions"
                  item-title="title"
                  item-value="value"
                  label="教师登录方式"
                  variant="outlined"
                />
                <v-text-field
                  v-if="schoolForm.teacherAuthMode === 'SHARED_PASSWORD'"
                  v-model="schoolForm.sharedPassword"
                  :hint="schoolProfile?.hasSharedTeacherPassword ? '留空表示继续使用现有通用密码' : '首次启用时必须设置8至64位通用密码'"
                  label="学校通用教师密码"
                  persistent-hint
                  type="password"
                  variant="outlined"
                />
                <v-switch
                  v-model="schoolForm.allowOAuthTeacherLogin"
                  color="primary"
                  label="允许 OAuth 作为备用登录方式"
                />
                <v-alert
                  class="mb-4"
                  type="warning"
                  variant="tonal"
                >
                  切换教师登录方式前，请确认现有教师已经具备对应凭据。学校 OWNER/ADMIN 仍使用自己的管理员 PIN。
                </v-alert>
                <v-btn
                  block
                  color="primary"
                  :disabled="!schoolForm.name"
                  :loading="loading"
                  prepend-icon="mdi-content-save-outline"
                  @click="saveSchoolProfile"
                >
                  保存学校设置
                </v-btn>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            lg="7"
          >
            <v-card class="rounded-xl">
              <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5">
                学科目录
                <v-spacer />
                <v-btn
                  color="primary"
                  prepend-icon="mdi-book-plus-outline"
                  @click="openSubjectDialog()"
                >
                  新建学科
                </v-btn>
              </v-card-title>
              <v-card-text class="px-5 pb-5">
                <v-alert
                  class="mb-4"
                  type="info"
                  variant="tonal"
                >
                  可修改学科名称、代码、分类和显示顺序。正在使用的学科不能删除。
                </v-alert>
                <v-list class="pa-0 rounded-lg">
                  <v-list-item
                    v-for="subject in structure?.subjects || []"
                    :key="subject.id"
                    :subtitle="`${subject.code} · ${subjectCategoryLabel(subject.category)} · 排序 ${subject.sortOrder}`"
                    :title="subject.name"
                  >
                    <template #prepend>
                      <v-avatar
                        color="primary"
                        size="34"
                        variant="tonal"
                      >
                        {{ subject.name.slice(0, 1) }}
                      </v-avatar>
                    </template>
                    <template #append>
                      <v-btn
                        icon="mdi-pencil-outline"
                        size="small"
                        variant="text"
                        @click="openSubjectDialog(subject)"
                      />
                    </template>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <v-window-item value="organization">
        <v-card class="rounded-xl">
          <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5">
            年级与行政班
            <v-spacer />
            <v-btn
              prepend-icon="mdi-playlist-plus"
              variant="tonal"
              @click="openBatchClassDialog"
            >
              批量建班
            </v-btn>
            <v-btn
              color="primary"
              prepend-icon="mdi-school-outline"
              @click="openGradeDialog()"
            >
              新建年级
            </v-btn>
          </v-card-title>
          <v-card-text class="px-5 pb-5">
            <v-alert
              class="mb-4"
              type="info"
              variant="tonal"
            >
              维护当前学期的年级和行政班。
            </v-alert>
            <div class="grade-grid">
              <v-card
                v-for="grade in structure?.grades || []"
                :key="grade.id"
                class="grade-card"
                variant="outlined"
              >
                <v-card-title class="d-flex align-center ga-2 px-4 pt-4">
                  <div class="min-width-0">
                    <div class="text-h6 text-truncate">
                      {{ grade.name }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ grade.code }} · 排序 {{ grade.sortOrder }}
                    </div>
                  </div>
                  <v-spacer />
                  <v-btn
                    icon="mdi-pencil-outline"
                    size="small"
                    variant="text"
                    @click="openGradeDialog(grade)"
                  />
                </v-card-title>
                <v-card-text class="px-4 pb-4">
                  <div class="d-flex align-center mb-3">
                    <span class="text-subtitle-2">行政班</span>
                    <v-spacer />
                    <v-btn
                      prepend-icon="mdi-account-multiple-plus-outline"
                      size="small"
                      variant="tonal"
                      @click="openAdministrativeClassDialog(grade.id)"
                    >
                      新建班级
                    </v-btn>
                  </div>
                  <v-list
                    v-if="administrativeClassesForGrade(grade.id).length"
                    class="pa-0 rounded-lg"
                    density="compact"
                  >
                    <v-list-item
                      v-for="item in administrativeClassesForGrade(grade.id)"
                      :key="item.id"
                      :subtitle="`${item.code} · ${item.isActive ? '启用' : '停用'}`"
                      :title="item.name"
                    >
                      <template #prepend>
                        <v-icon :color="item.isActive ? 'primary' : 'grey'">
                          mdi-account-group-outline
                        </v-icon>
                      </template>
                      <template #append>
                        <v-btn
                          icon="mdi-pencil-outline"
                          size="small"
                          variant="text"
                          @click="openAdministrativeClassDialog(grade.id, item)"
                        />
                      </template>
                    </v-list-item>
                  </v-list>
                  <div
                    v-else
                    class="text-body-2 text-medium-emphasis py-3"
                  >
                    尚未创建行政班
                  </div>
                </v-card-text>
              </v-card>
            </div>
            <v-empty-state
              v-if="!structure?.grades?.length && !loading"
              icon="mdi-school-outline"
              text="当前学期还没有年级，请先新建年级"
            />
          </v-card-text>
        </v-card>
      </v-window-item>

      <v-window-item value="classes">
        <v-row>
          <v-col
            cols="12"
            lg="4"
          >
            <v-card class="rounded-xl">
              <v-card-title class="pa-5 pb-2">
                选择行政班
              </v-card-title>
              <v-card-text class="px-5 pb-5">
                <v-select
                  v-model="selectedClassId"
                  :items="administrativeClassOptions"
                  item-title="title"
                  item-value="value"
                  label="行政班"
                  variant="outlined"
                />
                <v-select
                  v-model="preset"
                  :items="presetOptions"
                  item-title="title"
                  item-value="value"
                  label="快速预设"
                  variant="outlined"
                />
                <v-select
                  v-if="['single-fixed', 'triple-fixed'].includes(preset)"
                  v-model="presetFixedSubjectIds"
                  :items="electiveSubjectOptions"
                  chips
                  closable-chips
                  item-title="title"
                  item-value="value"
                  label="定班选科"
                  multiple
                  variant="outlined"
                />
                <v-btn
                  block
                  :disabled="preset === 'custom'"
                  prepend-icon="mdi-auto-fix"
                  variant="tonal"
                  @click="applyPreset"
                >
                  应用预设
                </v-btn>
                <v-alert
                  class="mt-4"
                  type="info"
                  variant="tonal"
                >
                  预设用于快速填充，应用后仍可逐科调整。
                </v-alert>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col
            cols="12"
            lg="8"
          >
            <v-card class="rounded-xl">
              <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5 pb-2">
                {{ selectedAdministrativeClass?.name || "行政班授课规则" }}
                <v-spacer />
                <v-btn
                  :loading="loading"
                  prepend-icon="mdi-content-save-outline"
                  color="primary"
                  @click="saveSubjectRules(false)"
                >
                  保存规则
                </v-btn>
              </v-card-title>
              <v-card-text class="px-5 pb-5">
                <v-alert
                  v-if="conflictingCourseGroups.length"
                  class="mb-4"
                  type="warning"
                  variant="tonal"
                >
                  <div class="font-weight-bold mb-1">
                    新规则与现有走班来源冲突
                  </div>
                  <div class="mb-3">
                    {{ conflictingCourseGroups.map((item) => item.name).join("、") }} 仍将本班列为来源。
                  </div>
                  <v-btn
                    color="warning"
                    prepend-icon="mdi-link-off"
                    size="small"
                    variant="flat"
                    @click="saveSubjectRules(true)"
                  >
                    解除这些来源关系并保存
                  </v-btn>
                </v-alert>

                <div class="subject-rule-grid">
                  <v-card
                    v-for="subject in structure?.subjects || []"
                    :key="subject.id"
                    class="subject-rule-card"
                    variant="outlined"
                  >
                    <v-card-text class="pa-4">
                      <div class="d-flex align-center ga-2 mb-3">
                        <v-avatar
                          color="primary"
                          size="32"
                          variant="tonal"
                        >
                          {{ subject.name.slice(0, 1) }}
                        </v-avatar>
                        <div>
                          <div class="font-weight-bold">
                            {{ subject.name }}
                          </div>
                          <div class="text-caption text-medium-emphasis">
                            {{ subjectCategoryLabel(subject.category) }}
                          </div>
                        </div>
                      </div>
                      <v-select
                        v-model="ruleModes[subject.id]"
                        :items="deliveryModeOptions"
                        density="compact"
                        hide-details
                        item-title="title"
                        item-value="value"
                        label="授课方式"
                        variant="outlined"
                        @update:model-value="preset = 'custom'"
                      />
                    </v-card-text>
                  </v-card>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <v-window-item value="groups">
        <v-card class="rounded-xl">
          <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5">
            走班教学班
            <v-spacer />
            <v-btn
              color="primary"
              prepend-icon="mdi-account-group-outline"
              @click="openCourseGroupDialog()"
            >
              新建教学班
            </v-btn>
          </v-card-title>
          <v-card-text class="px-5 pb-5">
            <v-alert
              class="mb-4"
              type="info"
              variant="tonal"
            >
              一个行政班可以同时作为多个同科教学班的来源，例如三班学生可以分别进入物理A1和物理A2。
            </v-alert>
            <v-expansion-panels
              multiple
              variant="accordion"
            >
              <v-expansion-panel
                v-for="group in sortedCourseGroups"
                :key="group.id"
              >
                <v-expansion-panel-title>
                  <div class="d-flex align-center flex-wrap ga-2 flex-grow-1">
                    <span class="font-weight-bold">{{ group.name }}</span>
                    <v-chip
                      size="small"
                      variant="tonal"
                    >
                      {{ group.subject?.name }}
                    </v-chip>
                    <v-chip
                      size="small"
                      variant="outlined"
                    >
                      {{ group.code }}
                    </v-chip>
                    <v-chip
                      :color="group.isActive ? 'success' : 'grey'"
                      size="small"
                      variant="tonal"
                    >
                      {{ group.isActive ? "启用" : "停用" }}
                    </v-chip>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="text-subtitle-2 mb-2">
                    来源行政班
                  </div>
                  <div class="d-flex flex-wrap ga-2 mb-4">
                    <v-chip
                      v-for="source in group.sourceClasses"
                      :key="source.administrativeClassId"
                      prepend-icon="mdi-account-multiple-outline"
                      variant="tonal"
                    >
                      {{ source.administrativeClass.name }}
                    </v-chip>
                    <span
                      v-if="!group.sourceClasses.length"
                      class="text-medium-emphasis"
                    >
                      尚未配置
                    </span>
                  </div>
                  <div class="d-flex align-center flex-wrap ga-2">
                    <v-chip
                      size="small"
                      variant="outlined"
                    >
                      {{ group.isStudentSelectable ? "学生可选择" : "仅后台分配" }}
                    </v-chip>
                    <v-chip
                      size="small"
                      variant="outlined"
                    >
                      {{ group._count?.members || 0 }} 位教师
                    </v-chip>
                    <v-chip
                      size="small"
                      variant="outlined"
                    >
                      {{ group._count?.publicationTargets || 0 }} 条历史内容
                    </v-chip>
                    <v-spacer />
                    <v-btn
                      prepend-icon="mdi-pencil-outline"
                      size="small"
                      variant="tonal"
                      @click="openCourseGroupDialog(group)"
                    >
                      编辑
                    </v-btn>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
            <v-empty-state
              v-if="!sortedCourseGroups.length && !loading"
              icon="mdi-account-group-outline"
              text="当前学期没有走班教学班"
            />
          </v-card-text>
        </v-card>
      </v-window-item>
    </v-window>

    <v-dialog
      v-model="courseGroupDialog"
      max-width="680"
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          {{ editingCourseGroupId ? "编辑走班教学班" : "新建走班教学班" }}
        </v-card-title>
        <v-card-text class="px-5">
          <v-row>
            <v-col
              cols="12"
              md="6"
            >
              <v-text-field
                v-model.trim="courseGroupForm.name"
                label="教学班名称"
                placeholder="例如：物理A1"
                variant="outlined"
              />
            </v-col>
            <v-col
              cols="12"
              md="6"
            >
              <v-text-field
                v-model.trim="courseGroupForm.code"
                label="教学班代码"
                placeholder="例如：G2-PHY-A1"
                variant="outlined"
              />
            </v-col>
          </v-row>
          <v-row>
            <v-col
              cols="12"
              md="6"
            >
              <v-select
                v-model="courseGroupForm.gradeId"
                :disabled="Boolean(editingCourseGroupId)"
                :items="gradeOptions"
                item-title="title"
                item-value="value"
                label="年级"
                variant="outlined"
                @update:model-value="courseGroupForm.sourceClassIds = []"
              />
            </v-col>
            <v-col
              cols="12"
              md="6"
            >
              <v-select
                v-model="courseGroupForm.subjectId"
                :items="subjectOptions"
                item-title="title"
                item-value="value"
                label="科目"
                variant="outlined"
                @update:model-value="courseGroupForm.sourceClassIds = []"
              />
            </v-col>
          </v-row>
          <v-select
            v-model="courseGroupForm.sourceClassIds"
            :items="courseGroupSourceOptions"
            chips
            closable-chips
            hint="只显示同年级行政班；所选班级必须已将该科设置为走班"
            item-title="title"
            item-value="value"
            label="来源行政班"
            multiple
            persistent-hint
            variant="outlined"
          />
          <v-switch
            v-model="courseGroupForm.isStudentSelectable"
            color="primary"
            label="允许学生自行选择此教学班"
          />
          <v-switch
            v-if="editingCourseGroupId"
            v-model="courseGroupForm.isActive"
            color="primary"
            label="启用此教学班"
          />
        </v-card-text>
        <v-card-actions class="px-5 pb-5">
          <v-spacer />
          <v-btn @click="courseGroupDialog = false">
            取消
          </v-btn>
          <v-btn
            color="primary"
            :loading="loading"
            @click="saveCourseGroup()"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="gradeDialog"
      max-width="560"
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          {{ editingGradeId ? "编辑年级" : "新建年级" }}
        </v-card-title>
        <v-card-text class="px-5">
          <v-text-field
            v-model.trim="gradeForm.name"
            label="年级名称"
            placeholder="例如：高二"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="gradeForm.code"
            hint="2—64位字母、数字、点、横线或下划线；保存后统一转为大写"
            label="年级代码"
            persistent-hint
            placeholder="例如：G2"
            variant="outlined"
          />
          <v-text-field
            v-model="gradeForm.sortOrder"
            label="显示顺序"
            max="10000"
            min="-10000"
            step="1"
            type="number"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions class="px-5 pb-5">
          <v-spacer />
          <v-btn @click="gradeDialog = false">
            取消
          </v-btn>
          <v-btn
            color="primary"
            :disabled="!gradeForm.name || !gradeForm.code"
            :loading="loading"
            @click="saveGrade"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="administrativeClassDialog"
      max-width="600"
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          {{ editingAdministrativeClassId ? "编辑行政班" : "新建行政班" }}
        </v-card-title>
        <v-card-text class="px-5">
          <v-select
            v-model="administrativeClassForm.gradeId"
            :disabled="Boolean(editingAdministrativeClassId)"
            :items="gradeOptions"
            item-title="title"
            item-value="value"
            label="所属年级"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="administrativeClassForm.name"
            label="班级名称"
            placeholder="例如：高二1班"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="administrativeClassForm.code"
            hint="建议包含年级和班号，例如 G2-C01"
            label="班级代码"
            persistent-hint
            variant="outlined"
          />
          <v-switch
            v-model="administrativeClassForm.isStudentSelectable"
            color="primary"
            label="允许学生自行选择此行政班"
          />
          <v-switch
            v-if="editingAdministrativeClassId"
            v-model="administrativeClassForm.isActive"
            color="primary"
            label="启用此行政班"
          />
        </v-card-text>
        <v-card-actions class="px-5 pb-5">
          <v-spacer />
          <v-btn @click="administrativeClassDialog = false">
            取消
          </v-btn>
          <v-btn
            color="primary"
            :disabled="!administrativeClassForm.gradeId || !administrativeClassForm.name || !administrativeClassForm.code"
            :loading="loading"
            @click="saveAdministrativeClass()"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="subjectDialog"
      max-width="560"
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          {{ editingSubjectId ? "编辑学科" : "新建学科" }}
        </v-card-title>
        <v-card-text class="px-5">
          <v-text-field
            v-model.trim="subjectForm.name"
            label="学科名称"
            placeholder="例如：信息技术"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="subjectForm.code"
            hint="保存后统一转为大写"
            label="学科代码"
            placeholder="例如：IT"
            variant="outlined"
          />
          <v-select
            v-model="subjectForm.category"
            :items="subjectCategoryOptions"
            item-title="title"
            item-value="value"
            label="学科分类"
            variant="outlined"
          />
          <v-text-field
            v-model="subjectForm.sortOrder"
            label="显示顺序"
            max="10000"
            min="-10000"
            step="1"
            type="number"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions class="px-5 pb-5">
          <v-spacer />
          <v-btn @click="subjectDialog = false">
            取消
          </v-btn>
          <v-btn
            color="primary"
            :disabled="!subjectForm.name || !subjectForm.code"
            :loading="loading"
            @click="saveSubject"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="batchClassDialog"
      max-width="720"
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          批量创建行政班
        </v-card-title>
        <v-card-text class="px-5">
          <v-select
            v-model="batchClassForm.gradeId"
            :items="gradeOptions"
            item-title="title"
            item-value="value"
            label="所属年级"
            variant="outlined"
            @update:model-value="applyBatchGradeDefaults"
          />
          <v-row>
            <v-col cols="6">
              <v-text-field
                v-model.number="batchClassForm.startNumber"
                label="起始班号"
                min="1"
                type="number"
                variant="outlined"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model.number="batchClassForm.endNumber"
                label="结束班号"
                max="100"
                min="1"
                type="number"
                variant="outlined"
              />
            </v-col>
          </v-row>
          <v-row>
            <v-col
              cols="12"
              md="6"
            >
              <v-text-field
                v-model.trim="batchClassForm.namePrefix"
                hint="将生成“高二1班”等名称"
                label="名称前缀"
                persistent-hint
                variant="outlined"
              />
            </v-col>
            <v-col
              cols="12"
              md="6"
            >
              <v-text-field
                v-model.trim="batchClassForm.codePrefix"
                hint="将生成 G2-C01 等代码"
                label="代码前缀"
                persistent-hint
                variant="outlined"
              />
            </v-col>
          </v-row>
          <v-switch
            v-model="batchClassForm.isStudentSelectable"
            color="primary"
            label="允许学生自行选择这些行政班"
          />
          <v-alert
            class="mb-3"
            type="info"
            variant="tonal"
          >
            将创建 {{ batchClassPreview.length }} 个班级。请确认班级代码没有重复。
          </v-alert>
          <div class="d-flex flex-wrap ga-2">
            <v-chip
              v-for="item in batchClassPreview"
              :key="item.code"
              size="small"
              variant="tonal"
            >
              {{ item.name }} · {{ item.code }}
            </v-chip>
          </div>
        </v-card-text>
        <v-card-actions class="px-5 pb-5">
          <v-spacer />
          <v-btn @click="batchClassDialog = false">
            取消
          </v-btn>
          <v-btn
            color="primary"
            :disabled="!batchClassPreview.length"
            :loading="loading"
            @click="saveBatchClasses"
          >
            确认创建
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="impactDialog"
      max-width="680"
      persistent
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          确认停用 {{ pendingImpact?.workspace?.name || "教学空间" }}
        </v-card-title>
        <v-card-text class="px-5">
          <v-alert
            class="mb-4"
            type="warning"
            variant="tonal"
          >
            停用后，该教学空间将从学生、教师和大屏的可选范围中移除，历史数据保留。
          </v-alert>
          <v-list
            class="mb-4 rounded-lg"
            density="compact"
          >
            <v-list-item
              v-for="warning in pendingImpact?.warnings || []"
              :key="warning"
              prepend-icon="mdi-alert-outline"
              :title="warning"
            />
          </v-list>
          <div class="impact-grid">
            <v-chip variant="outlined">
              生效内容 {{ pendingImpact?.counts?.activePublications || 0 }}
            </v-chip>
            <v-chip variant="outlined">
              历史内容 {{ pendingImpact?.counts?.publicationHistory || 0 }}
            </v-chip>
            <v-chip variant="outlined">
              教师访问 {{ pendingImpact?.counts?.workspaceMembers || 0 }}
            </v-chip>
            <v-chip variant="outlined">
              任课关系 {{ pendingImpact?.counts?.teachingAssignments || 0 }}
            </v-chip>
            <v-chip variant="outlined">
              大屏 {{ pendingImpact?.counts?.screenBindings || 0 }}
            </v-chip>
            <v-chip variant="outlined">
              学生记录 {{ pendingImpact?.counts?.students || 0 }}
            </v-chip>
          </div>
        </v-card-text>
        <v-card-actions class="px-5 pb-5">
          <v-spacer />
          <v-btn
            :disabled="loading"
            @click="cancelImpactChange"
          >
            取消
          </v-btn>
          <v-btn
            color="warning"
            :loading="loading"
            @click="confirmImpactChange"
          >
            确认停用
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="conflictDialog"
      max-width="860"
      persistent
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          {{ organizationConflict?.title || "处理并发修改" }}
        </v-card-title>
        <v-card-text class="px-5">
          <v-alert
            class="mb-4"
            type="warning"
            variant="tonal"
          >
            内容已被其他管理员更新。请比较两个版本后选择处理方式。
          </v-alert>
          <div class="organization-conflict-table">
            <div class="organization-conflict-table__header">
              <strong>字段</strong>
              <strong>服务器最新版</strong>
              <strong>我的输入</strong>
            </div>
            <div
              v-for="row in organizationConflictRows"
              :key="row.key"
              class="organization-conflict-table__row"
            >
              <strong>{{ row.label }}</strong>
              <div class="organization-conflict-table__server">
                {{ row.currentValue }}
              </div>
              <div class="organization-conflict-table__local">
                {{ row.localValue }}
              </div>
            </div>
          </div>
          <v-alert
            v-if="!organizationConflictRows.length"
            class="mt-4"
            type="info"
            variant="tonal"
          >
            当前可见字段相同，可直接采用最新版本。
          </v-alert>
        </v-card-text>
        <v-card-actions class="px-5 pb-5 flex-wrap ga-2">
          <v-btn
            prepend-icon="mdi-cloud-download-outline"
            variant="tonal"
            @click="acceptOrganizationServerVersion"
          >
            采用服务器最新版
          </v-btn>
          <v-spacer />
          <v-btn
            color="primary"
            prepend-icon="mdi-pencil-outline"
            variant="flat"
            @click="keepOrganizationLocalDraft"
          >
            保留我的输入并继续编辑
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <AdminUndoSnackbar
      :busy="undoBusy"
      :offer="undoOffer"
      :remaining-seconds="remainingSeconds"
      @dismiss="clearUndo"
      @undo="undoLastDeactivation"
    />
  </div>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import AdminUndoSnackbar from "@/components/admin/AdminUndoSnackbar.vue";
import {useTimedUndo} from "@/composables/useTimedUndo";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";
import {buildSubjectRulePreset} from "@/utils/academicStructure";
import {buildConflictComparison} from "@/utils/conflictComparison";

const props = defineProps({
  schoolId: {type: String, required: true},
  termId: {type: String, required: true},
});
const {undoOffer, undoBusy, remainingSeconds, offerUndo, executeUndo, clearUndo} = useTimedUndo();

const section = ref("school");
const sectionOptions = [
  {title: "学校与学科", value: "school"},
  {title: "年级与行政班", value: "organization"},
  {title: "行政班授课规则", value: "classes"},
  {title: "走班教学班与来源", value: "groups"},
];
const structure = ref(null);
const schoolProfile = ref(null);
const schoolForm = ref({name: "", teacherAuthMode: "LOCAL_PIN", allowOAuthTeacherLogin: false, sharedPassword: ""});
const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const selectedClassId = ref("");
const ruleModes = ref({});
const preset = ref("custom");
const presetFixedSubjectIds = ref([]);
const conflictingCourseGroups = ref([]);
const courseGroupDialog = ref(false);
const editingCourseGroupId = ref("");
const courseGroupForm = ref(emptyCourseGroupForm());
const gradeDialog = ref(false);
const editingGradeId = ref("");
const gradeForm = ref(emptyGradeForm());
const administrativeClassDialog = ref(false);
const editingAdministrativeClassId = ref("");
const administrativeClassForm = ref(emptyAdministrativeClassForm());
const subjectDialog = ref(false);
const editingSubjectId = ref("");
const subjectForm = ref(emptySubjectForm());
const batchClassDialog = ref(false);
const batchClassForm = ref(emptyBatchClassForm());
const impactDialog = ref(false);
const pendingImpact = ref(null);
const pendingImpactAction = ref(null);
const conflictDialog = ref(false);
const organizationConflict = ref(null);
const organizationConflictRows = computed(() => organizationConflict.value
  ? buildConflictComparison(
    organizationConflict.value.local,
    organizationConflict.value.current,
    organizationConflict.value.fields,
  )
  : []);

const COMMON_NAME_FIELDS = [
  {key: "name", label: "名称"},
  {key: "code", label: "代码"},
];

const teacherAuthModeOptions = [
  {title: "教师个人账号 + PIN", value: "LOCAL_PIN"},
  {title: "教师账号 + 学校通用密码", value: "SHARED_PASSWORD"},
  {title: "OAuth 邮箱登录", value: "OAUTH_EMAIL"},
];
const subjectCategoryOptions = [
  {title: "基础科目", value: "CORE"},
  {title: "选考科目", value: "ELECTIVE"},
  {title: "其他科目", value: "OTHER"},
];

const deliveryModeOptions = [
  {title: "随行政班", value: "ADMIN_CLASS"},
  {title: "走班教学", value: "COURSE_GROUP"},
  {title: "本班不开设", value: "NOT_OFFERED"},
];
const presetOptions = [
  {title: "仅必修随班，选科全部走班", value: "all-walking"},
  {title: "单科定班", value: "single-fixed"},
  {title: "三科完全定班", value: "triple-fixed"},
  {title: "全部科目随行政班", value: "all-fixed"},
  {title: "完全自定义", value: "custom"},
];

const administrativeClassOptions = computed(() => (structure.value?.administrativeClasses || []).map((item) => ({
  title: `${item.name} · ${item.code}`,
  value: item.id,
})));
const selectedAdministrativeClass = computed(() => (structure.value?.administrativeClasses || [])
  .find((item) => item.id === selectedClassId.value));
const electiveSubjectOptions = computed(() => (structure.value?.subjects || [])
  .filter((subject) => subject.category !== "CORE")
  .map((subject) => ({title: subject.name, value: subject.id})));
const subjectOptions = computed(() => (structure.value?.subjects || []).map((subject) => ({
  title: `${subject.name} · ${subject.code}`,
  value: subject.id,
})));
const gradeOptions = computed(() => (structure.value?.grades || []).map((grade) => ({
  title: `${grade.name} · ${grade.code}`,
  value: grade.id,
})));
const courseGroupSourceOptions = computed(() => (structure.value?.administrativeClasses || [])
  .filter((item) => item.gradeId === courseGroupForm.value.gradeId && item.subjectRules.some(
    (rule) => rule.subjectId === courseGroupForm.value.subjectId && rule.deliveryMode === "COURSE_GROUP",
  ))
  .map((item) => ({title: `${item.name} · ${item.code}`, value: item.id})));
const sortedCourseGroups = computed(() => [...(structure.value?.courseGroups || [])].sort((left, right) =>
  (left.subject?.sortOrder || 0) - (right.subject?.sortOrder || 0) || left.code.localeCompare(right.code)));
const batchClassPreview = computed(() => {
  const start = Number(batchClassForm.value.startNumber);
  const end = Number(batchClassForm.value.endNumber);
  if (!batchClassForm.value.gradeId || !batchClassForm.value.namePrefix || !batchClassForm.value.codePrefix ||
    !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end - start >= 100) return [];
  return Array.from({length: end - start + 1}, (_, index) => {
    const number = start + index;
    return {
      gradeId: batchClassForm.value.gradeId,
      name: `${batchClassForm.value.namePrefix}${number}班`,
      code: `${batchClassForm.value.codePrefix}${String(number).padStart(2, "0")}`,
      isStudentSelectable: batchClassForm.value.isStudentSelectable,
    };
  });
});

function emptyCourseGroupForm() {
  return {
    name: "",
    code: "",
    gradeId: "",
    subjectId: "",
    sourceClassIds: [],
    isStudentSelectable: true,
    isActive: true,
  };
}

function emptyGradeForm() {
  return {name: "", code: "", sortOrder: (structure.value?.grades?.length || 0) * 10};
}

function emptyAdministrativeClassForm() {
  return {name: "", code: "", gradeId: "", isStudentSelectable: true, isActive: true};
}

function emptySubjectForm() {
  return {name: "", code: "", category: "OTHER", sortOrder: (structure.value?.subjects?.length || 0) * 10};
}

function emptyBatchClassForm() {
  return {gradeId: "", startNumber: 1, endNumber: 8, namePrefix: "", codePrefix: "", isStudentSelectable: true};
}

function administrativeClassesForGrade(gradeId) {
  return (structure.value?.administrativeClasses || [])
    .filter((item) => item.gradeId === gradeId)
    .sort((left, right) => left.code.localeCompare(right.code));
}

function subjectCategoryLabel(category) {
  return {CORE: "基础科目", ELECTIVE: "选考科目", OTHER: "其他科目"}[category] || "其他科目";
}

function teacherAuthModeLabel(mode) {
  return teacherAuthModeOptions.find((item) => item.value === mode)?.title || String(mode || "（空）");
}

function subjectName(value) {
  return (structure.value?.subjects || []).find((item) => item.id === value)?.name || String(value || "（空）");
}

function administrativeClassNames(value) {
  const ids = Array.isArray(value) ? value : [value];
  return ids.map((id) => (structure.value?.administrativeClasses || [])
    .find((item) => item.id === id)?.name || id).join("、");
}

function subjectRuleSummary(modes = {}) {
  return (structure.value?.subjects || []).map((subject) => {
    const mode = modes[subject.id] || "NOT_OFFERED";
    const label = deliveryModeOptions.find((item) => item.value === mode)?.title || mode;
    return `${subject.name}：${label}`;
  });
}

function courseGroupSnapshot(group) {
  if (!group) return {};
  return {
    name: group.name,
    code: group.code,
    gradeId: group.gradeId,
    subjectId: group.subjectId,
    sourceClassIds: group.sourceClasses?.map((item) => item.administrativeClassId) || [],
    isStudentSelectable: group.isStudentSelectable,
    isActive: group.isActive,
  };
}

function administrativeClassSnapshot(administrativeClass) {
  if (!administrativeClass) return {};
  return {
    name: administrativeClass.name,
    code: administrativeClass.code,
    gradeId: administrativeClass.gradeId,
    isStudentSelectable: administrativeClass.isStudentSelectable,
    isActive: administrativeClass.isActive,
  };
}

function hydrateRules() {
  const rules = new Map((selectedAdministrativeClass.value?.subjectRules || [])
    .map((rule) => [rule.subjectId, rule.deliveryMode]));
  ruleModes.value = Object.fromEntries((structure.value?.subjects || [])
    .map((subject) => [subject.id, rules.get(subject.id) || "NOT_OFFERED"]));
  preset.value = "custom";
  presetFixedSubjectIds.value = [];
  conflictingCourseGroups.value = [];
}

async function loadStructure() {
  if (!props.schoolId || !props.termId) {
    structure.value = null;
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  try {
    [structure.value, schoolProfile.value] = await Promise.all([
      classworksV2Api.managedAcademicStructure(props.schoolId, props.termId),
      classworksV2Api.managedSchoolProfile(props.schoolId),
    ]);
    schoolForm.value = {
      name: schoolProfile.value.name,
      teacherAuthMode: schoolProfile.value.teacherAuthMode,
      allowOAuthTeacherLogin: schoolProfile.value.allowOAuthTeacherLogin,
      sharedPassword: "",
    };
    if (!structure.value.administrativeClasses.some((item) => item.id === selectedClassId.value)) {
      selectedClassId.value = structure.value.administrativeClasses[0]?.id || "";
    } else {
      hydrateRules();
    }
  } catch (error) {
    structure.value = null;
    errorMessage.value = describeApiError(error, "加载授课结构失败");
  } finally {
    loading.value = false;
  }
}

function cloneDraft(value) {
  return JSON.parse(JSON.stringify(value));
}

async function handleOrganizationConflict(error, descriptor) {
  if (error.response?.data?.code !== "ORGANIZATION_VERSION_CONFLICT") return false;
  const local = cloneDraft(descriptor.local);
  subjectDialog.value = false;
  gradeDialog.value = false;
  administrativeClassDialog.value = false;
  courseGroupDialog.value = false;
  cancelImpactChange();
  await loadStructure();
  organizationConflict.value = {
    ...descriptor,
    local,
    current: descriptor.current(),
  };
  conflictDialog.value = true;
  errorMessage.value = "";
  return true;
}

function acceptOrganizationServerVersion() {
  conflictDialog.value = false;
  organizationConflict.value = null;
  successMessage.value = "已采用服务器最新版，本次本地修改没有写入。";
}

function keepOrganizationLocalDraft() {
  const conflict = organizationConflict.value;
  if (!conflict) return;
  conflict.restore(cloneDraft(conflict.local));
  conflictDialog.value = false;
  organizationConflict.value = null;
  errorMessage.value = "本地输入已恢复。再次保存会以服务器最新版为基础生成新版本。";
}

async function saveSchoolProfile() {
  loading.value = true;
  errorMessage.value = "";
  try {
    schoolProfile.value = await classworksV2Api.updateManagedSchoolProfile(props.schoolId, {
      ...schoolForm.value,
      expectedUpdatedAt: schoolProfile.value?.updatedAt,
    });
    schoolForm.value.sharedPassword = "";
    successMessage.value = "学校基础设置已保存。";
  } catch (error) {
    if (!await handleOrganizationConflict(error, {
      title: "比较学校基础设置",
      local: schoolForm.value,
      current: () => schoolProfile.value,
      fields: [
        {key: "name", label: "学校名称"},
        {key: "teacherAuthMode", label: "教师登录方式", format: teacherAuthModeLabel},
        {key: "allowOAuthTeacherLogin", label: "允许 OAuth 登录"},
      ],
      restore: (draft) => { schoolForm.value = draft; section.value = "school"; },
    })) {
      errorMessage.value = describeApiError(error, "保存学校基础设置失败");
    }
  } finally {
    loading.value = false;
  }
}

function openSubjectDialog(subject = null) {
  editingSubjectId.value = subject?.id || "";
  subjectForm.value = subject ? {
    name: subject.name,
    code: subject.code,
    category: subject.category,
    sortOrder: subject.sortOrder,
  } : emptySubjectForm();
  subjectDialog.value = true;
}

async function saveSubject() {
  loading.value = true;
  errorMessage.value = "";
  try {
    if (editingSubjectId.value) {
      const existing = (structure.value?.subjects || []).find((item) => item.id === editingSubjectId.value);
      await classworksV2Api.updateManagedSubject(props.schoolId, editingSubjectId.value, {
        ...subjectForm.value,
        expectedUpdatedAt: existing?.updatedAt,
      });
    } else {
      await classworksV2Api.createManagedSubject(props.schoolId, subjectForm.value);
    }
    subjectDialog.value = false;
    successMessage.value = editingSubjectId.value ? "学科已更新。" : "学科已创建。";
    await loadStructure();
  } catch (error) {
    const subjectId = editingSubjectId.value;
    if (!await handleOrganizationConflict(error, {
      title: "比较学科设置",
      local: subjectForm.value,
      current: () => (structure.value?.subjects || []).find((item) => item.id === subjectId) || {},
      fields: [...COMMON_NAME_FIELDS, {key: "category", label: "分类", format: subjectCategoryLabel},
        {key: "sortOrder", label: "排序"}],
      restore: (draft) => {
        editingSubjectId.value = subjectId;
        subjectForm.value = draft;
        subjectDialog.value = true;
      },
    })) {
      errorMessage.value = describeApiError(error, "保存学科失败");
    }
  } finally {
    loading.value = false;
  }
}

function applyPreset() {
  try {
    ruleModes.value = buildSubjectRulePreset(
      structure.value?.subjects || [],
      preset.value,
      presetFixedSubjectIds.value,
    );
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function saveSubjectRules(removeConflictingSources) {
  if (!selectedClassId.value) return;
  loading.value = true;
  errorMessage.value = "";
  conflictingCourseGroups.value = [];
  try {
    const subjectRules = (structure.value?.subjects || [])
      .filter((subject) => ruleModes.value[subject.id] !== "NOT_OFFERED")
      .map((subject) => ({
        subjectId: subject.id,
        deliveryMode: ruleModes.value[subject.id],
        isCompulsory: ruleModes.value[subject.id] === "ADMIN_CLASS",
      }));
    await classworksV2Api.replaceAdministrativeClassSubjectRules(
      props.schoolId,
      selectedClassId.value,
      {
        subjectRules,
        removeConflictingSources,
        expectedUpdatedAt: selectedAdministrativeClass.value?.updatedAt,
      },
    );
    successMessage.value = removeConflictingSources
      ? "授课规则已保存，冲突的走班来源关系已解除。"
      : "行政班授课规则已保存。";
    await loadStructure();
  } catch (error) {
    if (error.response?.data?.code === "SUBJECT_RULE_SOURCE_CONFLICT") {
      conflictingCourseGroups.value = error.response.data.details?.courseGroups || [];
      errorMessage.value = "请确认是否解除冲突的走班来源关系。";
    } else if (!await handleOrganizationConflict(error, {
      title: `比较 ${selectedAdministrativeClass.value?.name || "行政班"} 授课规则`,
      local: {rules: subjectRuleSummary(ruleModes.value)},
      current: () => ({rules: subjectRuleSummary(Object.fromEntries(
        (selectedAdministrativeClass.value?.subjectRules || []).map((rule) => [rule.subjectId, rule.deliveryMode]),
      ))}),
      fields: [{key: "rules", label: "授课规则", format: (value) => Array.isArray(value) ? value.join("；") : String(value)}],
      restore: (draft) => {
        ruleModes.value = Object.fromEntries((draft.rules || []).map((entry) => entry.split("：")).map(([name, mode]) => {
          const subject = (structure.value?.subjects || []).find((item) => item.name === name);
          const value = deliveryModeOptions.find((item) => item.title === mode)?.value || "NOT_OFFERED";
          return [subject?.id, value];
        }).filter(([id]) => id));
        section.value = "classes";
      },
    })) {
      errorMessage.value = describeApiError(error, "保存授课规则失败");
    }
  } finally {
    loading.value = false;
  }
}

function openCourseGroupDialog(group = null) {
  const defaultGradeId = structure.value?.grades[0]?.id || "";
  const defaultSubjectId = (structure.value?.subjects || []).find((subject) =>
    (structure.value?.administrativeClasses || []).some((item) =>
      item.gradeId === defaultGradeId && item.subjectRules.some(
        (rule) => rule.subjectId === subject.id && rule.deliveryMode === "COURSE_GROUP",
      )))?.id || structure.value?.subjects[0]?.id || "";
  editingCourseGroupId.value = group?.id || "";
  courseGroupForm.value = group ? {
    name: group.name,
    code: group.code,
    gradeId: group.gradeId,
    subjectId: group.subjectId,
    sourceClassIds: group.sourceClasses.map((item) => item.administrativeClassId),
    isStudentSelectable: group.isStudentSelectable,
    isActive: group.isActive,
  } : {
    ...emptyCourseGroupForm(),
    gradeId: defaultGradeId,
    subjectId: defaultSubjectId,
  };
  courseGroupDialog.value = true;
}

async function loadDeactivationImpact(workspaceId, action) {
  const impact = await classworksV2Api.workspaceChangeImpact(props.schoolId, workspaceId);
  if (!impact.requiresConfirmation) return false;
  pendingImpact.value = impact;
  pendingImpactAction.value = action;
  impactDialog.value = true;
  return true;
}

function cancelImpactChange() {
  impactDialog.value = false;
  pendingImpact.value = null;
  pendingImpactAction.value = null;
}

async function confirmImpactChange() {
  const action = pendingImpactAction.value;
  if (action === "administrative-class") await saveAdministrativeClass(true);
  if (action === "course-group") await saveCourseGroup(true);
}

async function saveCourseGroup(confirmImpact = false) {
  loading.value = true;
  errorMessage.value = "";
  let deactivation = null;
  try {
    const input = {...courseGroupForm.value};
    if (editingCourseGroupId.value) {
      delete input.gradeId;
      const existing = (structure.value?.courseGroups || []).find((item) => item.id === editingCourseGroupId.value);
      if (!confirmImpact && existing?.isActive && input.isActive === false &&
        await loadDeactivationImpact(editingCourseGroupId.value, "course-group")) return;
      if (existing?.isActive && input.isActive === false) {
        deactivation = {type: "course-group", id: existing.id, name: existing.name};
      }
      input.confirmImpact = confirmImpact;
      input.expectedUpdatedAt = existing?.updatedAt;
      await classworksV2Api.updateManagedCourseGroup(props.schoolId, editingCourseGroupId.value, input);
    } else {
      input.termId = props.termId;
      await classworksV2Api.createManagedCourseGroup(props.schoolId, input);
    }
    cancelImpactChange();
    courseGroupDialog.value = false;
    successMessage.value = editingCourseGroupId.value ? "走班教学班已更新。" : "走班教学班已创建。";
    await loadStructure();
    if (deactivation) offerWorkspaceReactivation(deactivation);
  } catch (error) {
    if (error.response?.data?.code === "ORGANIZATION_CHANGE_CONFIRMATION_REQUIRED") {
      pendingImpact.value = error.response.data.details;
      pendingImpactAction.value = "course-group";
      impactDialog.value = true;
    } else if (!await handleOrganizationConflict(error, {
      title: "比较走班教学班设置",
      local: courseGroupForm.value,
      current: () => courseGroupSnapshot((structure.value?.courseGroups || [])
        .find((item) => item.id === editingCourseGroupId.value)),
      fields: [...COMMON_NAME_FIELDS, {key: "subjectId", label: "科目", format: subjectName},
        {key: "sourceClassIds", label: "来源行政班", format: administrativeClassNames},
        {key: "isStudentSelectable", label: "学生可选择"},
        {key: "isActive", label: "启用状态"}],
      restore: (draft) => { courseGroupForm.value = draft; courseGroupDialog.value = true; },
    })) {
      errorMessage.value = describeApiError(error, "保存走班教学班失败");
    }
  } finally {
    loading.value = false;
  }
}

function openGradeDialog(grade = null) {
  editingGradeId.value = grade?.id || "";
  gradeForm.value = grade
    ? {name: grade.name, code: grade.code, sortOrder: grade.sortOrder}
    : emptyGradeForm();
  gradeDialog.value = true;
}

async function saveGrade() {
  loading.value = true;
  errorMessage.value = "";
  try {
    if (editingGradeId.value) {
      const existing = (structure.value?.grades || []).find((item) => item.id === editingGradeId.value);
      await classworksV2Api.updateManagedGrade(props.schoolId, editingGradeId.value, {
        ...gradeForm.value,
        expectedUpdatedAt: existing?.updatedAt,
      });
    } else {
      await classworksV2Api.createManagedGrade(props.schoolId, {...gradeForm.value, termId: props.termId});
    }
    gradeDialog.value = false;
    successMessage.value = editingGradeId.value ? "年级已更新。" : "年级已创建。";
    await loadStructure();
  } catch (error) {
    const gradeId = editingGradeId.value;
    if (!await handleOrganizationConflict(error, {
      title: "比较年级设置",
      local: gradeForm.value,
      current: () => (structure.value?.grades || []).find((item) => item.id === gradeId) || {},
      fields: [...COMMON_NAME_FIELDS, {key: "sortOrder", label: "排序"}],
      restore: (draft) => { gradeForm.value = draft; gradeDialog.value = true; },
    })) {
      errorMessage.value = describeApiError(error, "保存年级失败");
    }
  } finally {
    loading.value = false;
  }
}

function openAdministrativeClassDialog(gradeId, administrativeClass = null) {
  editingAdministrativeClassId.value = administrativeClass?.id || "";
  administrativeClassForm.value = administrativeClass ? {
    name: administrativeClass.name,
    code: administrativeClass.code,
    gradeId: administrativeClass.gradeId,
    isStudentSelectable: administrativeClass.isStudentSelectable,
    isActive: administrativeClass.isActive,
  } : {...emptyAdministrativeClassForm(), gradeId};
  administrativeClassDialog.value = true;
}

async function saveAdministrativeClass(confirmImpact = false) {
  loading.value = true;
  errorMessage.value = "";
  let deactivation = null;
  try {
    if (editingAdministrativeClassId.value) {
      const input = {...administrativeClassForm.value};
      delete input.gradeId;
      const existing = (structure.value?.administrativeClasses || [])
        .find((item) => item.id === editingAdministrativeClassId.value);
      if (!confirmImpact && existing?.isActive && input.isActive === false &&
        await loadDeactivationImpact(editingAdministrativeClassId.value, "administrative-class")) return;
      if (existing?.isActive && input.isActive === false) {
        deactivation = {type: "administrative-class", id: existing.id, name: existing.name};
      }
      input.confirmImpact = confirmImpact;
      input.expectedUpdatedAt = existing?.updatedAt;
      await classworksV2Api.updateManagedAdministrativeClass(
        props.schoolId,
        editingAdministrativeClassId.value,
        input,
      );
    } else {
      await classworksV2Api.createManagedAdministrativeClass(
        props.schoolId,
        {...administrativeClassForm.value, termId: props.termId},
      );
    }
    cancelImpactChange();
    administrativeClassDialog.value = false;
    successMessage.value = editingAdministrativeClassId.value ? "行政班已更新。" : "行政班已创建。请继续配置授课规则。";
    await loadStructure();
    if (deactivation) offerWorkspaceReactivation(deactivation);
  } catch (error) {
    if (error.response?.data?.code === "ORGANIZATION_CHANGE_CONFIRMATION_REQUIRED") {
      pendingImpact.value = error.response.data.details;
      pendingImpactAction.value = "administrative-class";
      impactDialog.value = true;
    } else if (!await handleOrganizationConflict(error, {
      title: "比较行政班设置",
      local: administrativeClassForm.value,
      current: () => administrativeClassSnapshot((structure.value?.administrativeClasses || [])
        .find((item) => item.id === editingAdministrativeClassId.value)),
      fields: [...COMMON_NAME_FIELDS, {key: "isStudentSelectable", label: "学生可选择"},
        {key: "isActive", label: "启用状态"}],
      restore: (draft) => { administrativeClassForm.value = draft; administrativeClassDialog.value = true; },
    })) {
      errorMessage.value = describeApiError(error, "保存行政班失败");
    }
  } finally {
    loading.value = false;
  }
}

function offerWorkspaceReactivation(descriptor) {
  const typeLabel = descriptor.type === "course-group" ? "走班教学班" : "行政班";
  successMessage.value = `${descriptor.name}已停用，可在下方短时撤销。`;
  offerUndo({
    message: `已停用${typeLabel}“${descriptor.name}”`,
    undo: async () => {
      const collection = descriptor.type === "course-group"
        ? structure.value?.courseGroups
        : structure.value?.administrativeClasses;
      const current = (collection || []).find((item) => item.id === descriptor.id);
      const input = {isActive: true, expectedUpdatedAt: current?.updatedAt};
      if (descriptor.type === "course-group") {
        await classworksV2Api.updateManagedCourseGroup(props.schoolId, descriptor.id, input);
      } else {
        await classworksV2Api.updateManagedAdministrativeClass(props.schoolId, descriptor.id, input);
      }
      successMessage.value = `${descriptor.name}已重新启用。`;
      await loadStructure();
    },
  });
}

async function undoLastDeactivation() {
  errorMessage.value = "";
  try {
    await executeUndo();
  } catch (error) {
    clearUndo();
    errorMessage.value = describeApiError(error, "撤销停用失败，组织数据可能已被其他管理员修改");
  }
}

function applyBatchGradeDefaults() {
  const grade = (structure.value?.grades || []).find((item) => item.id === batchClassForm.value.gradeId);
  if (!grade) return;
  batchClassForm.value.namePrefix = grade.name;
  batchClassForm.value.codePrefix = `${grade.code}-C`;
}

function openBatchClassDialog() {
  batchClassForm.value = {
    ...emptyBatchClassForm(),
    gradeId: structure.value?.grades?.[0]?.id || "",
  };
  applyBatchGradeDefaults();
  batchClassDialog.value = true;
}

async function saveBatchClasses() {
  if (!batchClassPreview.value.length) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await classworksV2Api.createManagedAdministrativeClassesBatch(props.schoolId, {
      termId: props.termId,
      classes: batchClassPreview.value,
    });
    batchClassDialog.value = false;
    successMessage.value = `已创建 ${result.count} 个行政班，请继续配置授课规则。`;
    await loadStructure();
  } catch (error) {
    errorMessage.value = describeApiError(error, "批量创建行政班失败");
  } finally {
    loading.value = false;
  }
}

watch(() => [props.schoolId, props.termId], loadStructure, {immediate: true});
watch(selectedClassId, hydrateRules);
watch(section, () => {
  errorMessage.value = "";
  conflictingCourseGroups.value = [];
});
</script>

<style scoped>
.subject-rule-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}
.section-tabs--mobile { display: none; }

.subject-rule-card {
  min-width: 0;
}

.grade-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.grade-card,
.min-width-0 {
  min-width: 0;
}

.impact-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.organization-conflict-table {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
}

.organization-conflict-table__header,
.organization-conflict-table__row {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(110px, 0.6fr) minmax(0, 1fr) minmax(0, 1fr);
  padding: 12px 14px;
}

.organization-conflict-table__header {
  background: rgba(var(--v-theme-warning), 0.1);
}

.organization-conflict-table__row + .organization-conflict-table__row {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.organization-conflict-table__server,
.organization-conflict-table__local {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.organization-conflict-table__server { color: rgb(var(--v-theme-info)); }
.organization-conflict-table__local { color: rgb(var(--v-theme-success)); }

@media (max-width: 600px) {
  .section-tabs--desktop { display: none; }
  .section-tabs--mobile { display: block; }
  .organization-conflict-table__header,
  .organization-conflict-table__row { grid-template-columns: 1fr; }
}
</style>
