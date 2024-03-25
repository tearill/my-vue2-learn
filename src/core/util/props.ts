import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isArray,
  isObject,
  isFunction,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'
import type { Component } from 'types/component'

type PropOptions = {
  type: Function | Array<Function> | null
  default: any
  required?: boolean
  validator?: Function
}

// 验证 prop
// 1. 不存在用默认值替换
// 2. 类型为 Boolean 则变成 true 或 false
// 当使用 default 中的默认值的时候会将默认值的副本进行 observe
export function validateProp(
  // prop 的 key 值
  key: string,
  // prop 的参数
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {

  // 获取 prop 参数
  const prop = propOptions[key]

  // prop 是否缺失，也就是否传入
  // 存在 absent 为 false，否则为 true
  const absent = !hasOwn(propsData, key)

  // prop 的值
  let value = propsData[key]
  // boolean casting
  // Boolean 类型处理
  const booleanIndex = getTypeIndex(Boolean, prop.type)

  // 如果是 Boolean 类型
  if (booleanIndex > -1) {

    // 没传 prop 并且没有设置 default 值，对应 prop 置为 false
    if (absent && !hasOwn(prop, 'default')) {
      value = false
    } else if (value === '' || value === hyphenate(key)) {
      // value 是空字符串，或者 value 和转 kebab 之后的值相等
      // only cast empty string / same name to boolean if
      // boolean has higher priority

      // 找到 String 类型的位置，然后判断类型的顺序，看谁的优先级更高
      // 因为 type 可以传多个值，比如 type: [Boolean, String]
      const stringIndex = getTypeIndex(String, prop.type)

      // 如果是 Boolean 的优先级更高，将 prop 赋值为 true
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }
  // check default value
  // 如果 prop 值是 undefined
  // 当属性值不存在（没有传递对应的 prop）
  // 对这一类没有传递的 prop，也需要建立 observer 体系，也需要监听改变
  if (value === undefined) {
    // 取默认值，也就是配置的 default 属性
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.

    // 把之前的 shouldObserve 保存下来
    const prevShouldObserve = shouldObserve
    toggleObserving(true)

    // observe prop
    observe(value)

    // 当 observe 结束以后再设置成初始值
    toggleObserving(prevShouldObserve)
  }
  if (__DEV__) {
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 */
// 获取 prop 的默认值
function getPropDefaultValue(
  vm: Component | undefined,
  prop: PropOptions,
  key: string
): any {
  // no default, return undefined
  // 没有配置默认值，返回 undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  // 非生产环境下发出警告，因为当前 prop 无默认值，当前对象的值非初始值
  // Object/Array 类型的默认值必须使用一个函数，由这个函数来返回默认值
  if (__DEV__ && isObject(def)) {
    warn(
      'Invalid default value for prop "' +
        key +
        '": ' +
        'Props with type Object/Array must use a factory function ' +
        'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  // 如果之前渲染的值不是 undefined，则返回上一次的默认值，避免触发不必要的 watcher 行为
  if (
    vm &&
    vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // 如果 default 传入的是一个函数，则调用函数来返回默认值，调用的时候需要改变 this 绑定到当前 vm 上(也就是当前组件)
  // 否则直接返回传入的 default 属性对应的值
  return isFunction(def) && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 */
function assertProp(
  prop: PropOptions,
  name: string,
  value: any,
  vm?: Component,
  absent?: boolean
) {
  if (prop.required && absent) {
    warn('Missing required prop: "' + name + '"', vm)
    return
  }
  if (value == null && !prop.required) {
    return
  }
  let type = prop.type
  let valid = !type || (type as any) === true
  const expectedTypes: string[] = []
  if (type) {
    if (!isArray(type)) {
      type = [type]
    }
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i], vm)
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  const haveExpectedTypes = expectedTypes.some(t => t)
  if (!valid && haveExpectedTypes) {
    warn(getInvalidTypeMessage(name, value, expectedTypes), vm)
    return
  }
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol|BigInt)$/

function assertType(
  value: any,
  type: Function,
  vm?: Component
): {
  valid: boolean
  expectedType: string
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = isArray(value)
  } else {
    try {
      valid = value instanceof type
    } catch (e: any) {
      warn('Invalid prop type: "' + String(type) + '" is not a constructor', vm)
      valid = false
    }
  }
  return {
    valid,
    expectedType
  }
}

const functionTypeCheckRE = /^\s*function (\w+)/

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
function getType(fn) {
  const match = fn && fn.toString().match(functionTypeCheckRE)
  return match ? match[1] : ''
}

function isSameType(a, b) {
  return getType(a) === getType(b)
}

// 获取符合类型的数据的下标
function getTypeIndex(type, expectedTypes): number {

  // 如果不是数组，直接判断数据类型
  if (!isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }

  // 如果是数组，遍历数据判断数组的每一项
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage(name, value, expectedTypes) {
  let message =
    `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    isExplicable(typeof value) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${styleValue(value, expectedType)}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${styleValue(value, receivedType)}.`
  }
  return message
}

function styleValue(value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

const EXPLICABLE_TYPES = ['string', 'number', 'boolean']
function isExplicable(value) {
  return EXPLICABLE_TYPES.some(elem => value.toLowerCase() === elem)
}

function isBoolean(...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
