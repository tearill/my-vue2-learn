import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'
import { initSetup } from 'v3/apiSetup'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  isArray,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling,
  isFunction
} from '../util/index'
import type { Component } from 'types/component'
import { shallowReactive, TrackOpTypes } from 'v3'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// 通过 proxy 函数将 _data（或者 _props 等）上面的数据代理到 vm 上
// 这样就可以用 vm.text 代替 vm._data.text 了
export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 初始化 props => methods => data => computed => watch
export function initState(vm: Component) {
  const opts = vm.$options

  // 初始化 props，让 props 变成响应式
  if (opts.props) initProps(vm, opts.props)

  // Composition API
  initSetup(vm)

  // 初始化 method 方法
  if (opts.methods) initMethods(vm, opts.methods)

  // 初始化 data
  if (opts.data) {
    initData(vm)
  } else {

    // 组件没有 data 的时候绑定一个空对象
    const ob = observe((vm._data = {}))
    ob && ob.vmCount++
  }

  // 初始化 computed 计算属性
  if (opts.computed) initComputed(vm, opts.computed)

  // 初始化 watch 监听
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = (vm._props = shallowReactive({}))
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  // 缓存属性的 key，使得将来能直接使用数组的索引值来更新 props 来替代动态地枚举对象
  const keys: string[] = (vm.$options._propKeys = [])
  const isRoot = !vm.$parent
  // root instance props should be converted
  // 根据 $parent 是否存在来判断当前是否是根结点
  if (!isRoot) {

    // 不是根节点的时候，不进行监听
    toggleObserving(false)
  }

  // 遍历 prop，对每一个 prop 进行处理
  for (const key in propsOptions) {

    // props 的 key 值存入 keys（_propKeys）中
    keys.push(key)

    // 验证 prop-数据校验
    // 1. 不存在用默认值替换
    // 2. 类型为 Boolean 则变成 true 或 false
    // 当使用 default 中的默认值的时候会将默认值的副本进行 observe
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (__DEV__) {
      const hyphenatedKey = hyphenate(key)

      // 判断是否是保留字段，如果是则发出 warning
      if (
        isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)
      ) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(
        props,
        key,
        value,
        () => {
          if (!isRoot && !isUpdatingChildComponent) {
            warn(
              `Avoid mutating a prop directly since the value will be ` +
                `overwritten whenever the parent component re-renders. ` +
                `Instead, use a data or computed property based on the prop's ` +
                `value. Prop being mutated: "${key}"`,
              vm
            )
          }
        },
        true /* shallow */
      )
    } else {
      defineReactive(props, key, value, undefined, true /* shallow */)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // 把所有的 prop 代理到 vm._props 上
    // 这样就可以通过 vm.[key] 来直接取值，vm._props.a => vm.a
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

// 初始化 data
function initData(vm: Component) {
  // 拿到所有的 data 数据
  let data: any = vm.$options.data

  // 判断传入的是否是函数，data 默认是一个空对象
  // 如果是函数，调用方法返回一个 data
  // 不是函数，直接使用 data
  data = vm._data = isFunction(data) ? getData(data, vm) : data || {}

  // 如果不是一个对象（严格对象，Array 和 Function 不算）
  // 限制 data 一定是一个对象，使用 Vue 的时候需要保证 data 一定 return 一个对象
  if (!isPlainObject(data)) {
    data = {}
    __DEV__ &&
      warn(
        'data functions should return an object:\n' +
          'https://v2.vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
        vm
      )
  }
  // proxy data on instance
  // 和 props、methods 的操作一样，把对应的值都挂到 vm 这个实例上
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length

  // 拿到 data 的 key 和 props、methods 进行循环对比，防止重名覆盖，因为最后都会挂载到 vm 实例上
  while (i--) {
    const key = keys[i]
    if (__DEV__) {

      // 在 methods 里面
      if (methods && hasOwn(methods, key)) {
        warn(`Method "${key}" has already been defined as a data property.`, vm)
      }
    }

    // 在 props 里面
    if (props && hasOwn(props, key)) {
      __DEV__ &&
        warn(
          `The data property "${key}" is already declared as a prop. ` +
            `Use prop default value instead.`,
          vm
        )
    } else if (!isReserved(key)) {
      // 不是保留 key 的时候，把 data 里面的值全部代理到 vm 上
      // vm._data.a => vm.a
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 这里把 data 变成响应式的
  const ob = observe(data)
  ob && ob.vmCount++
}

export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {

    // 调用方法返回一个 data
    return data.call(vm, vm)
  } catch (e: any) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

// 初始化 computed
function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  // 创建 computedWatchers 集合
  const watchers = (vm._computedWatchers = Object.create(null))
  // computed properties are just getters during SSR
  // 提前判断是否是 SSR，SSR 的时候不需要创建 computedWatcher
  // computed 不在 SSR 的时候执行
  const isSSR = isServerRendering()

  // 遍历所有的 computed
  for (const key in computed) {

    // 获取 computed 属性对应的值
    const userDef = computed[key]

    // 计算属性可以直接是一个 function，也可以设置 get 以及 set 方法
    // 如果是函数，computed 属性对应的值就是一个 getter 函数
    // docs: https://v2.cn.vuejs.org/v2/guide/computed.html#%E8%AE%A1%E7%AE%97%E5%B1%9E%E6%80%A7%E7%9A%84-setter
    const getter = isFunction(userDef) ? userDef : userDef.get
    if (__DEV__ && getter == null) {
      warn(`Getter is missing for computed property "${key}".`, vm)
    }

    // 非 SSR 场景下创建 computedWatcher
    if (!isSSR) {
      // create internal watcher for the computed property.
      // computed 也通过 Watcher 实现，每一个 key(也就是 computed 属性)对应一个 computedWatcher
      // computedWatcher 在 set 的时候会收集渲染 Watcher 作为它的响应式依赖
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,

        // options 配置，这里传入了 lazy: true
        // 标识是惰性计算（带缓存）
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // computed 属性在 vm 上，是全局共享的，只处理 vm 上没有的
    // 组件已经在原型上定义了一些计算属性，只有在实例化组件时才需要再定义一些额外的计算属性
    // 比如一个 User 组件有一个 computed fullName
    // ExtendedUser 继承了 User，如果 ExtendedUser 里面定义了一个 computed fullName，不绕开的话就会覆盖 User 上的 computed fullName
    // 所以每个组件初始化的时候，没有必要重复初始化 fullName 属性
    if (!(key in vm)) {

      // 定义计算属性
      defineComputed(vm, key, userDef)
    } else if (__DEV__) {
      // 如果 computed 里面的属性和 data、props、methods 里面的值重复时进行提示
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(
          `The computed property "${key}" is already defined as a method.`,
          vm
        )
      }
    }
  }
}

// 定义计算属性
export function defineComputed(
  target: any,
  key: string,
  userDef: Record<string, any> | (() => any)
) {

  // 是否应该缓存
  // 在非服务端渲染的情况下会进行缓存
  const shouldCache = !isServerRendering()

  // 下面是在构建每一个 computed 属性的 get 和 set，方便在 defineProperty 拦截到操作的时候调用
  // 如果传递的是函数
  // computed: {
  //   fullName: function() {}
  // }
  if (isFunction(userDef)) {

    // get 赋值为传入的函数
    // 1. 需要缓存，使用 createComputedGetter，创建统一的 getter
    // 2. 不需要缓存，使用 createGetterInvoker，直接调用传入的 function
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)

    // setter 赋值为空函数
    sharedPropertyDefinition.set = noop
  } else {

    // computed 传入的是一个对象
    // computed: {
    //   fullName: {
    //     get: () => {},
    //     set: () => {}
    //   }
    // }
    // 1. get 不存在则直接给空函数
    // 2. 如果存在则查看是否有缓存
    //    - 有缓存，使用 createComputedGetter 创建统一的 getter
    //    - 没有缓存，赋值 get 为传入 get 属性对应的值
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop

    // setter 赋值为传入 set 属性对应的值
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (__DEV__ && sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 我比较蠢，为了方便自己理解，这里再收敛一下
// computed 属性计算的场景分为两种
// 1. 初始化(首次解析模板进行 render)
// 2. 依赖的数据变更触发 computed 更新

// 第一种：初始化
// 初始化执行 initComputed => new Watcher({lazy: true}) => 初始化的时候只是赋值 lazy(表示惰性计算)，并不会执行 computed 计算
// => defineComputed，构建每一个 computed 属性的 get 和 set，方便在 defineProperty 拦截到操作的时候调用

// 开始 render => 读取到 computed 属性，触发 getter => dirty 是 true，调用 evaluate() 求值
// => pushTarget[renderWatcher, computedWatcher]
// => 调用 computed 传入的函数进行求值 => 读取到了依赖的属性，触发依赖属性的 getter => dep.depend() => target.addDep
// 首先：target.addDep => dep.addSub，让 computedWatcher 知道自己依赖谁(这里很重要，相当于把所有依赖属性的 dep 收集起来了)
// 然后：回来 => dep.depend，让依赖属性收集当前 Watcher 为依赖，sub [computedWatcher] => 返回计算之后的值
// => popTarget[renderWatcher]
// => dirty = false，表示已经计算过

// ===(继续回到 getter 剩余的逻辑)===
// => 继续判断是否还有 target，这个时候是 [renderWatcher]
// watcher.depend(computedWatcher)
// => 让 computedWatcher 里面的 deps 都收集 renderWatcher(上面是收集 computedWatcher)
// => 此时所有 computed 依赖的属性都收集了 computedWatcher 和 renderWatcher => sub [computedWatcher, renderWatcher]
// 初始化结束


// 第二种：更新
// 触发依赖属性的 setter => 触发依赖属性的 dep.notify() => 触发所有 sub 的 update
// 也就是依次触发 [computedWatcher, renderWatcher] 的 update
// 1. computedWatcher update
// => 仅仅只是把 dirty 变成 true，标记需要重新计算了(因为它没有自己的值，都是靠别人计算来的)
// 2. renderWatcher update
// => 调用 vm._update(vm._render())，重新根据 render 函数生成的 VNode 去渲染视图
// 而在 render 的过程中，一定会访问到 computed 属性的值，又一次回到了这里的 getter
// => dirty 是 true，所以重新求值


// 创建 computed 属性的 getter 函数
// 更新过程: 数据变更 -> computedWatcher -> 渲染watcher -> 更新视图
// 当 dirty 为 true，调用 watcher.evaluate() =>
// 进入 this.get() 方法 => 在读取模板变量的时候，全局的 Dep.target 是 渲染watcher
// 此时的 Dep.target 是 渲染watcher，targetStack 是 [渲染watcher]
// 然后触发 computed 属性的 getter
function createComputedGetter(key) {

  // 返回一个 getter 函数
  return function computedGetter() {

    // 拿到当前对应的 computedWatcher（观察者）
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {

      // 脏值检查，在 computed 属性发生变更的时候，dirty 会变成 true，以便在 get 的时候重新计算新的值
      // 如果 dirty 是 true，说明计算的值是脏的，需要重新计算和缓存
      // 第一次在模板中读取到数据(render)的时候它一定是 true，所以初始化就会经历一次求值
      // => 调用 evaluate 方法（为什么是 true，因为 new Watcher 的时候传入了 lazy: true）
      if (watcher.dirty) {

        // 这里就是在重新求值
        // 触发 get，然后执行自己的 get(传入的 computed 属性的 function)
        // evaluate => computedWatcher get => pushTarget(computedWatcher)
        // => 执行传入的 computed getFunc，尝试计算值 => 读取到了依赖的属性，触发依赖属性 getter
        // => 触发依赖属性 dep.depend => 把 Dep 加到了 Watcher 的 deps 篮子里(让 Watcher 知道谁依赖了自己)
        // => 触发 Watcher.addDep，把 Watcher 加到依赖属性的依赖篮子(subs)里，让依赖属性订阅 Watcher(让每个属性知道自己依赖谁)
        // (也就是 computed 属性的 Watcher 和它所依赖的响应式值的 dep 相互保留了彼此)
        // => get 结束 popTarget
        // targetStack 是 [渲染watcher]
        watcher.evaluate()
      }

      // 如果有，那就代表还有 渲染watcher
      // 此时的 Dep.target 为 渲染watcher，所以进入了 watcher.depend()
      if (Dep.target) {
        if (__DEV__ && Dep.target.onTrack) {
          Dep.target.onTrack({
            effect: Dep.target,
            target: this,
            type: TrackOpTypes.GET,
            key
          })
        }

        // 依赖收集，也就是让 computed 依赖的属性进行依赖收集，收集渲染 Watcher
        // 先让 computedWatcher 收集 渲染watcher 作为自己的依赖
        // 然后让 watcher 里面的 deps 都收集 渲染watcher

        // 此时的 Dep.target 为 renderWatcher，所以进入了 Watcher.depend()
        // watcher.depend() 方法中会触发所有的依赖属性的 deps.depend()
        // => 把 Dep 加到了 renderWatcher 的 deps 篮子里(让渲染 Watcher 知道谁依赖了自己)
        // => 让依赖属性的 Dep 的依赖篮子(subs)里中持有 renderWatcher(让每个属性知道自己依赖了 renderWatcher)

        // 在经过上面的 evaluate 之后，依赖属性的 dep 的 subs 依赖篮子里已经有 computedWatcher 了
        // 此时每一个依赖属性的 dep 的 subs 依赖篮子为：[computed 属性的 计算watcher, 渲染watcher]

        // 此时依赖属性更新了，将会引起 computed 属性的更新，在依赖属性的 setter 中会触发依赖属性的 dep 的 notify
        // 此时会将依赖属性的 subs 中持有的 Watcher 依次取出来调用它们的 update 方法，也就是
        // 1. 计算watcher 的 update
        // 2. 渲染watcher 的 update

        // 这个时候就触发 computedWatcher 的 update，将 dirty 设为 true，惰性求值，等待下次读取的时候进行更新
        // (这个时候还没求值)
        // 然后再触发 renderWatcher 的 update => 访问到 computed 值 => 触发 computed getter
        // (转了一圈，收集了各个依赖，拿到各个依赖的值，然后又回来这里了，这个时候才是真正的求值)

        // 在 计算watcher 的 update 过程中已经把 dirty 设为 true 了
        // 所以这里会去调用 evaluate(里面又把 dirty 改回 false 了) 根据传入的函数重新求值，页面上也就显示了最新的值
        // 这个时候不会执行 depend 了，因为渲染 watcher 已经出栈了
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this)
  }
}

function initMethods(vm: Component, methods: Object) {

  // 拿到所有的 props
  const props = vm.$options.props

  // 遍历所有的 methods 方法
  for (const key in methods) {
    if (__DEV__) {

      // 如果不是函数
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[
            key
          ]}" in the component definition. ` +
            `Did you reference the function correctly?`,
          vm
        )
      }

      // methods 和 props 中的参数名称重复
      if (props && hasOwn(props, key)) {
        warn(`Method "${key}" has already been defined as a prop.`, vm)
      }

      // 和 Vue 的保留关键字冲突
      if (key in vm && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
            `Avoid defining component methods that start with _ or $.`
        )
      }
    }

    // 如果不是函数，把对应 method 改成一个空函数
    // 如果是一个函数，将 this 上下文通过 bind 方法替换成 vm
    // method 最终也会挂载到 vm 实例上
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch(vm: Component, watch: Object) {

  // 遍历定义的所有的 watch 的值
  for (const key in watch) {

    // 当前 watch 属性传进来的处理函数
    const handler = watch[key]

    // 如果是数组，遍历进行创建 watcher
    if (isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

// 创建 watcher
function createWatcher(
  vm: Component,
  expOrFn: string | (() => any),
  handler: any,
  options?: Object
) {

  // 如果是一个对象，handler 回调赋值为对象中 handler 属性
  /*
      这里是当watch的写法是这样的时候
      watch: {
          test: {
              handler: function () {},
              deep: true
          }
      }
  */
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }

  // 如果是一个字符串，handler 取 vm[handler]，也就是对应的 method
  if (typeof handler === 'string') {
    handler = vm[handler]
  }

  // $watch 是 Vue 原型上的方法，它是在执行 stateMixin 的时候定义的
  return vm.$watch(expOrFn, handler, options)
}

// 相当于初始化了原型上的一堆属性和一堆函数
export function stateMixin(Vue: typeof Component) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  // data 定义
  const dataDef: any = {}
  dataDef.get = function () {
    return this._data
  }

  // props 定义
  const propsDef: any = {}
  propsDef.get = function () {
    return this._props
  }

  // 进行 set 原型上的私有属性
  if (__DEV__) {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
          'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }

  // 定义 $data、$props 属性
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // 挂载 $set、$delete
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 挂载 $watch 方法 => 给 watch 属性使用、keep-alive 使用
  Vue.prototype.$watch = function (
    expOrFn: string | (() => any),
    cb: any,
    options?: Record<string, any>
  ): Function {
    const vm: Component = this

    // 如果传入的回调还是一个对象，调用 createWatcher 尝试把回调变成函数
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}

    // 说明 watcher 是一个 user watcher(自定义的、表示需要执行回调)
    options.user = true

    // 创建 Watcher => targetStack [userWatcher]
    // 执行 get 方法，会读取到监听的属性，触发 getter 函数，把 user watcher 丢进被监听属性的依赖筐子 dep 里 [其他 Watcher, userWatcher]
    // 如果此时触发了依赖属性的变更 => setter => dep.notify => 执行所有 sub 的 update，这个时候的 subs 是 [其他 Watcher, userWatcher]
    // update => 执行回调函数 cb，通知到新旧 value
    const watcher = new Watcher(vm, expOrFn, cb, options)

    // 如果设置了 immediate 属性，直接先执行一次回调
    if (options.immediate) {
      const info = `callback for immediate watcher "${watcher.expression}"`

      // target => use watcher
      pushTarget()

      // 执行回调
      // 只有一个 value，不存在新旧 value 的对比了
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info)

      // 恢复 target
      popTarget()
    }

    // 更新的逻辑
    // 如果此时触发了依赖属性的变更 => dep.notify => 通知更新
    // value = this.getter.call(vm, vm) 调用 getter 进行求值，依赖会被收集到 user watcher 中

    // 返回一个卸载销毁 watcher 的函数 teardown
    return function unwatchFn() {

      // 将自身从所有依赖收集订阅列表删除
      watcher.teardown()
    }
  }
}
