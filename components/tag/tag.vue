<template>
  <transition :name="transitionName">
    <div :class="className" :style="style">
      <span>
        <slot></slot>
      </span>
      <div
        v-if="closable"
        :class="`${prefix}__close`"
        :style="{
          color: border ? (borderColor || color) : null
        }"
        @click="handleClose"
      >
        <Icon name="times" :scale="0.8"></Icon>
      </div>
    </div>
  </transition>
</template>

<script>
import Icon from '../icon'
import { useConfigurableProps } from '../../src/config/properties'
import '../../icons/times'

const { prefix } = require('../../src/style/basis/variable')

const props = useConfigurableProps({
  type: {
    default: 'default',
    validator(value) {
      return ['default', 'primary', 'success', 'error', 'warning'].includes(
        value
      )
    }
  },
  border: {
    type: Boolean,
    default: false
  },
  closable: {
    type: Boolean,
    default: false
  },
  color: {
    type: String,
    default: null
  },
  borderColor: {
    type: String,
    default: null
  }
})

export default {
  name: 'Tag',
  components: {
    Icon
  },
  props,
  emits: ['on-close'],
  data() {
    return {
      prefix: `${prefix}-tag`,
      transitionName: `${prefix}-fade`
    }
  },
  computed: {
    className() {
      const { prefix, type, border } = this

      return {
        [prefix]: true,
        [`${prefix}--${type}`]: type !== 'default',
        [`${prefix}--border`]: border
      }
    },
    style() {
      const { border, color, borderColor } = this

      return {
        color: border ? color : null,
        backgroundColor: border ? null : color,
        borderColor: borderColor || color
      }
    }
  },
  methods: {
    handleClose() {
      if (this.closable) {
        this.$emit('on-close')
      }
    }
  }
}
</script>
