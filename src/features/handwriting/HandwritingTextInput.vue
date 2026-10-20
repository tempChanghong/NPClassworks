<template>
  <TextInputExtension
    :target="target"
    :field="field"
    :label="target.label"
    :load-editor="loadHandwritingEditor"
  />
</template>

<script setup>
import TextInputExtension from '@/components/common/TextInputExtension.vue';
import {loadHandwritingEditor} from './editor-loader.js';
import './handwriting-input.css';

defineProps({
  target: {type: Object, required: true},
  field: {type: String, required: true},
});
</script>
