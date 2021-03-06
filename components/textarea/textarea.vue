<template>
  <div :class="className">
    <textarea
      ref="textarea"
      :class="`${prefix}__control`"
      :value="currentValue"
      :rows="rows"
      :autofocus="autofocus"
      :autocomplete="autocomplete"
      :spellcheck="spellcheck"
      :disabled="disabled"
      :readonly="readonly"
      :placeholder="placeholder"
      @blur="handleBlur"
      @focus="handleFocus"
      @keyup.enter="handleEnter"
      @keyup="handleKeyUp"
      @keypress="handleKeyPress"
      @keydown="handleKeyDown"
      @input="handleThrottleeChange"
      @change="handleChange"
    ></textarea>
    <div v-if="maxLength" :class="`${prefix}__count`">
      {{ `${currentLength}/${maxLength}` }}
    </div>
  </div>
</template>

<script>
import { useConfigurableProps } from '../../src/config/properties'
import { noop, throttle } from '../../src/utils/common'

const { prefix } = require('../../src/style/basis/variable')

const props = useConfigurableProps({
  value: {
    type: String,
    default: null
  },
  placeholder: {
    type: String,
    default: ''
  },
  rows: {
    type: [String, Number],
    default: 2
  },
  noResize: {
    type: Boolean,
    default: false
  },
  autofocus: {
    type: Boolean,
    default: false
  },
  spellcheck: {
    type: Boolean,
    default: false
  },
  autocomplete: {
    type: String,
    default: 'off'
  },
  readonly: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  debounce: {
    type: Boolean,
    default: false
  },
  maxLength: {
    type: Number,
    default: 0
  },
  disableValidate: {
    type: Boolean,
    default: false
  }
})

export default {
  name: 'Textarea',
  model: {
    event: 'on-change'
  },
  inject: {
    validateField: { default: () => noop }
  },
  props,
  emits: [
    'on-focus',
    'on-blur',
    'on-input',
    'on-change',
    'on-enter',
    'on-key-down',
    'on-key-press',
    'on-key-up',
    'update:value'
  ],
  data() {
    return {
      prefix: `${prefix}-textarea`,
      focused: false,
      currentValue: this.value,
      lastValue: this.value,
      currentLength: this.value ? this.value.length : 0
    }
  },
  computed: {
    className() {
      const { prefix, focused, disabled, noResize } = this

      return {
        [prefix]: true,
        [`${prefix}--focused`]: focused,
        [`${prefix}--disabled`]: disabled,
        [`${prefix}--no-resize`]: noResize
      }
    }
  },
  watch: {
    value(value) {
      this.currentValue = value
    }
  },
  created() {
    this.handleThrottleeChange = throttle(this.handleChange)
  },
  methods: {
    focus() {
      this.$refs.textarea.focus()
    },
    blur() {
      this.$refs.textarea.blur()
    },
    handleFocus(event) {
      this.focused = true
      this.$emit('on-focus', event)
    },
    handleBlur(event) {
      this.focused = false
      this.$emit('on-blur', event)
    },
    handleChange(event) {
      const type = event.type
      const value = event.target.value

      if (this.maxLength && value.length > this.maxLength) {
        this.currentValue = value.slice(0, this.maxLength)
      } else {
        this.currentValue = value
      }

      this.currentLength = this.currentValue.length

      event.target.value = this.currentValue

      this.$emit(
        `on-${type === 'input' ? 'input' : 'change'}`,
        this.currentValue
      )

      if (type === 'change') {
        this.lastValue = this.currentValue

        if (!this.disableValidate) {
          this.validateField()
        }
      }
    },
    handleEnter(event) {
      this.$emit('on-enter', event)
    },
    handleKeyDown(event) {
      this.$emit('on-key-down', event)
    },
    handleKeyPress(event) {
      this.$emit('on-key-press', event)
    },
    handleKeyUp(event) {
      this.$emit('on-key-up', event)
    }
  }
}
</script>
