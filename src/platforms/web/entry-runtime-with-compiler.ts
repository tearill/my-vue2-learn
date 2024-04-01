// 调用 import Vue 的时候发生的事情
import Vue from './runtime-with-compiler'
import * as vca from 'v3'
import { extend } from 'shared/util'

extend(Vue, vca)

import { effect } from 'v3/reactivity/effect'
Vue.effect = effect

// Runtime + Compiler 构建出来的 Vue.js 入口
export default Vue
