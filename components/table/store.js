import Vue from 'vue'
import { sortByProps, isNull, deepClone } from '../../src/utils/common'

// 数据 data 的默认 id 字段
export const DEFAULT_KEY_FIELD = 'id'

export const TYPE_ORDER = 'order'
export const TYPE_SELECTION = 'selection'
export const TYPE_EXPAND = 'expand'
export const TYPE_COLUMNS = Object.freeze([
  TYPE_ORDER,
  TYPE_SELECTION,
  TYPE_EXPAND
])

let indexId = 1

function getIndexId() {
  return `__${indexId++}`
}

function defaultIndexLabel(index) {
  return index + 1
}

// 实现一个简易 Vuex 管理状态
// 支持 state getters mutations
export default class Store {
  constructor(options = {}) {
    const {
      columns,
      data,
      rowClass,
      width,
      dataKey,
      highlight,
      renderCount,
      currentPage,
      pageSize
    } = options

    createStoreVM(this)

    setColumns(this.state, columns)
    setDataKey(this.state, dataKey)

    setData(this.state, data)
    setCurrentPage(this.state, currentPage)
    setPageSize(this.state, pageSize)

    setRowClass(this.state, rowClass)
    setHighlight(this.state, highlight)
    setRenderCount(this.state, renderCount)

    if (!isNull(width)) {
      setTableWidth(this.state, width)
    }
  }

  get state() {
    return this._vm._data.state
  }

  set state(value) {
    return false
  }
}

function createStoreVM(store) {
  const computed = {}
  const keys = Object.keys(getters)

  store.getters = {}

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]
    const getter = getters[key]

    computed[key] = function () {
      return getter(store.state, store.getters)
    }

    Object.defineProperty(store.getters, key, {
      get() {
        return store._vm[key]
      },
      enumerable: true
    })
  }

  store._vm = new Vue({
    data: {
      state: {
        columns: [],
        rightFixedColumns: [],
        leftFixedColumns: [],
        data: [],
        dataMap: {},
        idMaps: new WeakMap(),
        dataKey: DEFAULT_KEY_FIELD,
        width: null,
        checkedAll: false,
        partial: false,
        rowClass: null,
        widths: {},
        sorters: {},
        filters: {},
        bodyScroll: 0,
        highlight: false,
        hiddenHeight: 0,
        startRow: 0,
        endRow: 0,
        currentPage: 1,
        pageSize: 0
      }
    },
    computed
  })
}

// 理论上 Getter 是函数的调用, 应该可以重复使用
const getters = {
  filteredData(state) {
    const { filters, data } = state

    return filterData(filters, data)
  },
  processedData(state, getters) {
    const { sorters, columns, currentPage, pageSize } = state
    const { filteredData } = getters

    return pageData(currentPage, pageSize, sortData(sorters, filteredData, columns))
  },
  totalRowHeight(state, getters) {
    const data = getters.processedData

    let i = data.length
    let total = 0

    while (i--) {
      const { height, expandHeight } = data[i]

      total += (height || 0) + (expandHeight || 0)
    }

    return total
  },
  disableCheckRows(state) {
    const { columns, data } = state
    const selection = columns.find(item => item.type === TYPE_SELECTION)
    const disableCheckRows = {}

    if (selection && typeof selection.disableRow === 'function') {
      const isDisabled = selection.disableRow

      for (let i = 0, len = data.length; i < len; i++) {
        const row = data[i]

        if (isDisabled(row.data)) {
          const key = row.key

          disableCheckRows[key] = true
        }
      }
    }

    return disableCheckRows
  },
  disableExpandRows(state) {
    const { columns, data } = state
    const expand = columns.find(item => item.type === TYPE_EXPAND)
    const disableExpandRows = {}

    if (expand && typeof expand.disableRow === 'function') {
      const isDisabled = expand.disableRow

      for (let i = 0, len = data.length; i < len; i++) {
        const row = data[i]

        if (isDisabled(row.data)) {
          const key = row.key

          disableExpandRows[key] = true
        }
      }
    }

    return disableExpandRows
  }
}

// Mutition 是对函数的调用, 因此可以复用, 无需重复定义
const mutations = {
  setColumns,
  setData,
  setCurrentPage,
  setPageSize,
  setRowClass,
  setTableWidth,
  setColumnWidth,
  setRowHeight,
  setRowExpandHeight,
  setBodyScroll,
  setDataKey,
  setHighlight,
  setRenderCount,
  setRowHover(state, key, hover) {
    if (state.dataMap[key]) {
      Vue.set(state.dataMap[key], 'hover', hover)
    }
  },
  handleSort(state, key, type) {
    if (state.sorters[key]) {
      state.sorters[key].type = type
    }
  },
  handleFilter(state, key, active) {
    if (state.filters[key]) {
      state.filters[key].active = active
    }
  },
  toggleFilterItemActive(state, options) {
    const { key, value, active = false, disableOthers = false } = options

    if (state.filters[key]) {
      const filterOptions = state.filters[key].options

      if (disableOthers) {
        for (let i = 0, len = filterOptions.length; i < len; i++) {
          filterOptions[i].active = false
        }
      }

      const item = filterOptions.find(item => item.value === value)

      if (item) {
        item.active = active
      }
    }
  },
  refreshRowIndex(state) {
    const data = state.data

    for (let i = 0, len = data.length; i < len; i++) {
      data[i].index = i
    }
  }
}

// 此处 Action 与 Mutation 相同, 仅仅区分是否依赖了 Getter
const actions = {
  handleCheck({ state, getters }, key, checked) {
    const { dataMap } = state
    const { disableCheckRows } = getters

    if (dataMap[key] && !disableCheckRows[key]) {
      Vue.set(dataMap[key], 'checked', !!checked)
    }

    computePartial(state)
  },
  handleCheckAll({ state, getters }) {
    const { data, checkedAll } = state
    const { disableCheckRows } = getters

    let checked = !checkedAll

    // 阻断 disabled 元素对全选的影响
    if (Object.keys(disableCheckRows).length) {
      let partialCheckedAll = true

      for (let i = 0, len = data.length; i < len; i++) {
        const row = data[i]

        if (!disableCheckRows[row.key] && !row.checked) {
          partialCheckedAll = false

          break
        }
      }

      checked = !partialCheckedAll
    }

    for (let i = 0, len = data.length; i < len; i++) {
      const row = data[i]

      if (!disableCheckRows[row.key]) {
        Vue.set(row, 'checked', checked)
      }
    }

    state.checkedAll = checked
    state.partial = false

    computePartial(state)
  },
  setRenderRows({ state, getters }, start, end) {
    const { startRow, endRow } = state

    if (start === startRow && end === endRow) return

    const { processedData } = getters

    if (processedData[0]) {
      let i = processedData.length

      while (i--) {
        processedData[i].hidden = !(i >= start && i < end)
      }

      state.hiddenHeight = start * processedData[0].height
      state.startRow = start
      state.endRow = end
    }
  },
  handleExpand({ state, getters }, key, expanded) {
    const { dataMap } = state
    const { disableExpandRows } = getters

    if (dataMap[key] && !disableExpandRows[key]) {
      Vue.set(dataMap[key], 'expanded', !!expanded)
    }
  }
}

function setColumns(state, columns) {
  columns = Array.from(columns)

  columns.sort((prev, next) => {
    return (prev.order || 0) - (next.order || 0)
  })

  const { widths, sorters, filters } = state

  const normalColumns = []
  const rightFixedColumns = []
  const leftFixedColumns = []

  for (let i = 0, len = columns.length; i < len; i++) {
    const column = { ...columns[i] }

    let key = column.key

    if (TYPE_COLUMNS.includes(column.type)) {
      key = isNull(column.key) ? getIndexId() : column.key

      switch (column.type) {
        case TYPE_ORDER: {
          column.truthIndex = !!column.truthIndex

          if (typeof column.orderLabel !== 'function') {
            column.orderLabel = defaultIndexLabel
          }

          if (isNull(column.width)) column.width = 60

          break
        }
        case TYPE_SELECTION: {
          column.checkboxSize = column.checkboxSize || 'default'

          if (typeof column.disableRow !== 'function') {
            column.disableRow = () => false
          }

          if (isNull(column.width)) column.width = 40

          break
        }
        case TYPE_EXPAND: {
          if (typeof column.disableRow !== 'function') {
            column.disableRow = () => false
          }

          if (isNull(column.width)) column.width = 40

          break
        }
      }
    }

    if (isNull(key)) {
      key = getIndexId()

      console.error('[Vexip warn] Table column requires key prop, but missing')
    }

    const fixed = column.fixed

    // 独立属性解析时注意隔断同对象引用
    Vue.set(widths, key, column.width || 100)
    Vue.set(sorters, key, parseSorter(column.sorter))
    Vue.set(filters, key, parseFilter(column.filter))

    column.key = key

    if (fixed === true || fixed === 'left') {
      leftFixedColumns.push(column)
    } else if (fixed === 'right') {
      rightFixedColumns.push(column)
    } else {
      normalColumns.push(column)
    }
  }

  state.columns = [].concat(leftFixedColumns, normalColumns, rightFixedColumns)

  if (leftFixedColumns.length) {
    state.leftFixedColumns = leftFixedColumns
  }

  if (rightFixedColumns.length) {
    state.rightFixedColumns = rightFixedColumns
  }
}

function setData(state, data) {
  const clonedData = []
  const dataMap = {}
  const { dataKey, idMaps } = state
  const length = data.length
  const oldDataMap = state.dataMap
  const hidden = !!state.renderCount

  let i = 0

  while (i < length) {
    const item = data[i]

    let key = item[dataKey]

    if (isNull(key)) {
      key = idMaps.get(item)

      if (isNull(key)) {
        key = getIndexId()
      }
    }

    let row

    if (oldDataMap[key]) {
      row = oldDataMap[key]
    } else {
      const { _checked, _height, _expanded } = item

      row = {
        key,
        hidden,
        checked: _checked,
        height: _height,
        expanded: _expanded,
        expandHeight: 0,
        data: item
      }

      idMaps.set(item, key)
    }

    row.index = i
    clonedData.push(row)
    dataMap[key] = row

    ++i
  }

  state.data = clonedData
  state.originData = data
  state.dataMap = dataMap

  computePartial(state)
}

function setCurrentPage(state, currentPage) {
  state.currentPage = currentPage ?? 1
}

function setPageSize(state, pageSize) {
  state.pageSize = pageSize ?? state.data?.length ?? 0
}

function setRowClass(state, rowClass) {
  state.rowClass = rowClass ?? null
}

function setTableWidth(state, width) {
  width = parseFloat(width)

  const { columns, widths } = state

  const hasWidthColumns = []
  const flexColumns = []

  let flexWidth = width

  for (let i = 0, len = columns.length; i < len; i++) {
    const column = columns[i]

    if (column.width) {
      flexWidth -= column.width
      hasWidthColumns.push(column)
    } else {
      flexColumns.push(column)
    }
  }

  const flexColumnCount = flexColumns.length

  let flexUnitWidth = 100

  // 剩余空间有多时, 均分到弹性列
  // if (flexColumnCount && flexWidth > flexColumnCount * flexUnitWidth) {
  if (flexColumnCount) {
    flexUnitWidth = flexWidth / flexColumnCount
  }

  for (let i = 0; i < flexColumnCount; i++) {
    const column = flexColumns[i]
    const key = column.key

    widths[key] = flexUnitWidth
  }

  state.width = width
}

function setColumnWidth(state, key, width) {
  if (state.widths[key]) {
    state.widths[key] = width
  }
}

function setRowHeight(state, key, height) {
  if (state.dataMap[key]) {
    state.dataMap[key].height = height
  }
}

function setRowExpandHeight(state, key, height) {
  if (state.dataMap[key]) {
    state.dataMap[key].expandHeight = height
  }
}

function setBodyScroll(state, scroll) {
  state.bodyScroll = scroll
}

function setDataKey(state, field) {
  const oldDataKey = state.dataKey

  if (!isNull(field) && oldDataKey !== field) {
    state.dataKey = field

    setData(state, state.data)
  }
}

function setHighlight(state, able) {
  state.highlight = !!able
}

function setRenderCount(state, count) {
  state.renderCount = parseInt(count) || null
}

function parseSorter(sorter = {}) {
  const { able = false, type = null, order = 0, method = null } = sorter

  return { able, type, order, method }
}

function parseFilter(filter = {}) {
  const {
    able = false,
    multiple = false,
    active = null,
    method = null
  } = filter
  // 防止内部变化触发 deep watch
  const options = deepClone(filter.options || [])
  const formattedOptions = []

  for (let i = 0, len = options.length; i < len; i++) {
    let item = options[i]

    if (typeof item === 'string') {
      item = { value: item }
    }

    item.label = item.label || item.value

    let active = false

    if (multiple && Array.isArray(active)) {
      active = active.includes(item.value)
    } else if (!isNull(active)) {
      active = item.value === active
    }

    Vue.set(item, 'active', active)

    formattedOptions.push(item)
  }

  return { able, options: formattedOptions, multiple, active, method }
}

function computePartial(state) {
  const data = state.data

  let hasChecked = false
  let hasNotChecked = false
  let partial = false

  for (let i = 0, len = data.length; i < len; i++) {
    const row = data[i]

    if (row.checked) {
      hasChecked = true
    } else {
      hasNotChecked = true
    }

    if (hasChecked && hasNotChecked) {
      partial = true

      break
    }
  }

  if (hasChecked && !partial) {
    state.checkedAll = true
  } else {
    state.checkedAll = false
  }

  Vue.set(state, 'partial', partial)
}

function filterData(filters, data) {
  const keys = Object.keys(filters)
  const usedFilter = []
  const filterData = []

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]
    const filter = filters[key]
    const { able, active, method } = filter

    if (able && active && typeof method === 'function') {
      usedFilter.push(filter)
    }
  }

  const dataCount = data.length
  const usedFilterCount = usedFilter.length

  let i = 0

  while (i < dataCount) {
    const row = data[i]

    let isFilter = true

    for (let j = 0; j < usedFilterCount; j++) {
      const { active, method } = usedFilter[j]

      isFilter = method(active, row.data)

      if (!isFilter) {
        break
      }
    }

    if (isFilter) {
      filterData.push(row)
    }

    ++i
  }

  return filterData
}

function sortData(sorters, data, columns) {
  const keys = Object.keys(sorters)
  const usedSorter = []

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]
    const sorter = sorters[key]
    const column = columns.find(item => item.key === key)
    const accessor = column && column.accessor

    if (sorter.able && sorter.type) {
      usedSorter.push({
        ...sorter,
        key,
        accessor(row) {
          if (typeof accessor === 'function') {
            return accessor(row.data)
          }

          return row.data[key]
        }
      })
    }
  }

  // 多列排序优先级
  usedSorter.sort((prev, next) => prev.order - next.order)

  return sortByProps(data, usedSorter)
}

function pageData(currentPage, pageSize, data) {
  return data.slice((currentPage - 1) * pageSize, currentPage * pageSize)
}

export function mapState(mapList) {
  const map = {}

  for (let i = 0, len = mapList.length; i < len; i++) {
    const key = mapList[i]

    map[key] = function () {
      return this.table.store.state[key]
    }
  }

  return map
}

export function mapGetters(mapList) {
  const map = {}

  for (let i = 0, len = mapList.length; i < len; i++) {
    const key = mapList[i]

    map[key] = function () {
      return this.table.store.getters[key]
    }
  }

  return map
}

export function mapMutations(mapList) {
  const map = {}

  for (let i = 0, len = mapList.length; i < len; i++) {
    const key = mapList[i]

    map[key] = function (...args) {
      const store = this.table.store

      return mutations[key](store.state, ...args)
    }
  }

  return map
}

export function mapActions(mapList) {
  const map = {}

  for (let i = 0, len = mapList.length; i < len; i++) {
    const key = mapList[i]

    map[key] = function (...args) {
      const store = this.table.store

      return actions[key](
        {
          state: store.state,
          getters: store.getters
        },
        ...args
      )
    }
  }

  return map
}
